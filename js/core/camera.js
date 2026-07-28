/* River Racer — chase camera: split-axis spring, look-ahead into the channel, trauma shake,
   and a five-shot cinematic rig. Never writes camera.projectionMatrix, zoom or filmOffset — only
   camera.fov + updateProjectionMatrix(), because reflect.js rebuilds its own projection from fov. */
(function () {
  const C = {};
  const U = () => RR.U;
  let mode = 0;                 // 0 chase, 1 close, 2 hood/hull
  // kLong: stay glued to the transom. kLat: trail wide and show the outside of the turn.
  // A single stiffness is why the old camera sloshed sideways out from behind the boat.
  // edge: how far inside the channel edge the lens has to stay. The hull cam is welded to a hull
  // that is itself allowed to graze the quay, so it gets slack instead of a keep-out.
  // lag: metres of spring lag the leash tolerates at full chat before it starts clamping.
  // The two chase shots come IN and DOWN with speed (spdK) and take the FOV punch (fovK). The hull
  // cam does not: its boom is NEGATIVE — it sits forward of the origin, on the foredeck — so
  // shrinking it puts the lens in the cockpit looking at the driver's legs, and it starts at 72 deg
  // so it would finish at 95. It keeps the old additive extension (backSpd/upSpd) instead, which on
  // a negative boom walks the lens back out of the boat as the speed comes up.
  const MODES = [
    { back: 16.5, up: 6.2, backSpd: 0, upSpd: 0, lookUp: 1.6, fov: 62, fovK: 1.00, spdK: 1.00, kLong: 9.0, kLat: 3.6, kUp: 7.5, roll: 0.16, lead: 1.00, edge: 2.4, lag: 9 },
    { back: 9.5, up: 3.4, backSpd: 0, upSpd: 0, lookUp: 1.3, fov: 64, fovK: 0.80, spdK: 0.85, kLong: 12.0, kLat: 6.0, kUp: 10.0, roll: 0.22, lead: 0.80, edge: 2.0, lag: 6 },
    { back: -0.6, up: 1.55, backSpd: 0.10, upSpd: 0.02, lookUp: 1.1, fov: 72, fovK: 0.45, spdK: 0.00, kLong: 24.0, kLat: 20.0, kUp: 22.0, roll: 0.55, lead: 0.45, edge: -2.5, lag: 0 },
  ];
  const pos = new THREE.Vector3(0, 30, 60);
  const look = new THREE.Vector3();
  const lpt = {};                            // scratch pathAt result — no per-frame alloc
  let trauma = 0;
  let boom = 1, leash = 24, lostT = 0, recov = 0;

  C.cycle = function () { mode = (mode + 1) % MODES.length; };
  C.kick = function (amount) { trauma = Math.min(1, trauma + amount); };
  C.setMode = function (m) { mode = m; };
  C.duck = function () { return C._duck || 0; };          // audio reverb send reads this

  // ---- channel containment ---------------------------------------------------------------
  // The river runs in a trough: quay coping at +1.1, Riverwalk deck out to w+9, then a retaining
  // wall up to street level at +6. Astern of a boat pinned on the outside of a bend is the middle
  // of that Riverwalk, so an unconstrained boom parks the lens inside a wall and you drive blind.
  const PROM = 9.0, STREET_Y = 6.1, COPING_Y = 1.45;
  let camHint = {};                          // per-path pathNearest hints — O(1) tracking
  const cq = { x: 0, z: 0, clear: 0, path: null, d: 0, tx: 0, tz: 0, qx: 0, qz: 0 };
  const cpt = {};                            // scratch pathAt result for the channel fallback pose
  function toWater(px, pz, edge) {
    cq.x = px; cq.z = pz; cq.clear = 1e9; cq.path = null;
    const R = RR.River;
    if (!R || !R.waterQuery) return cq;
    const q = R.waterQuery(px, pz, camHint);  // aliases river.js's shared scratch — read it now
    if (!q) return cq;
    cq.clear = q.clear;
    if (q.q && q.path !== 'lake' && R.paths[q.path]) {
      cq.path = R.paths[q.path]; cq.d = q.q.d; cq.tx = q.q.tx; cq.tz = q.q.tz; cq.qx = q.q.x; cq.qz = q.q.z;
    }
    const need = edge - q.clear;
    if (need > 0) { cq.x = px + q.nx * need; cq.z = pz + q.nz * need; }
    return cq;
  }

  // Does the sightline from lens to hull pass through the quay wall or the retaining wall behind
  // the promenade? Two samples is enough — the failure is always a wall, never a hairline.
  function sightBlocked(bx, by, bz) {
    if (!RR.River || !RR.River.waterQuery) return false;
    for (let i = 0; i < 2; i++) {
      const t = 0.40 + i * 0.32;
      const q = RR.River.waterQuery(pos.x + (bx - pos.x) * t, pos.z + (bz - pos.z) * t, camHint);
      if (!q) continue;
      const sy = pos.y + (by - pos.y) * t;
      if (q.clear < -0.4 && sy < COPING_Y) return true;
      if (q.clear < -PROM + 0.2 && sy < STREET_Y) return true;
    }
    return false;
  }

  C.snapTo = function (boat) {
    const m = MODES[mode];
    const s = Math.sin(boat.heading), c = Math.cos(boat.heading);
    camHint = {};                              // stale hints would search the wrong reach entirely
    const w = toWater(boat.pos.x - s * m.back, boat.pos.z - c * m.back, m.edge);
    pos.set(w.x, boat.pos.y + m.up, w.z);
    const wh = U().waterHeight(pos.x, pos.z, RR.Engine.time(), 1) + 0.9;
    if (pos.y < wh) pos.y = wh;
    C._duck = 0; C._roll = 0; C._fovB = 0;
    boom = 1; lostT = 0; recov = 0; relT = -1;   // a new race reclaims the rig from any release
    leash = Math.hypot(pos.x - boat.pos.x, pos.z - boat.pos.z) + 3;
  };

  // three octaves of value noise reads as an impact; a single sine reads as a wobble
  const nz1 = (x) => { const s = Math.sin(x * 127.1) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
  function shakeNoise(t, seed) {
    return nz1(t * 13 + seed) * 0.6 + nz1(t * 31 + seed * 3) * 0.28 + nz1(t * 71 + seed * 7) * 0.12;
  }

  const BOOM = [1, 0.86, 0.72, 0.58, 0.46, 0.34, 0.24];

  // ---- the hull may never leave the frame: cap the angle off the lens axis at a fraction of the
  // HALF-FOV, so under 1.0 is on screen whatever the aspect. Measured over both courses the hull
  // rides at 0.3-0.5 in the chase and peaks at 0.94 out on the lake chop, so 0.95 is a pure
  // backstop for a look-ahead gone wrong. The release shot asks for a tighter fraction because
  // there the hull is the FOREGROUND, not a thing that merely has to be present.
  // Returns the lens-to-hull distance, which the recovery test downstream also needs.
  function keepHullInFrame(cam, boat, frac) {
    const gx = boat.pos.x - pos.x, gy = (boat.pos.y + 0.6) - pos.y, gz = boat.pos.z - pos.z;
    const gl = Math.hypot(gx, gy, gz);
    if (gl <= 4.5) return gl;                            // meaningless for the hull cam
    const ax = look.x - pos.x, ay = look.y - pos.y, az = look.z - pos.z;
    const al = Math.max(1e-4, Math.hypot(ax, ay, az));
    const ang = Math.acos(U().clamp((gx * ax + gy * ay + gz * az) / (gl * al), -1, 1));
    const maxA = cam.fov * (Math.PI / 360) * frac;
    if (ang <= maxA) return gl;
    const k = 1 - maxA / ang;
    const nx = (ax / al) * (1 - k) + (gx / gl) * k;
    const ny = (ay / al) * (1 - k) + (gy / gl) * k;
    const nz = (az / al) * (1 - k) + (gz / gl) * k;
    const nl = Math.max(1e-4, Math.hypot(nx, ny, nz));
    look.set(pos.x + nx / nl * al, pos.y + ny / nl * al, pos.z + nz / nl * al);
    return gl;
  }

  // ---- the release: the rig lets go of the transom and swings onto the skyline ---------------
  // The world frame's origin IS the Loop (41.888 N, 87.63 W), so "the skyline" is a bearing you
  // can compute from wherever the finish line happens to be rather than a hand-placed lens. The
  // lens falls back to the far side of the boat and looks PAST it at the city, so the last thing
  // on screen is the skyline with your own wake still opening in the foreground.
  let relT = -1, relDur = 0;
  C.release = function (sec) { relT = 0; relDur = Math.max(0.5, sec || 3.5); };
  C.releasing = function () { return relT >= 0; };

  function releaseShot(boat, dt) {
    const cam = RR.Engine.camera;
    const w = RR.Engine.rawDt || dt;                    // keep swinging at a natural rate in slo-mo
    relT += w;
    const p = U().smoothstep(0, relDur, relT);
    let ax = -boat.pos.x, az = -boat.pos.z;
    let al = Math.hypot(ax, az);
    if (al < 250) { ax = -Math.sin(boat.heading); az = -Math.cos(boat.heading); al = 1; }
    ax /= al; az /= al;

    const dist = U().lerp(13, 36, p), hgt = U().lerp(3.2, 11, p);
    const wt = toWater(boat.pos.x - ax * dist, boat.pos.z - az * dist, 1.5);
    pos.x = U().damp(pos.x, wt.x, 2.6, w);
    pos.z = U().damp(pos.z, wt.z, 2.6, w);
    pos.y = U().damp(pos.y, boat.pos.y + hgt, 2.2, w);
    // the hull is the foreground of this shot — a lens that lags a 30 m/s boat loses it, and then
    // the skyline is just a postcard. Same leash principle as the chase rig, one clamp.
    const dx = pos.x - boat.pos.x, dz = pos.z - boat.pos.z, dh = Math.hypot(dx, dz);
    const lim = dist * 1.6;
    if (dh > lim) { const k = lim / dh; pos.x = boat.pos.x + dx * k; pos.z = boat.pos.z + dz * k; }
    const wh = U().waterHeight(pos.x, pos.z, RR.Engine.time(), 1) + 1.0;
    if (pos.y < wh) pos.y = wh;

    const reach = U().lerp(26, 165, p);
    look.set(boat.pos.x + ax * reach, boat.pos.y + U().lerp(1.4, 9, p), boat.pos.z + az * reach);
    keepHullInFrame(cam, boat, 0.68);       // the hull is the foreground of this shot, not a detail
    cam.position.copy(pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(look);
    C._duck = U().damp(C._duck || 0, 0, 3, w);          // out from under the steel; the reverb opens
    C._roll = U().damp(C._roll || 0, 0, 3, w);
    const fovT = U().lerp(58, 47, p);
    if (Math.abs(cam.fov - fovT) > 0.03) { cam.fov += (fovT - cam.fov) * Math.min(1, 2.2 * w); cam.updateProjectionMatrix(); }
    applyShake(cam, w);
  }

  C.follow = function (boat, dt) {
    if (relT >= 0) { releaseShot(boat, dt); return; }
    const cam = RR.Engine.camera;
    const m = MODES[mode];
    const s = Math.sin(boat.heading), c = Math.cos(boat.heading);
    const spd = Math.hypot(boat.vel.x, boat.vel.z);
    const topS = (boat.spec && boat.spec.top) || 40;
    const spdN = U().clamp(spd / topS, 0, 1);
    // IN and DOWN with speed, not out. The boom used to EXTEND at 0.10 m per m/s, which pushed the
    // lens 4 m further back exactly as the FOV punch opened up — the two cancelled and 85 mph
    // looked like 40. Low and close is what makes a bascule coming at you read as a wall.
    const back = (m.back + spd * m.backSpd) * (1 - 0.14 * spdN * m.spdK) * (1 - 0.55 * recov);

    // Never demand the lens sit further inside the channel than the boat itself does — a boat
    // grinding along the quay would otherwise reject every boom length and suck the camera in.
    toWater(boat.pos.x, boat.pos.z, 0);
    const boatClear = cq.clear;
    const edge = U().clamp(Math.min(m.edge, boatClear - 0.4), -3, m.edge);
    const chPath = cq.path, chD = cq.d;
    const chSign = (cq.tx * s + cq.tz * c) >= 0 ? 1 : -1;      // which way along the reach is astern
    // the hull's own lateral offset in the channel, so the fallback pose trails on the same side
    const chLat = chPath ? (boat.pos.x - cq.qx) * -cq.tz + (boat.pos.z - cq.qz) * cq.tx : 0;

    // ---- where the lens wants to be. Start astern of the transom; when THAT lands in the bank —
    // a hull pinned on the outside of a bend, or spun to face the wall — slide the pose onto the
    // channel itself, the same distance back along the reach. The river is the one place in this
    // world that is guaranteed navigable, so a pose built from it cannot end up inside a wall.
    let ox = -s * back, oz = -c * back;
    let bf = 1, clean = back <= 2.5;
    if (!clean) {
      toWater(boat.pos.x + ox, boat.pos.z + oz, 0);
      const astern = cq.clear;
      const wch = U().clamp((edge - astern) / 6, 0, 1);
      if (wch > 0 && chPath) {
        U().pathAt(chPath, chD - chSign * back, cpt);
        const lim = Math.max(0, cpt.w - Math.max(edge, 0.5));
        const lat = U().clamp(chLat, -lim, lim);
        ox = U().lerp(ox, cpt.x - cpt.tz * lat - boat.pos.x, wch);
        oz = U().lerp(oz, cpt.z + cpt.tx * lat - boat.pos.z, wch);
      } else if (astern >= edge) clean = true;               // the plain shot is fine, no search
    }

    // ---- boom collision: with the pose chosen, retract the arm until it clears. Close and low
    // always beats buried in a quay wall.
    if (!clean) {
      let bestC = -1e9;
      for (let i = 0; i < BOOM.length; i++) {
        toWater(boat.pos.x + ox * BOOM[i], boat.pos.z + oz * BOOM[i], 0);
        if (cq.clear >= edge) { bf = BOOM[i]; break; }
        if (cq.clear > bestC) { bestC = cq.clear; bf = BOOM[i]; }   // else the least bad one
      }
    }
    boom = U().damp(boom, bf, bf < boom ? 12 : 2.5, dt);       // retract fast, extend back slowly
    // a short boom has to come down with it or the shot turns into a plan view of your own deck
    const up = (m.up + spd * m.upSpd) * (1 - 0.42 * spdN * m.spdK) * (0.42 + 0.58 * boom) * (1 - 0.42 * recov);

    let tx = boat.pos.x + ox * boom;
    let tz = boat.pos.z + oz * boom;
    let ty = boat.pos.y + up;

    // ---- duck under bridge decks, smoothly, and lower the look point so you see through the span
    let duckTgt = 0, deckY = Infinity;
    if (RR.Bridges && RR.Bridges.duckY) {
      const midX = (tx + boat.pos.x) * 0.5, midZ = (tz + boat.pos.z) * 0.5;
      deckY = Math.min(RR.Bridges.duckY(tx, tz), RR.Bridges.duckY(midX, midZ), RR.Bridges.duckY(boat.pos.x, boat.pos.z));
      if (isFinite(deckY) && boat.pos.y < deckY - 1.5) duckTgt = 1;
    }
    C._duck = U().damp(C._duck || 0, duckTgt, 10, dt);   // 100 ms: dives under WITH you, never snaps
    let lookUpEff = m.lookUp;
    if (C._duck > 0.01 && isFinite(deckY)) {
      ty = U().lerp(ty, Math.min(ty, deckY - 1.45), C._duck);
      lookUpEff = m.lookUp - 0.5 * C._duck;
    }

    // keep the pose the spring is chasing inside the channel too, or it drags the lens at the wall
    const wt = toWater(tx, tz, edge);
    tx = wt.x; tz = wt.z;

    // ---- split-axis spring: project the error into boat-local axes, damp each on its own rate
    const kBoost = 1 + 2.4 * recov;                      // recovery stiffens both axes
    const ex = tx - pos.x, ez = tz - pos.z;
    const eLong = ex * s + ez * c;
    const eLat = ex * c - ez * s;
    const kL = 1 - Math.exp(-m.kLong * kBoost * dt);
    const kT = 1 - Math.exp(-m.kLat * kBoost * dt);
    pos.x += (eLong * kL) * s + (eLat * kT) * c;
    pos.z += (eLong * kL) * c - (eLat * kT) * s;
    pos.y += (ty - pos.y) * (1 - Math.exp(-m.kUp * kBoost * dt));

    // ---- hard constraints. The spring may lag; it may not detach, and it may not end up in a wall.
    const cw = toWater(pos.x, pos.z, edge);
    const pushed = Math.hypot(cw.x - pos.x, cw.z - pos.z);
    const camClear = cw.clear;
    pos.x = cw.x; pos.z = cw.z;

    let leashT = Math.max(2.5, Math.abs(back) * boom) + 3 + m.lag * (0.45 + 0.55 * spdN);
    if (pushed > 6) leashT = Math.min(leashT, 8);        // boat itself out of the channel: hug it
    leash = U().damp(leash, leashT, leashT < leash ? 4.5 : 9, dt);
    const dx = pos.x - boat.pos.x, dz = pos.z - boat.pos.z;
    const dh = Math.hypot(dx, dz);
    if (dh > leash) { const k = leash / dh; pos.x = boat.pos.x + dx * k; pos.z = boat.pos.z + dz * k; }
    // squeezed onto the hull by a clamp: lift rather than shove, since lifting cannot find a wall
    if (mode !== 2 && dh < 4) pos.y = Math.max(pos.y, boat.pos.y + 3.2);

    // never sink the camera under the waves, never let it float off above the boat either
    const wh = U().waterHeight(pos.x, pos.z, RR.Engine.time(), 1) + 0.9;
    if (pos.y < wh) pos.y = wh;
    const yMax = boat.pos.y + Math.max(up, 2) + 9;
    if (pos.y > yMax) pos.y = yMax;

    // ---- look AHEAD, at the route. Aiming at boat + forward*10 means staring at a wall on
    // every bend of a river canyon; this is one pathAt per frame and it is free.
    let lx = boat.pos.x + s * 10, lz = boat.pos.z + c * 10;
    const S = RR.Race && RR.Race.state && RR.Race.state();
    if (S && S.route && boat.routeD != null) {
      const rt = S.route;
      const ahead = boat.routeD + 46 + spd * 1.6;
      const d = rt.loop ? ((ahead % rt.len) + rt.len) % rt.len : Math.min(rt.len - 1, ahead);
      U().pathAt(rt, d, lpt);
      const w = m.lead * (1 - recov) * (0.28 + 0.34 * spdN);
      lx = U().lerp(lx, lpt.x, w);
      lz = U().lerp(lz, lpt.z, w);
    }
    look.set(lx, boat.pos.y + lookUpEff, lz);

    const gl = keepHullInFrame(cam, boat, 0.95);

    cam.position.copy(pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(look);

    // ---- recovery: a lens that is inside the world, or that cannot see the hull through it,
    // eases back to a close, low chase pose. Ease — a hard cut here is worse than the fault.
    // Asymmetric: 0.3 s of hysteresis to arm, ~1.5 s to release, so it cannot strobe.
    // mid-channel with water to spare on both ends there is nothing in between to test against
    const tight = Math.min(boatClear, camClear) < 12;
    const bad = pushed > 6 || (tight && gl > 4.5 && sightBlocked(boat.pos.x, boat.pos.y + 0.7, boat.pos.z));
    lostT = bad ? Math.min(1.4, lostT + dt) : Math.max(0, lostT - dt * 2.2);
    const recT = lostT > 0.3 ? 1 : 0;
    recov = U().damp(recov, recT, recT > recov ? 4.0 : 1.5, dt);

    // ---- bank INTO the corner like a chase helicopter. Cap 0.115 rad = 6.6 deg; past ~8 it
    // reads as nausea, not speed.
    const rollT = U().clamp(-boat.angVel * 0.085 - boat.visRoll * 0.14, -0.115, 0.115);
    C._roll = U().damp(C._roll || 0, rollT, 6.5, dt);
    cam.rotation.z += C._roll * (mode === 2 ? 2.4 : m.roll / 0.16);

    // ---- FOV: 62 idle -> 71 flat out -> 85 flat out on boost. The fast attack / slow release
    // asymmetry IS the punch, and now that the boom comes IN with speed nothing cancels it.
    const fovSpd = spdN * 9 * m.fovK;
    const bTgt = (boat.boostHeat || 0) * 14 * m.fovK;
    C._fovB = U().damp(C._fovB || 0, bTgt, bTgt > (C._fovB || 0) ? 12 : 2.5, dt);
    const fovT = m.fov + fovSpd + C._fovB + (boat.airborne ? 3 : 0);
    if (Math.abs(cam.fov - fovT) > 0.03) { cam.fov += (fovT - cam.fov) * Math.min(1, 9 * dt); cam.updateProjectionMatrix(); }

    applyShake(cam, dt);
  };

  function applyShake(cam, dt) {
    if (trauma <= 0.002) return;
    const sh = trauma * trauma;                     // squared: small hits stay subtle, big hits SLAM
    const tt = performance.now() * 0.001;
    cam.position.x += shakeNoise(tt, 1.0) * sh * 0.55;
    cam.position.y += shakeNoise(tt, 2.7) * sh * 0.42;
    cam.rotation.z += shakeNoise(tt, 4.3) * sh * 0.045;   // roll shake — the one that sells it
    cam.rotation.y += shakeNoise(tt, 6.1) * sh * 0.022;
    trauma = Math.max(0, trauma - 1.9 * dt);
  }

  // ---------- cinematic / replay / photo rig ----------
  const SHOTS = [
    { name: 'ORBIT', mm: 35 },
    { name: 'CHASE LOW', mm: 28 },
    { name: 'TRACKSIDE', mm: 34 },
    { name: 'HELICOPTER', mm: 24 },
    { name: 'BOW', mm: 18 },
  ];
  let shot = 0, shotT = 0, orbitA = 0, heliYaw = 0;
  C.autoCycle = false;                                   // replay flips this on
  C.shotIndex = () => shot;
  C.shotName = () => SHOTS[shot].name;
  C.shotLabel = function () {
    const n = String(shot).padStart(2, '0');
    return 'SHOT ' + n + ' · ' + SHOTS[shot].name + ' · ' + SHOTS[shot].mm + 'mm';
  };
  C.cycleShot = function (dir) {
    shot = (shot + (dir || 1) + SHOTS.length) % SHOTS.length;
    shotT = 0;
    if (RR.HUD && RR.HUD.flash) RR.HUD.flash(C.shotName());
    return shot;
  };

  function setFov(cam, f) {
    if (Math.abs(cam.fov - f) > 0.02) { cam.fov = f; cam.updateProjectionMatrix(); }
  }

  // wallDt is the REAL frame time, so the rig keeps swinging at a natural rate while the world
  // runs in slo-mo.
  C.cinematic = function (boat, dt, wallDt) {
    const cam = RR.Engine.camera;
    const w = wallDt == null ? dt : wallDt;
    shotT += w;
    if (C.autoCycle && shotT > 4.5) C.cycleShot(1);
    const t = RR.Engine.time();
    const s = Math.sin(boat.heading), c = Math.cos(boat.heading);
    cam.up.set(0, 1, 0);

    if (shot === 1) {                                    // CHASE LOW — the water skims the lens
      const tp = toWater(boat.pos.x - s * 7.5, boat.pos.z - c * 7.5, 1.2);
      pos.x = U().damp(pos.x, tp.x, 8, w); pos.y = U().damp(pos.y, boat.pos.y + 0.85, 8, w); pos.z = U().damp(pos.z, tp.z, 8, w);
      const wh = U().waterHeight(pos.x, pos.z, t, 1) + 0.35;
      if (pos.y < wh) pos.y = wh;
      cam.position.copy(pos);
      cam.lookAt(boat.pos.x + s * 6, boat.pos.y + 0.6, boat.pos.z + c * 6);
      setFov(cam, 52);
    } else if (shot === 2) {                             // TRACKSIDE — the TV shot, pre-placed
      const S = RR.Race && RR.Race.state && RR.Race.state();
      const pts = S && S.camPoints;
      let best = null, bestD = 1e9;
      if (pts && pts.length) {
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const dd = U().dist2(p.x, p.z, boat.pos.x, boat.pos.z);
          if (dd < bestD) { bestD = dd; best = p; }
        }
      }
      if (best) cam.position.set(best.x, best.y, best.z);
      else cam.position.set(boat.pos.x - s * 26 + c * 22, 7, boat.pos.z - c * 26 - s * 22);
      cam.lookAt(boat.pos.x, boat.pos.y + 1.2, boat.pos.z);
      setFov(cam, 34);
    } else if (shot === 3) {                             // HELICOPTER — establishing
      heliYaw += w * 0.12;
      const hs = Math.sin(boat.heading + heliYaw), hc = Math.cos(boat.heading + heliYaw);
      cam.position.set(boat.pos.x - hs * 30, boat.pos.y + 42, boat.pos.z - hc * 30);
      cam.lookAt(boat.pos.x, boat.pos.y, boat.pos.z);
      setFov(cam, 44);
    } else if (shot === 4) {                             // BOW — POV off the nose
      const r = boat.radius || 2;
      cam.position.set(boat.pos.x + s * r * 1.2, boat.pos.y + 0.5, boat.pos.z + c * r * 1.2);
      cam.lookAt(boat.pos.x + s * 60, boat.pos.y + 1.2, boat.pos.z + c * 60);
      setFov(cam, 78);
    } else {                                             // ORBIT
      orbitA += w * 0.5;
      const r = 15 + Math.sin(t * 0.2) * 4;
      // the orbit is wider than the Main Stem is: squash it against the banks rather than
      // swinging the lens through a quay wall and shooting a frame of solid concrete
      const o = toWater(boat.pos.x + Math.sin(orbitA) * r, boat.pos.z + Math.cos(orbitA) * r, 1.5);
      const oy = Math.max(boat.pos.y + 5.5, U().waterHeight(o.x, o.z, t, 1) + 1.2);
      cam.position.set(o.x, oy, o.z);
      cam.lookAt(boat.pos.x, boat.pos.y + 1, boat.pos.z);
      setFov(cam, 46);
    }
    applyShake(cam, w);
  };

  // menu background: drift down the Main Stem canyon
  let flyD = 400;
  C.flyover = function (dt, path) {
    const cam = RR.Engine.camera;
    flyD += dt * 26;
    if (flyD > path.len - 260) flyD = 150;
    const a = U().pathAt(path, flyD, C._fa || (C._fa = {}));
    const b = U().pathAt(path, flyD + 190, C._fb || (C._fb = {}));
    const t = RR.Engine.time();
    const y = 16 + Math.sin(t * 0.11) * 7;
    const side = Math.sin(t * 0.07) * a.w * 0.5;
    cam.position.set(a.x - a.tz * side, y, a.z + a.tx * side);
    cam.up.set(0, 1, 0);
    cam.lookAt(b.x, 6 + Math.sin(t * 0.13) * 4, b.z);
    if (cam.fov !== 58) { cam.fov = 58; cam.updateProjectionMatrix(); }
  };

  RR.Camera = C;
})();

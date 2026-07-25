/* River Racer — chase camera: split-axis spring, look-ahead into the channel, trauma shake,
   and a five-shot cinematic rig. Never writes camera.projectionMatrix, zoom or filmOffset — only
   camera.fov + updateProjectionMatrix(), because reflect.js rebuilds its own projection from fov. */
(function () {
  const C = {};
  const U = () => RR.U;
  let mode = 0;                 // 0 chase, 1 close, 2 hood/hull
  // kLong: stay glued to the transom. kLat: trail wide and show the outside of the turn.
  // A single stiffness is why the old camera sloshed sideways out from behind the boat.
  const MODES = [
    { back: 16.5, up: 6.2, lookUp: 1.6, fov: 60, kLong: 9.0, kLat: 3.6, kUp: 7.5, roll: 0.16, lead: 1.00 },
    { back: 9.5, up: 3.4, lookUp: 1.3, fov: 64, kLong: 12.0, kLat: 6.0, kUp: 10.0, roll: 0.22, lead: 0.80 },
    { back: -0.6, up: 1.55, lookUp: 1.1, fov: 72, kLong: 24.0, kLat: 20.0, kUp: 22.0, roll: 0.55, lead: 0.45 },
  ];
  const pos = new THREE.Vector3(0, 30, 60);
  const look = new THREE.Vector3();
  const lpt = {};                            // scratch pathAt result — no per-frame alloc
  let trauma = 0;

  C.cycle = function () { mode = (mode + 1) % MODES.length; };
  C.kick = function (amount) { trauma = Math.min(1, trauma + amount); };
  C.setMode = function (m) { mode = m; };
  C.duck = function () { return C._duck || 0; };          // audio reverb send reads this

  C.snapTo = function (boat) {
    const m = MODES[mode];
    const s = Math.sin(boat.heading), c = Math.cos(boat.heading);
    pos.set(boat.pos.x - s * m.back, boat.pos.y + m.up, boat.pos.z - c * m.back);
    C._duck = 0; C._roll = 0; C._fovB = 0;
  };

  // three octaves of value noise reads as an impact; a single sine reads as a wobble
  const nz1 = (x) => { const s = Math.sin(x * 127.1) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
  function shakeNoise(t, seed) {
    return nz1(t * 13 + seed) * 0.6 + nz1(t * 31 + seed * 3) * 0.28 + nz1(t * 71 + seed * 7) * 0.12;
  }

  C.follow = function (boat, dt) {
    const cam = RR.Engine.camera;
    const m = MODES[mode];
    const s = Math.sin(boat.heading), c = Math.cos(boat.heading);
    const spd = Math.hypot(boat.vel.x, boat.vel.z);
    const back = m.back + spd * 0.10;                    // pull back with speed
    const up = m.up + spd * 0.02;

    const tx = boat.pos.x - s * back;
    const tz = boat.pos.z - c * back;
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

    // ---- split-axis spring: project the error into boat-local axes, damp each on its own rate
    const ex = tx - pos.x, ez = tz - pos.z;
    const eLong = ex * s + ez * c;
    const eLat = ex * c - ez * s;
    const kL = 1 - Math.exp(-m.kLong * dt);
    const kT = 1 - Math.exp(-m.kLat * dt);
    pos.x += (eLong * kL) * s + (eLat * kT) * c;
    pos.z += (eLong * kL) * c - (eLat * kT) * s;
    pos.y += (ty - pos.y) * (1 - Math.exp(-m.kUp * dt));

    // never sink the camera under the waves
    const wh = U().waterHeight(pos.x, pos.z, RR.Engine.time(), 1) + 0.9;
    if (pos.y < wh) pos.y = wh;

    // ---- look AHEAD, at the route. Aiming at boat + forward*10 means staring at a wall on
    // every bend of a river canyon; this is one pathAt per frame and it is free.
    const spdN = U().clamp(spd / 40, 0, 1);
    let lx = boat.pos.x + s * 10, lz = boat.pos.z + c * 10;
    const S = RR.Race && RR.Race.state && RR.Race.state();
    if (S && S.route && boat.routeD != null) {
      const rt = S.route;
      const ahead = boat.routeD + 46 + spd * 1.6;
      const d = rt.loop ? ((ahead % rt.len) + rt.len) % rt.len : Math.min(rt.len - 1, ahead);
      U().pathAt(rt, d, lpt);
      const w = m.lead * (0.28 + 0.34 * spdN);
      lx = U().lerp(lx, lpt.x, w);
      lz = U().lerp(lz, lpt.z, w);
    }
    look.set(lx, boat.pos.y + lookUpEff, lz);

    cam.position.copy(pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(look);

    // ---- bank INTO the corner like a chase helicopter. Cap 0.115 rad = 6.6 deg; past ~8 it
    // reads as nausea, not speed.
    const rollT = U().clamp(-boat.angVel * 0.085 - boat.visRoll * 0.14, -0.115, 0.115);
    C._roll = U().damp(C._roll || 0, rollT, 6.5, dt);
    cam.rotation.z += C._roll * (mode === 2 ? 2.4 : m.roll / 0.16);

    // ---- FOV: 60 idle -> 67 flat out -> 76 flat out on boost. The fast attack / slow release
    // asymmetry IS the punch.
    const topS = (boat.spec && boat.spec.top) || 40;
    const fovSpd = U().clamp(spd / topS, 0, 1) * 7;
    const bTgt = (boat.boostHeat || 0) * 9;
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
      const tp = { x: boat.pos.x - s * 7.5, y: boat.pos.y + 0.85, z: boat.pos.z - c * 7.5 };
      pos.x = U().damp(pos.x, tp.x, 8, w); pos.y = U().damp(pos.y, tp.y, 8, w); pos.z = U().damp(pos.z, tp.z, 8, w);
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
      cam.position.set(boat.pos.x + Math.sin(orbitA) * r, boat.pos.y + 5.5, boat.pos.z + Math.cos(orbitA) * r);
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

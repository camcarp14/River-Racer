/* River Racer — courses, checkpoints, standings, race state machine */
(function () {
  const RACE = {};
  const U = () => RR.U;

  // course definitions reference named channel paths; routes are stitched at load
  RACE.COURSES = [
    {
      id: 'mainstem', name: 'MAIN STEM SPRINT', laps: 1,
      desc: 'Wolf Point to Navy Pier. Ten bridges, one lock, full throttle through the glass canyon.',
      segments: [{ path: 'main' }, { path: 'lakeGuide', toFrac: 0.62 }],
    },
    {
      id: 'riverrun', name: 'FULL RIVER RUN', laps: 1,
      desc: 'From the North Branch narrows at Goose Island all the way out past the lighthouse. The grand tour.',
      segments: [{ path: 'north' }, { path: 'main' }, { path: 'lakeGuide' }],
    },
    {
      id: 'southbranch', name: 'SOUTH BRANCH CHARGE', laps: 1,
      desc: 'Launch under the shadow of Willis Tower, thread the Loop bridges, sprint the Main Stem to the lock.',
      segments: [{ path: 'south' }, { path: 'main' }],
    },
    {
      id: 'lakecircuit', name: 'LAKE MICHIGAN CIRCUIT', laps: 2,
      desc: 'Two laps of open-water chop around the harbor lighthouse, skimming Navy Pier. Big waves, big air.',
      segments: [{ path: 'lakeLoop' }], loop: true,
    },
  ];

  // stitch dense path slices into one route
  function buildRoute(course) {
    const xs = [], zs = [], ws = [];
    for (const seg of course.segments) {
      const p = RR.River.paths[seg.path];
      if (!p) { console.error('missing path', seg.path); continue; }
      const i0 = Math.floor((seg.fromFrac || 0) * (p.n - 1));
      const i1 = Math.ceil((seg.toFrac == null ? 1 : seg.toFrac) * (p.n - 1));
      for (let i = i0; i <= i1; i++) {
        const n = xs.length;
        if (n && U().dist2(xs[n - 1], zs[n - 1], p.x[i], p.z[i]) < 25) continue;  // dedupe stitch joints
        xs.push(p.x[i]); zs.push(p.z[i]); ws.push(p.w[i]);
      }
    }
    const n = xs.length;
    const route = { x: new Float32Array(xs), z: new Float32Array(zs), w: new Float32Array(ws), cum: new Float32Array(n), n, loop: !!course.loop };
    let len = 0;
    for (let i = 1; i < n; i++) { len += Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]); route.cum[i] = len; }
    route.len = len;
    return route;
  }

  // ---------- gate + buoy visuals ----------
  let gateGroup;
  function buoyMesh(color) {
    const c = new THREE.Color(color).convertSRGBToLinear();
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 1.5, 8),
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
    body.position.y = 0.75; g.add(body);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 6),
      new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.6 }));
    top.position.y = 1.9; g.add(top);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: c, emissiveIntensity: 1.6 }));
    beacon.position.y = 2.5; g.add(beacon);
    return g;
  }

  // scrolling gold chevrons painted on the water + tall lit pylons, ONLY on the open-lake legs,
  // so the course is unmistakable once it leaves the framed river canyon
  function chevronTex() {
    return RR.U.canvasTexture(64, 128, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.strokeStyle = '#ffd24a'; c.lineWidth = 14; c.lineCap = 'round';
      // apex toward -canvas-y = +v = toward the FINISH (CanvasTexture flips Y)
      for (let k = 0; k < 4; k++) {
        const y = k * (h / 2);
        c.beginPath(); c.moveTo(6, y); c.lineTo(w / 2, y - h * 0.28); c.lineTo(w - 6, y); c.stroke();
      }
    });
  }
  function buildLakeMarkers(state) {
    const route = state.route, pt = {};
    const step = 12, halfW = 9;
    const verts = [], uvs = []; let vlen = 0, prev = null;
    for (let d = 0; d <= route.len; d += step) {
      U().pathAt(route, route.loop ? d % route.len : d, pt);
      if (!RR.River.inLake(pt.x, pt.z)) { prev = null; continue; }   // never lay the ribbon over the river channel
      const w = Math.min(halfW, pt.w - 4);
      const lx = pt.x - pt.tz * w, lz = pt.z + pt.tx * w;
      const rx = pt.x + pt.tz * w, rz = pt.z - pt.tx * w;
      if (prev) {
        vlen += Math.hypot(pt.x - prev.x, pt.z - prev.z);
        verts.push(prev.lx, 0.35, prev.lz, prev.rx, 0.35, prev.rz, lx, 0.35, lz,
                   prev.rx, 0.35, prev.rz, rx, 0.35, rz, lx, 0.35, lz);
        const v0 = prev.v, v1 = vlen / 24;
        uvs.push(0, v0, 1, v0, 0, v1, 1, v0, 1, v1, 0, v1);
      }
      prev = { lx, lz, rx, rz, x: pt.x, z: pt.z, v: vlen / 24 };
    }
    if (verts.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      const tex = chevronTex(); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      const ribbon = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      ribbon.renderOrder = 2; ribbon.layers.set(1);
      gateGroup.add(ribbon);
      state.lakeRibbon = { tex };
    }
    for (const cp of state.checkpoints) {
      if (!RR.River.inLake(cp.x, cp.z)) continue;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 22, 8),
        new THREE.MeshStandardMaterial({ color: 0x1b2733, emissive: 0xffc857, emissiveIntensity: 0.6, roughness: 0.5 }));
      mast.position.set(cp.x, 11, cp.z);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd24a }));
      glow.position.set(cp.x, 22, cp.z);
      gateGroup.add(mast, glow);
      cp.pylonGlow = glow;
    }
  }

  // ---------- boost gates ----------
  // Six per course, deliberately OFF the racing line: taking one costs you a metre and pays 0.30
  // boost. The six named spots are real places on the river; any that this course does not pass
  // are replaced by evenly-spaced route samples, so every course always has six.
  // side +1 puts the gate to the NORTH of the centreline (+z is south in this world), because the
  // offset vector is (tz, -tx) and the Main Stem tangent points east.
  const NAMED_GATES = [
    { name: 'DUSABLE NORTH ARCH', x: 464.1, z: -100, side: 1 },    // hard against the north pier
    { name: 'MARINA CITY SLIPS', x: 140, z: -22, side: 1 },        // the actual marina under the cobs
    { name: 'HARBOR LOCK', x: 1892, z: -68.9, side: 1 },           // hugging the north chamber wall
    { name: 'WOLF POINT', x: -640, z: 110, side: -1 },             // inside the bend where three branches meet
    { name: 'LAKE SHORE DR', x: 1359.1, z: -88.9, side: 1 },       // the lake-side span
    { name: 'NAVY PIER HEADLAND', x: 2520, z: -300, side: -1 },    // the wide outside line, biggest chop
  ];

  function placeGate(route, x, z, side, out) {
    const q = U().pathNearest(route, x, z);
    if (q.dist > 70) return null;
    // never on the grid or on the flag: a pylon in the middle of the start is just an obstacle
    if (!route.loop && (q.d < 150 || q.d > route.len - 90)) return null;
    const off = U().clamp(q.w * 0.62, 5, 16);
    out.x = q.x + q.tz * off * side;
    out.z = q.z - q.tx * off * side;
    out.d = q.d;
    // a gate you cannot physically reach is worse than no gate
    const wq = RR.River.waterQuery(out.x, out.z, null);
    return wq && wq.clear > 4 ? out : null;
  }

  function buildBoostGates(state) {
    const route = state.route;
    const gates = [], scratch = {};
    for (const g of NAMED_GATES) {
      const p = placeGate(route, g.x, g.z, g.side, scratch);
      if (p) gates.push({ name: g.name, x: p.x, z: p.z, d: p.d, lastLap: -1 });
    }
    // fill to six with route samples, alternating sides so they read as a slalom
    const pt = {};
    let fillSide = 1, guard = 0;
    while (gates.length < 6 && guard++ < 60) {
      const d = (guard / 7) * route.len * 0.80 + route.len * 0.10;
      if (!route.loop && (d < 150 || d > route.len - 90)) continue;
      U().pathAt(route, Math.min(d, route.len - 1), pt);
      const off = U().clamp(pt.w * 0.62, 5, 16);
      const gx = pt.x + pt.tz * off * fillSide, gz = pt.z - pt.tx * off * fillSide;
      fillSide = -fillSide;
      const wq = RR.River.waterQuery(gx, gz, null);
      if (!wq || wq.clear < 4) continue;
      let tooClose = false;
      for (const g of gates) if (U().dist2(g.x, g.z, gx, gz) < 120 * 120) tooClose = true;
      if (tooClose) continue;
      gates.push({ name: 'BOOST GATE', x: gx, z: gz, d: pt.d, lastLap: -1 });
    }
    state.boostGates = gates;
    if (!gates.length) return;

    // one merged mesh for the posts, one for the glows: +2 draw calls for all six gates
    const GOLD = new THREE.Color(0xffc857).convertSRGBToLinear();
    const postGeos = [], glowGeos = [];
    for (const g of gates) {
      const q = U().pathNearest(route, g.x, g.z);
      for (const s of [-1, 1]) {
        const px = g.x + q.tz * 3.4 * s, pz = g.z - q.tx * 3.4 * s;
        const post = new THREE.CylinderGeometry(0.26, 0.42, 9, 6);
        post.translate(px, 4.5, pz);
        postGeos.push(post);
        const glow = new THREE.SphereGeometry(0.7, 8, 6);
        glow.translate(px, 9.4, pz);
        glowGeos.push(glow);
      }
      // rotateY(t) sends +x to (cos t, -sin t), so atan2(tx, tz) lays the bar ACROSS the channel
      const bar = new THREE.BoxGeometry(7.6, 0.4, 0.4);
      bar.rotateY(Math.atan2(q.tx, q.tz));
      bar.translate(g.x, 8.6, g.z);
      postGeos.push(bar);
    }
    const merge = RR.City && RR.City.mergeGeoms;
    if (!merge) return;
    const posts = new THREE.Mesh(merge(postGeos), new THREE.MeshStandardMaterial({
      color: 0x2a2419, emissive: GOLD, emissiveIntensity: 0.55, roughness: 0.45 }));
    const glows = new THREE.Mesh(merge(glowGeos), new THREE.MeshBasicMaterial({
      color: 0xffd24a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    glows.renderOrder = 2;
    glows.layers.set(1);
    posts.frustumCulled = false; glows.frustumCulled = false;
    gateGroup.add(posts, glows);
    state.boostGateGlow = glows;
    state.boostGatePosts = posts;
  }

  // Pre-placed trackside cameras for the cinematic rig (FEEL §2.8 shot 2): sample the route every
  // 180 m and stand the camera on the OUTSIDE of the bend, on the quay. Zero per-frame cost.
  function buildCamPoints(state) {
    const route = state.route, a = {}, b = {};
    const pts = [];
    for (let d = 60; d < route.len - 40; d += 180) {
      U().pathAt(route, d, a);
      U().pathAt(route, Math.min(route.len - 1, d + 90), b);
      const bend = U().wrapAngle(Math.atan2(b.tx, b.tz) - Math.atan2(a.tx, a.tz));
      const side = Math.sign(bend) || (pts.length % 2 ? 1 : -1);   // outside of the bend
      const off = a.w + 9;
      pts.push({ x: a.x + a.tz * off * side, y: 7, z: a.z - a.tx * off * side, d });
    }
    state.camPoints = pts;
  }

  function buildGates(state) {
    gateGroup = new THREE.Group();
    RR.Engine.scene.add(gateGroup);
    const route = state.route;
    const spacing = U().clamp(route.len / 16, 160, 340);
    const count = Math.max(4, Math.floor(route.len / spacing) - (route.loop ? 0 : 1));
    state.checkpoints = [];
    const pt = {};
    for (let i = 1; i <= count; i++) {
      const d = i * (route.len / (count + (route.loop ? 0 : 1)));
      U().pathAt(route, d, pt);
      const off = Math.max(5, pt.w - 5);
      const L = buoyMesh(0xff3b30), R = buoyMesh(0x2ecc71);
      L.position.set(pt.x - pt.tz * off, 0, pt.z + pt.tx * off);
      R.position.set(pt.x + pt.tz * off, 0, pt.z - pt.tx * off);
      gateGroup.add(L, R);
      state.checkpoints.push({ d, x: pt.x, z: pt.z, L, R });
    }
    // ---- finish gate: a tall checkered arch with a FINISH banner, flags, and a water line ----
    const fd = route.loop ? route.len : route.len - 12;
    U().pathAt(route, Math.min(fd, route.len - 1), pt);
    const gOff = Math.max(9, pt.w + 3);
    const ang = Math.atan2(pt.tx, pt.tz);
    const checkerTex = RR.U.canvasTexture(128, 128, (ctx, w, h) => {
      const n = 8, cs = w / n;
      for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) {
        ctx.fillStyle = (x + y) % 2 ? '#141414' : '#f5f5f5';
        ctx.fillRect(x * cs, y * cs, cs, cs);
      }
    });
    checkerTex.wrapS = checkerTex.wrapT = THREE.RepeatWrapping;
    const finishTex = RR.U.canvasTexture(512, 128, (ctx, w, h) => {
      const cs = 32;
      for (let x = 0; x < w / cs; x++) for (let r = 0; r < 2; r++) {
        ctx.fillStyle = (x + r) % 2 ? '#141414' : '#f5f5f5';
        ctx.fillRect(x * cs, r === 0 ? 0 : h - cs, cs, cs);
      }
      ctx.fillStyle = '#0b1e2d'; ctx.fillRect(0, cs, w, h - 2 * cs);
      ctx.fillStyle = '#ffc857'; ctx.font = 'bold 60px Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('FINISH', w / 2, h / 2 + 2);
    });
    const finishFlags = [];
    for (const s of [-1, 1]) {
      const px = pt.x + pt.tz * gOff * s, pz = pt.z - pt.tx * gOff * s;
      const poleTex = checkerTex.clone(); poleTex.repeat.set(1, 9); poleTex.needsUpdate = true;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 17, 10), new THREE.MeshBasicMaterial({ map: poleTex }));
      pole.position.set(px, 8.5, pz); gateGroup.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.2, 6, 1), new THREE.MeshBasicMaterial({ map: checkerTex, side: THREE.DoubleSide }));
      flag.position.set(px + pt.tx * 1.7, 17.5, pz + pt.tz * 1.7); flag.rotation.y = ang;
      gateGroup.add(flag); finishFlags.push(flag);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(gOff * 2, 3.0, 1.4), new THREE.MeshBasicMaterial({ map: finishTex }));
    beam.position.set(pt.x, 15, pt.z); beam.rotation.y = ang; gateGroup.add(beam);
    // checkered line painted across the water
    const stripGeo = new THREE.PlaneGeometry(gOff * 2, 7); stripGeo.rotateX(-Math.PI / 2);
    const stripTex = checkerTex.clone(); stripTex.repeat.set(gOff / 2, 2); stripTex.needsUpdate = true;
    const strip = new THREE.Mesh(stripGeo, new THREE.MeshBasicMaterial({ map: stripTex, transparent: true, opacity: 0.8, depthWrite: false }));
    strip.rotation.y = ang; strip.position.set(pt.x, 0.35, pt.z); strip.renderOrder = 2;
    gateGroup.add(strip);
    buildLakeMarkers(state);
    buildBoostGates(state);
    state.finishD = fd;
    state.finishGate = { x: pt.x, z: pt.z };
    state.finishFlags = finishFlags;
  }

  // ---------- race state ----------
  let S = null;
  RACE.state = () => S;

  // ---------- time-trial ghost ----------
  // The ghost is your own best lap, played back at 0.38 opacity on layer 1 so it never shows up
  // in the water reflection. No collision, no physics, no wake — it is a memory, not a boat.
  let ghostMesh = null, ghostPlay = null, ghostDeltaT = 0, ghostHull = null;
  const gOut = {};

  function clearGhost() {
    if (ghostMesh) { RR.Engine.scene.remove(ghostMesh); ghostMesh = null; }
    ghostPlay = null; ghostDeltaT = 0; ghostHull = null;
    if (RR.Replay && RR.Replay.clear) RR.Replay.clear();
  }

  // Load the stored ghost + build its mesh at RACE.start; recording does NOT start here.
  function startGhost(playerBoat) {
    if (!RR.Replay || !playerBoat) return;
    ghostHull = playerBoat.spec && playerBoat.spec.id;
    ghostPlay = RR.Replay.load ? RR.Replay.load(S.course.id, ghostHull) : null;
    if (!ghostPlay) return;
    if (RR.Replay.buildMesh) ghostMesh = RR.Replay.buildMesh(playerBoat.spec);
    if (ghostMesh) { ghostMesh.visible = false; RR.Engine.scene.add(ghostMesh); }
    S.ghostTime = ghostPlay.time;
  }

  // Recording opens on the GREEN FLAG, not at RACE.start. Playback is driven by S.time, which only
  // starts counting when the countdown ends — begin() during the countdown put 3.6 s of grid
  // footage ahead of sample 0 and the ghost replayed that far late for the whole run.
  function beginGhostRecording() {
    if (!S || !S.timeTrial || !RR.Replay || !RR.Replay.begin) return;
    RR.Replay.begin(S.course.id, ghostHull);
  }

  function updateGhost(dt) {
    if (!ghostPlay) return;
    const p = RR.Replay.playAt(ghostPlay, S.time, gOut);
    if (ghostMesh && p) {
      ghostMesh.visible = !p.done;
      ghostMesh.position.set(p.x, p.y, p.z);
      ghostMesh.rotation.set(0, 0, 0);
      ghostMesh.rotateY(p.heading);
      ghostMesh.rotateX(p.pitch);
      ghostMesh.rotateZ(-p.roll);
    }
    // delta chip: how far ahead/behind the ghost is, in seconds, refreshed 4x a second
    ghostDeltaT -= dt;
    if (ghostDeltaT <= 0 && S.player) {
      ghostDeltaT = 0.25;
      const gd = RR.Replay.progressAt ? RR.Replay.progressAt(ghostPlay, S.route, S.time) : null;
      const spd = Math.max(4, Math.hypot(S.player.vel.x, S.player.vel.z));
      if (gd != null) S.ghostDelta = (gd - (S.player.routeD % S.route.len)) / spd;
    }
  }
  RACE.ghostDelta = () => (S ? S.ghostDelta : null);

  // opts: { timeTrial, tour }. Both default off; a one-boat field is treated as a time trial so
  // main.js needs no change for ghosts to work.
  RACE.start = function (courseIdx, boats, playerBoat, opts) {
    opts = opts || {};
    if (gateGroup) { RR.Engine.scene.remove(gateGroup); gateGroup = null; }
    clearGhost();
    const course = RACE.COURSES[courseIdx];
    const tour = !!opts.tour;
    const timeTrial = tour ? false : (opts.timeTrial != null ? !!opts.timeTrial : boats.length === 1);
    S = {
      course, courseIdx,
      route: buildRoute(course),
      boats, player: playerBoat,
      phase: tour ? 'racing' : 'countdown', countdownT: 3.6,
      time: 0,
      wrongWayT: 0,
      results: [],
      finishTimeout: 12,
      timeTrial, tour,
      ghostDelta: null,
      cup: RACE.cup(),
    };
    if (tour) {
      // Architecture Tour: no rivals, no gates, no timer, no wrong-way. Just the river.
      gateGroup = new THREE.Group(); RR.Engine.scene.add(gateGroup);
      S.checkpoints = []; S.finishD = S.route.len; S.finishGate = null; S.boostGates = [];
    } else {
      buildGates(S);
    }
    buildCamPoints(S);
    if (timeTrial) startGhost(playerBoat);

    // grid placement: staggered rows just past the line (loop seams stay behind everyone)
    const pt = {};
    boats.forEach((b, i) => {
      const startD = 26 + Math.floor(i / 2) * 14;
      U().pathAt(S.route, startD, pt);
      const side = (i % 2 ? 1 : -1) * Math.min(8, pt.w * 0.4);
      b.pos.set(pt.x - pt.tz * side, 0.2, pt.z + pt.tx * side);
      b.heading = Math.atan2(pt.tx, pt.tz);
      b.vel.x = 0; b.vel.z = 0; b.angVel = 0;
      b.routeD = startD;
      b._inLap = startD;
      b.lap = 0; b.nextCp = 0; b.finished = false; b.finishTime = 0;
      b.routeHint = null;
      b.boostEnergy = 1;
      RR.Physics.applyVisual(b);
    });
    return S;
  };

  // track progress; returns true the frame the boat crosses a checkpoint
  function updateProgress(b, dt) {
    const route = S.route;
    let q = U().pathNearest(route, b.pos.x, b.pos.z, b.routeHint, b.routeHint != null ? 40 : 0);
    if (route.loop && (q.idx > route.n - 6 || q.idx < 4 || q.dist > 25)) {
      // hinted window can't see across the seam — retry unhinted near the join
      const q2 = U().pathNearest(route, b.pos.x, b.pos.z);
      if (q2.dist < q.dist - 0.01) q = q2;
    }
    b.routeHint = q.idx;
    let d = q.d;
    if (route.loop) {
      // compare raw in-lap distances — never routeD % len, which snaps to ~0 right at the seam
      const prev = b._inLap == null ? d : b._inLap;
      let delta = d - prev;
      if (delta < -route.len * 0.5) { b.lap++; delta += route.len; if (b.isPlayer && S.phase === 'racing') RACE.onLap && RACE.onLap(b.lap); }
      else if (delta > route.len * 0.5) { delta -= route.len; b.lap = Math.max(0, b.lap - 1); }
      b._inLap = d;
      b.routeD = b.lap * route.len + d;
      b._backT = delta < -0.5 ? (b._backT || 0) + dt : 0;
    } else {
      const delta = d - b.routeD;
      b._backT = delta < -0.5 && Math.hypot(b.vel.x, b.vel.z) > 4 ? (b._backT || 0) + dt : 0;
      b.routeD = d;
    }

    // checkpoints
    let hit = false;
    const cps = S.checkpoints;
    const inLapD = route.loop ? b.routeD % route.len : b.routeD;
    while (b.nextCp < cps.length && inLapD > cps[b.nextCp].d - 6 &&
           U().dist2(b.pos.x, b.pos.z, cps[b.nextCp].x, cps[b.nextCp].z) < 130 * 130) {
      b.nextCp++;
      hit = true;
    }
    // cps is empty in the Architecture Tour, and the tour runs on loop courses too
    if (route.loop && cps.length && b.nextCp >= cps.length && inLapD < cps[0].d) b.nextCp = 0;
    return hit;
  }

  function checkFinish(b) {
    if (b.finished) return;
    const route = S.route;
    const target = route.loop ? S.course.laps * route.len : S.finishD;
    if (b.routeD >= target - 2 && (route.loop || b.nextCp >= S.checkpoints.length * 0.6)) {
      b.finished = true;
      b.finishTime = S.time;
      S.results.push({ boat: b, time: S.time });
      if (b === S.player) {
        S.phase = 'finished';
        S.finishTimeout = Math.min(S.finishTimeout, 3.0);   // the race is over when YOU cross the line (placement pop plays first)
        saveBest(S.course.id, S.time);
        if (S.timeTrial && RR.Replay && RR.Replay.commit) {
          S.ghostBeaten = RR.Replay.commit(S.time);         // only stored if it beat the old lap
        }
        if (RACE.onPlayerFinish) RACE.onPlayerFinish(S.results.length, S.time);
      }
    }
  }

  function saveBest(id, t) {
    try {
      const k = 'rr_best_' + id;
      const old = parseFloat(localStorage.getItem(k));
      if (!isFinite(old) || t < old) localStorage.setItem(k, String(t));
    } catch (e) { /* storage may be unavailable from file:// — fine */ }
  }
  RACE.best = function (id) {
    try { const v = parseFloat(localStorage.getItem('rr_best_' + id)); return isFinite(v) ? v : null; }
    catch (e) { return null; }
  };

  // circle test against the boost gates, once per lap. +0.30 boost for a line you had to choose.
  function checkBoostGates(b) {
    const gates = S.boostGates;
    if (!gates || !gates.length || b !== S.player || b.finished) return;
    for (const g of gates) {
      if (g.lastLap === (b.lap || 0)) continue;
      if (U().dist2(b.pos.x, b.pos.z, g.x, g.z) > 49) continue;   // radius 7 m
      g.lastLap = b.lap || 0;
      b.boostEnergy = Math.min(1, b.boostEnergy + 0.30);
      if (RR.Camera && RR.Camera.kick) RR.Camera.kick(0.18);
      if (RR.HUD && RR.HUD.chip) RR.HUD.chip('near', '+BOOST');
      else if (RR.HUD && RR.HUD.flash) RR.HUD.flash('+BOOST');
      if (RR.Audio && RR.Audio.boostGate) RR.Audio.boostGate();
      else if (RR.Audio && RR.Audio.checkpoint) RR.Audio.checkpoint();
      if (RACE.onBoostGate) RACE.onBoostGate(g);
    }
  }

  RACE.update = function (dt) {
    if (!S) return;
    if (S.tour) {
      // free-roam: keep progress tracking alive for the camera look-ahead, nothing else
      S.time += dt;
      for (const b of S.boats) updateProgress(b, dt);
      S.wrongWay = false;
      return;
    }
    if (S.phase === 'countdown') {
      const prev = Math.ceil(S.countdownT);
      S.countdownT -= dt;
      const now = Math.ceil(S.countdownT);
      if (now !== prev && now > 0 && RACE.onCount) RACE.onCount(now);
      if (S.countdownT <= 0) {
        S.phase = 'racing';
        beginGhostRecording();
        if (RACE.onCount) RACE.onCount(0);
      }
      // hold boats on the line
      for (const b of S.boats) { b.vel.x *= 0.5; b.vel.z *= 0.5; }
      return;
    }
    S.time += dt;

    for (const b of S.boats) {
      if (b.remote) continue;         // multiplayer rivals: progress + finish come over the network
      const hitCp = updateProgress(b, dt);
      if (hitCp && b === S.player && RACE.onCheckpoint) RACE.onCheckpoint(b.nextCp, S.checkpoints.length);
      checkBoostGates(b);
      checkFinish(b);
    }
    updateGhost(dt);

    // standings by absolute route progress
    const order = [...S.boats].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.routeD - a.routeD;
    });
    order.forEach((b, i) => { b.racePos = i + 1; });

    // player wrong-way indicator
    S.wrongWay = (S.player._backT || 0) > 1.2;

    if (S.phase === 'finished') {
      S.finishTimeout -= dt;
      const allDone = S.boats.every((b) => b.finished);
      if ((allDone || S.finishTimeout <= 0) && RACE.onRaceOver) {
        // fill DNF entries by current position
        for (const b of S.boats) if (!b.finished) S.results.push({ boat: b, time: Infinity });
        const cb = RACE.onRaceOver; RACE.onRaceOver = null;
        cb(S.results);
      }
    }
  };

  // pulse the next gate's beacons so the player always knows where to aim
  RACE.animateGates = function (t) {
    if (!S) return;
    const cps = S.checkpoints;
    for (let i = 0; i < cps.length; i++) {
      const active = S.player && (S.player.nextCp === i);
      const s = active ? 1 + Math.sin(t * 6) * 0.35 : 1;
      cps[i].L.scale.setScalar(s);
      cps[i].R.scale.setScalar(s);
      const y = RR.U.waterHeight(cps[i].L.position.x, cps[i].L.position.z, t, RR.River.waveAmp(cps[i].L.position.x, cps[i].L.position.z));
      cps[i].L.position.y = y; cps[i].R.position.y = y;
      cps[i].L.rotation.x = Math.sin(t * 1.3 + i) * 0.08;
      cps[i].R.rotation.x = Math.sin(t * 1.5 + i * 2) * 0.08;
      if (cps[i].pylonGlow) cps[i].pylonGlow.scale.setScalar(1 + Math.sin(t * 6) * (active ? 0.5 : 0.15));
    }
    if (S.lakeRibbon) S.lakeRibbon.tex.offset.y = -(t * 0.4) % 1;   // chevrons scroll toward the finish
    if (S.boostGateGlow) {
      // Emission only — NEVER scale. The twelve glow spheres are baked at world coordinates into
      // one merged geometry, so mesh.scale works about the scene origin, not about each orb: the
      // Harbor Lock glow at x 1892 would swing +/-375 m off its post. (The checkpoint pylonGlow
      // this was copied from is a separate mesh with untranslated geometry, where scaling is fine.)
      const k = 0.72 + Math.sin(t * 3.4) * 0.22;
      S.boostGateGlow.material.opacity = k;
      if (S.boostGatePosts) S.boostGatePosts.material.emissiveIntensity = 0.40 + (k - 0.50) * 0.55;
    }
  };

  RACE.routeForAI = function () { return { path: S.route }; };

  // ---------- THE CHICAGO CUP ----------
  // Four rounds over the four courses, points 10/8/6/4/3/2, persisted so you can walk away and
  // come back to a standings table that remembers.
  RACE.CUP_ROUNDS = ['mainstem', 'southbranch', 'riverrun', 'lakecircuit'];
  RACE.CUP_POINTS = [10, 8, 6, 4, 3, 2];

  function cupLoad() {
    try {
      const raw = localStorage.getItem('rr_cup');
      const c = raw ? JSON.parse(raw) : null;
      if (c && typeof c.round === 'number' && Array.isArray(c.points)) return c;
    } catch (e) { /* file:// storage may be unavailable — fine */ }
    return null;
  }
  function cupSave(c) {
    try { localStorage.setItem('rr_cup', JSON.stringify(c)); } catch (e) { /* fine */ }
  }

  let cupState = null;
  RACE.cup = () => cupState || (cupState = cupLoad());

  RACE.cupBegin = function (hull, diff, fieldSize) {
    cupState = { round: 0, points: new Array(fieldSize || 6).fill(0), hull: hull | 0, diff: diff == null ? 1 : diff };
    cupSave(cupState);
    return cupState;
  };
  RACE.cupResume = function () { return RACE.cup(); };
  RACE.cupAbandon = function () { cupState = null; try { localStorage.removeItem('rr_cup'); } catch (e) { /* fine */ } };
  RACE.cupCourseIdx = function () {
    const c = RACE.cup();
    if (!c) return 0;
    const id = RACE.CUP_ROUNDS[Math.min(c.round, RACE.CUP_ROUNDS.length - 1)];
    const i = RACE.COURSES.findIndex((x) => x.id === id);
    return i < 0 ? 0 : i;
  };

  // results = the array RACE.onRaceOver hands out, finishing order first. Player is index 0 of
  // the boats array, so standings are keyed by that index and survive a page reload.
  RACE.cupRecord = function (results) {
    const c = RACE.cup();
    if (!c || !S) return null;
    for (let i = 0; i < results.length; i++) {
      const idx = S.boats.indexOf(results[i].boat);
      if (idx < 0) continue;
      while (c.points.length <= idx) c.points.push(0);
      c.points[idx] += RACE.CUP_POINTS[Math.min(i, RACE.CUP_POINTS.length - 1)];
    }
    c.round++;
    c.done = c.round >= RACE.CUP_ROUNDS.length;
    cupSave(c);
    return c;
  };
  RACE.cupStandings = function () {
    const c = RACE.cup();
    if (!c) return [];
    return c.points.map((p, i) => ({ idx: i, pts: p, isPlayer: i === 0 }))
      .sort((a, b) => b.pts - a.pts);
  };

  RACE.isTour = () => !!(S && S.tour);
  RACE.isTimeTrial = () => !!(S && S.timeTrial);

  RR.Race = RACE;
})();

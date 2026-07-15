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
    state.finishD = fd;
    state.finishGate = { x: pt.x, z: pt.z };
    state.finishFlags = finishFlags;
  }

  // ---------- race state ----------
  let S = null;
  RACE.state = () => S;

  RACE.start = function (courseIdx, boats, playerBoat) {
    if (gateGroup) { RR.Engine.scene.remove(gateGroup); gateGroup = null; }
    const course = RACE.COURSES[courseIdx];
    S = {
      course, courseIdx,
      route: buildRoute(course),
      boats, player: playerBoat,
      phase: 'countdown', countdownT: 3.6,
      time: 0,
      wrongWayT: 0,
      results: [],
      finishTimeout: 12,
    };
    buildGates(S);

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
    if (route.loop && b.nextCp >= cps.length && inLapD < cps[0].d) b.nextCp = 0;
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
        saveBest(S.course.id, S.time);
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

  RACE.update = function (dt) {
    if (!S) return;
    if (S.phase === 'countdown') {
      const prev = Math.ceil(S.countdownT);
      S.countdownT -= dt;
      const now = Math.ceil(S.countdownT);
      if (now !== prev && now > 0 && RACE.onCount) RACE.onCount(now);
      if (S.countdownT <= 0) {
        S.phase = 'racing';
        if (RACE.onCount) RACE.onCount(0);
      }
      // hold boats on the line
      for (const b of S.boats) { b.vel.x *= 0.5; b.vel.z *= 0.5; }
      return;
    }
    S.time += dt;

    for (const b of S.boats) {
      const hitCp = updateProgress(b, dt);
      if (hitCp && b === S.player && RACE.onCheckpoint) RACE.onCheckpoint(b.nextCp, S.checkpoints.length);
      checkFinish(b);
    }

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
    }
  };

  RACE.routeForAI = function () { return { path: S.route }; };

  RR.Race = RACE;
})();

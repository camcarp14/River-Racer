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

  // Per-race GPU allocations are torn down, not just removed: a race start used to leak ~100
  // geometries and ~8 textures (buoys, finish arch, merged boost gates, the ghost's material
  // clones), and a long phone session crept toward context loss. Textures that live for the whole
  // session (checker, finish banner, chevrons, BOOST sign and mat — built once below, marked
  // rrShared) are skipped; every other map is one this file or boats.js built for this object.
  // boats.js has no module-level texture cache (every canvasTexture there is inside a builder),
  // so a boat mesh's maps are its own and main.js may hand boat meshes and the showroom boat here.
  RACE.disposeObject = function (obj) {
    if (!obj || !obj.traverse) return;
    const MAPS = ['map', 'emissiveMap', 'alphaMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'bumpMap'];
    obj.traverse((o) => {
      if (o.geometry && o.geometry.dispose) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (!m || !m.dispose) continue;
        for (const k of MAPS) { const t = m[k]; if (t && t.dispose && !t.rrShared) t.dispose(); }
        m.dispose();
      }
    });
  };
  // The field's hulls are main.js's meshes, but main.js only removes them (clearBoats) and the
  // race is the thing that knows when they are dead: 6 x 33 geometries per race, measured, was
  // the whole of what leaked once the gates were disposed. Only a mesh already OUT of the scene
  // is touched, so a hull main.js still holds (the showroom boat, a roster kept between rounds)
  // is never pulled from under it; disposing twice is harmless if main.js does it too.
  function disposeDeadHulls(state) {
    if (!state || !state.boats) return;
    for (const b of state.boats) if (b && b.mesh && !b.mesh.parent) RACE.disposeObject(b.mesh);
  }
  // session-lifetime textures: built on the first race, never disposed (see disposeObject)
  let texCache = null;
  function sharedTex() {
    if (texCache) return texCache;
    const checker = RR.U.canvasTexture(128, 128, (ctx, w, h) => {
      const n = 8, cs = w / n;
      for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) {
        ctx.fillStyle = (x + y) % 2 ? '#141414' : '#f5f5f5';
        ctx.fillRect(x * cs, y * cs, cs, cs);
      }
    });
    checker.wrapS = checker.wrapT = THREE.RepeatWrapping;
    const finish = RR.U.canvasTexture(512, 128, (ctx, w, h) => {
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
    const chevron = chevronTex(); chevron.wrapS = chevron.wrapT = THREE.RepeatWrapping;
    const boostSign = boostSignTex();
    const boostMat = boostMatTex(); boostMat.wrapS = boostMat.wrapT = THREE.RepeatWrapping;
    texCache = { checker, finish, chevron, boostSign, boostMat };
    for (const k in texCache) texCache[k].rrShared = true;
    return texCache;
  }

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
      const tex = sharedTex().chevron;
      // Painted-on, not additive: adding gold to deep-blue lake water lands on lime, and on the
      // near-black night lake it clips to pure white. Normal blending keeps the chevrons gold.
      const ribbon = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
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

  // BOOST across the bar, with chevrons at both ends funnelling the eye into the gap.
  function boostSignTex() {
    return RR.U.canvasTexture(512, 96, (c, w, h) => {
      c.fillStyle = '#07301b'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#25ff7a'; c.fillRect(0, 0, w, 7); c.fillRect(0, h - 7, w, 7);
      c.fillStyle = '#eafff2';
      c.font = 'bold 56px "Arial Black", Arial, sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('BOOST', w / 2, h / 2 + 3);
      c.strokeStyle = '#25ff7a'; c.lineWidth = 8; c.lineCap = 'round';
      for (let k = 0; k < 3; k++) for (const s of [-1, 1]) {
        const x = w / 2 + s * (140 + k * 26);
        c.beginPath();
        c.moveTo(x + s * 15, h * 0.22); c.lineTo(x, h / 2); c.lineTo(x + s * 15, h * 0.78);
        c.stroke();
      }
    });
  }
  // Chevrons painted on the water, apex toward +v (CanvasTexture flips Y) = the way through.
  // Drawn twice, dark under bright: the Chicago River is GREEN, and a green arrow on green water
  // is an arrow nobody sees.
  function boostMatTex() {
    return RR.U.canvasTexture(128, 128, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.lineCap = 'round'; c.lineJoin = 'round';
      // a deep V, not a shallow one: seen from a boat's eye the mat is almost edge-on, and a
      // shallow chevron foreshortens into a plain stripe
      for (const pass of [['#06251a', 28], ['#b6ffd9', 15]]) {
        c.strokeStyle = pass[0]; c.lineWidth = pass[1];
        for (let k = 0; k < 3; k++) {
          const y = 38 + k * 42;
          c.beginPath(); c.moveTo(12, y); c.lineTo(w / 2, y - 34); c.lineTo(w - 12, y); c.stroke();
        }
      }
    });
  }

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

    // A gate has to read as SPEED from 200 m out, not as a channel marker. Green (the only colour
    // that means go), chevrons painted on the water pointing the way through, BOOST lettered across
    // the bar so it reads from either direction, and a ring that pulses on the water like a start
    // light — and goes dark the moment you have taken it.
    const postGeos = [], glowGeos = [], signGeos = [], matGeos = [];
    const HALF = 4.0;
    for (const g of gates) {
      const q = U().pathNearest(route, g.x, g.z);
      const across = Math.atan2(q.tx, q.tz);            // rotateY(across) sends +x to (tz, -tx)
      for (const s of [-1, 1]) {
        const px = g.x + q.tz * HALF * s, pz = g.z - q.tx * HALF * s;
        const post = new THREE.CylinderGeometry(0.24, 0.44, 9, 6);
        post.translate(px, 4.5, pz);
        postGeos.push(post);
        const glow = new THREE.SphereGeometry(0.72, 8, 6);
        glow.translate(px, 9.3, pz);
        glowGeos.push(glow);
      }
      const bar = new THREE.BoxGeometry(HALF * 2 + 0.9, 0.34, 0.34);
      bar.rotateY(across);
      bar.translate(g.x, 8.35, g.z);
      postGeos.push(bar);
      // one sign per side, each turned to face its own oncoming traffic, so BOOST never reads
      // mirrored the way a single double-sided plane would
      for (const s of [-1, 1]) {
        const sign = new THREE.PlaneGeometry(HALF * 2 + 2.6, 2.2);
        sign.rotateY(Math.atan2(q.tx * s, q.tz * s));   // plane normal +z -> (+/-tx, +/-tz)
        sign.translate(g.x + q.tx * 0.26 * s, 8.4, g.z + q.tz * 0.26 * s);
        signGeos.push(sign);
      }
      // chevron mat on the water. rotateX(-PI/2) puts the texture's +v on -z; the extra PI turns
      // it back down the route, so the arrows point the way you are meant to go.
      const pad = new THREE.PlaneGeometry(HALF * 2 + 1.0, 18);
      pad.rotateX(-Math.PI / 2);
      pad.rotateY(across + Math.PI);
      pad.translate(g.x, 0.36, g.z);
      const uv = pad.attributes.uv;                    // two tiles down the run: a chevron every 2 m
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 2);
      matGeos.push(pad);
    }
    const merge = RR.City && RR.City.mergeGeoms;
    if (!merge) return;
    const GO = new THREE.Color(0x25ff7a).convertSRGBToLinear();
    const posts = new THREE.Mesh(merge(postGeos), new THREE.MeshStandardMaterial({
      color: 0x16241c, emissive: GO, emissiveIntensity: 0.55, roughness: 0.42 }));
    const glows = new THREE.Mesh(merge(glowGeos), new THREE.MeshBasicMaterial({
      color: 0x5cffa8, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    // unlit and fully opaque: the legend has to read at midnight as clearly as at noon
    const signs = new THREE.Mesh(merge(signGeos), new THREE.MeshBasicMaterial({
      map: sharedTex().boostSign, side: THREE.FrontSide }));
    const matTex = sharedTex().boostMat;
    // Normal blending, not additive: green added to the river's own green clips straight to white
    // (the same trap the lake ribbon fell into), and a white gate says nothing at all.
    const mats = new THREE.Mesh(merge(matGeos), new THREE.MeshBasicMaterial({
      map: matTex, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
    glows.renderOrder = 2; mats.renderOrder = 2;
    glows.layers.set(1); mats.layers.set(1);
    posts.frustumCulled = false; glows.frustumCulled = false;
    signs.frustumCulled = false; mats.frustumCulled = false;
    gateGroup.add(posts, glows, signs, mats);
    // The ring is the one part that may be SCALED, because each is its own mesh with untranslated
    // geometry — the merged meshes above are baked at world coordinates and scaling them flies the
    // Harbor Lock gate 400 m up the river.
    const ringGeo = new THREE.RingGeometry(3.4, 4.5, 30);
    ringGeo.rotateX(-Math.PI / 2);
    for (const g of gates) {
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0x25ff7a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide }));
      ring.position.set(g.x, 0.46, g.z);
      ring.renderOrder = 3; ring.layers.set(1);
      gateGroup.add(ring);
      g.ring = ring;
      g.hitT = 0;
    }
    state.boostGateGlow = glows;
    state.boostGatePosts = posts;
    state.boostGateMat = matTex;
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
      // tx/tz/off are the gate LINE, not a blob: the buoy rule below measures how far off the
      // centre of the pair you crossed, and the two buoys are already standing at +/-off.
      state.checkpoints.push({ d, x: pt.x, z: pt.z, tx: pt.tx, tz: pt.tz, off, L, R });
    }
    // ---- finish gate: a tall checkered arch with a FINISH banner, flags, and a water line ----
    const fd = route.loop ? route.len : route.len - 12;
    U().pathAt(route, Math.min(fd, route.len - 1), pt);
    const gOff = Math.max(9, pt.w + 3);
    const ang = Math.atan2(pt.tx, pt.tz);
    // the checker and banner are session-lifetime (sharedTex); the pole/strip clones below are
    // per race and disposed with the group
    const checkerTex = sharedTex().checker, finishTex = sharedTex().finish;
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

  let ghostLap = 0, ghostPrevD = null;     // the ghost's own lap counter, for the loop course

  function clearGhost() {
    if (ghostMesh) { RR.Engine.scene.remove(ghostMesh); RACE.disposeObject(ghostMesh); ghostMesh = null; }
    ghostPlay = null; ghostDeltaT = 0; ghostHull = null;
    ghostLap = 0; ghostPrevD = null;
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
    // delta chip: how far ahead/behind the ghost is, in seconds, refreshed 4x a second.
    // progressAt hands back the IN-LAP distance, so on the two-lap lake circuit the ghost keeps
    // its own lap counter (a drop of more than half a lap between samples is the seam; a rise
    // that big is the seam the other way) and the comparison is absolute against routeD, which
    // already carries lap*len. Without that the chip flipped by a whole lap at every seam.
    ghostDeltaT -= dt;
    if (ghostDeltaT <= 0 && S.player) {
      ghostDeltaT = 0.25;
      const gd = RR.Replay.progressAt ? RR.Replay.progressAt(ghostPlay, S.route, S.time) : null;
      if (gd != null) {
        const len = S.route.len;
        if (S.route.loop && ghostPrevD != null) {
          const dd = gd - ghostPrevD;
          if (dd < -len * 0.5) ghostLap++;
          else if (dd > len * 0.5) ghostLap = Math.max(0, ghostLap - 1);
        }
        ghostPrevD = gd;
        // divide by the player's smoothed speed, not this frame's: a chop slam that halves the
        // instantaneous speed would double the chip for one sample
        const spd = Math.max(6, S.player._spdAvg || Math.hypot(S.player.vel.x, S.player.vel.z));
        S.ghostDelta = (ghostLap * len + gd - S.player.routeD) / spd;
      }
    }
  }
  RACE.ghostDelta = () => (S ? S.ghostDelta : null);
  // the ghost's absolute progress, for a HUD or a test that wants more than the chip
  RACE.ghostInfo = () => (S && ghostPlay ? { lap: ghostLap, d: ghostPrevD, delta: S.ghostDelta, time: S.ghostTime, next: ghostDeltaT } : null);

  // opts: { timeTrial, tour }. Both default off; a one-boat field is treated as a time trial so
  // main.js needs no change for ghosts to work.
  RACE.start = function (courseIdx, boats, playerBoat, opts) {
    opts = opts || {};
    if (gateGroup) { RR.Engine.scene.remove(gateGroup); RACE.disposeObject(gateGroup); gateGroup = null; }
    disposeDeadHulls(S);                 // the previous field, if main.js has already cleared it
    clearGhost();
    const course = RACE.COURSES[courseIdx];
    if (RR.Progress && RR.Progress.noteRun) RR.Progress.noteRun(null);   // last run's strip is history
    const tour = !!opts.tour;
    const timeTrial = tour ? false : (opts.timeTrial != null ? !!opts.timeTrial : boats.length === 1);
    S = {
      course, courseIdx,
      route: buildRoute(course),
      boats, player: playerBoat,
      phase: tour ? 'racing' : 'countdown', countdownT: 3.6,
      countShown: 4,                   // sentinel: '3' fires on the first countdown frame (onCount is set after start returns)
      startHoldSince: null,            // countdownT at which the player's throttle went down and stayed down
      startVerdict: null,              // 'perfect' | 'jump' | 'none', decided at GO (+0.25 s of grace)
      time: 0,
      wrongWayT: 0,
      finalLap: false,
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
    // The crates go in before the grid is set, so a boat placed on the line already knows where
    // the first row is. powerups.js decides for itself whether this race gets them at all — a
    // tour, a time trial, the cold open and multiplayer all run clean.
    if (RR.Powerups && RR.Powerups.buildForRace) RR.Powerups.buildForRace(S);
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
      b.cpStreak = 0;
      b.boostEnergy = 1;
      RR.Physics.applyVisual(b);
    });
    return S;
  };

  // Tearing the race down on the way back to the title. The ghost mesh is ours alone — main.js
  // only knows about real boats — so without this it sits on the water behind the menu flythrough.
  RACE.end = function () {
    if (gateGroup) { RR.Engine.scene.remove(gateGroup); RACE.disposeObject(gateGroup); gateGroup = null; }
    disposeDeadHulls(S);                 // main.js clears the field before it calls this
    clearGhost();
    if (RR.Powerups && RR.Powerups.clear) RR.Powerups.clear();
    // quit-to-title mid-finale: the screen the beat would open no longer exists, and a stuck
    // 0.6x clock would follow the player back onto the menu flythrough.
    if (S && S.finaleRunning && RR.Feel && RR.Feel.cancelFinale) RR.Feel.cancelFinale();
    S = null;
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
    // Wrong way is heading against the route tangent, not a per-frame routeD drop: the old
    // -0.5 m/frame test needed 30 m/s backwards at 60 fps and never fired in play. Needs way on
    // (> 4 m/s, so deliberate astern with S never trips it), accumulates on sim time and DECAYS
    // at 2x rather than resetting, so one jittery frame in a tight bend does not restart the
    // clock; capped at 2 s so the banner clears within 0.5 s of pointing the right way again.
    const spd = Math.hypot(b.vel.x, b.vel.z);
    const against = spd > 4 && (b.vel.x * q.tx + b.vel.z * q.tz) < -0.6 * spd;
    b._backT = against ? Math.min(2, (b._backT || 0) + dt) : Math.max(0, (b._backT || 0) - 2 * dt);
    if (route.loop) {
      // compare raw in-lap distances — never routeD % len, which snaps to ~0 right at the seam
      const prev = b._inLap == null ? d : b._inLap;
      let delta = d - prev;
      if (delta < -route.len * 0.5) {
        b.lap++; delta += route.len;
        if (b.isPlayer && S.phase === 'racing') {
          S.finalLap = b.lap === S.course.laps - 1;          // main.js flashes FINAL LAP off this
          if (RACE.onLap) RACE.onLap(b.lap);
        }
      }
      else if (delta > route.len * 0.5) { delta -= route.len; b.lap = Math.max(0, b.lap - 1); }
      b._inLap = d;
      b.routeD = b.lap * route.len + d;
    } else {
      b.routeD = d;
    }

    // checkpoints
    let hit = null;
    const cps = S.checkpoints;
    const inLapD = route.loop ? b.routeD % route.len : b.routeD;
    while (b.nextCp < cps.length && inLapD > cps[b.nextCp].d) {
      hit = scoreGate(b, cps[b.nextCp]);
      b.nextCp++;
    }
    // cps is empty in the Architecture Tour, and the tour runs on loop courses too
    if (route.loop && cps.length && b.nextCp >= cps.length && inLapD < cps[0].d) b.nextCp = 0;
    return hit;
  }

  // ---------- THE BUOY RULE ----------
  // A 130 m radius on a sixty-metre river is not a gate, it is a formality: the pair of buoys has
  // been standing there since launch and nothing ever asked you to drive between them. Now it does.
  //
  // Passing INSIDE the pair pays 0.16-0.40, graded on how central the line was and on how many
  // gates in a row you have taken cleanly. Passing outside still counts you through — a run broken
  // by something you did not choose to attempt would feel like theft — but it pays 0.07. Sloppy
  // players feel the boat get heavy; nobody gets stopped. A gate cannot be MISSED: it is scored
  // by route distance the moment the hull is past its line, so nextCp never lags routeD and the
  // finish needs no gate count (it used to ask for 60%, a rule that could not fail).
  //
  // These numbers came UP this round, and again the round after. The salute was retired, and with
  // it a payout worth 0.25-0.46 per bascule, chainable, on a river with ten of them: that was the
  // largest single supply in the boost economy and it is now zero. Then the ledger showed the
  // 0.030/s passive trickle had become the largest supply instead (3.7 of 8.0 per Main Stem run,
  // 42%), so physics.js made it conditional on speed (only above ~0.85 top, the "brave for a
  // while" it always claimed to be) and the difference moved here: floor 0.12 -> 0.16, span
  // 0.18 -> 0.24. The two things you steer for pay, and POWER-UPS are the lump sum (a TURBO
  // fills the tank outright).
  const CP_FLOOR = 0.16, CP_SPAN = 0.24, CP_SLOPPY = 0.07;
  const CP_STREAK_FULL = 6;          // gates in a row to saturate the consistency half of the pay
  const CP_QUALITY_M = 18;           // metres off the centreline at which the line-quality half is spent

  function scoreGate(b, cp) {
    // Rewind to where the hull actually crossed the line. A frame at 40 m/s is 0.7 m, but a warped
    // test step is metres, and reading the lateral offset late is exactly what decides clean.
    let px = b.pos.x, pz = b.pos.z;
    const spd = Math.hypot(b.vel.x, b.vel.z);
    if (spd > 0.5) {
      const along = (px - cp.x) * cp.tx + (pz - cp.z) * cp.tz;
      if (along > 0) { px -= (b.vel.x / spd) * along; pz -= (b.vel.z / spd) * along; }
    }
    const lat = Math.abs((px - cp.x) * cp.tz - (pz - cp.z) * cp.tx);
    const clean = lat < cp.off;
    b.cpStreak = clean ? (b.cpStreak || 0) + 1 : 0;
    // The clean test is the buoys themselves — that is what the player can see. The line-quality
    // half is measured against a tighter reference, because out on the lake legs the pair stands
    // sixty metres apart and a gate you cannot miss must not also pay the maximum.
    const q = U().clamp(1 - lat / Math.min(Math.max(1, cp.off), CP_QUALITY_M), 0, 1);
    const s = U().clamp(b.cpStreak / CP_STREAK_FULL, 0, 1);
    const pay = clean ? CP_FLOOR + CP_SPAN * (0.62 * s + 0.38 * q) : CP_SLOPPY;
    b.boostEnergy = Math.min(1, (b.boostEnergy || 0) + pay);
    return { clean, pay, lat, q, streak: b.cpStreak };
  }

  function checkFinish(b) {
    if (b.finished) return;
    const route = S.route;
    const target = route.loop ? S.course.laps * route.len : S.finishD;
    // Distance alone decides the line. There is no gate count here on purpose: gates are scored
    // by route distance (updateProgress), so every gate behind the hull is already taken and a
    // "60% of checkpoints" clause could never be false — see THE BUOY RULE.
    if (b.routeD >= target - 2) {
      b.finished = true;
      b.finishTime = S.time;
      S.results.push({ boat: b, time: S.time });
      if (b !== S.player) {
        if (RACE.onRivalFinish) RACE.onRivalFinish(b, S.results.length);   // the win going, announced
      } else {
        S.phase = 'finished';
        S.summary = bankRun();
        if (S.timeTrial && RR.Replay && RR.Replay.commit) {
          S.ghostBeaten = RR.Replay.commit(S.time);         // only stored if it beat the old lap
        }
        // The city lets you go. The finale owns the three seconds after the line — engine and music
        // cut, the chase rig releases onto the skyline — and it, not a timer, says when the results
        // card slides in. The timeout stays as a backstop in case feel.js is absent or wedged.
        if (RR.Feel && RR.Feel.finale) {
          S.finaleRunning = true;
          RR.Feel.finale(() => { S.finaleDone = true; });
          S.finishTimeout = Math.min(S.finishTimeout, 6.0);
        } else {
          S.finishTimeout = Math.min(S.finishTimeout, 3.0); // placement pop plays first
        }
        if (RACE.onPlayerFinish) RACE.onPlayerFinish(S.results.length, S.time);
      }
    }
  }

  // ---------- records ----------
  // Everything the run changed, in one object, written once and read by the results strip. A screen
  // that cannot say what changed means the run changed nothing.
  function bankRun() {
    const P = RR.Progress;
    const id = S.course.id;
    const route = S.route;
    const len = route.len * (route.loop ? (S.course.laps || 1) : 1);
    // The chain was the salute's, and the salute is retired. The two fields survive, permanently
    // zero, so the results strip and everything else that reads them still reads cleanly — but no
    // stored chain is resurrected and no new one is banked. (menus.js still prints a SALUTE row off
    // these; deleting that row belongs to whoever owns the strip.)
    const out = { course: id, time: S.time, chain: 0, best: 0, chainImproved: false, tour: !!S.tour };
    if (S.tour || !P) return out;
    try {
      // records are per HULL as well as overall: one podracer run must not lock BEST for every
      // other boat. `timeImproved` stays the overall line (the banner's meaning today);
      // `hullImproved` is the one the selected hull's card cares about.
      const hull = S.player && S.player.spec ? S.player.spec.id : null;
      out.hull = hull;
      out.prevTime = P.bestTime(id);
      out.prevHullTime = hull ? P.bestTime(id, hull) : null;
      const rec = P.recordTime(id, S.time, len, hull);
      out.timeImproved = rec && typeof rec === 'object' ? !!rec.overall : !!rec;
      out.hullImproved = rec && typeof rec === 'object' ? !!rec.hull : !!rec;
      out.bestTime = P.bestTime(id);
      out.hullBestTime = hull ? P.bestTime(id, hull) : null;
      const top = S.player && S.player.spec ? S.player.spec.top : null;
      const m = P.awardMedal(id, S.time, len, top);
      out.medal = m.medal; out.prevMedal = m.prev; out.medalUp = m.improved;
      out.par = P.parTimes(id, len, top);
      P.set('runs', (P.get().runs || 0) + 1);
      P.noteRun(out);
    } catch (e) { /* a record is never worth a thrown finish */ }
    return out;
  }
  RACE.summary = () => (S ? S.summary || null : null);

  // best(id) is the overall course record; best(id, hullId) the record for that hull alone
  // (null until that hull has finished the course). The legacy rr_best_ key only ever held the
  // overall line, so it is not consulted for a hull.
  RACE.best = function (id, hullId) {
    if (RR.Progress && RR.Progress.bestTime) { const v = RR.Progress.bestTime(id, hullId); if (v != null) return v; }
    if (hullId) return null;
    try { const v = parseFloat(localStorage.getItem('rr_best_' + id)); return isFinite(v) ? v : null; }
    catch (e) { return null; }
  };
  RACE.bestChain = function (id) {
    return RR.Progress && RR.Progress.bestChain ? RR.Progress.bestChain(id) : null;
  };
  RACE.medal = function (id) {
    return RR.Progress && RR.Progress.medalOf ? RR.Progress.medalOf(id) : null;
  };

  // circle test against the boost gates, once per lap. The risky thing must pay best: an off-line
  // gate costs you a metre and pays 0.42 — more than any single buoy gate on the racing line, and
  // now the biggest single deliberate payout left in the game (see THE BUOY RULE above).
  const GATE_PAY = 0.42;
  function checkBoostGates(b) {
    const gates = S.boostGates;
    if (!gates || !gates.length || b !== S.player || b.finished) return;
    for (const g of gates) {
      if (g.lastLap === (b.lap || 0)) continue;
      if (U().dist2(b.pos.x, b.pos.z, g.x, g.z) > 56.25) continue;   // radius 7.5 m: the posts stand at 4
      g.lastLap = b.lap || 0;
      g.hitT = 0.55;                                              // the ring blows out and goes dark
      b.boostEnergy = Math.min(1, b.boostEnergy + GATE_PAY);
      if (RR.Camera && RR.Camera.kick) RR.Camera.kick(0.18);
      if (RR.HUD && RR.HUD.chip) RR.HUD.chip('near', '+BOOST');
      else if (RR.HUD && RR.HUD.flash) RR.HUD.flash('+BOOST');
      if (RR.Audio && RR.Audio.boostGate) RR.Audio.boostGate();
      else if (RR.Audio && RR.Audio.checkpoint) RR.Audio.checkpoint();
      // a wall of spray through the gate: you FELT it, so you should see it
      if (RR.FX && RR.FX.spray) RR.FX.spray(g.x, 0.6, g.z, 0, 7.5, 0, 14, 6.5, 1.1);
      if (RACE.onBoostGate) RACE.onBoostGate(g);
    }
  }

  // The podracer used to be locked behind a chain of ten salutes, and the salute is retired: that
  // gate could never be met again, which is why the owner could no longer find her. Nothing in
  // this file gates her now — boats.js owns whether she is pickable.

  RACE.update = function (dt) {
    if (!S) return;
    if (RR.Powerups && RR.Powerups.update) RR.Powerups.update(dt, S);
    if (S.tour) {
      // free-roam: keep progress tracking alive for the camera look-ahead, nothing else
      S.time += dt;
      for (const b of S.boats) updateProgress(b, dt);
      S.wrongWay = false;
      return;
    }
    if (S.phase === 'countdown') {
      S.countdownT -= dt;
      // '3' on the FIRST countdown frame: main.js assigns onCount after start() returns, so the
      // sentinel (countShown 4) fires it here rather than 0.6 s in when ceil first changes. The
      // 3.6 s hold itself stays — the camera needs the beat to settle after snapTo.
      const show = Math.min(3, Math.ceil(S.countdownT));
      if (show !== S.countShown && show > 0 && RACE.onCount) { S.countShown = show; RACE.onCount(show); }
      // THE START. A throttle pressed within +/-0.25 s of GO is a perfect start: a 1.0 s kick of
      // thrust (physics' boostKick accel, no tank spent). Held from before -0.6 s is a jump start:
      // 0.5 s of dead throttle. Player only, offline only; the rivals leave on the frame of GO.
      startWatch();
      if (S.countdownT <= 0) {
        S.phase = 'racing';
        beginGhostRecording();
        if (RACE.onCount) RACE.onCount(0);
        startVerdict(0);
      }
      // hold boats on the line
      for (const b of S.boats) { b.vel.x *= 0.5; b.vel.z *= 0.5; }
      return;
    }
    S.time += dt;
    if (S.startVerdict == null) { startWatch(); startVerdict(S.time); }

    for (const b of S.boats) {
      if (b.remote) continue;         // multiplayer rivals: progress + finish come over the network
      const hitCp = updateProgress(b, dt);
      if (hitCp && b === S.player && RACE.onCheckpoint) RACE.onCheckpoint(b.nextCp, S.checkpoints.length, hitCp);
      checkBoostGates(b);
      checkFinish(b);
      // smoothed speed (8 s), for the projected finish on the results card and the ghost chip
      const sp = Math.hypot(b.vel.x, b.vel.z);
      b._spdAvg = b._spdAvg == null ? sp : b._spdAvg + (sp - b._spdAvg) * Math.min(1, dt / 8);
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

    // player wrong-way indicator (1.0 s against the tangent with way on — see updateProgress)
    S.wrongWay = (S.player._backT || 0) > 1.0;

    if (S.phase === 'finished') {
      S.finishTimeout -= dt;
      const allDone = S.boats.every((b) => b.finished);
      // With the finale running the card waits for the beat, not for the field: a rival crossing
      // 0.3 s behind you must not cut the three seconds of skyline short.
      const ready = S.finaleRunning ? (S.finaleDone || S.finishTimeout <= 0) : (allDone || S.finishTimeout <= 0);
      if (ready && RACE.onRaceOver) {
        fillResults();
        const cb = RACE.onRaceOver; RACE.onRaceOver = null;
        cb(S.results);
      }
    }
  };

  // The card opens on the beat, so most of the field is still on the water. Nobody in this game
  // fails to finish: the unfinished tail goes in WATER ORDER (routeD desc — it already carries
  // lap*len, so the loop is fine) with a PROJECTED time, marked as such (`projected`, `gapM`) so
  // the card can print '≈1:52' or '−312 m' rather than a fabricated time, and the cup hands out
  // its points in that order. It used to append them in boat-array order as time Infinity, and
  // the rival who was second on the water could collect sixth-place points. MP remotes (routeD
  // stale, race.js never steps them) sort last among the unfinished.
  function fillResults() {
    const route = S.route;
    const target = route.loop ? S.course.laps * route.len : S.finishD;
    const rest = S.boats.filter((b) => !b.finished && S.results.every((r) => r.boat !== b));
    rest.sort((a, b) => (a.remote !== b.remote) ? (a.remote ? 1 : -1) : b.routeD - a.routeD);
    for (const b of rest) {
      const gapM = Math.max(0, target - (b.routeD || 0));
      const spd = Math.max(8, b._spdAvg || 0);
      S.results.push({ boat: b, time: S.time + gapM / spd, projected: true, gapM });
    }
  }

  // ---------- the start ----------
  // holdSince = seconds BEFORE GO at which the player's throttle went down and has stayed down
  // (negative once racing); null while it is up. Input.throttle is the damped key/thumb/trigger
  // value, so 0.25 reads ~50 ms after the press.
  function startWatch() {
    if (S.mp || !S.player || !RR.Input) return;
    const down = (RR.Input.throttle || 0) > 0.25;
    if (!down) { S.startHoldSince = null; return; }
    if (S.startHoldSince == null) S.startHoldSince = S.phase === 'countdown' ? S.countdownT : -S.time;
  }
  function startVerdict(t) {
    if (S.startVerdict != null) return;
    if (S.mp || !S.player) { S.startVerdict = 'none'; return; }
    const h = S.startHoldSince;
    if (h != null && h > 0.6) {                                   // sat on the throttle: prop spins, boat waits
      S.startVerdict = 'jump'; S.player.resetLock = 0.5;
      if (RACE.onJumpStart) RACE.onJumpStart();
    } else if (h != null && h <= 0.25) {                          // +/-0.25 s of GO: the kick, no tank spent
      S.startVerdict = 'perfect'; S.player.boostKickT = 1.0;
      if (RACE.onPerfectStart) RACE.onPerfectStart();
    } else if (h != null || t > 0.25) {                           // early but honest, or simply late
      S.startVerdict = 'none';
    }
  }

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
    if (S.boostGateMat) S.boostGateMat.offset.y = -(t * 0.55) % 1;  // the water chevrons run the way through
    // the ring is the per-gate state light: pulsing green = open, blown out = you just took it,
    // dark = already banked this lap
    const gates = S.boostGates;
    if (gates) {
      const lap = S.player ? (S.player.lap || 0) : 0;
      const dt = Math.min(0.1, Math.max(0, t - (S._gateT == null ? t : S._gateT)));
      S._gateT = t;
      for (let i = 0; i < gates.length; i++) {
        const g = gates[i], r = g.ring;
        if (!r) continue;
        if (g.hitT > 0) {
          g.hitT = Math.max(0, g.hitT - dt);
          const k = 1 - g.hitT / 0.55;
          r.scale.setScalar(1 + k * 2.4);
          r.material.opacity = 0.95 * (1 - k);
        } else if (g.lastLap === lap) {
          r.scale.setScalar(1);
          r.material.opacity = 0.10;                                // spent until the next lap
        } else {
          const p = 0.5 + 0.5 * Math.sin(t * 3.6 - i * 0.7);
          r.scale.setScalar(1 + p * 0.13);
          r.material.opacity = 0.34 + p * 0.42;
        }
      }
    }
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
  // come back to a standings table that remembers — including WHO you were racing and what they
  // did in each round. RACE.cupBoard() is the whole bracket in one object; the UI renders it.
  RACE.CUP_ROUNDS = ['mainstem', 'southbranch', 'riverrun', 'lakecircuit'];
  RACE.CUP_POINTS = [10, 8, 6, 4, 3, 2];

  // A championship needs a FIELD, not five anonymous boats: the same rivals have to come back for
  // round two under the same names. The roster is drawn once at cupBegin and stored with the cup,
  // so it survives every reload. (ai.js keeps its own list for one-off races; if it ever exports
  // one we use that instead of this copy.)
  const CUP_RIVAL_NAMES = ['“Wacker” Wade', 'Lou Canal', 'Stella Skyline', 'Deep Dish Dre',
    'Goose Island Gus', 'El Tracks Elena', 'Marina Mae', 'Bridgeport Bo',
    'Pilsen Pearl', 'Bubbly Creek Benny', 'Lockport Lucia', 'Calumet Cal'];

  function drawField(n, seed) {
    const pool = ((RR.AI && RR.AI.NAMES) || CUP_RIVAL_NAMES).slice();
    const rng = U().mulberry(seed >>> 0);                 // mulberry, never Math.random: the field
    for (let i = pool.length - 1; i > 0; i--) {           // is game state and has to reload identically
      const j = Math.floor(rng() * (i + 1));
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    const names = ['YOU'];
    for (let i = 1; i < n; i++) names.push(pool[(i - 1) % pool.length]);
    return names;
  }

  function cupLoad() {
    try {
      const raw = localStorage.getItem('rr_cup');
      const c = raw ? JSON.parse(raw) : null;
      if (c && typeof c.round === 'number' && Array.isArray(c.points)) return cupMigrate(c);
    } catch (e) { /* file:// storage may be unavailable — fine */ }
    return null;
  }
  // A cup saved by an older build has points and nothing else. Give it a roster and an empty
  // per-round table rather than dropping the player's championship on the floor.
  function cupMigrate(c) {
    if (!Array.isArray(c.names) || c.names.length !== c.points.length) {
      c.names = drawField(c.points.length, 0x9E3779B9 ^ ((c.hull | 0) * 2654435761));
    }
    if (!Array.isArray(c.rounds)) c.rounds = [];
    c.rounds.length = RACE.CUP_ROUNDS.length;
    return c;
  }
  function cupSave(c) {
    try { localStorage.setItem('rr_cup', JSON.stringify(c)); } catch (e) { /* fine */ }
  }

  let cupState = null;
  RACE.cup = () => cupState || (cupState = cupLoad());

  RACE.cupBegin = function (hull, diff, fieldSize) {
    const n = fieldSize || 6;
    cupState = {
      round: 0, done: false, hull: hull | 0, diff: diff == null ? 1 : diff,
      points: new Array(n).fill(0),
      names: drawField(n, (Date.now() ^ ((hull | 0) * 2654435761)) >>> 0),
      rounds: new Array(RACE.CUP_ROUNDS.length).fill(null),
    };
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
  // main.js reads these when it builds the field, so the boats on the water carry the same names
  // the standings table shows, and the whole championship runs at the difficulty it began at.
  RACE.cupFieldNames = function () { const c = RACE.cup(); return c && !c.done ? c.names.slice() : null; };
  RACE.cupDifficulty = function () { const c = RACE.cup(); return c && !c.done ? c.diff : null; };

  // results = the array RACE.onRaceOver hands out, finishing order first. Player is index 0 of
  // the boats array, so standings are keyed by that index and survive a page reload.
  RACE.cupRecord = function (results) {
    const c = RACE.cup();
    if (!c || !S) return null;
    cupMigrate(c);
    const rIdx = Math.min(c.round, RACE.CUP_ROUNDS.length - 1);
    const n = c.points.length;
    // `est` marks a projected time (the boat was still on the water when the card opened), so the
    // bracket can print it as an estimate rather than pass it off as a crossing
    const row = { course: RACE.CUP_ROUNDS[rIdx], pos: new Array(n).fill(0), pts: new Array(n).fill(0), time: new Array(n).fill(null), est: new Array(n).fill(0) };
    for (let i = 0; i < results.length; i++) {
      const idx = S.boats.indexOf(results[i].boat);
      if (idx < 0) continue;
      while (c.points.length <= idx) { c.points.push(0); c.names.push('RIVAL ' + idx); }
      const p = RACE.CUP_POINTS[Math.min(i, RACE.CUP_POINTS.length - 1)];
      c.points[idx] += p;
      row.pos[idx] = i + 1;
      row.pts[idx] = p;
      row.time[idx] = isFinite(results[i].time) ? results[i].time : null;
      row.est[idx] = results[i].projected ? 1 : 0;
      const nm = results[i].boat.isPlayer ? 'YOU' : results[i].boat.pilotName;
      if (nm) c.names[idx] = nm;
    }
    c.rounds[rIdx] = row;
    c.round++;
    c.done = c.round >= RACE.CUP_ROUNDS.length;
    cupSave(c);
    return c;
  };

  // Ordered standings. Ties break on the better record — wins first, then best single finish —
  // and only then on the player, because "level on points" is not a placing.
  function standingsOf(c) {
    const R = RACE.CUP_ROUNDS.length;
    const rows = c.names.map((name, k) => {
      const perRound = [], perRoundPts = [];
      let wins = 0, best = 99, rounds = 0;
      for (let i = 0; i < R; i++) {
        const r = c.rounds[i];
        const pos = r && r.pos[k] ? r.pos[k] : null;
        perRound.push(pos);
        perRoundPts.push(pos ? (r.pts[k] || 0) : null);   // null = did not take part, not "zero points"
        if (pos) { rounds++; if (pos === 1) wins++; if (pos < best) best = pos; }
      }
      return { idx: k, name, isPlayer: k === 0, pts: c.points[k] || 0, perRound, perRoundPts, wins, rounds, best: best === 99 ? null : best };
    });
    rows.sort((a, b) => (b.pts - a.pts) || (b.wins - a.wins) ||
      ((a.best || 99) - (b.best || 99)) || (a.isPlayer ? -1 : b.isPlayer ? 1 : a.idx - b.idx));
    const top = rows.length ? rows[0].pts : 0;
    rows.forEach((s, i) => { s.pos = i + 1; s.gap = top - s.pts; });
    return rows;
  }

  RACE.cupStandings = function () {
    const c = RACE.cup();
    if (!c) return [];
    cupMigrate(c);
    return standingsOf(c);
  };

  // Everything a standings screen needs, in one call. See the shape in the README of this section:
  //   { rounds[4], current, roundsDone, total, done, standings[], points[], fieldSize,
  //     leader, player, champion, hull, diff }
  RACE.cupBoard = function () {
    const c = RACE.cup();
    if (!c) return null;
    cupMigrate(c);
    const standings = standingsOf(c);
    const rounds = RACE.CUP_ROUNDS.map((id, i) => {
      const course = RACE.COURSES.find((x) => x.id === id) || null;
      const row = c.rounds[i] || null;
      const results = row ? c.names.map((name, k) => ({
        idx: k, name, isPlayer: k === 0, pos: row.pos[k] || null, pts: row.pts[k] || 0, time: row.time[k],
        projected: !!(row.est && row.est[k]),                   // old saves have no est: never projected
      })).filter((r) => r.pos).sort((a, b) => a.pos - b.pos) : [];
      return {
        idx: i, id, name: course ? course.name : id.toUpperCase(),
        desc: course ? course.desc : '', laps: course ? course.laps : 1,
        courseIdx: course ? RACE.COURSES.indexOf(course) : -1,
        state: row ? 'done' : (i === c.round ? 'current' : 'upcoming'),
        winner: results.length ? results[0] : null,
        results,
      };
    });
    return {
      rounds, total: RACE.CUP_ROUNDS.length, roundsDone: Math.min(c.round, RACE.CUP_ROUNDS.length),
      current: c.done ? -1 : c.round, done: !!c.done,
      standings, points: RACE.CUP_POINTS.slice(), fieldSize: c.points.length,
      leader: standings[0] || null,
      player: standings.find((s) => s.isPlayer) || null,
      champion: c.done ? (standings[0] || null) : null,
      hull: c.hull, diff: c.diff,
    };
  };

  RACE.isTour = () => !!(S && S.tour);
  RACE.isTimeTrial = () => !!(S && S.timeTrial);

  RR.Race = RACE;
})();

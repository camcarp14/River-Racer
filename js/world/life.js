/* River Racer — a living city: instanced pedestrians & cyclists strolling the
   riverwalk promenades, and cars crossing the bridges. All GPU-instanced. */
(function () {
  const LIFE = {};
  const U = () => RR.U;
  // deck height comes from riverwalk.js — W3 dropped it 1.5 → 1.1 (CHICAGO §3.2) and a
  // hard-coded copy here left every pedestrian standing 0.4 m in the air.
  const PY = () => (RR.Riverwalk && RR.Riverwalk.PY != null ? RR.Riverwalk.PY : 1.1);

  let people, body, bags, peopleData = [], nWalk = 0;
  let bagOf = null;               // instance index → bag instance index, or -1
  let bikes, bikeData = [];
  let cars, carData = [];
  let riverCraft = [];
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
  const _up = new THREE.Vector3(0, 1, 0);

  // ---------- ART rule 6: a person has limbs and a colour break at the waist ----------
  // Three instanced meshes carry three independent per-person colours through instanceColor:
  // SHIRT (torso + sleeves), BODY (head = skin tone, with the trousers baked dark into the
  // vertex colours so they land neutral whatever the face is), and BAG (a bright accent, only
  // for the half that carry one). 90 tris a figure, and the geometry is built exactly once.
  const FIG = { legs: 0x39404e, sleeve: 0xe6e6e6 };
  function figParts(rng) {
    const T = (g, hex) => { RR.City.tintGeom(g, hex, 0, rng); return g; };
    const shirt = [], skin = [], bag = [];
    for (const s of [-1, 1]) {
      const leg = new THREE.BoxGeometry(0.16, 0.75, 0.16);
      leg.translate(s * 0.105, 0.375, 0);
      skin.push(T(leg, FIG.legs));
      const arm = new THREE.BoxGeometry(0.13, 0.55, 0.13);
      arm.translate(0, -0.275, 0);                 // hang from the shoulder joint
      arm.rotateZ(-s * 0.14);                      // 8° out from the body
      arm.translate(s * 0.235, 1.32, 0);
      shirt.push(T(arm, FIG.sleeve));
    }
    const torso = new THREE.BoxGeometry(0.42, 0.62, 0.24);
    torso.translate(0, 1.06, 0);
    shirt.push(T(torso, 0xffffff));
    const head = new THREE.SphereGeometry(0.13, 5, 4);
    head.translate(0, 1.50, 0);
    skin.push(T(head, 0xffffff));
    const sack = new THREE.BoxGeometry(0.26, 0.30, 0.13);
    sack.translate(0.33, 0.66, 0.02);              // swinging off the right hand
    bag.push(T(sack, 0xffffff));
    return { shirt, skin, bag };
  }
  function mergedFigure() {                        // solid one-colour figure (kayakers, etc.)
    const f = figParts(U().mulberry(1871));
    return RR.City.mergeGeoms(f.shirt.concat(f.skin));
  }
  function mergedBike() {
    const parts = [];
    for (const z of [-0.5, 0.5]) { const wgeo = new THREE.TorusGeometry(0.33, 0.06, 5, 10); wgeo.rotateY(Math.PI / 2); wgeo.translate(0, 0.33, z); parts.push(wgeo); }
    const frame = new THREE.BoxGeometry(0.1, 0.1, 1.0); frame.translate(0, 0.5, 0); parts.push(frame);
    const bar = new THREE.BoxGeometry(0.1, 0.4, 0.1); bar.translate(0, 0.7, 0.45); parts.push(bar);
    return RR.City.mergeGeoms(parts);
  }
  function mergedCar() {
    const parts = [];
    const body = new THREE.BoxGeometry(1.9, 0.9, 4.2); body.translate(0, 0.75, 0); parts.push(body);
    const cabin = new THREE.BoxGeometry(1.7, 0.7, 2.2); cabin.translate(0, 1.45, -0.1); parts.push(cabin);
    for (const sx of [-1, 1]) for (const sz of [-1.3, 1.3]) { const w = new THREE.CylinderGeometry(0.34, 0.34, 0.2, 6); w.rotateZ(Math.PI / 2); w.translate(sx * 0.95, 0.34, sz); parts.push(w); }
    return RR.City.mergeGeoms(parts);
  }

  const SHIRTS = [0xcf4436, 0x3f6fb0, 0x4a8a52, 0xdedad0, 0x8a5a9c, 0xe0a53a, 0x37474f, 0xd06a9a, 0x2f8f8f, 0xb0483a];
  const SKINS = [0xe8bd94, 0xd9a271, 0xb37a4e, 0x8a5a35, 0x6b4128, 0xf0cba6];
  const ACCENT = [0xe4392e, 0xf2c230, 0x2e8fd4, 0x2f6b4a, 0xf1efe8];
  const CARS = [0xd8d8dc, 0x2b2f36, 0xb0342a, 0x2f5aa0, 0xe0c030, 0x5a6068, 0x9aa0a6, 0x8a2f2f];

  LIFE.init = function () {
    const scene = RR.Engine.scene;
    const C = window.CHICAGO;
    const rng = U().mulberry(24601);
    const openX = C.lake.openWaterX;

    // over ANY channel's water (its own included — a constant offset can curl back into the
    // channel on a concave bend, which is exactly how a stroller ended up standing on the river)
    function overWater(x, z) {
      for (const key in RR.River.paths) {
        const q = U().pathNearest(RR.River.paths[key], x, z);
        if (q.dist < q.w + 0.5) return true;
      }
      return false;
    }

    // A walker's patrol is a fixed offset off one centreline, and that offset folds back over
    // the channel wherever the river bends hard — at Wolf Point it walked strollers sixteen
    // metres out into the South Branch. So bake the answer once: for each bank and side, sample
    // which stretches of promenade are genuinely dry, and clip every walker's patrol to the dry
    // run it starts in. One boolean array per bank replaces a per-frame nearest-point test on
    // ~900 figures, and the test it replaces could not see a neighbouring channel at all.
    const SEG = 6;
    function dryMask(p, s) {
      const n = Math.ceil(p.len / SEG) + 1;
      const ok = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const a = U().pathAt(p, Math.min(i * SEG, p.len), {});
        let good = 1;
        for (const o of [2.2, 5.5, 8.4]) {                        // the width the walkers use
          const x = a.x + (-a.tz) * (a.w + o) * s, z = a.z + a.tx * (a.w + o) * s;
          if (x > openX - 8 || overWater(x, z)) { good = 0; break; }
        }
        ok[i] = good;
      }
      return ok;
    }

    // ---------- distribute walkers + cyclists along the promenades ----------
    const walkers = [], statics = [], cyclists = [];
    for (const key in RR.River.paths) {
      if (key.startsWith('lake')) continue;
      const p = RR.River.paths[key];
      const masks = [dryMask(p, -1), dryMask(p, 1)];
      const density = key === 'main' ? 3.0 : 1.4;                 // people per ~40m of bank
      const count = Math.floor((p.len / 40) * density);
      for (let i = 0; i < count; i++) {
        for (const s of [-1, 1]) {
          let d = rng() * p.len;
          const off = 2 + rng() * 6.2;                            // across the promenade
          const mask = masks[s > 0 ? 1 : 0];
          const mi = Math.min(mask.length - 1, Math.round(d / SEG));
          if (!mask[mi]) continue;
          let lo = mi, hi = mi;                                   // the dry run this walker is in
          while (lo > 0 && mask[lo - 1]) lo--;
          while (hi < mask.length - 1 && mask[hi + 1]) hi++;
          const d0 = lo * SEG + 4, d1 = Math.min(p.len, hi * SEG) - 4;
          if (d1 - d0 < 10) continue;
          d = U().clamp(d, d0, d1);
          const isBike = rng() < 0.14;
          const w = { p, key, s, d, d0, d1, off, dir: rng() < 0.5 ? 1 : -1, spd: isBike ? 5 + rng() * 3 : 1.1 + rng() * 0.8,
                      col: SHIRTS[(rng() * SHIRTS.length) | 0], skin: SKINS[(rng() * SKINS.length) | 0],
                      acc: rng() < 0.5 ? ACCENT[(rng() * ACCENT.length) | 0] : 0,
                      sc: 0.93 + rng() * 0.14, ph: rng() * 9, bike: isBike };
          (isBike ? cyclists : walkers).push(w);
        }
      }
    }
    // static knots of people at a few main-stem spots (near the rooms)
    const main = RR.River.paths.main;
    for (let d = 40; d < main.len - 40; d += 70) {
      for (const s of [-1, 1]) {
        const a = U().pathAt(main, d, {});
        for (let k = 0; k < 4 + (rng() * 5 | 0); k++) {
          const off = 2.5 + rng() * 5, dd = d + (rng() - 0.5) * 20;
          const b = U().pathAt(main, dd, {});
          const x = b.x + (-b.tz) * (b.w + off) * s, z = b.z + b.tx * (b.w + off) * s;
          if (x > openX - 8 || overWater(x, z)) continue;
          statics.push({ x, z, yaw: rng() * 6.28, col: SHIRTS[(rng() * SHIRTS.length) | 0],
                         skin: SKINS[(rng() * SKINS.length) | 0],
                         acc: rng() < 0.5 ? ACCENT[(rng() * ACCENT.length) | 0] : 0,
                         sc: 0.93 + rng() * 0.14 });
        }
      }
    }

    nWalk = walkers.length + cyclists.length;
    const total = nWalk + statics.length;
    const fig = figParts(rng);
    const shirtMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    people = new THREE.InstancedMesh(RR.City.mergeGeoms(fig.shirt), shirtMat, total);
    body = new THREE.InstancedMesh(RR.City.mergeGeoms(fig.skin),
      new THREE.MeshLambertMaterial({ vertexColors: true }), total);
    const bagGeo = RR.City.mergeGeoms(fig.bag);
    peopleData = walkers.concat(cyclists);
    const all = peopleData.concat(statics);
    bagOf = new Int32Array(total).fill(-1);
    let nBags = 0;
    for (let i = 0; i < all.length; i++) if (all[i].acc) bagOf[i] = nBags++;
    bags = new THREE.InstancedMesh(bagGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), Math.max(1, nBags));
    for (const m of [people, body, bags]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.layers.set(1);
      scene.add(m);
    }
    people.castShadow = true; body.castShadow = true;
    for (let i = 0; i < all.length; i++) {
      people.setColorAt(i, new THREE.Color(all[i].col));
      body.setColorAt(i, new THREE.Color(all[i].skin));
      if (bagOf[i] >= 0) bags.setColorAt(bagOf[i], new THREE.Color(all[i].acc));
    }
    // the idlers never move: place them once and let the per-frame loop skip them entirely
    for (let i = 0; i < statics.length; i++) {
      const st = statics[i], idx = nWalk + i;
      _q.setFromAxisAngle(_up, st.yaw); _p.set(st.x, PY(), st.z); _s.setScalar(st.sc);
      _m.compose(_p, _q, _s);
      people.setMatrixAt(idx, _m); body.setMatrixAt(idx, _m);
      if (bagOf[idx] >= 0) bags.setMatrixAt(bagOf[idx], _m);
    }
    _s.setScalar(1);
    for (const m of [people, body, bags]) if (m.instanceColor) m.instanceColor.needsUpdate = true;

    // cyclists get bikes (same transforms, updated together)
    bikes = new THREE.InstancedMesh(mergedBike(), new THREE.MeshLambertMaterial({ color: 0x2a2f36 }), Math.max(1, cyclists.length));
    bikes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    bikeData = cyclists;
    bikes.layers.set(1);
    scene.add(bikes);

    // ---------- cars crossing every (non-raised) bridge ----------
    const carList = [];
    for (const b of C.bridges) {
      if (b.kind === 'railraised') continue;
      const p = RR.River.paths[b.branch];
      const q = U().pathNearest(p, b.x, b.z);
      const ax = -q.tz, az = q.tx;                                // across-channel axis
      const half = q.w;
      // if this is an animated bascule, cars must wait at the barrier while it's open
      let gate = null;
      if (RR.Bridges && RR.Bridges.openings) {
        for (const o of RR.Bridges.openings) if (U().dist2(o.x, o.z, q.x, q.z) < 100) gate = o;
      }
      for (let lane = 0; lane < 2; lane++) {
        for (let n = 0; n < 2; n++) {
          carList.push({ cx: q.x, cz: q.z, ax, az, tx: q.tx, tz: q.tz, half, gate,
            lane: lane === 0 ? 2.4 : -2.4, dir: lane === 0 ? 1 : -1,
            u: (rng() * 2 - 1) * half, y: b.clearance + 2.15, spd: 7 + rng() * 5,
            col: CARS[(rng() * CARS.length) | 0] });
        }
      }
    }
    // Lake Shore Drive through-traffic: cars streaming the full viaduct, crossing the Link Bridge
    for (let n = 0; n < 14; n++) {
      const dir = n % 2 ? 1 : -1;
      carList.push({ cx: 1359, cz: 0, ax: 0, az: 1, tx: 1, tz: 0, half: 900,
        lane: dir === 1 ? 3.1 : -3.1, dir,
        u: (rng() * 2 - 1) * 900, y: 9.5 + 2.15, spd: 14 + rng() * 6,
        col: CARS[(rng() * CARS.length) | 0] });
    }
    cars = new THREE.InstancedMesh(mergedCar(), new THREE.MeshLambertMaterial({}), Math.max(1, carList.length));
    cars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    cars.castShadow = true;
    carData = carList;
    for (let i = 0; i < carList.length; i++) cars.setColorAt(i, new THREE.Color(carList[i].col));
    if (cars.instanceColor) cars.instanceColor.needsUpdate = true;
    cars.layers.set(1);
    scene.add(cars);

    // ---------- live river traffic: taxis, a tour boat, kayakers you weave past ----------
    riverCraft = [];
    const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
    // seated torso+head riders merged into ONE vertex-colored mesh per craft.
    // list: [{x,y,z,col,yaw}] with y = seat surface
    function paxMesh(list) {
      const parts = [];
      for (const p of list) {
        const t = RR.City.tintGeom(new THREE.BoxGeometry(0.36, 0.52, 0.26), p.col, 0.15, rng);
        if (p.yaw) t.rotateY(p.yaw);
        t.translate(p.x, p.y + 0.26, p.z); parts.push(t);
        const h = RR.City.tintGeom(new THREE.SphereGeometry(0.14, 6, 5), 0xc9946a, 0.2, rng);
        h.translate(p.x, p.y + 0.62, p.z); parts.push(h);
      }
      return new THREE.Mesh(RR.City.mergeGeoms(parts), RR.City.flatMaterial());
    }
    function craftMesh(kind) {
      const g = new THREE.Group();
      if (kind === 'kayak') {
        const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 5.0, 8),
          mat([0xe0a53a, 0x36a852, 0xd8412f, 0x2f6ec0][(rng() * 4) | 0]));
        hull.rotation.z = Math.PI / 2;
        const hp = hull.geometry.attributes.position;              // pinch both ends to points
        for (let i = 0; i < hp.count; i++) { const ax = Math.abs(hp.getX(i)); if (ax > 2.0) { const k = 1 - (ax - 2.0) / 0.6 * 0.9; hp.setY(i, hp.getY(i) * k); hp.setZ(i, hp.getZ(i) * k); } }
        hull.geometry.computeVertexNormals(); hull.scale.y = 0.55; hull.position.y = 0.28; g.add(hull);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.06, 5, 10), mat(0x20242a));
        rim.rotation.x = Math.PI / 2; rim.position.set(0.3, 0.42, 0); g.add(rim);       // cockpit rim
        const fig = new THREE.Mesh(mergedFigure(), mat(0xdedad0));
        fig.scale.set(0.75, 0.62, 0.75); fig.position.set(0.3, 0.30, 0); g.add(fig);
        const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.6), mat(0x6b4a2a));
        paddle.rotation.x = 0.35; paddle.position.set(0.3, 0.95, 0); g.add(paddle);
      } else if (kind === 'taxi') {
        // Chicago Water Taxi — low bright-yellow commuter ferry, black trim, enclosed cabin
        const L = 11, W = 4;
        const hull = new THREE.Mesh(new THREE.BoxGeometry(W, 1.6, L), mat(0xf2c200));
        const hp = hull.geometry.attributes.position;
        for (let i = 0; i < hp.count; i++) { if (Math.abs(hp.getZ(i)) > L * 0.42) hp.setX(i, hp.getX(i) * 0.4); }
        hull.geometry.computeVertexNormals(); hull.position.y = 0.55; g.add(hull);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(W + 0.06, 0.34, L - 1.2), mat(0x141414)); stripe.position.y = 1.28; g.add(stripe);
        // cabin: solid sill + header with a see-through window band between them
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, 0.62, L - 3.2), mat(0xf2c200)); cabin.position.set(0, 1.81, -0.4); g.add(cabin);
        const header = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, 0.28, L - 3.2), mat(0xf2c200)); header.position.set(0, 2.86, -0.4); g.add(header);
        const win = new THREE.Mesh(new THREE.BoxGeometry(W - 0.56, 0.62, L - 3.26),
          new THREE.MeshLambertMaterial({ color: 0x10202b, transparent: true, opacity: 0.55 }));
        win.position.set(0, 2.42, -0.4); g.add(win);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(W - 0.3, 0.18, L - 3.0), mat(0x141414)); roof.position.set(0, 3.05, -0.4); g.add(roof);
        // helmsman silhouette behind the windscreen + commuters, heads in the glass band
        const pax = [{ x: 0.85, y: 1.88, z: 2.75, col: 0x23303a, yaw: 0 }];
        for (let i = 0, n = 3 + (rng() * 2 | 0); i < n; i++)
          pax.push({ x: (i % 2 ? -1 : 1) * (0.55 + rng() * 0.55), y: 1.85, z: -2.3 + i * 1.35,
            col: SHIRTS[(rng() * SHIRTS.length) | 0], yaw: (rng() - 0.5) * 0.6 });
        g.add(paxMesh(pax));
      } else {
        // Wendella architecture tour boat — WHITE hull, blue trim, windowed lower lounge,
        // open upper deck of seats under a canopy, forward wheelhouse
        const L = 23, W = 6;
        const hull = new THREE.Mesh(new THREE.BoxGeometry(W, 1.7, L), mat(0xf1efe7));
        const hp = hull.geometry.attributes.position;
        for (let i = 0; i < hp.count; i++) { if (Math.abs(hp.getZ(i)) > L * 0.42) hp.setX(i, hp.getX(i) * 0.4); }
        hull.geometry.computeVertexNormals(); hull.position.y = 0.6; g.add(hull);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(W + 0.06, 0.4, L - 1.4), mat(0x1b4f92)); stripe.position.y = 1.35; g.add(stripe);
        const lounge = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, 1.3, L - 4.5), mat(0xeceae2)); lounge.position.set(0, 2.2, -0.3); g.add(lounge);
        const lwin = new THREE.Mesh(new THREE.BoxGeometry(W - 0.44, 0.55, L - 5), mat(0x14252f)); lwin.position.set(0, 2.25, -0.3); g.add(lwin);
        const upper = new THREE.Mesh(new THREE.BoxGeometry(W - 0.6, 0.22, L - 4.5), mat(0xdedad0)); upper.position.set(0, 3.0, -0.3); g.add(upper);
        const pax = [];
        for (let zz = -L * 0.32; zz <= L * 0.28; zz += 1.6) {
          const bench = new THREE.Mesh(new THREE.BoxGeometry(W - 1.2, 0.35, 0.5), mat(0x27548f)); bench.position.set(0, 3.35, zz); g.add(bench);
          // sightseers: mostly facing forward, a few twisted toward the banks
          for (const sx of [-1, 1]) if (pax.length < 16 && rng() < 0.85)
            pax.push({ x: sx * (0.5 + rng() * 1.35), y: 3.53, z: zz + 0.05,
              col: SHIRTS[(rng() * SHIRTS.length) | 0],
              yaw: rng() < 0.18 ? (rng() < 0.5 ? 1.5 : -1.5) : (rng() - 0.5) * 0.5 });
        }
        g.add(paxMesh(pax));
        const awn = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, 0.14, L - 8), mat(0x2a5aa0)); awn.position.set(0, 4.5, -0.3); g.add(awn);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 5), mat(0xd7d3c8));
          p.position.set(sx * (W / 2 - 0.6), 3.75, sz * ((L - 8) / 2 - 0.5)); g.add(p);
        }
        const house = new THREE.Mesh(new THREE.BoxGeometry(W - 1.6, 1.1, 2.4), mat(0xeceae2)); house.position.set(0, 3.6, -L * 0.34); g.add(house);
        const hwin = new THREE.Mesh(new THREE.BoxGeometry(W - 1.5, 0.5, 2.5), mat(0x14252f)); hwin.position.set(0, 3.75, -L * 0.34); g.add(hwin);
      }
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.layers.set(1); } });
      RR.Engine.scene.add(g);
      return g;
    }
    const traffic = [
      { key: 'main', kind: 'tour', off: 0.45, spd: 6, dir: 1 },
      { key: 'main', kind: 'tour', off: -0.5, spd: 5, dir: -1 },
      { key: 'main', kind: 'taxi', off: -0.55, spd: 9, dir: 1 },
      { key: 'main', kind: 'taxi', off: 0.55, spd: 8, dir: -1 },
      { key: 'main', kind: 'kayak', off: -0.62, spd: 2.5, dir: 1 },
      { key: 'main', kind: 'kayak', off: -0.66, spd: 2.5, dir: 1 },
      { key: 'south', kind: 'tour', off: 0.4, spd: 6, dir: 1 },
      { key: 'south', kind: 'taxi', off: -0.5, spd: 8, dir: -1 },
      { key: 'north', kind: 'taxi', off: -0.5, spd: 8, dir: -1 },
    ];
    for (const t of traffic) {
      const p = RR.River.paths[t.key]; if (!p) continue;
      const big = t.kind !== 'kayak';
      let obst = null, seg = null, halfLen = 0;
      if (big) {
        const L = t.kind === 'tour' ? 23 : 11, W = t.kind === 'tour' ? 6 : 4;
        halfLen = L * 0.44;                                            // reach the tapered bow/stern
        seg = { ax: 0, az: 0, bx: 0, bz: 0, pad: W * 0.5 + 0.6 };      // moving capsule; hitObstacle resolves it as one
        RR.River.walls.push(seg);
      } else {
        obst = { x: 0, z: 0, r: 1.5 };
        RR.River.obstacles.push(obst);
      }
      riverCraft.push({ g: craftMesh(t.kind), p, d: rng() * p.len, off: t.off, spd: t.spd, dir: t.dir, ph: rng() * 9, obst, seg, halfLen });
    }

    LIFE.craft = riverCraft;                 // main.js reads this for the passing-wake rock
    LIFE._ready = true;
  };

  LIFE.update = function (dt, t) {
    if (!LIFE._ready) return;
    const bp = {};
    // pedestrians + cyclists
    for (let i = 0; i < peopleData.length; i++) {
      const w = peopleData[i];
      w.d += w.spd * w.dir * dt;
      // patrol bounds were baked at init to the dry run of promenade this walker started in
      if (w.d > w.d1) { w.d = w.d1; w.dir = -1; }
      else if (w.d < w.d0) { w.d = w.d0; w.dir = 1; }
      const a = U().pathAt(w.p, w.d, bp);
      const nx = -a.tz, nz = a.tx;
      const x = a.x + nx * (a.w + w.off) * w.s, z = a.z + nz * (a.w + w.off) * w.s;
      const yaw = Math.atan2(a.tx * w.dir, a.tz * w.dir);
      const bob = w.bike ? 0 : Math.abs(Math.sin(t * 6 + w.ph)) * 0.06;
      _q.setFromAxisAngle(_up, yaw); _p.set(x, PY() + bob, z); _s.setScalar(w.sc);
      _m.compose(_p, _q, _s);
      people.setMatrixAt(i, _m); body.setMatrixAt(i, _m);
      if (bagOf[i] >= 0) bags.setMatrixAt(bagOf[i], _m);
    }
    _s.setScalar(1);
    people.instanceMatrix.needsUpdate = true;
    body.instanceMatrix.needsUpdate = true;
    bags.instanceMatrix.needsUpdate = true;

    // bikes ride under their cyclist
    for (let i = 0; i < bikeData.length; i++) {
      const w = bikeData[i];
      const a = U().pathAt(w.p, w.d, bp);
      const nx = -a.tz, nz = a.tx;
      const x = a.x + nx * (a.w + w.off) * w.s, z = a.z + nz * (a.w + w.off) * w.s;
      const yaw = Math.atan2(a.tx * w.dir, a.tz * w.dir);
      _q.setFromAxisAngle(_up, yaw); _p.set(x, PY(), z);
      _m.compose(_p, _q, _s); bikes.setMatrixAt(i, _m);
    }
    bikes.instanceMatrix.needsUpdate = true;

    // cars
    for (let i = 0; i < carData.length; i++) {
      const c = carData[i];
      let du = c.spd * c.dir * dt;
      if (c.gate && (c.gate.warn || c.gate.open > 0.02)) {
        if (Math.abs(c.u) < c.half + 1.5) {
          du *= 2.6;                                               // caught on the span — floor it
          if (c.gate.open > 0.12) c.u = c.dir * (c.half + 2.0);    // leaves lifting: it made the far side
        } else if (c.dir * c.u < 0 && Math.abs(c.u + du) < c.half + 4.5) {
          du = 0;                                                  // approaching — wait at the barrier
        }
      }
      c.u += du;
      if (c.u > c.half + 8) c.u = -(c.half + 8);
      else if (c.u < -(c.half + 8)) c.u = c.half + 8;
      const x = c.cx + c.ax * c.u + c.tx * c.lane, z = c.cz + c.az * c.u + c.tz * c.lane;
      const yaw = Math.atan2(c.ax * c.dir, c.az * c.dir);
      _q.setFromAxisAngle(_up, yaw); _p.set(x, c.y, z);
      _m.compose(_p, _q, _s); cars.setMatrixAt(i, _m);
    }
    cars.instanceMatrix.needsUpdate = true;

    // river traffic
    for (const c of riverCraft) {
      c.d += c.spd * c.dir * dt;
      c.d = ((c.d % c.p.len) + c.p.len) % c.p.len;      // loop around the channel
      const a = U().pathAt(c.p, c.d, bp);
      const nx = -a.tz, nz = a.tx;
      const x = a.x + nx * a.w * c.off, z = a.z + nz * a.w * c.off;
      const amp = RR.River.waveAmp(x, z);
      const y = U().waterHeight(x, z, t, amp) + 0.1;
      c.g.position.set(x, y, z);
      c.g.rotation.y = Math.atan2(a.tx * c.dir, a.tz * c.dir);
      c.g.rotation.z = Math.sin(t * 0.8 + c.ph) * 0.04 * amp;
      if (c.seg) {                                       // drive the moving capsule's bow/stern endpoints
        c.seg.ax = x - a.tx * c.halfLen; c.seg.az = z - a.tz * c.halfLen;
        c.seg.bx = x + a.tx * c.halfLen; c.seg.bz = z + a.tz * c.halfLen;
      } else if (c.obst) { c.obst.x = x; c.obst.z = z; }
    }
  };

  RR.Life = LIFE;
})();

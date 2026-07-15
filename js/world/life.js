/* River Racer — a living city: instanced pedestrians & cyclists strolling the
   riverwalk promenades, and cars crossing the bridges. All GPU-instanced. */
(function () {
  const LIFE = {};
  const U = () => RR.U;
  const PY = 1.0;                 // promenade height (matches riverwalk.js)

  let people, peopleData = [], nWalk = 0;
  let bikes, bikeData = [];
  let cars, carData = [];
  let riverCraft = [];
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
  const _up = new THREE.Vector3(0, 1, 0);

  function mergedFigure() {
    const parts = [];
    const legs = new THREE.BoxGeometry(0.5, 0.9, 0.34); legs.translate(0, 0.45, 0);
    const torso = new THREE.BoxGeometry(0.56, 0.8, 0.36); torso.translate(0, 1.28, 0);
    const head = new THREE.SphereGeometry(0.2, 6, 5); head.translate(0, 1.85, 0);
    parts.push(legs, torso, head);
    return RR.City.mergeGeoms(parts);
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
  const CARS = [0xd8d8dc, 0x2b2f36, 0xb0342a, 0x2f5aa0, 0xe0c030, 0x5a6068, 0x9aa0a6, 0x8a2f2f];

  LIFE.init = function () {
    const scene = RR.Engine.scene;
    const C = window.CHICAGO;
    const rng = U().mulberry(24601);
    const openX = C.lake.openWaterX;

    function overOther(x, z, selfKey) {
      for (const key in RR.River.paths) {
        if (key.startsWith('lake') || key === selfKey) continue;
        const q = U().pathNearest(RR.River.paths[key], x, z);
        if (q.dist < q.w) return true;
      }
      return false;
    }

    // ---------- distribute walkers + cyclists along the promenades ----------
    const walkers = [], statics = [], cyclists = [];
    for (const key in RR.River.paths) {
      if (key.startsWith('lake')) continue;
      const p = RR.River.paths[key];
      const density = key === 'main' ? 3.0 : 1.4;                 // people per ~40m of bank
      const count = Math.floor((p.len / 40) * density);
      for (let i = 0; i < count; i++) {
        for (const s of [-1, 1]) {
          const d = rng() * p.len;
          const off = 2 + rng() * 6.2;                            // across the promenade
          const a = U().pathAt(p, d, {});
          const x = a.x + (-a.tz) * (a.w + off) * s, z = a.z + a.tx * (a.w + off) * s;
          if (x > openX - 8 || overOther(x, z, key)) continue;
          const isBike = rng() < 0.14;
          const w = { p, key, s, d, off, dir: rng() < 0.5 ? 1 : -1, spd: isBike ? 5 + rng() * 3 : 1.1 + rng() * 0.8,
                      col: SHIRTS[(rng() * SHIRTS.length) | 0], ph: rng() * 9, bike: isBike };
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
          if (x > openX - 8 || overOther(x, z, 'main')) continue;
          statics.push({ x, z, yaw: rng() * 6.28, col: SHIRTS[(rng() * SHIRTS.length) | 0] });
        }
      }
    }

    nWalk = walkers.length + cyclists.length;
    const total = nWalk + statics.length;
    people = new THREE.InstancedMesh(mergedFigure(), new THREE.MeshLambertMaterial({}), total);
    people.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    people.castShadow = true;
    peopleData = walkers.concat(cyclists);
    // seed walker matrices + colors
    for (let i = 0; i < peopleData.length; i++) people.setColorAt(i, new THREE.Color(peopleData[i].col));
    for (let i = 0; i < statics.length; i++) {
      const st = statics[i], idx = nWalk + i;
      _q.setFromAxisAngle(_up, st.yaw); _p.set(st.x, PY, st.z);
      _m.compose(_p, _q, _s); people.setMatrixAt(idx, _m);
      people.setColorAt(idx, new THREE.Color(st.col));
    }
    scene.add(people);

    // cyclists get bikes (same transforms, updated together)
    bikes = new THREE.InstancedMesh(mergedBike(), new THREE.MeshLambertMaterial({ color: 0x2a2f36 }), Math.max(1, cyclists.length));
    bikes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    bikeData = cyclists;
    scene.add(bikes);

    // ---------- cars crossing every (non-raised) bridge ----------
    const carList = [];
    for (const b of C.bridges) {
      if (b.kind === 'railraised') continue;
      const p = RR.River.paths[b.branch];
      const q = U().pathNearest(p, b.x, b.z);
      const ax = -q.tz, az = q.tx;                                // across-channel axis
      const half = q.w;
      for (let lane = 0; lane < 2; lane++) {
        for (let n = 0; n < 2; n++) {
          carList.push({ cx: q.x, cz: q.z, ax, az, tx: q.tx, tz: q.tz, half,
            lane: lane === 0 ? 2.4 : -2.4, dir: lane === 0 ? 1 : -1,
            u: (rng() * 2 - 1) * half, y: b.clearance + 2.15, spd: 7 + rng() * 5,
            col: CARS[(rng() * CARS.length) | 0] });
        }
      }
    }
    cars = new THREE.InstancedMesh(mergedCar(), new THREE.MeshLambertMaterial({}), Math.max(1, carList.length));
    cars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    cars.castShadow = true;
    carData = carList;
    for (let i = 0; i < carList.length; i++) cars.setColorAt(i, new THREE.Color(carList[i].col));
    scene.add(cars);

    // ---------- live river traffic: taxis, a tour boat, kayakers you weave past ----------
    riverCraft = [];
    function craftMesh(kind) {
      const g = new THREE.Group();
      if (kind === 'kayak') {
        const k = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.25, 4.6, 6),
          new THREE.MeshLambertMaterial({ color: [0xe0a53a, 0x36a852, 0xd8412f][(rng() * 3) | 0] }));
        k.rotation.z = Math.PI / 2; g.add(k);
        const fig = new THREE.Mesh(mergedFigure(), new THREE.MeshLambertMaterial({ color: 0x2f5aa0 }));
        fig.scale.set(0.8, 0.7, 0.8); fig.position.y = 0.35; g.add(fig);
      } else {
        const taxi = kind === 'taxi';
        const L = taxi ? 11 : 23, W = taxi ? 4 : 6;
        const hull = new THREE.Mesh(new THREE.BoxGeometry(W, 1.7, L),
          new THREE.MeshLambertMaterial({ color: taxi ? 0xf0c020 : 0x22508a }));
        const hp = hull.geometry.attributes.position;
        for (let i = 0; i < hp.count; i++) { if (Math.abs(hp.getZ(i)) > L * 0.4) hp.setX(i, hp.getX(i) * 0.4); }
        hull.geometry.computeVertexNormals(); hull.position.y = 0.55; g.add(hull);
        const deck = new THREE.Mesh(new THREE.BoxGeometry(W - 0.6, 0.3, L - 3), new THREE.MeshLambertMaterial({ color: 0xe8e6de }));
        deck.position.y = 1.45; g.add(deck);
        if (!taxi) {
          const can = new THREE.Mesh(new THREE.BoxGeometry(W - 0.4, 0.16, L - 6), new THREE.MeshLambertMaterial({ color: 0xcf3b2f }));
          can.position.y = 3.3; g.add(can);
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
            const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.9, 5), new THREE.MeshLambertMaterial({ color: 0x8a8f94 }));
            p.position.set(sx * (W / 2 - 0.5), 2.3, sz * (L / 2 - 3)); g.add(p);
          }
        } else {
          const cab = new THREE.Mesh(new THREE.BoxGeometry(W - 1, 1.1, 3.5), new THREE.MeshLambertMaterial({ color: 0x2b2f36 }));
          cab.position.set(0, 2.1, -1); g.add(cab);
        }
      }
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      RR.Engine.scene.add(g);
      return g;
    }
    const traffic = [
      { key: 'main', kind: 'tour', off: 0.5, spd: 6, dir: 1 },
      { key: 'main', kind: 'taxi', off: -0.55, spd: 9, dir: 1 },
      { key: 'main', kind: 'kayak', off: -0.62, spd: 2.5, dir: 1 },
      { key: 'main', kind: 'kayak', off: -0.66, spd: 2.5, dir: 1 },
      { key: 'south', kind: 'taxi', off: 0.5, spd: 8, dir: 1 },
      { key: 'north', kind: 'taxi', off: -0.5, spd: 8, dir: -1 },
    ];
    for (const t of traffic) {
      const p = RR.River.paths[t.key]; if (!p) continue;
      const obst = { x: 0, z: 0, r: t.kind === 'tour' ? 5 : t.kind === 'taxi' ? 3 : 1.5 };
      RR.River.obstacles.push(obst);
      riverCraft.push({ g: craftMesh(t.kind), p, d: rng() * p.len, off: t.off, spd: t.spd, dir: t.dir, ph: rng() * 9, obst });
    }

    LIFE._ready = true;
  };

  LIFE.update = function (dt, t) {
    if (!LIFE._ready) return;
    const bp = {};
    // pedestrians + cyclists
    for (let i = 0; i < peopleData.length; i++) {
      const w = peopleData[i];
      w.d += w.spd * w.dir * dt;
      if (w.d > w.p.len) { w.d = w.p.len; w.dir = -1; }
      else if (w.d < 0) { w.d = 0; w.dir = 1; }
      const a = U().pathAt(w.p, w.d, bp);
      const nx = -a.tz, nz = a.tx;
      const x = a.x + nx * (a.w + w.off) * w.s, z = a.z + nz * (a.w + w.off) * w.s;
      const yaw = Math.atan2(a.tx * w.dir, a.tz * w.dir);
      const bob = w.bike ? 0 : Math.abs(Math.sin(t * 6 + w.ph)) * 0.06;
      _q.setFromAxisAngle(_up, yaw); _p.set(x, PY + bob, z);
      _m.compose(_p, _q, _s); people.setMatrixAt(i, _m);
    }
    people.instanceMatrix.needsUpdate = true;
    if (people.instanceColor) people.instanceColor.needsUpdate = true;

    // bikes ride under their cyclist
    for (let i = 0; i < bikeData.length; i++) {
      const w = bikeData[i];
      const a = U().pathAt(w.p, w.d, bp);
      const nx = -a.tz, nz = a.tx;
      const x = a.x + nx * (a.w + w.off) * w.s, z = a.z + nz * (a.w + w.off) * w.s;
      const yaw = Math.atan2(a.tx * w.dir, a.tz * w.dir);
      _q.setFromAxisAngle(_up, yaw); _p.set(x, PY, z);
      _m.compose(_p, _q, _s); bikes.setMatrixAt(i, _m);
    }
    bikes.instanceMatrix.needsUpdate = true;

    // cars
    for (let i = 0; i < carData.length; i++) {
      const c = carData[i];
      c.u += c.spd * c.dir * dt;
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
      c.obst.x = x; c.obst.z = z;                        // keep the collision blob under it
    }
  };

  RR.Life = LIFE;
})();

/* River Racer — river mouth + lakefront: Chicago Harbor Lock, Navy Pier (+ Centennial
   Wheel), Chicago Harbor Lighthouse, breakwaters, Jardine plant, Streeterville shore. */
(function () {
  const LK = {};
  const U = () => RR.U;
  let rng, wheel = null;

  function boxAt(geoms, w, h, d, x, y, z, c, rotY) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rotY) g.rotateY(rotY);
    g.translate(x, y, z);
    RR.City.tintGeom(g, c, 0.05, rng);
    geoms.push(g);
  }

  LK.init = function () {
    rng = U().mulberry(31313);
    const scene = RR.Engine.scene;
    const C = window.CHICAGO;
    const lake = C.lake;
    const geoms = [];
    const GY = RR.City.GROUND_Y;

    // ---------- Chicago Harbor Lock: concrete chamber walls + gate machinery ----------
    const lock = lake.lock;
    const main = RR.River.paths.main;
    const q = U().pathNearest(main, lock.x, lock.z);
    const ldx = q.tx, ldz = q.tz;                  // channel direction at the lock
    const lperp = { x: -ldz, z: ldx };
    for (const s of [-1, 1]) {
      // chamber walls just outside the narrowed channel
      const wx = lock.x - ldx * 60 + lperp.x * (lock.w / 2 + 4) * s;
      const wz = lock.z - ldz * 60 + lperp.z * (lock.w / 2 + 4) * s;
      boxAt(geoms, 8, 4.6, lock.len + 40, wx + ldx * (lock.len / 2), 2.0, wz + ldz * (lock.len / 2), 0x9a988e, Math.atan2(ldx, ldz));
      // gate towers at both ends
      for (const e of [0, 1]) {
        const gx = lock.x + ldx * (e * lock.len - 60) + lperp.x * (lock.w / 2 + 5) * s;
        const gz = lock.z + ldz * (e * lock.len - 60) + lperp.z * (lock.w / 2 + 5) * s;
        boxAt(geoms, 6, 9, 6, gx, 4.5, gz, 0xb0aca0);
      }
    }
    // lock control house
    boxAt(geoms, 10, 7, 8, lock.x - ldx * 30 + lperp.x * (lock.w / 2 + 16), 5.5, lock.z - ldz * 30 + lperp.z * (lock.w / 2 + 16), 0xc7c2b2);

    // ---------- Streeterville / Olive Park shore north of the mouth ----------
    // ground slab from the basin west edge out to the Navy Pier root
    const slab = new THREE.BoxGeometry(320, GY + 2, 850);
    slab.translate(lake.openWaterX + 100, (GY + 2) / 2 - 2, -560);
    RR.City.tintGeom(slab, 0x7f8a6e, 0.08, rng);   // parkland green-gray
    geoms.push(slab);
    RR.River.addWall(lake.openWaterX - 40, -135, lake.openWaterX + 260, -135, 2);   // south face
    RR.River.addWall(lake.openWaterX + 260, -135, lake.openWaterX + 260, -985, 2);  // east face
    // Jardine Water Purification Plant: long low industrial block
    boxAt(geoms, lake.jardine.w, 13, lake.jardine.d, lake.jardine.x - 120, GY + 6.5, lake.jardine.z, 0xb9b4a4);

    // ---------- Navy Pier ----------
    const np = lake.navyPier;
    const pdx = np.tip.x - np.root.x, pdz = np.tip.z - np.root.z;
    const plen = Math.hypot(pdx, pdz);
    const pux = pdx / plen, puz = pdz / plen;
    const pang = Math.atan2(pux, puz);
    const pcx = (np.root.x + np.tip.x) / 2, pcz = (np.root.z + np.tip.z) / 2;
    // deck
    const deck = new THREE.BoxGeometry(np.width, 3.2, plen + 30);
    deck.rotateY(pang);
    deck.translate(pcx, 1.6, pcz);
    RR.City.tintGeom(deck, 0xb9b3a2, 0, rng);
    geoms.push(deck);
    // head house (root) — twin-towered brick
    boxAt(geoms, np.width * 0.8, 16, 60, np.root.x + pux * 40, 3.2 + 8, np.root.z + puz * 40, 0x9c5a40, pang);
    for (const s of [-1, 1]) {
      boxAt(geoms, 12, 26, 12, np.root.x + pux * 20 - puz * s * np.width * 0.32, 3.2 + 13, np.root.z + puz * 20 + pux * s * np.width * 0.32, 0xa86448, pang);
    }
    // exhibition sheds along the pier
    boxAt(geoms, np.width * 0.55, 12, plen * 0.42, pcx - pux * plen * 0.08, 3.2 + 6, pcz - puz * plen * 0.08, 0xcabfa8, pang);
    // Grand Ballroom at the tip: half-cylinder vault
    const ball = new THREE.CylinderGeometry(np.width * 0.34, np.width * 0.34, 70, 14, 1, false, 0, Math.PI);
    ball.rotateZ(Math.PI / 2);
    ball.rotateY(pang + Math.PI / 2);
    ball.translate(np.tip.x - pux * 45, 3.2 + 4, np.tip.z - puz * 45);
    RR.City.tintGeom(ball, 0xc2b490, 0, rng);
    geoms.push(ball);

    // pier collision: north face, south face, tip cap
    for (const s of [-1, 1]) {
      RR.River.addWall(
        np.root.x - puz * s * (np.width / 2 + 2), np.root.z + pux * s * (np.width / 2 + 2),
        np.tip.x - puz * s * (np.width / 2 + 2), np.tip.z + pux * s * (np.width / 2 + 2), 2.5);
    }
    RR.River.addWall(
      np.tip.x + pux * 17 - puz * (np.width / 2), np.tip.z + puz * 17 + pux * (np.width / 2),
      np.tip.x + pux * 17 + puz * (np.width / 2), np.tip.z + puz * 17 - pux * (np.width / 2), 2.5);

    // ---------- Centennial Wheel (animated — its own meshes) ----------
    const wheelDist = plen * (np.wheel && np.wheel.frac ? np.wheel.frac : 0.22);
    const wcx = np.root.x + pux * wheelDist;
    const wcz = np.root.z + puz * wheelDist;
    const wh = (np.wheel && np.wheel.h ? np.wheel.h : 60) * 0.5;
    const wheelGroup = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(wh, 1.1, 8, 36),
      new THREE.MeshStandardMaterial({ color: 0xdde3e8, roughness: 0.4, metalness: 0.3 }));
    wheelGroup.add(rim);
    const spokeMat = new THREE.MeshStandardMaterial({ color: 0xaeb6bc, roughness: 0.5 });
    for (let i = 0; i < 12; i++) {
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, wh * 2, 5), spokeMat);
      sp.rotation.z = (i / 12) * Math.PI;
      wheelGroup.add(sp);
    }
    const podMat = new THREE.MeshStandardMaterial({ color: 0x2c6fb0, roughness: 0.35 });
    const pods = [];
    for (let i = 0; i < 12; i++) {
      const pod = new THREE.Mesh(new THREE.SphereGeometry(1.9, 8, 6), podMat);
      pods.push(pod);
      wheelGroup.add(pod);
    }
    wheelGroup.position.set(wcx, 3.2 + wh + 6, wcz);
    wheelGroup.rotation.y = pang + Math.PI / 2;    // wheel plane along the pier
    scene.add(wheelGroup);
    // A-frame legs
    const legMat = new THREE.MeshStandardMaterial({ color: 0xc6ccd2, roughness: 0.5 });
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, wh + 8, 6), legMat);
      leg.position.set(wcx + pux * s * wh * 0.4, (wh + 8) / 2 + 3.2, wcz + puz * s * wh * 0.4);
      leg.rotation.z = s * 0.25;
      scene.add(leg);
    }
    wheel = { group: wheelGroup, pods, r: wh };

    // ---------- Chicago Harbor Lighthouse ----------
    const lh = lake.lighthouse;
    const lgh = [];
    boxAt(lgh, 14, 2.5, 14, lh.x, 1.2, lh.z, 0x9a988e);
    const towerG = new THREE.CylinderGeometry(2.6, 3.6, 15, 10);
    towerG.translate(lh.x, 2.5 + 7.5, lh.z);
    RR.City.tintGeom(towerG, 0xf2f0e8, 0, rng);
    lgh.push(towerG);
    const capG = new THREE.CylinderGeometry(1.9, 2.2, 3.4, 8);
    capG.translate(lh.x, 18.5, lh.z);
    RR.City.tintGeom(capG, 0xb03a2a, 0, rng);
    lgh.push(capG);
    const roofG = new THREE.ConeGeometry(2.4, 2.4, 8);
    roofG.translate(lh.x, 21.9, lh.z);
    RR.City.tintGeom(roofG, 0xb03a2a, 0, rng);
    lgh.push(roofG);
    boxAt(lgh, 8, 6, 10, lh.x + 9, 5.5, lh.z, 0xf2f0e8);   // keeper's house
    geoms.push(...lgh);
    RR.River.addObstacle(lh.x, lh.z, 12);
    // rotating beacon
    const beacon = new THREE.PointLight(0xfff2cc, 0, 260);
    beacon.position.set(lh.x, 20, lh.z);
    scene.add(beacon);
    LK._beacon = beacon;

    // ---------- breakwaters: low riprap ridges ----------
    for (const bw of lake.breakwaters) {
      const len = Math.hypot(bw.bx - bw.ax, bw.bz - bw.az);
      const angle = Math.atan2(bw.bx - bw.ax, bw.bz - bw.az);
      const mx = (bw.ax + bw.bx) / 2, mz = (bw.az + bw.bz) / 2;
      const ridge = new THREE.BoxGeometry(7, 2.6, len);
      ridge.rotateY(angle);
      ridge.translate(mx, 0.9, mz);
      RR.City.tintGeom(ridge, 0x8d8a80, 0.15, rng);
      geoms.push(ridge);
      const cap = new THREE.BoxGeometry(3.5, 1.4, len);
      cap.rotateY(angle);
      cap.translate(mx, 2.6, mz);
      RR.City.tintGeom(cap, 0xa5a296, 0.1, rng);
      geoms.push(cap);
      RR.River.addWall(bw.ax, bw.az, bw.bx, bw.bz, 4.5);
    }

    const mesh = new THREE.Mesh(RR.City.mergeGeoms(geoms), RR.City.flatMaterial());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // wheel rotation + pods hang level; lighthouse beacon pulses at dusk-ish rhythm
    RR.Engine.onUpdate((dt, t) => {
      wheel.group.rotation.x += dt * 0.12;
      const rot = wheel.group.rotation.x;
      for (let i = 0; i < wheel.pods.length; i++) {
        const a = rot + (i / wheel.pods.length) * Math.PI * 2;
        wheel.pods[i].position.set(0, Math.cos(a) * wheel.r, Math.sin(a) * wheel.r);
        wheel.pods[i].rotation.x = -rot;
      }
      LK._beacon.intensity = 1.4 + Math.sin(t * 2.4) * 1.4;
    });
  };

  RR.Lake = LK;
})();

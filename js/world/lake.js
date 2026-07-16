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
    const GY = 2.2;              // the lakefront sits near water level, not up at the downtown street grid

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

    // ---------- Pier Park deck + halls + carousel + Gateway fountain + string lights ----------
    const wheelDist = plen * (np.wheel && np.wheel.frac ? np.wheel.frac : 0.22);
    const wcx = np.root.x + pux * wheelDist, wcz = np.root.z + puz * wheelDist;
    boxAt(geoms, np.width * 0.7, 1.2, plen * 0.30, pcx - pux * plen * 0.02, 3.2 + 0.6, pcz - puz * plen * 0.02, 0x8fae86, pang); // amusement deck
    boxAt(geoms, np.width * 0.6, 13, plen * 0.20, pcx + pux * plen * 0.20, 3.2 + 6.5, pcz + puz * plen * 0.20, 0xc7b59a, pang);   // Festival Hall
    const carX = np.root.x + pux * (wheelDist + 55), carZ = np.root.z + puz * (wheelDist + 55);
    boxAt(geoms, 16, 4, 16, carX, 3.2 + 2, carZ, 0xd8cbb0);
    const canopy = new THREE.ConeGeometry(9, 5, 12); canopy.translate(carX, 3.2 + 8, carZ);
    RR.City.tintGeom(canopy, 0xcf4436, 0, rng); geoms.push(canopy);                                                            // carousel canopy
    const fring = new THREE.TorusGeometry(14, 2, 6, 20); fring.rotateX(Math.PI / 2);
    fring.translate(np.root.x - pux * 30, GY + 1, np.root.z - puz * 30);
    RR.City.tintGeom(fring, 0x9aa7b0, 0, rng); geoms.push(fring);                                                              // Gateway fountain ring
    for (let i = 1; i < 10; i++) {                                                                                             // promenade string-light poles
      const f = i / 10, bx = np.root.x + pux * plen * f, bz = np.root.z + puz * plen * f;
      for (const s of [-1, 1]) {
        const lx = bx - puz * s * (np.width * 0.42), lz = bz + pux * s * (np.width * 0.42);
        boxAt(geoms, 0.6, 9, 0.6, lx, 3.2 + 4.5, lz, 0x555a60);
        if (RR.Theme) RR.Theme.addLamp(lx, 3.2 + 9.2, lz, 0xffe6b0);
      }
    }

    // ---------- Centennial Wheel: orientation group + inner spinner + hung gondolas ----------
    const WR = (np.wheel && np.wheel.h ? np.wheel.h : 60) * 0.5;   // ~30m radius (real wheel ~196ft)
    const NG = 20;                                                  // gondolas (scaled from the real 42)
    const hubY = 3.2 + WR + 6;
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xeef2f6, roughness: 0.35, metalness: 0.5 });
    const cableMat = new THREE.MeshStandardMaterial({ color: 0xc4ccd4, roughness: 0.5, metalness: 0.4 });
    const gondMat = new THREE.MeshStandardMaterial({ color: 0x2f6fb0, roughness: 0.35, metalness: 0.2 });

    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(wcx, hubY, wcz);
    wheelGroup.rotation.y = pang + Math.PI / 2;                     // broadside to the river; axle = wheel-local Z
    scene.add(wheelGroup);

    const spinner = new THREE.Group();                             // everything that turns
    wheelGroup.add(spinner);
    for (const zc of [-3, 3]) {                                     // double rim
      const ring = new THREE.Mesh(new THREE.TorusGeometry(WR, 0.7, 8, 48), steelMat);
      ring.position.z = zc; spinner.add(ring);
    }
    for (let i = 0; i < NG; i++) {                                  // rim cross-braces + radial spoke cables
      const a = (i / NG) * Math.PI * 2;
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 5), steelMat);
      br.rotation.x = Math.PI / 2; br.position.set(Math.cos(a) * WR, Math.sin(a) * WR, 0); spinner.add(br);
      for (const zc of [-3, 3]) {
        const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, WR, 4), cableMat);
        sp.position.set(Math.cos(a) * WR / 2, Math.sin(a) * WR / 2, zc);
        sp.rotation.z = a - Math.PI / 2; spinner.add(sp);
      }
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 8, 12), steelMat);
    hub.rotation.x = Math.PI / 2; spinner.add(hub);                 // axle along local Z

    const gonds = [];                                              // hung from the NON-spinning group → stay upright
    for (let i = 0; i < NG; i++) {
      const g = new THREE.Group();
      const bail = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.2, 4), steelMat); bail.position.y = -1.1;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.4, 4.4), gondMat); cabin.position.y = -2.6;
      g.add(bail); g.add(cabin); wheelGroup.add(g); gonds.push(g);
    }

    // splayed steel supports from the deck up to the axle ends (wheelGroup-local frame)
    function strut(ax, ay, az, bx, by, bz, rad) {
      const ddx = bx - ax, ddy = by - ay, ddz = bz - az, len = Math.hypot(ddx, ddy, ddz);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 1.3, len, 6), steelMat);
      m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(ddx, ddy, ddz).normalize());
      wheelGroup.add(m);
    }
    const baseY = 3.2 - hubY;                                       // deck level in wheel-local coords
    for (const zc of [-6, 6]) for (const s of [-1, 1]) strut(s * WR * 0.7, baseY, zc, 0, 0, Math.sign(zc) * 4, 1.0);

    wheel = { spinner, gonds, r: WR, N: NG, mats: [steelMat, cableMat, gondMat] };

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

    // wheel spins about its true axle, gondolas hang level, LEDs glow at night; beacon pulses
    RR.Engine.onUpdate((dt, t) => {
      const w = wheel;
      w.spinner.rotation.z += dt * 0.12;                         // real in-plane spin about the axle
      const base = w.spinner.rotation.z;
      for (let i = 0; i < w.N; i++) {
        const a = base + (i / w.N) * Math.PI * 2;
        w.gonds[i].position.set(Math.cos(a) * w.r, Math.sin(a) * w.r, 0);   // upright (non-spinning parent)
      }
      const lit = RR.Theme && RR.Theme.mode === 'night' ? 1 : (RR.Theme && RR.Theme.mode === 'sunset' ? 0.35 : 0);
      const hue = (t * 0.05) % 1;
      w.mats[0].emissive.setHSL(hue, 0.6, 0.5); w.mats[0].emissiveIntensity = lit * 1.4;   // rim
      w.mats[1].emissive.setHSL(hue, 0.6, 0.5); w.mats[1].emissiveIntensity = lit * 0.8;   // spokes
      w.mats[2].emissive.setHex(0x2f6fb0); w.mats[2].emissiveIntensity = lit * 0.9;        // gondolas
      LK._beacon.intensity = 1.4 + Math.sin(t * 2.4) * 1.4;
    });
  };

  RR.Lake = LK;
})();

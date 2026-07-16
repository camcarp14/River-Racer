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
    const geoms2 = [];           // Lake Shore Drive + lakefront park (kept separate: it's a big second batch)
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
    // exhibition sheds along the pier, with a continuous dark window ribbon
    boxAt(geoms, np.width * 0.55, 12, plen * 0.42, pcx - pux * plen * 0.08, 3.2 + 6, pcz - puz * plen * 0.08, 0xcabfa8, pang);
    boxAt(geoms, np.width * 0.55 + 0.3, 2.4, plen * 0.42 - 6, pcx - pux * plen * 0.08, 3.2 + 7.2, pcz - puz * plen * 0.08, 0x22333d, pang);
    // Grand Ballroom at the tip: hall + drum + dome seated ON the deck (was a giant floating vault)
    const bx = np.tip.x - pux * 45, bz = np.tip.z - puz * 45;
    boxAt(geoms, np.width * 0.44, 8, 36, bx, 3.2 + 4, bz, 0xc8b894, pang);
    boxAt(geoms, np.width * 0.44 + 0.3, 1.8, 30, bx, 3.2 + 5.4, bz, 0x22333d, pang);   // window ribbon
    const drum = new THREE.CylinderGeometry(16.5, 18.5, 8, 14);
    drum.translate(bx, 3.2 + 12, bz);
    RR.City.tintGeom(drum, 0xc2b490, 0, rng); geoms.push(drum);
    const dome = new THREE.SphereGeometry(16.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.translate(bx, 3.2 + 16, bz);
    RR.City.tintGeom(dome, 0xaf9f7e, 0, rng); geoms.push(dome);
    // east twin brick towers flanking the ballroom, like the real pier head
    for (const s of [-1, 1]) {
      const twx = np.tip.x - pux * 12 - puz * s * (np.width * 0.3);
      const twz = np.tip.z - puz * 12 + pux * s * (np.width * 0.3);
      boxAt(geoms, 7, 17, 7, twx, 3.2 + 8.5, twz, 0xa86448, pang);
      const cap = new THREE.ConeGeometry(5.2, 4.2, 4);
      cap.rotateY(pang + Math.PI / 4);
      cap.translate(twx, 3.2 + 19, twz);
      RR.City.tintGeom(cap, 0x3f5a3a, 0, rng); geoms.push(cap);
    }
    // wooden pilings + dock ledge along both faces so the pier reads like a working wharf
    for (const s of [-1, 1]) {
      const ledge = new THREE.BoxGeometry(2.6, 0.8, plen * 0.92);
      ledge.rotateY(pang);
      ledge.translate(pcx - puz * s * (np.width / 2 + 1.2), 1.1, pcz + pux * s * (np.width / 2 + 1.2));
      RR.City.tintGeom(ledge, 0x8d8272, 0.06, rng); geoms.push(ledge);
      for (let d = 30; d < plen - 20; d += 22) {
        const px2 = np.root.x + pux * d - puz * s * (np.width / 2 + 2.4);
        const pz2 = np.root.z + puz * d + pux * s * (np.width / 2 + 2.4);
        const pile = new THREE.CylinderGeometry(0.42, 0.5, 3.6, 5);
        pile.translate(px2, 1.2, pz2);
        RR.City.tintGeom(pile, 0x4a3c2c, 0.08, rng); geoms.push(pile);
      }
    }

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
    boxAt(geoms, np.width * 0.6 + 0.3, 2.2, plen * 0.20 - 5, pcx + pux * plen * 0.20, 3.2 + 7.6, pcz + puz * plen * 0.20, 0x22333d, pang);
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

    // ---------- Lake Shore Drive: elevated viaduct running N–S from the Link Bridge ----------
    // The roadway picks up at both ends of the Lake Shore Dr crossing and runs the lakefront.
    const LX = 1359, RD_TOP = 9.5 + 1.6;            // centerline + deck-top height matching the bridge
    const landOK = (x, z) => RR.City.landClearance(x, z) > 3;
    for (let z0 = -940; z0 < 940; z0 += 40) {
      const zc = z0 + 20;
      if (!landOK(LX, z0) || !landOK(LX, zc) || !landOK(LX, z0 + 40)) continue;   // the bridge spans the river
      boxAt(geoms2, 20, 1.2, 40.4, LX, RD_TOP - 0.6, zc, 0x63676d);
      boxAt(geoms2, 20, 0.06, 0.7, LX, RD_TOP + 0.01, zc, 0xdfe3e6);              // lane dash
      for (const s of [-1, 1]) {
        boxAt(geoms2, 0.5, 1.0, 40.4, LX + s * 9.9, RD_TOP + 0.5, zc, 0x9aa0a6);  // guardrails
        boxAt(geoms2, 3.4, RD_TOP - 1.2, 3.0, LX + s * 6.5, (RD_TOP - 1.2) / 2, zc, 0x8b8880);  // piers
      }
      if ((z0 / 40) % 2 === 0) {
        boxAt(geoms2, 0.5, 6, 0.5, LX, RD_TOP + 3, zc, 0x555a60);                 // median light poles
        if (RR.Theme) RR.Theme.addLamp(LX, RD_TOP + 6.4, zc, 0xffd9a0);
      }
    }

    // ---------- lakefront park between the Drive and the seawall (DuSable Harbor front) ----------
    const CGY = RR.City.GROUND_Y;
    function parkTree(x, z, s) {
      const trunk = new THREE.CylinderGeometry(0.22 * s, 0.32 * s, 2.6 * s, 5);
      trunk.translate(x, CGY + 1.3 * s, z);
      RR.City.tintGeom(trunk, 0x4a3524, 0, rng); geoms2.push(trunk);
      const crown = new THREE.SphereGeometry((2.0 + rng() * 1.4) * s, 7, 6);
      crown.scale(1, 0.82, 1); crown.translate(x, CGY + (3.9 + rng()) * s, z);
      RR.City.tintGeom(crown, 0x3f7238, 0.12, rng); geoms2.push(crown);
    }
    for (let gx2 = LX + 16; gx2 < C.lake.openWaterX - 14; gx2 += 36) {
      for (let gz2 = -940; gz2 < 940; gz2 += 36) {
        const cx2 = gx2 + 18, cz2 = gz2 + 18;
        if (RR.City.landClearance(cx2, cz2) < 27) continue;                       // keep the lawn off the water
        const lawn = new THREE.PlaneGeometry(36, 36);
        lawn.rotateX(-Math.PI / 2); lawn.translate(cx2, CGY + 0.02, cz2);
        RR.City.tintGeom(lawn, 0x4f7a3e, 0.12, rng); geoms2.push(lawn);
        if (rng() < 0.75) parkTree(cx2 + (rng() - 0.5) * 24, cz2 + (rng() - 0.5) * 24, 0.85 + rng() * 0.5);
        if (rng() < 0.3) {
          boxAt(geoms2, 0.4, 4.6, 0.4, cx2 + (rng() - 0.5) * 20, CGY + 2.3, cz2 + (rng() - 0.5) * 20, 0x555a60);
          if (RR.Theme) RR.Theme.addLamp(cx2, CGY + 4.8, cz2, 0xffe6b0);
        }
      }
    }
    // lakefront trail: a light path weaving down the park
    for (let z0 = -930; z0 < 930; z0 += 30) {
      const zc = z0 + 15, px3 = LX + 52 + Math.sin(z0 * 0.006) * 14;
      if (RR.City.landClearance(px3, zc) < 20) continue;
      boxAt(geoms2, 4.2, 0.08, 30.6, px3, CGY + 0.06, zc, 0xb9ac92);
    }
    // seawall edge where the park meets Lake Michigan
    for (let z0 = -940; z0 < 940; z0 += 40) {
      const zc = z0 + 20, wx = C.lake.openWaterX - 5;
      if (RR.City.landClearance(wx, z0) < 2 || RR.City.landClearance(wx, z0 + 40) < 2) continue;
      boxAt(geoms2, 9, CGY + 1.4, 40.4, wx, (CGY + 1.4) / 2 - 0.8, zc, 0x9a988e);
    }

    const mesh = new THREE.Mesh(RR.City.mergeGeoms(geoms), RR.City.flatMaterial());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (geoms2.length) {
      const mesh2 = new THREE.Mesh(RR.City.mergeGeoms(geoms2), RR.City.flatMaterial());
      mesh2.castShadow = true;
      mesh2.receiveShadow = true;
      scene.add(mesh2);
    }

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

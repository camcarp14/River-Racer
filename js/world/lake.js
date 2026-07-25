/* River Racer — river mouth + lakefront: Chicago Harbor Lock, Navy Pier (+ Centennial
   Wheel), Chicago Harbor Lighthouse, breakwaters, Jardine plant, Streeterville shore. */
(function () {
  const LK = { tags: [] };
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

    // ---------- Chicago Harbor Lock (USACE, 1938): chamber, miter gates, signals, guide walls ----
    // 600 × 80 ft, one of the busiest locks in the country by vessel count. It is also the hinge
    // the whole river turns on: everything west of this sill has flowed backwards since 1900.
    const lock = lake.lock;
    const main = RR.River.paths.main;
    const q = U().pathNearest(main, lock.x, lock.z);
    const ldx = q.tx, ldz = q.tz;                  // channel direction at the lock
    const lperp = { x: -ldz, z: ldx };
    const lang = Math.atan2(ldx, ldz);
    const lockPt = (s, o) => ({ x: lock.x + ldx * s + lperp.x * o, z: lock.z + ldz * s + lperp.z * o });
    const GS0 = -60, GS1 = -60 + lock.len;         // the two gate sills = the chamber ends
    for (const s of [-1, 1]) {
      // chamber walls just outside the narrowed channel, 20 m proud of each sill
      const wc = lockPt(GS0 + lock.len / 2, (lock.w / 2 + 4) * s);
      boxAt(geoms, 8, 4.6, lock.len + 40, wc.x, 2.0, wc.z, 0x9a988e, lang);
      boxAt(geoms, 9, 0.5, lock.len + 40, wc.x, 4.55, wc.z, 0xb4afa4, lang);        // concrete coping
      // gate machinery towers at both ends
      for (const gs of [GS0, GS1]) {
        const g0 = lockPt(gs, (lock.w / 2 + 5) * s);
        boxAt(geoms, 6, 9, 6, g0.x, 4.5, g0.z, 0xb0aca0, lang);
        boxAt(geoms, 7, 0.8, 7, g0.x, 9.4, g0.z, 0x6e737a, lang);                   // machinery deck cap
        boxAt(geoms, 4.4, 1.2, 4.4, g0.x, 10.4, g0.z, 0x878d94, lang);              // hoist housing
      }
      // Guide walls: 60 m of half-height wall flaring outward past each sill. Real locks have
      // them, and the funnel is what makes the pinch legible at 30 m/s.
      for (const [gs, dir] of [[GS0, -1], [GS1, 1]]) {
        const a = lockPt(gs + dir * 20, (lock.w / 2 + 4) * s);
        const b = lockPt(gs + dir * 80, (lock.w / 2 + 11) * s);
        const glen = Math.hypot(b.x - a.x, b.z - a.z);
        const gm = Math.atan2(b.x - a.x, b.z - a.z);
        boxAt(geoms, 3.2, 2.3, glen, (a.x + b.x) / 2, 0.85, (a.z + b.z) / 2, 0x9a988e, gm);
        boxAt(geoms, 3.8, 0.4, glen, (a.x + b.x) / 2, 2.2, (a.z + b.z) / 2, 0xb4afa4, gm);
        for (let f = 0.12; f < 1; f += 0.25) {                                      // timber rub strips
          const rx = a.x + (b.x - a.x) * f, rz = a.z + (b.z - a.z) * f;
          boxAt(geoms, 3.6, 0.9, 0.5, rx, 1.4, rz, 0x5a4632, gm);
        }
      }
      // signal masts on the chamber coping, one pair per end
      for (const gs of [GS0 - 9, GS1 + 9]) {
        const m0 = lockPt(gs, (lock.w / 2 + 4) * s);
        boxAt(geoms, 0.34, 4, 0.34, m0.x, 6.3, m0.z, 0x2e3338);
      }
    }
    // lock control house
    const ch = lockPt(-30, lock.w / 2 + 16);
    boxAt(geoms, 10, 7, 8, ch.x, 5.5, ch.z, 0xc7c2b2, lang);
    boxAt(geoms, 11.4, 0.6, 9.4, ch.x, 9.3, ch.z, 0x5f656c, lang);                  // roof cap
    boxAt(geoms, 10.2, 1.7, 8.2, ch.x, 7.4, ch.z, 0x2c3a44, lang);                  // glazed watch band

    // Signal lamps: green while the chamber is open, red the moment the gates start to swing.
    // One merged mesh, one basic material — a signal lens is genuinely self-lit.
    const sigGeoms = [];
    for (const s of [-1, 1]) for (const gs of [GS0 - 9, GS1 + 9]) {
      const m0 = lockPt(gs, (lock.w / 2 + 4) * s);
      const bulb = new THREE.SphereGeometry(0.35, 8, 6);
      bulb.translate(m0.x, 8.5, m0.z);
      sigGeoms.push(bulb);
    }
    const sigMat = new THREE.MeshBasicMaterial({ color: 0x12ff4a });
    sigMat.color.convertSRGBToLinear();
    const sigMesh = new THREE.Mesh(RR.City.mergeGeoms(sigGeoms), sigMat);
    sigMesh.layers.set(1);
    scene.add(sigMesh);

    // Miter gates: two leaves per end, hinged on the chamber wall, mitred toward the lake (the
    // lake side is the high side). One InstancedMesh for all four = one draw call.
    const leafParts = [];
    {
      const lp = new THREE.BoxGeometry(0.9, 7, 12.2); lp.translate(0, 0, 6.1);
      RR.City.tintGeom(lp, 0x4a5058, 0, rng); leafParts.push(lp);
      const lr = new THREE.BoxGeometry(1.3, 0.5, 12.2); lr.translate(0, 3.55, 6.1);
      RR.City.tintGeom(lr, 0x7d838a, 0, rng); leafParts.push(lr);                   // walkway rail
      const lb = new THREE.BoxGeometry(1.15, 0.7, 12.2); lb.translate(0, -3.3, 6.1);
      RR.City.tintGeom(lb, 0x33383e, 0, rng); leafParts.push(lb);                   // sill beam
      for (const dz of [3.0, 9.2]) {                                                // strongback ribs
        const rb = new THREE.BoxGeometry(1.5, 5.6, 0.6); rb.translate(0, 0, dz);
        RR.City.tintGeom(rb, 0x3d434a, 0, rng); leafParts.push(rb);
      }
    }
    const gateMesh = new THREE.InstancedMesh(RR.City.mergeGeoms(leafParts), RR.City.flatMaterial(), 4);
    gateMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    gateMesh.castShadow = true;
    scene.add(gateMesh);
    const leaves = [];
    for (const gs of [GS0, GS1]) for (const s of [-1, 1]) {
      const h0 = lockPt(gs, (lock.w / 2) * s);
      const inAng = Math.atan2(-s * lperp.x, -s * lperp.z);          // leaf spanning the chamber
      const back = U().wrapAngle(Math.atan2(-ldx, -ldz) - inAng);    // ±90° back along the wall
      leaves.push({ x: h0.x, z: h0.z, open: inAng + back * (65 / 90), shut: inAng - back * (16 / 90) });
    }

    // CHICAGO HARBOR LOCK nameboard + the Corps of Engineers castle, one quad on the control house
    {
      const tex = U().canvasTexture(256, 64, (ctx, w, h) => {
        ctx.fillStyle = '#0e4b33'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#f4f2ec'; ctx.fillRect(2, 2, 60, 60);
        ctx.fillStyle = '#c8102e';                                    // USACE castle: gate + 3 merlons
        ctx.fillRect(12, 28, 40, 26);
        ctx.fillRect(12, 18, 10, 12); ctx.fillRect(27, 14, 10, 16); ctx.fillRect(42, 18, 10, 12);
        ctx.fillStyle = '#f4f2ec'; ctx.fillRect(28, 40, 8, 14);
        ctx.fillStyle = '#f4f2ec'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'bold 21px Arial'; ctx.fillText('CHICAGO HARBOR LOCK', 160, 24);
        ctx.font = '12px Arial'; ctx.fillStyle = '#bcd8c8';
        ctx.fillText('U.S. ARMY CORPS OF ENGINEERS', 160, 46);
      });
      const sg = new THREE.PlaneGeometry(20, 5);
      sg.rotateY(lang + Math.PI / 2);
      const sp = lockPt(-30, lock.w / 2 + 11.7);
      sg.translate(sp.x, 9.2, sp.z);
      const sm = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      sm.layers.set(1);
      scene.add(sm);
    }
    LK.tags.push({ name: 'THE LOCK', sub: 'CHICAGO HARBOR LOCK · 1938 · THE RIVER RUNS BACKWARD', x: lock.x, z: lock.z, r2: 220 * 220 });

    // ---------- Streeterville / Olive Park shore north of the mouth ----------
    // ground slab from the basin west edge out to the Navy Pier root
    const slab = new THREE.BoxGeometry(320, GY + 2, 850);
    slab.translate(lake.openWaterX + 100, (GY + 2) / 2 - 2, -560);
    RR.City.tintGeom(slab, 0x7f8a6e, 0.08, rng);   // parkland green-gray
    geoms.push(slab);
    RR.River.addWall(lake.openWaterX - 40, -135, lake.openWaterX + 260, -135, 2);   // south face
    RR.River.addWall(lake.openWaterX + 260, -135, lake.openWaterX + 260, -985, 2);  // east face
    // Jardine Water Purification Plant — the largest water filtration plant on earth, and from the
    // lake it reads as one long limestone deck with the settling basins showing on top of it.
    {
      const jx = lake.jardine.x - 120, jz = lake.jardine.z, jw = lake.jardine.w, jd = lake.jardine.d;
      boxAt(geoms, jw, 13, jd, jx, GY + 6.5, jz, 0xb9b4a4);
      boxAt(geoms, jw + 3, 1.1, jd + 3, jx, GY + 13.4, jz, 0xcfc9b8);              // cornice
      boxAt(geoms, jw - 14, 1.6, jd - 14, jx, GY + 14.6, jz, 0x8f9298);            // basin deck
      for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) {                // covered settling basins
        boxAt(geoms, jw * 0.26, 2.2, jd * 0.26, jx + i * jw * 0.31, GY + 16.4, jz + k * jd * 0.31, 0x6f757c);
      }
      boxAt(geoms, 26, 9, 22, jx - jw * 0.30, GY + 19.5, jz, 0xa8a294);            // pump house
      boxAt(geoms, 28, 1.0, 24, jx - jw * 0.30, GY + 24.5, jz, 0x5f656c);
      for (const s of [-1, 1]) {                                                    // intake stacks
        const st = new THREE.CylinderGeometry(2.4, 3.0, 20, 8);
        st.translate(jx + jw * 0.34, GY + 23, jz + s * jd * 0.30);
        RR.City.tintGeom(st, 0xa8a294, 0.05, rng); geoms.push(st);
        if (RR.Theme) RR.Theme.addLamp(jx + jw * 0.34, GY + 33.5, jz + s * jd * 0.30, 0xff2a1e);
      }
      LK.tags.push({ name: 'JARDINE PLANT', sub: '1968 · LARGEST WATER FILTRATION PLANT ON EARTH', x: jx, z: jz, r2: 260 * 260 });
    }

    // ---------- Navy Pier ----------
    // Municipal Pier No. 2, 1914–16, Charles Sumner Frost; renamed for the WWI navy in 1927.
    // 3,300 ft × 400 ft. Everything below is laid out at its real distance from the root, because
    // the sequence — head house, glass barrel vault, midway, exhibition sheds, ballroom — IS the pier.
    const np = lake.navyPier;
    const pdx = np.tip.x - np.root.x, pdz = np.tip.z - np.root.z;
    const plen = Math.hypot(pdx, pdz);
    const pux = pdx / plen, puz = pdz / plen;
    const pang = Math.atan2(pux, puz);
    const pcx = (np.root.x + np.tip.x) / 2, pcz = (np.root.z + np.tip.z) / 2;
    const DECK = 3.2;
    // point at pier-distance `m` from the root, offset `o` metres to port(+)/starboard(-)
    const pierAt = (m, o) => ({ x: np.root.x + pux * m - puz * (o || 0), z: np.root.z + puz * m + pux * (o || 0) });
    const pierBox = (arr, w, h, l, m, y, c, o) => { const p = pierAt(m, o); boxAt(arr, w, h, l, p.x, y, p.z, c, pang); };
    // deck
    const deck = new THREE.BoxGeometry(np.width, DECK, plen + 30);
    deck.rotateY(pang);
    deck.translate(pcx, 1.6, pcz);
    RR.City.tintGeom(deck, 0xb9b3a2, 0, rng);
    geoms.push(deck);

    // 0 … 80 — Head House (1916): brick block, twin towers, terracotta cornice
    pierBox(geoms, np.width * 0.8, 16, 60, 40, DECK + 8, 0x9c5a40);
    pierBox(geoms, np.width * 0.8 + 2.4, 1.2, 62, 40, DECK + 16.6, 0xc7b59a);
    pierBox(geoms, np.width * 0.8 - 8, 2.6, 52, 40, DECK + 17.8, 0x8c5039);
    for (const s of [-1, 1]) {
      pierBox(geoms, 12, 26, 12, 20, DECK + 13, 0xa86448, s * np.width * 0.32);
      const p = pierAt(20, s * np.width * 0.32);
      const cap = new THREE.ConeGeometry(9.4, 6.5, 4);
      cap.rotateY(pang + Math.PI / 4);
      cap.translate(p.x, DECK + 29.2, p.z);
      RR.City.tintGeom(cap, 0x5e8f72, 0, rng); geoms.push(cap);                    // patinated copper
    }

    // 80 … 170 — Crystal Gardens: a one-acre six-storey glass barrel vault. The most distinctive
    // volume on the pier, and it was missing entirely.
    pierBox(geoms, 32, 1.9, 92, 125, DECK + 0.95, 0xcabfa8);                        // limestone plinth
    for (let m = 82; m <= 168; m += 12.3) {                                         // steel arch ribs
      const rib = new THREE.TorusGeometry(13, 0.26, 4, 14, Math.PI);
      rib.rotateY(pang);
      const p = pierAt(m);
      rib.translate(p.x, DECK + 1.9, p.z);
      RR.City.tintGeom(rib, 0xd8dce0, 0, rng); geoms.push(rib);
    }
    {
      const vaultParts = [];
      const vault = new THREE.CylinderGeometry(13, 13, 90, 18, 1, true, -Math.PI / 2, Math.PI);
      vault.rotateX(-Math.PI / 2);                                                  // axis → +z, arc → up
      vault.rotateY(pang);
      const vp = pierAt(125);
      vault.translate(vp.x, DECK + 1.9, vp.z);
      vaultParts.push(vault);
      for (const m of [80, 170]) {                                                  // glazed end walls
        const end = new THREE.CircleGeometry(13, 18, 0, Math.PI);
        end.rotateY(pang);
        const p = pierAt(m);
        end.translate(p.x, DECK + 1.9, p.z);
        vaultParts.push(end);
      }
      const cg = new THREE.Mesh(RR.City.mergeGeoms(vaultParts), new THREE.MeshLambertMaterial({
        color: 0xbfe0e8, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false,
      }));
      cg.renderOrder = 1;
      cg.layers.set(1);                                                             // glass in the reflection = a ghost blob
      scene.add(cg);
      for (let m = 92; m <= 158; m += 22) {                                         // it is lit from inside all night
        const p = pierAt(m);
        if (RR.Theme) RR.Theme.addLamp(p.x, DECK + 7, p.z, 0xd8f0e0);
      }
      LK.tags.push({ name: 'CRYSTAL GARDENS', sub: 'NAVY PIER · 1 ACRE UNDER GLASS · SIX STOREYS OF PALMS', x: vp.x, z: vp.z, r2: 190 * 190 });
    }

    // 300 … 700 — Festival Hall A & B: the big low exhibition sheds, split by a cross-promenade
    for (const m of [396, 604]) {
      pierBox(geoms, np.width * 0.62, 13, 186, m, DECK + 6.5, 0xc7b59a);
      pierBox(geoms, np.width * 0.62 + 0.4, 2.4, 178, m, DECK + 7.6, 0x22333d);     // window ribbon
      pierBox(geoms, np.width * 0.62 + 1.6, 0.9, 188, m, DECK + 13.4, 0x8f9298);    // parapet
      pierBox(geoms, np.width * 0.30, 2.2, 168, m, DECK + 14.5, 0x6e737a);          // roof monitor
    }

    // 700 … 950 — promenade + Chicago Shakespeare Theater, a dark angular mass off to port
    pierBox(geoms, 44, 19, 62, 782, DECK + 9.5, 0x5c6670, 22);
    pierBox(geoms, 46, 1.1, 64, 782, DECK + 19.6, 0x3b4249, 22);
    pierBox(geoms, 30, 5.5, 40, 782, DECK + 21.8, 0x77828c, 22);                    // fly tower
    pierBox(geoms, 26, 0.5, 132, 800, DECK + 0.3, 0x9aa38f, -30);                   // lawn strip

    // 950 … 1005 — Grand Ballroom (1916): hall + drum + dome seated ON the deck
    const bx = np.tip.x - pux * 45, bz = np.tip.z - puz * 45;
    boxAt(geoms, np.width * 0.44, 8, 36, bx, DECK + 4, bz, 0xc8b894, pang);
    boxAt(geoms, np.width * 0.44 + 0.3, 1.8, 30, bx, DECK + 5.4, bz, 0x22333d, pang);   // window ribbon
    const drum = new THREE.CylinderGeometry(16.5, 18.5, 8, 14);
    drum.translate(bx, DECK + 12, bz);
    RR.City.tintGeom(drum, 0xc2b490, 0, rng); geoms.push(drum);
    const dome = new THREE.SphereGeometry(16.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.translate(bx, DECK + 16, bz);
    RR.City.tintGeom(dome, 0xaf9f7e, 0, rng); geoms.push(dome);
    const lantern = new THREE.CylinderGeometry(3.2, 3.8, 4.2, 10);
    lantern.translate(bx, DECK + 32, bz);
    RR.City.tintGeom(lantern, 0xd8cbb0, 0, rng); geoms.push(lantern);
    if (RR.Theme) RR.Theme.addLamp(bx, DECK + 34.5, bz, 0xffe6b0);
    // east twin brick towers flanking the ballroom, like the real pier head
    for (const s of [-1, 1]) {
      const twx = np.tip.x - pux * 12 - puz * s * (np.width * 0.3);
      const twz = np.tip.z - puz * 12 + pux * s * (np.width * 0.3);
      boxAt(geoms, 7, 17, 7, twx, DECK + 8.5, twz, 0xa86448, pang);
      const cap = new THREE.ConeGeometry(5.2, 4.2, 4);
      cap.rotateY(pang + Math.PI / 4);
      cap.translate(twx, DECK + 19, twz);
      RR.City.tintGeom(cap, 0x5e8f72, 0, rng); geoms.push(cap);
    }
    // deck edge railings — a kilometre of unbroken deck edge otherwise reads as a cut
    for (const s of [-1, 1]) {
      pierBox(geoms, 0.12, 0.1, plen - 20, plen / 2, DECK + 1.05, 0xb6bec4, s * (np.width / 2 - 0.9));
      pierBox(geoms, 0.12, 0.1, plen - 20, plen / 2, DECK + 0.58, 0x9aa0a6, s * (np.width / 2 - 0.9));
      for (let m = 14; m < plen - 14; m += 12) {
        pierBox(geoms, 0.11, 1.05, 0.11, m, DECK + 0.52, 0x8e959b, s * (np.width / 2 - 0.9));
      }
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

    // ---------- 170 … 300 — Pier Park: Light Tower, Centennial Wheel, carousel, swing ----------
    const wheelDist = plen * (np.wheel && np.wheel.frac ? np.wheel.frac : 0.22);
    const wcx = np.root.x + pux * wheelDist, wcz = np.root.z + puz * wheelDist;
    pierBox(geoms, np.width * 0.7, 1.2, 132, 235, DECK + 0.6, 0x8fae86);            // midway deck
    {                                                                               // Light Tower
      const p = pierAt(184, -30);
      const mast = new THREE.CylinderGeometry(0.7, 1.6, 42, 6);
      mast.translate(p.x, DECK + 21, p.z);
      RR.City.tintGeom(mast, 0xb6bec4, 0, rng); geoms.push(mast);
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + 0.79;
        boxAt(geoms, 0.3, 12, 0.3, p.x + Math.cos(a) * 3.4, DECK + 6, p.z + Math.sin(a) * 3.4, 0x8e959b);
      }
      const crown = new THREE.ConeGeometry(2.6, 5, 8);
      crown.translate(p.x, DECK + 44.5, p.z);
      RR.City.tintGeom(crown, 0x8e959b, 0, rng); geoms.push(crown);
      if (RR.Theme) RR.Theme.addLamp(p.x, DECK + 46, p.z, 0xffe6b0);
    }
    {                                                                               // carousel
      const p = pierAt(268, 26);
      boxAt(geoms, 16, 4, 16, p.x, DECK + 2, p.z, 0xd8cbb0);
      const canopy = new THREE.ConeGeometry(9, 5, 12); canopy.translate(p.x, DECK + 8, p.z);
      RR.City.tintGeom(canopy, 0xcf4436, 0, rng); geoms.push(canopy);
      const finial = new THREE.SphereGeometry(0.9, 6, 5); finial.translate(p.x, DECK + 11, p.z);
      RR.City.tintGeom(finial, 0xf0c840, 0, rng); geoms.push(finial);
      if (RR.Theme) RR.Theme.addLamp(p.x, DECK + 11.2, p.z, 0xffd27f);
    }
    {                                                                               // swing ride
      const p = pierAt(292, -24);
      const mast = new THREE.CylinderGeometry(0.6, 1.0, 26, 6);
      mast.translate(p.x, DECK + 13, p.z);
      RR.City.tintGeom(mast, 0xd8dce0, 0, rng); geoms.push(mast);
      const hood = new THREE.ConeGeometry(7, 3.4, 12);
      hood.translate(p.x, DECK + 24, p.z);
      RR.City.tintGeom(hood, 0x2f6fb0, 0, rng); geoms.push(hood);
    }
    // -40 … 0 — Polk Bros Park + the Gateway wave-jet plaza at the pier root
    const fring = new THREE.TorusGeometry(14, 1.4, 6, 20); fring.rotateX(Math.PI / 2);
    fring.translate(np.root.x - pux * 30, GY + 0.35, np.root.z - puz * 30);
    RR.City.tintGeom(fring, 0x9aa7b0, 0, rng); geoms.push(fring);                                                              // Gateway fountain rim
    const fpool = new THREE.CircleGeometry(13.4, 20); fpool.rotateX(-Math.PI / 2);
    fpool.translate(np.root.x - pux * 30, GY + 0.55, np.root.z - puz * 30);
    RR.City.tintGeom(fpool, 0x3f7f96, 0, rng); geoms.push(fpool);                                                              // pool inside the rim
    for (let i = 1; i < 10; i++) {                                                                                             // promenade string-light poles
      const f = i / 10, bx = np.root.x + pux * plen * f, bz = np.root.z + puz * plen * f;
      for (const s of [-1, 1]) {
        const lx = bx - puz * s * (np.width * 0.42), lz = bz + pux * s * (np.width * 0.42);
        boxAt(geoms, 0.6, 9, 0.6, lx, 3.2 + 4.5, lz, 0x555a60);
        if (RR.Theme) RR.Theme.addLamp(lx, 3.2 + 9.2, lz, 0xffe6b0);
      }
    }

    // ---------- Centennial Wheel (2016) ----------
    // 196 ft overall — hub 34 m above the deck, radius 25.3 m, 42 enclosed gondolas, three
    // revolutions in ~15 min = 0.021 rad/s. The old build was 30 m radius spinning 6× too fast.
    // Everything that turns together is ONE merged mesh and the gondolas are ONE InstancedMesh:
    // the previous per-spoke Mesh loop cost ~107 draw calls all by itself.
    const WR = 25.3;
    const NG = 42;
    const hubY = DECK + 34;
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xeef2f6, roughness: 0.35, metalness: 0.5, vertexColors: true });
    const gondMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.2, vertexColors: true });

    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(wcx, hubY, wcz);
    wheelGroup.rotation.y = pang + Math.PI / 2;                     // broadside to the river; axle = wheel-local Z
    scene.add(wheelGroup);

    const spinParts = [];                                           // everything that turns, merged
    for (const zc of [-3, 3]) {                                     // double rim
      const ring = new THREE.TorusGeometry(WR, 0.7, 6, 44);
      ring.translate(0, 0, zc);
      RR.City.tintGeom(ring, 0xeef2f6, 0, rng); spinParts.push(ring);
    }
    for (let i = 0; i < NG; i++) {                                  // rim cross-braces + radial spoke cables
      const a = (i / NG) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const br = new THREE.CylinderGeometry(0.26, 0.26, 6, 5);
      br.rotateX(Math.PI / 2); br.translate(ca * WR, sa * WR, 0);
      RR.City.tintGeom(br, 0xdfe4e9, 0, rng); spinParts.push(br);
      if (i % 2) continue;                                          // 21 spoke pairs reads the same as 42
      for (const zc of [-3, 3]) {
        const sp = new THREE.CylinderGeometry(0.11, 0.11, WR, 4);
        sp.rotateZ(a - Math.PI / 2); sp.translate(ca * WR / 2, sa * WR / 2, zc);
        RR.City.tintGeom(sp, 0xc4ccd4, 0, rng); spinParts.push(sp);
      }
    }
    const hub = new THREE.CylinderGeometry(2.4, 2.4, 8, 12);
    hub.rotateX(Math.PI / 2);
    RR.City.tintGeom(hub, 0xeef2f6, 0, rng); spinParts.push(hub);   // axle along local Z
    const spinner = new THREE.Mesh(RR.City.mergeGeoms(spinParts), steelMat);
    spinner.castShadow = true;
    wheelGroup.add(spinner);

    // gondolas hang from the NON-spinning group, so they stay upright
    const gondParts = [];
    {
      const bail = new THREE.CylinderGeometry(0.13, 0.13, 2.2, 4); bail.translate(0, -1.1, 0);
      RR.City.tintGeom(bail, 0xdfe4e9, 0, rng); gondParts.push(bail);
      const cabin = new THREE.BoxGeometry(2.9, 2.5, 3.1); cabin.translate(0, -3.4, 0);
      RR.City.tintGeom(cabin, 0xe4e8ec, 0, rng); gondParts.push(cabin);
      const roof = new THREE.BoxGeometry(3.1, 0.3, 3.3); roof.translate(0, -2.2, 0);
      RR.City.tintGeom(roof, 0xf2f5f8, 0, rng); gondParts.push(roof);
      const skirt = new THREE.BoxGeometry(3.05, 0.75, 3.25); skirt.translate(0, -4.45, 0);
      RR.City.tintGeom(skirt, 0x1f5fa8, 0, rng); gondParts.push(skirt);   // the real blue skirt
    }
    const gonds = new THREE.InstancedMesh(RR.City.mergeGeoms(gondParts), gondMat, NG);
    gonds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    gonds.castShadow = true;
    wheelGroup.add(gonds);

    // splayed steel supports from the deck up to the axle ends (wheelGroup-local frame), merged
    const strutParts = [];
    function strut(ax, ay, az, tbx, tby, tbz, rad) {
      const ddx = tbx - ax, ddy = tby - ay, ddz = tbz - az, len = Math.hypot(ddx, ddy, ddz);
      const g = new THREE.CylinderGeometry(rad, rad * 1.3, len, 6);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), new THREE.Vector3(ddx, ddy, ddz).normalize()));
      g.translate((ax + tbx) / 2, (ay + tby) / 2, (az + tbz) / 2);
      RR.City.tintGeom(g, 0xdde3e8, 0, rng); strutParts.push(g);
    }
    const baseY = DECK - hubY;                                      // deck level in wheel-local coords
    for (const zc of [-6, 6]) for (const s of [-1, 1]) strut(s * WR * 0.72, baseY, zc, 0, 0, Math.sign(zc) * 4, 1.0);
    for (const zc of [-6, 6]) strut(-WR * 0.72, baseY, zc, WR * 0.72, baseY, zc, 0.45);   // sill tie
    const strutMesh = new THREE.Mesh(RR.City.mergeGeoms(strutParts), steelMat);
    strutMesh.castShadow = true;
    wheelGroup.add(strutMesh);

    wheel = { spinner, gonds, r: WR, N: NG, mats: [steelMat, gondMat] };
    LK.tags.push({ name: 'CENTENNIAL WHEEL', sub: '2016 · 196 FT · 42 GONDOLAS · NAVY PIER', x: wcx, z: wcz, r2: 200 * 200 });

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
    boxAt(lgh, 9, 0.8, 11, lh.x + 9, 8.9, lh.z, 0xb03a2a);  // red roof, like the real fog-signal building
    geoms.push(...lgh);
    RR.River.addObstacle(lh.x, lh.z, 12);
    // Fl R 5s — one red flash every five seconds. It is a navigational characteristic, not mood
    // lighting: that pattern is how you tell this light from every other one on the lake.
    const beacon = new THREE.PointLight(0xff2a1e, 0, 260);
    beacon.position.set(lh.x, 20, lh.z);
    scene.add(beacon);
    LK._beacon = beacon;

    // ---------- breakwaters: low riprap ridges, capped in concrete and gull guano ----------
    for (const bw of lake.breakwaters) {
      const len = Math.hypot(bw.bx - bw.ax, bw.bz - bw.az);
      const angle = Math.atan2(bw.bx - bw.ax, bw.bz - bw.az);
      const mx = (bw.ax + bw.bx) / 2, mz = (bw.az + bw.bz) / 2;
      const ux = (bw.bx - bw.ax) / len, uz = (bw.bz - bw.az) / len;
      const ridge = new THREE.BoxGeometry(7, 2.6, len);
      ridge.rotateY(angle);
      ridge.translate(mx, 0.9, mz);
      RR.City.tintGeom(ridge, 0x8d8a80, 0.15, rng);
      geoms.push(ridge);
      const cap = new THREE.BoxGeometry(3.5, 1.4, len);
      cap.rotateY(angle);
      cap.translate(mx, 2.6, mz);
      RR.City.tintGeom(cap, 0xa8a69c, 0.1, rng);
      geoms.push(cap);
      // the real thing is white with droppings — a mottle of pale patches along the cap
      for (let f = 6; f < len - 6; f += 11) {
        const gx2 = bw.ax + ux * f + (rng() - 0.5) * 1.6, gz2 = bw.az + uz * f + (rng() - 0.5) * 1.6;
        const blot = new THREE.BoxGeometry(2.2 + rng() * 1.0, 0.06, 3.0 + rng() * 4.0);
        blot.rotateY(angle);
        blot.translate(gx2, 3.32, gz2);
        RR.City.tintGeom(blot, 0xdcd9d0, 0.15, rng);
        geoms.push(blot);
      }
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
    // Grant Park / lakefront elm: two canopy layers, because one sphere on a stick is a lollipop
    // and two is a tree. Second layer only within 260 m of a centreline — past that it is fog.
    function twoLayerTree(arr, x, z, s, baseY, loHex, hiHex) {
      const trunk = new THREE.CylinderGeometry(0.22 * s, 0.34 * s, 3.0 * s, 5);
      trunk.translate(x, baseY + 1.5 * s, z);
      RR.City.tintGeom(trunk, 0x4a3524, 0, rng); arr.push(trunk);
      const r = (2.0 + rng() * 1.4) * s;
      const lower = new THREE.SphereGeometry(r, 7, 6);
      lower.scale(1, 0.72, 1); lower.translate(x, baseY + 3.6 * s, z);
      RR.City.tintGeom(lower, loHex, 0.16, rng); arr.push(lower);
      if (RR.City.landClearance(x, z) < 260) {
        const upper = new THREE.SphereGeometry(r * 0.72, 7, 6);
        upper.translate(x + (rng() - 0.5) * r * 0.5, baseY + 5.4 * s, z + (rng() - 0.5) * r * 0.5);
        RR.City.tintGeom(upper, hiHex, 0.16, rng); arr.push(upper);
      }
    }
    function parkTree(x, z, s) { twoLayerTree(geoms2, x, z, s, CGY, 0x4d7238, 0x5d8a42); }
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
    // seawall edge where the park meets Lake Michigan — checked at BOTH ends AND the middle
    // with a wide margin, so no segment ever stands across the river mouth
    for (let z0 = -940; z0 < 940; z0 += 40) {
      const zc = z0 + 20, wx = C.lake.openWaterX - 5;
      if (RR.City.landClearance(wx, z0) < 14 || RR.City.landClearance(wx, zc) < 14 ||
          RR.City.landClearance(wx, z0 + 40) < 14) continue;
      boxAt(geoms2, 9, CGY + 1.4, 40.4, wx, (CGY + 1.4) / 2 - 0.8, zc, 0x9a988e);
    }

    // ---------- Milton Lee Olive Park: five circular fountain basins on a promenade ----------
    // The park's real signature is a formal walk lined with five round fountain pools.
    // Olive Park is planted in honey locust — fine, airy, yellow-green — over serviceberry
    function slabTree(x, z, s) { twoLayerTree(geoms2, x, z, s, GY, 0x557a3c, 0x7d9a48); }
    boxAt(geoms2, 8, 0.08, 330, 2005, GY + 0.06, -745, 0xcfc7b0);   // promenade strip
    boxAt(geoms2, 6, 0.08, 70, 2015, GY + 0.06, -555, 0xcfc7b0);    // connector toward the beach
    const basins = [[-610, 8.5], [-678, 7], [-746, 7], [-814, 6], [-882, 6]];
    for (const [fz, fr] of basins) {
      const apron = new THREE.CircleGeometry(fr + 2.5, 22);
      apron.rotateX(-Math.PI / 2); apron.translate(2005, GY + 0.12, fz);
      RR.City.tintGeom(apron, 0xc9c2ae, 0.05, rng); geoms2.push(apron);
      const rim = new THREE.TorusGeometry(fr, 0.9, 6, 22);
      rim.rotateX(Math.PI / 2); rim.translate(2005, GY + 0.45, fz);
      RR.City.tintGeom(rim, 0xd6d0c0, 0.05, rng); geoms2.push(rim);
      const pool = new THREE.CircleGeometry(fr - 1.0, 20);
      pool.rotateX(-Math.PI / 2); pool.translate(2005, GY + 0.32, fz);
      RR.City.tintGeom(pool, 0x2e8fa3, 0.06, rng); geoms2.push(pool);
    }
    for (let i = 0; i < 4; i++) {                                    // promenade lamps between the pools
      const lz = basins[i][0] - 34;
      boxAt(geoms2, 0.4, 4.6, 0.4, 2014, GY + 2.3, lz, 0x555a60);
      if (RR.Theme) RR.Theme.addLamp(2014, GY + 4.8, lz, 0xffe6b0);
    }
    // ~30 trees scattered across the slab, clear of the promenade, beach and pier root
    let planted = 0;
    for (let tries = 0; tries < 160 && planted < 30; tries++) {
      const tx2 = 1885 + rng() * 280, tz2 = -955 + rng() * 790;
      if (tx2 > 1975 && tx2 < 2125 && tz2 > -530 && tz2 < -410) continue;      // Ohio St Beach
      if (Math.abs(tx2 - 2005) < 15 && tz2 < -560 && tz2 > -930) continue;     // fountain promenade
      if (tx2 > 2085 && tz2 > -480 && tz2 < -300) continue;                    // pier root / Gateway fountain
      if (tz2 > -165 || tx2 > 2165) continue;                                  // seawall trail edges
      slabTree(tx2, tz2, 0.8 + rng() * 0.5);
      planted++;
    }

    // ---------- Ohio Street Beach: sand wedge in the cove NW of the pier root ----------
    const sand = new THREE.Shape();                                  // shape (x, -z) → rotateX(-90°) lies flat, +y up
    sand.moveTo(1980, 455); sand.lineTo(2118, 420); sand.lineTo(2118, 520); sand.lineTo(2000, 520);
    const sandG = new THREE.ShapeGeometry(sand);
    sandG.rotateX(-Math.PI / 2); sandG.translate(0, GY + 0.1, 0);
    RR.City.tintGeom(sandG, 0xd9c79c, 0.05, rng); geoms2.push(sandG);
    const umbCols = [0xe0533f, 0xf2b636, 0x3f8fd0, 0x59b06a, 0xe07a9e, 0xe0533f, 0xf2b636];
    for (let i = 0; i < 7; i++) {                                    // beach umbrellas: thin pole + cone
      const ux2 = 2025 + rng() * 80, uz2 = -500 + rng() * 55;
      const pole = new THREE.CylinderGeometry(0.08, 0.08, 2.4, 5);
      pole.translate(ux2, GY + 1.3, uz2);
      RR.City.tintGeom(pole, 0xd8d4c8, 0, rng); geoms2.push(pole);
      const shade = new THREE.ConeGeometry(1.8, 0.9, 8);
      shade.translate(ux2, GY + 2.6, uz2);
      RR.City.tintGeom(shade, umbCols[i], 0.05, rng); geoms2.push(shade);
    }
    for (const [gx3, gz3, gc] of [[2042, -470, 0xc98a63], [2072, -452, 0x3f6fae], [2095, -492, 0xba4a4a]]) {
      const body = new THREE.CylinderGeometry(0.26, 0.3, 1.1, 6);    // a couple of static beach figures
      body.translate(gx3, GY + 0.65, gz3);
      RR.City.tintGeom(body, gc, 0, rng); geoms2.push(body);
      const head = new THREE.SphereGeometry(0.22, 6, 5);
      head.translate(gx3, GY + 1.4, gz3);
      RR.City.tintGeom(head, 0xd8b190, 0, rng); geoms2.push(head);
    }

    // ---------- DuSable Harbor: dock fingers + moored boats south of the mouth ----------
    // min clearance from BOTH race corridors (lakeGuide + lakeLoop): >0 means safely outside
    const basinClear = (x, z) => {
      const a = U().pathNearest(RR.River.paths.lakeGuide, x, z);
      const b = U().pathNearest(RR.River.paths.lakeLoop, x, z);
      return Math.min(a.dist - a.w - 15, b.dist - b.w - 15);
    };
    const hullCols = [0x2b4a6b, 0x6b2b2b, 0xdfe0e2, 0x3a5a45, 0x8a3a2a];
    const dockX0 = 1932, dockLen = 80;
    for (const dz of [130, 230, 330]) {
      if (basinClear(dockX0, dz) <= 0 || basinClear(dockX0 + dockLen, dz) <= 0) continue;
      const deckG = new THREE.BoxGeometry(dockLen + 4, 0.7, 3.2);    // finger deck off the seawall
      deckG.translate(dockX0 + dockLen / 2, 0.85, dz);
      RR.City.tintGeom(deckG, 0x8a7c62, 0.08, rng); geoms2.push(deckG);
      for (let d = 4; d <= dockLen; d += 14) {                       // pilings under the deck
        for (const s of [-1, 1]) {
          const pile = new THREE.CylinderGeometry(0.3, 0.38, 2.4, 5);
          pile.translate(dockX0 + d, 0.5, dz + s * 1.4);
          RR.City.tintGeom(pile, 0x4a3c2c, 0.08, rng); geoms2.push(pile);
        }
      }
      RR.River.addObstacle(dockX0 + dockLen + 2, dz, 4);             // boats can't clip the finger tip
      for (let k = 0; k < 7; k++) {                                  // moored boats between the fingers
        const mbx = dockX0 + 12 + k * 11, side = (k % 2) ? 1 : -1, mbz = dz + side * 5.4;
        if (basinClear(mbx, mbz) <= 0) continue;
        const sc = 0.55 + rng() * 0.3;
        const hull = new THREE.BoxGeometry(6.5 * sc, 1.1 * sc, 2.3 * sc);
        const hp = hull.attributes.position;
        for (let i = 0; i < hp.count; i++) { if (Math.abs(hp.getX(i)) > 2.4 * sc) hp.setZ(i, hp.getZ(i) * 0.35); }
        hull.computeVertexNormals();
        hull.translate(mbx, 0.55 * sc, mbz);
        RR.City.tintGeom(hull, hullCols[(k + (dz / 10 | 0)) % hullCols.length], 0.06, rng); geoms2.push(hull);
        if (k % 3 !== 2) {                                           // most are sailboats, some motorboats
          const mast = new THREE.CylinderGeometry(0.09 * sc, 0.11 * sc, 9 * sc, 5);
          mast.translate(mbx, 5 * sc, mbz);
          RR.City.tintGeom(mast, 0xcfcabc, 0, rng); geoms2.push(mast);
        } else {
          boxAt(geoms2, 2.2 * sc, 0.9 * sc, 1.6 * sc, mbx - 0.6 * sc, 1.4 * sc, mbz, 0xe8e4d8);
        }
      }
    }
    // small harbor office on the shore behind the seawall
    const hoX = 1896, hoZ = 230;
    if (RR.City.landClearance(hoX, hoZ) > 6) {
      boxAt(geoms2, 15, 5.4, 9, hoX, CGY + 2.7, hoZ, 0x99a5ad);
      boxAt(geoms2, 16, 0.7, 10, hoX, CGY + 5.75, hoZ, 0x5b656d);    // flat roof cap
      boxAt(geoms2, 1.6, 2.6, 0.4, hoX + 7.5, CGY + 1.3, hoZ, 0x2c3a44);  // door on the harbor side
      boxAt(geoms2, 0.4, 4.6, 0.4, hoX + 10, CGY + 2.3, hoZ + 8, 0x555a60);
      if (RR.Theme) RR.Theme.addLamp(hoX + 10, CGY + 4.8, hoZ + 8, 0xffe6b0);
    }

    // ---------- seawall trail along the Streeterville shore: mouth → pier root ----------
    // south edge of the slab (z=-135) then north up the east edge (x=2186) to the pier
    boxAt(geoms2, 252, 0.08, 3.5, 2055, GY + 0.06, -142.5, 0xb9ac92);        // south trail strip
    boxAt(geoms2, 256, 0.9, 1.3, 2056, GY + 0.45, -136.8, 0x9a988e);         // south low seawall lip
    boxAt(geoms2, 3.5, 0.08, 185, 2180.5, GY + 0.06, -232, 0xb9ac92);        // east trail strip
    boxAt(geoms2, 1.3, 0.9, 190, 2184.6, GY + 0.45, -230, 0x9a988e);         // east low seawall lip
    for (const sx of [1950, 2010, 2070, 2130]) {
      boxAt(geoms2, 0.4, 4.6, 0.4, sx, GY + 2.3, -145, 0x555a60);
      if (RR.Theme) RR.Theme.addLamp(sx, GY + 4.8, -145, 0xffe6b0);
    }
    for (const sz of [-180, -240, -300]) {
      boxAt(geoms2, 0.4, 4.6, 0.4, 2178, GY + 2.3, sz, 0x555a60);
      if (RR.Theme) RR.Theme.addLamp(2178, GY + 4.8, sz, 0xffe6b0);
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

    // ---------- per-frame: wheel, wheel LEDs, lighthouse characteristic, lock cycle ----------
    const _gm = new THREE.Matrix4(), _gp = new THREE.Vector3();
    // two scratch quaternions, never one: the gondolas need a permanent identity — a real wheel
    // hangs its cars level however far it has turned — and the lock leaves rewrite theirs each frame
    const _qHang = new THREE.Quaternion(), _qGate = new THREE.Quaternion();
    const _gs = new THREE.Vector3(1, 1, 1), _up = new THREE.Vector3(0, 1, 0);
    const LIT = { night: 1, dusk: 0.72, sunset: 0.35, day: 0 };   // dusk is blue hour, not daylight
    let gateF = 0;                                               // 0 = wide open, 1 = mitred shut
    RR.Engine.onUpdate((dt, t) => {
      const w = wheel;
      w.spinner.rotation.z += dt * 0.021;                        // 3 revolutions in ~15 min, as ridden
      const base = w.spinner.rotation.z;
      for (let i = 0; i < w.N; i++) {
        const a = base + (i / w.N) * Math.PI * 2;
        _gp.set(Math.cos(a) * w.r, Math.sin(a) * w.r, 0);        // hung from the non-spinning parent
        _gm.compose(_gp, _qHang, _gs);
        w.gonds.setMatrixAt(i, _gm);
      }
      w.gonds.instanceMatrix.needsUpdate = true;
      const lit = (RR.Theme && LIT[RR.Theme.mode] !== undefined) ? LIT[RR.Theme.mode] : 0;
      const hue = (t * 0.05) % 1;
      w.mats[0].emissive.setHSL(hue, 0.6, 0.5); w.mats[0].emissiveIntensity = lit * 1.4;   // structure
      w.mats[1].emissive.setHSL(hue, 0.6, 0.5); w.mats[1].emissiveIntensity = lit * 0.7;   // gondolas
      // Fl R 5s: 0.4 s of red every 5 s, nothing in between.
      LK._beacon.intensity = (t % 5 < 0.4) ? 3.2 : 0;

      // A lock never closes on a boat in the chamber. 45 s cycle, 8 s swing, and if anyone is
      // between the sills the gates stall wide open until they are through.
      const S = RR.Race && RR.Race.state && RR.Race.state();
      let occupied = false;
      if (S && S.boats) {
        for (const b of S.boats) {
          if (!b || !b.pos) continue;
          const ds = (b.pos.x - lock.x) * ldx + (b.pos.z - lock.z) * ldz;
          const dp = (b.pos.x - lock.x) * lperp.x + (b.pos.z - lock.z) * lperp.z;
          // 120 m of approach: at 30 m/s that is four seconds, and the leaves swing back in three
          if (ds > GS0 - 120 && ds < GS1 + 120 && Math.abs(dp) < lock.w * 1.5) { occupied = true; break; }
        }
      }
      const cyc = t % 45;
      const want = (!occupied && cyc > 22 && cyc < 36) ? 1 : 0;
      gateF += U().clamp(want - gateF, -dt / 3, dt / 8);   // closes in 8 s, clears out in 3
      for (let i = 0; i < leaves.length; i++) {
        const L = leaves[i];
        _gp.set(L.x, 2.0, L.z);
        _qGate.setFromAxisAngle(_up, L.open + (L.shut - L.open) * gateF);
        _gm.compose(_gp, _qGate, _gs);
        gateMesh.setMatrixAt(i, _gm);
      }
      gateMesh.instanceMatrix.needsUpdate = true;
      sigMat.color.setHex(gateF > 0.02 ? 0xff2a1e : 0x12ff4a).convertSRGBToLinear();
    });
  };

  RR.Lake = LK;
})();

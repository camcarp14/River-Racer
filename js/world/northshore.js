/* River Racer — the north lakefront wall: Oak Street Beach, the Gold Coast icons,
   Lincoln Park, North Avenue Beach, and Lakeview, fronted by an extended Lake Shore
   Drive with streaming traffic. This is the postcard view north from the lake.
   Game geography compresses the real north side: west→east along this shore reads
   as Gold Coast→Lincoln Park→Lakeview (south→north in the real city). */
(function () {
  const NS = { tags: [] };
  const U = () => RR.U;
  let rng;

  NS.init = function () {
    rng = U().mulberry(90210);
    const C = window.CHICAGO;
    const GY = 2.2;                      // lakefront slab level (matches Olive Park)
    const CGY = RR.City.GROUND_Y;        // city plateau level (6.0)
    const shafts = [];                   // window-facade geoms → RR.City.material()
    const flats = [];                    // everything else → flatMaterial
    const scene = RR.Engine.scene;

    function boxAt(arr, w, h, d, x, y, z, col, rotY, jit) {
      const g = new THREE.BoxGeometry(w, h, d);
      if (rotY) g.rotateY(rotY);
      g.translate(x, y, z);
      RR.City.tintGeom(g, col, jit == null ? 0.08 : jit, rng);
      arr.push(g);
    }
    function cylAt(arr, r0, r1, h, seg, x, y, z, col) {
      const g = new THREE.CylinderGeometry(r0, r1, h, seg);
      g.translate(x, y, z);
      RR.City.tintGeom(g, col, 0.06, rng);
      arr.push(g);
    }
    function treeAt(x, z, s, baseY) {
      const b = baseY == null ? GY : baseY;
      cylAt(flats, 0.2 * s, 0.3 * s, 2.4 * s, 5, x, b + 1.2 * s, z, 0x4a3524);
      const crown = new THREE.SphereGeometry((1.9 + rng() * 1.3) * s, 6, 5);
      crown.scale(1, 0.8, 1);
      crown.translate(x, b + (3.7 + rng()) * s, z);
      RR.City.tintGeom(crown, rng() > 0.5 ? 0x41703a : 0x527d40, 0.2, rng);
      flats.push(crown);
    }
    function lampAt(x, z, baseY) {
      const b = baseY == null ? GY : baseY;
      boxAt(flats, 0.4, 5.4, 0.4, x, b + 2.7, z, 0x555a60);
      if (RR.Theme) RR.Theme.addLamp(x, b + 5.6, z, 0xffe0a8);
    }

    // ================= TERRAIN =================
    // Slab A: the Gold Coast corner, continuing the Streeterville slab north.
    // The existing slab (lake.js) ends at z=-985; we leave a 65m cove of open water
    // at z -1030..-985 which becomes Oak Street Beach — echoing the real curve.
    boxAt(flats, 260, GY + 2, 1370, 2056, (GY + 2) / 2 - 2, -1715, 0x74815f, 0, 0.06);
    // Slab B: the long Lincoln Park / Lakeview shelf east of the corner.
    boxAt(flats, 2114, GY + 2, 1350, 3243, (GY + 2) / 2 - 2, -1725, 0x74815f, 0, 0.06);
    // Retaining wall where the city plateau (y=6) meets the lakefront shelf (y=2.2)
    for (let z0 = -2380; z0 < -1050; z0 += 60) {
      boxAt(flats, 5, CGY - GY + 0.4, 60.5, 1924, GY + (CGY - GY) / 2 - 0.1, z0 + 30, 0x8f8c80, 0, 0.1);
    }
    // stepped stone revetment along the waterline z=-1050 (broken by North Ave Beach)
    for (let x0 = 2186; x0 < 4290; x0 += 40) {
      if (x0 > 2640 && x0 < 3140) continue;                    // beach takes this reach
      boxAt(flats, 40.4, 1.6, 7, x0 + 20, 0.8, -1053, 0x9a988e, 0, 0.1);
      boxAt(flats, 40.4, 1.2, 4, x0 + 20, 1.8, -1051, 0xa5a296, 0, 0.1);
    }
    // lakefront trail along the top of the revetment
    for (let x0 = 2186; x0 < 4290; x0 += 30) {
      boxAt(flats, 30.6, 0.08, 4.2, x0 + 15, GY + 0.06, -1062 - Math.sin(x0 * 0.004) * 6, 0xb9ac92);
    }
    // north tree line so the shelf fades into green instead of ending on a cliff
    for (let x0 = 1980; x0 < 4260; x0 += 26) {
      treeAt(x0 + (rng() - 0.5) * 18, -2330 - rng() * 60, 1.0 + rng() * 0.6);
    }

    // ================= OAK STREET BEACH =================
    // sand fills the cove and wraps the corner; boats can't reach past the buoy line
    {
      const sand = new THREE.BoxGeometry(258, 1.0, 78);
      sand.translate(2057, 0.35, -1012);
      const sp = sand.attributes.position;
      for (let i = 0; i < sp.count; i++) {                     // slope: low at the water (south/east), high inland
        if (sp.getY(i) > 0) {
          const fx = (sp.getX(i) - 1928) / 258, fz = (sp.getZ(i) + 1051) / 78;
          sp.setY(sp.getY(i) + U().clamp(1.1 * (1 - fx * 0.4) * U().clamp(fz + 0.35, 0, 1), 0, 1.6));
        }
      }
      sand.computeVertexNormals();
      RR.City.tintGeom(sand, 0xd9c69a, 0.05, rng);
      flats.push(sand);
      RR.River.addWall(1930, -1046, 2184, -1046, 2);           // boats ground out at the sand line
      RR.River.addWall(2184, -1048, 2184, -986, 2);            // …and can't slip into the cove mouth
      for (let i = 0; i < 6; i++) {                            // swim buoys across the cove mouth
        const bx = 1960 + i * 42;
        cylAt(flats, 0.5, 0.5, 0.7, 6, bx, 0.35, -988, 0xd94f30);
      }
      for (let i = 0; i < 6; i++) {                            // umbrellas + a few beachgoers
        const ux = 1970 + rng() * 190, uz = -1040 + rng() * 24;
        cylAt(flats, 0.06, 0.06, 2.2, 4, ux, 2.2, uz, 0xe8e4da);
        const cone = new THREE.ConeGeometry(1.5, 0.8, 7);
        cone.translate(ux, 3.3, uz);
        RR.City.tintGeom(cone, [0xd94f30, 0xe8b53a, 0x3a7bd9, 0xd457a0][i % 4], 0.05, rng);
        flats.push(cone);
      }
      NS.tags.push({ name: 'OAK STREET BEACH', x: 2057, z: -1010, r2: 200 * 200 });
    }

    // ================= NORTH AVENUE BEACH =================
    {
      const sand = new THREE.BoxGeometry(500, 1.1, 60);
      sand.translate(2890, 0.4, -1052);
      const sp = sand.attributes.position;
      for (let i = 0; i < sp.count; i++) {
        if (sp.getY(i) > 0) sp.setY(sp.getY(i) + U().clamp(((-(sp.getZ(i)) - 1052) / 60 + 0.5) * 1.4, 0, 1.5));
      }
      sand.computeVertexNormals();
      RR.City.tintGeom(sand, 0xdccb9e, 0.05, rng);
      flats.push(sand);
      RR.River.addWall(2642, -1046, 3140, -1046, 2);

      // the ocean-liner beach house: white hull, rounded prow (west), blue trim + funnels
      const hx = 2890, hz = -1075, HY = 1.6;
      boxAt(flats, 86, 6.4, 13, hx, HY + 3.2, hz, 0xf2f1ec, 0, 0.03);            // hull
      cylAt(flats, 6.5, 6.5, 6.4, 12, hx - 43, HY + 3.2, hz, 0xf2f1ec);          // rounded prow
      boxAt(flats, 60, 3.4, 10, hx + 6, HY + 8.1, hz, 0xf2f1ec, 0, 0.03);        // upper deck
      boxAt(flats, 87, 0.5, 13.6, hx, HY + 6.6, hz, 0x2660a8);                   // blue belt line
      boxAt(flats, 61, 0.4, 10.4, hx + 6, HY + 9.9, hz, 0x2660a8);               // upper trim
      for (const s of [-1, 1]) cylAt(flats, 1.7, 2.1, 5.2, 8, hx + 14 + s * 17, HY + 12.2, hz, 0x2660a8); // funnels
      for (let i = 0; i < 10; i++) {                                             // umbrellas
        const ux = 2680 + rng() * 420, uz = -1050 + rng() * 20;
        cylAt(flats, 0.06, 0.06, 2.2, 4, ux, 2.3, uz, 0xe8e4da);
        const cone = new THREE.ConeGeometry(1.5, 0.8, 7);
        cone.translate(ux, 3.4, uz);
        RR.City.tintGeom(cone, [0x3a7bd9, 0xd94f30, 0x39a06a, 0xe8b53a][i % 4], 0.05, rng);
        flats.push(cone);
      }
      NS.tags.push({ name: 'NORTH AVENUE BEACH', x: 2890, z: -1060, r2: 220 * 220 });
    }

    // ================= LINCOLN PARK strip (trees between the Drive and the shore) =================
    for (let x0 = 2200; x0 < 4200; x0 += 22) {
      const tz = -1072 - rng() * 46;
      if (x0 > 2640 && x0 < 3150 && tz > -1090) continue;      // keep the beach open
      if (rng() < 0.72) treeAt(x0 + (rng() - 0.5) * 14, tz, 0.9 + rng() * 0.7);
    }
    for (let x0 = 2250; x0 < 4150; x0 += 130) lampAt(x0, -1064);
    // Theater on the Lake: low red-brick hall with arched openings, on the park strip
    {
      const tx = 2560, tz = -1082;
      boxAt(flats, 40, 7, 16, tx, GY + 3.5, tz, 0x8a4a34, 0, 0.06);
      boxAt(flats, 42, 1.6, 18, tx, GY + 7.8, tz, 0x5f7362);                     // green roof
      for (let i = -3; i <= 3; i++) boxAt(flats, 3.2, 4.4, 0.5, tx + i * 5.4, GY + 2.6, tz + 8.1, 0x2c2620); // arches
      NS.tags.push({ name: 'THEATER ON THE LAKE', x: tx, z: tz, r2: 120 * 120 });
    }
    NS.tags.push({ name: 'LINCOLN PARK', x: 3300, z: -1150, r2: 260 * 260 });

    // ================= LAKE SHORE DRIVE =================
    // The viaduct (x=1359, deck 11.1) ends at z=-940. Sweep northeast down to the
    // shelf, then run straight east along z=-1140. Cars stream the whole polyline.
    const road = [];                                            // [{x,z,y}] centerline
    {
      const P0 = { x: 1359, z: -940 }, P1 = { x: 1620, z: -1035 }, P2 = { x: 2150, z: -1140 };
      for (let i = 0; i <= 14; i++) {
        const t = i / 14, a = 1 - t;
        road.push({
          x: a * a * P0.x + 2 * a * t * P1.x + t * t * P2.x,
          z: a * a * P0.z + 2 * a * t * P1.z + t * t * P2.z,
          y: 11.1 + (3.1 - 11.1) * (t * t * (3 - 2 * t)),      // smooth descent to the shelf
        });
      }
      for (let x0 = 2190; x0 <= 4210; x0 += 40) road.push({ x: x0, z: -1140, y: 3.1 });
    }
    for (let i = 0; i < road.length - 1; i++) {
      const a = road[i], b = road[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z), ang = Math.atan2(b.x - a.x, b.z - a.z);
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, my = (a.y + b.y) / 2;
      boxAt(flats, 19, 1.1, len + 0.6, mx, my - 0.55, mz, 0x63676d, ang, 0.04);   // deck
      boxAt(flats, 0.55, 0.05, len + 0.6, mx, my + 0.02, mz, 0xe8c94a, ang);      // median stripe
      const nx = Math.cos(ang), nz = -Math.sin(ang);
      for (const s of [-1, 1]) {
        boxAt(flats, 0.5, 0.9, len + 0.6, mx + nx * 9.4 * s, my + 0.45, mz + nz * 9.4 * s, 0x9aa0a6, ang);
      }
      if (my > GY + 1.6) {                                      // piers under the descending ramp
        const groundY = mx < 1926 ? CGY : GY;
        if (my - 1.1 > groundY + 0.5) {
          boxAt(flats, 3.2, my - 1.1 - groundY, 2.8, mx, groundY + (my - 1.1 - groundY) / 2, mz, 0x8b8880);
        }
      }
      if (i % 3 === 0) lampAt(mx + nx * 10.6, mz + nz * 10.6, my - GY + GY - 0.1);
    }

    // streaming traffic on the new stretch — one InstancedMesh, both directions
    const seg = [];                                             // cumulative arc-length table
    let roadLen = 0;
    for (let i = 0; i < road.length - 1; i++) {
      const l = Math.hypot(road[i + 1].x - road[i].x, road[i + 1].z - road[i].z);
      seg.push({ i, s0: roadLen, l });
      roadLen += l;
    }
    function roadAt(s, out) {
      s = ((s % roadLen) + roadLen) % roadLen;
      let lo = 0, hi = seg.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (seg[mid].s0 <= s) lo = mid; else hi = mid - 1; }
      const sg = seg[lo], a = road[sg.i], b = road[sg.i + 1], t = (s - sg.s0) / sg.l;
      out.x = a.x + (b.x - a.x) * t; out.z = a.z + (b.z - a.z) * t; out.y = a.y + (b.y - a.y) * t;
      out.tx = (b.x - a.x) / sg.l; out.tz = (b.z - a.z) / sg.l;
      return out;
    }
    const carGeoms = [];
    {
      const body = new THREE.BoxGeometry(1.9, 0.85, 4.3); body.translate(0, 0.65, 0); carGeoms.push(body);
      const cab = new THREE.BoxGeometry(1.7, 0.62, 2.2); cab.translate(0, 1.35, -0.2);
      RR.City.tintGeom(cab, 0x1c2126, 0, rng); carGeoms.push(cab);
    }
    const CARCOLS = [0xd8dce0, 0x8a1f1f, 0x1f3f8a, 0x2c2f33, 0xb8b23a, 0x676c72, 0x8a5b2c];
    const nsCars = new THREE.InstancedMesh(RR.City.mergeGeoms(carGeoms), new THREE.MeshLambertMaterial({}), 26);
    nsCars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const carState = [];
    for (let i = 0; i < 26; i++) {
      carState.push({ s: rng() * roadLen, dir: i % 2 ? 1 : -1, spd: 14 + rng() * 6 });
      nsCars.setColorAt(i, new THREE.Color(CARCOLS[(rng() * CARCOLS.length) | 0]));
    }
    if (nsCars.instanceColor) nsCars.instanceColor.needsUpdate = true;
    nsCars.layers.set(1);
    scene.add(nsCars);

    // ================= THE TOWER WALL =================
    // detailed residential builder: window shaft + balcony strips / floor bands / bays
    const PAL = [0xc8b490, 0xe8e4da, 0x9c5340, 0x2e3b46, 0x98a0a8, 0xd8b8a8, 0xb5a284];
    function resi(x, z, w, d, h, col, style) {
      const g = RR.City.towerGeom(w, h, d, x, z, 0);
      g.translate(0, GY, 0);
      RR.City.tintGeom(g, col, 0.16, rng);
      shafts.push(g);
      boxAt(flats, w + 0.4, 3.6, d + 0.4, x, GY + 1.8, z, 0x3b3f45, 0, 0.08);     // street-level base
      boxAt(flats, w + 0.7, 1.1, d + 0.7, x, GY + h - 0.3, z, 0x565c64, 0, 0.1);  // parapet
      if (style === 0) {                                        // balcony strips on the lake face
        const n = Math.max(2, Math.floor(w / 8));
        for (let i = 0; i < n; i++) {
          const o = -w / 2 + (i + 0.75) * (w / n);
          boxAt(flats, 1.3, h * 0.9, 0.7, x + o, GY + h * 0.47, z + d / 2 + 0.3, 0xe4e0d4, 0, 0.1);
        }
      } else if (style === 1) {                                 // horizontal floor bands
        for (let y = 13; y < h - 4; y += 14.4) {
          boxAt(flats, w + 0.9, 0.42, d + 0.9, x, GY + y, z, 0xdfdbd0, 0, 0.08);
        }
      } else if (style === 2) {                                 // corner bay columns
        for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
          boxAt(flats, 2.4, h * 0.94, 2.4, x + sx * (w / 2 - 0.6), GY + h * 0.47, z + sz * (d / 2 - 0.6), 0xd8d4c8, 0, 0.12);
        }
      }
      if (rng() < 0.3) cylAt(flats, 1.1, 1.3, 2.6, 8, x + (rng() - 0.5) * w * 0.4, GY + h + 1.3, z + (rng() - 0.5) * d * 0.4, 0x4a4034);
      if (h > 100 && rng() < 0.5) {                             // setback crown
        const g2 = RR.City.towerGeom(w * 0.6, h * 0.22, d * 0.6, x, z, 0);
        g2.translate(0, GY + h, 0);
        RR.City.tintGeom(g2, col, 0.16, rng);
        shafts.push(g2);
      }
    }

    // ---- Gold Coast icons at the west end (in real south→north order) ----
    // One Magnificent Mile: three bundled hexagonal prisms, pink-beige granite
    {
      const ox = 1985, oz = -1250, PINK = 0xd3b09a;
      for (const [dx, dz, hh, r] of [[0, 8, 205, 13], [16, -6, 160, 11], [-15, -8, 120, 10]]) {
        const hex = new THREE.CylinderGeometry(r, r, hh, 6);
        hex.translate(ox + dx, GY + hh / 2, oz + dz);
        RR.City.tintGeom(hex, PINK, 0.08, rng);
        shafts.push(hex);
      }
      NS.tags.push({ name: 'ONE MAGNIFICENT MILE', x: ox, z: oz, r2: 150 * 150 });
    }
    // The Drake Hotel: broad limestone H-block + red rooftop sign
    {
      const dx2 = 2090, dz2 = -1235;
      const g = RR.City.towerGeom(62, 34, 26, dx2, dz2, 0); g.translate(0, GY, 0);
      RR.City.tintGeom(g, 0xcfc2a4, 0.06, rng); shafts.push(g);
      for (const s of [-1, 1]) {                                // H-plan end wings
        const wing = RR.City.towerGeom(16, 40, 30, dx2 + s * 24, dz2, 0); wing.translate(0, GY, 0);
        RR.City.tintGeom(wing, 0xcfc2a4, 0.06, rng); shafts.push(wing);
        boxAt(flats, 17, 3.2, 31, dx2 + s * 24, GY + 41.4, dz2, 0x4a4640);       // dark hipped roof masses
      }
      boxAt(flats, 63, 2.4, 27, dx2, GY + 35, dz2, 0x4a4640);
      const signTex = U().canvasTexture(256, 48, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#e33224'; ctx.font = 'bold 40px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('THE DRAKE', w / 2, h / 2 + 2);
      });
      const sg = new THREE.PlaneGeometry(24, 4.5);
      const sMesh = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: signTex, transparent: true, side: THREE.DoubleSide }));
      sMesh.position.set(dx2, GY + 40.5, dz2 + 2);
      sMesh.layers.set(1);
      scene.add(sMesh);
      if (RR.Theme) RR.Theme.addLamp(dx2, GY + 41, dz2 + 2, 0xff5040);
      NS.tags.push({ name: 'THE DRAKE', x: dx2, z: dz2, r2: 150 * 150 });
    }
    // Palmolive Building: buff deco setbacks + the rotating Lindbergh Beacon
    let beacon = null;
    {
      const px = 2175, pz = -1290;
      const tiers = [[30, 24, 0, 0.38], [24, 19, 0.38, 0.62], [18, 15, 0.62, 0.82], [13, 11, 0.82, 1]];
      const H = 172;
      for (const [w, d, f0, f1] of tiers) {
        const g = RR.City.towerGeom(w, H * (f1 - f0), d, px, pz, 0);
        g.translate(0, GY + H * f0, 0);
        RR.City.tintGeom(g, 0xc9b78e, 0.06, rng);
        shafts.push(g);
      }
      cylAt(flats, 0.5, 0.9, 14, 6, px, GY + H + 7, pz, 0xd8dadd);               // beacon mast
      const cone = new THREE.ConeGeometry(3.2, 85, 8, 1, true);
      cone.rotateZ(Math.PI / 2);                                 // point outward, beam along +x
      cone.translate(42, 0, 0);
      beacon = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ color: 0xfff8e0, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
      beacon.position.set(px, GY + H + 13, pz);
      beacon.layers.set(1);
      scene.add(beacon);
      if (RR.Theme) RR.Theme.addLamp(px, GY + H + 13, pz, 0xfff2c0);
      NS.tags.push({ name: 'PALMOLIVE BEACON', x: px, z: pz, r2: 150 * 150 });
    }
    // 900/990 N Lake Shore: Mies black steel-and-glass twins, set perpendicular
    {
      for (const [bx, bz, w, d] of [[2280, -1245, 22, 40], [2330, -1268, 40, 22]]) {
        const g = RR.City.towerGeom(w, 82, d, bx, bz, 0); g.translate(0, GY, 0);
        RR.City.tintGeom(g, 0x1e242a, 0.05, rng); shafts.push(g);
        boxAt(flats, w + 0.5, 0.8, d + 0.5, bx, GY + 82, bz, 0x14181c);
      }
    }
    // The Carlyle: white slab with protruding bay columns
    resi(2410, -1255, 34, 20, 122, 0xe8e4da, 2);
    // 1212 N LSD (buff deco) + 1550 N LSD (white International slab)
    resi(2480, -1270, 26, 22, 140, 0xc8b490, 1);
    resi(2555, -1250, 38, 18, 108, 0xe4e0d6, 0);

    // Elks Memorial: white classical dome + colonnade, set back in the park
    {
      const ex = 3060, ez = -1490;
      boxAt(flats, 46, 12, 34, ex, GY + 6, ez, 0xe6e2d6, 0, 0.03);
      cylAt(flats, 15, 17, 10, 14, ex, GY + 17, ez, 0xe6e2d6);
      const dome = new THREE.SphereGeometry(13.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      dome.translate(ex, GY + 22, ez);
      RR.City.tintGeom(dome, 0xb9c2b4, 0.04, rng);
      flats.push(dome);
      for (let i = -3; i <= 3; i++) cylAt(flats, 0.9, 0.9, 11, 6, ex + i * 5.6, GY + 5.5, ez + 18.5, 0xe6e2d6);
      NS.tags.push({ name: 'ELKS MEMORIAL', x: ex, z: ez, r2: 140 * 140 });
    }

    // ---- the residential wall: staggered rows, height bands west→east ----
    const rows = [
      { z: -1255, jitter: 26, gap: [64, 96] },
      { z: -1425, jitter: 34, gap: [70, 110] },
      { z: -1640, jitter: 60, gap: [95, 150] },
    ];
    const iconRects = [
      [1930, 2060, -1320, -1180],  // One Mag Mile
      [2020, 2160, -1290, -1180],  // Drake
      [2130, 2220, -1340, -1240],  // Palmolive
      [2250, 2360, -1300, -1215],  // Mies twins
      [2380, 2590, -1300, -1210],  // Carlyle/1212/1550
      [3000, 3130, -1550, -1430],  // Elks
    ];
    function iconClear(x, z) {
      for (const r of iconRects) if (x > r[0] - 20 && x < r[1] + 20 && z > r[2] - 20 && z < r[3] + 20) return false;
      return true;
    }
    for (const row of rows) {
      let x = 1980 + rng() * 60;
      while (x < 4150) {
        const z = row.z + (rng() - 0.5) * row.jitter;
        const band = x < 2650 ? [70, 200] : x < 3300 ? [50, 145] : [36, 110];   // GC → LP → Lakeview
        if (iconClear(x, z)) {
          const w = 24 + rng() * 22, d = 18 + rng() * 16;
          let h = band[0] + rng() * rng() * (band[1] - band[0]);
          if (row.z < -1500) h *= 0.7;
          resi(x, z, w, d, Math.max(20, h), PAL[(rng() * PAL.length) | 0], (rng() * 3) | 0);
        }
        x += row.gap[0] + rng() * (row.gap[1] - row.gap[0]);
      }
    }
    // 2800 N Lakeview pair anchoring the east end
    resi(3960, -1260, 40, 20, 96, 0xe8e4da, 1);
    resi(4060, -1290, 22, 38, 88, 0x2e3b46, 0);

    // ================= BELMONT HARBOR =================
    // moored sailboat field in the water off the Lakeview end, clear of race lines
    const harborBoats = [];
    {
      const bg = [];
      let placed = 0;
      for (let i = 0; i < 30 && placed < 14; i++) {
        const bx = 3170 + rng() * 380, bz = -955 - rng() * 82;
        let ok = true;
        for (const key of ['lakeGuide', 'lakeLoop']) {
          const p = RR.River.paths[key];
          if (!p) continue;
          const q = U().pathNearest(p, bx, bz);
          if (q.dist - q.w < 100) { ok = false; break; }
        }
        if (!ok) continue;
        placed++;
        const yaw = rng() * Math.PI * 2;
        const hull = new THREE.BoxGeometry(1.15, 0.55, 3.4);
        hull.rotateY(yaw); hull.translate(bx, 0.28, bz);
        RR.City.tintGeom(hull, [0xf2f1ec, 0x2c4a66, 0x8a3b2c][i % 3], 0.08, rng);
        bg.push(hull);
        const mast = new THREE.CylinderGeometry(0.05, 0.07, 4.6, 4);
        mast.translate(bx, 2.6, bz);
        RR.City.tintGeom(mast, 0xd8d4c8, 0, rng);
        bg.push(mast);
      }
      if (bg.length) {
        const hm = new THREE.Mesh(RR.City.mergeGeoms(bg), RR.City.flatMaterial());
        hm.castShadow = true;
        scene.add(hm);
        harborBoats.push(hm);
      }
      NS.tags.push({ name: 'BELMONT HARBOR', x: 3360, z: -1000, r2: 220 * 220 });
    }

    // ================= MERGE + ANIMATE =================
    const shaftMesh = new THREE.Mesh(RR.City.mergeGeoms(shafts), RR.City.material());
    shaftMesh.castShadow = shaftMesh.receiveShadow = true;
    scene.add(shaftMesh);
    const flatMesh = new THREE.Mesh(RR.City.mergeGeoms(flats), RR.City.flatMaterial());
    flatMesh.castShadow = flatMesh.receiveShadow = true;
    scene.add(flatMesh);

    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3();
    const _s = new THREE.Vector3(1, 1, 1), _up = new THREE.Vector3(0, 1, 0), _pt = {};
    RR.Engine.onUpdate((dt, t) => {
      for (let i = 0; i < carState.length; i++) {               // LSD traffic
        const c = carState[i];
        c.s += c.spd * c.dir * dt;
        roadAt(c.s, _pt);
        const nx = _pt.tz * -1, nz = _pt.tx;                    // right-hand lane offset
        const lane = 4.6 * c.dir;
        _q.setFromAxisAngle(_up, Math.atan2(_pt.tx * c.dir, _pt.tz * c.dir));
        _p.set(_pt.x + nx * lane, _pt.y - 0.15, _pt.z + nz * lane);
        _m.compose(_p, _q, _s);
        nsCars.setMatrixAt(i, _m);
      }
      nsCars.instanceMatrix.needsUpdate = true;
      if (beacon) beacon.rotation.y = t * 0.9;                  // Lindbergh Beacon sweep
      for (const hm of harborBoats) {                           // gentle harbor swell
        hm.position.y = Math.sin(t * 0.6) * 0.06;
        hm.rotation.z = Math.sin(t * 0.45) * 0.008;
      }
    });

    // expose the road centerline so the inland district keeps its blocks clear
    NS.roadPts = road;
  };

  RR.Northshore = NS;
})();

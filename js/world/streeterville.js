/* River Racer — Streeterville + Gold Coast inland: the Magnificent Mile spine
   (Water Tower Place, Park Tower, the Old Water Tower castle, Olympia Centre),
   dense residential blocks, and Gold Coast row-house streets, so the Hancock
   stands in a real neighborhood instead of an empty grid. Owns the rect
   x 250..1926, z -2600..-680 (city.js grid fill skips it). */
(function () {
  const SV = { tags: [] };
  const U = () => RR.U;
  let rng;

  SV.init = function () {
    rng = U().mulberry(1871);
    const C = window.CHICAGO;
    const GY = RR.City.GROUND_Y;         // this district sits on the city plateau (6.0)
    const flats = [];
    const scene = RR.Engine.scene;
    const PITCH = 118;                   // BLOCK 96 + STREET 22, matching the Loop grid

    // ---- facade families (W2's city.js). Guarded: if the family system is not there yet the
    // whole district falls back to the single legacy material and still builds. ----
    const HASFAM = !!(RR.City.FAM && RR.City.materials && RR.City.pickFamily);
    const NFAM = HASFAM ? RR.City.FAM.length : 1;
    const MASONRY = { 2: 1, 3: 1, 4: 1, 5: 1, 8: 1 };
    const shafts = [];                   // family bucket i → array of geometries
    for (let i = 0; i < NFAM; i++) shafts.push([]);
    const famTints = (f) => (HASFAM && RR.City.FAM[f] && RR.City.FAM[f].tints) || [0xc8b490, 0xe8e4da, 0x98a0a8];
    const pickFam = (h, x, z) => (HASFAM ? RR.City.pickFamily(rng, h, x, z) : 0);
    // tint + the vertical AO ramp + the family luminance normalise, in the one place
    function shaftTint(g, hex, jit, fam) {
      if (RR.City.tintGeomAO) RR.City.tintGeomAO(g, hex, jit, rng, GY, GY + 16, 0.66, 1.06);
      else RR.City.tintGeom(g, hex, jit, rng);
      if (RR.City.famNormalize) RR.City.famNormalize(g, HASFAM ? fam : 0);
      return g;
    }
    function pushShaft(g, fam) { shafts[HASFAM ? fam : 0].push(g); }

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
    function shade(hex, k) {
      const r = Math.min(255, ((hex >> 16) & 255) * k) | 0;
      const g = Math.min(255, ((hex >> 8) & 255) * k) | 0;
      const b = Math.min(255, (hex & 255) * k) | 0;
      return (r << 16) | (g << 8) | b;
    }
    // A box that ends in a flat top face is a bug: masonry gets band course / parapet / coping,
    // glass gets a louvred plant floor and a parapet fin.
    function crown(cx, cz, topY, w, d, fam, tint, rot) {
      if (MASONRY[fam]) {
        boxAt(flats, w + 1.4, 0.55, d + 1.4, cx, topY - 2.6, cz, shade(tint, 1.08), rot, 0);
        boxAt(flats, w + 0.5, 2.30, d + 0.5, cx, topY - 1.15, cz, shade(tint, 0.94), rot, 0);
        boxAt(flats, w + 1.0, 0.35, d + 1.0, cx, topY + 0.18, cz, shade(tint, 1.14), rot, 0);
      } else {
        boxAt(flats, w - 0.6, 3.20, d - 0.6, cx, topY + 1.6, cz, 0x4a5057, rot, 0);
        boxAt(flats, w + 0.3, 0.90, d + 0.3, cx, topY + 3.6, cz, 0x2f343a, rot, 0);
      }
    }
    function roofKit(cx, cz, topY, w, d, h, fam, tier) {
      const eo = Math.min(w, d) * 0.30;
      boxAt(flats, eo, 4.2, eo, cx + (rng() - 0.5) * w * 0.4, topY + 2.1, cz + (rng() - 0.5) * d * 0.4, 0x6b7178, 0, 0.06);
      if (h > 180 && RR.Theme) RR.Theme.addLamp(cx, topY + 1.2, cz, 0xff2a1e);
      if (tier === 0) return;
      if (h > 90 && rng() < 0.55) {
        const pw = w * (0.30 + rng() * 0.25), pd = d * (0.30 + rng() * 0.25), ph = 3.0 + rng() * 4.5;
        const px = cx + (rng() - 0.5) * w * 0.25, pz = cz + (rng() - 0.5) * d * 0.25;
        boxAt(flats, pw, ph, pd, px, topY + ph / 2, pz, 0x666c72, 0, 0.05);
        boxAt(flats, pw - 0.3, 0.9, pd - 0.3, px, topY + ph * 0.72, pz, 0x2b2f34, 0, 0);   // louvre band
      }
      if (h > 55 && rng() < (tier === 2 ? 0.5 : 0.28)) {
        const rad = 1.4 + rng() * 1.2, th = 2.6 + rng() * 1.4;
        cylAt(flats, rad, rad, th, 8, cx + (rng() - 0.5) * w * 0.4, topY + th / 2, cz + (rng() - 0.5) * d * 0.4, 0x51565c);
      }
      // rng draw before the family test: short-circuiting past it tied the rng stream to the
      // facade mix, so re-balancing the city palette relaid out every block here too
      if (tier === 2 && h < 80 && rng() < 0.4 && (fam === 2 || fam === 3 || fam === 4)) {
        const tx = cx + (rng() - 0.5) * w * 0.3, tz = cz + (rng() - 0.5) * d * 0.3;
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2 + 0.79;
          boxAt(flats, 0.18, 2.6, 0.18, tx + Math.cos(a) * 1.35, topY + 1.3, tz + Math.sin(a) * 1.35, 0x4a4034, 0, 0);
        }
        cylAt(flats, 1.7, 1.7, 3.6, 8, tx, topY + 4.4, tz, 0x6e4c2e);            // the wooden tank
        const cap = new THREE.ConeGeometry(1.85, 1.1, 8);
        cap.translate(tx, topY + 6.75, tz);
        RR.City.tintGeom(cap, 0x4a4034, 0, rng); flats.push(cap);
      }
    }
    // Two canopy layers, second only within 260 m of a centreline (the visible set) — CUT #1.
    function treeAt(x, z, s) {
      cylAt(flats, 0.22 * s, 0.34 * s, 3.0 * s, 5, x, GY + 1.5 * s, z, 0x4a3524);
      const r = (1.8 + rng() * 1.2) * s;
      const lower = new THREE.SphereGeometry(r, 7, 6);
      lower.scale(1, 0.72, 1);
      lower.translate(x, GY + 3.6 * s, z);
      RR.City.tintGeom(lower, 0x3f6a30, 0.18, rng);
      flats.push(lower);
      if (RR.City.landClearance(x, z) < 260) {
        const upper = new THREE.SphereGeometry(r * 0.72, 7, 6);
        upper.translate(x + (rng() - 0.5) * r * 0.5, GY + 5.4 * s, z + (rng() - 0.5) * r * 0.5);
        RR.City.tintGeom(upper, 0x5d8a42, 0.18, rng);
        flats.push(upper);
      }
    }

    // ---------- keep-outs: landmarks, the LSD ramp corridor, placed rects ----------
    const keepRects = [];
    for (const l of C.landmarks) {
      keepRects.push([l.x - l.w / 2 - 26, l.x + l.w / 2 + 26, l.z - l.d / 2 - 26, l.z + l.d / 2 + 26]);
    }
    const roadPts = (RR.Northshore && RR.Northshore.roadPts) || [];
    function clearOf(x, z, half) {
      for (const r of keepRects) {
        if (x + half > r[0] && x - half < r[1] && z + half > r[2] && z - half < r[3]) return false;
      }
      for (const p of roadPts) {
        if (p.x < 1000) continue;                              // corridor only matters up here
        const dx = x - p.x, dz = z - p.z;
        if (dx * dx + dz * dz < (half + 26) * (half + 26)) return false;
      }
      return RR.City.landClearance(x, z) > half * 1.42 + 2;
    }
    function claim(x, z, w, d) { keepRects.push([x - w / 2 - 6, x + w / 2 + 6, z - d / 2 - 6, z + d / 2 + 6]); }

    // ---------- detailed residential/commercial builder ----------
    // Setbacks are the 1923 zoning ordinance for masonry and a 45°-rotated chamfer for glass,
    // exactly as the Loop fabric does it, so the two districts read as one city.
    function resi(x, z, w, d, h, col, style, famIn) {
      const fam = famIn == null ? pickFam(h, x, z) : famIn;
      const T = famTints(fam);
      const tint = col == null ? T[(rng() * T.length) | 0] : col;
      const masonry = !!MASONRY[fam];
      const tier = RR.City.landClearance(x, z) < 260 ? 2 : 1;
      let topW = w, topD = d, topRot = 0;
      function shaft(sw, sd, y0, hh, rot) {
        const g = RR.City.towerGeom(sw, hh, sd, x, z, rot);
        g.translate(0, GY + y0, 0);
        shaftTint(g, tint, 0.16, fam);
        pushShaft(g, fam);
      }
      if (masonry && h > 120) {
        shaft(w, d, 0, h * 0.62, 0);
        shaft(w * 0.72, d * 0.72, h * 0.62, h * 0.24, 0);
        shaft(w * 0.46, d * 0.46, h * 0.86, h * 0.14, 0);
        topW = w * 0.46; topD = d * 0.46;
      } else if (!masonry && h > 150) {
        shaft(w, d, 0, h * 0.88, 0);
        shaft(w * 0.70, d * 0.70, h * 0.88, h * 0.12, Math.PI / 4);
        topW = w * 0.70; topD = d * 0.70; topRot = Math.PI / 4;
      } else {
        shaft(w, d, 0, h, 0);
      }
      // projecting retail podium + the canopy line — what makes street level read from below
      const RT = famTints(9);
      const band = RR.City.towerGeom(w + 1.2, 4.5, d + 1.2, x, z, 0);
      band.translate(0, GY, 0);
      shaftTint(band, RT[(rng() * RT.length) | 0], 0.10, 9);
      pushShaft(band, 9);
      boxAt(flats, w + 2.0, 0.5, d + 2.0, x, GY + 4.3, z, 0x3a3e44, 0, 0.04);
      if (style === 0 && h > 30) {
        const n = Math.max(2, Math.floor(w / 8));
        for (let i = 0; i < n; i++) {
          const o = -w / 2 + (i + 0.75) * (w / n);
          boxAt(flats, 1.3, h * 0.88, 0.7, x + o, GY + h * 0.46, z + d / 2 + 0.3, 0xe4e0d4, 0, 0.1);
        }
      } else if (style === 1 && h > 40) {
        for (let y = 13; y < h - 4; y += 14.4) boxAt(flats, w + 0.9, 0.42, d + 0.9, x, GY + y, z, 0xdfdbd0, 0, 0.08);
      } else if (style === 2) {
        for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
          boxAt(flats, 2.2, h * 0.92, 2.2, x + sx * (w / 2 - 0.5), GY + h * 0.46, z + sz * (d / 2 - 0.5), 0xd8d4c8, 0, 0.12);
        }
      }
      crown(x, z, GY + h, topW, topD, fam, tint, topRot);
      roofKit(x, z, GY + h, topW, topD, h, fam, tier);
    }
    // Gold Coast row houses: a shoulder-to-shoulder brick line with stepped colors
    function rowHouses(x0, z, count, ang) {
      const BROWNS = [0x8a4a34, 0x9c5c40, 0x6f4030, 0xa06a48, 0x7c4636];
      const dx = Math.sin(ang || 0), dz = Math.cos(ang || 0);
      for (let i = 0; i < count; i++) {
        const w = 11 + rng() * 3, h = 12 + rng() * 5;
        const x = x0 + dx * i * 12.5, zz = z + dz * i * 12.5;
        boxAt(flats, 12, h, 15, x, GY + h / 2, zz, BROWNS[(rng() * BROWNS.length) | 0], ang, 0.06);
        boxAt(flats, 3.4, h * 0.94, 1.2, x, GY + h * 0.47, zz - 8, 0xd8d0c0, ang, 0.1);   // bay strip
        boxAt(flats, 12.5, 0.8, 15.5, x, GY + h + 0.2, zz, 0x4a4640, ang);                 // cornice
      }
    }

    // ================= MAG MILE ICONS =================
    // Water Tower Place: broad marble retail base + dark chamfered tower
    {
      const x = 647, z = -1034;
      boxAt(flats, 62, 24, 52, x, GY + 12, z, 0xcfc8bc, 0, 0.04);
      boxAt(flats, 64, 1.2, 54, x, GY + 24.6, z, 0xe0dad0, 0, 0.03);   // marble base cornice
      const g = RR.City.towerGeom(30, 238, 30, x, z, 0);
      g.translate(0, GY + 24, 0);
      shaftTint(g, 0x4a4440, 0.06, 1);
      pushShaft(g, 1);                                                 // black-anodised: the Mies family
      const g2 = RR.City.towerGeom(22, 240, 22, x, z, Math.PI / 4);    // rotated overlay → chamfered read
      g2.translate(0, GY + 24, 0);
      shaftTint(g2, 0x524b46, 0.06, 1);
      pushShaft(g2, 1);
      crown(x, z, GY + 264, 30, 30, 1, 0x4a4440, 0);
      claim(x, z, 66, 56);
      SV.tags.push({ name: 'WATER TOWER PLACE', sub: 'LOEBL SCHLOSSMAN & HACKL · 1976 · 262 M', x, z, r2: 150 * 150 });
    }
    // Park Tower: slender buff tower with a green pyramidal cap
    {
      const x = 507, z = -1012;
      const g = RR.City.towerGeom(24, 244, 24, x, z, 0);
      g.translate(0, GY, 0);
      shaftTint(g, 0xc2a88e, 0.06, 4);
      pushShaft(g, 4);                                                 // buff terracotta family
      const cap = new THREE.ConeGeometry(15, 22, 4);
      cap.rotateY(Math.PI / 4);
      cap.translate(x, GY + 255, z);
      RR.City.tintGeom(cap, 0x6fa287, 0.04, rng);
      flats.push(cap);
      claim(x, z, 30, 30);
      SV.tags.push({ name: 'PARK TOWER', sub: 'LUCIEN LAGRANGE · 2000 · 257 M · MANSARD CROWN', x, z, r2: 150 * 150 });
    }
    // Olympia Centre: rosy granite, wide base tapering to a slim top
    {
      const x = 725, z = -1078;
      for (const [w, d, f0, f1] of [[42, 30, 0, 0.35], [32, 26, 0.35, 0.68], [22, 20, 0.68, 1]]) {
        const g = RR.City.towerGeom(w, 214 * (f1 - f0), d, x, z, 0);
        g.translate(0, GY + 214 * f0, 0);
        shaftTint(g, 0xb98d80, 0.06, 5);
        pushShaft(g, 5);                                               // pink granite: the 80s tell
      }
      crown(x, z, GY + 214, 22, 20, 5, 0xb98d80, 0);
      claim(x, z, 46, 34);
    }
    // The Old Water Tower + Pumping Station: the yellow-limestone castle pair
    {
      const x = 620, z = -1040, LIME = 0xd9c67a;
      boxAt(flats, 40, 0.25, 26, x + 20, GY + 0.13, z - 4, 0xb9ac92);            // plaza
      boxAt(flats, 9, 11, 9, x, GY + 5.5, z, LIME, 0, 0.05);                     // tower base
      cylAt(flats, 3.4, 4.2, 16, 8, x, GY + 19, z, LIME);                        // octagonal shaft
      cylAt(flats, 1.6, 2.2, 6, 8, x, GY + 30, z, LIME);                         // cupola
      const spike = new THREE.ConeGeometry(1.4, 4, 8);
      spike.translate(x, GY + 35, z);
      RR.City.tintGeom(spike, 0xb9a860, 0.04, rng);
      flats.push(spike);
      for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {             // corner turrets
        cylAt(flats, 0.9, 1.1, 5, 6, x + sx * 4.2, GY + 12.5, z + sz * 4.2, LIME);
        const tc = new THREE.ConeGeometry(1.0, 2.2, 6);
        tc.translate(x + sx * 4.2, GY + 16.1, z + sz * 4.2, LIME);
        RR.City.tintGeom(tc, 0xb9a860, 0.04, rng);
        flats.push(tc);
      }
      // pumping station: long castellated hall across the street
      const px = 686, pz = -1052;
      boxAt(flats, 40, 9, 15, px, GY + 4.5, pz, LIME, 0, 0.05);
      boxAt(flats, 41, 1.2, 16, px, GY + 9.6, pz, 0xc9b86a);
      for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        cylAt(flats, 1.3, 1.6, 12, 6, px + sx * 19, GY + 6, pz + sz * 6.6, LIME);
      }
      for (let i = -3; i <= 3; i++) boxAt(flats, 2.2, 4.2, 0.4, px + i * 5, GY + 4, pz + 7.8, 0x2c2620); // gothic windows
      for (let i = 0; i < 7; i++) treeAt(x + 4 + i * 6, z + 12, 0.8 + rng() * 0.3);
      claim(x, z, 22, 22); claim(px, pz, 46, 20);
      SV.tags.push({ name: 'THE OLD WATER TOWER', sub: 'W.W. BOYINGTON · 1869 · SURVIVED THE GREAT FIRE', x, z, r2: 130 * 130 });
    }
    // Fourth Presbyterian: low gray gothic church + courtyard
    {
      const x = 560, z = -1180;
      boxAt(flats, 18, 13, 34, x, GY + 6.5, z, 0x8a8578, 0, 0.05);
      boxAt(flats, 20, 3, 36, x, GY + 14, z, 0x5c574c);                          // steep roof mass
      boxAt(flats, 8, 24, 8, x, GY + 12, z - 21, 0x8a8578, 0, 0.05);             // tower
      const sp = new THREE.ConeGeometry(4.6, 9, 4);
      sp.rotateY(Math.PI / 4); sp.translate(x, GY + 28.5, z - 21);
      RR.City.tintGeom(sp, 0x5c574c, 0.04, rng);
      flats.push(sp);
      for (let i = 0; i < 5; i++) treeAt(x + 14, z - 14 + i * 8, 0.75);
      claim(x, z, 26, 44);
    }
    SV.tags.push({ name: 'MAGNIFICENT MILE', sub: 'N MICHIGAN AVE · ARTERY OF THE 1909 BURNHAM PLAN', x: 600, z: -1100, r2: 220 * 220 });

    // ---------- Michigan Ave dressing: trees + lamps down the spine ----------
    for (let z0 = -720; z0 > -1560; z0 -= 40) {
      if (!clearOf(576, z0, 4)) continue;
      treeAt(576 + (rng() - 0.5) * 4, z0, 0.8 + rng() * 0.3);
      treeAt(628 + (rng() - 0.5) * 4, z0 - 20, 0.8 + rng() * 0.3);
      if (z0 % 120 === 0) {
        boxAt(flats, 0.4, 5.4, 0.4, 590, GY + 2.7, z0, 0x555a60);
        if (RR.Theme) RR.Theme.addLamp(590, GY + 5.6, z0, 0xffe0a8);
      }
    }

    // ================= BLOCK FILL =================
    const gx0 = Math.ceil(250 / PITCH), gx1 = Math.floor(1926 / PITCH);
    const gz0 = Math.ceil(-2600 / PITCH), gz1 = Math.floor(-680 / PITCH);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const bx = gx * PITCH, bz = gz * PITCH;
        if (bz >= -680 || bx <= 250 || bx >= 1926) continue;
        const dSpine = Math.abs(bx - 600);
        const dN = U().clamp((-bz - 1500) / 1100, 0, 1);                        // 0 south → 1 at the north edge
        const density = U().clamp(0.92 - dSpine / 2600 - dN * 0.3, 0.5, 0.92);
        if (rng() > density) continue;

        // Gold Coast row-house blocks on the northern side streets
        if (bz < -1500 && bx < 1200 && rng() < 0.22) {
          const n = 4 + (rng() * 3 | 0);
          if (clearOf(bx, bz, 44)) {
            rowHouses(bx - n * 6.2, bz - 22, n, Math.PI / 2);
            if (rng() < 0.7) rowHouses(bx - n * 6.2, bz + 24, n, Math.PI / 2);
            for (let i = 0; i < 4; i++) treeAt(bx - 30 + i * 20, bz + (rng() - 0.5) * 10, 0.8);
            continue;
          }
        }

        const nBld = 2 + (rng() * 2.2 | 0);
        for (let b = 0; b < nBld; b++) {
          const w = 20 + rng() * 34, d = 18 + rng() * 30;
          const x = bx + (rng() - 0.5) * (96 - w), z = bz + (rng() - 0.5) * (96 - d);
          const half = Math.max(w, d) / 2;
          if (x + half > 1878) continue;                                         // stay behind the bluff wall
          if (!clearOf(x, z, half)) continue;
          let hi;
          if (dSpine < 170) hi = 60 + rng() * rng() * 110;                       // tall along the spine
          else if (bx > 1680) hi = 55 + rng() * rng() * 85;                      // lakefront-facing east edge
          else hi = 18 + rng() * rng() * 62;
          hi *= 1 - dN * 0.35;
          resi(x, z, w, d, Math.max(14, hi), null, (rng() * 3) | 0);
          claim(x, z, w, d);
        }
      }
    }

    // ================= MERGE =================
    // one mesh per facade family that actually got used, so the Mag Mile stops being one
    // flat material and reads as limestone / terracotta / granite / black steel
    const mats = RR.City.materials ? RR.City.materials() : [RR.City.material()];
    for (let f = 0; f < shafts.length; f++) {
      if (!shafts[f].length) continue;
      const m = new THREE.Mesh(RR.City.mergeGeoms(shafts[f]), mats[f] || mats[0]);
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
    }
    for (let i = 0; i < flats.length; i += 4000) {
      const flatMesh = new THREE.Mesh(RR.City.mergeGeoms(flats.slice(i, i + 4000)), RR.City.flatMaterial());
      flatMesh.castShadow = flatMesh.receiveShadow = true;
      scene.add(flatMesh);
    }
  };

  RR.Streeterville = SV;
})();

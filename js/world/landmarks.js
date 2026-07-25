/* River Racer — bespoke low-poly builders for Chicago's signature riverfront buildings.
   Every builder returns an array of vertex-tinted geometries; they merge into one mesh per
   facade family. */
(function () {
  const L = {};
  const U = () => RR.U;
  let rng;
  let curFam = 0;

  const GY = () => RR.City.GROUND_Y;

  // Every landmark mass gets the same vertical AO ramp as the filler city, so the two never
  // read as different renderers standing next to each other.
  function tint(g, c) {
    RR.City.tintGeomAO(g, c, 0, rng, GY(), GY() + 16, 0.66, 1.06);
    g.userData.fam = curFam;
    return g;
  }
  function box(w, h, d, x, y, z, c, rotY) {
    const g = RR.City.towerGeom(w, h, d, x, z, rotY || 0);
    g.translate(0, y, 0);
    return tint(g, c);
  }
  function solid(geo, x, y, z, c) {
    geo.translate(x, y, z);
    return tint(geo, c);
  }
  function cyl(rT, rB, h, seg, x, y, z, c) {
    return solid(new THREE.CylinderGeometry(rT, rB, h, seg), x, y + h / 2, z, c);
  }
  function fam(g, f) { g.userData.fam = f; return g; }

  // glassGeoms get the window texture; flatGeoms are plain color
  const builders = {

    // twin concrete corncobs: 19 floors of open helical parking, then 40 floors of scalloped
    // petal balconies. 32 m across, 15 m off the quay — it has to LOOM, that is the building.
    marina(l, glass, flat) {
      for (const s of [-1, 1]) {
        const x = l.x + s * 30, z = l.z;
        const parkH = l.h * 0.31, resH = l.h * 0.63;
        flat.push(cyl(8.0, 8.0, l.h * 0.99, 12, x, GY(), z, 0xa9a396));            // service core
        const decks = 9;
        for (let i = 0; i <= decks; i++) {                                          // open parking decks
          const y = GY() + (i / decks) * (parkH - 1);
          flat.push(solid(new THREE.CylinderGeometry(15.4, 15.4, 0.55, 18), x, y + 0.3, z, 0xcfc9bc));
        }
        const lvls = 20, petals = 16;
        for (let i = 0; i < lvls; i++) {
          const fh = resH / lvls, y = GY() + parkH + (i + 0.5) * fh;
          flat.push(solid(new THREE.CylinderGeometry(12.4, 12.4, fh * 0.86, 16), x, y, z, 0x5d6066));
          for (let k = 0; k < petals; k++) {                                        // balcony petals
            const a = (k / petals) * Math.PI * 2 + (i % 2) * (Math.PI / petals);
            flat.push(solid(new THREE.CylinderGeometry(2.85, 2.85, fh * 0.58, 6),
              x + Math.cos(a) * 13.6, y, z + Math.sin(a) * 13.6, 0xd6d0c2));
          }
        }
        flat.push(cyl(14.6, 15.4, 3.4, 18, x, GY() + parkH + resH, z, 0xb3ada0));   // mechanical crown
      }
      // the marina the building is named for — it is a boat game and the slips were missing
      const sz = l.z + 22;
      flat.push(box(72, 0.5, 5, l.x, 1.0, sz, 0x6b5a44));                           // floating dock spine
      for (let k = -2; k <= 2; k++) {
        flat.push(box(2.2, 0.45, 16, l.x + k * 15, 1.0, sz + 10, 0x6b5a44));        // finger piers
        flat.push(box(0.4, 4.0, 0.4, l.x + k * 15, 0.0, sz + 18, 0x3f4650));        // mooring piles
      }
    },

    // nine bundled black tubes. Real profile is 9 → 7 → 5 → 2: two tubes stop at 50, two more
    // at 66, three more at 90, and only two ride to the top. And the two antennas are NOT the
    // same length — 85.2 m and 78.2 m — which is the most-photographed detail on the building.
    willis(l, glass, flat) {
      const t = l.w / 3;
      const tubeH = [[0.46, 0.83, 0.83], [0.61, 1.00, 0.83], [0.46, 1.00, 0.61]];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const h = l.h * tubeH[i][j];
          glass.push(box(t - 1.5, h, t - 1.5, l.x + (i - 1) * t, GY(), l.z + (j - 1) * t, 0x191c20));
        }
      }
      const ant = [[-6, 85.2], [6, 78.2]];
      for (const [s, ah] of ant) {
        flat.push(cyl(0.8, 1.2, ah, 6, l.x + s, GY() + l.h, l.z, 0xe8eaec));
        if (RR.Theme) RR.Theme.addLamp(l.x + s, GY() + l.h + ah + 0.8, l.z, 0xff2a1e);
      }
    },

    // Stainless-and-glass, and the whole design idea is that each setback lands exactly on a
    // neighbour's cornice: Wrigley at 133.5 m, Marina City at 179 m, 330 N Wabash at 212 m.
    // Modelled as horizontal x-offsets it said nothing at all.
    trump(l, glass, flat) {
      const SB = 0x9fb6c4;
      const steps = [[1.00, 1.00, 0, 133.5], [0.80, 0.92, 133.5, 179], [0.62, 0.84, 179, 212], [0.44, 0.74, 212, l.h]];
      for (const [sw, sd, y0, y1] of steps) {
        glass.push(box(l.w * sw, y1 - y0, l.d * sd, l.x + l.w * (1 - sw) * 0.22, GY() + y0, l.z, SB));
      }
      flat.push(box(l.w * 0.40, 2.4, l.d * 0.68, l.x + l.w * 0.12, GY() + l.h, l.z, 0x7d8b93));
      flat.push(cyl(0.9, 1.6, 66, 6, l.x + l.w * 0.12, GY() + l.h + 2.4, l.z, 0xcfd6da));
      if (RR.Theme) RR.Theme.addLamp(l.x + l.w * 0.12, GY() + l.h + 69, l.z, 0xff2a1e);
    },

    // Glazed terra cotta in six shades that lighten as it rises — the single reason this
    // building glows at sunset — plus the Giralda clock tower with WHITE faces.
    wrigley(l, glass, flat) {
      const RAMP = [0xe8dfc6, 0xefe8d4, 0xf4efe0, 0xf8f5ea, 0xfbf9f2, 0xfaf5ea];
      const BOUND = [0.00, 0.18, 0.36, 0.55, 0.74, 0.90, 1.00];
      const tx = l.x + l.w * 0.28;
      for (let b = 0; b < 6; b++) {
        const y0 = l.h * BOUND[b], y1 = l.h * BOUND[b + 1], c = RAMP[b];
        if (y0 < l.h * 0.52) glass.push(box(l.w, Math.min(y1, l.h * 0.52) - y0, l.d, l.x, GY() + y0, l.z, c));
        if (y0 < l.h * 0.68) {
          glass.push(box(l.w * 0.55, Math.min(y1, l.h * 0.68) - y0, l.d * 0.8, l.x - l.w * 0.1, GY() + y0, l.z, c));
        }
        if (y0 < l.h * 0.80) glass.push(box(14, Math.min(y1, l.h * 0.80) - y0, 14, tx, GY() + y0, l.z, c));
      }
      const TOP = RAMP[5];
      flat.push(box(11.5, l.h * 0.08, 11.5, tx, GY() + l.h * 0.8, l.z, TOP));       // first tier
      flat.push(cyl(4.8, 5.8, l.h * 0.09, 8, tx, GY() + l.h * 0.88, l.z, TOP));     // octagonal tempietto
      flat.push(cyl(2.4, 3.4, l.h * 0.06, 8, tx, GY() + l.h * 0.965, l.z, TOP));
      flat.push(cyl(0.3, 0.9, 5, 6, tx, GY() + l.h * 1.02, l.z, 0xd9d2ba));         // finial
      // four 5.9 m clock faces — white discs with black hands, not the painted-out dark plates
      for (const [dx, dz] of [[7.2, 0], [-7.2, 0], [0, 7.2], [0, -7.2]]) {
        const face = new THREE.CylinderGeometry(2.95, 2.95, 0.5, 12);
        face.rotateZ(Math.PI / 2);
        face.rotateY(dz !== 0 ? Math.PI / 2 : 0);
        flat.push(solid(face, tx + dx, GY() + l.h * 0.74, l.z + dz, 0xf5f2e7));
        const hand = new THREE.BoxGeometry(dz !== 0 ? 0.34 : 0.6, 2.3, dz !== 0 ? 0.6 : 0.34);
        flat.push(solid(hand, tx + dx * 1.06, GY() + l.h * 0.74 + 0.8, l.z + dz * 1.06, 0x231f1c));
      }
    },

    // neo-gothic: pale limestone shaft, flying buttresses, and an OPEN octagonal lantern —
    // you can see sky through the real crown, which a solid cone can never do.
    tribune(l, glass, flat) {
      const ST = 0xd6cdb8;
      glass.push(box(l.w, l.h * 0.76, l.d, l.x, GY(), l.z, ST));
      glass.push(box(l.w * 0.6, l.h * 0.92, l.d * 0.6, l.x, GY(), l.z, ST));
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        const bx2 = l.x + Math.cos(ang) * l.w * 0.3, bz2 = l.z + Math.sin(ang) * l.d * 0.3;
        flat.push(cyl(0.8, 1.2, l.h * 0.16, 4, bx2, GY() + l.h * 0.76, bz2, ST));     // buttress piers
        flat.push(solid(new THREE.ConeGeometry(1.1, 4.5, 4), bx2, GY() + l.h * 0.92 + 2.2, bz2, ST)); // pinnacles
      }
      const lanY = GY() + l.h * 0.90;
      flat.push(cyl(6.4, 6.8, 1.2, 8, l.x, lanY, l.z, ST));                          // lantern floor
      for (let a = 0; a < 8; a++) {                                                   // eight open piers
        const ang = (a / 8) * Math.PI * 2 + Math.PI / 8;
        flat.push(box(1.5, l.h * 0.10, 1.5, l.x + Math.cos(ang) * 5.4, lanY + 1.2, l.z + Math.sin(ang) * 5.4, ST));
      }
      flat.push(cyl(6.6, 6.2, 1.6, 8, l.x, lanY + 1.2 + l.h * 0.10, l.z, ST));        // ring above the piers
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2 + Math.PI / 8;
        flat.push(solid(new THREE.ConeGeometry(0.9, 3.4, 4), l.x + Math.cos(ang) * 5.9,
          lanY + 3.6 + l.h * 0.10, l.z + Math.sin(ang) * 5.9, ST));
      }
    },

    // the Mart: colossal deco limestone block — arcaded base, vertical piers marching
    // down the river facade, corner pavilions and the stepped central tower
    mart(l, glass, flat) {
      flat.push(box(l.w, 9, l.d, l.x, GY(), l.z, 0x8f8672));                        // arcade base
      glass.push(box(l.w, l.h * 0.8, l.d, l.x, GY() + 9, l.z, l.c));                // main mass
      const piers = 12;
      for (let i = 0; i <= piers; i++) {                                            // river-facade piers
        const px = l.x - l.w / 2 + (i / piers) * l.w;
        flat.push(box(1.6, l.h * 0.72, 1.2, px, GY() + 9, l.z + l.d / 2, 0xc8bda4));
      }
      for (const sx of [-1, 1]) {                                                   // corner pavilions
        glass.push(box(l.w * 0.13, l.h * 0.92, l.d * 0.72, l.x + sx * l.w * 0.43, GY(), l.z, l.c));
      }
      glass.push(box(l.w * 0.24, l.h * 1.12, l.d * 0.5, l.x, GY(), l.z, l.c));      // center tower
      flat.push(box(l.w * 0.12, 4, l.d * 0.3, l.x, GY() + l.h * 1.12, l.z, 0x8f8570));
    },

    // 333 W Wacker: an unbroken quarter-circle of green glass that follows the river bend.
    // Chord on the quay line, convex face toward the water, centre of curvature inland at
    // (x+52, z+52) — the landward push is what used to make it read as a generic wedge.
    wacker333(l, glass, flat) {
      const segs = 9, R = 73.5, PHI = Math.PI / 4;
      const c0 = Math.cos(PHI), s0 = Math.sin(PHI);
      for (let i = 0; i < segs; i++) {
        const a = (i / (segs - 1) - 0.5) * 1.1;
        const ox = Math.sin(a) * R, oz = (1 - Math.cos(a)) * R;
        glass.push(box(R * 1.1 / segs + 3, l.h, l.d * 0.8,
          l.x + ox * c0 + oz * s0, GY(), l.z - ox * s0 + oz * c0, 0x3d7a6b, -a + PHI));
      }
      flat.push(box(l.w * 0.9, 3.2, l.d * 0.9, l.x + 14, GY() + l.h, l.z + 14, 0x1e4038, PHI));
    },

    // St. Regis: three stacked-frustum sisters in a six-step blue-green frit that pales as it climbs
    stregis(l, glass, flat) {
      const GRAD = [0x2e5c6b, 0x466f7d, 0x5e828f, 0x76959f, 0x85aeb9, 0x9dc8d2];
      const heights = [0.65, 1, 0.82];
      for (let i = 0; i < 3; i++) {
        const x = l.x + (i - 1) * (l.w / 3 + 1);
        const stacks = 6;
        for (let s = 0; s < stacks; s++) {
          const y0 = GY() + (s / stacks) * l.h * heights[i];
          const taper = s % 2 ? 1 : 0.88;
          glass.push(box((l.w / 3 - 2) * taper, l.h * heights[i] / stacks, l.d * (s % 2 ? 0.88 : 1),
            x, y0, l.z, GRAD[s]));
        }
      }
      if (RR.Theme) RR.Theme.addLamp(l.x, GY() + l.h + 1.5, l.z, 0xff2a1e);
    },

    // Aqua: white balcony plates rippling like water around a blue-grey glass core. The real
    // maximum projection is 3.7 m (12 ft), not the 8.5 m shelf the game had, and 82 floors of
    // slabs need far more than 22 plates before the ripple reads as a contour map.
    aqua(l, glass, flat) {
      glass.push(box(l.w - 7, l.h, l.d - 6, l.x, GY(), l.z, 0x6f97ad));
      const plates = 41;
      for (let i = 0; i < plates; i++) {
        const y = GY() + (i + 0.5) * (l.h / plates);
        const u = i * 0.48;
        flat.push(box(
          l.w + Math.sin(u) * 2.2 + Math.sin(u * 0.37 + 1.4) * 1.5, 0.5,
          l.d + Math.cos(u * 0.8) * 1.8 + Math.sin(u * 0.53 + 0.6) * 1.1,
          l.x + Math.sin(u * 0.61) * 1.1, y, l.z + Math.cos(u * 0.43) * 0.9, 0xf2f0ea));
      }
      if (RR.Theme) RR.Theme.addLamp(l.x, GY() + l.h + 1.5, l.z, 0xff2a1e);
    },

    // Aon Center: sheer white-granite shaft — dense full-height vertical ribs on the
    // lake-facing (east) and river-facing (north) faces catch the light like the real fluting
    aon(l, glass, flat) {
      glass.push(box(l.w, l.h, l.d, l.x, GY(), l.z, l.c));
      const ribs = 10, RB = 0xf2f0ea;
      for (let i = 0; i < ribs; i++) {
        const o = -l.w / 2 + (i + 0.5) * (l.w / ribs);
        flat.push(box(0.9, l.h, 1.1, l.x + o, GY(), l.z - l.d / 2, RB));   // north face → river mouth
        flat.push(box(1.1, l.h, 0.9, l.x + l.w / 2, GY(), l.z + o, RB));   // east face → the lake
      }
      flat.push(box(l.w * 0.5, 3.5, l.d * 0.5, l.x, GY() + l.h, l.z, 0xb9b6ae));
      if (RR.Theme) RR.Theme.addLamp(l.x, GY() + l.h + 4.5, l.z, 0xff2a1e);
    },

    // One Prudential: mid-century limestone slab, recessed crown floors + the tall TV mast
    pru1(l, glass, flat) {
      glass.push(box(l.w, l.h * 0.94, l.d, l.x, GY(), l.z, l.c));
      glass.push(box(l.w * 0.84, l.h, l.d * 0.84, l.x, GY(), l.z, l.c));
      flat.push(box(l.w * 0.2, 4, l.d * 0.5, l.x, GY() + l.h, l.z, 0x8f8672)); // mechanical block
      flat.push(cyl(0.7, 1.5, 92, 6, l.x, GY() + l.h, l.z, 0xd8dadd));         // mast to ~275m
      if (RR.Theme) RR.Theme.addLamp(l.x, GY() + l.h + 93, l.z, 0xff2a1e);
    },

    // Two Prudential: chevron setbacks stepping ever narrower, then the famous
    // 45°-rotated pyramid peak and needle spire
    pru2(l, glass, flat) {
      const tiers = [[1, 0, 0.52], [0.84, 0.52, 0.7], [0.68, 0.7, 0.84], [0.52, 0.84, 0.94], [0.38, 0.94, 1]];
      for (const [s, f0, f1] of tiers) {
        glass.push(box(l.w * s, l.h * (f1 - f0), l.d * s, l.x, GY() + l.h * f0, l.z, l.c));
      }
      const pyr = new THREE.ConeGeometry(l.w * 0.27, 16, 4);
      pyr.rotateY(Math.PI / 4);
      flat.push(solid(pyr, l.x, GY() + l.h + 8, l.z, 0xe0dacd));
      flat.push(cyl(0.35, 0.9, 24, 6, l.x, GY() + l.h + 14, l.z, 0xcfd3d8));   // tip ≈ 303m real
      if (RR.Theme) RR.Theme.addLamp(l.x, GY() + l.h + 38, l.z, 0xff2a1e);
    },

    // Hancock: black tapered obelisk — FIVE X-braces per face (the game had four), on the
    // lake (east) and river-facing (south) faces, twin white antennas
    hancock(l, glass, flat) {
      const secs = [[1, 1, 0, 0.24], [0.88, 0.90, 0.24, 0.46], [0.76, 0.80, 0.46, 0.66],
                    [0.64, 0.70, 0.66, 0.84], [0.52, 0.60, 0.84, 1]];
      const BR = 0xb9bec4;
      for (const [sw, sd, f0, f1] of secs) {
        const w = l.w * sw, d = l.d * sd, y0 = GY() + l.h * f0, hh = l.h * (f1 - f0);
        glass.push(box(w, hh, d, l.x, y0, l.z, l.c));
        const aS = Math.atan2(w * 0.9, hh), dS = Math.hypot(w * 0.9, hh);   // south-face X (±~35°)
        const aE = Math.atan2(d * 0.9, hh), dE = Math.hypot(d * 0.9, hh);   // east-face X
        for (const s of [-1, 1]) {
          const gS = new THREE.BoxGeometry(1.1, dS * 0.94, 0.5);
          gS.rotateZ(s * aS);
          flat.push(solid(gS, l.x, y0 + hh / 2, l.z + d / 2 + 0.2, BR));
          const gE = new THREE.BoxGeometry(0.5, dE * 0.94, 1.1);
          gE.rotateX(s * aE);
          flat.push(solid(gE, l.x + w / 2 + 0.2, y0 + hh / 2, l.z, BR));
        }
      }
      for (const s of [-1, 1]) {
        flat.push(cyl(0.7, 1.3, 90, 6, l.x + s * 7, GY() + l.h, l.z, 0xe8eaec));
        if (RR.Theme) RR.Theme.addLamp(l.x + s * 7, GY() + l.h + 91, l.z, 0xff2a1e);
      }
    },

    // Onterie Center: concrete tube, X-bracing picked out in filled window bays
    onterie(l, glass, flat) {
      glass.push(box(l.w, l.h, l.d, l.x, GY(), l.z, l.c));
      const hh = l.h * 0.46, a = Math.atan2(l.w * 0.88, hh), dl = Math.hypot(l.w * 0.88, hh);
      for (let t = 0; t < 2; t++) {                       // two stacked X's, south face
        for (const s of [-1, 1]) {
          const g = new THREE.BoxGeometry(1.0, dl * 0.94, 0.4);
          g.rotateZ(s * a);
          flat.push(solid(g, l.x, GY() + hh * (t + 0.5), l.z + l.d / 2 + 0.15, 0xcfc9bd));
        }
      }
      flat.push(box(l.w * 0.6, 3, l.d * 0.6, l.x, GY() + l.h, l.z, 0x87817a));
    },

    // terra cotta wedding cake with four verdigris corner cupolas + a central domed lantern
    jewelers(l, glass, flat) {
      const VD = 0x6e8c74;                                  // real copper patina, not grey
      glass.push(box(l.w, l.h * 0.55, l.d, l.x, GY(), l.z, l.c));
      for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        flat.push(cyl(3.4, 3.8, 10, 8, l.x + sx * l.w * 0.42, GY() + l.h * 0.55, l.z + sz * l.d * 0.42, l.c));
        flat.push(solid(new THREE.SphereGeometry(3.6, 8, 6), l.x + sx * l.w * 0.42, GY() + l.h * 0.55 + 11, l.z + sz * l.d * 0.42, VD));
      }
      glass.push(box(l.w * 0.5, l.h * 0.85, l.d * 0.5, l.x, GY(), l.z, l.c));
      flat.push(cyl(6, 8, l.h * 0.1, 8, l.x, GY() + l.h * 0.85, l.z, l.c));
      flat.push(solid(new THREE.SphereGeometry(6.5, 10, 7), l.x, GY() + l.h * 0.97, l.z, VD));
    },

    mather(l, glass, flat) {
      glass.push(box(l.w, l.h * 0.62, l.d, l.x, GY(), l.z, l.c));
      glass.push(box(l.w * 0.55, l.h * 0.82, l.d * 0.55, l.x, GY(), l.z, l.c));
      flat.push(cyl(3.2, 4.6, l.h * 0.12, 8, l.x, GY() + l.h * 0.82, l.z, l.c));
      flat.push(cyl(0.7, 2.2, l.h * 0.1, 8, l.x, GY() + l.h * 0.93, l.z, 0xcabfa6));
    },

    london(l, glass, flat) {
      glass.push(box(l.w, l.h * 0.9, l.d, l.x, GY(), l.z, l.c));
      flat.push(box(l.w, l.h * 0.04, l.d, l.x, GY() + l.h * 0.9, l.z, 0xbdb298));
      // the tempietto belongs centred on the roof, not shoved into a corner
      flat.push(cyl(4, 4.6, 8, 10, l.x, GY() + l.h * 0.94, l.z, l.c));
      flat.push(solid(new THREE.SphereGeometry(4.2, 8, 6), l.x, GY() + l.h * 0.94 + 9, l.z, 0x94886c));
    },

    // Civic Opera "throne": tall limestone river-facing slab + lower flanks
    opera(l, glass, flat) {
      const LS = 0xc9bfa8;
      glass.push(box(l.w, l.h, l.d * 0.55, l.x, GY(), l.z - l.d * 0.2, LS));
      glass.push(box(l.w, l.h * 0.55, l.d * 0.5, l.x, GY(), l.z + l.d * 0.25, LS));
      for (const s of [-1, 1]) {
        glass.push(box(l.w * 0.24, l.h * 0.8, l.d, l.x + s * l.w * 0.38, GY(), l.z, LS));
      }
    },

    // 150 N Riverside: a 12 m core at grade flaring to the full slab by L9. The taper is
    // NORTH–SOUTH only — east–west the tower is near constant, which is why it looks like a
    // wine glass from the river and like a diamond from nowhere at all.
    riverside150(l, glass, flat) {
      const steps = 5;
      for (let i = 0; i < steps; i++) {
        const f = i / steps, f1 = (i + 1) / steps;
        const dd = 12 + (l.d - 12) * f1;
        flat.push(box(l.w * 0.92, l.h * 0.22 / steps, dd, l.x, GY() + l.h * 0.22 * f, l.z, 0x27343c));
      }
      glass.push(box(l.w, l.h * 0.78, l.d, l.x, GY() + l.h * 0.22, l.z, l.c));
      flat.push(box(l.w * 0.55, 3.0, l.d * 0.55, l.x, GY() + l.h, l.z, 0x2f343a));
      if (RR.Theme) RR.Theme.addLamp(l.x, GY() + l.h + 4, l.z, 0xff2a1e);
    },

    // curved arc slab; the parabolic arch belongs at the CROWN, which is the whole silhouette
    riverpoint(l, glass, flat) {
      const segs = 7;
      for (let i = 0; i < segs; i++) {
        const a = (i / (segs - 1) - 0.5) * 0.9;
        glass.push(box(l.w / segs + 3, l.h * 0.9, l.d,
          l.x + Math.sin(a) * l.w * 0.8, GY(), l.z + (1 - Math.cos(a)) * l.w * 0.5, l.c, -a));
      }
      const arch = new THREE.TorusGeometry(l.w * 0.4, 2.6, 6, 12, Math.PI);
      flat.push(solid(arch, l.x, GY() + l.h * 0.9, l.z + l.w * 0.06, 0xd8dde0));
      flat.push(box(l.w * 0.86, 1.6, l.d * 0.8, l.x, GY() + l.h * 0.9 - 1.6, l.z + l.w * 0.06, 0xb9c4ca));
      if (RR.Theme) RR.Theme.addLamp(l.x, GY() + l.h + 2, l.z, 0xff2a1e);
    },

    // pink granite + the translucent lit crown drum (1,852 fluorescent tubes, dimmed in
    // bird-migration season)
    crown311(l, glass, flat) {
      glass.push(box(l.w, l.h * 0.86, l.d, l.x, GY(), l.z, l.c));
      for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        glass.push(box(l.w * 0.3, l.h * 0.62, l.d * 0.3, l.x + sx * l.w * 0.42, GY(), l.z + sz * l.d * 0.42, l.c));
      }
      flat.push(cyl(l.w * 0.22, l.w * 0.22, l.h * 0.12, 12, l.x, GY() + l.h * 0.86, l.z, 0xf3f6f8));
      flat.push(cyl(l.w * 0.1, l.w * 0.1, l.h * 0.05, 10, l.x, GY() + l.h * 0.97, l.z, 0xf3f6f8));
      if (RR.Theme) {
        RR.Theme.addLamp(l.x, GY() + l.h * 0.92, l.z, 0xf2f6fa);
        RR.Theme.addLamp(l.x, GY() + l.h + 2, l.z, 0xff2a1e);
      }
    },

    nbc(l, glass, flat) {
      glass.push(box(l.w, l.h * 0.85, l.d, l.x, GY(), l.z, l.c));
      glass.push(box(l.w * 0.6, l.h * 0.97, l.d * 0.6, l.x, GY(), l.z, l.c));
      flat.push(cyl(0.7, 1.1, 30, 6, l.x, GY() + l.h * 0.97, l.z, 0x3a3f45));
      if (RR.Theme) RR.Theme.addLamp(l.x, GY() + l.h * 0.97 + 31, l.z, 0xff2a1e);
    },

    swissotel(l, glass, flat) {
      const tri = new THREE.CylinderGeometry(l.w * 0.62, l.w * 0.62, l.h, 3);
      tri.rotateY(Math.PI / 6);
      glass.push(solid(tri, l.x, GY() + l.h / 2, l.z, l.c));
      flat.push(cyl(l.w * 0.3, l.w * 0.3, 2.6, 6, l.x, GY() + l.h, l.z, 0x4a5057));
    },

    // bronze three-lobed Y on the lakefront — the only building east of Lake Shore Drive
    lakepoint(l, glass, flat) {
      for (let a = 0; a < 3; a++) {
        const ang = a * (Math.PI * 2 / 3) + 0.5;
        const lobe = new THREE.CylinderGeometry(l.w * 0.3, l.w * 0.3, l.h, 12);
        lobe.scale(1, 1, 0.55);
        lobe.rotateY(ang);
        glass.push(solid(lobe, l.x + Math.cos(ang) * l.w * 0.18, GY() + l.h / 2, l.z + Math.sin(ang) * l.w * 0.18, l.c));
      }
      flat.push(cyl(l.w * 0.5, l.w * 0.5, 4, 12, l.x, GY(), l.z, 0x3c4046));
      flat.push(cyl(l.w * 0.34, l.w * 0.3, 3.2, 12, l.x, GY() + l.h, l.z, 0x2f343a));
      if (RR.Theme) RR.Theme.addLamp(l.x, GY() + l.h + 4, l.z, 0xff2a1e);
    },

    reid(l, glass, flat) {
      glass.push(box(l.w, l.h, l.d, l.x, GY(), l.z, l.c));
      glass.push(box(10, l.h * 1.6, 10, l.x, GY(), l.z, l.c));
      flat.push(cyl(4, 5.5, 6, 4, l.x, GY() + l.h * 1.6, l.z, 0x6e8c74));   // verdigris copper cap
      for (const [dx, dz] of [[5.2, 0], [-5.2, 0], [0, 5.2], [0, -5.2]]) {
        const face = new THREE.CylinderGeometry(2.2, 2.2, 0.4, 10);
        face.rotateZ(Math.PI / 2);
        face.rotateY(dz !== 0 ? Math.PI / 2 : 0);
        flat.push(solid(face, l.x + dx, GY() + l.h * 1.38, l.z + dz, 0xe8e2ce));
      }
    },

    // Deco stepped shaft. Carbide & Carbon is the one-off: a dark-green terracotta champagne
    // bottle with gold foil over the whole top 18 m. It is the only building in the city that
    // colour, which is exactly why people notice it — so it gets the flat material, not glass.
    deco(l, glass, flat) {
      if (l.gold) {
        const capH = 18, sh = l.h - capH;
        flat.push(box(l.w, sh * 0.72, l.d, l.x, GY(), l.z, 0x1c3a2c));
        flat.push(box(l.w * 0.82, sh * 0.90, l.d * 0.82, l.x, GY(), l.z, 0x1c3a2c));
        flat.push(box(l.w * 0.62, sh, l.d * 0.62, l.x, GY(), l.z, 0x1c3a2c));
        flat.push(box(l.w * 0.70, 1.6, l.d * 0.70, l.x, GY() + sh - 1.6, l.z, 0xd4af37));   // gold collar
        flat.push(box(l.w * 0.58, capH * 0.72, l.d * 0.58, l.x, GY() + sh, l.z, 0xd4af37));
        flat.push(box(l.w * 0.40, capH, l.d * 0.40, l.x, GY() + sh, l.z, 0xd4af37));
        flat.push(cyl(0.35, 0.8, 6, 6, l.x, GY() + l.h, l.z, 0xd4af37));
        return;
      }
      glass.push(box(l.w, l.h * 0.7, l.d, l.x, GY(), l.z, l.c));
      glass.push(box(l.w * 0.72, l.h * 0.88, l.d * 0.72, l.x, GY(), l.z, l.c));
      glass.push(box(l.w * 0.45, l.h, l.d * 0.45, l.x, GY(), l.z, l.c));
      flat.push(box(l.w * 0.5, 1.2, l.d * 0.5, l.x, GY() + l.h, l.z, 0x8f8672));
    },

    boxglass(l, glass, flat) {
      glass.push(box(l.w, l.h, l.d, l.x, GY(), l.z, l.c));
      flat.push(box(l.w - 0.6, 3.2, l.d - 0.6, l.x, GY() + l.h, l.z, 0x4a5057));     // mech band
      flat.push(box(l.w + 0.3, 0.9, l.d + 0.3, l.x, GY() + l.h + 3.2, l.z, 0x2f343a)); // parapet fin
      if (l.h > 180 && RR.Theme) RR.Theme.addLamp(l.x, GY() + l.h + 4.2, l.z, 0xff2a1e);
    },

    // 111 N Canal — the user's office. Solid, unmistakable orange (flat material = pure vertex
    // colour, no muting window texture), with a recessed river-facing glass core + a bright cap.
    canal111(l, glass, flat) {
      flat.push(box(l.w, l.h, l.d, l.x, GY(), l.z, l.c));                          // saturated orange mass
      glass.push(box(l.w * 0.62, l.h * 0.9, 2, l.x, GY() + l.h * 0.05, l.z + l.d * 0.5, l.c));  // glassy river face
      flat.push(box(l.w * 1.05, 3.5, l.d * 1.05, l.x, GY() + l.h, l.z, 0xff7a2a));  // rooftop parapet pops from the air
    },

    boxstone(l, glass, flat) {
      glass.push(box(l.w, l.h, l.d, l.x, GY(), l.z, l.c));
      flat.push(box(l.w + 1.4, 0.55, l.d + 1.4, l.x, GY() + l.h - 2.6, l.z, 0xd9d2c1));  // band course
      flat.push(box(l.w + 0.5, 2.30, l.d + 0.5, l.x, GY() + l.h - 1.15, l.z, 0x8f8672)); // parapet
      flat.push(box(l.w + 1.0, 0.35, l.d + 1.0, l.x, GY() + l.h + 0.18, l.z, 0xe2dbcb)); // coping
    },

    // Wolf Point East: a curved tapering sail, convex to the west, facing straight down the
    // North Branch at the start line
    wolfsail(l, glass, flat) {
      const segs = 7;
      for (let i = 0; i < segs; i++) {
        const t = i / (segs - 1) - 0.5;
        const a = t * 1.15;
        const hh = l.h * (1 - Math.abs(t) * 0.30);
        glass.push(box(l.w / segs + 2.6, hh, l.d, l.x - (1 - Math.cos(a)) * 46, GY(), l.z + Math.sin(a) * 46, l.c, a));
      }
      flat.push(box(l.w * 0.5, 2.6, l.d * 0.8, l.x, GY() + l.h, l.z, 0x3f4650));
      if (RR.Theme) RR.Theme.addLamp(l.x, GY() + l.h + 3.4, l.z, 0xff2a1e);
    },

    // Salesforce Tower: shaft + three stepped crown blocks, the top one notched out at a
    // corner, and that notch is lit ice-blue at night. Tallest thing on the start gate.
    wolfcrown(l, glass, flat) {
      glass.push(box(l.w, l.h * 0.86, l.d, l.x, GY(), l.z, l.c));
      glass.push(box(l.w * 0.90, l.h * 0.92, l.d * 0.94, l.x, GY(), l.z, l.c));
      glass.push(box(l.w * 0.78, l.h * 0.965, l.d * 0.86, l.x, GY(), l.z, l.c));
      const tw = l.w * 0.62, td = l.d * 0.74;
      const ny = GY() + l.h * 0.965, nh = l.h * 0.035;
      glass.push(box(tw, nh, td * 0.55, l.x, ny, l.z - td * 0.22, l.c));            // notched top block:
      glass.push(box(tw * 0.55, nh, td * 0.45, l.x - tw * 0.22, ny, l.z + td * 0.28, l.c));  // an L, not a box
      flat.push(box(tw * 0.42, 0.9, td * 0.42, l.x + tw * 0.28, ny + nh * 0.5, l.z + td * 0.28, 0x7fd4ff));
      if (RR.Theme) {
        RR.Theme.addLamp(l.x + tw * 0.28, ny + nh * 0.5, l.z + td * 0.28, 0x7fd4ff);
        RR.Theme.addLamp(l.x, GY() + l.h + 1.5, l.z, 0xff2a1e);
      }
    },

    // Old Chicago Main Post Office: 2.8 M sq ft of limestone with the Eisenhower punched clean
    // through its base. Cars streaming through a hole in a building, seen from the water, is
    // the single most unforgettable thing on the South Branch.
    postoffice(l, glass, flat) {
      const LS = 0xc9bea1;
      const vz = 26, blockH = 60;
      const side = (l.d - vz) / 2;
      for (const s of [-1, 1]) {
        glass.push(box(l.w, blockH, side, l.x, GY(), l.z + s * (vz / 2 + side / 2), LS));
      }
      glass.push(box(l.w, blockH - 8, vz, l.x, GY() + 8, l.z, LS));                 // spans over the void
      glass.push(box(l.w * 0.46, l.h, l.d * 0.30, l.x, GY(), l.z - l.d * 0.24, LS)); // the 104 m tower
      for (let i = 0; i < 8; i++) {                                                  // deco piers, river face
        const pz = l.z - l.d / 2 + (i + 0.5) * (l.d / 8);
        if (Math.abs(pz - l.z) < vz / 2 + 3) continue;                                // never stand in the tunnel mouth
        flat.push(box(1.4, blockH * 0.92, 2.0, l.x + l.w / 2, GY(), pz, 0xdad0b6));
      }
      flat.push(box(l.w + 1.2, 2.2, l.d + 1.2, l.x, GY() + blockH - 1.1, l.z, 0xb6ab8f));
      flat.push(box(l.w * 0.5, 2.2, l.d * 0.34, l.x, GY() + l.h, l.z - l.d * 0.24, 0xb6ab8f));
      flat.push(box(l.w + 0.6, 1.2, vz, l.x, GY() + 7.4, l.z, 0x5c5a55));            // tunnel lintel
    },

    // Chicago Board of Trade: deco setbacks capped by a four-sided pyramid and a 9.4 m
    // FACELESS aluminium Ceres — the sculptor left her blank because in 1930 nobody was ever
    // going to build anything tall enough to look her in the eye.
    bot(l, glass, flat) {
      const tiers = [[1, 0, 0.55], [0.80, 0.55, 0.74], [0.62, 0.74, 0.88], [0.44, 0.88, 1]];
      for (const [s, f0, f1] of tiers) {
        glass.push(box(l.w * s, l.h * (f1 - f0), l.d * s, l.x, GY() + l.h * f0, l.z, l.c));
      }
      const pyr = new THREE.ConeGeometry(l.w * 0.32, 17, 4);
      pyr.rotateY(Math.PI / 4);
      flat.push(solid(pyr, l.x, GY() + l.h + 8.5, l.z, 0x5c574c));
      flat.push(cyl(1.5, 2.4, 7.0, 6, l.x, GY() + l.h + 17, l.z, 0xc9cdd2));         // Ceres, no face
      flat.push(solid(new THREE.SphereGeometry(1.3, 6, 5), l.x, GY() + l.h + 25.2, l.z, 0xc9cdd2));
      if (RR.Theme) RR.Theme.addLamp(l.x, GY() + l.h + 27, l.z, 0xff2a1e);
    },

    // Cloud Gate: mirror-steel blob arching between two ground lobes on a granite plaza disc
    bean(l, glass, flat) {
      const ST = 0xd6dbe0;                                    // pale steel — reads as brushed mirror
      flat.push(cyl(15, 15.6, 0.6, 22, l.x, GY() - 0.3, l.z, 0xd8d2c4));   // plaza disc
      const body = new THREE.SphereGeometry(1, 20, 14);
      body.scale(7.6, 4.3, 4.4);                              // ~15m long × 10m tall squashed blob
      flat.push(solid(body, l.x, GY() + 5.6, l.z, ST));
      for (const s of [-1, 1]) {                              // lobes touch down → the walk-under arch
        const lobe = new THREE.SphereGeometry(1, 14, 10);
        lobe.scale(3.3, 3.2, 4.1);
        flat.push(solid(lobe, l.x + s * 4.6, GY() + 2.1, l.z, ST));
      }
    },

    // Buckingham Fountain: three stacked pink-granite basins + patina seahorses in the pool
    fountain(l, glass, flat) {
      const PG = 0xc99a8a;
      flat.push(cyl(20, 20.6, 2.0, 22, l.x, GY(), l.z, PG));  // great basin wall
      flat.push(solid(new THREE.CylinderGeometry(18.6, 18.6, 0.3, 22), l.x, GY() + 1.65, l.z, 0x2f7d84)); // pool
      flat.push(cyl(2.2, 3.0, 2.6, 10, l.x, GY() + 1.8, l.z, PG));         // pedestal
      flat.push(cyl(8.6, 6.8, 1.5, 16, l.x, GY() + 3.6, l.z, PG));         // lower bowl (flared)
      flat.push(cyl(1.6, 2.2, 1.6, 8, l.x, GY() + 5.1, l.z, PG));
      flat.push(cyl(5.2, 4.0, 1.2, 12, l.x, GY() + 5.9, l.z, PG));         // middle bowl
      flat.push(cyl(2.6, 1.9, 1.0, 10, l.x, GY() + 7.0, l.z, PG));         // top bowl
      for (let k = 0; k < 4; k++) {                           // four seahorse groups, verdigris bronze
        const a = Math.PI / 4 + k * Math.PI / 2;
        const sx = l.x + Math.cos(a) * 13.5, sz = l.z + Math.sin(a) * 13.5;
        flat.push(box(1.3, 2.4, 2.6, sx, GY() + 1.6, sz, 0x5f8a76, a));
        flat.push(solid(new THREE.SphereGeometry(0.7, 6, 5), sx, GY() + 4.3, sz, 0x5f8a76));
      }
    },

    // Chicago Theatre: stone hall + the giant vertical C-H-I-C-A-G-O sign facing State St (west)
    marquee(l, glass, flat) {
      const RED = 0xc0231d;
      glass.push(box(l.w, l.h, l.d, l.x, GY(), l.z, l.c));                 // theatre mass
      glass.push(box(l.w * 0.8, l.h * 1.15, l.d * 0.55, l.x + l.w * 0.08, GY(), l.z, l.c)); // stage house
      const wx = l.x - l.w / 2;                               // west face
      flat.push(box(3.2, 2.6, 15, wx - 1.6, GY() + 6.5, l.z, RED));        // marquee canopy
      flat.push(box(3.4, 0.5, 15.4, wx - 1.6, GY() + 9.1, l.z, 0xf3e2b0)); // lit canopy rim
      flat.push(box(1.5, 22, 4.4, wx - 0.75, GY() + 7, l.z, RED));         // vertical sign blade
      for (let k = 0; k < 7; k++) {                           // letter blocks, hoisted C→O
        flat.push(box(0.5, 2.3, 2.7, wx - 1.55, GY() + 25.8 - k * 2.9, l.z, 0xfff3d4));
      }
    },
  };

  // ---------- facade families (ART §2.4) — the vertex tint stays whatever CHICAGO says ----------
  const F_NAME = {
    'Willis Tower': 1, 'John Hancock Center': 1, '330 N Wabash': 1, '401 N Michigan': 1,
    'Merchandise Mart': 2, 'Civic Opera House': 2, 'Union Station': 2, 'Tribune Tower': 2,
    'Old Montgomery Ward': 2, 'Lake Shore Place': 2, 'NBC Tower': 2, 'Chicago Theatre': 2,
    'Old Chicago Main Post Office': 2, 'Chicago Board of Trade': 2,
    'Reid Murdoch Center': 3, 'North Pier Apartments': 3, 'Fulton House': 3,
    'Wrigley Building': 4, 'Jewelers Building': 4, 'Mather Tower': 4, 'LondonHouse': 4, 'Aon Center': 4,
    '333 N Michigan': 5, 'One Prudential Plaza': 5, 'Two Prudential Plaza': 5, '311 S Wacker': 5,
    '333 W Wacker': 6, 'Boeing Building': 6,
    'Trump Tower': 7, 'Aqua Tower': 7, 'St. Regis Chicago': 7, '150 N Riverside': 7,
    'River Point': 7, 'Salesforce Tower': 7, 'Wolf Point East': 7, 'Wolf Point West': 7,
    'Blue Cross Blue Shield Tower': 7, '400 N Lake Shore Dr North': 7, '400 N Lake Shore Dr South': 7,
    'Marina City': 8, 'Lake Point Tower': 8, 'Onterie Center': 8, 'River City': 8,
    'Apparel Center': 8, 'Tribune Freedom Center': 8,
  };
  const F_KIND = { boxstone: 2, deco: 5, mart: 2, opera: 2, reid: 3, marina: 8, bean: 0, fountain: 0 };

  // Chicago floodlights its riverfront landmarks from below; the Wrigley Building under
  // floodlight is *the* postcard, and it was the first building in the city to be lit at all.
  const FLOOD = {
    'Wrigley Building': { c: 0xfff4dc }, 'Tribune Tower': { c: 0xf0e2c0 },
    'Merchandise Mart': { c: 0xd8e4f0 }, 'Civic Opera House': { c: 0xffeccc },
    'Carbide & Carbon': { c: 0xffd24a, crown: true }, 'Reid Murdoch Center': { c: 0xffe8b8 },
  };

  // FEEL §4.8 terse-caps subtitles for the HUD blade — architect · year · height · the tell
  const SUB = {
    'Willis Tower': 'SOM · 1973 · 442 M · NINE BUNDLED TUBES',
    'St. Regis Chicago': 'STUDIO GANG · 2020 · 363 M · THREE STEMS',
    'Trump Tower': 'SOM · 2009 · 423 M TO THE SPIRE',
    'Aon Center': '1973 · 346 M · RECLAD IN GRANITE 1992',
    'John Hancock Center': 'SOM · 1969 · 344 M · X-BRACED',
    '311 S Wacker': 'KPF · 1990 · 293 M · LIT CROWN',
    'Two Prudential Plaza': '1990 · 303 M · CHEVRON SETBACKS',
    'Aqua Tower': 'JEANNE GANG · 2009 · 262 M · RIPPLING SLABS',
    'Salesforce Tower': 'PELLI CLARKE · 2023 · 253 M · NOTCHED CROWN',
    '150 N Riverside': 'GOETTSCH · 2017 · 228 M · 12 M CORE AT GRADE',
    'Blue Cross Blue Shield Tower': '1997 · 227 M · GREW 33 TO 57 FLOORS OCCUPIED',
    'River Point': 'PICKARD CHILTON · 2017 · 225 M · BUILT OVER AMTRAK',
    '330 N Wabash': 'MIES VAN DER ROHE · 1972 · 212 M · HIS LAST',
    'Wolf Point East': 'PELLI CLARKE · 2020 · 210 M · CURVED SAIL',
    'Lake Point Tower': '1968 · 197 M · EAST OF LAKE SHORE DRIVE',
    'NBC Tower': 'SOM · 1989 · 191 M · DECO HOMAGE',
    'Chicago Board of Trade': 'HOLABIRD & ROOT · 1930 · 184 M · FACELESS CERES',
    'Marina City': 'BERTRAND GOLDBERG · 1964 · 179 M · "CORN COBS"',
    'Onterie Center': '1986 · 174 M · BRACING IN THE WINDOWS',
    'Civic Opera House': '1929 · 169 M · INSULL’S THRONE',
    'Mather Tower': '1928 · 160 M · NARROWEST TOWER IN CHICAGO',
    'Jewelers Building': '1927 · 159 M · CAR ELEVATORS INSIDE',
    'Wolf Point West': 'PELLI CLARKE · 2016 · 154 M',
    'Carbide & Carbon': 'BURNHAM BROTHERS · 1929 · 153 M · GOLD LEAF CROWN',
    '333 W Wacker': 'KPF · 1983 · 148 M · GREEN GLASS ON THE BEND',
    'Tribune Tower': 'HOWELLS & HOOD · 1925 · 141 M · OPEN LANTERN',
    'Wrigley Building': '1921 · 133.5 M · GIRALDA CLOCK TOWER',
    '401 N Michigan': 'SOM · 1965 · 132 M · DUSABLE’S CABIN SITE',
    '333 N Michigan': 'HOLABIRD & ROOT · 1928 · 121 M · FORT DEARBORN SITE',
    'Merchandise Mart': '1930 · 99 M · IT HAD ITS OWN ZIP CODE',
    'LondonHouse': '1923 · 94 M · ROOFTOP TEMPIETTO',
    'Apparel Center': '1977 · 76 M · THE SLAB EVERYONE FORGETS',
    'Old Chicago Main Post Office': '1921 · THE EXPRESSWAY RUNS THROUGH IT',
    'Reid Murdoch Center': '1914 · RED BRICK · GREEN CLOCK TOWER',
    'Fulton House': '1908 · COLD STORAGE LOFT',
    'Tribune Freedom Center': '1981 · WHERE THE PRESSES RUN',
    'Union Station': '1925 · THE UNTOUCHABLES STAIRS',
    'Old Montgomery Ward': '1908 · SPIRIT OF PROGRESS',
    'River City': 'BERTRAND GOLDBERG · 1986 · ITS OWN MARINA',
    'One Prudential Plaza': '1955 · 183 M · THE FIRST POSTWAR TOWER',
    'Boeing Building': '1990 · 137 M · GREEN GLASS',
    'Cloud Gate (The Bean)': 'ANISH KAPOOR · 2006 · 110 TONNES OF STEEL',
    'Buckingham Fountain': '1927 · A 46 M JET ON THE HOUR',
    'Chicago Theatre': '1921 · THE SIGN IS THE LANDMARK',
    '111 N Canal (Ovative Group)': 'FULTON RIVER DISTRICT · OVATIVE GROUP',
    'Hyatt Regency': '1974 · ILLINOIS CENTER AIR RIGHTS',
    'Swissôtel': '1989 · TRIANGULAR PLAN',
    'Lake Shore Place': '1926 · THE OLD FURNITURE MART',
    '400 N Lake Shore Dr North': '2023 · ON THE SPIEGEL SITE',
    '400 N Lake Shore Dr South': '2023 · ON THE SPIEGEL SITE',
    'North Pier Apartments': '1990 · OGDEN SLIP DOCKS',
  };
  const NAME_OVERRIDE = { 'Marina City': 'MARINA CITY — "THE CORN COBS"' };

  // These buildings genuinely rise straight out of the quay wall. A landward push is what makes
  // them read as "set back in a generic block" instead of Chicago.
  const HUGS_RIVER = {
    wacker333: 1.5, marina: 2.0, mart: 2.0, trump: 2.5,
    wolfsail: 2.0, wolfcrown: 2.0, riverside150: 1.5, riverpoint: 2.0,
  };

  // Nudge a landmark landward until its whole footprint clears every channel.
  // The hand-placed lat/lons don't perfectly match the GIS centerline, so without this
  // a few towers (Marina City, 333 W Wacker, River Point...) overhang the water.
  const BULGE = { riverpoint: 0.4, aqua: 0.12 };  // curved builders reach past w/d
  function clampToLand(l) {
    for (let pass = 0; pass < 4; pass++) {
      let worst = null;
      for (const key in RR.River.paths) {
        if (key.startsWith('lake')) continue;
        const p = RR.River.paths[key];
        const q = U().pathNearest(p, l.x, l.z);
        let nx = l.x - q.x, nz = l.z - q.z;
        const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
        // half-extent of the (axis-aligned) footprint toward this channel, plus curve bulge
        let extent = 0.5 * (Math.abs(nx) * l.w + Math.abs(nz) * l.d);
        if (BULGE[l.kind]) extent += BULGE[l.kind] * Math.max(l.w, l.d);
        const deficit = (q.w + extent + (HUGS_RIVER[l.kind] || 7)) - q.dist;
        if (deficit > 0 && (!worst || deficit > worst.deficit)) worst = { nx, nz, deficit };
      }
      if (!worst) break;
      l.x += worst.nx * worst.deficit;
      l.z += worst.nz * worst.deficit;
    }
  }

  // ---------- Art on theMART: the largest permanent digital projection in the world, thrown
  // on the Mart's river face every night since 2018. It reflects in the water, which is the
  // whole point, so it stays on the DEFAULT layer. ----------
  function artOnTheMart(l, scene) {
    const tex = U().canvasTexture(512, 160, (ctx) => { ctx.fillStyle = '#0A0A10'; ctx.fillRect(0, 0, 512, 160); });
    const ctx = tex.image.getContext('2d');
    const BAND = ['#FF3D7F', '#00E0C0', '#FFD23F'];
    function star(cx, cy, r) {
      for (const rot of [0, Math.PI]) {
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const a = rot + k * (Math.PI * 2 / 3) - Math.PI / 2;
          const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill();
      }
    }
    function draw(t) {
      ctx.fillStyle = '#0A0A10'; ctx.fillRect(0, 0, 512, 160);
      if ((t % 20) > 16.4) {                       // the four-star flag motif, every 20 s
        ctx.fillStyle = 'rgba(126,200,227,0.50)';
        ctx.fillRect(0, 24, 512, 20); ctx.fillRect(0, 116, 512, 20);
        ctx.fillStyle = '#E4392E';
        for (let i = 0; i < 4; i++) star(96 + i * 107, 80, 15);
      } else {
        const bw = 34, shift = (t * 46) % bw, base = Math.floor(t * 46 / bw);
        for (let i = -1; i <= 16; i++) {
          ctx.fillStyle = BAND[(((i - base) % 3) + 3) % 3];
          const hgt = 34 + 62 * Math.abs(Math.sin(t * 0.6 + i * 0.5));
          ctx.fillRect(i * bw + shift, 80 - hgt / 2, bw - 5, hgt);
        }
      }
      tex.needsUpdate = true;
    }
    draw(0);
    const geo = new THREE.PlaneGeometry(170, 46);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      // additive + sRGB output + bloom turns a full-saturation band into a white slab;
      // half gain is what keeps it reading as coloured light thrown on limestone
      map: tex, color: 0x7a7a7a,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    mesh.position.set(l.x, GY() + 34, l.z + l.d / 2 + 0.4);
    mesh.visible = false;
    scene.add(mesh);
    let acc = 0;
    RR.Engine.onUpdate((dt, t) => {
      const m = RR.Theme && RR.Theme.mode;
      mesh.visible = (m === 'night' || m === 'dusk');
      if (!mesh.visible) return;
      acc += dt;
      if (acc < 1 / 6) return;
      acc = 0;
      draw(t);
    });
    return mesh;
  }

  // Additive shell 1.0018× the landmark's own faces. Uplight falls off with height, and that
  // ramp IS the effect — a uniform glow reads as a fog bank, not a floodlight.
  // A landmark is built from a dozen overlapping masses, so a dozen additive shells stack on the
  // same face. 0.18 is what leaves the building still reading as terracotta or limestone under
  // the light instead of a white cut-out.
  const FLOOD_GAIN = 0.18;
  const _fc = new THREE.Color();
  function shellOf(src, l, cfg) {
    const g = src.clone();
    const pos = g.attributes.position, n = pos.count;
    const gy = GY(), K = 1.0018;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = l.x + (pos.getX(i) - l.x) * K;
      const y = gy + (pos.getY(i) - gy) * K;
      const z = l.z + (pos.getZ(i) - l.z) * K;
      pos.setXYZ(i, x, y, z);
      let ramp;
      if (cfg.crown) ramp = U().clamp((y - (gy + l.h * 0.86)) / (l.h * 0.14), 0, 1);
      else ramp = Math.pow(1 - U().clamp((y - gy) / (0.62 * l.h), 0, 1), 1.7);
      ramp *= FLOOD_GAIN;
      _fc.setHex(cfg.c).convertSRGBToLinear();
      col[i * 3] = _fc.r * ramp; col[i * 3 + 1] = _fc.g * ramp; col[i * 3 + 2] = _fc.b * ramp;
    }
    pos.needsUpdate = true;
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }

  L.init = function () {
    rng = U().mulberry(808);
    const glass = [], flat = [], floodGeoms = [];
    const tags = [];
    const scene = RR.Engine.scene;
    let mart = null;
    for (const l of window.CHICAGO.landmarks) {
      clampToLand(l);
      curFam = F_NAME[l.name] !== undefined ? F_NAME[l.name]
        : (F_KIND[l.kind] !== undefined ? F_KIND[l.kind] : 0);
      const fn = builders[l.kind] || builders.boxglass;
      const g0 = glass.length, f0 = flat.length;
      fn(l, glass, flat);
      const cfg = FLOOD[l.name];
      if (cfg) {
        for (const g of glass.slice(g0)) floodGeoms.push(shellOf(g, l, cfg));
        for (const g of flat.slice(f0)) floodGeoms.push(shellOf(g, l, cfg));
      }
      if (l.kind === 'mart') mart = l;
      tags.push({
        name: NAME_OVERRIDE[l.name] || l.name, sub: SUB[l.name] || '',
        x: l.x, z: l.z, r2: Math.pow(Math.max(l.w, l.d) / 2 + 95, 2),
      });
    }

    // one mesh per facade family — the whole point of the family system
    const buckets = new Map();
    for (const g of glass) {
      const f = g.userData.fam | 0;
      if (!buckets.has(f)) buckets.set(f, []);
      buckets.get(f).push(g);
    }
    for (const [f, arr] of buckets) {
      // the family tile already carries the material's colour; without this the dark families
      // multiply CHICAGO's building hex down into pure black
      for (const g of arr) RR.City.famNormalize(g, f);
      const m = new THREE.Mesh(RR.City.mergeGeoms(arr), RR.City.material(f));
      m.name = 'lm-fam' + f;
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
    }
    const flatMesh = new THREE.Mesh(RR.City.mergeGeoms(flat), RR.City.flatMaterial());
    flatMesh.name = 'lm-flat';
    flatMesh.castShadow = true;
    scene.add(flatMesh);

    L.flood = RR.City.floodShell(floodGeoms);
    if (L.flood) {
      scene.add(L.flood);
      RR.Engine.onUpdate(() => {
        const m = RR.Theme && RR.Theme.mode;
        L.flood.visible = (m === 'night' || m === 'dusk');
      });
    }
    if (mart) L.mart = artOnTheMart(mart, scene);
    return tags;
  };

  RR.Landmarks = L;
})();

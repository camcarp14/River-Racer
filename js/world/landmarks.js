/* River Racer — bespoke low-poly builders for Chicago's signature riverfront buildings.
   Every builder returns an array of vertex-tinted geometries; all merge into two draw calls. */
(function () {
  const L = {};
  const U = () => RR.U;
  let rng;

  const GY = () => RR.City.GROUND_Y;

  function box(w, h, d, x, y, z, c, rotY) {
    const g = RR.City.towerGeom(w, h, d, x, z, rotY || 0);
    g.translate(0, y, 0);
    RR.City.tintGeom(g, c, 0, rng);
    return g;
  }
  function solid(geo, x, y, z, c) {
    geo.translate(x, y, z);
    RR.City.tintGeom(geo, c, 0, rng);
    return geo;
  }
  function cyl(rT, rB, h, seg, x, y, z, c) {
    return solid(new THREE.CylinderGeometry(rT, rB, h, seg), x, y + h / 2, z, c);
  }

  // glassGeoms get the window texture; flatGeoms are plain color
  const builders = {

    // twin concrete corncobs: open parking decks spiral up the bottom third, then ring
    // after ring of semicircular petal balconies — the real scalloped silhouette
    marina(l, glass, flat) {
      for (const s of [-1, 1]) {
        const x = l.x + s * 28, z = l.z;
        const parkH = l.h * 0.35, resH = l.h * 0.60;
        flat.push(cyl(7.0, 7.0, l.h * 0.99, 12, x, GY(), z, 0xa9a396));          // service core
        const decks = 9;
        for (let i = 0; i <= decks; i++) {                                        // open parking decks
          const y = GY() + (i / decks) * (parkH - 1);
          flat.push(solid(new THREE.CylinderGeometry(12.6, 12.6, 0.55, 18), x, y + 0.3, z, 0xcfc9bc));
        }
        const lvls = 11, petals = 14;
        for (let i = 0; i < lvls; i++) {
          const fh = resH / lvls, y = GY() + parkH + (i + 0.5) * fh;
          flat.push(solid(new THREE.CylinderGeometry(10.6, 10.6, fh * 0.9, 16), x, y, z, 0x5d6066)); // recessed glass band
          for (let k = 0; k < petals; k++) {                                      // balcony petals
            const a = (k / petals) * Math.PI * 2 + (i % 2) * (Math.PI / petals);
            flat.push(solid(new THREE.CylinderGeometry(2.5, 2.5, fh * 0.6, 6),
              x + Math.cos(a) * 11.4, y, z + Math.sin(a) * 11.4, 0xd6d0c2));
          }
        }
        flat.push(cyl(11.8, 12.6, 3.4, 18, x, GY() + parkH + resH, z, 0xb3ada0)); // mechanical crown
      }
    },

    // nine bundled black tubes with the famous setbacks + twin antennas.
    // Real profile: all nine to mid-height, seven on, five on, and just two ride to the top.
    willis(l, glass, flat) {
      const t = l.w / 3;
      const tubeH = [[0.46, 0.61, 0.46], [0.83, 1, 0.61], [0.46, 1, 0.83]];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const h = l.h * tubeH[i][j];
          glass.push(box(t - 1.5, h, t - 1.5, l.x + (i - 1) * t, GY(), l.z + (j - 1) * t, 0x191c20));
        }
      }
      for (const s of [-6, 6]) {
        flat.push(cyl(0.8, 1.2, 85, 6, l.x + s, GY() + l.h, l.z, 0xe8eaec));
      }
    },

    // stepped silver-blue glass slab + spire
    trump(l, glass, flat) {
      const SB = 0x9fb6c4;                                    // polished stainless-blue curtain wall
      glass.push(box(l.w, l.h * 0.45, l.d, l.x, GY(), l.z, SB));
      glass.push(box(l.w * 0.78, l.h * 0.75, l.d * 0.92, l.x + l.w * 0.1, GY(), l.z, SB));
      glass.push(box(l.w * 0.55, l.h, l.d * 0.84, l.x + l.w * 0.2, GY(), l.z, SB));
      flat.push(cyl(0.9, 1.6, 66, 6, l.x + l.w * 0.2, GY() + l.h, l.z, 0xcfd6da));
    },

    // gleaming white terra cotta + the tiered Spanish-revival clock tower
    wrigley(l, glass, flat) {
      const TC = 0xf4efdf;
      glass.push(box(l.w, l.h * 0.52, l.d, l.x, GY(), l.z, TC));                     // south block
      glass.push(box(l.w * 0.55, l.h * 0.68, l.d * 0.8, l.x - l.w * 0.1, GY(), l.z, TC)); // north annex
      const tx = l.x + l.w * 0.28;
      glass.push(box(14, l.h * 0.8, 14, tx, GY(), l.z, TC));                         // tower shaft
      flat.push(box(11.5, l.h * 0.08, 11.5, tx, GY() + l.h * 0.8, l.z, TC));         // first tier
      flat.push(cyl(4.8, 5.8, l.h * 0.09, 8, tx, GY() + l.h * 0.88, l.z, TC));       // octagonal tempietto
      flat.push(cyl(2.4, 3.4, l.h * 0.06, 8, tx, GY() + l.h * 0.965, l.z, TC));
      flat.push(cyl(0.3, 0.9, 5, 6, tx, GY() + l.h * 1.02, l.z, 0xd9d2ba));          // finial
      for (const [dx, dz] of [[7.2, 0], [-7.2, 0], [0, 7.2], [0, -7.2]]) {
        const face = new THREE.CylinderGeometry(3.2, 3.2, 0.5, 12);
        face.rotateZ(Math.PI / 2);
        face.rotateY(dz !== 0 ? Math.PI / 2 : 0);
        flat.push(solid(face, tx + dx, GY() + l.h * 0.74, l.z + dz, 0x2a2d31));
      }
    },

    // neo-gothic: pale limestone shaft crowned by flying buttresses and pinnacles
    tribune(l, glass, flat) {
      const ST = 0xcdc5b2;
      glass.push(box(l.w, l.h * 0.76, l.d, l.x, GY(), l.z, ST));
      glass.push(box(l.w * 0.6, l.h * 0.92, l.d * 0.6, l.x, GY(), l.z, ST));
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        const bx2 = l.x + Math.cos(ang) * l.w * 0.3, bz2 = l.z + Math.sin(ang) * l.d * 0.3;
        flat.push(cyl(0.8, 1.2, l.h * 0.16, 4, bx2, GY() + l.h * 0.76, bz2, ST));     // buttress piers
        flat.push(solid(new THREE.ConeGeometry(1.1, 4.5, 4), bx2, GY() + l.h * 0.92 + 2.2, bz2, ST)); // pinnacles
      }
      flat.push(cyl(3.6, 6.4, l.h * 0.12, 8, l.x, GY() + l.h * 0.9, l.z, ST));        // crown drum
      flat.push(solid(new THREE.ConeGeometry(2.6, 7, 8), l.x, GY() + l.h * 1.02 + 3.5, l.z, ST));
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

    // curved bottle-green glass following the bend (arc of thin boxes)
    wacker333(l, glass, flat) {
      const segs = 9;
      for (let i = 0; i < segs; i++) {
        const a = (i / (segs - 1) - 0.5) * 1.5;                                    // ~86° arc
        const r = l.w * 0.72;
        glass.push(box(l.w / segs + 4, l.h, l.d * 0.8,
          l.x + Math.sin(a) * r, GY(), l.z + (1 - Math.cos(a)) * r, 0x3f8272, -a));
      }
      flat.push(box(l.w * 1.05, 4, l.d, l.x, GY() + l.h, l.z + l.w * 0.1, 0x1e3d38));
    },

    // St. Regis: three stacked-frustum sisters in shifting blue-green glass
    stregis(l, glass, flat) {
      const heights = [0.65, 1, 0.82];
      for (let i = 0; i < 3; i++) {
        const x = l.x + (i - 1) * (l.w / 3 + 1);
        const stacks = 4;
        for (let s = 0; s < stacks; s++) {
          const y0 = GY() + (s / stacks) * l.h * heights[i];
          const taper = s % 2 ? 1 : 0.88;
          glass.push(box((l.w / 3 - 2) * taper, l.h * heights[i] / stacks, l.d * (s % 2 ? 0.88 : 1),
            x, y0, l.z, i === 1 ? 0x4d7d8a : 0x5d8a96));
        }
      }
    },

    // Aqua: white balcony plates rippling like water around a dark glass core —
    // smooth multi-frequency waves instead of jitter, so the contours flow
    aqua(l, glass, flat) {
      glass.push(box(l.w - 7, l.h, l.d - 6, l.x, GY(), l.z, 0x2e4a58));
      const plates = 22;
      for (let i = 0; i < plates; i++) {
        const y = GY() + (i + 0.5) * (l.h / plates);
        const u = i * 0.9;
        flat.push(box(
          l.w + Math.sin(u) * 5 + Math.sin(u * 0.37 + 1.4) * 3.5, 0.5,
          l.d + Math.cos(u * 0.8) * 4 + Math.sin(u * 0.53 + 0.6) * 2.5,
          l.x + Math.sin(u * 0.61) * 2.2, y, l.z + Math.cos(u * 0.43) * 1.8, 0xf1f1ec));
      }
    },

    // terra cotta wedding cake with corner cupolas + central dome tower
    jewelers(l, glass, flat) {
      glass.push(box(l.w, l.h * 0.55, l.d, l.x, GY(), l.z, l.c));
      for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        flat.push(cyl(3.4, 3.8, 10, 8, l.x + sx * l.w * 0.42, GY() + l.h * 0.55, l.z + sz * l.d * 0.42, l.c));
        flat.push(solid(new THREE.SphereGeometry(3.6, 8, 6), l.x + sx * l.w * 0.42, GY() + l.h * 0.55 + 11, l.z + sz * l.d * 0.42, 0x9c9274));
      }
      glass.push(box(l.w * 0.5, l.h * 0.85, l.d * 0.5, l.x, GY(), l.z, l.c));
      flat.push(cyl(6, 8, l.h * 0.1, 8, l.x, GY() + l.h * 0.85, l.z, l.c));
      flat.push(solid(new THREE.SphereGeometry(6.5, 10, 7), l.x, GY() + l.h * 0.97, l.z, 0x9c9274));
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
      flat.push(cyl(4, 4.6, 8, 10, l.x + l.w * 0.32, GY() + l.h * 0.94, l.z - l.d * 0.3, l.c));
      flat.push(solid(new THREE.SphereGeometry(4.2, 8, 6), l.x + l.w * 0.32, GY() + l.h * 0.94 + 9, l.z - l.d * 0.3, 0x94886c));
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

    // glass tower balanced on a tapering base
    riverside150(l, glass, flat) {
      const base = new THREE.CylinderGeometry(l.w * 0.4, 4, l.h * 0.22, 4);
      base.rotateY(Math.PI / 4);
      flat.push(solid(base, l.x, GY() + l.h * 0.11, l.z, 0x27343c));
      glass.push(box(l.w, l.h * 0.78, l.d, l.x, GY() + l.h * 0.22, l.z, l.c));
    },

    // curved arc slab over an arched base
    riverpoint(l, glass, flat) {
      const segs = 7;
      for (let i = 0; i < segs; i++) {
        const a = (i / (segs - 1) - 0.5) * 0.9;
        glass.push(box(l.w / segs + 3, l.h - 14, l.d,
          l.x + Math.sin(a) * l.w * 0.8, GY() + 14, l.z + (1 - Math.cos(a)) * l.w * 0.5, l.c, -a));
      }
      const arch = new THREE.TorusGeometry(l.w * 0.4, 3, 6, 10, Math.PI);
      flat.push(solid(arch, l.x, GY() + 2, l.z, 0xd8dde0));
    },

    // pink granite + glowing crown drum
    crown311(l, glass, flat) {
      glass.push(box(l.w, l.h * 0.86, l.d, l.x, GY(), l.z, l.c));
      for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        glass.push(box(l.w * 0.3, l.h * 0.62, l.d * 0.3, l.x + sx * l.w * 0.42, GY(), l.z + sz * l.d * 0.42, l.c));
      }
      flat.push(cyl(l.w * 0.22, l.w * 0.22, l.h * 0.12, 12, l.x, GY() + l.h * 0.86, l.z, 0xf3f6f8));
      flat.push(cyl(l.w * 0.1, l.w * 0.1, l.h * 0.05, 10, l.x, GY() + l.h * 0.97, l.z, 0xf3f6f8));
    },

    nbc(l, glass, flat) {
      glass.push(box(l.w, l.h * 0.85, l.d, l.x, GY(), l.z, l.c));
      glass.push(box(l.w * 0.6, l.h * 0.97, l.d * 0.6, l.x, GY(), l.z, l.c));
      flat.push(cyl(0.7, 1.1, 30, 6, l.x, GY() + l.h * 0.97, l.z, 0x3a3f45));
    },

    swissotel(l, glass, flat) {
      const tri = new THREE.CylinderGeometry(l.w * 0.62, l.w * 0.62, l.h, 3);
      tri.rotateY(Math.PI / 6);
      glass.push(solid(tri, l.x, GY() + l.h / 2, l.z, l.c));
    },

    // black three-lobed curve on the lakefront
    lakepoint(l, glass, flat) {
      for (let a = 0; a < 3; a++) {
        const ang = a * (Math.PI * 2 / 3) + 0.5;
        const lobe = new THREE.CylinderGeometry(l.w * 0.3, l.w * 0.3, l.h, 10);
        lobe.scale(1, 1, 0.55);
        lobe.rotateY(ang);
        glass.push(solid(lobe, l.x + Math.cos(ang) * l.w * 0.18, GY() + l.h / 2, l.z + Math.sin(ang) * l.w * 0.18, l.c));
      }
      flat.push(cyl(l.w * 0.5, l.w * 0.5, 4, 12, l.x, GY(), l.z, 0x3c4046));
    },

    reid(l, glass, flat) {
      glass.push(box(l.w, l.h, l.d, l.x, GY(), l.z, l.c));
      glass.push(box(10, l.h * 1.6, 10, l.x, GY(), l.z, l.c));
      flat.push(cyl(4, 5.5, 6, 4, l.x, GY() + l.h * 1.6, l.z, 0x7d3f28));
      for (const [dx, dz] of [[5.2, 0], [-5.2, 0], [0, 5.2], [0, -5.2]]) {
        const face = new THREE.CylinderGeometry(2.2, 2.2, 0.4, 10);
        face.rotateZ(Math.PI / 2);
        face.rotateY(dz !== 0 ? Math.PI / 2 : 0);
        flat.push(solid(face, l.x + dx, GY() + l.h * 1.38, l.z + dz, 0xe8e2ce));
      }
    },

    deco(l, glass, flat) {
      glass.push(box(l.w, l.h * 0.7, l.d, l.x, GY(), l.z, l.c));
      glass.push(box(l.w * 0.72, l.h * 0.88, l.d * 0.72, l.x, GY(), l.z, l.c));
      glass.push(box(l.w * 0.45, l.h, l.d * 0.45, l.x, GY(), l.z, l.c));
      if (l.gold) flat.push(box(l.w * 0.3, l.h * 0.06, l.d * 0.3, l.x, GY() + l.h, l.z, 0xc9a227));
    },

    boxglass(l, glass, flat) {
      glass.push(box(l.w, l.h, l.d, l.x, GY(), l.z, l.c));
      if (l.h > 150) flat.push(box(l.w * 0.5, 4, l.d * 0.5, l.x, GY() + l.h, l.z, 0x6b7176));
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
      flat.push(box(l.w * 1.04, 2.5, l.d * 1.04, l.x, GY() + l.h, l.z, 0x8f8672));
    },
  };

  // Nudge a landmark landward until its whole footprint clears every channel.
  // The hand-placed lat/lons don't perfectly match the GIS centerline, so without this
  // a few towers (Marina City, 333 W Wacker, River Point...) overhang the water.
  const BULGE = { wacker333: 0.42, riverpoint: 0.4, aqua: 0.12 };  // curved builders reach past w/d
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
        const deficit = (q.w + extent + 7) - q.dist;   // >0 means it overhangs the water
        if (deficit > 0 && (!worst || deficit > worst.deficit)) worst = { nx, nz, deficit };
      }
      if (!worst) break;
      l.x += worst.nx * worst.deficit;
      l.z += worst.nz * worst.deficit;
    }
  }

  L.init = function () {
    rng = U().mulberry(808);
    const glass = [], flat = [];
    const tags = [];
    for (const l of window.CHICAGO.landmarks) {
      clampToLand(l);
      const fn = builders[l.kind] || builders.boxglass;
      fn(l, glass, flat);
      tags.push({ name: l.name, x: l.x, z: l.z, r2: Math.pow(Math.max(l.w, l.d) / 2 + 95, 2) });
    }
    const scene = RR.Engine.scene;
    const glassMesh = new THREE.Mesh(RR.City.mergeGeoms(glass), RR.City.material());
    glassMesh.castShadow = true;
    glassMesh.receiveShadow = true;
    scene.add(glassMesh);
    const flatMesh = new THREE.Mesh(RR.City.mergeGeoms(flat), RR.City.flatMaterial());
    flatMesh.castShadow = true;
    scene.add(flatMesh);
    return tags;
  };

  RR.Landmarks = L;
})();

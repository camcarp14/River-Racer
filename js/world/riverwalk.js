/* River Racer — the Chicago Riverwalk: a multi-level promenade (banded quay wall, lower
   walkway, precast retaining wall, cable railings) on every downtown bank, plus the six real
   Sasaki / Ross Barney "rooms" of the Main Stem's SOUTH bank — the Riverbank, the Jetty, the
   Water Plaza, the River Theater, the Cove and the Marina Plaza — in their real order.
   The north bank gets only what is really there: Marina City's slips, Trump's terrace and the
   Wendella dock at the Wrigley Building.
   Every piece is per-segment keep-out checked so nothing sits over the water. */
(function () {
  const RW = { tags: [] };
  const U = () => RR.U;
  let rng;
  const GY = () => RR.City.GROUND_Y;   // upper street level (~6m)
  // CHICAGO §3.2: normal pool to the lower Riverwalk deck is really ~0.9 m (3 ft), not 5.
  // The upper drop falls out at 4.9 m, which keeps GROUND_Y = 6.0 correct.
  const PY = 1.1;
  const PROM = 9;                       // promenade reaches w .. w+9
  RW.PY = PY;

  let deck = [], flat = [], wall = [], bright = [];   // geometry buckets
  function tint(g, hex, jit) { RR.City.tintGeom(g, hex, jit || 0, rng); return g; }
  // W2 is landing tintGeomAO concurrently; tintGeom ignores the trailing args, so this degrades
  // to a flat tint rather than throwing if the API has not arrived yet.
  function tintAO(g, hex, jit, y0, y1, fm) {
    (RR.City.tintGeomAO || RR.City.tintGeom)(g, hex, jit || 0, rng, y0, y1, fm);
    return g;
  }

  // ---------- the quay wall ----------
  // The single flat #8F8C82 cliff was the biggest realism loss at boat level. Band heights are
  // ART §3.5's (0.15 / 0.55 / 0.62 / 0.90) so the geometry registers exactly with the water
  // shader's contact-shadow and scum terms; the hexes are CHICAGO §3.2's measured ones.
  const QUAY = [
    [-0.70, 0.15, 0x46584a],   // permanently wet — black-green algae
    [0.15, 0.55, 0x3b3a32],   // splash / wet-stain zone
    [0.55, 0.62, 0x33322b],   // the shade line the scum ledge casts on the stain below it
    [0.62, 0.90, 0xb8b09c],   // mineral scum line — the white stripe you actually see
    [0.90, PY, 0x6e6a5f],   // steel sheet pile above the waterline
  ];
  const PRECAST = 0xb4afa4;

  // Sheet-pile ribs every 0.5 m and precast form joints every 1.2 m are ~50,000 features along
  // this river. That is texture work, not geometry: one 64² tiling multiplier map on the wall
  // material buys both for zero triangles and zero extra draw calls.
  let wallTex = null;
  function wallTexture() {
    if (wallTex) return wallTex;
    wallTex = U().canvasTexture(64, 64, (ctx) => {
      ctx.fillStyle = '#f0eee9'; ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#fdfcf9'; ctx.fillRect(4, 0, 26, 64);     // proud face of the pile
      ctx.fillStyle = '#c6c2ba'; ctx.fillRect(0, 0, 4, 64);      // rib shadow
      ctx.fillStyle = '#dedad2'; ctx.fillRect(34, 0, 30, 64);    // recessed web
      ctx.fillStyle = '#b7b3ab'; ctx.fillRect(0, 0, 64, 2);      // horizontal form joint
      ctx.fillStyle = '#fbfaf6'; ctx.fillRect(0, 2, 64, 1);      // and its lit lower lip
    });
    wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
    wallTex.anisotropy = 8;
    wallTex.minFilter = THREE.LinearMipmapLinearFilter;
    wallTex.generateMipmaps = true;
    if (THREE.sRGBEncoding) wallTex.encoding = THREE.sRGBEncoding;
    return wallTex;
  }

  // is (x,z) over some OTHER channel's water? (keeps a bank's walkway off its neighbour)
  function overOther(x, z, selfKey, margin) {
    for (const key in RR.River.paths) {
      if (key.startsWith('lake') || key === selfKey) continue;
      const q = U().pathNearest(RR.River.paths[key], x, z);
      if (q.dist < q.w + (margin || 0)) return true;
    }
    return false;
  }

  // one quad (a,b,c,d in order) into an array, winding for an upward/outward face
  function quad(arr, ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, hex, jit) {
    const g = new THREE.BufferGeometry();
    const v = new Float32Array([ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz]);
    g.setAttribute('position', new THREE.BufferAttribute(v, 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    arr.push(tint(g, hex, jit));
  }

  // a wall quad carrying UVs for the rib/joint map: u tiles every `uPitch` metres of bank run,
  // v every 1.2 m of height, so one texture serves sheet pile and precast panels alike.
  function wallQuad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, run, uPitch, hex, jit, ao) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(
      [ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz]), 3));
    const u1 = run / uPitch;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(
      [0, ay / 1.2, u1, by / 1.2, u1, cy / 1.2, 0, dy / 1.2]), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    if (ao) tintAO(g, hex, jit, ao[0], ao[1], ao[2]); else tint(g, hex, jit);
    wall.push(g);
  }

  function bankBasis(p, i) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(p.n - 1, i + 1);
    let tx = p.x[i1] - p.x[i0], tz = p.z[i1] - p.z[i0];
    const tl = Math.max(1e-6, Math.hypot(tx, tz)); tx /= tl; tz /= tl;
    return { tx, tz, nx: -tz, nz: tx, w: p.w[i], x: p.x[i], z: p.z[i] };
  }

  // ---------- the promenade ribbon (per-segment, so we can skip bad spots) ----------
  function buildPromenade(key, p, openX) {
    for (const s of [-1, 1]) {
      for (let i = 0; i < p.n - 1; i++) {
        const A = bankBasis(p, i), B = bankBasis(p, i + 1);
        // offset points: e = edge (w+0.3), o = outer (w+PROM)
        const eAx = A.x + A.nx * (A.w + 0.3) * s, eAz = A.z + A.nz * (A.w + 0.3) * s;
        const eBx = B.x + B.nx * (B.w + 0.3) * s, eBz = B.z + B.nz * (B.w + 0.3) * s;
        const oAx = A.x + A.nx * (A.w + PROM) * s, oAz = A.z + A.nz * (A.w + PROM) * s;
        const oBx = B.x + B.nx * (B.w + PROM) * s, oBz = B.z + B.nz * (B.w + PROM) * s;
        // keep-out: skip the whole segment if either bank end sits over another channel / the lake
        const midOx = (oAx + oBx) / 2, midOz = (oAz + oBz) / 2;
        const midEx = (eAx + eBx) / 2, midEz = (eAz + eBz) / 2;
        if (midOx > openX - 6 || midEx > openX - 6) continue;
        if (overOther(midOx, midOz, key, 2) || overOther(midEx, midEz, key, 2)) continue;
        const run = Math.hypot(eBx - eAx, eBz - eAz);

        // lower promenade deck (alternating wood / concrete bands)
        const woodBand = (i % 6) < 3;
        const dcol = woodBand ? 0x9c7245 : 0xb7b1a2;
        if (s > 0) quad(deck, eAx, PY, eAz, oAx, PY, oAz, oBx, PY, oBz, eBx, PY, eBz, dcol, 0.08);
        else quad(deck, eAx, PY, eAz, eBx, PY, eBz, oBx, PY, oBz, oAx, PY, oAz, dcol, 0.08);

        // quay wall (water → promenade), banded by height
        for (let k = 0; k < QUAY.length; k++) {
          const y0 = QUAY[k][0], y1 = QUAY[k][1];
          wallQuad(eAx, y0, eAz, eBx, y0, eBz, eBx, y1, eBz, eAx, y1, eAz, run, 0.5, QUAY[k][2], 0.05);
        }
        // retaining wall (promenade → street): precast panels, darkened where they meet the deck
        wallQuad(oAx, PY, oAz, oBx, PY, oBz, oBx, GY(), oBz, oAx, GY(), oAz, run, 2.4,
                 PRECAST, 0.05, [PY, PY + 4.2, 0.72]);

        // water-edge railing: top rail + two horizontal cables, which reads far stronger from a
        // boat than a picket fence and costs a fifth as much
        const rEAx = A.x + A.nx * (A.w + 0.5) * s, rEAz = A.z + A.nz * (A.w + 0.5) * s;
        const rEBx = B.x + B.nx * (B.w + 0.5) * s, rEBz = B.z + B.nz * (B.w + 0.5) * s;
        wallQuad(rEAx, PY + 1.05, rEAz, rEBx, PY + 1.05, rEBz, rEBx, PY + 0.95, rEBz, rEAx, PY + 0.95, rEAz,
                 run, 2.4, 0x565b60, 0);
        for (const cy of [0.70, 0.38]) {
          wallQuad(rEAx, PY + cy + 0.04, rEAz, rEBx, PY + cy + 0.04, rEBz,
                   rEBx, PY + cy - 0.04, rEBz, rEAx, PY + cy - 0.04, rEAz, run, 2.4, 0x4a4f54, 0);
        }
        if (i % 3 === 0) {
          const post = new THREE.BoxGeometry(0.09, 1.05, 0.09);
          post.translate(rEAx, PY + 0.52, rEAz); tint(post, 0x44494e, 0); flat.push(post);
        }
      }
    }
  }

  // ---------- room furniture ----------
  function boxAt(arr, w, h, d, x, y, z, ang, hex, jit) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (ang) g.rotateY(ang);
    g.translate(x, y, z); tint(g, hex, jit || 0); arr.push(g);
  }
  function cylAt(arr, r, h, x, y, z, hex, seg) {
    const g = new THREE.CylinderGeometry(r, r, h, seg || 8);
    g.translate(x, y, z); tint(g, hex, 0); arr.push(g);
  }
  const UMB = [0xd8412f, 0xf0a92b, 0x2f7dd8, 0x36a852, 0xe8e4da, 0xd85a9e];

  // ART rule 5: two canopy layers. The Riverwalk is planted with honey locust and serviceberry —
  // fine, airy and yellow-green, not the dark municipal maple.
  const HONEY = [0x7d9a48, 0x6a8a3e], SERVICE = [0x557a3c, 0x486b33];
  function treeAt(x, y, z, r, pal) {
    const trunk = new THREE.CylinderGeometry(0.22, 0.34, 3.6, 5);
    trunk.translate(x, y + 1.8, z); tint(trunk, 0x5a4632, 0.10); flat.push(trunk);
    const lower = new THREE.SphereGeometry(r, 7, 6);
    lower.scale(1, 0.72, 1); lower.translate(x, y + 3.6, z);
    tint(lower, pal[1], 0.14); flat.push(lower);
    // CUT #1: the second layer only inside 260 m of a centreline — which the Riverwalk always is
    const clear = RR.City.landClearance ? RR.City.landClearance(x, z) : 0;
    if (clear < 260) {
      const upper = new THREE.SphereGeometry(r * 0.72, 7, 6);
      upper.translate(x + (rng() - 0.5) * r * 0.5, y + 5.4, z + (rng() - 0.5) * r * 0.5);
      tint(upper, pal[0], 0.14); flat.push(upper);
    }
  }

  function umbrellaTable(x, z, col) {
    cylAt(flat, 0.09, 2.4, x, PY + 1.2, z, 0x6a6f74, 6);          // pole
    const top = new THREE.ConeGeometry(1.6, 0.7, 8);
    top.translate(x, PY + 2.5, z); tint(top, col, 0); bright.push(top);
    cylAt(flat, 0.55, 0.08, x, PY + 0.75, z, 0xdad6cc, 8);        // table
    cylAt(flat, 0.06, 0.75, x, PY + 0.38, z, 0x9a9a9a, 5);
    for (let a = 0; a < 4; a++) {                                  // chairs
      const cx = x + Math.cos(a * 1.57) * 1.0, cz = z + Math.sin(a * 1.57) * 1.0;
      boxAt(flat, 0.4, 0.45, 0.4, cx, PY + 0.25, cz, 0, 0x51565b);
    }
  }
  function pavilion(cx, cz, ang) {
    const c = Math.cos(ang), s = Math.sin(ang);
    for (const [ox, oz] of [[-3, -2.2], [3, -2.2], [-3, 2.2], [3, 2.2]]) {
      const px = cx + c * ox - s * oz, pz = cz + s * ox + c * oz;
      cylAt(flat, 0.14, 3.2, px, PY + 1.6, pz, 0x3d4247, 6);       // steel post
    }
    boxAt(flat, 7.4, 0.3, 5.2, cx, PY + 3.3, cz, ang, 0x2b3036);   // canopy roof
    boxAt(bright, 7.0, 0.06, 4.8, cx, PY + 3.15, cz, ang, 0xbfe0e8);// glass underside
    umbrellaTable(cx, cz, 0xe8e4da);
    boxAt(flat, 4.5, 1.0, 1.0, cx - s * 2.2, PY + 0.5, cz + c * 2.2, ang, 0x6a5233); // counter
  }
  function umbrellaPlaza(cx, cz, ang) {
    const c = Math.cos(ang), s = Math.sin(ang);
    let k = 0;
    for (const [ox, oz] of [[-2.5, -1.5], [2.5, -1.5], [0, 1.8], [-2.5, 2.5], [2.5, 2.5]]) {
      const px = cx + c * ox - s * oz, pz = cz + s * ox + c * oz;
      umbrellaTable(px, pz, UMB[k++ % UMB.length]);
    }
  }
  function floatingGarden(cx, cz, ang) {
    // a planted island just off the quay, at the water's edge
    boxAt(flat, 8, 0.4, 3.2, cx, 0.45, cz, ang, 0x6a5a3a);          // planter hull
    boxAt(bright, 7.4, 0.7, 2.7, cx, 0.9, cz, ang, 0x4e8b3a);       // foliage
    for (let t = -1; t <= 1; t++) {
      const gx = cx + Math.cos(ang) * t * 2.2, gz = cz + Math.sin(ang) * t * 2.2;
      const bush = new THREE.SphereGeometry(0.9 + rng() * 0.5, 6, 5);
      bush.scale(1, 0.8, 1); bush.translate(gx, 1.5, gz);
      tint(bush, rng() > 0.5 ? 0x5d9a44 : 0x77a84e, 0.15); bright.push(bush);
    }
  }
  function kayakDock(cx, cz, ang) {
    const c = Math.cos(ang), s = Math.sin(ang);
    boxAt(flat, 3, 0.25, 8, cx, PY - 0.35, cz, ang, 0x7a6242);      // low floating dock
    for (let n = -1; n <= 1; n++) {
      const kx = cx - s * n * 2.2, kz = cz + c * n * 2.2;
      const kayak = new THREE.CylinderGeometry(0.35, 0.2, 4.2, 6);
      kayak.rotateZ(Math.PI / 2); kayak.rotateY(ang);
      kayak.translate(kx + c * 3, 0.35, kz + s * 3);
      tint(kayak, UMB[(n + 1) % UMB.length], 0); bright.push(kayak);
    }
  }
  // a rack of hulls on the bank behind the Cove's dock
  function hullRack(cx, cz, ang) {
    const c = Math.cos(ang), s = Math.sin(ang);   // local +x = across channel, +z = along it
    for (const so of [-1, 1]) boxAt(flat, 0.12, 2.0, 0.12, cx + c * so * 2.4, PY + 1.0, cz - s * so * 2.4, ang, 0x4d5257);
    for (let lvl = 0; lvl < 3; lvl++) {
      boxAt(flat, 5.2, 0.09, 0.5, cx, PY + 0.55 + lvl * 0.62, cz, ang, 0x4d5257);
      for (const so of [-1, 1]) {
        const hx = cx + c * so * 1.3, hz = cz - s * so * 1.3;
        const hull = new THREE.CylinderGeometry(0.30, 0.18, 3.9, 6);
        hull.rotateZ(Math.PI / 2); hull.rotateY(ang);
        hull.translate(hx, PY + 0.72 + lvl * 0.62, hz);
        tint(hull, UMB[(lvl * 2 + (so > 0 ? 1 : 0)) % UMB.length], 0); bright.push(hull);
      }
    }
  }
  // the River Theater: wide steps from the street down to the promenade, with trees in the steps
  function riverTheater(path, wAt, dMid, s) {
    const steps = 6;
    for (let st = 0; st < steps; st++) {
      const off = wAt + 8.5 - st * 1.2;
      const y = GY() - (GY() - PY) * (st / (steps - 1));
      for (let j = -5; j <= 5; j++) {
        const a = U().pathAt(path, dMid + j * 2.2, {});
        const x = a.x + (-a.tz) * (a.w + off) * s, z = a.z + a.tx * (a.w + off) * s;
        boxAt(flat, 2.4, 0.35, 2.6, x, y, z, Math.atan2(a.tx, a.tz), st % 2 ? 0xbdb7a8 : 0xa9a394);
        // Ross Barney planted honey locusts straight into the stair — the detail everyone photographs
        if (st === 2 && (j === -3 || j === 2)) treeAt(x, y + 0.18, z, 1.5, HONEY);
      }
    }
  }

  // ---------- the six real rooms ----------
  // The Jetty: five ipe finger piers with floating wetland gardens between them (CHICAGO §3.3)
  function jetty(path, dMid, s) {
    for (let k = -2; k <= 2; k++) {
      const a = U().pathAt(path, dMid + k * 22, {});
      const ang = Math.atan2(a.tx, a.tz);
      const nx = -a.tz * s, nz = a.tx * s;
      const cAcross = a.w - 2.2;                        // reaches ~5 m out over the water
      const px = a.x + nx * cAcross, pz = a.z + nz * cAcross;
      boxAt(flat, 5.0, 0.30, 2.0, px, PY - 0.42, pz, ang, 0x6b4a2e, 0.06);   // ipe decking
      boxAt(flat, 5.0, 0.22, 0.16, px, PY - 0.14, pz, ang, 0x54381f);        // kerb
      for (const so of [-1, 1]) {                                            // mooring piles
        cylAt(flat, 0.14, 1.5, px + nx * so * 2.3, PY - 0.6, pz + nz * so * 2.3, 0x3f444a, 5);
      }
      RR.River.addObstacle(a.x + nx * (a.w - 4.4), a.z + nz * (a.w - 4.4), 1.6);
      if (k < 2) {   // a wetland planter in the gap between this pier and the next
        const gA = U().pathAt(path, dMid + k * 22 + 11, {});
        floatingGarden(gA.x + (-gA.tz) * (gA.w - 1.2) * s, gA.z + gA.tx * (gA.w - 1.2) * s, ang);
      }
    }
  }
  // The Water Plaza: a zero-depth fountain — black granite with a 6 × 3 grid of ground jets
  function waterPlaza(path, dMid, s) {
    const a = U().pathAt(path, dMid, {});
    const ang = Math.atan2(a.tx, a.tz);
    const c = Math.cos(ang), sn = Math.sin(ang);
    const off = a.w + 5.0;
    const cx = a.x + (-a.tz) * off * s, cz = a.z + a.tx * off * s;
    boxAt(flat, 9, 0.10, 22, cx, PY + 0.05, cz, ang, 0x22201e, 0.04);          // polished granite
    boxAt(flat, 9.6, 0.14, 0.4, cx - sn * 11.2, PY + 0.07, cz + c * 11.2, ang, 0x6f6a60);
    boxAt(flat, 9.6, 0.14, 0.4, cx + sn * 11.2, PY + 0.07, cz - c * 11.2, ang, 0x6f6a60);
    for (let r = -2.5; r <= 2.5; r += 1) {
      for (let q = -1; q <= 1; q++) {
        const jx = cx + c * q * 2.6 - sn * r * 3.2, jz = cz + sn * q * 2.6 + c * r * 3.2;
        cylAt(flat, 0.13, 0.06, jx, PY + 0.12, jz, 0x8d8880, 6);               // nozzle ring
        const jh = 0.55 + rng() * 1.5;
        const jet = new THREE.CylinderGeometry(0.035, 0.10, jh, 5);
        jet.translate(jx, PY + 0.15 + jh / 2, jz); tint(jet, 0xd6e6ea, 0.10); bright.push(jet);
      }
    }
  }
  // The Marina Plaza: restaurant terraces, umbrellas and slips
  function marinaPlaza(path, dMid, s) {
    const a = U().pathAt(path, dMid, {});
    const ang = Math.atan2(a.tx, a.tz);
    const cx = a.x + (-a.tz) * (a.w + 4.6) * s, cz = a.z + a.tx * (a.w + 4.6) * s;
    umbrellaPlaza(cx, cz, ang);
    for (let t = 0; t < 2; t++) {
      const off = a.w + 7.0 + t * 1.4;
      const tx2 = a.x + (-a.tz) * off * s, tz2 = a.z + a.tx * off * s;
      boxAt(flat, 3.0, 0.5 + t * 0.5, 26, tx2, PY + (0.25 + t * 0.25), tz2, ang, t ? 0xa9a394 : 0xbdb7a8, 0.05);
    }
    boatSlips(path, dMid, s, 2);
  }
  // finger slips off a bank — the marina in a boat game
  function boatSlips(path, dMid, s, n) {
    for (let k = 0; k < n; k++) {
      const a = U().pathAt(path, dMid + (k - (n - 1) / 2) * 26, {});
      const ang = Math.atan2(a.tx, a.tz);
      const nx = -a.tz * s, nz = a.tx * s;
      const px = a.x + nx * (a.w - 3.0), pz = a.z + nz * (a.w - 3.0);
      boxAt(flat, 7.0, 0.26, 1.4, px, PY - 0.5, pz, ang, 0x8a8478, 0.05);
      for (const so of [-1, 1]) cylAt(flat, 0.13, 1.4, px + nx * so * 3.3, PY - 0.6, pz + nz * so * 3.3, 0x3f444a, 5);
      RR.River.addObstacle(a.x + nx * (a.w - 5.0), a.z + nz * (a.w - 5.0), 1.8);
      // a moored runabout lying alongside the finger
      const bx = px + a.tx * 2.2, bz = pz + a.tz * 2.2;
      const hull = new THREE.BoxGeometry(5.4, 1.0, 1.9);
      hull.rotateY(ang); hull.translate(bx, 0.42, bz);
      tint(hull, [0xf1efe8, 0x1b3a6b, 0xb0322a][k % 3], 0.05); flat.push(hull);
      boxAt(bright, 2.0, 0.12, 1.6, bx, 0.98, bz, ang, 0xf2c230);   // bimini
    }
  }
  // Vietnam Veterans Memorial Plaza (2005), State → Wabash: a black granite wall and a still basin
  function veterans(path, dMid, s) {
    const a = U().pathAt(path, dMid, {});
    const ang = Math.atan2(a.tx, a.tz);
    const off = a.w + 6.4;
    const cx = a.x + (-a.tz) * off * s, cz = a.z + a.tx * off * s;
    boxAt(flat, 0.7, 2.4, 18, cx, PY + 1.2, cz, ang, 0x23211f, 0.03);
    boxAt(flat, 1.3, 0.25, 18.6, cx, PY + 0.12, cz, ang, 0x8d8880, 0.04);
    const bx = cx + (-a.tz * s) * 2.9, bz = cz + (a.tx * s) * 2.9;   // basin, one plane back from the wall
    boxAt(flat, 4.2, 0.30, 12, bx, PY + 0.15, bz, ang, 0x2b2926, 0.03);
    boxAt(bright, 3.6, 0.05, 11.4, bx, PY + 0.32, bz, ang, 0x9fc2cf);
  }
  // Riverwalk East (Michigan → Lake Shore Dr): the newest and widest stretch — lawn and trees
  function lawnRoom(path, dMid, s) {
    for (let j = -4; j <= 4; j++) {
      const a = U().pathAt(path, dMid + j * 11, {});
      const ang = Math.atan2(a.tx, a.tz);
      const off = a.w + 6.0;
      const x = a.x + (-a.tz) * off * s, z = a.z + a.tx * off * s;
      boxAt(flat, 5.4, 0.12, 10.6, x, PY + 0.06, z, ang, j % 2 ? 0x4f7a3a : 0x577f3f, 0.10);
      if (j % 2 === 0) {
        const bx = a.x + (-a.tz) * (a.w + 2.6) * s, bz = a.z + a.tx * (a.w + 2.6) * s;
        boxAt(flat, 0.5, 0.42, 2.0, bx, PY + 0.42, bz, ang, 0x6a5233);   // bench
      } else treeAt(x, PY, z, 1.8, j % 4 ? HONEY : SERVICE);
    }
  }
  // The Riverbank (Lake St → Franklin): plain promenade, lawn edge, honey locusts
  function riverbank(path, dMid, s) {
    for (let j = -4; j <= 4; j++) {
      const a = U().pathAt(path, dMid + j * 10, {});
      const ang = Math.atan2(a.tx, a.tz);
      const x = a.x + (-a.tz) * (a.w + 6.6) * s, z = a.z + a.tx * (a.w + 6.6) * s;
      boxAt(flat, 4.6, 0.12, 9.6, x, PY + 0.06, z, ang, j % 2 ? 0x4f7a3a : 0x577f3f, 0.10);
      if (j % 2) treeAt(x, PY, z, 1.9, HONEY); else if (j === 0) treeAt(x, PY, z, 1.6, SERVICE);
    }
  }

  // ---------- docked working boats (CHICAGO §3.10 liveries) ----------
  function tourBoat(cx, cz, ang, taxi) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const L = taxi ? 12 : 26, W = taxi ? 4.2 : 6;
    const hull = new THREE.BoxGeometry(W, 1.8, L);
    const hp = hull.attributes.position;
    for (let i = 0; i < hp.count; i++) { if (Math.abs(hp.getZ(i)) > L * 0.4) hp.setX(i, hp.getX(i) * 0.4); }
    hull.computeVertexNormals();
    hull.rotateY(ang); hull.translate(cx, 0.5, cz);
    // Chicago Water Taxi is #F2B01E on a black gunwale; the tour boats are the First Lady's navy
    tint(hull, taxi ? 0xf2b01e : 0x16305b, 0.04); flat.push(hull);
    boxAt(flat, W + 0.16, 0.34, L - 1.2, cx, 1.28, cz, ang, taxi ? 0x141414 : 0xb0322a);  // gunwale / red trim
    boxAt(flat, W - 0.6, 0.2, L - 3, cx, 1.5, cz, ang, taxi ? 0xf1efe8 : 0xf4f2ec);       // white deck
    if (taxi) {
      boxAt(flat, W - 1.0, 1.5, L - 5.5, cx, 2.3, cz, ang, 0xf2b01e, 0.03);               // cabin
      boxAt(flat, W - 0.6, 0.18, L - 4.8, cx, 3.14, cz, ang, 0xf1efe8);                   // white roof
      boxAt(flat, W - 0.94, 0.7, L - 6.6, cx, 2.55, cz, ang, 0x2c3038);                   // window band
    } else {
      boxAt(bright, W - 0.4, 0.16, L - 6, cx, 3.4, cz, ang, 0xb0322a);                    // striped canopy
      for (const zz of [-1, 1]) for (const xx of [-1, 1]) {
        cylAt(flat, 0.08, 2.0, cx + c * xx * (W / 2 - 0.5) - s * zz * (L / 2 - 3), 2.4, cz + s * xx * (W / 2 - 0.5) + c * zz * (L / 2 - 3), 0x8a8f94, 5);
      }
      for (let r = -3; r <= 3; r++) boxAt(flat, W - 1.2, 0.4, 0.5, cx - s * r * 2.4, 1.85, cz + c * r * 2.4, ang, 0x3a4048);
      boxAt(flat, W - 2.2, 1.1, 3.0, cx - s * (L / 2 - 3.4), 2.25, cz + c * (L / 2 - 3.4), ang, 0xf4f2ec); // pilot house
    }
    RR.River.addObstacle(cx, cz, taxi ? 3 : 4.5);
  }

  // ---------- room table ----------
  // The six Sasaki / Ross Barney rooms in their real west→east order, keyed on the room's
  // midpoint x, plus the three older stretches east of State. All on the SOUTH bank.
  const ROOMS = [
    [-640, -456, 'riverbank'], [-456, -323, 'jetty'], [-323, -199, 'waterplaza'],
    [-199, -75, 'theater'], [-75, 50, 'cove'], [50, 174, 'marina'],
    [174, 307, 'veterans'], [307, 464, 'terrace'], [464, 820, 'lawn'],
  ];
  const ROOM_TAGS = {
    riverbank: ['THE RIVERBANK', 'CHICAGO RIVERWALK · 2015 · SASAKI + ROSS BARNEY'],
    jetty: ['THE JETTY', 'FLOATING WETLAND GARDENS · PEOPLE FISH HERE'],
    waterplaza: ['THE WATER PLAZA', 'ZERO-DEPTH FOUNTAIN · RUN THROUGH IT'],
    theater: ['THE RIVER THEATER', 'STAIR FROM UPPER WACKER · TREES IN THE STEPS'],
    cove: ['THE COVE', 'KAYAK DOCK · 80+ FISH SPECIES ARE BACK'],
    marina: ['MARINA PLAZA', 'TERRACES + SLIPS · DEARBORN TO STATE'],
    veterans: ['VIETNAM VETERANS MEMORIAL PLAZA', '2005 · BLACK GRANITE + STILL WATER'],
    lawn: ['RIVERWALK EAST', 'THE NEWEST + WIDEST STRETCH · 2016'],
  };
  function roomKind(x) { for (const r of ROOMS) if (x >= r[0] && x < r[1]) return r[2]; return null; }

  RW.init = function () {
    rng = U().mulberry(6161);
    deck = []; flat = []; wall = []; bright = []; RW.tags = [];
    const C = window.CHICAGO;
    const openX = C.lake.openWaterX;

    // promenade on every downtown channel
    for (const key in RR.River.paths) {
      if (key.startsWith('lake')) continue;
      buildPromenade(key, RR.River.paths[key], openX);
    }

    // Main-Stem "rooms" between consecutive bridges
    const main = RR.River.paths.main;
    const bd = [];
    for (const b of C.bridges) if (b.branch === 'main') bd.push(U().pathNearest(main, b.x, b.z).d);
    bd.sort((a, b) => a - b);
    const bounds = [8, ...bd, main.len - 8];
    let boatCount = 0;
    for (let k = 0; k < bounds.length - 1; k++) {
      if (bounds[k + 1] - bounds[k] < 46) continue;
      const dMid = (bounds[k] + bounds[k + 1]) / 2;
      const a = U().pathAt(main, dMid, {});
      const kind = roomKind(a.x);
      if (!kind) continue;
      const s = 1;                                   // south bank only — the north bank is private
      const off = a.w + 4.6;
      const cx = a.x + (-a.tz) * off * s, cz = a.z + a.tx * off * s;
      if (cx > openX - 12 || overOther(cx, cz, 'main', 3)) continue;
      const ang = Math.atan2(a.tx, a.tz);
      if (kind === 'riverbank') riverbank(main, dMid, s);
      else if (kind === 'jetty') jetty(main, dMid, s);
      else if (kind === 'waterplaza') waterPlaza(main, dMid, s);
      else if (kind === 'theater') riverTheater(main, a.w, dMid, s);
      else if (kind === 'cove') { kayakDock(cx, cz, ang); hullRack(cx + (-a.tz) * 4.2 * s, cz + a.tx * 4.2 * s, ang); }
      else if (kind === 'marina') marinaPlaza(main, dMid, s);
      else if (kind === 'veterans') veterans(main, dMid, s);
      else if (kind === 'terrace') { pavilion(cx, cz, ang); umbrellaPlaza(cx - a.tx * 16, cz - a.tz * 16, ang); }
      else if (kind === 'lawn') lawnRoom(main, dMid, s);
      const t = ROOM_TAGS[kind];
      if (t) RW.tags.push({ name: t[0], sub: t[1], x: cx, z: cz, r2: 70 * 70 });
      // the Chicago Architecture Center cruise dock sits at the SE Michigan Ave bridgehead
      if ((kind === 'terrace' || kind === 'cove') && boatCount < 5) {
        const bx = a.x + (-a.tz) * (a.w - 3) * s, bz = a.z + a.tx * (a.w - 3) * s;
        if (!overOther(bx, bz, 'main', 0)) { tourBoat(bx, bz, ang, boatCount % 2 === 1); boatCount++; }
      }
    }

    // ---- the north bank: only what is really there ----
    function northAt(x, guessZ, fn) {
      const q = U().pathNearest(main, x, guessZ);
      if (q.d > 8 && q.d < main.len - 8) fn(q.d);
    }
    // Marina City's own slips are built with the towers, in landmarks.js — do not lay a second
    // set of fingers over them here, the docks interpenetrate and the piles double up.
    // Trump's river terrace
    northAt(331, -70, (d) => {
      const a = U().pathAt(main, d, {});
      const ang = Math.atan2(a.tx, a.tz);
      const x = a.x + a.tz * (a.w + 4.4), z = a.z - a.tx * (a.w + 4.4);
      boxAt(flat, 8.0, 0.6, 34, x, PY + 0.3, z, ang, 0xb9b2a4, 0.04);
      boxAt(flat, 0.35, 1.05, 34, x - a.tz * 4.1, PY + 1.1, z + a.tx * 4.1, ang, 0x9fb6c4);
      for (let j = -2; j <= 2; j++) umbrellaTable(x - a.tx * j * 6, z - a.tz * j * 6, UMB[(j + 2) % UMB.length]);
    });
    // the Wendella dock under the Wrigley Building
    northAt(439, -110, (d) => {
      const a = U().pathAt(main, d, {});
      const ang = Math.atan2(a.tx, a.tz);
      const x = a.x + a.tz * (a.w - 2.4), z = a.z - a.tx * (a.w - 2.4);
      boxAt(flat, 5.0, 0.30, 24, x, PY - 0.45, z, ang, 0x8a8478, 0.05);
      for (let j = -2; j <= 2; j++) cylAt(flat, 0.15, 1.6, x - a.tx * j * 5.4, PY - 0.6, z - a.tz * j * 5.4, 0x3f444a, 5);
      tourBoat(x + a.tz * 3.6, z - a.tx * 3.6, ang, false);
      RW.tags.push({ name: 'WENDELLA DOCK', sub: 'SINCE 1935 · THE ARCHITECTURE CRUISE LEAVES HERE', x, z, r2: 60 * 60 });
    });

    const scene = RR.Engine.scene;
    const flatMat = RR.City.flatMaterial();
    const wallMat = new THREE.MeshLambertMaterial({
      vertexColors: true, side: THREE.DoubleSide, map: wallTexture(),
    });
    // chunk by vertex count, not geometry count: one merge per ~60 k verts keeps the index
    // buffer 16-bit-safe without spending a draw call every 800 quads
    const add = (arr, mat, cast, skipReflect) => {
      let batch = [], verts = 0;
      const flush = () => {
        if (!batch.length) return;
        const m = new THREE.Mesh(RR.City.mergeGeoms(batch), mat);
        m.receiveShadow = true; if (cast) m.castShadow = true;
        if (skipReflect) m.layers.set(1);
        scene.add(m); batch = []; verts = 0;
      };
      for (const g of arr) {
        const n = g.attributes.position.count;
        if (verts + n > 60000) flush();
        batch.push(g); verts += n;
      }
      flush();
    };
    add(deck, flatMat, false);
    add(wall, wallMat, false);
    add(flat, flatMat, true);
    add(bright, flatMat, true, true);   // umbrellas/gardens skip the reflection pass
  };

  RR.Riverwalk = RW;
})();

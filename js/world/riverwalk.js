/* River Racer — the Chicago Riverwalk: a multi-level promenade (quay wall, lower
   walkway, retaining wall, railings) on every downtown bank, plus the Main Stem's
   themed "rooms" — café pavilions, umbrella plazas, the stepped River Theater,
   floating gardens, kayak docks — and docked architecture-tour boats.
   Every piece is per-segment keep-out checked so nothing sits over the water. */
(function () {
  const RW = {};
  const U = () => RR.U;
  let rng;
  const GY = () => RR.City.GROUND_Y;   // upper street level (~6m)
  const PY = 1.5;                       // lower promenade — the walkway a few feet above the water
  const PROM = 9;                       // promenade reaches w .. w+9

  let deck = [], flat = [], wall = [], bright = [];   // geometry buckets
  function tint(g, hex, jit) { RR.City.tintGeom(g, hex, jit || 0, rng); return g; }

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

        // lower promenade deck (alternating wood / concrete bands)
        const woodBand = (i % 6) < 3;
        const dcol = woodBand ? 0x9c7245 : 0xb7b1a2;
        if (s > 0) quad(deck, eAx, PY, eAz, oAx, PY, oAz, oBx, PY, oBz, eBx, PY, eBz, dcol, 0.08);
        else quad(deck, eAx, PY, eAz, eBx, PY, eBz, oBx, PY, oBz, oAx, PY, oAz, dcol, 0.08);

        // quay wall (water → promenade) at the edge, facing the channel
        quad(wall, eAx, -0.7, eAz, eBx, -0.7, eBz, eBx, PY, eBz, eAx, PY, eAz, 0x8f8c82, 0.06);
        // retaining wall (promenade → street) at the outer edge
        quad(wall, oAx, PY, oAz, oBx, PY, oBz, oBx, GY(), oBz, oAx, GY(), oAz, 0x8a8f92, 0.06);
        // water-edge railing: a thin top rail floating just inside the edge
        const rEAx = A.x + A.nx * (A.w + 0.5) * s, rEAz = A.z + A.nz * (A.w + 0.5) * s;
        const rEBx = B.x + B.nx * (B.w + 0.5) * s, rEBz = B.z + B.nz * (B.w + 0.5) * s;
        quad(wall, rEAx, PY + 1.05, rEAz, rEBx, PY + 1.05, rEBz, rEBx, PY + 0.95, rEBz, rEAx, PY + 0.95, rEAz, 0x565b60, 0);
        // sparse railing posts
        if (i % 3 === 0) {
          const post = new THREE.CylinderGeometry(0.06, 0.06, 1.05, 4);
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
    umbrellaTable(cx + c * 0, cz + s * 0, 0xe8e4da);
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
  function floatingGarden(cx, cz, ang, s, w) {
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
    boxAt(flat, 3, 0.25, 8, cx, PY - 0.15, cz, ang, 0x7a6242);      // low dock
    for (let n = -1; n <= 1; n++) {
      const kx = cx - s * n * 2.2, kz = cz + c * n * 2.2;
      const kayak = new THREE.CylinderGeometry(0.35, 0.2, 4.2, 6);
      kayak.rotateZ(Math.PI / 2); kayak.rotateY(ang);
      kayak.translate(kx + c * 3, 0.35, kz + s * 3);
      tint(kayak, UMB[(n + 1) % UMB.length], 0); bright.push(kayak);
    }
  }
  // the River Theater: wide steps from the street down to the promenade
  function riverTheater(p, dMid, s) {
    const steps = 6;
    for (let st = 0; st < steps; st++) {
      const off = p.wAt + 8.5 - st * 1.2;
      const y = GY() - (GY() - PY) * (st / (steps - 1));
      const segs = 5;
      for (let j = -segs; j <= segs; j++) {
        const a = U().pathAt(p.path, dMid + j * 2.2, {});
        const x = a.x + (-a.tz) * (a.w + off) * s, z = a.z + a.tx * (a.w + off) * s;
        boxAt(flat, 2.4, 0.35, 2.6, x, y, z, Math.atan2(a.tx, a.tz), st % 2 ? 0xbdb7a8 : 0xa9a394);
      }
    }
  }

  // ---------- docked architecture-tour boat ----------
  function tourBoat(cx, cz, ang, taxi) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const L = taxi ? 12 : 26, W = taxi ? 4.2 : 6;
    const hull = new THREE.BoxGeometry(W, 1.8, L);
    const hp = hull.attributes.position;
    for (let i = 0; i < hp.count; i++) { if (Math.abs(hp.getZ(i)) > L * 0.4) hp.setX(i, hp.getX(i) * 0.4); }
    hull.computeVertexNormals();
    hull.rotateY(ang); hull.translate(cx, 0.5, cz);
    tint(hull, taxi ? 0xf0c020 : 0x22508a, 0.04); flat.push(hull);
    // open upper deck + canopy
    boxAt(flat, W - 0.6, 0.2, L - 3, cx, 1.5, cz, ang, 0xe8e6de);
    if (!taxi) {
      boxAt(bright, W - 0.4, 0.16, L - 6, cx, 3.4, cz, ang, 0xcf3b2f);   // striped canopy
      for (const zz of [-1, 1]) for (const xx of [-1, 1]) {
        cylAt(flat, 0.08, 2.0, cx + c * xx * (W / 2 - 0.5) - s * zz * (L / 2 - 3), 2.4, cz + s * xx * (W / 2 - 0.5) + c * zz * (L / 2 - 3), 0x8a8f94, 5);
      }
      // rows of bench seats
      for (let r = -3; r <= 3; r++) boxAt(flat, W - 1.2, 0.4, 0.5, cx - s * r * 2.4, 1.85, cz + c * r * 2.4, ang, 0x3a4048);
    }
    RR.River.addObstacle(cx, cz, taxi ? 3 : 4.5);
  }

  RW.init = function () {
    rng = U().mulberry(6161);
    deck = []; flat = []; wall = []; bright = [];
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
    let roomIdx = 0, boatCount = 0;
    for (let k = 0; k < bounds.length - 1; k++) {
      if (bounds[k + 1] - bounds[k] < 46) continue;
      const dMid = (bounds[k] + bounds[k + 1]) / 2;
      const a = U().pathAt(main, dMid, {});
      for (const s of [-1, 1]) {
        const off = a.w + 4.6;
        const cx = a.x + (-a.tz) * off * s, cz = a.z + a.tx * off * s;
        if (cx > openX - 12 || overOther(cx, cz, 'main', 3)) continue;
        const ang = Math.atan2(a.tx, a.tz);
        const type = (roomIdx++) % 6;
        if (type === 0) pavilion(cx, cz, ang);
        else if (type === 1) umbrellaPlaza(cx, cz, ang);
        else if (type === 2) riverTheater({ path: main, wAt: a.w }, dMid, s);
        else if (type === 3) { const gx = a.x + (-a.tz) * (a.w + 1.6) * s, gz = a.z + a.tx * (a.w + 1.6) * s; floatingGarden(gx, gz, ang, s, a.w); }
        else if (type === 4) kayakDock(cx, cz, ang);
        else umbrellaPlaza(cx, cz, ang);
        // dock a tour boat at some rooms, tight against the wall
        if ((type === 0 || type === 4) && boatCount < 5) {
          const bx = a.x + (-a.tz) * (a.w - 3) * s, bz = a.z + a.tx * (a.w - 3) * s;
          if (!overOther(bx, bz, 'main', 0)) { tourBoat(bx, bz, ang, boatCount % 2 === 1); boatCount++; }
        }
      }
    }

    const scene = RR.Engine.scene;
    const flatMat = RR.City.flatMaterial();
    const wallMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const add = (arr, mat, cast) => {
      for (let i = 0; i < arr.length; i += 800) {
        const m = new THREE.Mesh(RR.City.mergeGeoms(arr.slice(i, i + 800)), mat);
        m.receiveShadow = true; if (cast) m.castShadow = true;
        scene.add(m);
      }
    };
    add(deck, flatMat, false);
    add(wall, wallMat, false);
    add(flat, flatMat, true);
    add(bright, flatMat, true);
  };

  RR.Riverwalk = RW;
})();

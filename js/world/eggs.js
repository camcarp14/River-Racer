/* River Racer — Chicago easter eggs: waving city flags (three fly from bascule
   tender-house roofs over the racing line), the famous Rat Hole sidewalk imprint,
   Buckingham Fountain's animated water jets, CTA "L" trains crossing the Wells St
   and Lake St double-deck bridges, and a fireboat saluting racers near the river
   mouth with arcing water plumes. Static bits merge into one draw call; the live
   meshes all sit on layer 1 (skipped by the planar-reflection pass). */
(function () {
  const E = { tags: [] };
  const U = () => RR.U;
  let rng;
  let flagMesh = null, flagMeta = [], flagBase = null, flagU = null;
  let mainJet = null;
  const trains = [];             // CTA "L" trains crossing the double-deck bridges
  let fb = null;                 // fireboat salute state
  let ducks = null;              // rubber-duck-derby flotilla (bobs as one raft)
  let blimp = null;              // banner blimp lapping the Loop
  const beacons = [];            // red aviation strobes on the tallest spires
  let busDump = null;            // the Steve Biller Band tour bus on Kinzie St (2004 homage)
  let cannon = null;             // #2 Nicholas J. Melas Centennial Fountain water cannon
  let jump = null;               // #1 the Marina City car jump (The Hunter, 1980)
  let wacker = null;             // #4 Lower Wacker Drive portals + the car that flashes past
  let bfState = null;            // #7 Buckingham Fountain's hourly show
  let whirl = null;              // #11 the Great Chicago Flood whirlpool at Kinzie
  let playpen = null;            // #20 the raft north of Navy Pier
  let airshow = null;            // #44 Air & Water Show flyover
  let wiener = null;             // #28 the Wienermobile on Clark St
  let falcon = null;             // #18 the peregrine that nests on the Wells St bridge
  let houseBled = false;         // #37 the Warehouse groove only bleeds in once a lap

  // hoisted scratch — nothing in the per-frame path allocates
  const _m2 = new THREE.Matrix4(), _q2 = new THREE.Quaternion();
  const _p2 = new THREE.Vector3(), _s2 = new THREE.Vector3(1, 1, 1);
  const _up2 = new THREE.Vector3(0, 1, 0);
  const FORM = [[0, 0], [-7, -9], [7, -9], [-14, -18], [14, -18], [0, -19]];   // diamond
  const JET_COLS = [[0.89, 0.22, 0.18], [0.95, 0.76, 0.19], [0.18, 0.56, 0.83], [0.43, 0.81, 0.43]];

  function tint(geo, hex, jit) { RR.City.tintGeom(geo, hex, jit || 0, rng); return geo; }

  // Two flags share one texture so they share one mesh: cell 0 is the real Chicago flag
  // (white field, two light-blue stripes for the river's branches, four red six-pointed stars),
  // cell 1 is the Cubs W — "fly the W" — for the Marina City roof (egg #19a).
  function flagTexture() {
    return U().canvasTexture(384, 128, (ctx, w, h) => {
      const CW = w / 2;
      ctx.fillStyle = '#f6f7f5'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#b3ddf2';
      ctx.fillRect(0, h / 6, CW, h / 6);           // top stripe (2nd sixth)
      ctx.fillRect(0, h * 4 / 6, CW, h / 6);       // bottom stripe (5th sixth)
      ctx.fillStyle = '#e4002b';
      const R = h * 0.115, r = R * 0.42;           // sharp six-pointed municipal stars
      for (let s = 0; s < 4; s++) {
        const cx = CW * (0.5 + (s - 1.5) * 0.19), cy = h / 2;
        ctx.beginPath();
        for (let i = 0; i < 12; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 6, rad = i % 2 ? r : R;
          ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
        }
        ctx.fill();
      }
      ctx.fillStyle = '#f6f7f5'; ctx.fillRect(CW, 0, CW, h);
      ctx.fillStyle = '#0e3386';                   // Cubs blue
      ctx.font = 'bold 108px Georgia, serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('W', CW * 1.5, h / 2 + 6);
    });
  }

  // squeeze a plane's u into one of the two atlas cells
  function flagCell(g, cell) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5 + cell * 0.5);
    uv.needsUpdate = true;
  }

  // nearest path sample to a target world x — the eggs are specified by street address,
  // and the medial-axis channel wanders, so x alone is the reliable key
  function atX(path, tx) {
    let bi = 0, best = Infinity;
    for (let i = 0; i < path.n; i++) { const d = Math.abs(path.x[i] - tx); if (d < best) { best = d; bi = i; } }
    return U().pathAt(path, path.cum[bi], {});
  }

  // distance from (px,pz) to segment a→b
  function segDist(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const L = dx * dx + dz * dz;
    let t = L > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / L : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
  }

  E.init = function () {
    rng = U().mulberry(60606);
    const scene = RR.Engine.scene;
    const C = window.CHICAGO;
    const GY = RR.City.GROUND_Y;
    const flat = [];                               // static merged geometry
    const bf = C.landmarks.find((l) => l.name.indexOf('Buckingham') >= 0);

    // ---------- Chicago flags: pole spots (landClearance-checked unless on the pier deck) ----------
    const np = C.lake.navyPier;
    const spots = [
      { x: np.root.x + 4, z: np.root.z + 40, y: 3.2, deck: true },   // Navy Pier root plaza
      { x: np.tip.x + 8, z: np.tip.z, y: 3.2, deck: true },          // Navy Pier tip
      { x: 1750, z: 40, y: GY },                                     // river mouth harbor front
    ];
    if (bf) for (const [dx, dz] of [[-28, -28], [28, -28], [-28, 28], [28, 28]]) {
      spots.push({ x: bf.x + dx, z: bf.z + dz, y: GY });             // fountain plaza corners
    }
    const main = RR.River.paths.main;
    // three flags fly from bascule tender-house roofs where racers pass right under them
    // (houses sit at along ±8.5, across ±(w+3.6) from the snapped bridge center)
    for (const nm of ['LaSalle St', 'DuSable / Michigan Ave', 'State St']) {
      const b = C.bridges.find((bb) => bb.name === nm);
      if (!b || !RR.River.paths[b.branch]) continue;
      const q = U().pathNearest(RR.River.paths[b.branch], b.x, b.z);
      const acr = q.w + 3.6;
      spots.push({
        x: q.x + q.tx * 8.5 - q.tz * acr,
        z: q.z + q.tz * 8.5 + q.tx * acr,
        y: b.clearance + 10, deck: true,                             // pole base on the roof top
      });
    }
    // #19a — fly the W off the Marina City east tower. The towers stand at x ± 30 of the
    // landmark centre, so the pole goes on the east crown, not the empty air between them.
    {
      const mc = C.landmarks.find((l) => l.name === 'Marina City');
      if (mc) spots.push({ x: mc.x + 30, z: mc.z, y: GY + mc.h * 0.94, deck: true, cell: 1 });
    }

    // one shared plane, cloned into a single merged mesh; vertices wave in the update hook
    const proto = new THREE.PlaneGeometry(4.2, 2.8, 6, 1);
    proto.translate(2.1, 0, 0);                                      // hoist edge at the pole
    const nV = proto.attributes.position.count;
    flagU = new Float32Array(nV);                                    // 0 at hoist → 1 at fly end
    for (let i = 0; i < nV; i++) flagU[i] = proto.attributes.position.getX(i) / 4.2;
    const flagGeoms = [];
    for (const s of spots) {
      if (!s.deck && RR.City.landClearance(s.x, s.z) <= 2) continue; // every ground pole stays on dry land
      const pole = new THREE.CylinderGeometry(0.09, 0.14, 8.5, 6);
      pole.translate(s.x, s.y + 4.25, s.z);
      flat.push(tint(pole, 0x9aa0a6, 0.05));
      const ball = new THREE.SphereGeometry(0.2, 6, 5);
      ball.translate(s.x, s.y + 8.6, s.z);
      flat.push(tint(ball, 0xc9a227, 0));
      const a = 0.4 + (rng() - 0.5) * 0.7;                           // wind out of the WSW, jittered
      const g = proto.clone();
      flagCell(g, s.cell || 0);
      g.rotateY(a);
      g.translate(s.x, s.y + 6.8, s.z);
      flagGeoms.push(g);
      flagMeta.push({ i0: flagGeoms.length - 1, px: Math.sin(a), pz: Math.cos(a), ph: rng() * 9 });
    }
    if (flagGeoms.length) {
      const merged = RR.City.mergeGeoms(flagGeoms);
      flagBase = merged.attributes.position.array.slice();           // rest pose, waved every frame
      for (const m of flagMeta) m.i0 *= nV;
      flagMesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({
        map: flagTexture(), side: THREE.DoubleSide, vertexColors: true,
      }));
      flagMesh.layers.set(1);
      scene.add(flagMesh);
    }

    // ---------- THE RAT HOLE: rat-shaped imprint in a sidewalk slab on the Main Stem's north bank ----------
    {
      const q = U().pathAt(main, main.len * 0.55, {});
      const nx = q.tz, nz = -q.tx;                                   // left of downstream = north bank
      let rx = 0, rz = 0, ok = false;
      for (let off = q.w + 9; off < q.w + 42; off += 3) {
        rx = q.x + nx * off; rz = q.z + nz * off;
        if (RR.City.landClearance(rx, rz) > 2) { ok = true; break; }
      }
      if (ok) {
        const ang = Math.atan2(q.tx, q.tz), ratY = GY + 0.15, DK = 0x37342f;
        const parts = [];
        const slab = new THREE.BoxGeometry(2, 0.15, 2.6);
        slab.translate(0, GY + 0.075, 0);
        parts.push(tint(slab, 0xcfccc2, 0.04));
        const body = new THREE.SphereGeometry(1, 8, 6);              // splayed rat, sunk into the concrete
        body.scale(0.42, 0.1, 0.85); body.translate(0, ratY - 0.03, 0.15);
        parts.push(tint(body, DK, 0));
        for (const s of [-1, 1]) {
          const ear = new THREE.SphereGeometry(1, 5, 4);
          ear.scale(0.16, 0.07, 0.16); ear.translate(s * 0.24, ratY - 0.02, 0.78);
          parts.push(tint(ear, DK, 0));
          for (const pzz of [0.5, -0.3]) {                           // splayed paws
            const paw = new THREE.BoxGeometry(0.45, 0.08, 0.14);
            paw.rotateY(s * 0.7); paw.translate(s * 0.45, ratY - 0.04, pzz);
            parts.push(tint(paw, DK, 0));
          }
        }
        const tail = new THREE.BoxGeometry(0.09, 0.1, 0.8);
        tail.translate(0.06, ratY - 0.04, -0.85);
        parts.push(tint(tail, DK, 0));
        // #34 — the offerings ARE the joke: coins, a votive candle and a bouquet appeared
        // within days of the imprint going viral in January 2024, and two couples got married here.
        for (let k = 0; k < 8; k++) {
          const a2 = rng() * 6.28, rr = 0.55 + rng() * 0.55;
          const coin = new THREE.CylinderGeometry(0.08, 0.08, 0.012, 7);
          coin.translate(Math.sin(a2) * rr, GY + 0.16, Math.cos(a2) * rr);
          parts.push(tint(coin, 0xc8a24a, 0.12));
        }
        const cnd = new THREE.CylinderGeometry(0.06, 0.06, 0.22, 7);
        cnd.translate(-0.62, GY + 0.26, 0.55); parts.push(tint(cnd, 0xe8e4da, 0));
        const fl = new THREE.CylinderGeometry(0.02, 0.02, 0.3, 4);
        fl.rotateZ(0.5); fl.translate(0.66, GY + 0.30, 0.5); parts.push(tint(fl, 0x4a6b34, 0));
        for (const [bx4, bz4, bc] of [[0.74, 0.62, 0xd0455c], [0.62, 0.44, 0xf2c230], [0.80, 0.46, 0xe8e4da]]) {
          const bud = new THREE.SphereGeometry(0.07, 5, 4);
          bud.translate(bx4, GY + 0.46, bz4); parts.push(tint(bud, bc, 0.1));
        }
        for (const g of parts) { g.rotateY(ang); g.translate(rx, 0, rz); flat.push(g); }
        E.tags.push({ name: 'THE RAT HOLE', sub: 'ROSCOE ST · 2024 · TWO WEDDINGS HELD HERE', x: rx, z: rz, r2: 60 * 60 });
      }
    }

    // ---------- #7 BUCKINGHAM FOUNTAIN: the show is the ritual ----------
    // On the hour for twenty minutes the centre jet climbs to 150 ft; the rest of the time it
    // is a quiet 12 m. The old always-on 20 m plume threw away the only thing anybody waits for.
    // The real great basin is 85 m across — the landmark builds 40, so widen it here.
    if (bf) {
      const outerWall = new THREE.CylinderGeometry(42.5, 43.2, 1.7, 30, 1, true);
      outerWall.translate(bf.x, GY + 0.85, bf.z);
      flat.push(tint(outerWall, 0xc99a8a, 0.03));
      const apron = new THREE.RingGeometry(20.8, 42.5, 30, 1);
      apron.rotateX(-Math.PI / 2); apron.translate(bf.x, GY + 1.55, bf.z);
      flat.push(tint(apron, 0x2f7d84, 0.04));

      const jetMat = new THREE.MeshBasicMaterial({
        color: 0xcfeaff, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const jetGeo = new THREE.CylinderGeometry(0.35, 0.95, 1, 8, 1, true);
      jetGeo.translate(0, 0.5, 0);                                   // base-anchored → scale.y = height
      mainJet = new THREE.Mesh(jetGeo, jetMat);
      mainJet.position.set(bf.x, GY + 7.9, bf.z);
      mainJet.layers.set(1);
      scene.add(mainJet);
      // four concentric jet rings, merged into ONE mesh — 32 jets for the price of one call
      const ringGeoms = [];
      for (const [rad, n, hh, ry] of [[10.5, 8, 5.5, 1.8], [18, 10, 3.4, 1.6], [28, 12, 2.4, 1.5], [38, 14, 1.6, 1.5]]) {
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + rad * 0.11;
          const g = new THREE.CylinderGeometry(0.22, 0.5, hh, 6, 1, true);
          g.translate(bf.x + Math.cos(a) * rad, GY + ry + hh / 2, bf.z + Math.sin(a) * rad);
          ringGeoms.push(g);
        }
      }
      const ringMesh = new THREE.Mesh(RR.City.mergeGeoms(ringGeoms), jetMat);
      ringMesh.layers.set(1);
      scene.add(ringMesh);
      bfState = { mat: jetMat, rings: ringMesh, t: 62 };
      E.tags.push({ name: 'BUCKINGHAM FOUNTAIN', sub: '1927 · 150 FT ON THE HOUR · 1.5 M GALLONS',
        x: bf.x, z: bf.z, r2: 180 * 180 });
    }

    // ---------- CTA "L" trains: a stainless 3-car consist slides across each double-deck span ----------
    for (const b of C.bridges) {
      if (b.kind !== 'l') continue;                                  // Wells St + Lake St
      const path = RR.River.paths[b.branch];
      if (!path) continue;
      const q = U().pathNearest(path, b.x, b.z);
      const ax = -q.tz, az = q.tx;                                   // across-channel axis
      const parts = [];
      for (let k = -1; k <= 1; k++) {                                // three cars, small gaps
        const co = k * 14.6;
        const body = new THREE.BoxGeometry(14, 3, 2.6);
        body.translate(co, 1.5, 0);
        parts.push(tint(body, 0xc9ced4, 0.03));                      // stainless silver
        for (const s of [-1, 1]) {                                   // dark window band each side
          const band = new THREE.BoxGeometry(12.6, 0.95, 0.12);
          band.translate(co, 1.95, s * 1.32);
          parts.push(tint(band, 0x1c232b, 0));
        }
        const hump = new THREE.BoxGeometry(13.2, 0.35, 1.7);         // subtle roof hump
        hump.translate(co, 3.12, 0);
        parts.push(tint(hump, 0xaab0b6, 0));
      }
      const g = RR.City.mergeGeoms(parts);
      g.rotateY(Math.atan2(-az, ax));                                // length axis onto the crossing axis
      const trainMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true });
      const m = new THREE.Mesh(g, trainMat);
      m.layers.set(1);
      m.position.set(q.x, -1000, q.z);                               // parked hidden until it runs
      scene.add(m);

      // the elevated structure continues past both banks — girder deck, rails and steel
      // bents over the street — so the train always rides visible track, never open air
      const deckY = b.clearance + 7.6, rotY = Math.atan2(ax, az);
      const reach = [];
      for (const s of [-1, 1]) {
        let L = q.w + 24;
        while (L < q.w + 96 && RR.City.landClearance(q.x + ax * (L + 15) * s, q.z + az * (L + 15) * s) > 3) L += 15;
        reach.push(L);
        const extLen = L - q.w - 1;
        const c0 = (q.w + 1 + extLen / 2) * s;
        const deckG = new THREE.BoxGeometry(7, 1.3, extLen);
        deckG.rotateY(rotY); deckG.translate(q.x + ax * c0, deckY, q.z + az * c0);
        flat.push(tint(deckG, 0x3a3f45, 0.05));
        for (const r of [-1.05, 1.05]) {                             // running rails
          const rail = new THREE.BoxGeometry(0.18, 0.14, extLen);
          rail.rotateY(rotY);
          rail.translate(q.x + ax * c0 - az * r, deckY + 0.72, q.z + az * c0 + ax * r);
          flat.push(tint(rail, 0x8a9096, 0));
        }
        for (let d = q.w + 10; d < L; d += 15) {                     // support bents down to the street
          const px = q.x + ax * d * s, pz = q.z + az * d * s;
          if (RR.City.landClearance(px, pz) < 2) continue;
          const h = deckY - 0.6 - 6;
          for (const r of [-2.6, 2.6]) {
            const col = new THREE.CylinderGeometry(0.26, 0.34, h, 5);
            col.translate(px - az * r, 6 + h / 2, pz + ax * r);
            flat.push(tint(col, 0x2f343a, 0.05));
          }
          const cap = new THREE.BoxGeometry(6.6, 0.55, 1.0);
          cap.rotateY(rotY); cap.translate(px, deckY - 0.85, pz);
          flat.push(tint(cap, 0x2f343a, 0));
        }
      }
      trains.push({ mesh: m, mat: trainMat, cx: q.x, cz: q.z, ax, az, y: b.clearance + 8.6,
        min: -reach[0], max: reach[1], run: false, dir: 1, s: 0, wait: 4 + rng() * 14, cool: 0 });
    }

    // ---------- FIREBOAT SALUTE: moored near the river mouth, arcing water plumes over the channel ----------
    {
      const q = U().pathAt(main, main.len - 320, {});
      const off = q.w * 0.72;                                        // hugs the bank, out of the racing line
      const bx = q.x - q.tz * off, bz = q.z + q.tx * off;
      const grp = new THREE.Group();
      const bm = (c) => new THREE.MeshLambertMaterial({ color: c });
      const L = 12, W = 4;
      const hull = new THREE.Mesh(new THREE.BoxGeometry(W, 1.7, L), bm(0xc22b1f));
      const hp = hull.geometry.attributes.position;                  // pinch bow/stern like life.js
      for (let i = 0; i < hp.count; i++) { if (Math.abs(hp.getZ(i)) > L * 0.42) hp.setX(i, hp.getX(i) * 0.4); }
      hull.geometry.computeVertexNormals(); hull.position.y = 0.55; grp.add(hull);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(W - 1.1, 1.5, 4.6), bm(0xf1efe7));
      cabin.position.set(0, 2.1, -0.8); grp.add(cabin);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 3.2, 5), bm(0x5b6066));
      mast.position.set(0, 4.2, -1.6); grp.add(mast);
      for (const s of [-1, 1]) {                                     // deck monitors the plumes fire from
        const mon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.1, 5), bm(0x8a2018));
        mon.position.set(s * 1.1, 1.9, 2.2); grp.add(mon);
      }
      grp.rotation.y = Math.atan2(q.tx, q.tz);                       // bow points downstream
      grp.position.set(bx, 0, bz);
      grp.traverse((o) => o.layers.set(1));
      scene.add(grp);
      const cy = Math.cos(grp.rotation.y), sy = Math.sin(grp.rotation.y);
      fb = { g: grp, x: bx, z: bz, ph: rng() * 9, n: [] };
      for (const s of [-1, 1]) fb.n.push({                           // nozzle offsets + launch velocities
        ox: s * 1.1 * cy + 2.2 * sy, oy: 2.5, oz: -s * 1.1 * sy + 2.2 * cy,
        vx: q.tz * 5 + q.tx * s * 4.5,                               // out over the river, fanned fore/aft
        vz: -q.tx * 5 + q.tz * s * 4.5,
      });
      E.tags.push({ name: 'FIREBOAT SALUTE', sub: 'CFD · THE ARCH IS A GREETING, NOT A WARNING',
        x: bx, z: bz, r2: 90 * 90 });
    }

    // ---------- RUBBER DUCK DERBY: a flotilla of yellow ducks bobbing by the riverwalk ----------
    // The real Chicago Ducky Derby drops 60,000+ ducks from the DuSable Bridge every August
    // for Special Olympics Illinois — so the raft belongs just downstream of it, at (470, -110).
    {
      const q = U().pathNearest(main, 470, -110);
      const off = q.w * 0.7;
      const dx2 = q.x + q.tz * off, dz2 = q.z - q.tx * off;          // south-bank eddy, off the race line
      const duckGeoms = [];
      for (let i = 0; i < 36; i++) {
        const px = (rng() - 0.5) * 13, pz = (rng() - 0.5) * 8;
        const body = new THREE.SphereGeometry(0.42, 7, 5);
        body.scale(1, 0.68, 1.25); body.translate(px, 0.24, pz);
        duckGeoms.push(tint(body, 0xffd21e, 0.04));
        const head = new THREE.SphereGeometry(0.24, 6, 5);
        const hy = rng() * 6.28;
        head.translate(px + Math.sin(hy) * 0.28, 0.62, pz + Math.cos(hy) * 0.28);
        duckGeoms.push(tint(head, 0xffd21e, 0.04));
        const beak = new THREE.ConeGeometry(0.09, 0.2, 5);
        beak.rotateX(Math.PI / 2); beak.rotateY(hy);
        beak.translate(px + Math.sin(hy) * 0.5, 0.6, pz + Math.cos(hy) * 0.5);
        duckGeoms.push(tint(beak, 0xf07820, 0));
      }
      // #38 — one rubber chicken hiding in the flock. Anyone who spots it is from here.
      {
        const body = new THREE.SphereGeometry(0.4, 7, 5);
        body.scale(0.85, 0.7, 1.5); body.translate(1.9, 0.26, -1.4);
        duckGeoms.push(tint(body, 0xf2c230, 0));
        const neck = new THREE.CylinderGeometry(0.11, 0.14, 0.7, 6);
        neck.rotateX(0.5); neck.translate(1.9, 0.62, -0.85);
        duckGeoms.push(tint(neck, 0xf2c230, 0));
        const hd = new THREE.SphereGeometry(0.19, 6, 5);
        hd.translate(1.9, 0.94, -0.62); duckGeoms.push(tint(hd, 0xf2c230, 0));
        const comb = new THREE.BoxGeometry(0.05, 0.16, 0.22);
        comb.translate(1.9, 1.12, -0.62); duckGeoms.push(tint(comb, 0xd0455c, 0));
      }
      ducks = new THREE.Mesh(RR.City.mergeGeoms(duckGeoms), RR.City.flatMaterial());
      ducks.layers.set(1);
      ducks.position.set(dx2, 0, dz2);
      scene.add(ducks);
      ducks.userData.ph = rng() * 9;
      E.tags.push({ name: 'RUBBER DUCK DERBY', sub: 'CHICAGO DUCKY DERBY · 60,000 DUCKS · EVERY AUGUST',
        x: dx2, z: dz2, r2: 80 * 80 });
    }

    // ---------- BANNER BLIMP: slow laps over the Loop towing a RIVER RACER banner ----------
    {
      const grp = new THREE.Group();
      const env = new THREE.Mesh(new THREE.SphereGeometry(9, 12, 9),
        new THREE.MeshLambertMaterial({ color: 0xe8ebee }));
      env.scale.set(1, 1, 2.6); grp.add(env);
      const gond = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 5),
        new THREE.MeshLambertMaterial({ color: 0x2b3138 }));
      gond.position.y = -8.6; grp.add(gond);
      const finMat = new THREE.MeshLambertMaterial({ color: 0xc22b1f });
      for (const r of [0, Math.PI / 2]) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 7.5, 5.5), finMat);
        fin.rotation.z = r; fin.position.z = -20; grp.add(fin);
      }
      const banTex = U().canvasTexture(512, 84, (c, w, h) => {
        c.fillStyle = '#0b1e2d'; c.fillRect(0, 0, w, h);
        c.strokeStyle = '#ffc857'; c.lineWidth = 5; c.strokeRect(5, 5, w - 10, h - 10);
        c.fillStyle = '#ffc857'; c.font = 'bold italic 52px Arial, sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('★ RIVER RACER ★', w / 2, h / 2 + 2);
      });
      for (const s of [1, -1]) {                                     // readable from both sides
        const ban = new THREE.Mesh(new THREE.PlaneGeometry(34, 5.6),
          new THREE.MeshBasicMaterial({ map: banTex, side: THREE.FrontSide }));
        ban.rotation.y = s > 0 ? 0 : Math.PI;
        ban.position.set(0, -2, -46); grp.add(ban);
      }
      const tow = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 24, 3),
        new THREE.MeshBasicMaterial({ color: 0x9aa0a6 }));
      tow.rotation.x = Math.PI / 2; tow.position.set(0, -1, -34); grp.add(tow);
      grp.traverse((o) => o.layers.set(1));
      scene.add(grp);
      blimp = { g: grp, cx: 300, cz: 120, r: 760, a: rng() * 6.28 };
    }

    // ---------- AVIATION BEACONS: red strobes on the tallest spires ----------
    {
      const lm = window.CHICAGO.landmarks;
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a1e });
      const spots = [];
      const willis = lm.find((l) => l.name.indexOf('Willis') >= 0);
      if (willis) for (const s of [-6, 6]) spots.push([willis.x + s, 6 + willis.h + 84, willis.z]);
      const trump = lm.find((l) => l.name.indexOf('Trump') >= 0);
      if (trump) spots.push([trump.x + trump.w * 0.2, 6 + trump.h + 65, trump.z]);
      for (const [bx2, by2, bz2] of spots) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(1.5, 6, 5), beaconMat);
        s.position.set(bx2, by2, bz2);
        s.layers.set(1);
        scene.add(s);
        beacons.push(s);
      }
    }

    // ---------- RIVERWALK MURAL: a painted city-flag mural on the south quay wall ----------
    {
      // 24 m of dead-flat plane cuts the corner on a bending bank: at the original anchor the
      // downstream end stood 3.4 m out over the Main Stem. Slide along the reach until the
      // centre and BOTH ends are on dry ground.
      const MW = 24;
      let q = null;
      for (let k = 0; k <= 16 && !q; k++) {
        for (const sg of (k ? [-1, 1] : [1])) {
          const d = main.len * 0.31 + sg * k * 9;
          if (d < 24 || d > main.len - 24) continue;
          const c = U().pathAt(main, d, {});
          const o = c.w + 8.7;
          let ok = true;
          for (const e of [-MW / 2, 0, MW / 2]) {
            const w = RR.River.waterQuery(c.x + c.tz * o + c.tx * e, c.z - c.tx * o + c.tz * e);
            if (!w || w.clear > -1.5) { ok = false; break; }
          }
          if (ok) { q = c; break; }
        }
      }
      if (q) {
      const off = q.w + 8.7;
      const mx = q.x + q.tz * off, mz = q.z - q.tx * off;            // south bank retaining wall
      const muralTex = U().canvasTexture(512, 96, (c, w, h) => {
        c.fillStyle = '#f4f1e8'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#b3ddf2'; c.fillRect(0, 14, w, 16); c.fillRect(0, h - 30, w, 16);
        c.fillStyle = '#e03a2f';
        const star = (cx2, cy2, R) => {                              // six-pointed Chicago star
          c.beginPath();
          for (let k = 0; k < 12; k++) {
            const rr = k % 2 ? R * 0.45 : R, an = (k / 12) * Math.PI * 2 - Math.PI / 2;
            c[k ? 'lineTo' : 'moveTo'](cx2 + Math.cos(an) * rr, cy2 + Math.sin(an) * rr);
          }
          c.closePath(); c.fill();
        };
        for (let i = 0; i < 4; i++) star(w * (0.2 + i * 0.2), h / 2, 15);
        c.fillStyle = '#0b1e2d'; c.font = 'bold 26px Arial, sans-serif';
        c.textAlign = 'center'; c.fillText('SWEET HOME CHICAGO', w / 2, h - 6);
      });
      const mural = new THREE.Mesh(new THREE.PlaneGeometry(MW, 3.6),
        new THREE.MeshLambertMaterial({ map: muralTex }));
      mural.position.set(mx, 3.4, mz);
      // +π/2 turned the mural broadside to the bank: 24 m of plane running ACROSS the channel,
      // twelve of them out over open water. The wall's normal already faces the river.
      mural.rotation.y = Math.atan2(-q.tz, q.tx);
      mural.layers.set(1);
      scene.add(mural);
      E.tags.push({ name: 'SWEET HOME CHICAGO MURAL', sub: 'FOUR STARS · TWO STRIPES · THE FLAG IS A MAP OF THIS RIVER',
        x: mx, z: mz, r2: 70 * 70 });
      }
    }

    // ---------- #2 NICHOLAS J. MELAS CENTENNIAL FOUNTAIN — the best three seconds in the game --
    // Real, and half of Chicago doesn't know it exists: a cannon on the north bank that fires an
    // arc of water clean across the river for ten minutes at the top of every hour, May–Sept.
    {
      const q = U().pathNearest(main, 1011, -145);
      const nx = q.tz, nz = -q.tx;                                   // north of downstream
      const ax = q.x + nx * (q.w + 1.0), az = q.z + nz * (q.w + 1.0);   // nozzle, at the quay line
      const bx = q.x - nx * (q.w - 5), bz = q.z - nz * (q.w - 5);       // landing, short of the far wall
      const ry = Math.atan2(-nz, nx);                                // local +x → inland (north)
      const P = [];
      if (RR.City.landClearance(ax + nx * 16, az + nz * 16) > 2) {
        const disc = new THREE.CylinderGeometry(26, 26, 0.7, 26, 1, false, 0, Math.PI);
        disc.translate(0, GY - 0.35, 0);
        P.push(tint(disc, 0xb5a98e, 0.03));
        for (let i = 0; i < 5; i++) {                                // the cascade behind the gun
          const st = new THREE.BoxGeometry(3.6, 1.15, 30 - i * 3.4);
          st.translate(7.5 + i * 3.6, GY + 0.55 + i * 1.0, 0);
          P.push(tint(st, 0xb5a98e, 0.05));
        }
      }
      const hz = new THREE.BoxGeometry(4.6, 2.8, 6.4);
      hz.translate(3.4, GY + 1.4, 0);
      P.push(tint(hz, 0x9c9484, 0.03));
      const noz = new THREE.CylinderGeometry(0.55, 0.72, 3.6, 10);
      noz.rotateZ(Math.PI / 2); noz.translate(0.6, 8.0, 0);
      P.push(tint(noz, 0x6e5230, 0));
      for (const g of P) { g.rotateY(ry); g.translate(ax, 0, az); flat.push(g); }

      const cpts = [];
      for (let i = 0; i <= 24; i++) {
        const u = i / 24;
        cpts.push(new THREE.Vector3(U().lerp(ax, bx, u),
          8 * (1 - u) + 0.6 * u + 70.8 * u * (1 - u), U().lerp(az, bz, u)));
      }
      const arcMat = new THREE.MeshBasicMaterial({
        color: 0xd6ecff, transparent: true, opacity: 0.42,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const arc = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cpts), 34, 0.95, 6, false), arcMat);
      arc.layers.set(1); arc.visible = false; arc.frustumCulled = false;
      scene.add(arc);
      cannon = { arc, mat: arcMat, ax, az, bx, bz, t: 62, on: 0 };
      E.tags.push({ name: 'CENTENNIAL FOUNTAIN', sub: '1989 · FIRES ACROSS THE RIVER ON THE HOUR',
        x: ax, z: az, r2: 170 * 170 });
    }

    // ---------- #1 THE MARINA CITY CAR JUMP — *The Hunter*, 1980 ----------
    // Steve McQueen's last film. A Pontiac LeMans really was launched off that parking helix
    // into this river, and for a boat game there is no better easter egg in the city.
    {
      const mc = C.landmarks.find((l) => l.name === 'Marina City');
      const lx = 152, lz = -10, ly = GY + (mc ? mc.h : 179) * 0.31;
      const wx = 158, wz = 6;
      const a = Math.atan2(wx - lx, wz - lz);
      const slab = new THREE.BoxGeometry(5.6, 0.5, 7.5);
      slab.rotateX(-0.10); slab.rotateY(a); slab.translate(lx, ly + 0.05, lz);
      flat.push(tint(slab, 0xcfc9bc, 0.03));
      for (const s of [-1, 1]) {
        const kerb = new THREE.BoxGeometry(0.4, 0.55, 7.5);
        kerb.rotateY(a);
        kerb.translate(lx + Math.cos(a) * s * 2.8, ly + 0.4, lz - Math.sin(a) * s * 2.8);
        flat.push(tint(kerb, 0xb8b2a4, 0));
      }
      const car = [];
      const cb = new THREE.BoxGeometry(1.95, 0.8, 5.1); cb.translate(0, 0.74, 0);
      car.push(tint(cb, 0xd9c79b, 0));                               // beige '70s sedan
      const cr = new THREE.BoxGeometry(1.72, 0.62, 2.5); cr.translate(0, 1.45, -0.25);
      car.push(tint(cr, 0xd9c79b, 0));
      const cg = new THREE.BoxGeometry(1.78, 0.42, 2.42); cg.translate(0, 1.5, -0.25);
      car.push(tint(cg, 0x2b3a44, 0));
      for (const s of [-1, 1]) {
        const bp = new THREE.BoxGeometry(2.0, 0.24, 0.3); bp.translate(0, 0.58, s * 2.5);
        car.push(tint(bp, 0xb9bec4, 0));
      }
      for (const sx of [-1, 1]) for (const sz of [-1.65, 1.65]) {
        const wh = new THREE.CylinderGeometry(0.36, 0.36, 0.24, 8);
        wh.rotateZ(Math.PI / 2); wh.translate(sx * 0.95, 0.36, sz);
        car.push(tint(wh, 0x24262a, 0));
      }
      const cm = new THREE.Mesh(RR.City.mergeGeoms(car), RR.City.flatMaterial());
      cm.layers.set(1); cm.visible = false; scene.add(cm);
      // the first launch is on a fixed 20 s fuse so it is reproducible in a screenshot test;
      // after that it settles into the ~70 s cycle, or fires early for anyone who comes close
      jump = { m: cm, lx, lz, ly, wx, wz, T: 3.85, st: 0, tt: 0, wait: 20, cool: 0 };
      E.tags.push({ name: 'THE HUNTER · 1980', sub: 'McQUEEN’S LAST FILM · A LeMANS WENT OFF THAT RAMP',
        x: lx, z: lz, r2: 130 * 130 });
    }

    // ---------- #4 LOWER WACKER DRIVE — Gotham's tunnels, the Bluesmobile's playground ----------
    // Lower Wacker runs directly behind the south retaining wall; the sodium light and the
    // exhaust are right there, one level below the street you can see from the water.
    {
      const portals = [];
      const H0 = 1.6, H1 = 5.2, HW = 3.5;
      for (const targetX of [-140, 120, 380]) {
        const q = atX(main, targetX);
        const sx = -q.tz, sz = q.tx;                                 // south of downstream
        const wx = q.x + sx * (q.w + 9), wz = q.z + sz * (q.w + 9);  // retaining-wall face
        if (RR.City.landClearance(wx + sx * 7, wz + sz * 7) < 2) continue;
        // W3's precast retaining wall is a solid single-sided quad at exactly this offset, so a
        // recess punched behind it would simply be occluded. The portal is therefore built as a
        // mouth standing PROUD of the wall: dark back panel on the wall plane, a throat, and an
        // arched surround projecting 1.6 m over the promenade.
        const ry = Math.atan2(sx, sz);                               // local +z → into the bank
        const P = [];
        const bk = new THREE.BoxGeometry(HW * 2, H1 - H0, 0.24);
        bk.translate(0, (H0 + H1) / 2, -0.12);
        P.push(tint(bk, 0x0a0b0d, 0));
        const gl = new THREE.BoxGeometry(HW * 1.68, 2.3, 0.12);
        gl.translate(0, H0 + 1.45, -0.32);
        P.push(tint(gl, 0xff9a2e, 0));                               // sodium spill deep in the throat
        for (const s of [-1, 1]) {                                   // throat returns
          const rt = new THREE.BoxGeometry(0.3, H1 - H0, 1.5);
          rt.translate(s * (HW - 0.15), (H0 + H1) / 2, -0.95);
          P.push(tint(rt, 0x2b2d31, 0.05));
        }
        const sf = new THREE.BoxGeometry(HW * 2, 0.3, 1.5);
        sf.translate(0, H1 - 0.15, -0.95);
        P.push(tint(sf, 0x2b2d31, 0.05));
        for (const s of [-1, 1]) {                                   // stone surround
          const jb = new THREE.BoxGeometry(0.85, H1 - H0 + 1.0, 1.15);
          jb.translate(s * (HW + 0.42), (H0 + H1) / 2 + 0.2, -1.05);
          P.push(tint(jb, 0x8f8a7e, 0.04));
        }
        for (let k = 0; k < 9; k++) {                                // shallow segmental arch head
          const u = ((k + 0.5) / 9) * 2 - 1;
          const vb = new THREE.BoxGeometry(HW * 2 / 9 + 0.08, 0.62, 1.15);
          vb.translate(u * HW, H1 + 0.31 - u * u * 0.42, -1.05);
          P.push(tint(vb, 0x8f8a7e, 0.04));
        }
        const sl = new THREE.BoxGeometry(HW * 2 + 1.8, H0 - 1.05, 1.6);
        sl.translate(0, 1.05 + (H0 - 1.05) / 2, -0.9);
        P.push(tint(sl, 0x7e7a70, 0.03));                            // threshold down to the deck
        for (const g of P) { g.rotateY(ry); g.translate(wx, 0, wz); flat.push(g); }
        if (RR.Theme && RR.Theme.addLamp) RR.Theme.addLamp(wx - sx * 0.5, H0 + 2.0, wz - sz * 0.5, 0xff9a2e);
        portals.push({ x: wx - sx * 1.1, z: wz - sz * 1.1, tx: q.tx, tz: q.tz });
      }
      if (portals.length) {
        const P = [];                                                // the Bluesmobile
        const bd = new THREE.BoxGeometry(1.95, 0.82, 5.0); bd.translate(0, 0.75, 0);
        P.push(tint(bd, 0x17191c, 0));
        const rf = new THREE.BoxGeometry(1.72, 0.62, 2.4); rf.translate(0, 1.47, -0.2);
        P.push(tint(rf, 0xf1efe8, 0));
        for (const s of [-1, 1]) {
          const dr = new THREE.BoxGeometry(0.07, 0.62, 2.3); dr.translate(s * 0.99, 0.85, -0.1);
          P.push(tint(dr, 0xf1efe8, 0));
        }
        const lb = new THREE.BoxGeometry(1.0, 0.24, 0.36); lb.translate(0, 1.9, -0.2);
        P.push(tint(lb, 0xd0342a, 0));
        for (const sx of [-1, 1]) for (const sz of [-1.6, 1.6]) {
          const wh = new THREE.CylinderGeometry(0.35, 0.35, 0.22, 8);
          wh.rotateZ(Math.PI / 2); wh.translate(sx * 0.95, 0.35, sz);
          P.push(tint(wh, 0x24262a, 0));
        }
        const m2 = new THREE.Mesh(RR.City.mergeGeoms(P), RR.City.flatMaterial());
        m2.layers.set(1); m2.visible = false; scene.add(m2);
        wacker = { m: m2, portals, t: 9, run: -1, u: 0, dir: 1, y: H0 + 0.05 };
      }
    }

    // ---------- #9 EASTLAND MEMORIAL — played absolutely straight ----------
    // 24 July 1915: the SS Eastland rolled over at her dock at the Clark Street Bridge and
    // 844 people died. It is the deadliest disaster in Chicago history. No joke goes here.
    {
      const q = U().pathNearest(main, -92, 66);
      const sx = -q.tz, sz = q.tx;
      const ex = q.x + sx * (q.w + 2.4), ez = q.z + sz * (q.w + 2.4);
      const ry = Math.atan2(sx, sz);                                 // local +z → inland; face is -z
      const PYd = (RR.Riverwalk && RR.Riverwalk.PY != null) ? RR.Riverwalk.PY : 1.1;
      const P = [];
      const bk = new THREE.BoxGeometry(3.0, 1.9, 0.4); bk.translate(0, PYd + 0.95, 0.22);
      P.push(tint(bk, 0x5c5a55, 0.03));
      const pl2 = new THREE.BoxGeometry(2.4, 1.2, 0.1); pl2.translate(0, PYd + 1.05, -0.02);
      P.push(tint(pl2, 0x7a5a2e, 0));
      const hull2 = new THREE.BoxGeometry(1.7, 0.3, 0.05);           // the ship, on her side
      hull2.rotateZ(0.16); hull2.translate(0, PYd + 1.02, -0.09);
      P.push(tint(hull2, 0x5e451f, 0));
      for (const fx of [-0.3, 0.3]) {
        const fn = new THREE.BoxGeometry(0.12, 0.34, 0.05);
        fn.rotateZ(1.35); fn.translate(fx, PYd + 1.24, -0.09);
        P.push(tint(fn, 0x5e451f, 0));
      }
      for (const g of P) { g.rotateY(ry); g.translate(ex, 0, ez); flat.push(g); }
      E.tags.push({ name: 'EASTLAND MEMORIAL', sub: '24 JULY 1915 · 844 LIVES · AT THIS DOCK',
        x: ex, z: ez, r2: 75 * 75 });
    }

    // ---------- #12 DuSABLE'S HOMESTEAD, PIONEER COURT ----------
    // Jean Baptiste Point du Sable, a Haitian-born Black trader, founded Chicago on this spot
    // around 1780. The bridge and the Drive both carry his name.
    {
      const q = U().pathNearest(main, 500, -166);
      const nx = q.tz, nz = -q.tx;
      const bx = q.x + nx * (q.w + 13), bz = q.z + nz * (q.w + 13);
      if (RR.City.landClearance(bx, bz) > 2) {
        const ry = Math.atan2(-nx, -nz);
        const P = [];
        const pd = new THREE.BoxGeometry(16, 0.18, 9); pd.translate(0, GY + 0.09, 3);
        P.push(tint(pd, 0xb9b2a4, 0.03));
        for (const s of [-1, 1]) {                                   // raised 12 × 6 m cabin outline
          const lg = new THREE.BoxGeometry(12, 0.12, 0.3);
          lg.translate(0, GY + 0.24, 3 + s * 3);
          P.push(tint(lg, 0x6e5230, 0));
          const sg = new THREE.BoxGeometry(0.3, 0.12, 6);
          sg.translate(s * 6, GY + 0.24, 3);
          P.push(tint(sg, 0x6e5230, 0));
        }
        const pl3 = new THREE.BoxGeometry(2, 2.4, 2); pl3.translate(0, GY + 1.2, -1.6);
        P.push(tint(pl3, 0x5c5a55, 0.03));
        const bust = new THREE.SphereGeometry(0.62, 8, 6);
        bust.scale(1, 1.25, 0.92); bust.translate(0, GY + 3.1, -1.6);
        P.push(tint(bust, 0x7a5a2e, 0));
        const shd = new THREE.BoxGeometry(1.3, 0.5, 0.9); shd.translate(0, GY + 2.5, -1.6);
        P.push(tint(shd, 0x6e5230, 0));
        for (const g of P) { g.rotateY(ry); g.translate(bx, 0, bz); flat.push(g); }
        E.tags.push({ name: 'DuSABLE’S HOMESTEAD', sub: 'c.1780 · CHICAGO STARTED ON THIS BANK',
          x: bx, z: bz, r2: 90 * 90 });
      }
    }

    // ---------- #11 THE GREAT CHICAGO FLOOD, 13 APRIL 1992 ----------
    // A pile driver at the Kinzie Street Bridge punched through the roof of the abandoned
    // 60-mile freight-tunnel system and 250 million gallons drained into the Loop's basements.
    {
      const kb2 = C.bridges.find((b) => b.name === 'Kinzie St');
      const kp = kb2 && RR.River.paths[kb2.branch];
      if (kp) {
        const q = U().pathNearest(kp, -748, -140);
        const off = q.w * 0.62;
        const wx = q.x - q.tz * off, wz = q.z + q.tx * off;
        const tex = U().canvasTexture(128, 128, (c, w, h) => {
          c.clearRect(0, 0, w, h);
          c.strokeStyle = 'rgba(216,230,236,0.85)'; c.lineWidth = 4; c.lineCap = 'round';
          for (let k = 0; k < 5; k++) {
            c.beginPath();
            for (let i = 0; i <= 40; i++) {
              const a2 = (i / 40) * Math.PI * 1.9 + (k / 5) * Math.PI * 2;
              const r2 = (0.14 + (i / 40) * 0.34) * w;
              const px = w / 2 + Math.cos(a2) * r2, pz = h / 2 + Math.sin(a2) * r2;
              c[i ? 'lineTo' : 'moveTo'](px, pz);
            }
            c.stroke();
          }
        });
        const ring = new THREE.Mesh(new THREE.CircleGeometry(5, 26),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.5, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(wx, 0.22, wz);
        ring.layers.set(1);
        scene.add(ring);
        whirl = { m: ring, x: wx, z: wz };
        const sx = -q.tz, sz = q.tx;
        const px = q.x + sx * (q.w + 0.4), pz = q.z + sz * (q.w + 0.4);
        const pl4 = new THREE.BoxGeometry(1.6, 0.9, 0.12);
        pl4.rotateY(Math.atan2(-sx, -sz)); pl4.translate(px, 2.4, pz);
        flat.push(tint(pl4, 0x7a5a2e, 0));
        E.tags.push({ name: 'THE GREAT CHICAGO FLOOD', sub: 'APRIL 13, 1992 · 250 MILLION GALLONS',
          x: wx, z: wz, r2: 90 * 90 });
      }
    }

    // ---------- #18 THE RIGHT GULLS: ring-billed, not "seagulls" — there is no sea ----------
    {
      const PYd = (RR.Riverwalk && RR.Riverwalk.PY != null) ? RR.Riverwalk.PY : 1.1;
      const gull = (px, py, pz, yaw) => {
        const P = [];
        const bd = new THREE.SphereGeometry(0.13, 6, 5);
        bd.scale(1, 0.95, 1.75); bd.translate(0, 0.14, 0);
        P.push(tint(bd, 0xf4f2ec, 0.02));
        const mt = new THREE.BoxGeometry(0.2, 0.05, 0.34); mt.translate(0, 0.235, -0.02);
        P.push(tint(mt, 0x9aa5ac, 0.05));                            // grey mantle
        const tl = new THREE.BoxGeometry(0.15, 0.04, 0.2); tl.translate(0, 0.16, -0.3);
        P.push(tint(tl, 0xf4f2ec, 0));
        const hd = new THREE.SphereGeometry(0.075, 5, 4); hd.translate(0, 0.30, 0.2);
        P.push(tint(hd, 0xf4f2ec, 0));
        const bill = new THREE.CylinderGeometry(0.022, 0.03, 0.13, 5);
        bill.rotateX(Math.PI / 2); bill.translate(0, 0.30, 0.32);
        P.push(tint(bill, 0xe8b93a, 0));                             // yellow bill…
        const rg = new THREE.CylinderGeometry(0.03, 0.03, 0.022, 5);
        rg.rotateX(Math.PI / 2); rg.translate(0, 0.30, 0.345);
        P.push(tint(rg, 0x1a1a1a, 0));                               // …with the black ring
        for (const s of [-1, 1]) {
          const lg = new THREE.CylinderGeometry(0.012, 0.012, 0.09, 4);
          lg.translate(s * 0.05, 0.045, 0.02);
          P.push(tint(lg, 0xe8b93a, 0));
        }
        for (const g of P) { g.rotateY(yaw); g.translate(px, py, pz); flat.push(g); }
      };
      for (let k = 0; k < 22; k++) {
        const d = 120 + rng() * Math.max(1, main.len - 300);
        const s = rng() < 0.5 ? 1 : -1;
        const a = U().pathAt(main, d, {});
        const nx = -a.tz * s, nz = a.tx * s;
        const gx = a.x + nx * (a.w + 0.5), gz = a.z + nz * (a.w + 0.5);
        if (gx > C.lake.openWaterX - 20) continue;
        if (RR.City.landClearance(a.x + nx * (a.w + 7), a.z + nz * (a.w + 7)) < 1) continue;
        // riverwalk.js drops a promenade segment wherever the offset bank curls back into the
        // channel, so test the deck the same way — a gull perched on a railing that was never
        // built is just a bird standing on the river
        const dq = RR.River.waterQuery(a.x + nx * (a.w + 4.65), a.z + nz * (a.w + 4.65));
        if (!dq || dq.clear > -1) continue;
        gull(gx, PYd + 1.10, gz, rng() * 6.28);                      // perched on the cable rail
      }
      // one peregrine: they genuinely nest on these bridges, and stoop at 390 km/h
      const wb = C.bridges.find((b) => b.name === 'Wells St');
      if (wb && RR.River.paths[wb.branch]) {
        const q = U().pathNearest(RR.River.paths[wb.branch], wb.x, wb.z);
        const P = [];
        const bd = new THREE.SphereGeometry(0.28, 6, 5); bd.scale(1, 1, 2.2);
        P.push(tint(bd, 0x3a4a5e, 0));
        const bl = new THREE.SphereGeometry(0.24, 6, 4);
        bl.scale(1, 0.55, 2.0); bl.translate(0, -0.13, 0);
        P.push(tint(bl, 0xe8dcc0, 0));                               // barred cream underside
        for (const s of [-1, 1]) {
          const wg = new THREE.BoxGeometry(1.15, 0.05, 0.44);
          wg.rotateY(s * 0.34); wg.translate(s * 0.62, 0.06, -0.1);
          P.push(tint(wg, 0x3a4a5e, 0));
        }
        const tf = new THREE.BoxGeometry(0.18, 0.04, 0.5); tf.translate(0, 0, -0.72);
        P.push(tint(tf, 0x46566a, 0));
        const hd = new THREE.SphereGeometry(0.15, 5, 4); hd.translate(0, 0.1, 0.5);
        P.push(tint(hd, 0x2e3c4c, 0));
        const fm = new THREE.Mesh(RR.City.mergeGeoms(P), RR.City.flatMaterial());
        fm.layers.set(1); scene.add(fm);
        falcon = { m: fm, cx: q.x, cz: q.z, r: 35, a: rng() * 6.28, dive: 0, t: 12 };
      }
    }

    // ---------- #20 THE PLAYPEN ----------
    // The anchorage inside the breakwater where a hundred boats raft up every summer weekend,
    // music blaring, nobody actually going anywhere. Kept >120 m clear of both race corridors.
    {
      const P = [];
      const HULLS = [0xf1efe8, 0x1b3a6b, 0xb0322a, 0x2f6b4a];
      for (let i = 0; i < 18; i++) {
        const L = 5 + rng() * 4, W = L * 0.34, a = rng() * 6.28;
        const px = (rng() - 0.5) * 46, pz = (rng() - 0.5) * 34;
        const hull2 = new THREE.BoxGeometry(W, 1.15, L);
        const hp2 = hull2.attributes.position;
        for (let v = 0; v < hp2.count; v++) if (Math.abs(hp2.getZ(v)) > L * 0.4) hp2.setX(v, hp2.getX(v) * 0.35);
        hull2.computeVertexNormals();
        hull2.rotateY(a); hull2.translate(px, 0.35, pz);
        P.push(tint(hull2, HULLS[(rng() * 4) | 0], 0.07));
        const cab = new THREE.BoxGeometry(W * 0.66, 0.85, L * 0.34);
        cab.rotateY(a); cab.translate(px, 1.3, pz);
        P.push(tint(cab, 0xf1efe8, 0.04));
        if (rng() < 0.45) {
          const bim = new THREE.BoxGeometry(W * 0.8, 0.1, L * 0.32);
          bim.rotateY(a); bim.translate(px, 2.35, pz);
          P.push(tint(bim, 0xf2c230, 0.06));
          for (const s of [-1, 1]) {
            const po = new THREE.BoxGeometry(0.08, 1.05, 0.08);
            po.rotateY(a);
            po.translate(px + Math.cos(a) * s * W * 0.34, 1.82, pz - Math.sin(a) * s * W * 0.34);
            P.push(tint(po, 0xd8d4cc, 0));
          }
        }
      }
      playpen = new THREE.Mesh(RR.City.mergeGeoms(P), RR.City.flatMaterial());
      playpen.position.set(2450, 0, -760);
      playpen.layers.set(1);
      playpen.userData.ph = rng() * 9;
      scene.add(playpen);
      E.tags.push({ name: 'THE PLAYPEN', sub: 'RAFT-UP ANCHORAGE · NOBODY IS GOING ANYWHERE',
        x: 2450, z: -760, r2: 220 * 220 });
    }

    // ---------- #44 AIR & WATER SHOW ----------
    {
      const P = [];
      const fus = new THREE.CylinderGeometry(0.02, 0.75, 8.5, 7);
      fus.rotateX(Math.PI / 2);                                      // nose toward +z
      P.push(tint(fus, 0xf4f2ec, 0));
      const wing = new THREE.BoxGeometry(9.5, 0.22, 3.0); wing.translate(0, -0.1, -1.6);
      P.push(tint(wing, 0xf4f2ec, 0));
      const trim = new THREE.BoxGeometry(9.6, 0.1, 0.7); trim.translate(0, 0.06, -0.4);
      P.push(tint(trim, 0x1b3a6b, 0));
      const fin = new THREE.BoxGeometry(0.16, 1.7, 2.0); fin.translate(0, 0.85, -3.0);
      P.push(tint(fin, 0x1b3a6b, 0));
      const jets = new THREE.InstancedMesh(RR.City.mergeGeoms(P),
        new THREE.MeshLambertMaterial({ vertexColors: true }), 6);
      jets.layers.set(1); jets.visible = false; jets.frustumCulled = false;
      scene.add(jets);
      airshow = { m: jets, t: 34, u: -1, roar: -1 };
    }

    // ---------- #28 THE WIENERMOBILE, crossing Clark St ----------
    {
      const cb2 = C.bridges.find((b) => b.name === 'Clark St');
      if (cb2 && RR.River.paths[cb2.branch]) {
        const q = U().pathNearest(RR.River.paths[cb2.branch], cb2.x, cb2.z);
        const P = [];
        const bun = new THREE.CylinderGeometry(1.5, 1.5, 6.4, 10);
        bun.rotateX(Math.PI / 2); bun.scale(1, 0.6, 1); bun.translate(0, 1.35, 0);
        P.push(tint(bun, 0xd9b87a, 0));
        const frank = new THREE.CylinderGeometry(1.05, 1.05, 7.0, 10);
        frank.rotateX(Math.PI / 2); frank.translate(0, 1.95, 0);
        P.push(tint(frank, 0xc4553a, 0));
        for (const s of [-1, 1]) {
          const cap = new THREE.SphereGeometry(1.05, 8, 6); cap.translate(0, 1.95, s * 3.5);
          P.push(tint(cap, 0xc4553a, 0));
        }
        const ws = new THREE.BoxGeometry(1.5, 0.7, 0.12); ws.translate(0, 2.0, 2.4);
        P.push(tint(ws, 0x2b3a44, 0));
        const ch = new THREE.BoxGeometry(1.9, 0.4, 5.4); ch.translate(0, 0.75, 0);
        P.push(tint(ch, 0x8a8f96, 0));
        for (const sx of [-1, 1]) for (const sz of [-2.0, 2.0]) {
          const wh = new THREE.CylinderGeometry(0.45, 0.45, 0.26, 8);
          wh.rotateZ(Math.PI / 2); wh.translate(sx * 0.95, 0.45, sz);
          P.push(tint(wh, 0x24262a, 0));
        }
        const wm = new THREE.Mesh(RR.City.mergeGeoms(P), RR.City.flatMaterial());
        wm.layers.set(1); wm.visible = false; scene.add(wm);
        wiener = { m: wm, cx: q.x, cz: q.z, ax: -q.tz, az: q.tx,
          y: cb2.clearance + 1.9, t: 44, u: 0, run: false, dir: 1, said: false };
      }
    }

    // ---------- #15 THE HOT-DOG STAND: NO KETCHUP ----------
    {
      const q = U().pathNearest(main, 112, 65);
      const sx = -q.tz, sz = q.tx;
      const kx = q.x + sx * (q.w + 5.5), kz = q.z + sz * (q.w + 5.5);
      const ry = Math.atan2(-sx, -sz);                               // serving hatch faces the water
      const PYd = (RR.Riverwalk && RR.Riverwalk.PY != null) ? RR.Riverwalk.PY : 1.1;
      const P = [];
      const box2 = new THREE.BoxGeometry(4, 2.7, 3); box2.translate(0, PYd + 1.35, 0);
      P.push(tint(box2, 0xe8e4da, 0.03));
      const cnt = new THREE.BoxGeometry(4.3, 0.16, 0.6); cnt.translate(0, PYd + 1.5, -1.6);
      P.push(tint(cnt, 0x8a8f96, 0));
      for (let k = 0; k < 6; k++) {                                  // red-and-yellow awning
        const st = new THREE.BoxGeometry(0.72, 0.1, 1.7);
        st.rotateX(0.22); st.translate(-1.8 + k * 0.72, PYd + 2.85, -1.5);
        P.push(tint(st, k % 2 ? 0xf2c230 : 0xc4382e, 0));
      }
      const rf = new THREE.BoxGeometry(4.3, 0.2, 3.3); rf.translate(0, PYd + 2.8, 0);
      P.push(tint(rf, 0xb8b2a4, 0));
      const bun2 = new THREE.CylinderGeometry(0.42, 0.42, 2.5, 9);   // the rooftop sculpture
      bun2.rotateZ(Math.PI / 2); bun2.scale(1, 0.62, 1); bun2.translate(0, PYd + 3.35, 0);
      P.push(tint(bun2, 0xd9b87a, 0));
      const frk = new THREE.CylinderGeometry(0.28, 0.28, 2.7, 9);
      frk.rotateZ(Math.PI / 2); frk.translate(0, PYd + 3.55, 0);
      P.push(tint(frk, 0xb4543a, 0));
      const rel = new THREE.BoxGeometry(2.6, 0.09, 0.16); rel.translate(0, PYd + 3.8, 0.1);
      P.push(tint(rel, 0x3dbb3d, 0));                                // nuclear-green relish
      for (let k = 0; k < 7; k++) {                                  // mustard zigzag
        const mz = new THREE.BoxGeometry(0.42, 0.07, 0.1);
        mz.rotateY(k % 2 ? 0.7 : -0.7); mz.translate(-1.1 + k * 0.36, PYd + 3.84, -0.05);
        P.push(tint(mz, 0xf2c230, 0));
      }
      for (const g of P) { g.rotateY(ry); g.translate(kx, 0, kz); flat.push(g); }
      E.tags.push({ name: 'CHICAGO DOG · NO KETCHUP', sub: 'DRAGGED THROUGH THE GARDEN · CELERY SALT',
        x: kx, z: kz, r2: 60 * 60 });
    }

    // ---------- #38 BOZO'S BUCKETS: the Grand Prize Game had a ten-year ticket waiting list ----
    {
      const q = U().pathNearest(main, -160, 70);
      const sx = -q.tz, sz = q.tx;
      const bx = q.x + sx * (q.w + 4.5), bz = q.z + sz * (q.w + 4.5);
      const ry = Math.atan2(-sx, -sz);
      const PYd = (RR.Riverwalk && RR.Riverwalk.PY != null) ? RR.Riverwalk.PY : 1.1;
      const P = [];
      for (let k = 0; k < 6; k++) {
        const bu = new THREE.CylinderGeometry(0.25, 0.19, 0.42, 10);
        bu.translate(-1.9 + k * 0.76, PYd + 0.21, 0);
        P.push(tint(bu, k % 2 ? 0xf2c230 : 0xe4392e, 0));
        const rim = new THREE.CylinderGeometry(0.27, 0.27, 0.05, 10);
        rim.translate(-1.9 + k * 0.76, PYd + 0.43, 0);
        P.push(tint(rim, 0xf1efe8, 0));
      }
      for (const g of P) { g.rotateY(ry); g.translate(bx, 0, bz); flat.push(g); }
    }

    if (flat.length) {
      const mesh = new THREE.Mesh(RR.City.mergeGeoms(flat), RR.City.flatMaterial());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }

    // ---------- STEVE BILLER BAND tour bus on Kinzie St, dumping "waste" through the
    // grated deck into the river — a wink at the infamous 2004 bridge incident ----------
    {
      const kb = window.CHICAGO.bridges.find((b) => b.name === 'Kinzie St');
      if (kb && RR.River.paths[kb.branch]) {
        const q = U().pathNearest(RR.River.paths[kb.branch], kb.x, kb.z);
        const deckTop = kb.clearance + 1.6;                 // road surface on the bascule deck
        const ax = -q.tz, az = q.tx;                        // across-channel = the roadway direction
        const yaw = Math.atan2(ax, az);                     // bus length (local +z) runs along the road
        const grp = new THREE.Group();
        grp.position.set(q.x - q.tz * 2.2, deckTop, q.z + q.tx * 2.2);   // parked just off the crown
        grp.rotation.y = yaw;

        const coachMat = new THREE.MeshLambertMaterial({ color: 0x2a2f3a });
        const glassMat = new THREE.MeshLambertMaterial({ color: 0x11202b });
        const trimMat = new THREE.MeshLambertMaterial({ color: 0x8a929c });
        // body: a long touring coach, length along +z
        const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.0, 11.5), coachMat);
        body.position.y = 2.1; grp.add(body);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.4, 11.0), trimMat);
        roof.position.y = 3.7; grp.add(roof);
        // window ribbon both sides
        for (const s of [-1, 1]) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 9.8), glassMat);
          win.position.set(s * 1.41, 2.6, 0); grp.add(win);
        }
        // windshield + tail
        const wsF = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.4, 0.1), glassMat); wsF.position.set(0, 2.5, 5.8); grp.add(wsF);
        const wsB = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.2, 0.1), glassMat); wsB.position.set(0, 2.5, -5.8); grp.add(wsB);
        // wheels
        for (const z of [4.2, 2.6, -3.4, -4.6]) for (const s of [-1, 1]) {
          const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.4, 10), new THREE.MeshLambertMaterial({ color: 0x0c0e12 }));
          wh.rotation.z = Math.PI / 2; wh.position.set(s * 1.42, 0.7, z); grp.add(wh);
        }
        // STEVE BILLER BAND tour livery, readable off both flanks
        const banTex = U().canvasTexture(512, 96, (c, w, h) => {
          c.fillStyle = '#141821'; c.fillRect(0, 0, w, h);
          c.fillStyle = '#e8c24a'; c.font = 'bold italic 40px Arial, sans-serif';
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText('STEVE BILLER BAND', w / 2, 34);
          c.fillStyle = '#b8c0cc'; c.font = '20px Arial, sans-serif';
          c.fillText('· SUMMER TOUR ·', w / 2, 70);
        });
        for (const s of [-1, 1]) {
          const ban = new THREE.Mesh(new THREE.PlaneGeometry(9.0, 1.7),
            new THREE.MeshBasicMaterial({ map: banTex }));
          ban.position.set(s * 1.45, 1.5, 0); ban.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2; grp.add(ban);
        }
        grp.traverse((o) => o.layers.set(1));
        scene.add(grp);

        // the dump: a brown stream + recycling droplets falling from the rear underbody to the
        // river, and a spreading stain on the surface below. Dump point in world space.
        const dpx = q.x - q.tz * 2.2 + ax * -4.2, dpz = q.z + q.tx * 2.2 + az * -4.2;   // under the tail
        const wasteMat = new THREE.MeshBasicMaterial({ color: 0x4a3a1c, transparent: true, opacity: 0.62, depthWrite: false });
        const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, deckTop, 7), wasteMat.clone());
        stream.position.set(dpx, deckTop / 2, dpz); stream.layers.set(1); scene.add(stream);
        const stain = new THREE.Mesh(new THREE.CircleGeometry(2.2, 18), new THREE.MeshBasicMaterial({ color: 0x5c4a22, transparent: true, opacity: 0.5, depthWrite: false }));
        stain.rotation.x = -Math.PI / 2; stain.position.set(dpx, 0.14, dpz); stain.layers.set(1); scene.add(stain);
        const drops = [];
        for (let i = 0; i < 14; i++) {
          const d = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.16), wasteMat.clone());
          d.layers.set(1); scene.add(d);
          drops.push({ m: d, y: Math.random() * deckTop, spd: 4 + Math.random() * 3, jx: (Math.random() - 0.5) * 0.5, jz: (Math.random() - 0.5) * 0.5 });
        }
        busDump = { grp, stream, stain, drops, dpx, dpz, deckTop, gush: 0 };
        E.tags.push({ name: 'STEVE BILLER BAND — 2004', sub: 'KINZIE ST · 800 LB THROUGH THE GRATING · HEADS UP',
          x: kb.x, z: kb.z, r2: 120 * 120 });
      }
    }

    // flags ripple hoist→fly; the great plume breathes 8-20m like the real hourly display
    RR.Engine.onUpdate((dt, t) => {
      const raceS = RR.Race.state && RR.Race.state();
      const pl = raceS && raceS.player;
      if (flagMesh) {
        const pos = flagMesh.geometry.attributes.position.array;
        for (const m of flagMeta) {
          for (let v = 0; v < flagU.length; v++) {
            const u = flagU[v];
            const w = Math.sin(u * 7.5 - t * 3.1 + m.ph) * 0.42 * u;
            const j = (m.i0 + v) * 3;
            pos[j] = flagBase[j] + m.px * w;
            pos[j + 1] = flagBase[j + 1] + Math.sin(u * 4.2 - t * 2.3 + m.ph) * 0.1 * u;
            pos[j + 2] = flagBase[j + 2] + m.pz * w;
          }
        }
        flagMesh.geometry.attributes.position.needsUpdate = true;
      }
      // Buckingham runs a show, not a hose: 12 m base, 46 m on the hour, hold 20 s, decay 10 s
      if (mainJet && bfState) {
        bfState.t += dt;
        const c = bfState.t % 100;
        let hgt = 12;
        if (c < 8) hgt = 12 + 34 * (c / 8);
        else if (c < 28) hgt = 46;
        else if (c < 38) hgt = 46 - 34 * ((c - 28) / 10);
        mainJet.scale.y = hgt;
        const br = 1 + 0.15 * Math.sin(t * 1.7) + (hgt - 12) / 34 * 0.5;
        mainJet.scale.x = br; mainJet.scale.z = br;
        const lit = RR.Theme && (RR.Theme.mode === 'night' || RR.Theme.mode === 'dusk');
        if (lit) {                                                   // the coloured evening show
          const k = (t / 5) % 4;
          const A = JET_COLS[k | 0], B = JET_COLS[(k + 1 | 0) % 4], f = k % 1;
          bfState.mat.color.setRGB(A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f);
        } else bfState.mat.color.setRGB(0.81, 0.92, 1);
        bfState.mat.opacity = 0.36 + 0.2 * ((hgt - 12) / 34) + 0.05 * Math.sin(t * 3.1);
      }
      // #2 the Centennial Fountain cannon — hourly, and always when a racer is 200 m out
      if (cannon) {
        const c = cannon;
        if (c.on > 0) {
          c.on -= dt;
          if (c.on <= 0) { c.on = 0; c.arc.visible = false; }
        } else {
          c.t += dt;
          const mx2 = (c.ax + c.bx) / 2, mz2 = (c.az + c.bz) / 2;
          const near = pl && U().dist2(pl.pos.x, pl.pos.z, mx2, mz2) < 200 * 200;
          if (c.t > 90 || (near && c.t > 22)) { c.on = 12; c.t = 0; c.arc.visible = true; }
        }
        if (c.on > 0) {
          const fade = U().clamp(Math.min(c.on, 12 - c.on) / 1.2, 0, 1);
          c.mat.opacity = 0.16 + 0.30 * fade + 0.04 * Math.sin(t * 9);
          if (RR.FX && Math.random() < 0.85) {
            RR.FX.spray(c.bx + (Math.random() - 0.5) * 5, 1.0, c.bz + (Math.random() - 0.5) * 5,
              (Math.random() - 0.5) * 5, 3 + Math.random() * 4, (Math.random() - 0.5) * 5, 3, 2.4, 2.2);
          }
          const bl = raceS && raceS.boats;
          if (bl) for (let i = 0; i < bl.length; i++) {
            const b = bl[i];
            if (!b.pos || segDist(b.pos.x, b.pos.z, c.ax, c.az, c.bx, c.bz) > 9) continue;
            b.vel.x -= b.vel.x * 0.14 * dt; b.vel.z -= b.vel.z * 0.14 * dt;   // ~8% across the curtain
            if (RR.FX && Math.random() < 0.9) {
              RR.FX.spray(b.pos.x, 0.7, b.pos.z, (Math.random() - 0.5) * 7, 5 + Math.random() * 3,
                (Math.random() - 0.5) * 7, 4, 2.6, 2.0);
            }
            if (b === pl && RR.Camera && RR.Camera.kick) RR.Camera.kick(0.2);
          }
        }
      }
      // #1 the car jump: on a slow timer, and guaranteed when a racer comes within 90 m
      if (jump) {
        const j = jump;
        if (j.st === 0) {
          j.wait -= dt; j.cool = Math.max(0, j.cool - dt);
          const near = pl && U().dist2(pl.pos.x, pl.pos.z, j.lx, j.lz) < 90 * 90;
          if ((near && j.cool <= 0) || j.wait <= 0) {
            j.st = 1; j.tt = 0; j.m.visible = true; j.wait = 70; j.cool = 30;
          }
        } else if (j.st === 1) {
          j.tt += dt;
          const u = U().clamp(j.tt / j.T, 0, 1);
          const x = U().lerp(j.lx, j.wx, u), z = U().lerp(j.lz, j.wz, u);
          const y = j.ly + 3 * j.tt - 4.9 * j.tt * j.tt;
          j.m.position.set(x, y, z);
          j.m.rotation.x = j.tt * 2.35; j.m.rotation.z = j.tt * 1.05;
          if (y <= 0.3 || j.tt >= j.T) {
            j.st = 2; j.tt = 0;
            if (RR.FX) {
              RR.FX.spray(x, 0.4, z, 0, 17, 0, 40, 6, 3.4);
              if (RR.FX.splashBurst) RR.FX.splashBurst(x, 0.4, z, 2.4);
            }
            if (RR.Audio && RR.Audio.splash) RR.Audio.splash(1);
            if (RR.Audio && RR.Audio.thud) RR.Audio.thud(1);
            if (RR.HUD && RR.HUD.flash) RR.HUD.flash('🚗 THE HUNTER · 1980');
          }
        } else {
          j.tt += dt;
          j.m.position.y = -j.tt * 1.1;                              // sinks, and is gone in 6 s
          j.m.rotation.z += dt * 0.5;
          if (j.tt > 6) { j.st = 0; j.m.visible = false; }
        }
      }
      // #4 something flashes across a Lower Wacker portal every ~25 s
      if (wacker) {
        const W2 = wacker;
        if (W2.run < 0) {
          W2.t -= dt;
          if (W2.t <= 0) {
            W2.run = (rng() * W2.portals.length) | 0;
            W2.dir = rng() < 0.5 ? 1 : -1;
            W2.u = -6 * W2.dir;
            W2.m.visible = true;
            W2.t = 20 + rng() * 12;
          }
        } else {
          W2.u += 26 * dt * W2.dir;
          const p = W2.portals[W2.run];
          W2.m.position.set(p.x + p.tx * W2.u, W2.y, p.z + p.tz * W2.u);
          W2.m.rotation.y = Math.atan2(p.tx * W2.dir, p.tz * W2.dir);
          if (Math.abs(W2.u) > 6) { W2.run = -1; W2.m.visible = false; }
        }
      }
      if (whirl) {                                                   // #11 the 1992 flood
        whirl.m.rotation.z += dt * 0.55;
        whirl.m.position.y = U().waterHeight(whirl.x, whirl.z, t, 1) + 0.22;
        whirl.m.material.opacity = 0.38 + 0.12 * Math.sin(t * 1.3);
      }
      if (playpen) {                                                 // #20 the raft bobs as one
        // read the live sea state rather than a hardcoded amplitude — the lake's swell ramp is
        // the single source of truth, and a raft 6 cm out of its own water reads as broken
        playpen.position.y = U().waterHeight(playpen.position.x, playpen.position.z, t,
          RR.River.waveAmp(playpen.position.x, playpen.position.z)) - 0.05;
        playpen.rotation.z = Math.sin(t * 0.55 + playpen.userData.ph) * 0.035;
        playpen.rotation.x = Math.sin(t * 0.43 + playpen.userData.ph * 2) * 0.03;
      }
      if (falcon) {                                                  // #18 the peregrine
        const f = falcon;
        f.a += dt * 0.36;                                            // ~220 m circuit
        f.t -= dt;
        if (f.t <= 0 && f.dive <= 0) { f.dive = 2.6; f.t = 40; }
        if (f.dive > 0) f.dive -= dt;
        const st = f.dive > 0 ? Math.sin(U().clamp((2.6 - f.dive) / 2.6, 0, 1) * Math.PI) : 0;
        const y = U().lerp(42 + Math.sin(f.a * 1.7) * 12, 11, st);
        f.m.position.set(f.cx + Math.cos(f.a) * f.r, y, f.cz + Math.sin(f.a) * f.r);
        f.m.rotation.y = -f.a - Math.PI / 2;
        f.m.rotation.x = -st * 0.85;
        f.m.rotation.z = 0.4 - st * 0.3;
      }
      // #44 the Blue Angels come over the lakefront once a lap and the whole city stops
      if (airshow) {
        const A = airshow;
        if (A.u < 0) {
          A.t -= dt;
          const overLake = pl && pl.pos.x > 1750;
          if (A.t <= 0 || (overLake && A.t < 55)) { A.u = 0; A.t = 100; A.m.visible = true; A.roar = 2.5; }
        } else {
          A.u += dt / 16.2;
          if (A.roar > 0) {
            A.roar -= dt;
            if (A.roar <= 0 && RR.HUD && RR.HUD.flash) RR.HUD.flash('✈ AIR & WATER SHOW');
          }
          if (A.u >= 1) { A.u = -1; A.m.visible = false; }
          else {
            const x = U().lerp(4200, 1900, A.u), z = U().lerp(-1400, 400, A.u);
            const dl = Math.hypot(-2300, 1800), fx = -2300 / dl, fz = 1800 / dl;
            _q2.setFromAxisAngle(_up2, Math.atan2(fx, fz));
            for (let i = 0; i < 6; i++) {
              const o = FORM[i];
              _p2.set(x - fz * o[0] - fx * o[1], 90 + Math.sin(t * 1.4 + i) * 0.7, z + fx * o[0] - fz * o[1]);
              _m2.compose(_p2, _q2, _s2);
              A.m.setMatrixAt(i, _m2);
            }
            A.m.instanceMatrix.needsUpdate = true;
          }
        }
      }
      // #28 the Wienermobile, on Clark St, roughly every two minutes
      if (wiener) {
        const w2 = wiener;
        if (!w2.run) {
          w2.t -= dt;
          if (w2.t <= 0) {
            w2.run = true; w2.dir = rng() < 0.5 ? 1 : -1; w2.u = -60 * w2.dir;
            w2.m.visible = true; w2.t = 110; w2.said = false;
          }
        } else {
          w2.u += 13 * dt * w2.dir;
          const x = w2.cx + w2.ax * w2.u, z = w2.cz + w2.az * w2.u;
          w2.m.position.set(x, w2.y, z);
          w2.m.rotation.y = Math.atan2(w2.ax * w2.dir, w2.az * w2.dir);
          if (!w2.said && pl && U().dist2(pl.pos.x, pl.pos.z, x, z) < 60 * 60) {
            w2.said = true;
            if (RR.HUD && RR.HUD.flash) RR.HUD.flash('🌭 WIENERMOBILE');
          }
          if (Math.abs(w2.u) > 60) { w2.run = false; w2.m.visible = false; }
        }
      }
      // #37 the Warehouse, 206 S Jefferson: the genre is named after the club, and the game
      // already has a Chicago-house title track — so let it bleed back in as you go past.
      if (pl) {
        const d2 = U().dist2(pl.pos.x, pl.pos.z, -994, 1000);
        if (!houseBled && d2 < 90 * 90) {
          houseBled = true;
          if (RR.Audio && RR.Audio.houseBleed) RR.Audio.houseBleed();
          if (RR.HUD && RR.HUD.flash) RR.HUD.flash('🎧 THE WAREHOUSE · 1977');
        } else if (houseBled && d2 > 260 * 260) houseBled = false;
      }
      // L trains: guaranteed to run whenever a racer closes in on their bridge (plus an
      // idle ambient schedule). Long approach runs mean they're always seen mid-motion,
      // never popping in — and a short cooldown keeps repeat passes believable.
      for (let i = 0; i < trains.length; i++) {
        const tr = trains[i];
        if (tr.run) {
          tr.s += 19 * dt * tr.dir;
          if (tr.dir > 0 ? tr.s > tr.max : tr.s < tr.min) {
            tr.run = false; tr.wait = 16 + rng() * 12; tr.cool = 8; tr.mesh.position.y = -1000;
          } else {
            tr.mesh.position.set(tr.cx + tr.ax * tr.s, tr.y, tr.cz + tr.az * tr.s);
            // ghost in/out only over the outer 14m of track, far from the river
            const edge = Math.min(tr.s - tr.min, tr.max - tr.s);
            tr.mat.opacity = U().clamp(edge / 14, 0, 1);
            // #23 — the Loop's four 90° corners make these trains shriek, and that noise
            // IS downtown. Fire it once per run, as the consist reaches the end of its track.
            if (!tr.screeched && edge < 20) {
              tr.screeched = true;
              if (RR.Audio && RR.Audio.lScreech) {
                const px = pl ? pl.pos.x : tr.cx;
                RR.Audio.lScreech(U().clamp((tr.cx - px) / 200, -1, 1));
              }
            }
          }
        } else {
          tr.screeched = false;
          tr.wait -= dt;
          tr.cool = Math.max(0, tr.cool - dt);
          const near = pl && U().dist2(pl.pos.x, pl.pos.z, tr.cx, tr.cz) < 250 * 250;
          if ((near && tr.cool <= 0) || tr.wait <= 0) { tr.run = true; tr.dir = -tr.dir; tr.s = tr.dir > 0 ? tr.min : tr.max; }
        }
      }
      // fireboat bobs on the swell and keeps two tall arcing plumes going over the channel
      if (fb) {
        const wy = U().waterHeight(fb.x, fb.z, t, 1);
        fb.g.position.y = wy;
        fb.g.rotation.z = Math.sin(t * 0.7 + fb.ph) * 0.03;
        if (RR.FX) for (let i = 0; i < 2; i++) {
          if (Math.random() < 0.35) {
            const n = fb.n[i];
            RR.FX.spray(fb.x + n.ox, wy + n.oy, fb.z + n.oz,
              n.vx * 1.15, 9.5 + Math.random() * 2, n.vz * 1.15, 4, 1.6, 1.7);
          }
        }
      }
      // duck raft bobs together on the river swell
      if (ducks) {
        ducks.position.y = U().waterHeight(ducks.position.x, ducks.position.z, t, 1) - 0.06;
        ducks.rotation.z = Math.sin(t * 0.9 + ducks.userData.ph) * 0.05;
        ducks.rotation.x = Math.sin(t * 0.7 + ducks.userData.ph * 2) * 0.04;
      }
      // Steve Biller Band bus keeps dribbling "waste" through the grate; it gushes when a
      // racer comes within range (the 2004 incident doused a tour boat passing below)
      if (busDump) {
        const bd = busDump;
        const racing = raceS && raceS.phase === 'racing';
        const near = pl && U().dist2(pl.pos.x, pl.pos.z, bd.dpx, bd.dpz) < 70 * 70;
        bd.gush = U().damp(bd.gush, near ? 1 : 0.3, 3, dt);
        const wy = U().waterHeight(bd.dpx, bd.dpz, t, 1);
        bd.stream.material.opacity = 0.5 + 0.25 * bd.gush + 0.1 * Math.sin(t * 20);
        bd.stream.scale.x = bd.stream.scale.z = 0.8 + bd.gush * 0.5 + 0.08 * Math.sin(t * 15);
        bd.stain.scale.setScalar(0.7 + bd.gush * 0.8 + 0.05 * Math.sin(t * 3));
        bd.stain.material.opacity = 0.32 + bd.gush * 0.26;
        bd.stain.position.y = wy + 0.12;
        const active = Math.floor(4 + bd.gush * bd.drops.length);
        for (let i = 0; i < bd.drops.length; i++) {
          const d = bd.drops[i];
          if (i >= active) { d.m.visible = false; continue; }
          d.m.visible = true;
          d.y -= d.spd * dt;
          if (d.y <= wy + 0.15) {
            d.y = bd.deckTop - Math.random() * 0.5;
            d.jx = (Math.random() - 0.5) * 0.5; d.jz = (Math.random() - 0.5) * 0.5;
            if (RR.FX && Math.random() < 0.5) RR.FX.spray(bd.dpx + d.jx, wy + 0.1, bd.dpz + d.jz, 0, 1.1, 0, 1, 0.8, 0.8);
          }
          const spread = d.y / bd.deckTop;                    // funnel narrows toward the grate
          d.m.position.set(bd.dpx + d.jx * spread, d.y, bd.dpz + d.jz * spread);
          d.m.rotation.y += dt * 5;
        }
        if (near && racing && !bd._warned) { bd._warned = true; if (RR.HUD && RR.HUD.flash) RR.HUD.flash('⚠ HEADS UP BELOW!'); }
        if (!near) bd._warned = false;
      }
      // blimp laps the Loop, nose into its turn, banner in tow
      if (blimp) {
        blimp.a += dt * 0.022;
        const bx3 = blimp.cx + Math.cos(blimp.a) * blimp.r;
        const bz3 = blimp.cz + Math.sin(blimp.a) * blimp.r;
        blimp.g.position.set(bx3, 215 + Math.sin(t * 0.2) * 6, bz3);
        // nose (+z local) points along the tangent of travel so the banner trails astern,
        // instead of the old +π/2 that aimed it radially outward and flew the ship broadside
        blimp.g.rotation.y = -blimp.a;
      }
      // aviation strobes: sharp double-blink like the real towers
      if (beacons.length) {
        const cyc = (t % 1.6) / 1.6;
        const on = cyc < 0.07 || (cyc > 0.14 && cyc < 0.21);
        for (let i = 0; i < beacons.length; i++) beacons[i].visible = on;
      }
    });
  };

  RR.Eggs = E;
})();

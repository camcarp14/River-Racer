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

  function tint(geo, hex, jit) { RR.City.tintGeom(geo, hex, jit || 0, rng); return geo; }

  // the real Chicago flag: white field, two light-blue stripes, four red six-pointed stars
  function flagTexture() {
    return U().canvasTexture(192, 128, (ctx, w, h) => {
      ctx.fillStyle = '#f6f7f5'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#b3ddf2';
      ctx.fillRect(0, h / 6, w, h / 6);            // top stripe (2nd sixth)
      ctx.fillRect(0, h * 4 / 6, w, h / 6);        // bottom stripe (5th sixth)
      ctx.fillStyle = '#e4002b';
      const R = h * 0.115, r = R * 0.42;           // sharp six-pointed municipal stars
      for (let s = 0; s < 4; s++) {
        const cx = w * (0.5 + (s - 1.5) * 0.19), cy = h / 2;
        ctx.beginPath();
        for (let i = 0; i < 12; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 6, rad = i % 2 ? r : R;
          ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
        }
        ctx.fill();
      }
    });
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
        for (const g of parts) { g.rotateY(ang); g.translate(rx, 0, rz); flat.push(g); }
        E.tags.push({ name: 'THE RAT HOLE', x: rx, z: rz, r2: 60 * 60 });
      }
    }

    // ---------- Buckingham Fountain jets: pulsing center plume + constant side jets ----------
    if (bf) {
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
      for (let k = 0; k < 3; k++) {
        const a = 0.5 + (k * Math.PI * 2) / 3;
        const j = new THREE.Mesh(jetGeo, jetMat);
        j.position.set(bf.x + Math.cos(a) * 11, GY + 1.8, bf.z + Math.sin(a) * 11);
        j.scale.set(0.8, 5.5, 0.8);
        j.layers.set(1);
        scene.add(j);
      }
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
      const m = new THREE.Mesh(g, RR.City.flatMaterial());
      m.layers.set(1);
      m.position.set(q.x, -1000, q.z);                               // parked hidden until it runs
      scene.add(m);
      trains.push({ mesh: m, cx: q.x, cz: q.z, ax, az, y: b.clearance + 8.6,
        end: q.w + 55, run: false, dir: 1, s: 0, wait: 4 + rng() * 14 });
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
      E.tags.push({ name: 'FIREBOAT SALUTE', x: bx, z: bz, r2: 90 * 90 });
    }

    if (flat.length) {
      const mesh = new THREE.Mesh(RR.City.mergeGeoms(flat), RR.City.flatMaterial());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }

    // flags ripple hoist→fly; the great plume breathes 8-20m like the real hourly display
    RR.Engine.onUpdate((dt, t) => {
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
      if (mainJet) {
        mainJet.scale.y = 14 + 6 * Math.sin(t * 0.45);
        const br = 1 + 0.15 * Math.sin(t * 1.7);
        mainJet.scale.x = br; mainJet.scale.z = br;
      }
      // L trains slide across their spans at ~20 m/s, then hide and re-arm (14-24 s)
      for (let i = 0; i < trains.length; i++) {
        const tr = trains[i];
        if (tr.run) {
          tr.s += 20 * dt * tr.dir;
          if (tr.s * tr.dir > tr.end) { tr.run = false; tr.wait = 14 + rng() * 10; tr.mesh.position.y = -1000; }
          else tr.mesh.position.set(tr.cx + tr.ax * tr.s, tr.y, tr.cz + tr.az * tr.s);
        } else {
          tr.wait -= dt;
          if (tr.wait <= 0) { tr.run = true; tr.dir = -tr.dir; tr.s = -tr.end * tr.dir; }
        }
      }
      // fireboat bobs on the swell and keeps two arcing plumes going over the channel
      if (fb) {
        const wy = U().waterHeight(fb.x, fb.z, t, 1);
        fb.g.position.y = wy;
        fb.g.rotation.z = Math.sin(t * 0.7 + fb.ph) * 0.03;
        if (RR.FX) for (let i = 0; i < 2; i++) {
          if (Math.random() < 0.25) {
            const n = fb.n[i];
            RR.FX.spray(fb.x + n.ox, wy + n.oy, fb.z + n.oz,
              n.vx, 7.5 + Math.random() * 1.5, n.vz, 3, 1.4, 1.4);
          }
        }
      }
    });
  };

  RR.Eggs = E;
})();

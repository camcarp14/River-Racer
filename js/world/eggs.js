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
      E.tags.push({ name: 'FIREBOAT SALUTE', x: bx, z: bz, r2: 90 * 90 });
    }

    // ---------- RUBBER DUCK DERBY: a flotilla of yellow ducks bobbing by the riverwalk ----------
    {
      const q = U().pathAt(main, main.len * 0.42, {});
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
      ducks = new THREE.Mesh(RR.City.mergeGeoms(duckGeoms), RR.City.flatMaterial());
      ducks.layers.set(1);
      ducks.position.set(dx2, 0, dz2);
      scene.add(ducks);
      ducks.userData.ph = rng() * 9;
      E.tags.push({ name: 'RUBBER DUCK DERBY', x: dx2, z: dz2, r2: 80 * 80 });
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
      const q = U().pathAt(main, main.len * 0.31, {});
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
      const mural = new THREE.Mesh(new THREE.PlaneGeometry(24, 3.6),
        new THREE.MeshLambertMaterial({ map: muralTex }));
      mural.position.set(mx, 3.4, mz);
      mural.rotation.y = Math.atan2(-q.tz, q.tx) + Math.PI / 2;      // face the water
      mural.layers.set(1);
      scene.add(mural);
      E.tags.push({ name: 'SWEET HOME CHICAGO MURAL', x: mx, z: mz, r2: 70 * 70 });
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
        E.tags.push({ name: 'STEVE BILLER BAND — 2004', x: kb.x, z: kb.z, r2: 120 * 120 });
      }
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
      // L trains: guaranteed to run whenever a racer closes in on their bridge (plus an
      // idle ambient schedule). Long approach runs mean they're always seen mid-motion,
      // never popping in — and a short cooldown keeps repeat passes believable.
      const raceS = RR.Race.state && RR.Race.state();
      const pl = raceS && raceS.player;
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
          }
        } else {
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

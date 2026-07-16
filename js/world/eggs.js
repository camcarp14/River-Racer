/* River Racer — Chicago easter eggs: waving city flags, the famous Rat Hole sidewalk
   imprint, and Buckingham Fountain's animated water jets. Static bits merge into one
   draw call; only the flags and jets are live meshes (all on layer 1, skipped by the
   planar-reflection pass). */
(function () {
  const E = { tags: [] };
  const U = () => RR.U;
  let rng;
  let flagMesh = null, flagMeta = [], flagBase = null, flagU = null;
  let mainJet = null;

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
    for (const f of [0.22, 0.42, 0.62]) {                            // riverwalk spots, south bank
      const q = U().pathAt(main, main.len * f, {});
      for (let off = q.w + 11; off < q.w + 32; off += 4) {
        const px = q.x - q.tz * off, pz = q.z + q.tx * off;
        if (RR.City.landClearance(px, pz) > 2) { spots.push({ x: px, z: pz, y: GY }); break; }
      }
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
    });
  };

  RR.Eggs = E;
})();

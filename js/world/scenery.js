/* River Racer — lakefront life: marina + moored boats, sailboats under way, a lake
   freighter, harbor buoys, and low distant shorelines so Lake Michigan isn't empty. */
(function () {
  const SC = {};
  const U = () => RR.U;
  let rng, bobbers = [];

  function tint(geo, hex, jit) { RR.City.tintGeom(geo, hex, jit || 0, rng); return geo; }

  // ---- a small sailboat as its own group (bobs on the waves) ----
  function makeSailboat(scale, hull, withSail) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4 * scale, 1.1 * scale, 7 * scale),
      new THREE.MeshLambertMaterial({ color: hull }));
    const p = body.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i); if (Math.abs(z) > 2.5 * scale) p.setX(i, p.getX(i) * 0.35);
    }
    body.geometry.computeVertexNormals();
    body.position.y = 0.4 * scale; g.add(body);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.7 * scale, 0.5 * scale, 3 * scale),
      new THREE.MeshLambertMaterial({ color: 0xeef0f2 }));
    deck.position.set(0, 1.0 * scale, -0.5 * scale); g.add(deck);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * scale, 0.11 * scale, 11 * scale, 5),
      new THREE.MeshLambertMaterial({ color: 0xcfcabc }));
    mast.position.y = 6 * scale; g.add(mast);
    if (withSail) {
      const sailMat = new THREE.MeshLambertMaterial({ color: 0xf4f2ea, side: THREE.DoubleSide });
      const main = new THREE.Mesh(new THREE.PlaneGeometry(4.2 * scale, 8.2 * scale), sailMat);
      main.position.set(0, 5.6 * scale, -1.9 * scale);
      main.rotation.y = Math.PI / 2; main.scale.x = 0.5; g.add(main);
      // give the mainsail a triangular silhouette
      const sp = main.geometry.attributes.position;
      for (let i = 0; i < sp.count; i++) { const y = sp.getY(i); if (y > 0) sp.setX(i, sp.getX(i) * (1 - y / (8.2 * scale))); }
      main.geometry.computeVertexNormals();
      const jib = new THREE.Mesh(new THREE.PlaneGeometry(3 * scale, 6.5 * scale, 1, 1), sailMat);
      jib.position.set(0, 4.8 * scale, 1.7 * scale); jib.rotation.y = Math.PI / 2; jib.scale.x = 0.5; g.add(jib);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  function addBobber(group, x, z, headingJitter) {
    group.position.set(x, 0, z);
    group.rotation.y = rng() * Math.PI * 2;
    RR.Engine.scene.add(group);
    bobbers.push({ g: group, x, z, ph: rng() * 9, drift: (headingJitter || 0) });
  }

  SC.init = function () {
    rng = U().mulberry(20260715);
    const scene = RR.Engine.scene;
    const C = window.CHICAGO;
    const R = RR.River;
    const flat = []; // static merged geometry (docks, freighter, shorelines)

    // ---------- DuSable-style marina south of the river mouth ----------
    // moored hulls + masts are baked straight into the static mesh (they barely move at a dock)
    const mx = 2080, mz = 430;
    const hullCols = [0x2b4a6b, 0x6b2b2b, 0x3a3a3a, 0xdfe0e2];
    for (let d = 0; d < 3; d++) {
      const dz = mz + d * 46;
      const dock = new THREE.BoxGeometry(150, 0.6, 4);
      dock.translate(mx + 40, 0.5, dz);
      flat.push(tint(dock, 0x8a7c62, 0.08));
      for (let k = 0; k < 8; k++) {
        const bx = mx - 30 + k * 18, side = (k % 2) ? 1 : -1, bz = dz + side * 5;
        const sc = 0.8 + rng() * 0.3;
        const hull = new THREE.BoxGeometry(6.5 * sc, 1.1 * sc, 2.3 * sc);
        const hp = hull.attributes.position;
        for (let i = 0; i < hp.count; i++) { if (Math.abs(hp.getX(i)) > 2.4 * sc) hp.setZ(i, hp.getZ(i) * 0.35); }
        hull.computeVertexNormals();
        hull.translate(bx, 0.55 * sc, bz); flat.push(tint(hull, hullCols[k % 4], 0.05));
        const mast = new THREE.CylinderGeometry(0.1 * sc, 0.12 * sc, 10 * sc, 5);
        mast.translate(bx, 5.5 * sc, bz); flat.push(tint(mast, 0xcfcabc, 0));
      }
    }
    const spine = new THREE.BoxGeometry(4, 0.6, 150);
    spine.translate(mx - 34, 0.5, mz + 46);
    flat.push(tint(spine, 0x8a7c62, 0.08));

    // ---------- sailboats under way, scattered across the open basin ----------
    const spots = [
      [2500, 620, 1], [2850, 300, 1.1], [3050, 780, 0.9], [3350, 250, 1.2],
      [2650, 950, 1], [3200, -150, 1.1], [3550, 500, 1], [2950, 1120, 0.95],
      [3700, -250, 1.15], [2400, 1250, 0.9],
    ];
    for (const [x, z, sc] of spots) addBobber(makeSailboat(sc, [0xdfe6ea, 0x9fb8c8, 0xe8d9b0][((x + z) | 0) % 3], true), x, z, 0.15 + rng() * 0.2);

    // ---------- harbor nav buoys (bob, tiny beacon) ----------
    for (const [x, z, red] of [[2160, -30, 1], [2160, 120, 0], [3260, -70, 1], [3180, 40, 0], [2760, 700, 1]]) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.85, 1.7, 8),
        new THREE.MeshLambertMaterial({ color: red ? 0xd23b2c : 0x2ea043 }));
      body.position.y = 0.85; g.add(body);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.3, 5),
        new THREE.MeshLambertMaterial({ color: 0x2a2f36 }));
      mast.position.y = 2.1; g.add(mast);
      g.traverse((o) => { if (o.isMesh) o.castShadow = false; });   // tiny — skip shadow pass
      addBobber(g, x, z, 0);
    }

    // ---------- lake freighter far out to the ESE ----------
    {
      const fx = 4150, fz = 640, fg = new THREE.Group();
      const hull = new THREE.BoxGeometry(26, 9, 130);
      const hp = hull.attributes.position;
      for (let i = 0; i < hp.count; i++) { const z = hp.getZ(i); if (z < -55) hp.setX(i, hp.getX(i) * 0.4); }
      hull.computeVertexNormals();
      hull.translate(0, 2.5, 0); tint(hull, 0x3b2f2a, 0.05);
      const house = new THREE.BoxGeometry(22, 14, 24); house.translate(0, 14, -46); tint(house, 0xdad6cc, 0.05);
      const funnel = new THREE.CylinderGeometry(3, 3.4, 9, 8); funnel.translate(0, 24, -50); tint(funnel, 0x8a3b2c, 0);
      const deck = new THREE.BoxGeometry(24, 1.5, 96); deck.translate(0, 7.4, 8); tint(deck, 0x5a5048, 0.05);
      for (const g of [hull, house, funnel, deck]) { g.rotateY(0.5); g.translate(fx, 0, fz); flat.push(g); }
      R.addObstacle(fx, fz, 60);
    }

    // ---------- low distant shorelines (north Gold Coast, south Museum Campus) ----------
    function shoreStrip(z0, depth, sign, count, hMin, hMax, domed) {
      // thin land pad so the far buildings don't float over the void
      const pad = new THREE.BoxGeometry(2200, 2, depth);
      pad.translate((R.lakeWestX + 3400) / 2 + 300, 0.4, z0 + sign * depth / 2);
      flat.push(tint(pad, 0x6f7466, 0.06));
      for (let i = 0; i < count; i++) {
        const bx = R.lakeWestX + 120 + rng() * 2600;
        const bz = z0 + sign * (18 + rng() * (depth - 40));
        const w = 26 + rng() * 40, d = 22 + rng() * 34, h = hMin + rng() * (hMax - hMin);
        const g = new THREE.BoxGeometry(w, h, d); g.translate(bx, h / 2, bz);
        tint(g, [0x8793a0, 0x9a9382, 0x76828c, 0xb0a798][(i) % 4], 0.14);
        flat.push(g);
      }
      if (domed) {                                   // Adler Planetarium silhouette
        const base = new THREE.CylinderGeometry(14, 16, 10, 12);
        base.translate(R.lakeWestX + 300, 5, z0 + sign * 30); flat.push(tint(base, 0xb9b09a, 0));
        const dome = new THREE.SphereGeometry(13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        dome.translate(R.lakeWestX + 300, 10, z0 + sign * 30); flat.push(tint(dome, 0x7f8a86, 0));
      }
    }
    // (the north Gold Coast strip is now the full RR.Northshore district)
    shoreStrip(R.lakeShoreZBot - 20, 90, 1, 18, 16, 70, true);     // south: Museum Campus + dome

    // merge the static scenery
    for (let i = 0; i < flat.length; i += 500) {
      const m = new THREE.Mesh(RR.City.mergeGeoms(flat.slice(i, i + 500)), RR.City.flatMaterial());
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
    }

    RR.Engine.onUpdate((dt, t) => {
      for (const b of bobbers) {
        const amp = R.waveAmp(b.x, b.z);
        const h = U().waterHeight(b.x, b.z, t, amp);
        b.g.position.y = h;
        b.g.rotation.z = Math.sin(t * 0.9 + b.ph) * 0.06 * amp;
        b.g.rotation.x = Math.cos(t * 0.7 + b.ph) * 0.05 * amp;
        if (b.drift) b.g.rotation.y += Math.sin(t * 0.2 + b.ph) * 0.0015;
      }
    });
  };

  RR.Scenery = SC;
})();

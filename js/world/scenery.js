/* River Racer — lakefront life: marina + moored boats, sailboats under way, a lake
   freighter, harbor buoys, and low distant shorelines so Lake Michigan isn't empty. */
(function () {
  const SC = {};
  const U = () => RR.U;
  let rng, fleets = [];

  function tint(geo, hex, jit) { RR.City.tintGeom(geo, hex, jit || 0, rng); return geo; }

  // ---- one sailboat, built at unit scale, merged to a single geometry ----
  // Every hull used to be five separate Meshes with five bespoke materials: ten boats and five
  // buoys cost about sixty draw calls for props that live 1 km offshore. Now each hull colour is
  // one InstancedMesh and the per-boat scale/heading rides in the instance matrix.
  function sailboatGeom(hull, withSail) {
    const parts = [];
    const body = new THREE.BoxGeometry(2.4, 1.1, 7);
    const p = body.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i); if (Math.abs(z) > 2.5) p.setX(i, p.getX(i) * 0.35);   // taper the ends
    }
    body.computeVertexNormals();
    body.translate(0, 0.4, 0);
    parts.push(tint(body, hull, 0.06));
    const deck = new THREE.BoxGeometry(1.7, 0.5, 3);
    deck.translate(0, 1.0, -0.5);
    parts.push(tint(deck, 0xeef0f2, 0.04));
    const mast = new THREE.CylinderGeometry(0.09, 0.11, 11, 5);
    mast.translate(0, 6, 0);
    parts.push(tint(mast, 0xcfcabc, 0));
    if (withSail) {
      const main = new THREE.PlaneGeometry(4.2, 8.2);
      const sp = main.attributes.position;
      for (let i = 0; i < sp.count; i++) {                                        // triangular silhouette
        const y = sp.getY(i);
        sp.setX(i, sp.getX(i) * 0.5 * (y > 0 ? 1 - y / 8.2 : 1));
      }
      main.computeVertexNormals();
      main.rotateY(Math.PI / 2); main.translate(0, 5.6, -1.9);
      parts.push(tint(main, 0xf4f2ea, 0.03));
      const jib = new THREE.PlaneGeometry(3, 6.5);
      const jp = jib.attributes.position;
      for (let i = 0; i < jp.count; i++) jp.setX(i, jp.getX(i) * 0.5);
      jib.computeVertexNormals();
      jib.rotateY(Math.PI / 2); jib.translate(0, 4.8, 1.7);
      parts.push(tint(jib, 0xf4f2ea, 0.03));
    }
    return RR.City.mergeGeoms(parts);
  }

  // a fleet = one geometry, one InstancedMesh, N hulls that bob independently
  function addFleet(geo, spots, twoSided) {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    if (twoSided) mat.side = THREE.DoubleSide;
    const im = new THREE.InstancedMesh(geo, mat, spots.length);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.castShadow = true;
    RR.Engine.scene.add(im);
    fleets.push({
      im,
      // rule 8: repeated props vary in rotation, uniform scale and phase
      units: spots.map((s) => ({ x: s[0], z: s[1], sc: s[2], yaw: rng() * Math.PI * 2, ph: rng() * 9, drift: s[3] || 0 })),
    });
  }

  SC.init = function () {
    rng = U().mulberry(20260715);
    const scene = RR.Engine.scene;
    const C = window.CHICAGO;
    const R = RR.River;
    const flat = []; // static merged geometry (docks, freighter, shorelines)

    // ---------- DuSable-style marina south of the river mouth ----------
    // moored hulls + masts are baked straight into the static mesh (they barely move at a dock)
    // Chicago's harbour docks are FLOATING docks — they ride the water, they do not stand in it.
    // Baked at a fixed y they were fine under the old 1 m lake, but the real swell now swings
    // +/-1.1 m at the outer finger and washed the deck over. Collected separately and heaved.
    const mx = 2080, mz = 430;
    const marina = [];
    const hullCols = [0x2b4a6b, 0x6b2b2b, 0x35393e, 0xdfe0e2, 0x3a5a45, 0x8a3a2a];
    for (let d = 0; d < 3; d++) {
      const dz = mz + d * 46;
      const dock = new THREE.BoxGeometry(150, 0.6, 4);
      dock.translate(mx + 40, 0.5, dz);
      marina.push(tint(dock, 0x8a7c62, 0.08));
      for (let k = 0; k < 8; k++) {
        const bx = mx - 30 + k * 18, side = (k % 2) ? 1 : -1, bz = dz + side * 5;
        // rule 8: rotation, uniform scale and hue all vary, or eight identical hulls in a row
        // read as a texture rather than a marina
        const sc = 0.88 + rng() * 0.26;
        const yaw = (side > 0 ? 0 : Math.PI) + (rng() - 0.5) * 0.22;
        const hull = new THREE.BoxGeometry(6.5 * sc, 1.1 * sc, 2.3 * sc);
        const hp = hull.attributes.position;
        for (let i = 0; i < hp.count; i++) { if (Math.abs(hp.getX(i)) > 2.4 * sc) hp.setZ(i, hp.getZ(i) * 0.35); }
        hull.computeVertexNormals();
        hull.rotateY(yaw);
        hull.translate(bx, 0.55 * sc, bz);
        marina.push(tint(hull, hullCols[(k + d) % hullCols.length], 0.14));
        const cabin = new THREE.BoxGeometry(2.0 * sc, 0.8 * sc, 1.6 * sc);
        cabin.rotateY(yaw); cabin.translate(bx - 0.5 * sc, 1.4 * sc, bz);
        marina.push(tint(cabin, 0xe8e4d8, 0.10));
        const mast = new THREE.CylinderGeometry(0.1 * sc, 0.12 * sc, 10 * sc, 5);
        mast.translate(bx, 5.5 * sc, bz); marina.push(tint(mast, 0xcfcabc, 0));
      }
    }
    const spine = new THREE.BoxGeometry(4, 0.6, 150);
    spine.translate(mx - 34, 0.5, mz + 46);
    marina.push(tint(spine, 0x8a7c62, 0.08));

    // ---------- sailboats under way, scattered across the open basin ----------
    // three hull colours → three instanced fleets, so ten boats cost three draw calls
    const fleetSpots = [
      [[2500, 620, 1, 1], [3350, 250, 1.2, 1], [2650, 950, 1, 1], [2400, 1250, 0.9, 1]],
      [[2850, 300, 1.1, 1], [3050, 780, 0.9, 1], [3550, 500, 1, 1]],
      [[3200, -150, 1.1, 1], [2950, 1120, 0.95, 1], [3700, -250, 1.15, 1]],
    ];
    const fleetHulls = [0xdfe6ea, 0x9fb8c8, 0xe8d9b0];
    for (let i = 0; i < fleetSpots.length; i++) addFleet(sailboatGeom(fleetHulls[i], true), fleetSpots[i], true);

    // ---------- harbor nav buoys (bob, tiny beacon) ----------
    function buoyGeom(red) {
      const body = new THREE.CylinderGeometry(0.6, 0.85, 1.7, 8);
      body.translate(0, 0.85, 0);
      const mast = new THREE.CylinderGeometry(0.1, 0.1, 1.3, 5);
      mast.translate(0, 2.1, 0);
      return RR.City.mergeGeoms([tint(body, red ? 0xd23b2c : 0x2ea043, 0.08), tint(mast, 0x2a2f36, 0)]);
    }
    addFleet(buoyGeom(true), [[2160, -30, 1], [3260, -70, 1], [2760, 700, 1]]);
    addFleet(buoyGeom(false), [[2160, 120, 1], [3180, 40, 1]]);

    // ---------- lake freighter far out to the ESE ----------
    {
      const fx = 4150, fz = 640, fg = new THREE.Group();
      const hull = new THREE.BoxGeometry(26, 9, 130);
      const hp = hull.attributes.position;
      for (let i = 0; i < hp.count; i++) { const z = hp.getZ(i); if (z < -55) hp.setX(i, hp.getX(i) * 0.4); }
      hull.computeVertexNormals();
      hull.translate(0, 2.5, 0); tint(hull, 0x3b2f2a, 0.05);
      const house = new THREE.BoxGeometry(22, 14, 24); house.translate(0, 14, -46); tint(house, 0xdad6cc, 0.05);
      const bridge = new THREE.BoxGeometry(23, 2.2, 8); bridge.translate(0, 20, -40); tint(bridge, 0x2c3a44, 0);
      const funnel = new THREE.CylinderGeometry(3, 3.4, 9, 8); funnel.translate(0, 24, -50); tint(funnel, 0x8a3b2c, 0);
      const fband = new THREE.CylinderGeometry(3.2, 3.4, 1.6, 8); fband.translate(0, 27, -50); tint(fband, 0x1f242a, 0);
      const deck = new THREE.BoxGeometry(24, 1.5, 96); deck.translate(0, 7.4, 8); tint(deck, 0x5a5048, 0.05);
      const parts = [hull, house, bridge, funnel, fband, deck];
      for (let k = 0; k < 4; k++) {                  // self-unloader gantries down the spar deck
        const g = new THREE.BoxGeometry(3.2, 5.5, 3.2); g.translate(0, 10, -12 + k * 22);
        parts.push(tint(g, 0x8d8272, 0.08));
      }
      for (const g of parts) { g.rotateY(0.5); g.translate(fx, 0, fz); flat.push(g); }
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
        const rot = (rng() - 0.5) * 0.5;                        // no two of them square to the grid
        const hue = [0x8793a0, 0x9a9382, 0x76828c, 0xb0a798][i % 4];
        const g = new THREE.BoxGeometry(w, h, d); g.rotateY(rot); g.translate(bx, h / 2, bz);
        tint(g, hue, 0.14);
        flat.push(g);
        // even a far-shore silhouette gets a cornice — a bare top face is what makes the
        // distant shore read as a paper cut-out
        const cap = new THREE.BoxGeometry(w + 1.6, 1.1, d + 1.6);
        cap.rotateY(rot); cap.translate(bx, h + 0.3, bz);
        tint(cap, hue, 0.10);
        flat.push(cap);
        if (h > 45) {
          const pent = new THREE.BoxGeometry(w * 0.4, 4.5, d * 0.4);
          pent.rotateY(rot); pent.translate(bx, h + 3.1, bz);
          tint(pent, 0x6b7178, 0.08);
          flat.push(pent);
        }
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

    // one merged mesh, heaved and tilted as a raft by the update below
    const marinaMesh = new THREE.Mesh(RR.City.mergeGeoms(marina), RR.City.flatMaterial());
    marinaMesh.castShadow = true; marinaMesh.receiveShadow = true;
    marinaMesh.geometry.translate(-(mx + 40), 0, -(mz + 46));      // pivot at the basin centre
    marinaMesh.position.set(mx + 40, 0, mz + 46);
    scene.add(marinaMesh);

    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
    const _p = new THREE.Vector3(), _s = new THREE.Vector3();
    const _mw = {};
    RR.Engine.onUpdate((dt, t) => {
      // the marina rides the swell as one raft: heave from the basin centre, tilt from its slope
      U().waterNormalPitchRoll(mx + 40, mz + 46, t, R.waveAmp(mx + 40, mz + 46), _mw);
      marinaMesh.position.y = _mw.h;
      marinaMesh.rotation.set(-_mw.pitch * 0.6, 0, _mw.roll * 0.6);

      for (const f of fleets) {
        for (let i = 0; i < f.units.length; i++) {
          const b = f.units[i];
          const amp = R.waveAmp(b.x, b.z);
          if (b.drift) b.yaw += Math.sin(t * 0.2 + b.ph) * 0.0015;
          _p.set(b.x, U().waterHeight(b.x, b.z, t, amp), b.z);
          _e.set(Math.cos(t * 0.7 + b.ph) * 0.05 * amp, b.yaw, Math.sin(t * 0.9 + b.ph) * 0.06 * amp, 'YXZ');
          _q.setFromEuler(_e);
          _s.set(b.sc, b.sc, b.sc);
          _m.compose(_p, _q, _s);
          f.im.setMatrixAt(i, _m);
        }
        f.im.instanceMatrix.needsUpdate = true;
      }
    });
  };

  RR.Scenery = SC;
})();

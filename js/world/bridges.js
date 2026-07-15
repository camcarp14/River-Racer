/* River Racer — Chicago's movable bridges: bascule leaves, cream tender houses,
   baluster railings, ornate lamps, sidewalks, and a readable name sign on each span. */
(function () {
  const B = {};
  const U = () => RR.U;
  let rng;

  const RED = 0x7a3428;          // Chicago bascule oxide
  const RED_DK = 0x5e2820;
  const CONC = 0x9a968c;
  const STONE = 0xd7ccae;        // limestone tender house
  const STONE_DK = 0xb3a988;
  const ROOF = 0x3f5a3a;         // verdigris green roof

  // ---- readable street-name sign atlas (one texture for all bridges) ----
  function displayName(n) {
    if (n.indexOf('Michigan') >= 0) return 'MICHIGAN AVE';
    return n.replace(/\s*\(.*\)\s*/g, '').replace(/–/g, '-').replace(/\//g, ' ')
            .replace(/\s+/g, ' ').trim().toUpperCase();
  }
  function buildSignAtlas(bridges) {
    const N = bridges.length, cols = 2, rows = Math.ceil(N / cols);
    const cw = 512, ch = 128, cvW = cols * cw, cvH = rows * ch;
    const tex = U().canvasTexture(cvW, cvH, (ctx) => {
      ctx.clearRect(0, 0, cvW, cvH);
      bridges.forEach((b, i) => {
        const col = i % cols, row = (i / cols) | 0, x0 = col * cw, y0 = row * ch;
        ctx.fillStyle = '#0e3a2c'; ctx.fillRect(x0 + 8, y0 + 16, cw - 16, ch - 32);
        ctx.strokeStyle = '#eff4f1'; ctx.lineWidth = 5; ctx.strokeRect(x0 + 15, y0 + 23, cw - 30, ch - 46);
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const name = displayName(b.name);
        let fs = 60; ctx.font = 'bold ' + fs + 'px Arial, sans-serif';
        while (ctx.measureText(name).width > cw - 64 && fs > 20) { fs -= 3; ctx.font = 'bold ' + fs + 'px Arial, sans-serif'; }
        ctx.fillText(name, x0 + cw / 2, y0 + ch / 2 + 2);
      });
    });
    tex.anisotropy = 8;
    function cell(i) {
      const col = i % cols, row = (i / cols) | 0, x0 = col * cw, y0 = row * ch;
      return { u0: x0 / cvW, u1: (x0 + cw) / cvW, vTop: 1 - y0 / cvH, vBot: 1 - (y0 + ch) / cvH };
    }
    return { tex, cell };
  }

  function signQuad(S, cx, y, cz, nx, nz, w, h, c) {
    const rx = nz, rz = -nx, hw = w / 2, hh = h / 2, base = S.sv.length / 3;
    const corners = [
      [cx - rx * hw, y + hh, cz - rz * hw], [cx + rx * hw, y + hh, cz + rz * hw],
      [cx + rx * hw, y - hh, cz + rz * hw], [cx - rx * hw, y - hh, cz - rz * hw],
    ];
    for (const p of corners) S.sv.push(p[0], p[1], p[2]);
    S.suv.push(c.u0, c.vTop, c.u1, c.vTop, c.u1, c.vBot, c.u0, c.vBot);
    S.sidx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  function addPierObstacles(cx, cz, tx, tz, half) {
    RR.River.addObstacle(cx - tz * (half + 2.2), cz + tx * (half + 2.2), 3.4);
    RR.River.addObstacle(cx + tz * (half + 2.2), cz - tx * (half + 2.2), 3.4);
  }

  function build(bridge, idx, S) {
    const path = RR.River.paths[bridge.branch];
    if (!path) return;
    const q = U().pathNearest(path, bridge.x, bridge.z);
    const cx = q.x, cz = q.z, tx = q.tx, tz = q.tz;
    const half = q.w;
    const ang = Math.atan2(-tx, -tz);        // box x-axis spans the channel
    const span = half * 2 + 14;
    const cl = bridge.clearance;
    const geoms = S.geoms;
    const cellUV = S.atlas.cell(idx);

    function cross(w, h, len, ox, oy, c, jit) {
      const g = new THREE.BoxGeometry(len, h, w);
      g.rotateY(ang); g.translate(cx + tx * ox, oy, cz + tz * ox);
      RR.City.tintGeom(g, c, jit == null ? 0.06 : jit, rng); geoms.push(g);
    }
    // place a box at an arbitrary (along, across) offset from the bridge center
    function at(w, h, d, alongOff, acrossOff, oy, c, rotToSpan) {
      const g = new THREE.BoxGeometry(w, h, d);
      if (rotToSpan) g.rotateY(ang);
      g.translate(cx + tx * alongOff - tz * acrossOff, oy, cz + tz * alongOff + tx * acrossOff);
      RR.City.tintGeom(g, c, 0.05, rng); geoms.push(g);
    }
    function cylAt(r, h, alongOff, acrossOff, oy, c, seg) {
      const g = new THREE.CylinderGeometry(r, r * 1.12, h, seg || 6);
      g.translate(cx + tx * alongOff - tz * acrossOff, oy, cz + tz * alongOff + tx * acrossOff);
      RR.City.tintGeom(g, c, 0, rng); geoms.push(g);
    }
    function tenderHouse(alongOff, acrossOff) {
      const oy = cl + 0.4;
      at(5.2, 1.2, 5.2, alongOff, acrossOff, oy + 0.6, STONE_DK, true);   // stone base
      at(4.6, 5.2, 4.6, alongOff, acrossOff, oy + 3.8, STONE, true);      // limestone body
      // window bands (darker inset)
      at(4.7, 1.4, 0.2, alongOff, acrossOff - 2.35, oy + 4.2, 0x394049, true);
      at(0.2, 1.4, 4.7, alongOff - 2.35, acrossOff, oy + 4.2, 0x394049, true);
      // green pyramidal roof + finial
      const roof = new THREE.ConeGeometry(3.7, 2.8, 4);
      roof.rotateY(ang + Math.PI / 4);
      roof.translate(cx + tx * alongOff - tz * acrossOff, oy + 7.8, cz + tz * alongOff + tx * acrossOff);
      RR.City.tintGeom(roof, ROOF, 0, rng); geoms.push(roof);
      cylAt(0.12, 1.4, alongOff, acrossOff, oy + 9.6, 0xd9c98a, 6);
    }
    function bridgeLamp(alongOff, acrossOff) {
      cylAt(0.16, 4.2, alongOff, acrossOff, cl + 2.0 + 2.1, 0x20242a, 6);
      for (const d of [-1, 1]) {
        const gx = cx + tx * alongOff - tz * acrossOff;
        const gz = cz + tz * alongOff + tx * acrossOff;
        const globe = new THREE.SphereGeometry(0.34, 6, 5);
        globe.translate(gx + tx * d * 0.55, cl + 5.6, gz + tz * d * 0.55);
        RR.City.tintGeom(globe, 0xffe6b0, 0, rng); geoms.push(globe);
      }
    }
    function addSigns(y) {
      const w = Math.min(2 * half * 0.62, 13), h = w / 5.2;
      signQuad(S, cx - tx * 7.2, y, cz - tz * 7.2, -tx, -tz, w, h, cellUV);   // faces upstream
      signQuad(S, cx + tx * 7.2, y, cz + tz * 7.2, tx, tz, w, h, cellUV);     // faces downstream
    }

    // abutment piers on both banks (all bridge kinds)
    for (const s of [-1, 1]) {
      const px = cx - tz * (half + 2.2) * s, pz = cz + tx * (half + 2.2) * s;
      const g = new THREE.BoxGeometry(9, cl + 2.5, 8);
      g.rotateY(ang); g.translate(px, (cl + 2.5) / 2 - 0.5, pz);
      RR.City.tintGeom(g, CONC, 0.08, rng); geoms.push(g);
    }

    if (bridge.kind === 'railraised') {
      const leafLen = half * 2 + 6;
      const leaf = new THREE.BoxGeometry(6, 2.2, leafLen);
      leaf.translate(0, 0, leafLen / 2);
      leaf.rotateX(-1.25);
      leaf.rotateY(Math.atan2(tz, -tx));
      const hx = cx - tz * (half + 2), hz = cz + tx * (half + 2);
      leaf.translate(hx, 3, hz);
      RR.City.tintGeom(leaf, 0x555a5e, 0.08, rng); geoms.push(leaf);
      cylAt(2.6, 22, 0, half + 5, 11, 0x555a5e, 4);       // counterweight tower
      at(7, 4, 7, 0, half + 5, 24, 0x4a4e52, true);
      addSigns(cl > 50 ? 12 : cl + 3.0);
      addPierObstacles(cx, cz, tx, tz, half);
      return;
    }

    // ---- roadway deck + sidewalks ----
    const deckW = bridge.kind === 'deck' ? 22 : 13;
    cross(deckW, 1.6, span, 0, cl + 0.8, bridge.kind === 'deck' ? CONC : RED);
    for (const s of [-1, 1]) {                            // raised sidewalks
      cross(2.2, 0.4, span, s * (deckW / 2 - 1.1), cl + 1.8, 0x8a8880, 0.05);
    }
    // side girders
    for (const s of [-1, 1]) cross(1.1, 2.6, span, s * (deckW / 2 - 0.4), cl + 1.5, RED_DK);
    // counterweights hanging under the leading edges at each pier
    if (bridge.kind !== 'deck') {
      for (const s of [-1, 1]) at(5, 3, 8, 0, s * (half + 1.5), cl - 1.2, RED_DK, true);
    }

    // ---- balustrade railing: low wall + top rail + sparse posts ----
    for (const s of [-1, 1]) {
      const acr = deckW / 2 + 0.1;
      cross(0.3, 0.95, span, s * acr, cl + 2.4, RED);         // low wall
      cross(0.45, 0.18, span, s * acr, cl + 3.0, 0xcbb59a);   // pale top rail
      for (let k = -half - 4; k <= half + 4; k += 4.5) {      // balusters
        cylAt(0.13, 1.05, k, acr * s, cl + 2.4, RED_DK, 4);
      }
    }

    // bascule center seam hump
    if (bridge.kind !== 'deck') cross(deckW + 0.5, 1.2, 6, 0, cl + 2.2, RED_DK);

    // corner lamps
    for (const so of [-1, 1]) for (const ao of [-1, 1]) bridgeLamp(ao * (half + 1.5), so * (deckW / 2 + 0.6));

    if (bridge.kind === 'l') {
      // Wells/Lake double-deck: L rapid-transit truss overhead
      cross(11, 1.4, span, 0, cl + 7.6, 0x4a4e52);
      for (const s of [-1, 1]) {
        cross(0.9, 6.0, span, s * 5.4, cl + 4.6, RED_DK);
        for (let k = -half; k <= half; k += 6) cylAt(0.3, 6.0, k, s * 5.4, cl + 4.6, RED_DK, 4);
        cross(0.5, 0.5, span, s * 5.4, cl + 7.5, 0x3a3f45);
      }
      addSigns(cl + 3.4);
    } else if (bridge.kind === 'deck') {
      // Lake Shore Drive: steel through-truss
      for (const s of [-1, 1]) cross(1.2, 7, span, s * 9.5, cl + 5.4, 0x6a7076);
      cross(20, 1.2, 8, 0, cl + 9.2, 0x6a7076);
      for (let k = -half; k <= half; k += 8) for (const s of [-1, 1]) cylAt(0.35, 7, k, s * 9.5, cl + 5.4, 0x5a6066, 4);
      addSigns(cl + 3.6);
    } else {
      // bascule tender houses
      const houses = bridge.kind === 'bascule2' ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : [[-1, -1], [1, 1]];
      for (const [a, b2] of houses) tenderHouse(a * 8.5, b2 * (half + 3.6));
      addSigns(cl + 3.3);
    }

    addPierObstacles(cx, cz, tx, tz, half);
  }

  B.init = function () {
    rng = U().mulberry(4242);
    const bridges = window.CHICAGO.bridges;
    const S = { geoms: [], sv: [], suv: [], sidx: [], atlas: buildSignAtlas(bridges) };
    bridges.forEach((b, i) => build(b, i, S));

    const mesh = new THREE.Mesh(RR.City.mergeGeoms(S.geoms), RR.City.flatMaterial());
    mesh.castShadow = true; mesh.receiveShadow = true;
    RR.Engine.scene.add(mesh);

    if (S.sv.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(S.sv), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(S.suv), 2));
      g.setIndex(S.sidx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: S.atlas.tex, side: THREE.DoubleSide }));
      m.renderOrder = 1;
      RR.Engine.scene.add(m);
    }
  };

  RR.Bridges = B;
})();

/* River Racer — Chicago's movable bridges. The Chicago-type bascule (fixed-trunnion,
   double-leaf) was invented here and there are ~37 of them, more than any city on earth, so
   these are the most-seen objects in the game: riveted lattice fascia girders, trunnions and
   counterweight housings, cream tender houses with verdigris copper roofs, balustrades carrying
   the municipal Y, and a street-name blade on every span.
   CDOT really does raise the whole Loop sequence in a west→east wave twice a year for the
   sailboat runs; the animated leaves reproduce that wave rather than opening at random. */
(function () {
  const B = { openings: [], tags: [] };
  const U = () => RR.U;
  let rng;
  // the Loop sequence CDOT lifts in a wave — six consecutive Main Stem bascules
  const ANIMATED = { 'LaSalle St': 1, 'Clark St': 1, 'Dearborn St': 1, 'State St': 1, 'Wabash Ave': 1, 'Columbus Dr': 1 };
  let animLeaves = [];
  let decks = [];      // {x, z, cl} snapped deck positions, so the chase cam can duck under them

  // lowest bridge deck within range of (x,z), or Infinity if none near
  B.duckY = function (x, z) {
    let best = Infinity;
    for (let i = 0; i < decks.length; i++) {
      const d = decks[i], dx = x - d.x, dz = z - d.z;
      if (dx * dx + dz * dz < 3200 && d.cl < best) best = d.cl;   // within ~57m
    }
    return best;
  };

  const RED = 0x7a3428;          // Chicago bascule oxide — already correct, leave it
  const RED_DK = 0x5e2820;
  const RED_LT = 0x8f4a3a;
  const STEEL = 0x4e5a5e;        // through-truss / structural steel
  const CONC = 0x9a968c;
  const STONE = 0xd7ccae;        // limestone tender house
  const STONE_DK = 0xb3a988;
  const ROOF = 0x5e8f72;         // real copper patina is bluer/greener than the old olive

  // ---- readable sign atlas (one texture for every blade, plaque and rail panel) ----
  function displayName(n) {
    if (n.indexOf('Michigan') >= 0) return 'DUSABLE BRIDGE';           // Michigan Ave's official name
    if (n.indexOf('Lake Shore') >= 0) return 'DUSABLE LAKE SHORE DR';  // renamed in 2021
    if (n.indexOf('Franklin') >= 0) return 'FRANKLIN ST';              // ORLEANS ST on the north side
    if (n.indexOf('Ida B') >= 0) return 'IDA B. WELLS DR';
    return n.replace(/\s*\(.*\)\s*/g, '').replace(/–/g, '-').replace(/\//g, ' ')
            .replace(/\s+/g, ' ').trim().toUpperCase();
  }

  // extra atlas cells appended after the per-bridge blades
  const EX_ORLEANS = 0, EX_MUSEUM = 1, EX_BEARS = 2, EX_Y = 3, EX_N = 4;

  function buildSignAtlas(bridges) {
    const N = bridges.length + EX_N, cols = 2, rows = Math.ceil(N / cols);
    const cw = 512, ch = 128, cvW = cols * cw, cvH = rows * ch;
    const org = (i) => ({ x0: (i % cols) * cw, y0: ((i / cols) | 0) * ch });

    const tex = U().canvasTexture(cvW, cvH, (ctx) => {
      ctx.clearRect(0, 0, cvW, cvH);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

      // Chicago street blade: Highway Gothic legend + white border on municipal green
      function blade(x0, y0, name, bg) {
        ctx.fillStyle = bg || '#0f4a34'; ctx.fillRect(x0 + 8, y0 + 16, cw - 16, ch - 32);
        ctx.strokeStyle = '#eff4f1'; ctx.lineWidth = 5; ctx.strokeRect(x0 + 15, y0 + 23, cw - 30, ch - 46);
        ctx.fillStyle = '#ffffff';
        let fs = 60; ctx.font = 'bold ' + fs + 'px Arial, sans-serif';
        while (ctx.measureText(name).width > cw - 64 && fs > 20) { fs -= 3; ctx.font = 'bold ' + fs + 'px Arial, sans-serif'; }
        ctx.fillText(name, x0 + cw / 2, y0 + ch / 2 + 2);
      }
      bridges.forEach((b, i) => { const o = org(i); blade(o.x0, o.y0, displayName(b.name)); });

      const e = (k) => org(bridges.length + k);
      // the street changes its name at the river: FRANKLIN south, ORLEANS north
      { const o = e(EX_ORLEANS); blade(o.x0, o.y0, 'ORLEANS ST'); }
      // the DuSable Bridge's SW tender house really is the McCormick Bridgehouse & River Museum
      { const o = e(EX_MUSEUM);
        ctx.fillStyle = '#7a5a2e'; ctx.fillRect(o.x0 + 8, o.y0 + 16, cw - 16, ch - 32);
        ctx.strokeStyle = '#f0e6c8'; ctx.lineWidth = 4; ctx.strokeRect(o.x0 + 16, o.y0 + 24, cw - 32, ch - 48);
        ctx.fillStyle = '#f4ecd6'; ctx.font = 'bold 52px Arial, sans-serif';
        ctx.fillText('MUSEUM', o.x0 + cw / 2, o.y0 + 52);
        ctx.font = 'bold 22px Arial, sans-serif';
        ctx.fillText('McCORMICK BRIDGEHOUSE', o.x0 + cw / 2, o.y0 + 92); }
      { const o = e(EX_BEARS);
        ctx.fillStyle = '#0b162a'; ctx.fillRect(o.x0 + 8, o.y0 + 16, cw - 16, ch - 32);
        ctx.fillStyle = '#c83803'; ctx.font = 'bold 76px Arial Black, Arial, sans-serif';
        ctx.fillText('DA BEARS', o.x0 + cw / 2, o.y0 + ch / 2 + 4); }
      // The municipal device. The Y is the three branches of this river meeting at Wolf Point —
      // it is cast into hundreds of Chicago bridge rails, and for this game there is no better
      // symbol. Drawn as relief: a dark offset shadow under a lit stroke.
      { const o = e(EX_Y), sx = o.x0 + cw / 2 - 64, sy = o.y0;
        ctx.fillStyle = '#7a3428'; ctx.fillRect(o.x0, o.y0, cw, ch);
        ctx.fillStyle = '#6a2c22'; ctx.fillRect(sx + 6, sy + 6, 116, 116);
        const yArm = (ox, oy, col) => {
          ctx.strokeStyle = col; ctx.lineWidth = 15; ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(sx + 26 + ox, sy + 26 + oy); ctx.lineTo(sx + 64 + ox, sy + 66 + oy);
          ctx.lineTo(sx + 102 + ox, sy + 26 + oy);
          ctx.moveTo(sx + 64 + ox, sy + 66 + oy); ctx.lineTo(sx + 64 + ox, sy + 104 + oy);
          ctx.stroke();
        };
        yArm(3, 3, '#4a2018');
        yArm(0, 0, '#a35b46'); }
    });
    tex.anisotropy = 8;
    function cell(i) {
      const o = org(i);
      return { u0: o.x0 / cvW, u1: (o.x0 + cw) / cvW, vTop: 1 - o.y0 / cvH, vBot: 1 - (o.y0 + ch) / cvH };
    }
    function cellSquare(i) {                     // centred 128×128 region of a cell
      const o = org(i), x0 = o.x0 + cw / 2 - 64;
      return { u0: x0 / cvW, u1: (x0 + 128) / cvW, vTop: 1 - o.y0 / cvH, vBot: 1 - (o.y0 + ch) / cvH };
    }
    const extra = (k) => bridges.length + k;
    return { tex, cell, cellSquare, extra };
  }

  function signQuad(S, cx, y, cz, nx, nz, w, h, c) {
    const rx = nz, rz = -nx, hw = w / 2, hh = h / 2, base = S.sv.length / 3;
    const corners = [
      [cx - rx * hw, y + hh, cz - rz * hw], [cx + rx * hw, y + hh, cz + rz * hw],
      [cx + rx * hw, y - hh, cz + rz * hw], [cx - rx * hw, y - hh, cz - rz * hw],
    ];
    for (const p of corners) S.sv.push(p[0], p[1], p[2]);
    S.suv.push(c.u0, c.vTop, c.u1, c.vTop, c.u1, c.vBot, c.u0, c.vBot);
    S.sidx.push(base, base + 2, base + 1, base, base + 3, base + 2);   // wound so the face points along (nx,nz)
  }

  function addPierObstacles(cx, cz, tx, tz, half) {
    RR.River.addObstacle(cx - tz * (half + 2.2), cz + tx * (half + 2.2), 3.4);
    RR.River.addObstacle(cx + tz * (half + 2.2), cz - tx * (half + 2.2), 3.4);
  }

  // one-line docent facts; W7's tagLandmark(name, sub) renders these as the blade's second line
  const SUBS = {
    'Franklin–Orleans St': '1920 · DOUBLE-LEAF BASCULE · FRANKLIN SOUTH, ORLEANS NORTH',
    'Wells St': '1922 · DOUBLE-DECK · BROWN + PURPLE LINE OVER THE ROAD',
    'LaSalle St': 'MARSHALL SULOWAY BRIDGE · 1928 · DOUBLE-LEAF BASCULE',
    'Clark St': '1929 · THE EASTLAND ROLLED OVER AT THIS DOCK · 1915',
    'Dearborn St': '1963 · DOUBLE-LEAF BASCULE',
    'State St': 'BATAAN–CORREGIDOR MEMORIAL BRIDGE · 1949',
    'Wabash Ave': "IRV KUPCINET BRIDGE · 1930 · “KUP'S BRIDGE”",
    'DuSable / Michigan Ave': '1920 · DOUBLE-DECK BASCULE · FORT DEARBORN STOOD HERE',
    'Columbus Dr': '1982 · ONE OF THE LARGEST BASCULES EVER BUILT',
    'Lake Shore Dr': 'OUTER DRIVE BRIDGE · 1937 · DEDICATED BY FDR',
    'St. Charles Air Line': '1919 · LONGEST BASCULE SPAN IN THE WORLD WHEN BUILT',
    'Kinzie St rail (raised)': '1908 · LEFT PERMANENTLY RAISED SINCE 2000',
    'Kinzie St': '1909 · THE GREAT CHICAGO FLOOD STARTED HERE · 1992',
    'Lake St': '1916 · DOUBLE-DECK · GREEN + PINK LINE ABOVE',
    'Ida B. Wells Dr': '1956 · RENAMED FROM CONGRESS PKWY IN 2019',
    'Roosevelt Rd': '1927 · DOUBLE-LEAF BASCULE',
    'Washington St': '1913 · DOUBLE-LEAF BASCULE',
    'Chicago Ave': '1914 · DOUBLE-LEAF BASCULE',
    'Grand Ave': '1913 · DOUBLE-LEAF BASCULE',
  };

  function build(bridge, idx, S) {
    const path = RR.River.paths[bridge.branch];
    if (!path) return;
    const q = U().pathNearest(path, bridge.x, bridge.z);
    const cx = q.x, cz = q.z, tx = q.tx, tz = q.tz;
    const half = q.w;
    const ang = Math.atan2(-tx, -tz);        // local +x spans the channel, local +z runs along it
    const span = half * 2 + 14;
    const cl = bridge.clearance;
    // the St. Charles Air Line is a single-leaf Strauss bascule carrying a through-truss,
    // not a vertical lift; the baked data predates the correction
    const kind = bridge.name.indexOf('Air Line') >= 0 ? 'truss' : bridge.kind;
    if (kind !== 'railraised') decks.push({ x: cx, z: cz, cl });
    const geoms = S.geoms;
    const cellUV = S.atlas.cell(idx);

    if (SUBS[bridge.name]) {
      B.tags.push({ name: displayName(bridge.name), sub: SUBS[bridge.name], x: cx, z: cz, r2: 58 * 58 });
    }

    // one box placed at an arbitrary (along-river, across-channel) offset, optionally tilted in
    // the girder plane so it can serve as a truss diagonal
    function boxAA(out, aSize, h, alongSize, alongOff, acrossOff, oy, color, jit, tiltZ) {
      const g = new THREE.BoxGeometry(aSize, h, alongSize);
      if (tiltZ) g.rotateZ(tiltZ);
      g.rotateY(ang);
      g.translate(cx + tx * alongOff - tz * acrossOff, oy, cz + tz * alongOff + tx * acrossOff);
      RR.City.tintGeom(g, color, jit == null ? 0.05 : jit, rng);
      out.push(g);
    }
    const cross = (w, h, len, ox, oy, c, jit) => boxAA(geoms, len, h, w, ox, 0, oy, c, jit == null ? 0.06 : jit);
    const at = (w, h, d, alongOff, acrossOff, oy, c) => boxAA(geoms, w, h, d, alongOff, acrossOff, oy, c, 0.05);
    function cylAt(r, h, alongOff, acrossOff, oy, c, seg) {
      const g = new THREE.CylinderGeometry(r, r * 1.12, h, seg || 6);
      g.translate(cx + tx * alongOff - tz * acrossOff, oy, cz + tz * alongOff + tx * acrossOff);
      RR.City.tintGeom(g, c, 0, rng); geoms.push(g);
    }
    // a cylinder lying along the river axis — the trunnion the whole leaf turns on
    function trunnion(len, r, alongOff, acrossOff, oy, c) {
      const g = new THREE.CylinderGeometry(r, r, len, 8);
      g.rotateX(Math.PI / 2); g.rotateY(ang);
      g.translate(cx + tx * alongOff - tz * acrossOff, oy, cz + tz * alongOff + tx * acrossOff);
      RR.City.tintGeom(g, c, 0, rng); geoms.push(g);
    }

    // A riveted lattice fascia girder. This is the single detail that stops a bascule reading
    // as a red slab: chords top and bottom, a Warren web between them, seen edge-on from the
    // water every few seconds.
    function lattice(out, acrossC, acrossLen, alongOff, yBot, yTop, col, jit) {
      const chord = 0.5, th = 1.05;
      boxAA(out, acrossLen, chord, th, alongOff, acrossC, yTop - chord / 2, col, jit);
      boxAA(out, acrossLen, chord, th, alongOff, acrossC, yBot + chord / 2, col, jit);
      const webLo = yBot + chord, webHi = yTop - chord, webH = webHi - webLo;
      if (webH < 0.35) return;
      const bays = Math.max(3, Math.min(14, Math.round(acrossLen / 6)));
      const bw = acrossLen / bays;
      const diagLen = Math.hypot(bw, webH), tilt = Math.atan2(webH, bw);
      for (let i = 0; i < bays; i++) {
        const c0 = acrossC - acrossLen / 2 + (i + 0.5) * bw;
        boxAA(out, diagLen, 0.26, 0.86, alongOff, c0, (webLo + webHi) / 2, col, 0.03, (i & 1) ? tilt : -tilt);
        if ((i & 1) === 0) boxAA(out, 0.28, webH, 0.86, alongOff, c0 - bw / 2, (webLo + webHi) / 2, col, 0.03);
      }
    }

    // the municipal Y, cast into the balustrade every 4.5 m — free geometry, it rides the
    // existing sign atlas
    function yPanels(SS, acrossC, acrossLen, alongOff, oy, faceOut) {
      const uv = S.atlas.cellSquare(S.atlas.extra(EX_Y));
      const n = Math.max(1, Math.floor(acrossLen / 4.5));
      for (let i = 0; i < n; i++) {
        const c0 = acrossC - acrossLen / 2 + (i + 0.5) * (acrossLen / n);
        const nx = faceOut * tx, nz = faceOut * tz;
        const px = cx + tx * alongOff - tz * c0 + nx * 0.02;
        const pz = cz + tz * alongOff + tx * c0 + nz * 0.02;
        signQuad(SS, px, oy, pz, nx, nz, 0.9, 0.9, uv);
      }
    }

    function tenderHouse(alongOff, acrossOff, plaque) {
      const oy = cl + 0.4;
      at(5.2, 1.2, 5.2, alongOff, acrossOff, oy + 0.6, STONE_DK);         // stone base
      at(4.6, 5.2, 4.6, alongOff, acrossOff, oy + 3.8, STONE);            // limestone body
      at(4.9, 0.35, 4.9, alongOff, acrossOff, oy + 6.6, STONE_DK);        // cornice
      // window bands (darker inset)
      at(4.7, 1.4, 0.2, alongOff, acrossOff - 2.35, oy + 4.2, 0x394049);
      at(0.2, 1.4, 4.7, alongOff - 2.35, acrossOff, oy + 4.2, 0x394049);
      // verdigris copper pyramidal roof + finial
      const roof = new THREE.ConeGeometry(3.7, 2.8, 4);
      roof.rotateY(ang + Math.PI / 4);
      roof.translate(cx + tx * alongOff - tz * acrossOff, oy + 7.8, cz + tz * alongOff + tx * acrossOff);
      RR.City.tintGeom(roof, ROOF, 0, rng); geoms.push(roof);
      cylAt(0.12, 1.4, alongOff, acrossOff, oy + 9.6, 0xd9c98a, 6);
      if (plaque != null) {
        const faceOut = alongOff < 0 ? -1 : 1;
        const nx = faceOut * tx, nz = faceOut * tz;
        const px = cx + tx * (alongOff + faceOut * 2.45) - tz * acrossOff;
        const pz = cz + tz * (alongOff + faceOut * 2.45) + tx * acrossOff;
        signQuad(S, px, oy + 2.4, pz, nx, nz, 4.0, 1.02, S.atlas.cell(S.atlas.extra(plaque)));
      }
    }
    function bridgeLamp(alongOff, acrossOff) {
      cylAt(0.16, 4.2, alongOff, acrossOff, cl + 2.0 + 2.1, 0x20242a, 6);
      for (const d of [-1, 1]) {
        const gx = cx + tx * alongOff - tz * acrossOff;
        const gz = cz + tz * alongOff + tx * acrossOff;
        const globe = new THREE.SphereGeometry(0.34, 6, 5);
        globe.translate(gx + tx * d * 0.55, cl + 5.6, gz + tz * d * 0.55);
        RR.City.tintGeom(globe, 0xffe6b0, 0, rng); geoms.push(globe);
        if (RR.Theme) RR.Theme.addLamp(gx + tx * d * 0.55, cl + 5.6, gz + tz * d * 0.55, 0xffe6b0);
      }
    }
    // street-name signs mounted over the deck: a dark backing plate merged into the bridge
    // geometry with a single-sided textured plate just in front of it, one facing each way —
    // so the name reads correctly from both approaches and never shows mirrored text.
    // Franklin–Orleans gets two different names: the street renames itself at the river.
    function addSigns(y) {
      const dual = bridge.name.indexOf('Franklin') >= 0;
      const w = dual ? Math.min(half * 0.78, 9) : Math.min(2 * half * 0.62, 13), h = w / 5.2;
      // FRANKLIN ST on the south half, ORLEANS ST on the north — the street really does rename
      // itself as it crosses the river
      const slots = dual
        ? [[half * 0.44, cellUV], [-half * 0.44, S.atlas.cell(S.atlas.extra(EX_ORLEANS))]]
        : [[0, cellUV]];
      for (const sl of slots) {
        const acr = sl[0], uv = sl[1];
        at(w + 0.5, h + 0.5, 0.18, -6.8, acr, y, 0x18251f);
        at(w + 0.5, h + 0.5, 0.18, 6.8, acr, y, 0x18251f);
        for (const f of [-1, 1]) {                                    // one plate facing each way
          const ao = f * 6.95;
          signQuad(S, cx + tx * ao - tz * acr, y, cz + tz * ao + tx * acr, f * tx, f * tz, w, h, uv);
        }
      }
    }

    // abutment piers on both banks (all bridge kinds)
    for (const s of [-1, 1]) {
      const px = cx - tz * (half + 2.2) * s, pz = cz + tx * (half + 2.2) * s;
      const g = new THREE.BoxGeometry(9, cl + 2.5, 8);
      g.rotateY(ang); g.translate(px, (cl + 2.5) / 2 - 0.5, pz);
      RR.City.tintGeom(g, CONC, 0.08, rng); geoms.push(g);
      // a lighter cap course so the pier is not one flat tone from the water
      at(9.4, 0.5, 8.4, 0, s * (half + 2.2), cl + 2.0, 0xb4b0a5);
    }

    if (kind === 'railraised') {
      const leafLen = half * 2 + 6;
      const leaf = new THREE.BoxGeometry(6, 2.2, leafLen);
      leaf.translate(0, 0, leafLen / 2);
      leaf.rotateX(-1.25);
      leaf.rotateY(Math.atan2(tz, -tx));
      const hx = cx - tz * (half + 2), hz = cz + tx * (half + 2);
      leaf.translate(hx, 3, hz);
      RR.City.tintGeom(leaf, 0x555a5e, 0.08, rng); geoms.push(leaf);
      cylAt(2.6, 22, 0, half + 5, 11, 0x555a5e, 4);       // counterweight tower
      at(7, 4, 7, 0, half + 5, 24, 0x4a4e52);
      at(7.6, 0.5, 7.6, 0, half + 5, 26.2, 0x5c6166);     // no bare box tops
      // name plates on the counterweight tower — never floating over the permanently-raised gap
      { const tw = Math.min(2 * half * 0.5, 8), th = tw / 5.2, tacr = half + 5;
        signQuad(S, cx - tz * tacr, 13, cz + tx * tacr, -tx, -tz, tw, th, cellUV);
        signQuad(S, cx - tz * tacr, 13, cz + tx * tacr, tx, tz, tw, th, cellUV); }
      addPierObstacles(cx, cz, tx, tz, half);
      return;
    }

    // ---- roadway deck + sidewalks ----
    const deckW = kind === 'deck' ? 22 : 13;
    const anim = (kind === 'bascule' || kind === 'bascule2') && ANIMATED[bridge.name];

    // each half of the deck as a leaf that pivots up at its bank (bascule bridge opening)
    function buildLeaf(s, opening) {
      const parts = [];
      const gap = 0.15, acrossLen = half - gap, cAcross = ((gap + half) / 2) * s;   // leaves all but touch when closed
      const piece = (aSize, h, alongSize, alongC, oy, color, jit) =>
        boxAA(parts, aSize, h, alongSize, alongC, cAcross, oy, color, jit == null ? 0.05 : jit);
      piece(acrossLen, 1.4, deckW, 0, cl + 0.8, RED);
      piece(acrossLen, 0.4, 2.2, deckW / 2 - 1.1, cl + 1.8, 0x8a8880);
      piece(acrossLen, 0.4, 2.2, -(deckW / 2 - 1.1), cl + 1.8, 0x8a8880);
      const SL = { sv: [], suv: [], sidx: [] };
      for (const so of [-1, 1]) {
        lattice(parts, cAcross, acrossLen, so * (deckW / 2 - 0.4), cl + 0.35, cl + 2.7, RED_DK, 0.05);
        piece(acrossLen, 1.10, 0.3, so * (deckW / 2 + 0.1), cl + 2.5, RED);          // balustrade
        piece(acrossLen, 0.16, 0.46, so * (deckW / 2 + 0.1), cl + 3.13, 0xcbb59a);   // cap rail
        yPanels(SL, cAcross, acrossLen, so * (deckW / 2 + 0.27), cl + 2.5, so);
      }
      // each leaf carries its own name sign (upstream face on one leaf, downstream on the
      // other) so the sign pivots up WITH the deck when the bridge opens
      const sw = Math.min(acrossLen * 0.9, 11), sh = sw / 5.2, sy = cl + 3.9;
      const sAlong = s === 1 ? -6.8 : 6.8;
      const snx = s === 1 ? -tx : tx, snz = s === 1 ? -tz : tz;
      const leafUV = (s === -1 && bridge.name.indexOf('Franklin') >= 0)
        ? S.atlas.cell(S.atlas.extra(EX_ORLEANS)) : cellUV;
      piece(sw + 0.4, sh + 0.4, 0.18, sAlong, sy, RED_DK);
      const geo = RR.City.mergeGeoms(parts);
      const px = cx - tz * half * s, py = cl + 0.8, pz = cz + tx * half * s;
      geo.translate(-px, -py, -pz);
      const mesh = new THREE.Mesh(geo, RR.City.flatMaterial());
      mesh.castShadow = true;
      const hinge = new THREE.Group();
      hinge.position.set(px, py, pz);
      hinge.add(mesh);
      signQuad(SL, cx + tx * sAlong + snx * 0.14 - tz * cAcross, sy, cz + tz * sAlong + snz * 0.14 + tx * cAcross, snx, snz, sw, sh, leafUV);
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SL.sv), 3));
      sg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(SL.suv), 2));
      sg.setIndex(SL.sidx);
      sg.translate(-px, -py, -pz);
      hinge.add(new THREE.Mesh(sg, S.signMat));
      RR.Engine.scene.add(hinge);
      animLeaves.push({ hinge, axis: new THREE.Vector3(tx, 0, tz).normalize(), s, phase: S.phase, opening });
    }

    if (anim) {
      const opening = { x: cx, z: cz, open: 0, rising: false };   // polled by main.js for the drawbridge horn
      B.openings.push(opening);
      buildLeaf(1, opening); buildLeaf(-1, null);
    } else if (kind === 'truss') {
      // single-leaf Strauss heel-trunnion bascule carrying a 79 m through-truss
      cross(deckW, 1.5, span, 0, cl + 0.8, STEEL);
      for (const so of [-1, 1]) {
        lattice(geoms, 0, span, so * (deckW / 2 - 0.5), cl + 0.1, cl + 1.6, STEEL, 0.05);
        const chordY = cl + 8.4;
        cross(0.7, 0.7, span, so * (deckW / 2 - 0.5), chordY, STEEL);                 // top chord
        const bays = 8, bw = span / bays, webH = chordY - (cl + 1.6);
        const diagLen = Math.hypot(bw, webH), tilt = Math.atan2(webH, bw);
        for (let i = 0; i < bays; i++) {
          const c0 = -span / 2 + (i + 0.5) * bw;
          boxAA(geoms, diagLen, 0.34, 0.7, so * (deckW / 2 - 0.5), c0, cl + 1.6 + webH / 2, STEEL, 0.03, (i & 1) ? tilt : -tilt);
          boxAA(geoms, 0.42, webH, 0.7, so * (deckW / 2 - 0.5), c0 - bw / 2, cl + 1.6 + webH / 2, STEEL, 0.03);
        }
        for (let i = 0; i <= 4; i++) {   // portal bracing across the top
          const c0 = -span / 2 + i * (span / 4);
          if (so === 1) boxAA(geoms, 0.5, 0.5, deckW - 0.6, 0, c0, chordY + 0.4, STEEL, 0.03);
        }
      }
      // the heel trunnion + counterweight on the south bank
      trunnion(deckW + 1.4, 0.85, 0, half + 1.0, cl + 0.6, 0x3a4046);
      at(6.5, 6.0, deckW - 1, 0, half + 5.2, cl - 1.4, 0x44494e);
      at(7.1, 0.5, deckW - 0.4, 0, half + 5.2, cl + 1.9, 0x565c62);
      addSigns(cl + 5.2);
    } else {
      cross(deckW, 1.6, span, 0, cl + 0.8, kind === 'deck' ? CONC : RED);
      for (const s of [-1, 1]) cross(2.2, 0.4, span, s * (deckW / 2 - 1.1), cl + 1.8, 0x8a8880, 0.05);
      for (const s of [-1, 1]) {
        if (kind === 'deck') cross(1.1, 2.6, span, s * (deckW / 2 - 0.4), cl + 1.5, RED_DK);
        else lattice(geoms, 0, span, s * (deckW / 2 - 0.4), cl + 0.2, cl + 2.8, RED_DK, 0.05);
      }
      for (const s of [-1, 1]) {
        const acr = deckW / 2 + 0.1;
        cross(0.3, 1.10, span, s * acr, cl + 2.5, RED);
        cross(0.45, 0.18, span, s * acr, cl + 3.15, 0xcbb59a);
        for (let a = -half - 4; a <= half + 4; a += 4.5) cylAt(0.13, 1.05, s * acr, a, cl + 2.5, RED_DK, 4);
        if (kind !== 'deck') yPanels(S, 0, span, s * (acr + 0.17), cl + 2.5, s);
      }
      if (kind !== 'deck') cross(deckW + 0.5, 1.2, 6, 0, cl + 2.2, RED_DK);
    }

    // trunnion + counterweight housings, tucked in the pit on the LAND side of each pivot.
    // A Chicago-type bascule turns on a fixed trunnion and the counterweight never leaves the
    // pit, so the bearing is the visible tell, not the weight.
    if (kind === 'bascule' || kind === 'bascule2') {
      for (const s of [-1, 1]) {
        trunnion(deckW + 1.6, 0.75, 0, s * (half + 0.6), cl + 0.7, 0x3a3038);
        for (const so of [-1, 1]) at(1.6, 1.8, 1.6, so * (deckW / 2 + 0.4), s * (half + 0.6), cl + 0.2, 0x6b615c);
        at(6, 4, 9, 0, s * (half + 4), cl - 2, RED_DK);
        at(6.6, 0.45, 9.6, 0, s * (half + 4), cl + 0.2, RED_LT);
      }
    }

    // corner lamps — at the four deck corners (along-edge × bank)
    for (const so of [-1, 1]) for (const ao of [-1, 1]) bridgeLamp(ao * (deckW / 2 - 0.4), so * (half - 0.5));

    if (kind === 'l') {
      // Wells/Lake double-deck: L rapid-transit truss overhead
      cross(11, 1.4, span, 0, cl + 7.6, 0x4a4e52);
      for (const s of [-1, 1]) {
        cross(0.9, 6.0, span, s * 5.4, cl + 4.6, RED_DK);
        for (let a = -half; a <= half; a += 6) cylAt(0.3, 6.0, s * 5.4, a, cl + 4.6, RED_DK, 4);
        cross(0.5, 0.5, span, s * 5.4, cl + 7.5, 0x3a3f45);
      }
      addSigns(cl + 3.4);
    } else if (kind === 'deck') {
      // girder bridge: green-steel fascia UNDER the deck edges + open railings above,
      // so the span reads airy from the water instead of a solid wall
      const GRN = 0x4f625a;
      for (const s of [-1, 1]) cross(0.9, 2.0, span, s * 10.2, cl - 0.2, GRN);
      for (const s of [-1, 1]) {
        cross(0.22, 0.18, span, s * 10.6, cl + 3.1, 0x77817b);                       // top rail
        for (let a = -half - 4; a <= half + 4; a += 5) cylAt(0.11, 1.2, s * 10.6, a, cl + 2.5, 0x6a7076, 4);
      }
      if (bridge.name.indexOf('Lake Shore') >= 0) {
        // the Link Bridge: double-deck steel + four slender Art-Moderne limestone pylons
        cross(18, 0.9, span, 0, cl - 2.4, GRN);                                       // lower deck chord
        for (let a = -half; a <= half; a += 8) for (const s of [-1, 1]) cylAt(0.15, 2.2, s * 8.8, a, cl - 1.2, 0x44554e, 4);
        for (const sA of [-1, 1]) for (const sB of [-1, 1]) {
          const ao = sA * (deckW / 2 + 3.5), ac = sB * (half + 4);
          at(5.5, 3, 6.5, ao, ac, 1.5, 0xb3ae9e);                                     // base
          at(4.2, 18, 5.2, ao, ac, 12, 0xc4bfae);                                     // shaft
          at(4.8, 1.6, 5.8, ao, ac, 21.4, 0xb3ae9e);                                  // stepped cap
          at(2.2, 1.8, 3.0, ao, ac, 23, 0xc4bfae);                                    // crown block
          if (RR.Theme) RR.Theme.addLamp(cx + tx * ao - tz * ac, 24.2, cz + tz * ao + tx * ac, 0xffe6b0);
        }
      }
      addSigns(cl + 3.6);
    } else if (kind !== 'truss') {
      // bascule tender houses. The DuSable's SW house is the McCormick Bridgehouse & Chicago
      // River Museum — five floors inside the bridgehouse, genuinely open to the public.
      const houses = kind === 'bascule2' ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : [[-1, -1], [1, 1]];
      for (const [a, b2] of houses) {
        let plaque = null;
        if (bridge.name.indexOf('Michigan') >= 0 && a === -1 && b2 === 1) plaque = EX_MUSEUM;
        else if (bridge.name === 'Dearborn St' && a === 1) plaque = EX_BEARS;
        tenderHouse(a * 8.5, b2 * (half + 3.6), plaque);
      }
      if (!anim) addSigns(cl + 3.3);   // animated bridges carry their signs on the leaves
    }

    addPierObstacles(cx, cz, tx, tz, half);
  }

  B.init = function () {
    rng = U().mulberry(4242);
    animLeaves = [];
    decks = [];
    B.openings = [];
    B.tags = [];
    const bridges = window.CHICAGO.bridges;

    // Bridge-lift season: CDOT raises the whole Loop sequence in a wave, west→east, so sailboats
    // can move between the up-river yards and the harbours. Index every bridge along its own
    // channel and phase the leaves off that instead of a hash of the coordinates.
    const order = {};
    for (const key in RR.River.paths) {
      const list = [];
      bridges.forEach((b, i) => { if (b.branch === key) list.push({ i, d: U().pathNearest(RR.River.paths[key], b.x, b.z).d }); });
      list.sort((a, b) => a.d - b.d);
      list.forEach((e, k) => { order[e.i] = k; });
    }

    const S = { geoms: [], sv: [], suv: [], sidx: [], atlas: buildSignAtlas(bridges) };
    S.signMat = new THREE.MeshBasicMaterial({ map: S.atlas.tex });   // single-sided: no mirrored text
    bridges.forEach((b, i) => { S.phase = (order[i] || 0) * 0.055; build(b, i, S); });

    const mesh = new THREE.Mesh(RR.City.mergeGeoms(S.geoms), RR.City.flatMaterial());
    mesh.castShadow = true; mesh.receiveShadow = true;
    RR.Engine.scene.add(mesh);

    if (S.sv.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(S.sv), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(S.suv), 2));
      g.setIndex(S.sidx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, S.signMat);
      m.renderOrder = 1;
      RR.Engine.scene.add(m);
    }

    // raise & lower the bascule leaves; the phases make it a travelling wave down the channel
    const MAX_LIFT = 1.12;
    const _cam = new THREE.Vector3();
    RR.Engine.onUpdate((dt, t) => {
      for (const L of animLeaves) {
        const cyc = ((t * 0.032 + L.phase) % 1 + 1) % 1;
        let open = 0;
        if (cyc > 0.35 && cyc < 0.65) open = Math.sin(((cyc - 0.35) / 0.30) * Math.PI);
        L.hinge.quaternion.setFromAxisAngle(L.axis, L.s * MAX_LIFT * open);
        if (L.opening) {
          const o = L.opening;
          o.rising = open > o.open + 1e-4;
          o.open = open;
          const warn = cyc > 0.26 && cyc < 0.65;   // gates drop ~3s before the leaves move
          // Inland Rules: one prolonged blast plus one short asks for the bridge, and the
          // bridge answers with the same. W7 owns audio.js — stay silent if it is not there yet.
          // Only while a race or the tour is actually running. The menu's attract flythrough
          // sails the whole river past every bridge, so this was firing horn after horn
          // underneath the title music — which is what it sounded like: a buzz over the music.
          const live = RR.Race && RR.Race.state && RR.Race.state();
          if (live && warn && !o.warn && RR.Audio && RR.Audio.bridgeHorn && RR.Engine.camera) {
            _cam.copy(RR.Engine.camera.position);
            if (U().dist2(_cam.x, _cam.z, o.x, o.z) < 330 * 330) RR.Audio.bridgeHorn(o.x, o.z);
          }
          o.warn = warn;
        }
      }
    });
  };

  RR.Bridges = B;
})();

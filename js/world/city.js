/* River Racer — generic city fabric: filler towers, ground, riverwalk, seawalls, street lights.
   Everything merges into a handful of draw calls. */
(function () {
  const CITY = {};
  const U = () => RR.U;

  // ---------- minimal geometry merger (three.min has no BufferGeometryUtils) ----------
  function mergeGeoms(geoms) {
    let vCount = 0, iCount = 0;
    for (const g of geoms) { vCount += g.attributes.position.count; iCount += g.index ? g.index.count : g.attributes.position.count; }
    const pos = new Float32Array(vCount * 3);
    const nor = new Float32Array(vCount * 3);
    const uv = new Float32Array(vCount * 2);
    const col = new Float32Array(vCount * 3);
    const idx = new (vCount > 65535 ? Uint32Array : Uint16Array)(iCount);
    let vo = 0, io = 0;
    for (const g of geoms) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, vo * 3);
      nor.set(g.attributes.normal.array, vo * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
      if (g.attributes.color) col.set(g.attributes.color.array, vo * 3);
      else for (let i = 0; i < n * 3; i++) col[vo * 3 + i] = 1;
      if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io++] = a[i] + vo; }
      else for (let i = 0; i < n; i++) idx[io++] = vo + i;
      vo += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  }
  CITY.mergeGeoms = mergeGeoms;

  const _c = new THREE.Color();
  function tintGeom(geo, hex, jitter, rng) {
    // vertex colors bypass three's sRGB handling — convert here or everything washes out pastel
    _c.setHex(hex).convertSRGBToLinear();
    if (jitter) {
      const f = 1 + (rng() - 0.5) * jitter;
      _c.r = U().clamp(_c.r * f, 0, 1); _c.g = U().clamp(_c.g * f, 0, 1); _c.b = U().clamp(_c.b * f, 0, 1);
    }
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  }
  CITY.tintGeom = tintGeom;

  // box with UVs scaled so the facade texture repeats per floor / per bay
  function towerGeom(w, h, d, x, z, rotY) {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    const FLOOR = 3.6, BAY = 3.0;
    // three.js box UV islands: sides need (width/BAY, height/FLOOR)
    for (let i = 0; i < uv.count; i++) {
      const face = Math.floor(i / 4);          // 6 faces × 4 verts
      let su = BAY, sv = FLOOR;
      let du = (face < 2) ? d : (face < 4) ? w : w;   // +x,-x → d; +y,-y (roof) → w; +z,-z → w
      let dv = (face === 2 || face === 3) ? d : h;
      uv.setXY(i, uv.getX(i) * du / su, uv.getY(i) * dv / sv);
    }
    g.translate(x, h / 2, z);
    if (rotY) {
      g.translate(-x, 0, -z);
      g.rotateY(rotY);
      g.translate(x, 0, z);
    }
    return g;
  }
  CITY.towerGeom = towerGeom;

  // shared facade texture: window grid with sun-struck variance
  function facadeTexture() {
    const tex = U().canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
      const rng = U().mulberry(52);
      // one tile = one bay × one floor; draw 4×4 window cells for texture density
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const glint = rng();
          const v = glint > 0.86 ? 235 : 38 + rng() * 42;
          const warm = glint > 0.86;
          ctx.fillStyle = warm ? `rgb(${v},${v * 0.92 | 0},${v * 0.7 | 0})` : `rgb(${v * 0.65 | 0},${v * 0.78 | 0},${v * 0.85 | 0})`;
          ctx.fillRect(x * 32 + 5, y * 32 + 6, 22, 18);
        }
      }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // emissive map aligned to the facade UVs: a scatter of lit windows for night mode
  function nightWindows() {
    const tex = U().canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, w, h);
      const rng = U().mulberry(313);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        if (rng() < 0.5) {
          ctx.fillStyle = rng() < 0.72 ? '#ffcf82' : '#bcd6ff';   // warm interiors, some cool
          ctx.fillRect(x * 32 + 5, y * 32 + 6, 22, 18);
        }
      }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  let cityMat;
  CITY.material = function () {
    if (!cityMat) {
      cityMat = new THREE.MeshLambertMaterial({
        vertexColors: true, map: facadeTexture(),
        emissiveMap: nightWindows(), emissive: 0xffffff, emissiveIntensity: 0,   // theme raises this at night
      });
    }
    return cityMat;
  };

  // solid (windowless) vertex-colored material for walls, roofs, piers
  let flatMat;
  CITY.flatMaterial = function () {
    if (!flatMat) flatMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    return flatMat;
  };

  // Upper Wacker / street grid sits a full level (~20 ft) above the river, matching the
  // bascule bridge decks — the river runs in a trough down at water level.
  const GROUND_Y = 6.0;
  CITY.GROUND_Y = GROUND_Y;

  // keep-out: signed clearance to the NEAREST water edge — channels AND the lake basin.
  // >0 on dry land, <0 over water. Nothing but the bridges is ever built where this is <0.
  function landClearance(x, z) {
    let best = Infinity;
    for (const key in RR.River.paths) {
      // every path counts — including lakeGuide, which carries the river mouth out to the
      // basin. Skipping it once let a seawall stand straight across the lake exit.
      const p = RR.River.paths[key];
      const q = U().pathNearest(p, x, z);
      const c = q.dist - q.w - 2.5;           // 2.5m past the seawall still counts as water
      if (c < best) best = c;
    }
    const R = RR.River;
    if (x > R.lakeWestX && x < R.lakeEastX && z > R.lakeShoreZTop && z < R.lakeShoreZBot) {
      const depth = Math.min(x - R.lakeWestX, R.lakeEastX - x, z - R.lakeShoreZTop, R.lakeShoreZBot - z);
      if (-depth < best) best = -depth;
    }
    return best;
  }
  CITY.landClearance = landClearance;         // shared with scenery.js

  CITY.init = function () {
    const scene = RR.Engine.scene;
    const C = window.CHICAGO;
    const rng = U().mulberry(C.generic.seed);

    // snapped bridge crossing points, so riverwalk dressing keeps clear of the decks
    const bridgePts = C.bridges.map((b) => {
      const p = RR.River.paths[b.branch];
      const q = U().pathNearest(p, b.x, b.z);
      return { x: q.x, z: q.z };
    });
    function nearBridge(x, z, r) {
      for (const bp of bridgePts) if (U().dist2(x, z, bp.x, bp.z) < r * r) return true;
      return false;
    }

    // ---------- ground: bank aprons hugging every channel + a coarse cell grid with
    // water cells skipped (the river must stay open water — no slab over the channels) ----------
    const groundTex = U().canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#565b61'; ctx.fillRect(0, 0, w, h);
      const g = U().mulberry(99);
      for (let i = 0; i < 900; i++) {
        const v = 75 + g() * 28;
        ctx.fillStyle = `rgba(${v},${v + 4},${v + 8},0.5)`;
        ctx.fillRect(g() * w, g() * h, 2, 2);
      }
      ctx.strokeStyle = 'rgba(28,30,34,0.85)';
      ctx.lineWidth = 6;
      for (let i = 0; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(i * 128, 0); ctx.lineTo(i * 128, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * 128); ctx.lineTo(w, i * 128); ctx.stroke();
      }
    });
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
    const groundMat = new THREE.MeshLambertMaterial({ map: groundTex, color: 0x9aa0a6 });

    // apron ribbons: from just behind the seawall out to ~130m, following each channel exactly.
    // Every rib is keep-out gated (inner + outer corner must be dry land) so the strip never
    // sweeps over the neighbouring branches' water at the Wolf Point confluence, and it is
    // sampled at every resample point so it hugs concave bends instead of chording across them.
    const openX = C.lake.openWaterX;
    const apronGeoms = [];
    for (const key in RR.River.paths) {
      if (key.startsWith('lake')) continue;
      const p = RR.River.paths[key];
      for (const s of [-1, 1]) {
        const verts = [], uvs = [], idx = [];
        let vi = 0, prevOK = false;
        for (let i = 0; i < p.n; i++) {
          const i0 = Math.max(0, i - 1), i1 = Math.min(p.n - 1, i + 1);
          let tx = p.x[i1] - p.x[i0], tz = p.z[i1] - p.z[i0];
          const tl = Math.max(1e-6, Math.hypot(tx, tz)); tx /= tl; tz /= tl;
          const inner = p.w[i] + 9, outer = p.w[i] + 130;   // upper street sits behind the lower promenade
          const ix = p.x[i] - tz * inner * s, iz = p.z[i] + tx * inner * s;
          const ox = p.x[i] - tz * outer * s, oz = p.z[i] + tx * outer * s;
          const ok = landClearance(ix, iz) > 0 && landClearance(ox, oz) > 0 && ix < openX - 6 && ox < openX - 6;
          verts.push(ix, GROUND_Y, iz, ox, GROUND_Y, oz);
          uvs.push(ix / 32, iz / 32, ox / 32, oz / 32);
          if (vi >= 2 && ok && prevOK) {
            if (s === 1) idx.push(vi - 2, vi - 1, vi, vi - 1, vi + 1, vi);
            else idx.push(vi - 2, vi, vi - 1, vi - 1, vi, vi + 1);
          }
          prevOK = ok;
          vi += 2;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
        g.setIndex(idx);
        g.computeVertexNormals();
        apronGeoms.push(g);
      }
    }
    for (const g of apronGeoms) {
      const m = new THREE.Mesh(g, groundMat);
      m.receiveShadow = true;
      scene.add(m);
    }

    // cell grid: 64m tiles across the whole map, skipping any tile that touches water
    {
      const CELL = 64;
      const cells = [];
      const x0 = -4300, x1 = C.lake.openWaterX, z0 = -3600, z1 = 4200;
      for (let x = x0; x < x1; x += CELL) {
        for (let z = z0; z < z1; z += CELL) {
          const cx = x + CELL / 2, cz = z + CELL / 2;
          if (landClearance(cx, cz) < CELL * 0.95) continue;   // near/over water → apron territory
          const g = new THREE.PlaneGeometry(CELL, CELL);
          g.rotateX(-Math.PI / 2);
          g.translate(cx, GROUND_Y - 0.04, cz);
          const uv = g.attributes.uv;
          for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + (uv.getX(i) - 0.5) * CELL) / 32, (cz + (uv.getY(i) - 0.5) * CELL) / 32);
          cells.push(g);
        }
      }
      for (let i = 0; i < cells.length; i += 900) {
        const m = new THREE.Mesh(mergeGeoms(cells.slice(i, i + 900)), groundMat);
        m.receiveShadow = true;
        scene.add(m);
      }
    }

    // (the water's-edge retaining wall + lower promenade are built by RR.Riverwalk)

    // shared dressing/greenery builders (flat vertex-colored geometry)
    function treeAt(arr, px, pz, scale) {
      const s = scale || 1;
      const trunk = new THREE.CylinderGeometry(0.22 * s, 0.32 * s, 2.6 * s, 5);
      trunk.translate(px, GROUND_Y + 1.3 * s, pz);
      tintGeom(trunk, 0x4a3524, 0, rng); arr.push(trunk);
      const crown = new THREE.SphereGeometry((2.1 + rng() * 1.5) * s, 7, 6);
      crown.scale(1, 0.82, 1);
      crown.translate(px, GROUND_Y + (4.0 + rng()) * s, pz);
      tintGeom(crown, rng() > 0.5 ? 0x4d7a3a : 0x5d8a42, 0.22, rng); arr.push(crown);
    }
    function benchAt(arr, px, pz, tx, tz) {
      const ang = Math.atan2(tx, tz), nx = -tz, nz = tx;
      const seat = new THREE.BoxGeometry(2.0, 0.18, 0.6);
      seat.rotateY(ang); seat.translate(px, GROUND_Y + 0.5, pz);
      tintGeom(seat, 0x5a4a30, 0.12, rng); arr.push(seat);
      const back = new THREE.BoxGeometry(2.0, 0.5, 0.12);
      back.rotateY(ang); back.translate(px + nx * 0.24, GROUND_Y + 0.8, pz + nz * 0.24);
      tintGeom(back, 0x5a4a30, 0.12, rng); arr.push(back);
    }
    function lampAt(arr, px, pz) {
      const post = new THREE.CylinderGeometry(0.12, 0.17, 5.0, 5);
      post.translate(px, GROUND_Y + 2.5, pz);
      tintGeom(post, 0x2c2f33, 0, rng); arr.push(post);
      const arm = new THREE.BoxGeometry(0.9, 0.12, 0.12);
      arm.translate(px, GROUND_Y + 4.9, pz);
      tintGeom(arm, 0x2c2f33, 0, rng); arr.push(arm);
      const lamp = new THREE.SphereGeometry(0.3, 6, 5);
      lamp.translate(px + 0.38, GROUND_Y + 4.8, pz);
      tintGeom(lamp, 0xffe6b0, 0, rng); arr.push(lamp);
      if (RR.Theme) RR.Theme.addLamp(px + 0.38, GROUND_Y + 4.8, pz, 0xffe6b0);
    }
    function planterAt(arr, px, pz) {
      const box = new THREE.BoxGeometry(2.4, 0.9, 1.2);
      box.translate(px, GROUND_Y + 0.45, pz);
      tintGeom(box, 0x8f8672, 0.1, rng); arr.push(box);
      const green = new THREE.BoxGeometry(2.2, 0.6, 1.0);
      green.translate(px, GROUND_Y + 1.15, pz);
      tintGeom(green, 0x4d7a3a, 0.2, rng); arr.push(green);
    }

    // ---------- generic tower field on the street grid ----------
    const BLOCK = 96, STREET = 22;
    const palettes = [0x8f9aa3, 0x76828c, 0xa39a8a, 0x5d666e, 0x8c8478, 0x9fa8b0, 0x6b7480, 0xb0a798, 0xc4b9a4, 0x7d8891, 0x9a8f7c];
    const geoms = [];          // window-mapped tower shells
    const detailGeoms = [];    // flat: rooftop clutter, park ground, plazas
    const dressGeoms = [];     // flat: trees, lamps, benches, planters
    const lm = C.landmarks;
    const cx0 = C.generic.loopCenter.x, cz0 = C.generic.loopCenter.z;

    function roofClutter(cx, cz, topY, w, d) {
      if (rng() > 0.42) {
        const pw = w * (0.26 + rng() * 0.34), pd = d * (0.26 + rng() * 0.34), ph = 2.5 + rng() * 6;
        const g = new THREE.BoxGeometry(pw, ph, pd);
        g.translate(cx + (rng() - 0.5) * w * 0.35, topY + ph / 2, cz + (rng() - 0.5) * d * 0.35);
        tintGeom(g, 0x666c72, 0.12, rng); detailGeoms.push(g);
      }
      if (rng() > 0.6) {
        const rad = 1.2 + rng() * 1.3, th = 2.4 + rng() * 3;
        const tx = cx + (rng() - 0.5) * w * 0.4, tz = cz + (rng() - 0.5) * d * 0.4;
        const g = new THREE.CylinderGeometry(rad, rad, th, 8);
        g.translate(tx, topY + th / 2, tz);
        tintGeom(g, 0x4a4034, 0.12, rng); detailGeoms.push(g);
      }
      if (rng() > 0.72) {
        const ah = 4 + rng() * 12;
        const g = new THREE.CylinderGeometry(0.1, 0.22, ah, 4);
        g.translate(cx + (rng() - 0.5) * w * 0.25, topY + ah / 2, cz + (rng() - 0.5) * d * 0.25);
        tintGeom(g, 0x2c2f33, 0, rng); detailGeoms.push(g);
      }
    }

    // place one building, footprint keep-out checked; returns true if placed
    function placeBuilding(bxx, bzz, w, d, dLoop, loRise) {
      const halfDiag = Math.hypot(w, d) * 0.5;
      if (landClearance(bxx, bzz) < halfDiag + 2) return false;          // whole footprint must be on dry land
      if (bxx > C.lake.openWaterX - halfDiag - 18) return false;
      let h;
      if (loRise) h = 14 + rng() * 46;
      else h = (20 + rng() * rng() * 165) * U().clamp(1.4 - dLoop / 2100, 0.3, 1.2);
      if (landClearance(bxx, bzz) < 70) h = Math.min(h, 34 + rng() * 60);  // step down toward the water
      h = Math.max(11, h);
      const g = towerGeom(w, h, d, bxx, bzz, 0);
      g.translate(0, GROUND_Y, 0);
      tintGeom(g, palettes[Math.floor(rng() * palettes.length)], 0.22, rng);
      geoms.push(g);
      // ground-floor retail band (darker base) for street-level realism
      const band = towerGeom(w + 0.4, 4.5, d + 0.4, bxx, bzz, 0);
      band.translate(0, GROUND_Y, 0);
      tintGeom(band, 0x3b3f45, 0.1, rng); geoms.push(band);
      // parapet cap for a crisp roofline (flat, so it doesn't glow at night)
      const cap = new THREE.BoxGeometry(w + 0.8, 1.3, d + 0.8);
      cap.translate(bxx, GROUND_Y + h - 0.35, bzz);
      tintGeom(cap, 0x565c64, 0.14, rng); detailGeoms.push(cap);
      if (h > 90 && rng() > 0.4) {                                       // setback crown
        const g2 = towerGeom(w * 0.62, h * 0.28, d * 0.62, bxx, bzz, 0);
        g2.translate(0, GROUND_Y + h, 0);
        tintGeom(g2, palettes[Math.floor(rng() * palettes.length)], 0.22, rng);
        geoms.push(g2);
        roofClutter(bxx, bzz, GROUND_Y + h + h * 0.28, w * 0.62, d * 0.62);
      } else {
        roofClutter(bxx, bzz, GROUND_Y + h, w, d);
      }
      return true;
    }

    // ---- riverfront building wall: a near-continuous line of mid/low-rise right along the banks ----
    for (const key in RR.River.paths) {
      if (key.startsWith('lake')) continue;
      const p = RR.River.paths[key];
      for (let i = 3; i < p.n - 3; i += 3) {
        let tx = p.x[i + 1] - p.x[i - 1], tz = p.z[i + 1] - p.z[i - 1];
        const tl = Math.max(1e-6, Math.hypot(tx, tz)); tx /= tl; tz /= tl;
        for (const s of [-1, 1]) {
          const w = 26 + rng() * 26, d = 24 + rng() * 22;
          const set = p.w[i] + 15 + d / 2;                               // just behind street + riverwalk
          const bxx = p.x[i] - tz * set * s, bzz = p.z[i] + tx * set * s;
          if (bxx > C.lake.openWaterX - 40) continue;
          if (nearBridge(bxx, bzz, 26)) continue;                        // leave room for the bridge approaches
          let ok = true;
          for (const l of lm) if (Math.abs(l.x - bxx) < l.w / 2 + 30 && Math.abs(l.z - bzz) < l.d / 2 + 30) { ok = false; break; }
          if (ok) placeBuilding(bxx, bzz, w, d, Math.hypot(bxx - cx0, bzz - cz0), rng() < 0.5);
        }
      }
    }

    // ---- Loop street-grid fill behind the riverfront ----
    for (let gx = -24; gx <= 26; gx++) {
      for (let gz = -22; gz <= 24; gz++) {
        const bx = gx * (BLOCK + STREET), bz = gz * (BLOCK + STREET);
        if (bx > C.lake.openWaterX - 90) continue;                       // lakefront park stays open
        const clear = landClearance(bx, bz);
        if (clear < 4) continue;                                         // block center basically in the water
        let owned = false;
        for (const l of lm) {
          if (Math.abs(l.x - bx) < (l.w / 2 + 58) && Math.abs(l.z - bz) < (l.d / 2 + 58)) { owned = true; break; }
        }
        if (owned) continue;
        const dLoop = Math.hypot(bx - cx0, bz - cz0);
        if (dLoop > 3100) continue;

        // occasional pocket park right at the water (much rarer now).
        // Size the lawn to the local clearance so a waterside block never overhangs the channel.
        if (clear < 45 && rng() < 0.1) {
          const ps = Math.min(BLOCK - 8, clear * 2 - 4);
          if (ps >= 20) {
            const tile = new THREE.PlaneGeometry(ps, ps);
            tile.rotateX(-Math.PI / 2); tile.translate(bx, GROUND_Y + 0.02, bz);
            tintGeom(tile, 0x4f7a3e, 0.14, rng); detailGeoms.push(tile);
            for (let t = 0; t < 5 + (rng() * 5 | 0); t++) {
              const tx = bx + (rng() - 0.5) * (ps - 8), tz = bz + (rng() - 0.5) * (ps - 8);
              if (landClearance(tx, tz) > 3) treeAt(dressGeoms, tx, tz, 0.9 + rng() * 0.4);
            }
          }
          continue;
        }

        const density = U().clamp(1.45 - dLoop / 2800, 0.45, 1);
        if (rng() > density + 0.35) continue;                            // skip far fewer blocks
        const nBld = 2 + Math.floor(rng() * 2.6 * density);              // pack the block
        for (let b = 0; b < nBld; b++) {
          const w = 20 + rng() * 44, d = 20 + rng() * 44;
          const ox = (rng() - 0.5) * (BLOCK - w), oz = (rng() - 0.5) * (BLOCK - d);
          placeBuilding(bx + ox, bz + oz, w, d, dLoop, rng() < 0.28);
        }
      }
    }

    // ---------- distant skyline: silhouette ring so the horizon reads as a full city ----------
    {
      const backGeoms = [];
      const bRng = U().mulberry(7777);
      for (let a = 0; a < Math.PI * 2; a += 0.04) {
        const rad = 2750 + bRng() * 1000;
        const bx = cx0 + Math.cos(a) * rad, bz = cz0 + Math.sin(a) * rad;
        const w = 30 + bRng() * 64, d = 30 + bRng() * 64;
        // leave the lake horizon open AND never stand in the water — the east arc of this
        // ring used to plant a tan wall of towers straight across the river mouth
        if (bx > C.lake.openWaterX - 60) continue;
        if (landClearance(bx, bz) < Math.max(w, d) * 0.71 + 6) continue;
        const h = 44 + bRng() * bRng() * 250;
        const g = new THREE.BoxGeometry(w, h, d);
        g.translate(bx, h / 2, bz);
        tintGeom(g, 0x8793a0, 0.14, bRng);
        backGeoms.push(g);
      }
      const back = new THREE.Mesh(mergeGeoms(backGeoms), CITY.flatMaterial());
      scene.add(back);
    }

    // ---------- riverwalk dressing on BOTH banks of every channel (keep-out checked) ----------
    for (const key in RR.River.paths) {
      if (key.startsWith('lake')) continue;
      const p = RR.River.paths[key];
      for (let i = 4; i < p.n - 4; i += 4) {
        let tx = p.x[i + 1] - p.x[i - 1], tz = p.z[i + 1] - p.z[i - 1];
        const tl = Math.max(1e-6, Math.hypot(tx, tz)); tx /= tl; tz /= tl;
        for (const s of [-1, 1]) {
          const off = p.w[i] + 11.5;                                     // upper street level, just past the rail
          const px = p.x[i] - tz * off * s, pz = p.z[i] + tx * off * s;
          if (px > C.lake.openWaterX - 20) continue;
          if (landClearance(px, pz) < 1.2) continue;                     // never over the water
          if (nearBridge(px, pz, 15)) continue;                          // clear of the bridge decks
          const kind = (Math.floor(i / 4) + (s > 0 ? 0 : 1)) % 5;
          if (kind === 0 || kind === 3) treeAt(dressGeoms, px, pz, 1);
          else if (kind === 1) lampAt(dressGeoms, px, pz);
          else if (kind === 2) { const bx2 = p.x[i] - tz * (off + 0.6) * s, bz2 = p.z[i] + tx * (off + 0.6) * s; benchAt(dressGeoms, bx2, bz2, tx, tz); }
          else planterAt(dressGeoms, px, pz);
        }
      }
    }

    // ---------- merge everything into a few draw calls ----------
    for (let i = 0; i < geoms.length; i += 400) {
      const mesh = new THREE.Mesh(mergeGeoms(geoms.slice(i, i + 400)), CITY.material());
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
    }
    for (let i = 0; i < detailGeoms.length; i += 700) {
      const mesh = new THREE.Mesh(mergeGeoms(detailGeoms.slice(i, i + 700)), CITY.flatMaterial());
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
    }
    for (let i = 0; i < dressGeoms.length; i += 700) {
      const mesh = new THREE.Mesh(mergeGeoms(dressGeoms.slice(i, i + 700)), CITY.flatMaterial());
      mesh.castShadow = true;
      mesh.layers.set(1);              // street furniture skips the reflection pass
      scene.add(mesh);
    }
  };

  RR.City = CITY;
})();

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

  let cityMat;
  CITY.material = function () {
    if (!cityMat) {
      cityMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: facadeTexture() });
    }
    return cityMat;
  };

  // solid (windowless) vertex-colored material for walls, roofs, piers
  let flatMat;
  CITY.flatMaterial = function () {
    if (!flatMat) flatMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    return flatMat;
  };

  const GROUND_Y = 2.3;                       // street level above water
  CITY.GROUND_Y = GROUND_Y;

  // keep-out check: near any channel? returns clearance to water edge (negative inside water)
  function landClearance(x, z) {
    let best = -Infinity;
    for (const key in RR.River.paths) {
      if (key === 'lakeGuide' || key === 'lakeLoop') continue;
      const p = RR.River.paths[key];
      const q = U().pathNearest(p, x, z);
      const c = q.dist - q.w;                 // >0 on land
      if (best === -Infinity || c < best) best = Math.min(best === -Infinity ? 1e9 : best, c);
    }
    return best;
  }

  CITY.init = function () {
    const scene = RR.Engine.scene;
    const C = window.CHICAGO;
    const rng = U().mulberry(C.generic.seed);

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

    // apron ribbons: from just behind the seawall out to ~52m, following each channel exactly
    const apronGeoms = [];
    for (const key in RR.River.paths) {
      if (key.startsWith('lake')) continue;
      const p = RR.River.paths[key];
      for (const s of [-1, 1]) {
        const verts = [], uvs = [], idx = [];
        let vi = 0;
        for (let i = 0; i < p.n; i += 3) {
          const i0 = Math.max(0, i - 1), i1 = Math.min(p.n - 1, i + 1);
          let tx = p.x[i1] - p.x[i0], tz = p.z[i1] - p.z[i0];
          const tl = Math.max(1e-6, Math.hypot(tx, tz)); tx /= tl; tz /= tl;
          const inner = p.w[i] + 0.6, outer = p.w[i] + 130;
          const ix = p.x[i] - tz * inner * s, iz = p.z[i] + tx * inner * s;
          const ox = p.x[i] - tz * outer * s, oz = p.z[i] + tx * outer * s;
          verts.push(ix, GROUND_Y, iz, ox, GROUND_Y, oz);
          uvs.push(ix / 32, iz / 32, ox / 32, oz / 32);
          if (vi >= 2) {
            if (s === 1) idx.push(vi - 2, vi - 1, vi, vi - 1, vi + 1, vi);
            else idx.push(vi - 2, vi, vi - 1, vi - 1, vi, vi + 1);
          }
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

    // ---------- seawalls + riverwalk along every channel ----------
    const wallGeoms = [], deckGeoms = [];
    for (const key in RR.River.paths) {
      if (key === 'lakeGuide' || key === 'lakeLoop') continue;
      const p = RR.River.paths[key];
      for (let i = 0; i < p.n - 1; i += 4) {
        const i1 = Math.min(p.n - 1, i + 4);
        const mx = (p.x[i] + p.x[i1]) / 2, mz = (p.z[i] + p.z[i1]) / 2;
        let tx = p.x[i1] - p.x[i], tz = p.z[i1] - p.z[i];
        const tl = Math.max(1e-6, Math.hypot(tx, tz)); tx /= tl; tz /= tl;
        const ang = Math.atan2(tx, tz);
        const wHalf = (p.w[i] + p.w[i1]) / 2;
        for (const s of [-1, 1]) {
          const wx = mx - tz * (wHalf + 1.4) * s;
          const wz = mz + tx * (wHalf + 1.4) * s;
          const wall = new THREE.BoxGeometry(3.2, GROUND_Y + 0.6, tl + 0.8);
          wall.rotateY(ang);
          wall.translate(wx, (GROUND_Y + 0.6) / 2 - 0.3, wz);
          tintGeom(wall, 0x8d8f8a, 0.12, rng);
          wallGeoms.push(wall);
          // riverwalk deck strip behind the wall on the main stem
          if (key === 'main') {
            const deck = new THREE.BoxGeometry(6.5, 0.5, tl + 0.8);
            deck.rotateY(ang);
            deck.translate(mx - tz * (wHalf + 6.2) * s, GROUND_Y - 1.05, mz + tx * (wHalf + 6.2) * s);
            tintGeom(deck, 0xb9b3a4, 0.1, rng);
            deckGeoms.push(deck);
          }
        }
      }
    }
    const walls = new THREE.Mesh(mergeGeoms(wallGeoms), CITY.flatMaterial());
    walls.receiveShadow = true;
    scene.add(walls);
    if (deckGeoms.length) {
      const decks = new THREE.Mesh(mergeGeoms(deckGeoms), CITY.flatMaterial());
      decks.receiveShadow = true;
      scene.add(decks);
    }

    // ---------- generic tower field on the street grid ----------
    const BLOCK = 96, STREET = 22;
    const palettes = [0x8f9aa3, 0x76828c, 0xa39a8a, 0x5d666e, 0x8c8478, 0x9fa8b0, 0x6b7480, 0xb0a798];
    const geoms = [];
    const lm = C.landmarks;
    const cx0 = C.generic.loopCenter.x, cz0 = C.generic.loopCenter.z;
    for (let gx = -22; gx <= 24; gx++) {
      for (let gz = -20; gz <= 22; gz++) {
        const bx = gx * (BLOCK + STREET), bz = gz * (BLOCK + STREET);
        if (bx > C.lake.openWaterX - 120) continue;                      // lakefront park stays open
        const clear = landClearance(bx, bz);
        if (clear < 26) continue;                                        // keep the banks buildable by hand
        // skip blocks owned by landmark footprints
        let owned = false;
        for (const l of lm) {
          if (Math.abs(l.x - bx) < (l.w / 2 + 60) && Math.abs(l.z - bz) < (l.d / 2 + 60)) { owned = true; break; }
        }
        if (owned) continue;
        const dLoop = Math.hypot(bx - cx0, bz - cz0);
        if (dLoop > 2600) continue;
        // density + height falls off from the Loop
        const density = U().clamp(1.25 - dLoop / 2200, 0.18, 1);
        if (rng() > density + 0.15) continue;
        const nBld = 1 + Math.floor(rng() * 2.2 * density + 0.4);
        for (let b = 0; b < nBld; b++) {
          const w = 24 + rng() * 42, d = 24 + rng() * 42;
          const ox = (rng() - 0.5) * (BLOCK - w), oz = (rng() - 0.5) * (BLOCK - d);
          let h = (18 + rng() * rng() * 150) * U().clamp(1.35 - dLoop / 1900, 0.25, 1.15);
          if (clear < 70) h = Math.min(h, 60 + rng() * 40);              // human scale right on the water
          h = Math.max(12, h);
          const g = towerGeom(w, h, d, bx + ox, bz + oz, 0);
          g.translate(0, GROUND_Y, 0);
          tintGeom(g, palettes[Math.floor(rng() * palettes.length)], 0.22, rng);
          geoms.push(g);
          // simple setback crown on the taller ones
          if (h > 90 && rng() > 0.4) {
            const g2 = towerGeom(w * 0.62, h * 0.28, d * 0.62, bx + ox, bz + oz, 0);
            g2.translate(0, GROUND_Y + h, 0);
            tintGeom(g2, palettes[Math.floor(rng() * palettes.length)], 0.22, rng);
            geoms.push(g2);
          }
        }
      }
    }
    // chunk the merge so no single geometry gets silly
    for (let i = 0; i < geoms.length; i += 400) {
      const mesh = new THREE.Mesh(mergeGeoms(geoms.slice(i, i + 400)), CITY.material());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }

    // ---------- riverwalk dressing: railings, lamp posts, trees ----------
    const dressGeoms = [];
    const main = RR.River.paths.main;
    if (main) {
      for (let i = 8; i < main.n - 8; i += 10) {
        let tx = main.x[i + 1] - main.x[i - 1], tz = main.z[i + 1] - main.z[i - 1];
        const tl = Math.max(1e-6, Math.hypot(tx, tz)); tx /= tl; tz /= tl;
        for (const s of [-1, 1]) {
          const px = main.x[i] - tz * (main.w[i] + 4.5) * s;
          const pz = main.z[i] + tx * (main.w[i] + 4.5) * s;
          if ((i / 10) % 2 === 0) {
            const post = new THREE.CylinderGeometry(0.12, 0.16, 4.6, 5);
            post.translate(px, GROUND_Y + 2.3, pz);
            tintGeom(post, 0x2c2f33, 0, rng);
            dressGeoms.push(post);
            const lamp = new THREE.SphereGeometry(0.34, 6, 5);
            lamp.translate(px, GROUND_Y + 4.7, pz);
            tintGeom(lamp, 0xffe9b8, 0, rng);
            dressGeoms.push(lamp);
          } else {
            const trunk = new THREE.CylinderGeometry(0.22, 0.3, 2.6, 5);
            trunk.translate(px, GROUND_Y + 1.3, pz);
            tintGeom(trunk, 0x4a3524, 0, rng);
            dressGeoms.push(trunk);
            const crown = new THREE.SphereGeometry(2.4 + rng() * 1.4, 7, 6);
            crown.scale(1, 0.85, 1);
            crown.translate(px, GROUND_Y + 4.4, pz);
            tintGeom(crown, rng() > 0.5 ? 0x4d7a3a : 0x5d8a42, 0.2, rng);
            dressGeoms.push(crown);
          }
        }
      }
      const dress = new THREE.Mesh(mergeGeoms(dressGeoms), CITY.flatMaterial());
      dress.castShadow = true;
      scene.add(dress);
    }
  };

  RR.City = CITY;
})();

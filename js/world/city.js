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

  // tintGeom + a vertical ambient-occlusion ramp baked into the same vertex-colour buffer.
  // Street level in a canyon receives a fraction of the sky, and the eye reads that gradient as
  // "this mass meets the ground" — without it every tower looks like it is floating on a decal.
  // topMul brightens the last 5 m under the parapet, where the sky is unoccluded.
  function tintGeomAO(geo, hex, jitter, rng, y0, y1, floorMul, topMul) {
    tintGeom(geo, hex, jitter, rng);
    if (y1 === undefined) return geo;
    const fm = floorMul === undefined ? 0.66 : floorMul;
    const tm = topMul === undefined ? 1 : topMul;
    const pos = geo.attributes.position, col = geo.attributes.color;
    geo.computeBoundingBox();
    const top = geo.boundingBox.max.y;
    const span = Math.max(1e-3, y1 - y0);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      let f = fm + (1 - fm) * U().clamp((y - y0) / span, 0, 1);
      if (tm !== 1 && y > top - 5) f *= tm;
      col.setXYZ(i,
        U().clamp(col.getX(i) * f, 0, 1),
        U().clamp(col.getY(i) * f, 0, 1),
        U().clamp(col.getZ(i) * f, 0, 1));
    }
    col.needsUpdate = true;
    return geo;
  }
  CITY.tintGeomAO = tintGeomAO;

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

  // ==================== FACADE FAMILY SYSTEM ====================
  // Ten independent 256×256 RepeatWrapping tiles — deliberately NOT an atlas. towerGeom drives u
  // past 20 on a wide tower, so addressing an atlas cell needs fract(), whose derivative spikes at
  // every tile seam and drops the GPU to the lowest mip: a dark 1-px line down every window bay.
  //
  // THE POLARITY RULE, which is the whole point: on a curtain wall the vision glass MIRRORS THE SKY
  // and is LIGHTER than its frame; on masonry the punched opening is a hole and is DARKER than the
  // wall. Getting that backwards is what makes a city read as perforated black cardboard.
  // One tile = one bay (3.0 m) × one floor (3.6 m) — the constants baked into towerGeom.
  //
  // nightMul has a HARD CEILING of ~0.86. A lit pane in nightTile tops out at k = 0.86 of a
  // near-white hex, the night preset multiplies by 1.35, and the product is what lands in linear
  // light: anything over 1.0 clips to white BEFORE tone mapping, then trips the 0.50 bloom
  // threshold, and the building stops being a building and becomes a lantern. MIES (black frame,
  // cool glass) and RETAIL (an unbroken shopfront band at eye level the whole length of the
  // Riverwalk) were the two that blew out, so they sit furthest below the ceiling.
  const FAM = [
    { key: 'CURTAIN', seed: 1101, frame: '#7d868c', spandrel: '#98a1a7', glassHi: '#dce9f0', glassLo: '#a9bfd0',
      lites: 2, margin: 4, mullion: 5, glassTop: 10, glassBot: 150, sill: '#b6bec4', revealA: 0.10, grain: 0,
      tints: [0xb9c0c6, 0xa6b0b8, 0xc8cdd0, 0x94a0a8],
      nightDensity: 0.42, warm: '#ffcf85', cool: '#cfe0ff', warmFrac: 0.70, nightMul: 0.85 },

    // ART's spec hexes were tuned before the night preset landed at exposure 1.45 + bloom 1.45;
    // at full strength a moonlit east face becomes one white slab. Halved, the highlight still
    // travels across the glass as the sun moves, which is the whole reason these four are Phong.
    { key: 'MIES', seed: 1202, frame: '#17191c', spandrel: '#202429', glassHi: '#55636e', glassLo: '#2c363f',
      lites: 2, margin: 3, mullion: 8, glassTop: 8, glassBot: 168, sill: '#24282c', revealA: 0.06, grain: 0,
      centreRib: '#2a2e33',                                  // the applied I-beam mullion — the whole building
      tints: [0x2a2e33, 0x232629, 0x33383d], shininess: 70, specular: 0x252a30,
      nightDensity: 0.30, warm: '#ffcf85', cool: '#dfe8ff', warmFrac: 0.45, nightMul: 0.68 },

    { key: 'LIMESTONE', seed: 1303, frame: '#d9d2c1', spandrel: '#cdc5b3', glassHi: '#8fa3b0', glassLo: '#5c7183',
      lites: 1, margin: 62, mullion: 6, glassTop: 26, glassBot: 196, sill: '#efe9db', revealA: 0.30, grain: 0.06,
      courseH: 32, courseCol: 'rgba(120,110,92,0.22)',
      // Indiana limestone weathers from cream to a cold soiled grey depending on when the
      // building was last cleaned; without that spread a limestone Loop is one beige mass.
      // famNorm multiplies these by ~1.4, so anything above ~0xdd clips to white and the whole
      // family collapses onto one colour. Ceiling the tints is what keeps the variation.
      tints: [0xd6cfbe, 0xcfc6b2, 0xdcd6c4, 0xc6bda9, 0xc6c4bc, 0xb2aea2],
      nightDensity: 0.34, warm: '#ffca7a', cool: '#cfe0ff', warmFrac: 0.86, nightMul: 0.75 },

    // Chicago common brick is a mortar-greyed masonry, not a fire engine. The tile stays
    // near-NEUTRAL on purpose: map pixels are sampled straight into linear light with no sRGB
    // decode, so any saturation authored here is roughly squared on the way to the screen, and
    // a #a45a3e brick pixel under a #9a5138 tint lands at 7:1 red-to-green — hotter than any
    // wall in the city. Hue lives in the tints instead, which DO get decoded, so what you read
    // in the array is very nearly what lands on the wall. They run the real Chicago range:
    // buff-yellow through orange-red to smoke-darkened brown. A single red reads as wallpaper.
    { key: 'REDBRICK', seed: 1404, frame: '#8a8078', spandrel: null, glassHi: '#6d7f8c', glassLo: '#3f4e5a',
      lites: 1, margin: 66, mullion: 8, glassTop: 30, glassBot: 190, sill: '#9b948a', revealA: 0.26, grain: 0,
      brick: { mortar: '#a49c92', a: '#7b736a', b: '#9c9286' }, lintel: '#2e3236',
      tints: [0x9a6a52, 0x8a6353, 0x7a5c50, 0xa8845f, 0xb3a582, 0x8d8168, 0x9c7a63, 0xa79574, 0x8e5442],
      nightDensity: 0.22, warm: '#ffb964', cool: '#cfe0ff', warmFrac: 0.88, nightMul: 0.55 },

    { key: 'TERRACOTTA', seed: 1505, frame: '#efe9dc', spandrel: '#e6dfd0', glassHi: '#8ea3b2', glassLo: '#5f7484',
      lites: 2, margin: 8, mullion: 7, glassTop: 22, glassBot: 176, sill: '#faf5ea', revealA: 0.22, grain: 0.03,
      ornament: { y: 232, h: 14, a: '#e8e0cf', b: '#d3c9b4' },
      // kept under the famNorm clip ceiling so the three read as three creams, not one white —
      // the Wrigley Building passes its own brighter hex in and still burns out, as it should
      tints: [0xdcd5c6, 0xd0c9b8, 0xe0dbcf, 0xcbc6bc], shininess: 14, specular: 0x151412,
      nightDensity: 0.30, warm: '#ffd39a', cool: '#cfe0ff', warmFrac: 0.84, nightMul: 0.70 },

    // Polished pink granite (190 S LaSalle, 311 S Wacker, AT&T Corporate Center) is a warm
    // grey-mauve stone. Saturated at the tile AND the tint it came out salmon, which is what
    // made the Loop read pink from the air; the hue now lives in the tints alone.
    { key: 'PINKGRANITE', seed: 1606, frame: '#a49a95', spandrel: '#918782', glassHi: '#7d8f92', glassLo: '#4b5c62',
      lites: 2, margin: 6, mullion: 9, glassTop: 16, glassBot: 160, sill: '#b4aaa4', revealA: 0.16, grain: 0.04,
      courseH: 64, courseCol: 'rgba(84,76,72,0.28)',          // large panel joints — the postmodern tell
      tints: [0xb49a90, 0xa4887e, 0xb8a89c, 0x94807a],
      nightDensity: 0.26, warm: '#ffc98a', cool: '#cfe0ff', warmFrac: 0.82, nightMul: 0.80 },

    // 333 W Wacker's glass is a soft sea-green that goes almost grey against a bright sky.
    // Authored emerald at both the tile and the tint it came out kelly, which no window in
    // Chicago is — same double-saturation trap as the brick.
    { key: 'GREENGLASS', seed: 1707, frame: '#4b5854', spandrel: '#38443f', glassHi: '#9ab5ab', glassLo: '#55716a',
      lites: 2, margin: 3, mullion: 6, glassTop: 6, glassBot: 176, sill: '#53625d', revealA: 0.05, grain: 0,
      tints: [0x74928a, 0x64837b, 0x88a49b, 0x577671], shininess: 66, specular: 0x2b3b37,
      nightDensity: 0.34, warm: '#ffcf85', cool: '#cfe6df', warmFrac: 0.40, nightMul: 0.80 },

    { key: 'BLUEGLASS', seed: 1808, frame: '#4a6070', spandrel: '#35505f', glassHi: '#a7cfe2', glassLo: '#4a7f9e',
      lites: 2, margin: 3, mullion: 5, glassTop: 6, glassBot: 182, sill: '#56728a', revealA: 0.05, grain: 0,
      tints: [0x7fa8c0, 0x6d99b4, 0x93bcd2, 0x5d88a4], shininess: 72, specular: 0x2e4049,
      nightDensity: 0.40, warm: '#ffcf85', cool: '#d6e9ff', warmFrac: 0.35, nightMul: 0.72 },

    { key: 'CONCRETE', seed: 1909, frame: '#b7b1a4', spandrel: '#a8a294', glassHi: '#7d8b93', glassLo: '#4e5c66',
      lites: 1, margin: 40, mullion: 7, glassTop: 22, glassBot: 184, sill: '#c6c0b2', revealA: 0.24, grain: 0.07,
      courseH: 11, courseCol: 'rgba(90,86,78,0.25)', snapTie: 'rgba(70,66,60,0.30)',   // board-form marks + ties
      tints: [0xb9b3a6, 0xaba498, 0xc4bfb2, 0xa8a9a6, 0x9b9a94],
      nightDensity: 0.28, warm: '#ffc98a', cool: '#cfe0ff', warmFrac: 0.84, nightMul: 0.70 },

    { key: 'RETAIL', seed: 2010, frame: '#2c3036', spandrel: null, glassHi: '#cfd8d4', glassLo: '#8fa39c',
      lites: 2, margin: 4, mullion: 4, glassTop: 4, glassBot: 214, sill: null, revealA: 0.04, grain: 0,
      // Awnings sit on the podium band of EVERY building, so they are the one accent colour you
      // read from the water. Canvas in the weather, not vinyl in a catalogue — the fire-engine
      // red used here was the last thing making low blocks flare orange from the air.
      awning: { y: 4, h: 22, palette: ['#a8503f', '#c0883e', '#3d6a99', '#3f7a54', '#2b5c50'] },
      fascia: { y: 226, h: 10, col: '#1a1d21' },
      tints: [0xc0bdb6, 0xadaaa3, 0xb6b3ac],   // RETAIL's famNorm is ~1.9: above ~0xc0 they all clip to one grey
      nightDensity: 0.85, warm: '#ffdca8', cool: '#cfe0ff', warmFrac: 0.90, nightMul: 0.62 },
  ];
  for (const f of FAM) Object.freeze(f);
  Object.freeze(FAM);
  CITY.FAM = FAM;

  // ---- tiny colour helpers for the canvas painters (strings, not THREE.Color) ----
  const hx = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  function mixHex(a, b, t) {
    const A = hx(a), B = hx(b);
    return `rgb(${(A[0] + (B[0] - A[0]) * t) | 0},${(A[1] + (B[1] - A[1]) * t) | 0},${(A[2] + (B[2] - A[2]) * t) | 0})`;
  }
  function dimHex(a, k) { const A = hx(a); return `rgb(${A[0] * k | 0},${A[1] * k | 0},${A[2] * k | 0})`; }

  function speckle(ctx, rng, a) {                 // stone grain: additive salt-and-pepper
    const dark = `rgba(0,0,0,${a})`, lite = `rgba(255,255,255,${(a * 0.8).toFixed(3)})`;
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = (i & 1) ? dark : lite;
      ctx.fillRect(rng() * 256, rng() * 256, 2, 2);
    }
  }
  function runningBond(ctx, rng, S) {
    const B = S.brick, BW = 21, BH = 9;
    ctx.fillStyle = B.mortar; ctx.fillRect(0, 0, 256, 256);
    for (let row = 0, y = 0; y < 256; y += BH, row++) {
      const off = (row & 1) ? -BW / 2 : 0;
      for (let x = off; x < 256; x += BW) {
        ctx.fillStyle = mixHex(B.a, B.b, rng());
        ctx.fillRect(x + 1, y + 1, BW - 1, BH - 1);
      }
    }
  }

  // The shared painter. Draw order matters: step 6 (the reveal shadow on the head and the LEFT
  // jamb only) is what tells the eye a window is set INTO a wall rather than printed on it.
  // One consistent shadow side implies one light direction; with the sun in the SW, shade left.
  function facadeTile(S) {
    const tex = U().canvasTexture(256, 256, (ctx) => {
      const rng = U().mulberry(S.seed);
      ctx.fillStyle = S.frame; ctx.fillRect(0, 0, 256, 256);
      if (S.brick) runningBond(ctx, rng, S);
      if (S.grain) speckle(ctx, rng, S.grain);
      if (S.spandrel) { ctx.fillStyle = S.spandrel; ctx.fillRect(0, S.glassBot, 256, 256 - S.glassBot); }
      const pitch = (256 - 2 * S.margin) / S.lites;
      for (let i = 0; i < S.lites; i++) {
        const x0 = S.margin + i * pitch + S.mullion;
        const w = pitch - 2 * S.mullion;
        const g = ctx.createLinearGradient(0, S.glassTop, 0, S.glassBot);
        g.addColorStop(0, S.glassHi); g.addColorStop(1, S.glassLo);
        ctx.fillStyle = g; ctx.fillRect(x0, S.glassTop, w, S.glassBot - S.glassTop);
        const j = 0.86 + rng() * 0.28;                     // per-lite brightness: blinds up or down
        ctx.fillStyle = j < 1 ? `rgba(0,0,0,${(1 - j).toFixed(3)})` : `rgba(255,255,255,${(j - 1).toFixed(3)})`;
        ctx.fillRect(x0, S.glassTop, w, S.glassBot - S.glassTop);
        if (S.revealA > 0) {
          ctx.fillStyle = `rgba(0,0,0,${S.revealA})`;
          ctx.fillRect(x0, S.glassTop, w, 5);
          ctx.fillRect(x0, S.glassTop, 5, S.glassBot - S.glassTop);
        }
        if (S.lintel) { ctx.fillStyle = S.lintel; ctx.fillRect(x0 - 2, S.glassTop - 7, w + 4, 7); }
        if (S.sill) { ctx.fillStyle = S.sill; ctx.fillRect(x0 - 3, S.glassBot, w + 6, 6); }
        if (S.centreRib) { ctx.fillStyle = S.centreRib; ctx.fillRect(x0 + w / 2 - 2, S.glassTop, 4, S.glassBot - S.glassTop); }
        if (S.awning) {
          ctx.fillStyle = S.awning.palette[(rng() * S.awning.palette.length) | 0];
          ctx.fillRect(x0 - 2, S.awning.y, w + 4, S.awning.h);
        }
      }
      if (S.courseH) {
        ctx.fillStyle = S.courseCol;
        for (let y = S.courseH; y < 256; y += S.courseH) ctx.fillRect(0, y, 256, 1);
      }
      if (S.snapTie) {
        ctx.fillStyle = S.snapTie;
        for (let y = 32; y < 256; y += 64) for (let x = 32; x < 256; x += 64) ctx.fillRect(x, y, 3, 3);
      }
      if (S.ornament) {
        const O = S.ornament;
        for (let x = 0; x < 256; x += 8) { ctx.fillStyle = ((x / 8) & 1) ? O.a : O.b; ctx.fillRect(x, O.y, 8, O.h); }
      }
      if (S.fascia) { ctx.fillStyle = S.fascia.col; ctx.fillRect(0, S.fascia.y, 256, S.fascia.h); }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    return tex;
  }

  // Night emissive: same grid, same lite rectangles, so it registers exactly with the albedo.
  function nightTile(S) {
    const tex = U().canvasTexture(256, 256, (ctx) => {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 256, 256);
      const rng = U().mulberry(S.seed ^ 0x9e37);
      const pitch = (256 - 2 * S.margin) / S.lites;
      for (let i = 0; i < S.lites; i++) {
        if (rng() > S.nightDensity) continue;
        const x0 = S.margin + i * pitch + S.mullion, w = pitch - 2 * S.mullion;
        let c = rng() < S.warmFrac ? S.warm : S.cool;
        // Offices are not all lit to the same level. Without this spread every lit pane clips
        // to white under emissiveIntensity 1.35 and the tower renders as one bloomed slab.
        let k = 0.42 + rng() * 0.44;
        if (rng() < 0.14) k *= 0.32;                       // corridor / emergency lighting, way down
        ctx.fillStyle = dimHex(c, k);
        ctx.fillRect(x0 + 2, S.glassTop + 2, w - 4, S.glassBot - S.glassTop - 4);
      }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    return tex;
  }

  const famMats = new Array(FAM.length);
  function famMaterial(i) {
    if (famMats[i]) return famMats[i];
    const S = FAM[i];
    const o = {
      vertexColors: true, map: facadeTile(S),
      emissiveMap: nightTile(S), emissive: 0xffffff, emissiveIntensity: 0,   // theme raises this at night
    };
    let m;
    if (S.shininess) { o.shininess = S.shininess; o.specular = new THREE.Color(S.specular); m = new THREE.MeshPhongMaterial(o); }
    else m = new THREE.MeshLambertMaterial(o);
    m.userData.nightMul = S.nightMul;
    m.userData.family = i;
    famMats[i] = m;
    return m;
  }

  // The tile already carries the family's colour, and the vertex tint carries the building's:
  // multiplied together, a dark family (MIES frame #17191c, GREENGLASS #3f5a54) lands below
  // #17191c, i.e. pure black, which breaks the "nothing pure black" rule and erases the
  // polarity work. Divide the tint by the tile's own luminance so the product lands on the
  // authored hex. Hue is untouched — only the level — so the families still read apart.
  const famNorms = new Array(FAM.length), famLuma = new Array(FAM.length);
  function famNorm(i) {
    if (famNorms[i]) return famNorms[i];
    const img = famMaterial(i).map.image;
    const d = img.getContext('2d').getImageData(0, 0, img.width, img.height).data;
    let sum = 0;
    for (let p = 0; p < d.length; p += 4) sum += 0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2];
    famLuma[i] = Math.max(0.04, sum / (d.length / 4) / 255);
    famNorms[i] = U().clamp(1 / famLuma[i], 1, 6);
    return famNorms[i];
  }
  CITY.famNorm = famNorm;
  CITY.famNormalize = function (geo, f) {
    const i = f | 0, k = famNorm(i), col = geo.attributes.color;
    if (!col) return geo;
    // Rule 9: nothing pure black. A near-black hex (Willis 0x191c20) on a near-black tile
    // (MIES frame #17191c) multiplies to nothing at all, and a tower with no facade left in it
    // is a cut-out, not a building. Floor the product at roughly #2a2d31.
    const minV = 0.050 / famLuma[i];
    for (let n = 0; n < col.count; n++) {
      let r = col.getX(n) * k, g = col.getY(n) * k, b = col.getZ(n) * k;
      const lu = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lu > 1e-5 && lu < minV) { const s = minV / lu; r *= s; g *= s; b *= s; }
      col.setXYZ(n, Math.min(1, r), Math.min(1, g), Math.min(1, b));
    }
    col.needsUpdate = true;
    return geo;
  };

  // fam undefined → family 0 CURTAIN, so every existing zero-arg caller keeps working
  CITY.material = function (fam) {
    const i = (fam === undefined || fam === null || !FAM[fam | 0]) ? 0 : (fam | 0);
    return famMaterial(i);
  };
  CITY.materials = function () {
    for (let i = 0; i < FAM.length; i++) famMaterial(i);
    return famMats;
  };

  // ===================== DISTRICT MIX =====================
  // Chicago builds in legible eras AND in legible neighbourhoods, and the second is the one
  // that decides whether the city reads as Chicago from the water. Downtown is grey-white
  // Indiana limestone, black anodised Mies steel, buff brick, board-formed concrete, bronze
  // and green glass. Common brick is everywhere REAL, but it belongs to the shorter, older
  // loft and warehouse stock — Fulton Market, River North behind the Mart, Printer's Row —
  // not to the towers standing on the Loop bank.

  // x of the river's west bank at this z: the North Branch running up toward Goose Island,
  // the South Branch straight down the Loop's west edge, then its swing east past Chinatown.
  function branchX(z) {
    if (z < 122) return -655 - (122 - z) * 0.55;
    if (z < 1000) return -655;
    return -655 + Math.min(280, (z - 1000) * 0.30);
  }
  // z of the Main Stem: the dogleg into Wolf Point, dead straight past the Mart and Marina
  // City, then the bend south under Michigan Avenue out to the lock.
  function stemZ(x) {
    if (x < -466) return 122 - (x + 655) * 0.46;
    if (x < 200) return 32;
    if (x < 400) return 32 - (x - 200) * 0.76;
    return -100;
  }

  const D_STEM = 0, D_LOOP = 1, D_NORTH = 2, D_EAST = 3, D_WEST = 4, D_SOUTH = 5;
  function district(x, z) {
    // the two banks you actually race between get their own mix — this is the postcard wall
    if (x > -780 && x < 1980 && Math.abs(z - stemZ(x)) < 210) return D_STEM;
    if (x < branchX(z) - 30) return D_WEST;                 // Fulton Market / West Loop
    if (z > 1750) return D_SOUTH;                           // South Loop / Printer's Row
    // Streeterville stops around Chicago Avenue; past it Old Town, the Gold Coast and Lincoln
    // Park are greystone and brick low-rise with glass towers only on the Drive.
    if (z < stemZ(x)) return (x > 430 && z > -1500) ? D_EAST : D_NORTH;
    return D_LOOP;
  }

  // Weights per family index, four height bands: <28 m, <75 m, <170 m, tower.
  // 0 CURTAIN · 1 MIES · 2 LIMESTONE · 3 BRICK · 4 TERRACOTTA
  // 5 PINKGRANITE · 6 GREENGLASS · 7 BLUEGLASS · 8 CONCRETE · 9 RETAIL
  const MIX = [
    [ // D_STEM — Wacker Drive and the north bank: Mart, Marina City, IBM, 333 W Wacker
      [2, 26, 9, 16, 3, 16, 4, 14, 8, 14, 0, 8, 1, 6],
      [2, 28, 8, 16, 4, 14, 0, 14, 3, 12, 1, 10, 6, 6],
      [0, 24, 2, 22, 1, 16, 8, 14, 7, 12, 4, 6, 6, 6],
      [0, 26, 2, 18, 1, 16, 7, 16, 8, 14, 6, 10],
    ],
    [ // D_LOOP — limestone canyons, State Street, the Board of Trade
      [2, 26, 4, 16, 9, 14, 3, 14, 8, 12, 0, 8, 1, 6, 5, 4],
      [2, 30, 4, 18, 8, 14, 0, 10, 3, 10, 1, 8, 5, 6, 6, 4],
      [2, 26, 0, 20, 1, 14, 8, 12, 4, 10, 7, 8, 5, 6, 6, 4],
      [0, 24, 1, 18, 2, 18, 7, 14, 8, 10, 6, 8, 5, 8],
    ],
    [ // D_NORTH — River North / Near North: the loft blocks, then the new glass over them
      [3, 40, 2, 16, 9, 12, 8, 12, 4, 12, 0, 4, 1, 4],
      [3, 32, 2, 18, 8, 16, 4, 12, 0, 12, 1, 6, 6, 4],
      [0, 22, 2, 18, 8, 16, 7, 12, 3, 12, 1, 12, 6, 8],
      [0, 26, 7, 22, 1, 16, 2, 14, 8, 12, 6, 10],
    ],
    [ // D_EAST — Streeterville and the Mag Mile: newest and glassiest, white stone at the base
      [2, 26, 9, 20, 4, 16, 0, 14, 3, 12, 8, 12],
      [2, 28, 0, 20, 4, 14, 8, 14, 3, 10, 1, 8, 7, 6],
      [0, 26, 7, 18, 2, 18, 8, 14, 1, 10, 6, 8, 5, 6],
      [0, 28, 7, 24, 1, 14, 2, 14, 6, 10, 8, 10],
    ],
    [ // D_WEST — Fulton Market and the West Loop: this is where the brick actually lives
      [3, 50, 8, 18, 9, 12, 2, 10, 4, 6, 1, 4],
      [3, 40, 8, 22, 2, 14, 0, 10, 4, 8, 1, 6],
      [8, 24, 3, 22, 0, 20, 2, 14, 1, 10, 7, 10],
      [0, 28, 7, 20, 8, 18, 1, 14, 2, 12, 6, 8],
    ],
    [ // D_SOUTH — Printer's Row and the South Loop: heavy masonry, then concrete residential
      [3, 42, 2, 16, 8, 16, 9, 12, 4, 10, 1, 4],
      [3, 34, 2, 20, 8, 18, 0, 12, 4, 10, 1, 6],
      [8, 26, 0, 20, 3, 18, 2, 16, 7, 12, 1, 8],
      [0, 28, 8, 22, 7, 18, 1, 12, 2, 12, 6, 8],
    ],
  ];
  // expanded once into flat pick-bags so the choice below costs exactly ONE rng draw —
  // change that count and every building in the city shifts.
  const BAGS = MIX.map((d) => d.map((spec) => {
    const bag = [];
    for (let i = 0; i < spec.length; i += 2) for (let k = 0; k < spec[i + 1]; k++) bag.push(spec[i]);
    return bag;
  }));

  CITY.pickFamily = function (rng, h, x, z) {
    const band = h < 28 ? 0 : h < 75 ? 1 : h < 170 ? 2 : 3;
    const bag = BAGS[district(x, z)][band];
    return bag[(rng() * bag.length) | 0];
  };

  // solid (windowless) vertex-colored material for walls, roofs, piers
  let flatMat;
  CITY.flatMaterial = function () {
    if (!flatMat) flatMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    return flatMat;
  };

  // Chicago floodlights its riverfront landmarks from below. Cheapest correct model is one
  // additive shell, not lights: the vertex-colour falloff with height IS the effect.
  CITY.floodShell = function (geoms) {
    if (!geoms || !geoms.length) return null;
    const m = new THREE.Mesh(mergeGeoms(geoms), new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: true,
    }));
    m.renderOrder = 2;
    m.layers.set(1);                          // additive shells in the reflection pass = ghost blobs
    m.visible = false;                        // Theme turns it on for dusk + night
    return m;
  };

  // Upper Wacker / street grid sits a full level (~20 ft) above the river, matching the
  // bascule bridge decks — the river runs in a trough down at water level.
  const GROUND_Y = 6.0;
  CITY.GROUND_Y = GROUND_Y;

  // the Loop street module: everything planted on the grid (filler towers, the ground texture)
  // reads off these, so the painted carriageway lands in the gap the towers leave
  const BLOCK_W = 96, STREET_W = 22, BLOCK_PITCH = BLOCK_W + STREET_W;

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
    // What you see between the towers IS the street grid, so paint the real module rather than
    // graph paper: 96 m blocks on a 118 m pitch — exactly the grid the filler-tower field below
    // is planted on, so the carriageway always lands in the gap between buildings. Chicago's grid
    // is true north-south, which is why the diagonal river reads as a cut across it.
    const GROUND_UV = BLOCK_PITCH;                     // one texture tile = one block + one street
    const groundTex = U().canvasTexture(256, 256, (ctx, w, h) => {
      const S = w / BLOCK_PITCH;                       // px per metre
      const s0 = (BLOCK_W / 2) * S, s1 = (BLOCK_W / 2 + STREET_W) * S;   // street band, px
      const walk = 4 * S;                              // sidewalk each side of the carriageway
      ctx.fillStyle = '#63645b'; ctx.fillRect(0, 0, w, h);              // block interior: alleys, lots, low roofs
      const g = U().mulberry(99);
      for (let i = 0; i < 1400; i++) {                 // grain, so the flat areas are never dead flat
        const v = 78 + g() * 30;
        ctx.fillStyle = `rgba(${v},${v + 3},${v - 2},0.45)`;
        ctx.fillRect(g() * w, g() * h, 2 + g() * 3, 2 + g() * 3);
      }
      ctx.fillStyle = '#8b8879';                       // concrete walk on both kerb lines
      ctx.fillRect(s0, 0, s1 - s0, h); ctx.fillRect(0, s0, w, s1 - s0);
      ctx.fillStyle = '#3e4147';                       // asphalt carriageway (drawn last: owns the intersection)
      ctx.fillRect(s0 + walk, 0, s1 - s0 - walk * 2, h);
      ctx.fillRect(0, s0 + walk, w, s1 - s0 - walk * 2);
      ctx.strokeStyle = 'rgba(196,176,96,0.30)';       // centre line, faint enough to never alias into a stripe
      ctx.lineWidth = Math.max(1, 0.4 * S);
      ctx.setLineDash([5 * S, 4 * S]);
      const mid = (s0 + s1) / 2;
      ctx.beginPath(); ctx.moveTo(mid, 0); ctx.lineTo(mid, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();
      ctx.setLineDash([]);
    });
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
    const groundMat = new THREE.MeshLambertMaterial({ map: groundTex, color: 0x9aa0a6 });

    // apron ribbons: from the quay line out to ~130 m, following each channel exactly, sampled at
    // every resample point so the strip hugs concave bends instead of chording across them.
    //
    // A rib is a ray straight across the bank, and the apron owns only the unbroken DRY run of it
    // that starts at the quay line. Testing the two ends and keeping or dropping the rib whole is
    // not enough at Wolf Point: three channels meet there, so a 130 m ray leaves land, crosses the
    // North Branch and comes down dry again on its far bank. So the ray is walked out and clipped
    // at the water's edge. A rib whose quay-line end is already wet contributes nothing at all —
    // not even unindexed vertices, which still put 27 m of street-level slab over the channel in
    // the position buffer (and so in the mesh's bounds) even with no triangle referencing them.
    const openX = C.lake.openWaterX;
    const APRON_IN = 9;                  // upper street sits behind the lower promenade (Riverwalk owns w..w+9)
    const APRON_OUT = 130;
    // No downtown channel is narrower than ~48 m across, so a crossing can never hide between
    // samples this close together; four bisections then land the cut within ~1.5 m of the bank.
    const APRON_SAMPLES = 6;
    function apronReach(px, pz, nx, nz, d0, d1) {
      const dry = (d) => {
        const x = px + nx * d, z = pz + nz * d;
        return x < openX - 6 && landClearance(x, z) > 0;
      };
      if (d1 <= d0 || !dry(d0)) return d0;
      let lo = d0;
      for (let k = 1; k <= APRON_SAMPLES; k++) {
        const d = d0 + (d1 - d0) * (k / APRON_SAMPLES);
        if (dry(d)) { lo = d; continue; }
        let hi = d;
        for (let b = 0; b < 4; b++) { const m = (lo + hi) / 2; if (dry(m)) lo = m; else hi = m; }
        return lo;
      }
      return d1;
    }

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
          const nx = -tz * s, nz = tx * s;
          const inner = p.w[i] + APRON_IN;
          const outer = apronReach(p.x[i], p.z[i], nx, nz, inner, p.w[i] + APRON_OUT);
          const ok = outer > inner + 6;    // a sliver of bank is not worth a quad
          if (ok) {
            const ix = p.x[i] + nx * inner, iz = p.z[i] + nz * inner;
            const ox = p.x[i] + nx * outer, oz = p.z[i] + nz * outer;
            verts.push(ix, GROUND_Y, iz, ox, GROUND_Y, oz);
            uvs.push(ix / GROUND_UV, iz / GROUND_UV, ox / GROUND_UV, oz / GROUND_UV);
            if (vi >= 2 && prevOK) {
              if (s === 1) idx.push(vi - 2, vi - 1, vi, vi - 1, vi + 1, vi);
              else idx.push(vi - 2, vi, vi - 1, vi - 1, vi, vi + 1);
            }
            vi += 2;
          }
          prevOK = ok;
        }
        if (!idx.length) continue;
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
          // rotateX(-90°) sends the plane's +v to world -z, so v must be negated or every cell
          // mirrors its neighbour and the street grid breaks at each 64 m tile seam
          for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + (uv.getX(i) - 0.5) * CELL) / GROUND_UV, (cz - (uv.getY(i) - 0.5) * CELL) / GROUND_UV);
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
    // Two canopy layers, because one sphere on a stick is a lollipop and two is a tree: the
    // upper mass is offset and lighter, so the silhouette breaks and the light has a top side.
    // Second layer only within 260 m of a centreline — past that it is fog, not foliage.
    function treeAt(arr, px, pz, scale) {
      const s = scale || 1;
      const trunk = new THREE.CylinderGeometry(0.22 * s, 0.34 * s, 3.2 * s, 5);
      trunk.translate(px, GROUND_Y + 1.6 * s, pz);
      tintGeom(trunk, 0x4a3524, 0, rng); arr.push(trunk);
      const r = (2.1 + rng() * 1.5) * s;
      const lower = new THREE.SphereGeometry(r, 7, 6);
      lower.scale(1, 0.72, 1);
      lower.translate(px, GROUND_Y + 3.6 * s, pz);
      tintGeom(lower, 0x3f6a30, 0.18, rng); arr.push(lower);
      if (landClearance(px, pz) < 260) {
        const upper = new THREE.SphereGeometry(r * 0.72, 7, 6);
        upper.translate(px + (rng() - 0.5) * r * 0.5, GROUND_Y + 5.4 * s, pz + (rng() - 0.5) * r * 0.5);
        tintGeom(upper, 0x5d8a42, 0.18, rng); arr.push(upper);
      }
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
    const BLOCK = BLOCK_W, STREET = STREET_W;
    const famGeoms = FAM.map(() => []);   // window-mapped tower shells, bucketed by facade family
    const detailGeoms = [];    // flat: cornices, rooftop clutter, park ground, plazas
    const dressGeoms = [];     // flat: trees, lamps, benches, planters
    const lm = C.landmarks;
    const cx0 = C.generic.loopCenter.x, cz0 = C.generic.loopCenter.z;
    const MASONRY = { 2: 1, 3: 1, 4: 1, 5: 1, 8: 1 };
    const AO0 = GROUND_Y, AO1 = GROUND_Y + 16;
    const antennaCell = new Map();        // one mast per 600 m cell, on its tallest building

    function shade(hex, k) {
      const r = Math.min(255, ((hex >> 16) & 255) * k) | 0;
      const g = Math.min(255, ((hex >> 8) & 255) * k) | 0;
      const b = Math.min(255, (hex & 255) * k) | 0;
      return (r << 16) | (g << 8) | b;
    }
    function flatBox(w, h, d, cx, cy, cz, hex, rot) {
      const g = new THREE.BoxGeometry(w, h, d);
      if (rot) g.rotateY(rot);
      g.translate(cx, cy, cz);
      tintGeom(g, hex, 0, rng);
      detailGeoms.push(g);
      return g;
    }

    // A box that ends in a flat top face is a bug. Masonry gets band course / parapet / coping;
    // glass gets a louvred plant floor and a parapet fin.
    function crown(cx, cz, topY, w, d, fam, tint, rot) {
      if (MASONRY[fam]) {
        flatBox(w + 1.4, 0.55, d + 1.4, cx, topY - 2.6, cz, shade(tint, 1.08), rot);
        flatBox(w + 0.5, 2.30, d + 0.5, cx, topY - 1.15, cz, shade(tint, 0.94), rot);
        flatBox(w + 1.0, 0.35, d + 1.0, cx, topY + 0.18, cz, shade(tint, 1.14), rot);
      } else {
        flatBox(w - 0.6, 3.20, d - 0.6, cx, topY + 1.6, cz, 0x4a5057, rot);
        flatBox(w + 0.3, 0.90, d + 0.3, cx, topY + 3.6, cz, 0x2f343a, rot);
      }
    }

    // Vertical fins. A flat wall stops being flat the moment it has a shadow every 9 m —
    // only worth the triangles where you can actually see it from the water.
    function pilasters(cx, cz, w, d, h, tint) {
      const along = w >= d ? w : d;
      const n = Math.min(4, 1 + Math.floor(along / 9));
      if (n < 2) return;
      const step = along / n;
      for (let k = 1; k < n; k++) {
        const o = -along / 2 + k * step;
        if (w >= d) {
          for (const s of [-1, 1]) flatBox(0.55, h, 0.35, cx + o, GROUND_Y + h / 2, cz + s * (d / 2 + 0.10), shade(tint, 0.88));
        } else {
          for (const s of [-1, 1]) flatBox(0.35, h, 0.55, cx + s * (w / 2 + 0.10), GROUND_Y + h / 2, cz + o, shade(tint, 0.88));
        }
      }
    }

    // Weighted roof kit. The wooden tank on a low masonry loft is the single most Chicago
    // object on a roof, and the red obstruction lights cost nothing at all.
    // `tier` is the visibility band: 2 = on the water, 1 = mid, 0 = deep inland. There are ~3300
    // filler buildings, so the full kit everywhere costs a third of a million triangles for
    // roof furniture nobody can resolve past the second block.
    function roofKit(cx, cz, topY, w, d, h, fam, tier) {
      const mn = Math.min(w, d);
      const eo = mn * 0.30;
      flatBox(eo, 4.2, eo, cx + (rng() - 0.5) * w * 0.4, topY + 2.1, cz + (rng() - 0.5) * d * 0.4, 0x6b7178);
      if (h > 180 && RR.Theme) RR.Theme.addLamp(cx, topY + 1.2, cz, 0xff2a1e);
      if (tier === 0) return;
      if (h > 55 && rng() < (tier === 2 ? 0.55 : 0.30)) {
        const rad = 1.4 + rng() * 1.2, th = 2.6 + rng() * 1.4;
        const tx = cx + (rng() - 0.5) * w * 0.4, tz = cz + (rng() - 0.5) * d * 0.4;
        const g = new THREE.CylinderGeometry(rad, rad, th, 8);
        g.translate(tx, topY + th / 2, tz);
        tintGeom(g, 0x51565c, 0.10, rng); detailGeoms.push(g);
        const hood = new THREE.CylinderGeometry(rad * 0.9, rad * 0.9, 0.5, 8);
        hood.translate(tx, topY + th + 0.25, tz);
        tintGeom(hood, 0x3f444a, 0, rng); detailGeoms.push(hood);
      }
      if (h > 90 && rng() < 0.60) {
        const pw = w * (0.30 + rng() * 0.25), pd = d * (0.30 + rng() * 0.25), ph = 3.0 + rng() * 4.5;
        const px = cx + (rng() - 0.5) * w * 0.25, pz = cz + (rng() - 0.5) * d * 0.25;
        flatBox(pw, ph, pd, px, topY + ph / 2, pz, 0x666c72);
        flatBox(pw - 0.3, 0.9, pd - 0.3, px, topY + ph * 0.72, pz, 0x2b2f34);     // louvre band
      }
      if (tier < 2) return;
      // the wooden tank on a low brick loft — the roofscape detail everyone recognises.
      // The draw happens BEFORE the family test on purpose: short-circuiting past it made the
      // rng stream depend on the facade mix, so re-balancing the palette relaid out the city.
      if (h < 80 && rng() < 0.45 && (fam === 2 || fam === 3 || fam === 4)) {
        const tx = cx + (rng() - 0.5) * w * 0.3, tz = cz + (rng() - 0.5) * d * 0.3;
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2 + 0.79;
          flatBox(0.18, 2.6, 0.18, tx + Math.cos(a) * 1.35, topY + 1.3, tz + Math.sin(a) * 1.35, 0x4a4034);
        }
        const barrel = new THREE.CylinderGeometry(1.7, 1.7, 3.6, 8);
        barrel.translate(tx, topY + 4.4, tz);
        tintGeom(barrel, 0x6e4c2e, 0.10, rng); detailGeoms.push(barrel);
        const hoop = new THREE.CylinderGeometry(1.76, 1.76, 0.16, 8);
        hoop.translate(tx, topY + 4.4, tz);
        tintGeom(hoop, 0x3a3a3c, 0, rng); detailGeoms.push(hoop);
        const cap = new THREE.ConeGeometry(1.85, 1.1, 8);
        cap.translate(tx, topY + 6.75, tz);
        tintGeom(cap, 0x4a4034, 0, rng); detailGeoms.push(cap);
      }
      if (rng() < 0.25) {                                                          // parapet davit
        const dx = cx + (w / 2 - 1.2) * (rng() < 0.5 ? -1 : 1), dz = cz + (rng() - 0.5) * d * 0.5;
        flatBox(0.14, 2.2, 0.14, dx, topY + 1.1, dz, 0x585d63);
        flatBox(1.6, 0.14, 0.14, dx + 0.8, topY + 2.2, dz, 0x585d63);
      }
    }

    // place one building, footprint keep-out checked; returns true if placed
    function placeBuilding(bxx, bzz, w, d, dLoop, loRise) {
      const halfDiag = Math.hypot(w, d) * 0.5;
      const clear = landClearance(bxx, bzz);
      if (clear < halfDiag + 2) return false;                            // whole footprint on dry land
      if (bxx > C.lake.openWaterX - halfDiag - 18) return false;
      let h;
      if (loRise) h = 14 + rng() * 46;
      else h = (20 + rng() * rng() * 165) * U().clamp(1.4 - dLoop / 2100, 0.3, 1.2);
      if (clear < 70) h = Math.min(h, 34 + rng() * 60);                  // step down toward the water
      h = Math.max(11, h);

      const fam = CITY.pickFamily(rng, h, bxx, bzz);
      const T = FAM[fam].tints;
      const tint = T[(rng() * T.length) | 0];
      const masonry = !!MASONRY[fam];
      let topW = w, topD = d, topRot = 0;

      function shaft(sw, sd, y0, hh, rot) {
        const g = towerGeom(sw, hh, sd, bxx, bzz, rot);
        g.translate(0, GROUND_Y + y0, 0);
        tintGeomAO(g, tint, 0.16, rng, AO0, AO1, 0.66, 1.06);
        CITY.famNormalize(g, fam);
        famGeoms[fam].push(g);
      }

      if (masonry && h > 120) {
        // the 1923 zoning ordinance, which is why the pre-war skyline is a field of ziggurats
        shaft(w, d, 0, h * 0.62, 0);
        shaft(w * 0.72, d * 0.72, h * 0.62, h * 0.24, 0);
        shaft(w * 0.46, d * 0.46, h * 0.86, h * 0.14, 0);
        topW = w * 0.46; topD = d * 0.46;
      } else if (!masonry && h > 150) {
        shaft(w, d, 0, h * 0.88, 0);
        shaft(w * 0.70, d * 0.70, h * 0.88, h * 0.12, Math.PI / 4);
        topW = w * 0.70; topD = d * 0.70; topRot = Math.PI / 4;
      } else {
        shaft(w, d, 0, h, 0);
      }

      // projecting retail podium + the canopy line: this is what makes street level read
      // from a boat, where you are looking UP at the first 8 m and nothing else
      const RT = FAM[9].tints;
      const band = towerGeom(w + 1.2, 4.5, d + 1.2, bxx, bzz, 0);
      band.translate(0, GROUND_Y, 0);
      tintGeomAO(band, RT[(rng() * RT.length) | 0], 0.10, rng, AO0, AO1, 0.66, 1);
      CITY.famNormalize(band, 9);
      famGeoms[9].push(band);

      const tier = clear < 260 ? 2 : clear < 820 ? 1 : 0;
      const topY = GROUND_Y + h;
      if (tier > 0) crown(bxx, bzz, topY, topW, topD, fam, tint, topRot);
      else flatBox(topW + 1.0, 1.1, topD + 1.0, bxx, topY - 0.35, bzz, shade(tint, 1.10), topRot);
      if (tier === 2) {
        flatBox(w + 2.0, 0.5, d + 2.0, bxx, GROUND_Y + 4.3, bzz, 0x3a3e44);       // canopy line
        if (h >= 60) pilasters(bxx, bzz, w, d, h, tint);
      }
      roofKit(bxx, bzz, topY, topW, topD, h, fam, tier);

      const ck = Math.round(bxx / 600) + ',' + Math.round(bzz / 600);
      const prev = antennaCell.get(ck);
      if (!prev || h > prev.h) antennaCell.set(ck, { h, x: bxx, z: bzz, topY, w: topW, d: topD });
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
        if (bz < -680 && bx > 250) continue;                             // Streeterville/Gold Coast: built by RR.Streeterville
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
      // Haze is thickest at ground level, so a uniformly-tinted box reads as a paper cut-out no
      // matter how good the fog is. Bake the aerial perspective INTO the vertex colour: fog at
      // the base, the tower's own hue at the top.
      const fogHex = (scene.fog && scene.fog.color) ? scene.fog.color.getHex() : 0xc3d2dd;
      const cF = new THREE.Color().setHex(fogHex);
      const ringHues = [0x8793a0, 0x9a8f7c, 0x7d8891, 0xa39a8a, 0x6b7480];
      const cH = new THREE.Color();
      function tintRing(g, hex) {
        cH.setHex(hex);
        const pos = g.attributes.position, n = pos.count;
        const col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const t = U().clamp(pos.getY(i) / 180, 0, 1);
          const k = 0.25 + 0.60 * t;
          _c.setRGB(cF.r + (cH.r - cF.r) * k, cF.g + (cH.g - cF.g) * k, cF.b + (cH.b - cF.b) * k);
          _c.convertSRGBToLinear();
          col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      }
      for (let a = 0; a < Math.PI * 2; a += 0.04) {
        const rad = 2750 + bRng() * 1000;
        const bx = cx0 + Math.cos(a) * rad, bz = cz0 + Math.sin(a) * rad;
        const w = 30 + bRng() * 64, d = 30 + bRng() * 64;
        // leave the lake horizon open AND never stand in the water — the east arc of this
        // ring used to plant a tan wall of towers straight across the river mouth
        if (bx > C.lake.openWaterX - 60) continue;
        if (landClearance(bx, bz) < Math.max(w, d) * 0.71 + 6) continue;
        // Nothing on the horizon may out-top Willis (442 m). Outside the Loop the real city tops
        // out around 180 m, and an untextured 640 m slab beating the actual skyline from the lake
        // reads as a rendering fault, not a distant tower.
        let h = 38 + Math.pow(bRng(), 2.4) * 200;
        if (bRng() < 0.06) h *= 1.55;                     // a few spikes break the mid-rise band
        h = Math.min(h, 240);
        const g = new THREE.BoxGeometry(w, h, d);
        g.translate(bx, h / 2, bz);
        tintRing(g, shade(ringHues[(bRng() * ringHues.length) | 0], 0.93 + bRng() * 0.14));
        backGeoms.push(g);
      }
      const back = new THREE.Mesh(mergeGeoms(backGeoms), CITY.flatMaterial());
      back.name = 'city-ring';
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

    // ---------- one antenna mast per 600 m cell, on that cell's tallest roof ----------
    for (const a of antennaCell.values()) {
      if (a.h < 55) continue;
      const ah = 12 + rng() * 22;
      const mast = new THREE.CylinderGeometry(0.10, 0.22, ah, 4);
      mast.translate(a.x, a.topY + ah / 2, a.z);
      tintGeom(mast, 0x2c2f33, 0, rng); detailGeoms.push(mast);
      for (let k = 0; k < 3; k++) {
        const ang = k * Math.PI * 2 / 3 + 0.4;
        const gx = a.x + Math.cos(ang) * a.w * 0.42, gz = a.z + Math.sin(ang) * a.d * 0.42;
        const len = Math.hypot(gx - a.x, gz - a.z, ah * 0.5);
        const guy = new THREE.CylinderGeometry(0.06, 0.06, len, 3);
        guy.rotateZ(Math.atan2(gx - a.x, ah * 0.5));
        guy.rotateY(-Math.atan2(gz - a.z, gx - a.x));
        guy.translate((a.x + gx) / 2, a.topY + ah * 0.25, (a.z + gz) / 2);
        tintGeom(guy, 0x2c2f33, 0, rng); detailGeoms.push(guy);
      }
      if (RR.Theme) RR.Theme.addLamp(a.x, a.topY + ah + 0.6, a.z, 0xff2a1e);
    }

    // ---------- merge everything into a few draw calls, bucketed by facade family ----------
    for (let f = 0; f < famGeoms.length; f++) {
      const bucket = famGeoms[f];
      for (let i = 0; i < bucket.length; i += 400) {
        const mesh = new THREE.Mesh(mergeGeoms(bucket.slice(i, i + 400)), CITY.material(f));
        mesh.name = 'city-fam' + f;
        mesh.castShadow = true; mesh.receiveShadow = true;
        scene.add(mesh);
      }
    }
    for (let i = 0; i < detailGeoms.length; i += 700) {
      const mesh = new THREE.Mesh(mergeGeoms(detailGeoms.slice(i, i + 700)), CITY.flatMaterial());
      mesh.name = 'city-detail';
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
    }
    for (let i = 0; i < dressGeoms.length; i += 700) {
      const mesh = new THREE.Mesh(mergeGeoms(dressGeoms.slice(i, i + 700)), CITY.flatMaterial());
      mesh.name = 'city-dress';
      mesh.castShadow = true;
      mesh.layers.set(1);              // street furniture skips the reflection pass
      scene.add(mesh);
    }
  };

  RR.City = CITY;
})();

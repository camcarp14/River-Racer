/* River Racer — POWER-UPS. Crates in the channel, eight items off the river, and a draw that is
   weighted by where you are running.

   The problem this solves is stated exactly: "so it's not just whoever gets out first." A lead in
   this game used to be arithmetic — the AI's rubber band is deliberately tiny at SKIPPER and
   exactly zero at LEGEND (ai.js), so once a boat was clear it stayed clear. Items are the other
   half of that answer: the leader draws a FENDER and something to hide behind, the tail draws the
   GALE and the GULLS. Nothing here makes a bad line fast. Everything here makes a lead a thing you
   have to keep holding.

   All of it is self-contained. race.js calls buildForRace / update / clear; a later agent hangs the
   HUD slot and the settings switch off the read-only API at the bottom. The AI's item brain lives
   HERE, not in ai.js, so no rival file has to move for the field to fight back.

   Determinism: placement and every draw come off RR.U.mulberry streams seeded from the course, so
   the same run rolls the same items. Math.random appears only inside the FX splashes. */
(function () {
  const PU = {};
  const U = () => RR.U;

  // ---------------------------------------------------------------------------------------------
  // THE ITEMS
  // ---------------------------------------------------------------------------------------------
  // kind is a hint for the HUD's icon treatment: 'self' buffs you, 'drop' leaves something astern,
  // 'burst' goes off around you, 'ahead' reaches up the road at the people beating you.
  //
  // front / mid / back are the DRAW WEIGHTS at 1st, mid-field and last. See rollFor().
  PU.ITEMS = [
    { id: 'turbo', name: 'TURBO', short: 'TURBO', kind: 'self', color: 0x25ff7a, glyph: '»',
      blurb: 'Full tank and a shove.', front: 30, mid: 26, back: 20 },
    { id: 'fender', name: 'FENDER', short: 'FENDER', kind: 'self', color: 0x7ec8e3, glyph: '◌',
      blurb: 'Eats the next hit or hazard.', front: 40, mid: 20, back: 8 },
    { id: 'slick', name: 'WAKE SLICK', short: 'SLICK', kind: 'drop', color: 0x2a3c4e, glyph: '≈',
      blurb: 'Dumped astern. Whoever finds it, spins.', front: 26, mid: 22, back: 10 },
    { id: 'dye', name: 'RIVER DYE', short: 'DYE', kind: 'drop', color: 0x2ecc71, glyph: '◉',
      blurb: 'The St Patrick’s green, in their eyes.', front: 16, mid: 20, back: 12 },
    { id: 'deepdish', name: 'DEEP DISH', short: 'DEEP DISH', kind: 'self', color: 0xffb03a, glyph: '●',
      blurb: 'You get heavy. They get moved.', front: 4, mid: 26, back: 20 },
    { id: 'bowwave', name: 'BOW WAVE', short: 'BOW WAVE', kind: 'burst', color: 0x9fe8ff, glyph: '(',
      blurb: 'Shoves everyone alongside off their line.', front: 2, mid: 20, back: 24 },
    { id: 'gulls', name: 'GULL SWARM', short: 'GULLS', kind: 'ahead', color: 0xf2f6f8, glyph: '^',
      blurb: 'A flock, over whoever is beating you.', front: 0, mid: 12, back: 26 },
    { id: 'gale', name: 'GALE OFF THE LAKE', short: 'GALE', kind: 'ahead', color: 0xbfe6ff, glyph: '≫',
      blurb: 'One gust. Everyone ahead loses their line.', front: 0, mid: 6, back: 30 },
  ];
  const BY_ID = {};
  for (const it of PU.ITEMS) BY_ID[it.id] = it;
  PU.byId = (id) => BY_ID[id] || null;

  // ---- every tunable, in one place ------------------------------------------------------------
  const K = {
    STATION_GAP: [210, 340],                // metres between crate rows (route length / 11, clamped)
    ROW_FRACS: [-0.62, -0.30, 0.30, 0.62],  // lateral, in channel widths. NEVER dead centre: taking
    // one has to be a line choice, and a crate on the racing line is not a choice.
    CRATE_R: 2.7,                           // grab radius on top of the hull radius
    AI_REACH: 4.5,                          // a rival reaches further; aiSteer() is the honest version
    RESPAWN: 7.0,
    ROLL_T: 0.85,                           // how long the slot spins before it locks (player only)
    SHIELD_T: 12.0,
    HEAVY_T: 7.0, HEAVY_MASS: 3.4, HEAVY_TOP: 0.93,
    SPIN_T: 0.95, SPIN_W: 3.0, SPIN_DRAG: 1.15,
    SLICK_T: 14.0, SLICK_R: 5.6, DROP_ARM: 0.9,
    DYE_T: 8.0, DYE_R0: 5.0, DYE_R1: 13.0, BLIND_T: 1.0,
    GULL_T: 3.0, GULL_RANGE: 240, GULL_MAX: 3,
    GALE_T: 1.2, GALE_ACC: 7.4, GALE_RANGE: 900,
    WAVE_R: 26, WAVE_PUSH: 9.5, WAVE_SELF: 3.2,
    TURBO_KICK: 7.0,
  };
  PU.K = K;

  // ---------------------------------------------------------------------------------------------
  // The switch. ON by default, and a refused localStorage costs you a preference, never a race.
  // ---------------------------------------------------------------------------------------------
  const SAVE_KEY = 'rr_powerups';
  let enabled = null;
  function readEnabled() {
    try {
      if (RR.Progress && RR.Progress.get) {
        const v = RR.Progress.get().powerups;
        if (v != null) return !!v;
      }
    } catch (e) { /* a save file is never worth a boot */ }
    try {
      const v = localStorage.getItem(SAVE_KEY);
      if (v != null) return v !== '0' && v !== 'false';
    } catch (e) { /* file:// may refuse storage outright */ }
    return true;
  }
  PU.enabled = function () { return enabled == null ? (enabled = readEnabled()) : enabled; };
  PU.setEnabled = function (on) {
    enabled = !!on;
    try { if (RR.Progress && RR.Progress.set) RR.Progress.set('powerups', enabled); } catch (e) { /* fine */ }
    try { localStorage.setItem(SAVE_KEY, enabled ? '1' : '0'); } catch (e) { /* fine */ }
    if (!enabled) dropEverything();
    if (group) group.visible = enabled;
    return enabled;
  };
  PU.toggle = function () { return PU.setEnabled(!PU.enabled()); };

  let difficulty = null;
  PU.setDifficulty = function (d) { difficulty = d == null ? null : +d; };
  function diff() {
    if (difficulty != null) return difficulty;
    try { if (RR.Menus && RR.Menus.difficulty) return RR.Menus.difficulty(); } catch (e) { /* fine */ }
    return 1;
  }

  // ---------------------------------------------------------------------------------------------
  // Scene objects. Seven instanced meshes and one screen quad, built once per race, torn down with
  // it. Everything sits on layer 1 — these are UI in world clothes and have no business in the
  // planar water reflection.
  // ---------------------------------------------------------------------------------------------
  let group = null, crateIM = null, haloIM = null, slickIM = null, dyeIM = null,
      fenderIM = null, heavyIM = null, ringIM = null, gullIM = null, galeMesh = null,
      overlay = null, overlayMat = null;
  let crates = [], slicks = [], dyes = [], rings = [];
  let S = null, drawRng = null, useHook = null;
  const M4 = new THREE.Matrix4(), Q0 = new THREE.Quaternion(), V3 = new THREE.Vector3(), SC = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
  const MAX_SLICK = 14, MAX_DYE = 10, MAX_RING = 8, MAX_AURA = 8, MAX_GULL = 24;

  const tint = (geo, hex) => (RR.City && RR.City.tintGeom ? RR.City.tintGeom(geo, hex) : geo);
  const merge = (list) => (RR.City && RR.City.mergeGeoms ? RR.City.mergeGeoms(list) : list[0]);

  // A crate has one job: read as GO THROUGH THIS from two hundred metres, and not read as a boost
  // gate (green) or a channel marker (red/green buoy). So: a gold service crate with hazard bands,
  // spinning on a white pontoon, standing inside a cyan ring painted on the water.
  function crateGeom() {
    const parts = [];
    const body = new THREE.BoxGeometry(2.0, 1.6, 2.0);
    body.translate(0, 1.35, 0);
    parts.push(tint(body, 0xffc233));
    for (const y of [0.72, 1.98]) {
      const band = new THREE.BoxGeometry(2.08, 0.26, 2.08);
      band.translate(0, y, 0);
      parts.push(tint(band, 0x12181f));
    }
    const pon = new THREE.CylinderGeometry(1.45, 1.6, 0.55, 10);
    pon.translate(0, 0.28, 0);
    parts.push(tint(pon, 0xe8eef2));
    return merge(parts);
  }
  // The halo does NOT turn with the crate: a ring rotating on the water reads as a propeller, and
  // the ring is the part that says "the gap is here".
  function haloGeom() {
    const ring = new THREE.RingGeometry(2.6, 3.6, 22);
    ring.rotateX(-Math.PI / 2);
    ring.translate(0, 0.12, 0);
    // tapered to a point, not a tube: a straight-sided column reads as a plastic pipe standing in
    // the river, a cone that thins out reads as a beacon
    const col = new THREE.CylinderGeometry(0.04, 1.15, 11, 9, 1, true);
    col.translate(0, 5.9, 0);
    return merge([ring, col]);
  }

  // Oil on water is not a grey disc, it is a dark centre with an iridescent rim — that rim is the
  // only reason anybody has ever spotted a slick, so it is what the texture is for.
  function slickTex() {
    return U().canvasTexture(96, 96, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      const g = c.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      g.addColorStop(0.00, 'rgba(6,10,16,0.96)');
      g.addColorStop(0.52, 'rgba(12,20,30,0.92)');
      g.addColorStop(0.70, 'rgba(86,50,120,0.80)');     // the sheen
      g.addColorStop(0.84, 'rgba(40,120,110,0.55)');
      g.addColorStop(1.00, 'rgba(20,40,50,0.0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(w / 2, h / 2, w / 2, 0, 6.283); c.fill();
    });
  }

  // streaks of ruffled water, feathered to nothing at every edge so the patch has no border
  function gustTex() {
    return U().canvasTexture(256, 128, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.strokeStyle = 'rgba(10,26,34,1)';
      c.lineCap = 'round';
      const rnd = U().mulberry(0x51ce);
      // opaque strokes: the patch alpha is the PRODUCT of the stroke, the feather and the material
      // opacity, so faint strokes multiply out to nothing at all
      for (let i = 0; i < 420; i++) {
        const y = rnd() * h, x = rnd() * w, len = 14 + rnd() * 74;
        c.globalAlpha = 0.55 + rnd() * 0.45;
        c.lineWidth = 1.2 + rnd() * 3.4;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + len, y + (rnd() - 0.5) * 4); c.stroke();
      }
      c.globalAlpha = 1;
      // feather: multiply the whole patch by a soft-edged ellipse, so the gust has no border
      c.globalCompositeOperation = 'destination-in';
      c.save();
      c.translate(w / 2, h / 2);
      c.scale(1, h / w);
      const g = c.createRadialGradient(0, 0, 4, 0, 0, w / 2);
      g.addColorStop(0.00, 'rgba(0,0,0,1)');
      g.addColorStop(0.62, 'rgba(0,0,0,0.86)');
      g.addColorStop(1.00, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(0, 0, w / 2, 0, 6.283); c.fill();
      c.restore();
    });
  }

  // A bare white quad orbiting a hull reads as a floating strip of paper. A herring gull is two
  // swept wings and almost no body, so that is what the sprite is.
  function gullTex() {
    return U().canvasTexture(96, 48, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = '#f7f9fb';
      c.beginPath();
      c.moveTo(w * 0.5, h * 0.60);
      c.quadraticCurveTo(w * 0.30, h * 0.16, w * 0.04, h * 0.30);
      c.quadraticCurveTo(w * 0.28, h * 0.44, w * 0.44, h * 0.72);
      c.quadraticCurveTo(w * 0.50, h * 0.86, w * 0.56, h * 0.72);
      c.quadraticCurveTo(w * 0.72, h * 0.44, w * 0.96, h * 0.30);
      c.quadraticCurveTo(w * 0.70, h * 0.16, w * 0.5, h * 0.60);
      c.fill();
      c.fillStyle = '#2b3a44';                       // the dark wingtips every herring gull has
      c.beginPath(); c.ellipse(w * 0.07, h * 0.31, w * 0.05, h * 0.05, 0, 0, 6.283); c.fill();
      c.beginPath(); c.ellipse(w * 0.93, h * 0.31, w * 0.05, h * 0.05, 0, 0, 6.283); c.fill();
    });
  }

  function instanced(geo, mat, count, order) {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
    m.count = count;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.layers.set(1);
    m.renderOrder = order || 0;
    for (let i = 0; i < count; i++) m.setMatrixAt(i, HIDE);
    m.instanceMatrix.needsUpdate = true;
    group.add(m);
    return m;
  }

  function buildScene(nCrates) {
    group = new THREE.Group();
    group.name = 'RR_POWERUPS';
    group.visible = PU.enabled();
    RR.Engine.scene.add(group);

    crateIM = instanced(crateGeom(),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05,
        emissive: 0x3a2a00, emissiveIntensity: 0.5 }), nCrates, 1);
    haloIM = instanced(haloGeom(),
      new THREE.MeshBasicMaterial({ color: 0x6ff0ff, transparent: true, opacity: 0.42,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), nCrates, 2);

    const disc = new THREE.CircleGeometry(1, 20);
    disc.rotateX(-Math.PI / 2);
    slickIM = instanced(disc,
      new THREE.MeshBasicMaterial({ map: slickTex(), transparent: true, opacity: 0.95,
        depthWrite: false, side: THREE.DoubleSide }), MAX_SLICK, 2);

    dyeIM = instanced(new THREE.SphereGeometry(1, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.46,
        depthWrite: false, side: THREE.DoubleSide }), MAX_DYE, 3);

    // A FENDER is a rubber ring bolted round a hull — so it is drawn as one. (It started life as a
    // glowing sphere and an additive ball over a jet ski is a white blob with a boat somewhere in
    // it: a thin torus at the waterline reads as equipment, and you can still see what you steer.)
    const torus = new THREE.TorusGeometry(1, 0.075, 6, 26);
    torus.rotateX(-Math.PI / 2);
    fenderIM = instanced(torus,
      new THREE.MeshBasicMaterial({ color: 0x2fc9ff, transparent: true, opacity: 0.34,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), MAX_AURA, 3);
    // Additive over sunlit water clips to white long before it clips to orange, so the alpha here
    // is what carries the COLOUR, not the brightness: at 0.85 the heavy ring read as a white hoop
    // and nobody could tell it from a fender at a glance.
    const heavy = new THREE.TorusGeometry(1, 0.17, 6, 26);
    heavy.rotateX(-Math.PI / 2);
    heavyIM = instanced(heavy,
      new THREE.MeshBasicMaterial({ color: 0xff7a00, transparent: true, opacity: 0.42,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), MAX_AURA, 3);

    const ringGeo = new THREE.RingGeometry(0.82, 1.0, 26);
    ringGeo.rotateX(-Math.PI / 2);
    ringIM = instanced(ringGeo,
      new THREE.MeshBasicMaterial({ color: 0xcfefff, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), MAX_RING, 3);

    gullIM = instanced(new THREE.PlaneGeometry(2.2, 1.1),
      new THREE.MeshBasicMaterial({ map: gullTex(), side: THREE.DoubleSide,
        transparent: true, opacity: 0.96, depthWrite: false }), MAX_GULL, 4);

    // THE CAT'S PAW. A gust on water is not spindrift — spindrift is what the gust throws off the
    // top. What you actually SEE, and what every sailor on this lake reads a squall by, is a dark
    // ruffled patch racing across the surface ahead of it. Without this the item was a scatter of
    // white dots on a pale green river and read as nothing at all.
    const paw = new THREE.PlaneGeometry(1, 1);
    paw.rotateX(-Math.PI / 2);
    const gtex = gustTex();
    gtex.wrapS = THREE.RepeatWrapping;
    galeMesh = new THREE.Mesh(paw, new THREE.MeshBasicMaterial({
      map: gtex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    galeMesh.frustumCulled = false;
    galeMesh.renderOrder = 2;
    galeMesh.layers.set(1);
    galeMesh.visible = false;
    group.add(galeMesh);

    buildOverlay();
  }

  // THE BLIND. A quad flown a metre in front of the lens — the only way to put green dye or a
  // faceful of gulls on the player's screen without touching post.js or the HUD's DOM. It costs a
  // draw call only while somebody is actually blinded.
  function buildOverlay() {
    overlayMat = new THREE.ShaderMaterial({
      // DoubleSide is load-bearing: the quad copies the camera's own quaternion, so its +z normal
      // points AWAY from the lens and a front-sided plane is culled to nothing.
      transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uDye: { value: 0 }, uGull: { value: 0 }, uTime: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uDye; uniform float uGull; uniform float uTime;
        varying vec2 vUv;
        float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
        float vn(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x),
                     mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float seg(vec2 p, vec2 a, vec2 b) {
          vec2 pa = p - a, ba = b - a;
          float h = clamp(dot(pa, ba) / max(1e-5, dot(ba, ba)), 0.0, 1.0);
          return length(pa - ba * h);
        }
        float bird(vec2 p, float f, float sc) {
          p /= sc;
          float body = smoothstep(0.010, 0.003, length(p * vec2(0.55, 1.6)));
          p.x = abs(p.x);
          float d = min(seg(p, vec2(0.0, 0.0), vec2(0.016, f * 0.013)),
                        seg(p, vec2(0.016, f * 0.013), vec2(0.034, f * 0.024 - 0.003)));
          return max(body, smoothstep(0.0075 * sc, 0.0015, d));
        }
        void main() {
          vec3 col = vec3(0.0);
          float a = 0.0;
          if (uDye > 0.001) {
            // Chicago dyes the river the Saturday before St Patrick's and it is FLUORESCENT.
            // Swirled, never flat: a flat wash reads as a bug, a moving one reads as being in it.
            vec2 q = vUv * 3.2 + vec2(uTime * 0.31, -uTime * 0.24);
            float n = vn(q) * 0.6 + vn(q * 2.7 - uTime * 0.2) * 0.4;
            float k = uDye * (0.62 + 0.38 * n);
            col += vec3(0.10, 0.78, 0.34) * k;
            a = max(a, clamp(k * 0.95, 0.0, 0.92));
          }
          if (uGull > 0.001) {
            float g = 0.0;
            for (int i = 0; i < 14; i++) {
              float fi = float(i);
              float sx = h21(vec2(fi, 3.0)), sy = h21(vec2(fi, 7.0)), sz = h21(vec2(fi, 11.0));
              vec2 c = vec2(fract(sx + uTime * (0.05 + sx * 0.11)) * 1.4 - 0.2,
                            sy * 0.80 + 0.10 + sin(uTime * (1.1 + sy) + fi) * 0.05);
              float f = sin(uTime * (9.0 + sx * 5.0) + fi * 2.1);
              // near birds are big and pale, far ones small and sharp — that spread is what makes
              // a handful of sprites read as a FLOCK you are flying into
              g = max(g, bird((vUv - c) * vec2(1.0, 0.62), f, 0.55 + sz * 1.5) * (0.55 + 0.45 * sz));
            }
            col = mix(col, vec3(0.86, 0.88, 0.90), clamp(g * uGull, 0.0, 1.0));
            a = max(a, clamp(g * uGull + uGull * 0.16, 0.0, 0.94));
          }
          if (a < 0.004) discard;
          gl_FragColor = vec4(col, a);
        }`,
    });
    overlay = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), overlayMat);
    overlay.frustumCulled = false;
    overlay.renderOrder = 900;
    overlay.layers.set(1);
    overlay.visible = false;
    // Placed at draw time, not at update time: the chase rig moves AFTER race.js runs, so a quad
    // posed during the sim step trails the lens by a frame and shows a sliver of clean world down
    // one edge — exactly the frame you are trying to take away. three computes modelViewMatrix
    // immediately after this callback, so a matrix written here is the one that gets drawn.
    overlay.onBeforeRender = function (r, scene, cam) {
      const d = 1.2;
      const hh = 2 * d * Math.tan(cam.fov * Math.PI / 360) * 1.06;
      overlay.scale.set(hh * cam.aspect, hh, 1);
      overlay.quaternion.copy(cam.quaternion);
      V3.set(0, 0, -d).applyQuaternion(cam.quaternion);
      overlay.position.copy(cam.position).add(V3);
      overlay.updateWorldMatrix(false, false);
    };
    group.add(overlay);
  }

  // ---------------------------------------------------------------------------------------------
  // Placement: rows across the channel, deterministic, never on the grid or on the flag.
  // ---------------------------------------------------------------------------------------------
  function planCrates(state) {
    const route = state.route;
    const out = [];
    if (!route || !route.len) return out;
    const gap = U().clamp(route.len / 11, K.STATION_GAP[0], K.STATION_GAP[1]);
    const rng = U().mulberry((0x9E3779B9 ^ ((state.courseIdx | 0) * 2654435761)) >>> 0);
    const pt = {};
    const tail = route.loop ? 0 : 90;
    let station = 0;
    for (let d = Math.max(gap * 0.75, route.loop ? 40 : 160); d < route.len - tail; d += gap, station++) {
      // alternate which end of the row runs wide, so consecutive rows read as a slalom rather than
      // a corridor you can hold one line through all race
      const flip = station % 2 ? -1 : 1;
      for (let i = 0; i < K.ROW_FRACS.length; i++) {
        const dd = U().clamp(d + (rng() - 0.5) * gap * 0.10, 4, route.len - 1);
        U().pathAt(route, dd, pt);
        // …and never more than 26 m off the centreline whatever the channel does. On the lake legs
        // the route is sixty metres wide and 0.62 of that is a detour nobody would ever take.
        const half = Math.min(26, Math.max(6, pt.w - 4));
        const off = U().clamp(K.ROW_FRACS[i] * flip * pt.w * 0.92, -half, half);
        const cx = pt.x + pt.tz * off, cz = pt.z - pt.tx * off;
        const wq = RR.River.waterQuery(cx, cz, null);
        if (!wq || wq.clear < 4.5) continue;      // a crate you cannot reach is worse than no crate
        out.push({ x: cx, z: cz, d: pt.d, t: 0, spin: rng() * 6.283, seed: rng() * 6.283, taken: false });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // THE DRAW. Weighted by race position: 1st gets a FENDER and something to hide behind, last gets
  // the GALE. Interpolated through a mid-field control point so DEEP DISH and BOW WAVE — the items
  // that only mean anything in traffic — peak where the traffic is.
  // ---------------------------------------------------------------------------------------------
  function weightAt(it, p) {
    return p < 0.5 ? U().lerp(it.front, it.mid, p * 2) : U().lerp(it.mid, it.back, (p - 0.5) * 2);
  }
  // race.js writes racePos after this runs on the very first racing frame, so fall back to counting
  // boats up the road. A draw that silently defaults to "leader" is the one bug that would quietly
  // undo the whole feature.
  function positionOf(boat) {
    if (boat.racePos) return boat.racePos;
    let p = 1;
    for (const o of S.boats) if (o !== boat && (o.routeD || 0) > (boat.routeD || 0)) p++;
    return p;
  }
  function rollFor(boat) {
    const n = Math.max(2, S.boats.length);
    const p = (U().clamp(positionOf(boat), 1, n) - 1) / (n - 1);
    let total = 0;
    for (const it of PU.ITEMS) total += weightAt(it, p);
    let r = (drawRng ? drawRng() : Math.random()) * total;
    for (const it of PU.ITEMS) {
      r -= weightAt(it, p);
      if (r <= 0) return it;
    }
    return PU.ITEMS[0];
  }
  // published so a menu can print the table honestly. p: 0 = leader, 1 = last.
  PU.oddsAt = function (p) {
    let total = 0;
    for (const it of PU.ITEMS) total += weightAt(it, p);
    return PU.ITEMS.map((it) => ({ id: it.id, name: it.name, pct: weightAt(it, p) / total }));
  };

  // ---------------------------------------------------------------------------------------------
  // Per-boat item state lives on the boat under _pu, so it dies with the boat.
  // ---------------------------------------------------------------------------------------------
  let seedTick = 0;
  function st(b) {
    return b._pu || (b._pu = {
      held: null, roll: 0,
      shield: 0, heavy: 0, spin: 0, spinDir: 1, blind: 0, gulls: 0,
      gale: 0, galeX: 0, galeZ: 0,
      seed: (seedTick = (seedTick + 2.399963) % 6.283),
      baseMass: b.mass || 1,
      aiHold: 0, aiPatience: 0, aiCheck: 0, seekX: 0, seekZ: 0, seekT: 0,
    });
  }

  function give(b, item, instant) {
    const s = st(b);
    if (s.held) return false;
    s.held = item;
    s.roll = instant ? 0 : K.ROLL_T;
    return true;
  }

  // ---------------------------------------------------------------------------------------------
  // FIRING
  // ---------------------------------------------------------------------------------------------
  function popRing(x, y, z, r, color) {
    if (!ringIM) return;
    if (rings.length >= MAX_RING) rings.shift();
    rings.push({ x, y, z, r0: 2.0, r1: r, t: 0, life: 0.55, color });
  }

  function chip(b, kind, text, ms) {
    if (!b.isPlayer || !RR.HUD || !RR.HUD.chip) return;
    RR.HUD.chip(kind, text, ms == null ? 1500 : ms);
  }

  // Every hostile effect asks first. A FENDER is only worth holding if it eats the thing you were
  // afraid of, so it eats ALL of them — one each.
  function consumeShield(b) {
    const s = st(b);
    if (s.shield <= 0) return false;
    s.shield = 0;
    popRing(b.pos.x, b.pos.y + 0.8, b.pos.z, 5.5, 0x7ec8e3);
    if (RR.FX && RR.FX.spray) RR.FX.spray(b.pos.x, b.pos.y + 0.7, b.pos.z, 0, 3.2, 0, 10, 4.5, 1.1);
    if (b.isPlayer) {
      chip(b, 'item', 'FENDER TOOK IT', 1400);
      if (RR.Audio && RR.Audio.thud) RR.Audio.thud(0.35);
      if (RR.Camera && RR.Camera.kick) RR.Camera.kick(0.16);
    }
    return true;
  }

  function ahead(b, range) {
    const out = [];
    const mine = b.routeD || 0;
    for (const o of S.boats) {
      if (o === b || o.finished || o.remote) continue;
      const gapM = (o.routeD || 0) - mine;
      if (gapM > 2 && gapM < range) out.push({ o, gapM });
    }
    out.sort((a, c) => a.gapM - c.gapM);
    return out;
  }

  function fire(b) {
    const s = st(b);
    const it = s.held;
    if (!it || s.roll > 0) return false;
    s.held = null;
    const fx = Math.sin(b.heading), fz = Math.cos(b.heading);

    if (it.id === 'turbo') {
      b.boostEnergy = 1;
      b.boostFull = 1.15;                    // physics.js pays 15% more off a full tank
      b.boostKickT = 0.55;
      const sp = Math.hypot(b.vel.x, b.vel.z), cap = (b.spec.top || 40) * 1.25;
      if (sp < cap) {
        const add = Math.min(K.TURBO_KICK, cap - sp);
        b.vel.x += fx * add; b.vel.z += fz * add;
      }
      popRing(b.pos.x, 0.4, b.pos.z, 9, 0x25ff7a);
      if (RR.FX && RR.FX.spray) RR.FX.spray(b.pos.x - fx * b.radius * 1.4, b.pos.y + 0.3, b.pos.z - fz * b.radius * 1.4,
        -b.vel.x * 0.3, 3.4, -b.vel.z * 0.3, 22, 5.5, 1.6);
      if (b.isPlayer) {
        chip(b, 'item', 'TURBO', 1400);
        if (RR.Camera && RR.Camera.kick) RR.Camera.kick(0.34);
        if (RR.Audio && RR.Audio.boostGate) RR.Audio.boostGate();
      }

    } else if (it.id === 'fender') {
      s.shield = K.SHIELD_T;
      if (b.isPlayer) {
        chip(b, 'item', 'FENDER UP', 1600);
        if (RR.Audio && RR.Audio.checkpoint) RR.Audio.checkpoint();
      }

    } else if (it.id === 'deepdish') {
      s.heavy = K.HEAVY_T;
      b.mass = s.baseMass * K.HEAVY_MASS;
      popRing(b.pos.x, 0.4, b.pos.z, 7, 0xffb03a);
      if (b.isPlayer) {
        chip(b, 'item', 'DEEP DISH · YOU ARE THE HEAVY ONE', 1800);
        if (RR.Audio && RR.Audio.thud) RR.Audio.thud(0.55);
      }

    } else if (it.id === 'slick') {
      const dx = b.pos.x - fx * (b.radius + 3.5), dz = b.pos.z - fz * (b.radius + 3.5);
      if (slicks.length >= MAX_SLICK) slicks.shift();
      slicks.push({ x: dx, z: dz, r: K.SLICK_R, t: K.SLICK_T, arm: K.DROP_ARM, owner: b });
      if (RR.FX && RR.FX.spray) RR.FX.spray(dx, 0.4, dz, 0, 1.6, 0, 14, 3.2, 1.2, 2);
      if (b.isPlayer) chip(b, 'item', 'SLICK ASTERN', 1400);

    } else if (it.id === 'dye') {
      const dx = b.pos.x - fx * (b.radius + 4.5), dz = b.pos.z - fz * (b.radius + 4.5);
      if (dyes.length >= MAX_DYE) dyes.shift();
      dyes.push({ x: dx, z: dz, r: K.DYE_R0, t: K.DYE_T, life: K.DYE_T, arm: K.DROP_ARM, owner: b });
      if (RR.FX && RR.FX.dyeBurst) RR.FX.dyeBurst(dx, 0.8, dz, 34);
      if (b.isPlayer) {
        chip(b, 'item', 'RIVER DYE · GREEN ASTERN', 1500);
        if (RR.Audio && RR.Audio.splash) RR.Audio.splash(0.5);
      }

    } else if (it.id === 'bowwave') {
      let hits = 0;
      for (const o of S.boats) {
        if (o === b || o.finished) continue;
        const dx = o.pos.x - b.pos.x, dz = o.pos.z - b.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > K.WAVE_R * K.WAVE_R || d2 < 1e-4) continue;
        if (consumeShield(o)) continue;
        const d = Math.sqrt(d2), k = 1 - d / K.WAVE_R;
        o.vel.x += (dx / d) * K.WAVE_PUSH * k;
        o.vel.z += (dz / d) * K.WAVE_PUSH * k;
        o.angVel += (dx * fz - dz * fx > 0 ? 1 : -1) * 0.9 * k;
        o.bumpRecover = Math.max(o.bumpRecover || 0, 0.30 + k * 0.5);
        if (o.isPlayer) {
          chip(o, 'bad', 'BOW WAVE', 1300);
          if (RR.Camera && RR.Camera.kick) RR.Camera.kick(0.4 * k);
        }
        hits++;
      }
      b.vel.x += fx * K.WAVE_SELF; b.vel.z += fz * K.WAVE_SELF;
      popRing(b.pos.x, 0.35, b.pos.z, K.WAVE_R, 0x9fe8ff);
      if (RR.FX && RR.FX.spray) {
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * 6.283;
          RR.FX.spray(b.pos.x + Math.sin(a) * 3, 0.5, b.pos.z + Math.cos(a) * 3,
            Math.sin(a) * 12, 2.6, Math.cos(a) * 12, 4, 3.4, 1.5);
        }
      }
      if (b.isPlayer) {
        chip(b, 'item', hits ? 'BOW WAVE ×' + hits : 'BOW WAVE', 1400);
        if (RR.Audio && RR.Audio.splash) RR.Audio.splash(0.85);
        if (RR.Camera && RR.Camera.kick) RR.Camera.kick(0.28);
      }

    } else if (it.id === 'gulls') {
      const list = ahead(b, K.GULL_RANGE).slice(0, K.GULL_MAX);
      let hits = 0;
      for (const e of list) {
        if (consumeShield(e.o)) continue;
        st(e.o).gulls = K.GULL_T;
        hits++;
        if (e.o.isPlayer) chip(e.o, 'bad', 'GULLS', 1600);
      }
      if (RR.Audio && RR.Audio.seagull) RR.Audio.seagull();
      if (b.isPlayer) chip(b, 'item', hits ? 'GULL SWARM ×' + hits : 'GULL SWARM · NOBODY AHEAD', 1600);

    } else if (it.id === 'gale') {
      // One gust, off the lake, out of the east-north-east — the same wind for everybody, and it
      // still catches each hull on the BEAM, which is the whole point of the item.
      const gx = -0.95, gz = 0.31;
      const list = ahead(b, K.GALE_RANGE);
      let hits = 0;
      for (const e of list) {
        const o = e.o;
        if (consumeShield(o)) continue;
        const ofx = Math.sin(o.heading), ofz = Math.cos(o.heading);
        let lat = gx * ofz - gz * ofx;                  // the gust, projected onto their beam
        if (Math.abs(lat) < 0.35) lat = (lat < 0 ? -1 : 1) * 0.35;
        const so = st(o);
        so.gale = K.GALE_T;
        so.galeX = ofz * lat; so.galeZ = -ofx * lat;    // unit beam vector, signed by the gust
        o.bumpRecover = Math.max(o.bumpRecover || 0, 0.35);
        hits++;
        if (o.isPlayer) {
          chip(o, 'bad', 'GALE OFF THE LAKE', 1800);
          if (RR.Camera && RR.Camera.kick) RR.Camera.kick(0.45);
        }
        if (RR.FX && RR.FX.gust) RR.FX.gust(o.pos.x, o.pos.y + 1.4, o.pos.z, so.galeX, so.galeZ, 16);
      }
      // The gust is a WEATHER EVENT, not a puff: it keeps blowing for its whole 1.2 s across the
      // whole channel, and the sustained emitter below is what makes it read as one from the chase
      // camera. A single burst at the moment of firing was a scatter of dots and nothing else.
      galeFX.t = K.GALE_T + 0.35; galeFX.age = 0; galeFX.acc = 0;
      galeFX.x = b.pos.x; galeFX.z = b.pos.z;
      galeFX.gx = gx; galeFX.gz = gz;
      galeFX.fx = fx; galeFX.fz = fz;
      if (b.isPlayer) {
        chip(b, 'item', hits ? 'GALE ×' + hits : 'GALE · NOBODY AHEAD', 1600);
        if (RR.Audio && RR.Audio.airhorn) RR.Audio.airhorn();
      }
    }
    if (useHook) useHook(b, it);
    return true;
  }
  PU.onUse = function (fn) { useHook = fn; };

  // ---------------------------------------------------------------------------------------------
  // Per-frame
  // ---------------------------------------------------------------------------------------------
  function collect(dt) {
    const route = S.route;
    for (let i = 0; i < crates.length; i++) {
      const c = crates[i];
      if (c.taken) {
        c.t -= dt;
        if (c.t <= 0) { c.taken = false; c.t = 0; }
        continue;
      }
      for (const b of S.boats) {
        if (b.finished || b.remote) continue;
        const s = st(b);
        if (s.held) continue;                          // a full slot never eats a crate
        let dd = (b.routeD || 0) - c.d;                // cheap arc-length reject first
        if (route.loop) dd = ((dd % route.len) + route.len * 1.5) % route.len - route.len * 0.5;
        if (dd < -70 || dd > 70) continue;
        const reach = b.radius + K.CRATE_R + (b.isPlayer ? 0 : K.AI_REACH);
        if (U().dist2(b.pos.x, b.pos.z, c.x, c.z) > reach * reach) continue;
        c.taken = true; c.t = K.RESPAWN;
        give(b, rollFor(b), !b.isPlayer);
        popRing(c.x, 0.5, c.z, 6, 0x6ff0ff);
        if (RR.FX && RR.FX.spray) RR.FX.spray(c.x, 1.0, c.z, 0, 4.5, 0, 12, 4.0, 1.2);
        if (b.isPlayer) {
          if (RR.Audio && RR.Audio.checkpoint) RR.Audio.checkpoint();
          if (RR.Camera && RR.Camera.kick) RR.Camera.kick(0.12);
        }
        break;
      }
    }
  }

  function applyEffects(dt, t) {
    for (const b of S.boats) {
      const s = b._pu;
      if (!s) continue;
      if (s.roll > 0) s.roll = Math.max(0, s.roll - dt);
      if (s.shield > 0) {
        s.shield -= dt;
        // the fender eats one real impact as well as one item — that is what makes it worth holding
        if ((b.bumpRecover || 0) > 0 && (b.crashTimer || 0) > 0.2) { b.bumpRecover = 0; consumeShield(b); }
      }
      if (s.heavy > 0) {
        s.heavy -= dt;
        if (s.heavy <= 0) b.mass = s.baseMass;
        else {
          // the trade, honoured without touching physics.js: heavy runs 7% short of her top end
          const cap = (b.spec.top || 40) * K.HEAVY_TOP;
          const sp = Math.hypot(b.vel.x, b.vel.z);
          if (sp > cap) {
            const k = Math.max(cap / sp, 1 - (6.0 * dt) / sp);
            b.vel.x *= k; b.vel.z *= k;
          }
          bulldoze(b, dt);
        }
      }
      if (s.spin > 0) {
        s.spin -= dt;
        b.angVel = s.spinDir * K.SPIN_W;
        const k = Math.exp(-K.SPIN_DRAG * dt);
        b.vel.x *= k; b.vel.z *= k;
      }
      if (s.gale > 0) {
        s.gale -= dt;
        b.vel.x += s.galeX * K.GALE_ACC * dt;
        b.vel.z += s.galeZ * K.GALE_ACC * dt;
      }
      if (s.blind > 0) s.blind -= dt;
      if (s.gulls > 0) s.gulls -= dt;
      // A rival who cannot see WEAVES; the player who cannot see gets the windscreen instead, which
      // is punishment enough without also taking the wheel off them.
      if (!b.isPlayer) {
        const w = (s.blind > 0 ? 0.95 : 0) + (s.gulls > 0 ? 0.85 : 0);
        if (w > 0) {
          b.heading = U().wrapAngle(b.heading + Math.sin(t * 4.7 + s.seed) * w * dt);
          const k = Math.exp(-0.35 * dt);
          b.vel.x *= k; b.vel.z *= k;
        }
      }
    }
  }

  // DEEP DISH does not just weigh more, it MOVES people. Mass alone reads as "they bounced off me";
  // the item has to read as "I went through them".
  function bulldoze(b, dt) {
    for (const o of S.boats) {
      if (o === b || o.finished) continue;
      const dx = o.pos.x - b.pos.x, dz = o.pos.z - b.pos.z;
      const rr = (b.radius + o.radius) * 1.5;
      const d2 = dx * dx + dz * dz;
      if (d2 > rr * rr || d2 < 1e-4) continue;
      if (consumeShield(o)) continue;
      const d = Math.sqrt(d2);
      o.vel.x += (dx / d) * 26 * dt; o.vel.z += (dz / d) * 26 * dt;
      o.bumpRecover = Math.max(o.bumpRecover || 0, 0.45);
      b.bumpRecover = 0;                     // the heavy one is not rattled by the light one
      if (o.isPlayer && RR.Camera && RR.Camera.kick) RR.Camera.kick(2.4 * dt);
    }
  }

  function updateHazards(dt) {
    for (let i = slicks.length - 1; i >= 0; i--) {
      const p = slicks[i];
      p.t -= dt; p.arm -= dt;
      if (p.t <= 0) { slicks.splice(i, 1); continue; }
      for (const b of S.boats) {
        if (b.finished || b.remote) continue;
        if (b === p.owner && p.arm > 0) continue;
        const s = st(b);
        if (s.spin > 0) continue;
        const rr = p.r + b.radius * 0.6;
        if (U().dist2(b.pos.x, b.pos.z, p.x, p.z) > rr * rr) continue;
        if (consumeShield(b)) { p.t = 0; break; }
        s.spin = K.SPIN_T;
        s.spinDir = (b.visRoll || 0) >= 0 ? 1 : -1;
        p.t = Math.min(p.t, 0.35);           // a slick is spent on the boat that found it
        if (b.isPlayer) {
          chip(b, 'bad', 'SLICK — NO GRIP', 1600);
          if (RR.Camera && RR.Camera.kick) RR.Camera.kick(0.5);
          if (RR.Audio && RR.Audio.splash) RR.Audio.splash(0.7);
        }
        if (RR.FX && RR.FX.spray) RR.FX.spray(b.pos.x, b.pos.y + 0.3, b.pos.z, 0, 3.0, 0, 12, 4.5, 1.3, 2);
        break;
      }
    }
    for (let i = dyes.length - 1; i >= 0; i--) {
      const p = dyes[i];
      p.t -= dt; p.arm -= dt;
      if (p.t <= 0) { dyes.splice(i, 1); continue; }
      p.r = U().lerp(K.DYE_R0, K.DYE_R1, Math.min(1, (1 - p.t / p.life) * 2.2));
      for (const b of S.boats) {
        if (b.finished || b.remote) continue;
        if (b === p.owner && p.arm > 0) continue;
        if (U().dist2(b.pos.x, b.pos.z, p.x, p.z) > p.r * p.r) continue;
        const s = st(b);
        if (s.shield > 0) { consumeShield(b); continue; }
        if (s.blind <= 0 && b.isPlayer) chip(b, 'bad', 'BLIND — RIVER DYE', 1400);
        s.blind = K.BLIND_T;
      }
      if (RR.FX && RR.FX.dyeBurst && Math.random() < dt * 8) {
        RR.FX.dyeBurst(p.x + (Math.random() - 0.5) * p.r, 0.6 + Math.random() * 2,
          p.z + (Math.random() - 0.5) * p.r, 2);
      }
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      rings[i].t += dt;
      if (rings[i].t >= rings[i].life) rings.splice(i, 1);
    }
    if (galeFX.t > 0) {
      galeFX.t -= dt;
      galeFX.age += dt;
      // laid across the channel a little up the road, so the gust sweeps THROUGH the field ahead
      const cx = galeFX.x + galeFX.fx * 48 + galeFX.gx * galeFX.age * 22;
      const cz = galeFX.z + galeFX.fz * 48 + galeFX.gz * galeFX.age * 22;
      galeFX.acc += 150 * dt;                    // ~150 streaks a second while the gust is blowing
      const n = Math.floor(galeFX.acc);
      galeFX.acc -= n;
      if (n && RR.FX && RR.FX.gust) RR.FX.gust(cx, 4.0, cz, galeFX.gx, galeFX.gz, n);
      if (galeMesh) {
        const k = Math.min(1, galeFX.age * 4) * U().clamp(galeFX.t / 0.45, 0, 1);
        galeMesh.visible = k > 0.01;
        galeMesh.material.opacity = 0.78 * k;
        galeMesh.position.set(cx, 0.34, cz);
        galeMesh.rotation.set(0, Math.atan2(galeFX.gx, galeFX.gz) + Math.PI / 2, 0);
        galeMesh.scale.set(150, 1, 86);
      }
    } else if (galeMesh && galeMesh.visible) galeMesh.visible = false;
  }
  const galeFX = { t: 0, age: 0, acc: 0, x: 0, z: 0, gx: -1, gz: 0, fx: 0, fz: 1 };

  // ---------------------------------------------------------------------------------------------
  // THE AI'S ITEM BRAIN. Difficulty is PATIENCE, not accuracy: a ROOKIE lets fly the moment the
  // slot locks and wastes a GALE on an empty river; a LEGEND sits on it until you are actually up
  // the road in front of her.
  // ---------------------------------------------------------------------------------------------
  function aiBrain(b, dt) {
    const s = st(b);
    if (!s.held || s.roll > 0) return;
    if (s.aiHold > 0) { s.aiHold -= dt; return; }
    const w = U().clamp((diff() - 0.7) / 0.75, 0, 1);     // 0 rookie · 0.4 skipper · 1 legend
    if (s.aiPatience <= 0) s.aiPatience = U().lerp(1.2, 9.0, w);
    s.aiPatience -= dt;
    s.aiCheck -= dt;
    if (s.aiCheck > 0) return;
    s.aiCheck = 0.35;
    if (s.aiPatience <= 0 || wants(b, s.held)) {
      fire(b);
      s.aiPatience = 0;
      s.aiHold = U().lerp(2.2, 0.35, w);                  // no double-tapping the next crate
    }
  }
  const wpt = {};
  function wants(b, it) {
    const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
    let nearest = 1e9, nearestBehind = 1e9, anyAhead = false;
    for (const o of S.boats) {
      if (o === b || o.finished) continue;
      const dx = o.pos.x - b.pos.x, dz = o.pos.z - b.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < nearest) nearest = dist;
      if (dx * fx + dz * fz < 0 && dist < nearestBehind) nearestBehind = dist;
      if ((o.routeD || 0) > (b.routeD || 0) + 2) anyAhead = true;
    }
    switch (it.id) {
      case 'turbo': {
        if (!S.route) return true;
        U().pathAt(S.route, U().clamp((b.routeD || 0) + 60, 0, S.route.len - 1), wpt);
        const bend = Math.abs(U().wrapAngle(Math.atan2(wpt.tx, wpt.tz) - b.heading));
        return bend < 0.35 && Math.hypot(b.vel.x, b.vel.z) < (b.spec.top || 40) * 0.96;
      }
      case 'fender': return nearest < 26;
      case 'deepdish': return nearest < 24;
      case 'slick': return nearestBehind < 45;
      case 'dye': return nearestBehind < 40;
      case 'bowwave': return nearest < 17;
      case 'gulls': return anyAhead;
      case 'gale': return anyAhead;
      default: return true;
    }
  }

  // Optional: a rival deviating for a crate the way a player does. main.js can call this between
  // RR.AI.update and RR.Physics.update. Without it the field still collects — see K.AI_REACH — it
  // just does not visibly go and get one.
  PU.aiSteer = function (pilot, dt) {
    if (!pilot || !pilot.boat || !active()) return;
    const b = pilot.boat;
    const s = st(b);
    if (s.held || b.finished) { s.seekX = 0; s.seekZ = 0; return; }
    s.seekT -= dt;
    if (s.seekT <= 0) {
      s.seekT = 0.25;
      s.seekX = 0; s.seekZ = 0;
      let best = 1e9;
      const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
      for (const c of crates) {
        if (c.taken) continue;
        const dx = c.x - b.pos.x, dz = c.z - b.pos.z;
        const along = dx * fx + dz * fz;
        if (along < 6 || along > 95) continue;
        const lat = Math.abs(dx * fz - dz * fx);
        if (lat > 26) continue;
        const cost = along + lat * 2.4;                  // near and nearly on the nose wins
        if (cost < best) { best = cost; s.seekX = c.x; s.seekZ = c.z; }
      }
    }
    if (!s.seekX && !s.seekZ) return;
    const err = U().wrapAngle(Math.atan2(s.seekX - b.pos.x, s.seekZ - b.pos.z) - b.heading);
    pilot.ctl.steer = U().clamp(pilot.ctl.steer + U().clamp(err * 1.5, -0.45, 0.45), -1, 1);
  };

  // ---------------------------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------------------------
  function drawCrates(t) {
    for (let i = 0; i < crates.length; i++) {
      const c = crates[i];
      if (c.taken) { crateIM.setMatrixAt(i, HIDE); haloIM.setMatrixAt(i, HIDE); continue; }
      const y = U().waterHeight(c.x, c.z, t, RR.River.waveAmp(c.x, c.z));
      Q0.setFromAxisAngle(UP, t * 1.35 + c.spin);
      V3.set(c.x, y + 0.05 + Math.sin(t * 1.9 + c.spin) * 0.16, c.z);
      SC.setScalar(1);
      M4.compose(V3, Q0, SC);
      crateIM.setMatrixAt(i, M4);
      Q0.identity();
      const pulse = 1 + Math.sin(t * 3.4 + c.seed) * 0.07;
      SC.set(pulse, 1, pulse);
      V3.y = y + 0.02;
      M4.compose(V3, Q0, SC);
      haloIM.setMatrixAt(i, M4);
    }
    crateIM.instanceMatrix.needsUpdate = true;
    haloIM.instanceMatrix.needsUpdate = true;
  }

  function drawHazards(t) {
    let n = 0;
    for (const p of slicks) {
      if (n >= MAX_SLICK) break;
      Q0.identity();
      V3.set(p.x, U().waterHeight(p.x, p.z, t, RR.River.waveAmp(p.x, p.z)) + 0.09, p.z);
      const grow = U().clamp((K.SLICK_T - p.t) * 4, 0.2, 1);
      SC.set(p.r * grow, 1, p.r * grow * (0.72 + 0.28 * Math.sin(t * 0.9)));
      M4.compose(V3, Q0, SC);
      slickIM.setMatrixAt(n++, M4);
    }
    slickIM.visible = n > 0;
    for (let i = n; i < MAX_SLICK; i++) slickIM.setMatrixAt(i, HIDE);
    slickIM.instanceMatrix.needsUpdate = true;

    n = 0;
    for (const p of dyes) {
      if (n >= MAX_DYE) break;
      // churn: a dye cloud that keeps a perfect dome reads as a piece of geometry, and this one is
      // supposed to be forty pounds of powder blooming through moving water
      Q0.setFromAxisAngle(UP, t * 0.6 + p.x * 0.01);
      V3.set(p.x, 1.1 + Math.sin(t * 1.3) * 0.25, p.z);
      SC.set(p.r * (1 + Math.sin(t * 1.7) * 0.10), p.r * 0.42 * (1 + Math.sin(t * 2.3) * 0.16),
        p.r * (1 - Math.sin(t * 1.7) * 0.10));
      M4.compose(V3, Q0, SC);
      dyeIM.setMatrixAt(n++, M4);
    }
    dyeIM.visible = n > 0;
    for (let i = n; i < MAX_DYE; i++) dyeIM.setMatrixAt(i, HIDE);
    dyeIM.instanceMatrix.needsUpdate = true;

    n = 0;
    for (const r of rings) {
      if (n >= MAX_RING) break;
      Q0.identity();
      V3.set(r.x, r.y, r.z);
      const rad = U().lerp(r.r0, r.r1, r.t / r.life);
      SC.set(rad, 1, rad);
      M4.compose(V3, Q0, SC);
      ringIM.setMatrixAt(n++, M4);
    }
    ringIM.visible = n > 0;
    if (n) ringIM.material.opacity = 0.62 * (1 - rings[0].t / rings[0].life) + 0.12;
    for (let i = n; i < MAX_RING; i++) ringIM.setMatrixAt(i, HIDE);
    ringIM.instanceMatrix.needsUpdate = true;
  }

  function drawAuras(t) {
    let nf = 0, nh = 0;
    for (const b of S.boats) {
      const s = b._pu;
      if (!s) continue;
      if (s.shield > 0 && nf < MAX_AURA) {
        // two hoops, one at the waterline and one at the rubbing strake, counter-rotating slowly.
        // The last two seconds strobe, so a fender about to lapse says so.
        const fade = s.shield < 2 ? (0.55 + 0.45 * Math.sin(t * 22)) : 1;
        for (let k = 0; k < 2 && nf < MAX_AURA; k++) {
          Q0.setFromAxisAngle(UP, t * (k ? -0.7 : 0.7));
          const r = (b.radius + 1.15 + k * 0.28) * fade;
          V3.set(b.pos.x, b.pos.y + 0.32 + k * 0.75, b.pos.z);
          SC.set(r, 1, r);
          M4.compose(V3, Q0, SC);
          fenderIM.setMatrixAt(nf++, M4);
        }
      }
      if (s.heavy > 0 && nh < MAX_AURA) {
        Q0.setFromAxisAngle(UP, t * 2.2);
        const r = (b.radius + 0.9) * (1 + Math.sin(t * 9) * 0.06);
        V3.set(b.pos.x, b.pos.y + 0.22, b.pos.z);
        SC.set(r, 1, r);
        M4.compose(V3, Q0, SC);
        heavyIM.setMatrixAt(nh++, M4);
      }
    }
    fenderIM.visible = nf > 0;
    heavyIM.visible = nh > 0;
    for (let i = nf; i < MAX_AURA; i++) fenderIM.setMatrixAt(i, HIDE);
    for (let i = nh; i < MAX_AURA; i++) heavyIM.setMatrixAt(i, HIDE);
    fenderIM.instanceMatrix.needsUpdate = true;
    heavyIM.instanceMatrix.needsUpdate = true;

    // gulls over whoever cannot see: eight birds per victim, orbiting the wheelhouse
    let g = 0;
    for (const b of S.boats) {
      const s = b._pu;
      if (!s || s.gulls <= 0 || b.isPlayer) continue;   // you are INSIDE your own flock; see the windscreen
      for (let i = 0; i < 8 && g < MAX_GULL; i++, g++) {
        const a = t * 2.4 + i * 0.785;
        const r = 3.2 + (i % 3) * 0.9;
        V3.set(b.pos.x + Math.sin(a) * r, b.pos.y + 2.4 + Math.sin(t * 3 + i) * 0.7, b.pos.z + Math.cos(a) * r);
        Q0.setFromAxisAngle(UP, -a);
        SC.set(1, 0.45 + 0.55 * Math.abs(Math.sin(t * 8 + i)), 1);
        M4.compose(V3, Q0, SC);
        gullIM.setMatrixAt(g, M4);
      }
    }
    gullIM.visible = g > 0;
    for (let i = g; i < MAX_GULL; i++) gullIM.setMatrixAt(i, HIDE);
    gullIM.instanceMatrix.needsUpdate = true;
  }

  function drawOverlay(t) {
    const p = S.player && S.player._pu;
    const dye = p ? U().clamp(p.blind / 0.5, 0, 1) : 0;
    const gull = p ? U().clamp(p.gulls / 0.6, 0, 1) : 0;
    if (dye <= 0.001 && gull <= 0.001) { overlay.visible = false; return; }
    overlay.visible = true;
    overlayMat.uniforms.uDye.value = dye * 0.92;
    overlayMat.uniforms.uGull.value = gull;
    overlayMat.uniforms.uTime.value = t;
  }

  // ---------------------------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------------------------
  // Items are a RACE feature. The Architecture Tour is a ride, a time trial is a record against a
  // ghost that never had them, the cold open is teaching one thing at a time, and multiplayer has
  // no authority to agree on who got shoved — so all four run clean.
  function active() {
    return !!(S && group && PU.enabled() && crates.length &&
      !S.tour && !S.timeTrial && !S.mp && !S.opening);
  }
  PU.active = active;

  function dropEverything() {
    slicks.length = 0; dyes.length = 0; rings.length = 0;
    galeFX.t = 0;
    if (galeMesh) galeMesh.visible = false;
    if (S && S.boats) {
      for (const b of S.boats) {
        const s = b._pu;
        if (!s) continue;
        if (s.heavy > 0) b.mass = s.baseMass;
        s.held = null; s.roll = 0; s.shield = 0; s.heavy = 0; s.spin = 0;
        s.blind = 0; s.gulls = 0; s.gale = 0;
      }
    }
    if (overlay) overlay.visible = false;
  }

  PU.buildForRace = function (state) {
    PU.clear();
    // A ride and a record run never get crates at all, so they do not even pay to build them.
    // (The cold open and multiplayer are only known AFTER start() returns, so those two are caught
    // by active() instead and the built crates simply stay hidden.)
    if (!state || state.tour || state.timeTrial || !RR.Engine.scene) return;
    S = state;
    drawRng = U().mulberry((((state.courseIdx | 0) * 2654435761) ^ 0x85EBCA6B) >>> 0);
    crates = planCrates(state);
    buildScene(crates.length);
    for (const b of state.boats) { b._pu = null; st(b).baseMass = b.mass || 1; }
  };

  PU.clear = function () {
    dropEverything();
    if (group) {
      RR.Engine.scene.remove(group);
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    group = crateIM = haloIM = slickIM = dyeIM = fenderIM = heavyIM = ringIM = gullIM = null;
    galeMesh = null;
    overlay = overlayMat = null;
    crates = []; slicks = []; dyes = []; rings = [];
    S = null; keyWas = false;
  };

  // race.js calls this once per frame with the live race state.
  PU.update = function (dt, state) {
    if (state) S = state;
    if (!S || !group) return;
    const on = active();
    group.visible = on;
    if (!on) { if (overlay) overlay.visible = false; return; }
    const t = RR.Engine.time();
    if (S.phase === 'racing') {
      collect(dt);
      applyEffects(dt, t);
      updateHazards(dt);
      for (const b of S.boats) if (!b.isPlayer && !b.remote && !b.finished) aiBrain(b, dt);
      pollPlayerKey();
    }
    drawCrates(t);
    drawHazards(t);
    drawAuras(t);
    drawOverlay(t);
  };

  // E or SPACE fires it. Polled, not bound, so input.js never has to move for this.
  let keyWas = false;
  function pollPlayerKey() {
    const I = RR.Input;
    const down = !!(I && I.pressed && (I.pressed('KeyE') || I.pressed('Space')));
    if (down && !keyWas) PU.use();
    keyWas = down;
  }

  // ---------------------------------------------------------------------------------------------
  // Public API — the HUD slot and the settings switch hang off exactly this.
  // ---------------------------------------------------------------------------------------------
  PU.KEY = 'E';
  PU.held = function () { const p = S && S.player && S.player._pu; return p && p.roll <= 0 ? p.held : null; };
  PU.heldId = function () { const h = PU.held(); return h ? h.id : null; };
  PU.rolling = function () {
    const p = S && S.player && S.player._pu;
    return p && p.roll > 0 ? p.roll / K.ROLL_T : 0;
  };
  // What the slot should SHOW right now. During the spin that is a face cycling at 14 Hz, which is
  // most of the reason a pickup feels like a pickup.
  PU.rollFace = function () {
    const p = S && S.player && S.player._pu;
    if (!p || !p.held) return null;
    if (p.roll <= 0) return p.held;
    return PU.ITEMS[Math.floor(RR.Engine.time() * 14) % PU.ITEMS.length];
  };
  PU.use = function () {
    if (!active() || !S.player || S.phase !== 'racing' || S.player.finished) return false;
    return fire(S.player);
  };
  // Live crate list — {x, z, d, taken}. The minimap can draw off this; do not mutate it.
  PU.crates = function () { return crates; };
  // Put an item in a slot directly. Tests and the harness use it; a future "start with one" option
  // would too. Returns false if that boat is already holding something.
  PU.grant = function (id, boat) {
    const it = PU.byId(id);
    const b = boat || (S && S.player);
    if (!it || !b) return false;
    return give(b, it, true);
  };
  PU.status = function () {
    const p = S && S.player && S.player._pu;
    if (!p) return null;
    return { shield: Math.max(0, p.shield), heavy: Math.max(0, p.heavy), spin: Math.max(0, p.spin),
      blind: Math.max(0, p.blind), gulls: Math.max(0, p.gulls), gale: Math.max(0, p.gale) };
  };
  PU.debug = function () {
    return {
      enabled: PU.enabled(), active: active(),
      crates: crates.length, live: crates.filter((c) => !c.taken).length,
      held: PU.heldId(), rolling: PU.rolling(),
      slicks: slicks.length, dyes: dyes.length, rings: rings.length,
      gale: +galeFX.t.toFixed(2), galeVisible: !!(galeMesh && galeMesh.visible),
      field: S && S.boats ? S.boats.map((b) => ({
        pos: b.racePos || 0, player: !!b.isPlayer,
        item: b._pu && b._pu.held ? b._pu.held.id : null,
        shield: b._pu ? +(b._pu.shield || 0).toFixed(1) : 0,
        heavy: b._pu ? +(b._pu.heavy || 0).toFixed(1) : 0,
      })) : [],
    };
  };

  RR.Powerups = PU;
})();

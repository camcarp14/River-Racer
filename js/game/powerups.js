/* River Racer — POWER-UPS. Crates in the channel, eight items off the river, and a draw that is
   weighted by where you are running.

   The problem this solves is stated exactly: "so it's not just whoever gets out first." A lead in
   this game used to be arithmetic — the AI's rubber band is deliberately tiny at SKIPPER and
   exactly zero at LEGEND (ai.js), so once a boat was clear it stayed clear. Items are the other
   half of that answer: the leader draws a SHIELD and something to hide behind, the tail draws the
   TORPEDO and the GULLS. Nothing here makes a bad line fast. Everything here makes a lead a thing
   you have to keep holding.

   Every item obeys the same three rules, because "it changes a number" is not a power-up:
     SEE   — geometry or particles in the world, at a size you cannot miss from the chase camera.
     FEEL  — RR.Camera.kick and a beat of RR.Feel.dilate on the frame it lands.
     READ  — the boat it lands ON gets a plate naming the item and who threw it. See land().

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
  //
  // NAMES AND BLURBS ARE PLAIN. Every one of them says what the thing does to whom, in words you
  // would use out loud. GALE OFF THE LAKE is gone: its effect was a sideways nudge you could not
  // see and could not name, and a power-up you cannot perceive is not a power-up. The TORPEDO
  // replaces it in the same slot in the draw table — the tail's big swing at whoever is winning.
  PU.ITEMS = [
    { id: 'turbo', name: 'TURBO', short: 'TURBO', kind: 'self', color: 0x25ff7a, glyph: '»',
      blurb: 'Huge speed burst for 3 seconds.', front: 30, mid: 26, back: 18 },
    // id stays 'fender' — hud.js and the saved-preference path key off ids, and renaming a key to
    // match a label is how you break a save file for a caption.
    { id: 'fender', name: 'SHIELD', short: 'SHIELD', kind: 'self', color: 0x7ec8e3, glyph: '◌',
      // It blocks items and one hard wall crash, but NOT a plain boat-to-boat ram — physics only
      // sets crashTimer on wall contact. Say what it does rather than what the name implies.
      blurb: 'Blocks the next item that hits you.', front: 40, mid: 20, back: 6 },
    { id: 'slick', name: 'OIL SLICK', short: 'OIL SLICK', kind: 'drop', color: 0x2a3c4e, glyph: '≈',
      blurb: 'Drops 3 slicks behind you. They spin out.', front: 26, mid: 22, back: 10 },
    { id: 'dye', name: 'GREEN DYE', short: 'GREEN DYE', kind: 'drop', color: 0x2ecc71, glyph: '◉',
      blurb: 'Green cloud astern. Blinds anyone in it.', front: 16, mid: 20, back: 12 },
    { id: 'deepdish', name: 'DEEP DISH', short: 'DEEP DISH', kind: 'self', color: 0xffb03a, glyph: '●',
      blurb: 'You turn heavy and smash boats aside.', front: 4, mid: 26, back: 20 },
    { id: 'bowwave', name: 'SHOCKWAVE', short: 'SHOCKWAVE', kind: 'burst', color: 0x9fe8ff, glyph: '(',
      blurb: 'Blast of water throws nearby boats away.', front: 2, mid: 20, back: 24 },
    { id: 'gulls', name: 'GULL SWARM', short: 'GULLS', kind: 'ahead', color: 0xf2f6f8, glyph: '^',
      blurb: 'Birds mob the 4 boats ahead of you.', front: 0, mid: 12, back: 26 },
    { id: 'torpedo', name: 'TORPEDO', short: 'TORPEDO', kind: 'ahead', color: 0xff5a3a, glyph: '➤',
      blurb: 'Homes up the river and wipes out the leader.', front: 0, mid: 4, back: 34 },
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
    SHIELD_T: 12.0, SHIELD_BOUNCE: 22,      // what the blocked boat gets thrown back with
    HEAVY_T: 8.0, HEAVY_MASS: 6.0, HEAVY_TOP: 0.97,
    // The one-shot hit DEEP DISH lands per victim. SLAM_CD is a DRAMA budget as much as a balance
    // one: the slam is worth a beat of slow motion, and at 0.7 s a heavy boat sitting on top of you
    // for its whole eight seconds could spend a third of them in slow motion.
    SLAM_PUSH: 21, SLAM_SPIN: 3.2, SLAM_CD: 1.1,
    SPIN_T: 1.6, SPIN_W: 5.5, SPIN_DRAG: 1.9,
    SLICK_T: 14.0, SLICK_R: 7.0, SLICK_N: 3, SLICK_SPREAD: 9.0, DROP_ARM: 0.9,
    DYE_T: 10.0, DYE_R0: 8.0, DYE_R1: 17.0, BLIND_T: 2.2, DYE_DRAG: 0.55,
    GULL_T: 4.5, GULL_RANGE: 320, GULL_MAX: 4, GULL_TOP: 0.80, GULL_WHEEL: 0.5,
    TORP_SPD: 62, TORP_LIFE: 7.0, TORP_RANGE: 520, TORP_R: 4.6, TORP_TRACK: 2.6,
    TORP_SLOW: 0.40, TORP_ARM: 0.35,
    WAVE_R: 34, WAVE_PUSH: 26, WAVE_SELF: 8.0, WAVE_SPIN: 2.6,
    TURBO_T: 3.0, TURBO_KICK: 16.0, TURBO_ACC: 26, TURBO_TOP: 1.55, TURBO_WASH: 13,
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
      fenderIM = null, bubbleIM = null, heavyIM = null, crushIM = null, ringIM = null,
      wallIM = null, gullIM = null, torpIM = null, overlay = null, overlayMat = null;
  let crates = [], slicks = [], dyes = [], rings = [], walls = [], torps = [];
  let S = null, drawRng = null, useHook = null;
  const M4 = new THREE.Matrix4(), Q0 = new THREE.Quaternion(), V3 = new THREE.Vector3(), SC = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
  const TPT = {}, PPT = {};                    // pathAt scratch — no allocation in update()
  const C0 = new THREE.Color();
  // GULL_MAX victims × 16 birds each — sized so the fourth victim is not the one that silently
  // gets no flock.
  const MAX_SLICK = 18, MAX_DYE = 10, MAX_RING = 10, MAX_AURA = 8, MAX_GULL = 64,
        MAX_WALL = 4, MAX_TORP = 4;

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
  // A vertical ramp written straight into the merged colour buffer. Under additive blending a
  // vertex colour of black adds nothing at all, which is the only way to end a shaft of light
  // without giving it an edge. Linear space on purpose: this multiplies the material colour, which
  // three has already converted — run it through convertSRGBToLinear and the fade goes muddy.
  function fadeUp(geo, y0, y1, mul) {
    const pos = geo.attributes.position, n = pos.count;
    const col = new Float32Array(n * 3);
    const span = Math.max(1e-3, y1 - y0);
    for (let i = 0; i < n; i++) {
      const f = Math.pow(1 - U().clamp((pos.getY(i) - y0) / span, 0, 1), 1.05) * (mul == null ? 1 : mul);
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = f;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  }

  // The halo does NOT turn with the crate: a ring rotating on the water reads as a propeller, and
  // the ring is the part that says "the gap is here".
  //
  // The shaft above it was one cone tapered to a point, and a cone tapered to a point is a
  // TRIANGLE — a pale triangle standing on a white float in open water is a SAIL, and course 3
  // moors a whole fleet of them within two hundred metres of every crate row. Seen down a row from
  // a metre off the water the beacons joined that fleet. So the column is built the way a light is
  // and not the way a sail is: it SPLAYS as it rises instead of coming to a head, it is dimmed to
  // nothing long before it ends so there is no silhouette left up there to mistake, and it wears
  // three bands climbing it. Those bands are what saves the grazing view — three stacked
  // horizontal bars is the one thing out here that is not a sail, not a buoy and not a piling.
  function haloGeom() {
    const Y0 = 0.3, H = 11;
    const ring = new THREE.RingGeometry(2.6, 3.6, 22);
    ring.rotateX(-Math.PI / 2);
    ring.translate(0, 0.12, 0);
    const parts = [ring];

    // five height segments is plenty: the ramp below is very nearly linear, and linear is exactly
    // what interpolating across a segment gives you for free
    const col = new THREE.CylinderGeometry(2.05, 0.82, H, 10, 5, true);
    col.translate(0, Y0 + H / 2, 0);
    parts.push(fadeUp(col, Y0, Y0 + H, 0.78));

    for (const b of [[1.05, 0.98], [2.35, 1.18], [3.75, 1.40]]) {
      const band = new THREE.CylinderGeometry(b[1], b[1] * 0.93, 0.32, 10, 1, true);
      band.translate(0, b[0], 0);
      parts.push(fadeUp(band, Y0, Y0 + H));
    }
    return merge(parts);
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

  // THE SHOCKWAVE WALL. A ring painted on the water is a decal and reads as one; what says "a wall
  // of water just left me and it is coming for you" is a surface with HEIGHT that you watch pass
  // under your own bow. Open cylinder, faded out at the top so it has no rim up there, scaled
  // outward each frame — one instanced draw for every wave in flight.
  function wallGeom() {
    const g = new THREE.CylinderGeometry(1, 1, 1, 40, 4, true);
    g.translate(0, 0.5, 0);
    return fadeUp(g, 0, 1, 1);
  }

  // THE SHIELD BUBBLE. Additive on the BACK side only: you see the far wall of the shell through
  // your own boat, which domes the hull instead of frosting it, and the vertex ramp puts the light
  // in a band at the waterline where a bubble is thickest end-on.
  function bubbleGeom() {
    const g = new THREE.SphereGeometry(1, 16, 12);
    const pos = g.attributes.position, n = pos.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const f = Math.pow(1 - Math.abs(pos.getY(i)), 0.65);
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0.25 + f * 0.75;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }

  // THE TORPEDO. Not a grey tube — from twenty metres astern a tube is a stick. What reads at
  // range is the FOAM: a flat white arrowhead skimming the surface, with a dark body just visible
  // in the middle of it and a churned collar at the tail. Built pointing +z, the same axis the
  // boats use for forward.
  function torpGeom() {
    const parts = [];
    const foam = new THREE.ConeGeometry(2.6, 8.0, 10);
    foam.rotateX(Math.PI / 2);                 // tip to +z
    foam.scale(1, 0.16, 1);                    // flattened onto the water
    foam.translate(0, 0.10, 1.2);
    parts.push(tint(foam, 0xf2fbff));
    const body = new THREE.CylinderGeometry(0.52, 0.62, 3.0, 8);
    body.rotateX(Math.PI / 2);
    body.translate(0, 0.55, 0);
    parts.push(tint(body, 0x27333f));
    const nose = new THREE.ConeGeometry(0.55, 1.3, 8);
    nose.rotateX(Math.PI / 2);
    nose.translate(0, 0.55, 2.1);
    parts.push(tint(nose, 0xff5a3a));          // the one hot colour on it, so you can tell the end
    const collar = new THREE.TorusGeometry(1.15, 0.22, 5, 14);
    collar.rotateX(-Math.PI / 2);
    collar.translate(0, 0.24, -1.9);
    parts.push(tint(collar, 0xdff2ff));
    return merge(parts);
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

  // Per-instance tint, so a ring is the COLOUR of the thing that made it: green for a TURBO, orange
  // for DEEP DISH, red for a torpedo going off. Half of "what just hit me" is answered before you
  // have read a single word. Written linear on purpose — this project keeps three's colour
  // management in legacy mode (see city.js), so nothing converts it for us.
  function tintable(m) {
    for (let i = 0; i < m.count; i++) m.setColorAt(i, C0.setRGB(1, 1, 1));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    return m;
  }
  function setTint(m, i, hex) {
    if (!m.instanceColor) return;
    m.setColorAt(i, C0.setHex(hex).convertSRGBToLinear());
  }

  function buildScene(nCrates) {
    group = new THREE.Group();
    group.name = 'RR_POWERUPS';
    group.visible = PU.enabled();
    RR.Engine.scene.add(group);

    crateIM = instanced(crateGeom(),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05,
        emissive: 0x3a2a00, emissiveIntensity: 0.5 }), nCrates, 1);
    // FrontSide, not DoubleSide: an open cylinder drawn both ways adds itself to the frame twice,
    // and twice 0.42 of additive cyan over a bright lake clips to flat WHITE — which is how the
    // beacon lost its colour and became a sheet. One wall, a little brighter, keeps the cyan.
    haloIM = instanced(haloGeom(),
      new THREE.MeshBasicMaterial({ color: 0x6ff0ff, vertexColors: true, transparent: true,
        opacity: 0.78, blending: THREE.AdditiveBlending, depthWrite: false,
        side: THREE.FrontSide }), nCrates, 2);

    const disc = new THREE.CircleGeometry(1, 20);
    disc.rotateX(-Math.PI / 2);
    slickIM = instanced(disc,
      new THREE.MeshBasicMaterial({ map: slickTex(), transparent: true, opacity: 0.95,
        depthWrite: false, side: THREE.DoubleSide }), MAX_SLICK, 2);

    // Thirty per cent, not forty-six: at the size the cloud grew to, a half-opaque dome reads as a
    // wall of green GLASS rather than as something you can charge through. The particles carry the
    // density now — the shell only has to say where the edge is.
    dyeIM = instanced(new THREE.SphereGeometry(1, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.30,
        depthWrite: false, side: THREE.DoubleSide }), MAX_DYE, 3);

    // A FENDER is a rubber ring bolted round a hull — so it is drawn as one. (It started life as a
    // glowing sphere and an additive ball over a jet ski is a white blob with a boat somewhere in
    // it: a thin torus at the waterline reads as equipment, and you can still see what you steer.)
    const torus = new THREE.TorusGeometry(1, 0.075, 6, 26);
    torus.rotateX(-Math.PI / 2);
    fenderIM = instanced(torus,
      new THREE.MeshBasicMaterial({ color: 0x2fc9ff, transparent: true, opacity: 0.40,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), MAX_AURA, 3);
    bubbleIM = instanced(bubbleGeom(),
      new THREE.MeshBasicMaterial({ color: 0x2fc9ff, vertexColors: true, transparent: true,
        opacity: 0.30, blending: THREE.AdditiveBlending, depthWrite: false,
        side: THREE.BackSide }), MAX_AURA, 3);
    // Additive over sunlit water clips to white long before it clips to orange, so the alpha here
    // is what carries the COLOUR, not the brightness: at 0.85 the heavy ring read as a white hoop
    // and nobody could tell it from the shield at a glance.
    const heavy = new THREE.TorusGeometry(1, 0.17, 6, 26);
    heavy.rotateX(-Math.PI / 2);
    heavyIM = instanced(heavy,
      new THREE.MeshBasicMaterial({ color: 0xff7a00, transparent: true, opacity: 0.42,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), MAX_AURA, 3);
    // DEEP DISH's crush zone, painted flat on the water and sized to the radius that actually
    // bulldozes. A weapon whose reach nobody can see is a weapon nobody dodges — this is the ring
    // rivals are supposed to stay out of, so it is drawn at exactly the size it bites at.
    const crush = new THREE.RingGeometry(0.90, 1.0, 40);
    crush.rotateX(-Math.PI / 2);
    crushIM = instanced(crush,
      new THREE.MeshBasicMaterial({ color: 0xff8a12, transparent: true, opacity: 0.24,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), MAX_AURA, 3);

    const ringGeo = new THREE.RingGeometry(0.82, 1.0, 44);
    ringGeo.rotateX(-Math.PI / 2);
    ringIM = tintable(instanced(ringGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), MAX_RING, 3));

    wallIM = tintable(instanced(wallGeom(),
      new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true,
        opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
        side: THREE.DoubleSide }), MAX_WALL, 3));

    gullIM = instanced(new THREE.PlaneGeometry(2.2, 1.1),
      new THREE.MeshBasicMaterial({ map: gullTex(), side: THREE.DoubleSide,
        transparent: true, opacity: 0.96, depthWrite: false }), MAX_GULL, 4);

    torpIM = instanced(torpGeom(),
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.94,
        depthWrite: false, side: THREE.DoubleSide }), MAX_TORP, 3);

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
  // the TORPEDO. Interpolated through a mid-field control point so DEEP DISH and SHOCKWAVE — the
  // items that only mean anything in traffic — peak where the traffic is.
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
      turbo: 0, slamCd: 0,
      seed: (seedTick = (seedTick + 2.399963) % 6.283),
      baseMass: b.mass || 1,
      aiHold: 0, aiPatience: null, aiCheck: 0, seekX: 0, seekZ: 0, seekT: 0,
    });
  }

  function give(b, item, instant) {
    const s = st(b);
    if (s.held) return false;
    s.held = item;
    s.roll = instant ? 0 : K.ROLL_T;
    s.aiPatience = null;                   // a fresh item gets a fresh clock — see aiBrain
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

  function popWall(x, z, r, color) {
    if (!wallIM) return;
    if (walls.length >= MAX_WALL) walls.shift();
    walls.push({ x, z, r0: 3, r1: r, h: 4.2, t: 0, life: 0.75, color });
  }

  function chip(b, kind, text, ms) {
    if (!b.isPlayer || !RR.HUD || !RR.HUD.chip) return;
    RR.HUD.chip(kind, text, ms == null ? 1500 : ms);
  }

  // ai.js names every rival (boat.pilotName); multiplayer names them too (boat.displayName).
  // "GULLS" on its own does not tell you a race story. "GULLS — LOU CANAL" does.
  function nameOf(b) {
    if (!b) return 'A RIVAL';
    if (b.isPlayer) return 'YOU';
    return b.displayName || b.pilotName || 'A RIVAL';
  }

  // THE RECEIVING END, in one place. Nothing hostile lands anywhere in this file without going
  // through here, so the victim ALWAYS gets the same three signals: a plate that names the item and
  // who threw it, a jolt in the chair, and a beat of slow motion. Rivals get the world FX only —
  // they have no chair and no screen — which is why the camera work is gated on isPlayer.
  const lastHit = { label: '', from: '', t: -1e9 };
  function land(victim, from, label, kick, dilScale, dilMs) {
    if (!victim) return;
    chip(victim, 'bad', from && from !== victim ? label + ' — ' + nameOf(from) : label, 1900);
    if (!victim.isPlayer) return;
    // The HUD raises its own plate off the rising edge of status(), and a generic "SPUN OUT" is
    // exactly the thing the owner cannot read. This is the attribution, published, so the plate can
    // say what hit you and who threw it instead.
    lastHit.label = label;
    lastHit.from = from && from !== victim ? nameOf(from) : '';
    lastHit.t = RR.Engine.time();
    if (kick && RR.Camera && RR.Camera.kick) RR.Camera.kick(kick);
    if (dilScale && RR.Feel && RR.Feel.dilate) RR.Feel.dilate(dilScale, dilMs || 220);
  }

  // The firing end. Same idea: the boat that pulled the trigger feels it too, or the item is
  // something that happened to other people.
  function recoil(b, kick, dilScale, dilMs) {
    if (!b.isPlayer) return;
    if (kick && RR.Camera && RR.Camera.kick) RR.Camera.kick(kick);
    if (dilScale && RR.Feel && RR.Feel.dilate) RR.Feel.dilate(dilScale, dilMs || 220);
  }

  // Every hostile effect asks first, and the answer is a bubble bursting: a wall of water off the
  // hull, a white ring, and — new — whatever was doing the hitting gets thrown back off it. A
  // shield that only deletes an event still feels like nothing happened.
  function consumeShield(b, from) {
    const s = st(b);
    if (s.shield <= 0) return false;
    s.shield = 0;
    popRing(b.pos.x, b.pos.y + 0.8, b.pos.z, 13, 0x7ec8e3);
    popWall(b.pos.x, b.pos.z, 14, 0x9fe8ff);
    if (RR.FX && RR.FX.detonation) RR.FX.detonation(b.pos.x, b.pos.y + 0.5, b.pos.z, 0.9);
    if (from && from !== b && !from.finished) {
      const dx = from.pos.x - b.pos.x, dz = from.pos.z - b.pos.z;
      const d = Math.max(1e-3, Math.hypot(dx, dz));
      from.vel.x += (dx / d) * K.SHIELD_BOUNCE;
      from.vel.z += (dz / d) * K.SHIELD_BOUNCE;
      from.bumpRecover = Math.max(from.bumpRecover || 0, 0.8);
      land(from, b, 'BOUNCED OFF A SHIELD', 0.9, 0.75, 200);
    }
    if (b.isPlayer) {
      chip(b, 'item', 'SHIELD BLOCKED IT', 1500);
      if (RR.Audio && RR.Audio.thud) RR.Audio.thud(0.7);
      if (RR.Camera && RR.Camera.kick) RR.Camera.kick(0.5);
      if (RR.Feel && RR.Feel.dilate) RR.Feel.dilate(0.7, 200);
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

  let lastFireT = -1e9;
  function fire(b) {
    const s = st(b);
    const it = s.held;
    if (!it || s.roll > 0) return false;
    s.held = null;
    const fx = Math.sin(b.heading), fz = Math.cos(b.heading);

    if (it.id === 'turbo') {
      // A LIGHT-OFF, not a nudge. The instant kick is more than twice what it was, and behind it
      // sits three seconds of sustained thrust that holds the hull at 55% over her rated top end —
      // physics.js's 6 m/s² blow-off pulls against it the whole time, which is what makes the run
      // feel like something straining rather than a number being set.
      b.boostEnergy = 1;
      b.boostFull = 1.35;
      b.boostKickT = 1.5;
      s.turbo = K.TURBO_T;
      const sp = Math.hypot(b.vel.x, b.vel.z), cap = (b.spec.top || 40) * K.TURBO_TOP;
      if (sp < cap) {
        const add = Math.min(K.TURBO_KICK, cap - sp);
        b.vel.x += fx * add; b.vel.z += fz * add;
      }
      popRing(b.pos.x, 0.4, b.pos.z, 15, 0x25ff7a);
      popWall(b.pos.x, b.pos.z, 13, 0x8dffc0);
      if (RR.FX) {
        const ex = b.pos.x - fx * b.radius * 1.5, ez = b.pos.z - fz * b.radius * 1.5;
        if (RR.FX.burn) RR.FX.burn(ex, b.pos.y + 0.6, ez, -fx * 26, 2.5, -fz * 26, 46, 9);
        if (RR.FX.spray) {
          RR.FX.spray(ex, b.pos.y + 0.3, ez, -b.vel.x * 0.35, 6.0, -b.vel.z * 0.35, 40, 9.0, 2.4);
          for (let i = 0; i < 2; i++) {
            const side = i ? 1 : -1;
            RR.FX.spray(b.pos.x + fz * side * b.radius, b.pos.y + 0.3, b.pos.z - fx * side * b.radius,
              fz * side * 13, 4.5, -fx * side * 13, 14, 5.0, 1.8);
          }
        }
      }
      chip(b, 'item', 'TURBO', 1400);
      recoil(b, 0.75, 0.55, 240);
      if (b.isPlayer && RR.Audio && RR.Audio.boostGate) RR.Audio.boostGate();

    } else if (it.id === 'fender') {
      s.shield = K.SHIELD_T;
      popRing(b.pos.x, b.pos.y + 0.6, b.pos.z, 12, 0x7ec8e3);
      popWall(b.pos.x, b.pos.z, 11, 0x9fe8ff);
      if (RR.FX && RR.FX.spray) RR.FX.spray(b.pos.x, b.pos.y + 0.5, b.pos.z, 0, 5.0, 0, 30, 6.5, 1.6);
      chip(b, 'item', 'SHIELD UP', 1600);
      recoil(b, 0.3, 0.85, 200);
      if (b.isPlayer && RR.Audio && RR.Audio.checkpoint) RR.Audio.checkpoint();

    } else if (it.id === 'deepdish') {
      s.heavy = K.HEAVY_T;
      s.slamCd = 0;
      b.mass = s.baseMass * K.HEAVY_MASS;
      popRing(b.pos.x, 0.4, b.pos.z, 16, 0xffb03a);
      popWall(b.pos.x, b.pos.z, 15, 0xffa03a);
      if (RR.FX && RR.FX.detonation) RR.FX.detonation(b.pos.x, 0.3, b.pos.z, 1.1);
      chip(b, 'item', 'DEEP DISH — YOU ARE HEAVY NOW', 1800);
      recoil(b, 0.7, 0.72, 300);
      if (b.isPlayer && RR.Audio && RR.Audio.thud) RR.Audio.thud(0.9);

    } else if (it.id === 'slick') {
      // Three patches, laid across the lane astern. One 5.6 m disc on a 60 m channel was a thing
      // you drove past; a 25 m wide field of oil is a thing you have to pick a way through.
      const lx = fz, lz = -fx;                     // the beam, for the fan
      for (let i = 0; i < K.SLICK_N; i++) {
        const off = (i - (K.SLICK_N - 1) / 2) * K.SLICK_SPREAD;
        const back = b.radius + 3.5 + Math.abs(off) * 0.35;
        const dx = b.pos.x - fx * back + lx * off, dz = b.pos.z - fz * back + lz * off;
        if (slicks.length >= MAX_SLICK) slicks.shift();
        slicks.push({ x: dx, z: dz, r: K.SLICK_R, t: K.SLICK_T, arm: K.DROP_ARM, owner: b });
        if (RR.FX && RR.FX.spray) RR.FX.spray(dx, 0.4, dz, lx * off * 0.4, 2.4, lz * off * 0.4, 16, 4.0, 1.6, 2);
      }
      popRing(b.pos.x - fx * 6, 0.35, b.pos.z - fz * 6, 16, 0x7a5aa8);
      chip(b, 'item', 'OIL SLICK ASTERN', 1400);
      recoil(b, 0.22, 0, 0);
      if (b.isPlayer && RR.Audio && RR.Audio.splash) RR.Audio.splash(0.4);

    } else if (it.id === 'dye') {
      const dx = b.pos.x - fx * (b.radius + 4.5), dz = b.pos.z - fz * (b.radius + 4.5);
      if (dyes.length >= MAX_DYE) dyes.shift();
      dyes.push({ x: dx, z: dz, r: K.DYE_R0, t: K.DYE_T, life: K.DYE_T, arm: K.DROP_ARM, owner: b });
      if (RR.FX && RR.FX.dyeBurst) {
        RR.FX.dyeBurst(dx, 0.8, dz, 70);
        RR.FX.dyeBurst(dx, 3.2, dz, 50);
      }
      popRing(dx, 0.35, dz, 18, 0x2ecc71);
      chip(b, 'item', 'GREEN DYE ASTERN', 1500);
      recoil(b, 0.3, 0, 0);
      if (b.isPlayer && RR.Audio && RR.Audio.splash) RR.Audio.splash(0.8);

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
        o.angVel += (dx * fz - dz * fx > 0 ? 1 : -1) * K.WAVE_SPIN * k;
        o.bumpRecover = Math.max(o.bumpRecover || 0, 0.5 + k * 0.7);
        if (RR.FX && RR.FX.spray) RR.FX.spray(o.pos.x, o.pos.y + 0.4, o.pos.z,
          (dx / d) * 9, 5.0, (dz / d) * 9, 18, 5.5, 1.8);
        land(o, b, 'SHOCKWAVE', 1.2 * k, 0.7, 220);
        hits++;
      }
      b.vel.x += fx * K.WAVE_SELF; b.vel.z += fz * K.WAVE_SELF;
      popRing(b.pos.x, 0.35, b.pos.z, K.WAVE_R, 0x9fe8ff);
      popWall(b.pos.x, b.pos.z, K.WAVE_R, 0x9fe8ff);
      if (RR.FX) {
        if (RR.FX.detonation) RR.FX.detonation(b.pos.x, 0.4, b.pos.z, 1.0);
        if (RR.FX.spray) {
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * 6.283;
            RR.FX.spray(b.pos.x + Math.sin(a) * 4, 0.5, b.pos.z + Math.cos(a) * 4,
              Math.sin(a) * 22, 4.0, Math.cos(a) * 22, 8, 5.0, 2.0);
          }
        }
      }
      chip(b, 'item', hits ? 'SHOCKWAVE — HIT ' + hits : 'SHOCKWAVE', 1400);
      recoil(b, 0.85, 0.5, 280);
      if (b.isPlayer && RR.Audio && RR.Audio.splash) RR.Audio.splash(1.0);

    } else if (it.id === 'gulls') {
      const list = ahead(b, K.GULL_RANGE).slice(0, K.GULL_MAX);
      let hits = 0;
      for (const e of list) {
        if (consumeShield(e.o)) continue;
        st(e.o).gulls = K.GULL_T;
        hits++;
        // the flock ARRIVES: a burst of white over the wheelhouse on the frame it lands, so a
        // rival two hundred metres up the road visibly disappears into birds
        if (RR.FX && RR.FX.spray) RR.FX.spray(e.o.pos.x, e.o.pos.y + 3.4, e.o.pos.z, 0, 1.5, 0, 20, 7.0, 1.2, 3);
        popRing(e.o.pos.x, e.o.pos.y + 0.5, e.o.pos.z, 8, 0xf2f6f8);
        land(e.o, b, 'GULLS ON YOU', 0.7, 0.8, 220);
      }
      if (RR.Audio && RR.Audio.seagull) RR.Audio.seagull();
      chip(b, 'item', hits ? 'GULL SWARM — HIT ' + hits : 'GULL SWARM — NOBODY AHEAD', 1600);
      recoil(b, 0.15, 0, 0);

    } else if (it.id === 'torpedo') {
      // Fired UP THE ROUTE, not across open water: it advances in arc length and only slides
      // sideways to match its target, so it follows every bend of the river, never leaves the
      // channel, and cannot clip a wall. It is also the one item that reaches the leader from last
      // place, which is exactly the job the draw table gives it.
      const list = ahead(b, K.TORP_RANGE);
      const target = list.length ? list[0].o : null;      // whoever is next up the road; see reTarget
      const route = S.route;
      if (route) {
        U().pathAt(route, U().clamp(b.routeD || 0, 0, route.len - 1), TPT);
        const off = (b.pos.x - TPT.x) * TPT.tz - (b.pos.z - TPT.z) * TPT.tx;
        if (torps.length >= MAX_TORP) torps.shift();
        torps.push({ d: (b.routeD || 0) + b.radius + 2, off, x: b.pos.x, z: b.pos.z,
          hx: fx, hz: fz, life: K.TORP_LIFE, arm: K.TORP_ARM, acc: 0, reT: 0, owner: b, target,
          // the warning latch lives on the PROJECTILE, never on the victim: one that expires
          // harmlessly must not leave a boat permanently un-warnable about the next one
          warned: !!(target && target.isPlayer) });
      }
      popRing(b.pos.x + fx * 5, 0.4, b.pos.z + fz * 5, 12, 0xff5a3a);
      if (RR.FX) {
        if (RR.FX.burn) RR.FX.burn(b.pos.x + fx * 5, b.pos.y + 0.5, b.pos.z + fz * 5, fx * 20, 2, fz * 20, 26, 7);
        if (RR.FX.spray) RR.FX.spray(b.pos.x + fx * 5, 0.4, b.pos.z + fz * 5, fx * 16, 4.5, fz * 16, 26, 6.0, 2.0);
      }
      if (target && target.isPlayer) chip(target, 'bad', 'TORPEDO INCOMING — ' + nameOf(b), 2200);
      chip(b, 'item', target ? 'TORPEDO AWAY — ' + nameOf(target) : 'TORPEDO — NOBODY AHEAD', 1700);
      recoil(b, 0.55, 0.6, 260);
      if (b.isPlayer && RR.Audio && RR.Audio.airhorn) RR.Audio.airhorn();
    }
    if (b.isPlayer) lastFireT = RR.Engine.time();
    if (useHook) useHook(b, it);
    return true;
  }
  PU.onUse = function (fn) { useHook = fn; };
  // Seconds since the PLAYER last let an item go, or effectively forever. Published rather than
  // routed through onUse because onUse holds exactly one subscriber and the HUD already has it —
  // life.js turns the Riverwalk crowd on this.
  PU.firedAgo = function () { return RR.Engine.time() - lastFireT; };

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
      if (s.slamCd > 0) s.slamCd -= dt;
      if (s.turbo > 0) {
        s.turbo -= dt;
        // The sustained half of the item. Hold the burn hot so effects.js keeps the flame lit and
        // the rooster tail running, and push towards the raised ceiling every frame — physics.js
        // is bleeding her back down at 6 m/s² the whole time, so this is a fight, not an assignment.
        b.boostHeat = Math.max(b.boostHeat || 0, 0.95);
        b.turboFlame = 1;
        const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
        const cap = (b.spec.top || 40) * K.TURBO_TOP;
        const sp = Math.hypot(b.vel.x, b.vel.z);
        if (sp < cap) {
          const add = Math.min(K.TURBO_ACC * dt, cap - sp);
          b.vel.x += fx * add; b.vel.z += fz * add;
        }
        // It BURNS for the whole three seconds. A flash at the trigger and nothing after it is the
        // exact note the owner gave — you have to be able to look at a boat mid-race and see that
        // she is on a TURBO right now, from any angle, including from in front of her.
        s.burnAcc = (s.burnAcc || 0) + 90 * dt;
        const nb = Math.floor(s.burnAcc);
        s.burnAcc -= nb;
        if (nb && RR.FX && RR.FX.burn) {
          RR.FX.burn(b.pos.x - fx * b.radius * 1.5, b.pos.y + 0.55, b.pos.z - fz * b.radius * 1.5,
            -fx * 24 - b.vel.x * 0.15, 1.8, -fz * 24 - b.vel.z * 0.15, Math.min(4, nb), 7);
        }
        // …and the prop wash reads on the RECEIVING end: anybody you go past at this speed gets
        // shoved off their line by the water you just moved.
        for (const o of S.boats) {
          if (o === b || o.finished) continue;
          const dx = o.pos.x - b.pos.x, dz = o.pos.z - b.pos.z;
          const d2 = dx * dx + dz * dz;
          if (d2 > 196 || d2 < 1e-4) continue;               // 14 m
          const d = Math.sqrt(d2), k = 1 - d / 14;
          o.vel.x += (dx / d) * K.TURBO_WASH * k * dt;
          o.vel.z += (dz / d) * K.TURBO_WASH * k * dt;
          if (o.isPlayer && RR.Camera && RR.Camera.kick) RR.Camera.kick(1.6 * k * dt);
        }
        if (s.turbo <= 0) b.turboFlame = 0;
      }
      if (s.shield > 0) {
        s.shield -= dt;
        // the shield eats one real impact as well as one item — that is what makes it worth holding
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
        // a hull going round backwards throws water off the whole of one side
        if (RR.FX && RR.FX.spray && Math.random() < dt * 26) {
          const a = Math.random() * 6.283;
          RR.FX.spray(b.pos.x + Math.sin(a) * b.radius, b.pos.y + 0.3, b.pos.z + Math.cos(a) * b.radius,
            Math.sin(a) * 7, 3.0, Math.cos(a) * 7, 4, 3.6, 1.4);
        }
      }
      if (s.blind > 0) {
        s.blind -= dt;
        const k = Math.exp(-K.DYE_DRAG * dt);       // forty pounds of powder is thick water
        b.vel.x *= k; b.vel.z *= k;
      }
      if (s.gulls > 0) {
        s.gulls -= dt;
        // Birds are not scenery: they cost you the top of the rev range, whoever you are.
        const cap = (b.spec.top || 40) * K.GULL_TOP;
        const sp = Math.hypot(b.vel.x, b.vel.z);
        if (sp > cap) {
          const k = Math.max(cap / sp, 1 - (9.0 * dt) / sp);
          b.vel.x *= k; b.vel.z *= k;
        }
      }
      // A rival who cannot see WEAVES. The player keeps the wheel — the windscreen is punishment
      // enough — but gulls fighting for the helm is the whole reason the item is worth drawing, so
      // the player gets a real shove on the heading too, small enough to catch and correct.
      const w = (s.blind > 0 ? 0.95 : 0) + (s.gulls > 0 ? 0.85 : 0);
      if (w > 0) {
        const amp = b.isPlayer ? (s.gulls > 0 ? K.GULL_WHEEL : 0) : w;
        if (amp > 0) b.heading = U().wrapAngle(b.heading + Math.sin(t * 4.7 + s.seed) * amp * dt);
        if (!b.isPlayer) {
          const k = Math.exp(-0.35 * dt);
          b.vel.x *= k; b.vel.z *= k;
        }
      }
    }
  }

  // DEEP DISH does not just weigh more, it MOVES people. Mass alone reads as "they bounced off me";
  // the item has to read as "I went through them". Two layers: a continuous shove that lasts as
  // long as you are on top of somebody, and a one-shot SLAM the first time each victim is caught —
  // a full 21 m/s throw with a spin on it, because the moment of contact is the event.
  // x3.4 on a 0.98 m hull is a 3.3 m bite — you had to be almost touching, and rivals planted at
  // 10, 13 and 18 m were simply never caught. It hits like a truck when it connects, so the
  // problem was reach, not force: x9 gives it ~8.8 m, still far short of SHOCKWAVE's 34 m but wide
  // enough that driving AT someone actually collects them.
  function crushR(b) { return (b.radius || 3) * 9.0; }
  function bulldoze(b, dt) {
    const rr = crushR(b);
    for (const o of S.boats) {
      if (o === b || o.finished) continue;
      const dx = o.pos.x - b.pos.x, dz = o.pos.z - b.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > rr * rr || d2 < 1e-4) continue;
      const so = st(o);
      if (so.slamCd > 0) {
        const d = Math.sqrt(d2);
        o.vel.x += (dx / d) * 70 * dt; o.vel.z += (dz / d) * 70 * dt;
        b.bumpRecover = 0;
        continue;
      }
      if (consumeShield(o, b)) { so.slamCd = K.SLAM_CD; continue; }
      const d = Math.sqrt(d2);
      const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
      o.vel.x += (dx / d) * K.SLAM_PUSH; o.vel.z += (dz / d) * K.SLAM_PUSH;
      o.angVel += (dx * fz - dz * fx > 0 ? 1 : -1) * K.SLAM_SPIN;
      o.bumpRecover = Math.max(o.bumpRecover || 0, 1.1);
      so.slamCd = K.SLAM_CD;
      b.bumpRecover = 0;                     // the heavy one is not rattled by the light one
      popRing(o.pos.x, o.pos.y + 0.5, o.pos.z, 12, 0xffb03a);
      if (RR.FX && RR.FX.detonation) RR.FX.detonation(o.pos.x, o.pos.y + 0.3, o.pos.z, 0.85);
      land(o, b, 'RUN OVER BY DEEP DISH', 1.5, 0.66, 220);
      if (b.isPlayer) {
        if (RR.Camera && RR.Camera.kick) RR.Camera.kick(0.45);
        if (RR.Audio && RR.Audio.thud) RR.Audio.thud(0.9);
      }
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
        popRing(b.pos.x, 0.35, b.pos.z, 14, 0x7a5aa8);
        if (RR.FX && RR.FX.spray) {
          RR.FX.spray(b.pos.x, b.pos.y + 0.3, b.pos.z, 0, 4.5, 0, 34, 6.0, 2.0, 2);
          RR.FX.spray(b.pos.x, b.pos.y + 0.3, b.pos.z, 0, 3.0, 0, 16, 5.0, 1.5);
        }
        land(b, p.owner, 'OIL SLICK — SPINNING OUT', 1.1, 0.6, 300);
        if (b.isPlayer && RR.Audio && RR.Audio.splash) RR.Audio.splash(0.9);
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
        if (s.blind <= 0) land(b, p.owner, 'BLINDED BY GREEN DYE', 0.45, 0.8, 200);
        s.blind = K.BLIND_T;
      }
      if (RR.FX && RR.FX.dyeBurst && Math.random() < dt * 14) {
        RR.FX.dyeBurst(p.x + (Math.random() - 0.5) * p.r, 0.6 + Math.random() * 2,
          p.z + (Math.random() - 0.5) * p.r, 3);
      }
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      rings[i].t += dt;
      if (rings[i].t >= rings[i].life) rings.splice(i, 1);
    }
    for (let i = walls.length - 1; i >= 0; i--) {
      walls[i].t += dt;
      if (walls[i].t >= walls[i].life) walls.splice(i, 1);
    }
    updateTorps(dt);
  }

  // ---------------------------------------------------------------------------------------------
  // THE TORPEDO. It runs on the ROUTE, not on open water: d is arc length up the course and off is
  // a lateral offset clamped inside the channel, so it takes every bend the river takes, it can
  // never clip a quay or a lock wall, and it reaches the leader from last place. Deterministic —
  // no rolls anywhere in here, only the particles.
  // ---------------------------------------------------------------------------------------------
  function updateTorps(dt) {
    const route = S && S.route;
    for (let i = torps.length - 1; i >= 0; i--) {
      const p = torps[i];
      p.life -= dt; p.arm -= dt;
      if (!route || p.life <= 0) { detonate(p, null); torps.splice(i, 1); continue; }
      p.d += K.TORP_SPD * dt;
      if (p.d >= route.len - 4) { detonate(p, null); torps.splice(i, 1); continue; }

      // Re-acquire four times a second: it chases whoever is NEXT up the road, so a rival who
      // shields it or slides out of the way does not save the boat in front of them.
      p.reT -= dt;
      if (p.reT <= 0) {
        p.reT = 0.25;
        let best = 1e9, pick = null;
        for (const b of S.boats) {
          if (b === p.owner || b.finished || b.remote) continue;
          const gapM = (b.routeD || 0) - p.d;
          if (gapM > 1 && gapM < best) { best = gapM; pick = b; }
        }
        if (pick) p.target = pick;
      }
      // aim: slide across to wherever the target is sitting in the channel
      const tgt = p.target;
      if (tgt && !tgt.finished) {
        U().pathAt(route, U().clamp(tgt.routeD || 0, 0, route.len - 1), TPT);
        const toff = (tgt.pos.x - TPT.x) * TPT.tz - (tgt.pos.z - TPT.z) * TPT.tx;
        p.off = U().damp(p.off, toff, K.TORP_TRACK, dt);
      }
      U().pathAt(route, U().clamp(p.d, 0, route.len - 1), PPT);
      const half = Math.min(30, Math.max(5, PPT.w - 3));
      p.off = U().clamp(p.off, -half, half);
      const nx = PPT.x + PPT.tz * p.off, nz = PPT.z - PPT.tx * p.off;
      const mx = nx - p.x, mz = nz - p.z;
      if (mx * mx + mz * mz > 1e-6) { const l = Math.hypot(mx, mz); p.hx = mx / l; p.hz = mz / l; }
      p.x = nx; p.z = nz;

      // The wake, rate-limited per second so the trail is the same length whatever the frame rate
      // is doing. Deliberately NOT FX.gust — that emitter seeds across a seventy-metre band
      // because it was built for a weather front, and scattering a torpedo's wake over half the
      // channel is exactly how you lose the line that says which way the thing is going.
      p.acc += 220 * dt;
      const n = Math.min(8, Math.floor(p.acc));
      p.acc -= Math.floor(p.acc);
      if (n && RR.FX) {
        // The churn is the long-lived weightless streak, seeded in a narrow band right on the
        // tail: at 62 m/s ordinary spray dies before it has drawn a line, and a torpedo with no
        // line behind it is a shape you cannot tell the direction of.
        if (RR.FX.gust) RR.FX.gust(p.x - p.hx * 4, 0.8, p.z - p.hz * 4, -p.hx, -p.hz, n, 3.5, 5);
        if (RR.FX.spray) RR.FX.spray(p.x - p.hx * 3.2, 0.45, p.z - p.hz * 3.2,
          -p.hx * 10, 7.5, -p.hz * 10, Math.min(4, n), 3.2, 2.2, 3);   // the rooster tail on top
      }

      let hit = null;
      for (const b of S.boats) {
        if (b.finished || b.remote) continue;
        if (b === p.owner && p.arm > 0) continue;
        const rr = K.TORP_R + b.radius;
        if (U().dist2(b.pos.x, b.pos.z, p.x, p.z) > rr * rr) continue;
        hit = b; break;
      }
      // the warning: you get roughly a second and a half of knowing it is coming, which is the
      // difference between "what just happened" and "I nearly got out of the way"
      if (!hit && tgt && tgt.isPlayer && !p.warned && (tgt.routeD || 0) - p.d < K.TORP_SPD * 1.5) {
        p.warned = true;
        chip(tgt, 'bad', 'TORPEDO INCOMING — ' + nameOf(p.owner), 1800);
      }
      if (hit) { detonate(p, hit); torps.splice(i, 1); }
    }
  }

  function detonate(p, victim) {
    popRing(p.x, 0.4, p.z, 26, 0xff5a3a);
    popRing(p.x, 0.4, p.z, 16, 0xffd0a0);
    popWall(p.x, p.z, 24, 0xcfe8ff);
    if (RR.FX) {
      if (RR.FX.detonation) RR.FX.detonation(p.x, 0.4, p.z, victim ? 1.7 : 1.0);
      if (RR.FX.burn) RR.FX.burn(p.x, 1.2, p.z, 0, 9, 0, victim ? 40 : 18, 12);
    }
    if (!victim) return;
    if (consumeShield(victim)) return;
    const s = st(victim);
    s.spin = K.SPIN_T * 1.3;
    s.spinDir = (victim.visRoll || 0) >= 0 ? 1 : -1;
    victim.vel.x *= K.TORP_SLOW; victim.vel.z *= K.TORP_SLOW;
    victim.vel.x += p.hx * 9; victim.vel.z += p.hz * 9;      // and a shove down the road with it
    victim.angVel += s.spinDir * 4.0;
    victim.bumpRecover = Math.max(victim.bumpRecover || 0, 1.6);
    land(victim, p.owner, 'TORPEDO HIT', 1.6, 0.5, 340);
    if (victim.isPlayer && RR.Audio && RR.Audio.thud) RR.Audio.thud(1.0);
    if (p.owner && p.owner.isPlayer) {
      chip(p.owner, 'item', 'TORPEDO HIT — ' + nameOf(victim), 1800);
      if (RR.Camera && RR.Camera.kick) RR.Camera.kick(0.3);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // THE AI'S ITEM BRAIN. Difficulty is PATIENCE, not accuracy: a ROOKIE lets fly the moment the
  // slot locks and wastes a TORPEDO on an empty river; a LEGEND sits on it until you are actually
  // up the road in front of her.
  // ---------------------------------------------------------------------------------------------
  function aiBrain(b, dt) {
    const s = st(b);
    if (!s.held || s.roll > 0) return;
    if (s.aiHold > 0) { s.aiHold -= dt; return; }
    const w = U().clamp((diff() - 0.7) / 0.75, 0, 1);     // 0 rookie · 0.4 skipper · 1 legend
    // The clock is armed once per item (give() nulls it) and then allowed to RUN OUT. It used to be
    // re-armed on any frame it was already spent, so "patience gone, just use it" could only fire
    // on the one frame in twenty-one where the 0.35 s check gate happened to open on the same tick
    // the clock crossed zero — which meant a rival with nobody to aim at, and the cold open's own
    // boat, sat on an item indefinitely and only ever fired on wants().
    if (s.aiPatience == null) s.aiPatience = U().lerp(1.2, 9.0, w);
    s.aiPatience -= dt;
    s.aiCheck -= dt;
    if (s.aiCheck > 0) return;
    s.aiCheck = 0.35;
    if (s.aiPatience <= 0 || wants(b, s.held)) {
      fire(b);
      s.aiPatience = null;
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
      case 'bowwave': return nearest < 22;
      case 'gulls': return anyAhead;
      case 'torpedo': return anyAhead;
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
      setTint(ringIM, n, r.color);
      ringIM.setMatrixAt(n++, M4);
    }
    ringIM.visible = n > 0;
    if (n) ringIM.material.opacity = 0.62 * (1 - rings[0].t / rings[0].life) + 0.12;
    for (let i = n; i < MAX_RING; i++) ringIM.setMatrixAt(i, HIDE);
    ringIM.instanceMatrix.needsUpdate = true;
    if (ringIM.instanceColor) ringIM.instanceColor.needsUpdate = true;

    // the wave walls: radius races out, height collapses as it goes, so it reads as water
    // spreading and flattening rather than a cylinder being scaled
    n = 0;
    for (const w of walls) {
      if (n >= MAX_WALL) break;
      const u = w.t / w.life;
      Q0.identity();
      V3.set(w.x, U().waterHeight(w.x, w.z, t, RR.River.waveAmp(w.x, w.z)) - 0.2, w.z);
      const rad = U().lerp(w.r0, w.r1, Math.pow(u, 0.55));
      SC.set(rad, w.h * (1 - u) * (1 - u) + 0.4, rad);
      M4.compose(V3, Q0, SC);
      setTint(wallIM, n, w.color);
      wallIM.setMatrixAt(n++, M4);
    }
    wallIM.visible = n > 0;
    if (n) wallIM.material.opacity = 0.62 * (1 - walls[0].t / walls[0].life);
    for (let i = n; i < MAX_WALL; i++) wallIM.setMatrixAt(i, HIDE);
    wallIM.instanceMatrix.needsUpdate = true;
    if (wallIM.instanceColor) wallIM.instanceColor.needsUpdate = true;

    n = 0;
    for (const p of torps) {
      if (n >= MAX_TORP) break;
      Q0.setFromAxisAngle(UP, Math.atan2(p.hx, p.hz));
      V3.set(p.x, U().waterHeight(p.x, p.z, t, RR.River.waveAmp(p.x, p.z)) + 0.12, p.z);
      SC.set(1, 1 + Math.sin(t * 24) * 0.10, 1);
      M4.compose(V3, Q0, SC);
      torpIM.setMatrixAt(n++, M4);
    }
    torpIM.visible = n > 0;
    for (let i = n; i < MAX_TORP; i++) torpIM.setMatrixAt(i, HIDE);
    torpIM.instanceMatrix.needsUpdate = true;
  }

  function drawAuras(t) {
    let nf = 0, nh = 0, nb = 0, nc = 0;
    for (const b of S.boats) {
      const s = b._pu;
      if (!s) continue;
      if (s.shield > 0 && nb < MAX_AURA) {
        const fade = s.shield < 2 ? (0.55 + 0.45 * Math.sin(t * 22)) : 1;
        Q0.setFromAxisAngle(UP, t * 0.35);
        const r = (b.radius + 1.5) * fade;
        V3.set(b.pos.x, b.pos.y + 0.5, b.pos.z);
        SC.set(r, r * 0.72, r);
        M4.compose(V3, Q0, SC);
        bubbleIM.setMatrixAt(nb++, M4);
      }
      if (s.heavy > 0 && nc < MAX_AURA) {
        // the crush zone, at the radius it actually bites at — the one honest warning a rival gets
        Q0.setFromAxisAngle(UP, -t * 0.9);
        const r = crushR(b) * (1 + Math.sin(t * 6) * 0.04);
        V3.set(b.pos.x, U().waterHeight(b.pos.x, b.pos.z, t, RR.River.waveAmp(b.pos.x, b.pos.z)) + 0.14, b.pos.z);
        SC.set(r, 1, r);
        M4.compose(V3, Q0, SC);
        crushIM.setMatrixAt(nc++, M4);
      }
      if (s.shield > 0 && nf < MAX_AURA) {
        // two hoops, one at the waterline and one at the rubbing strake, counter-rotating slowly.
        // The last two seconds strobe, so a shield about to lapse says so.
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
    bubbleIM.visible = nb > 0;
    crushIM.visible = nc > 0;
    for (let i = nf; i < MAX_AURA; i++) fenderIM.setMatrixAt(i, HIDE);
    for (let i = nh; i < MAX_AURA; i++) heavyIM.setMatrixAt(i, HIDE);
    for (let i = nb; i < MAX_AURA; i++) bubbleIM.setMatrixAt(i, HIDE);
    for (let i = nc; i < MAX_AURA; i++) crushIM.setMatrixAt(i, HIDE);
    fenderIM.instanceMatrix.needsUpdate = true;
    heavyIM.instanceMatrix.needsUpdate = true;
    bubbleIM.instanceMatrix.needsUpdate = true;
    crushIM.instanceMatrix.needsUpdate = true;

    // Sixteen birds per victim, in two rings at different heights and speeds. Eight in one flat
    // orbit read as a fairground ride; two counter-set rings read as a boat disappearing into a
    // flock, which is what the item is called.
    let g = 0;
    for (const b of S.boats) {
      const s = b._pu;
      if (!s || s.gulls <= 0 || b.isPlayer) continue;   // you are INSIDE your own flock; see the windscreen
      for (let i = 0; i < 16 && g < MAX_GULL; i++, g++) {
        const ring = i & 1;
        const a = t * (ring ? -1.9 : 2.6) + i * 0.785;
        const r = 2.6 + (i % 5) * 0.85;
        V3.set(b.pos.x + Math.sin(a) * r,
          b.pos.y + (ring ? 3.6 : 2.2) + Math.sin(t * 3 + i) * 0.8,
          b.pos.z + Math.cos(a) * r);
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
  // ghost that never had them, and multiplayer has no authority to agree on who got shoved — those
  // three run clean.
  function active() {
    return !!(S && group && PU.enabled() && crates.length && !S.tour && !S.timeTrial && !S.mp);
  }
  PU.active = active;

  function dropEverything() {
    slicks.length = 0; dyes.length = 0; rings.length = 0; walls.length = 0; torps.length = 0;
    if (S && S.boats) {
      for (const b of S.boats) {
        const s = b._pu;
        if (!s) continue;
        if (s.heavy > 0) b.mass = s.baseMass;
        s.held = null; s.roll = 0; s.shield = 0; s.heavy = 0; s.spin = 0;
        s.blind = 0; s.gulls = 0; s.turbo = 0; s.slamCd = 0;
        b.turboFlame = 0;
      }
    }
    if (overlay) overlay.visible = false;
  }

  PU.buildForRace = function (state) {
    PU.clear();
    // A ride and a record run never get crates at all, so they do not even pay to build them.
    // (Multiplayer is only known AFTER start() returns, so it is caught by active() instead and
    // the built crates simply stay hidden.)
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
    group = crateIM = haloIM = slickIM = dyeIM = fenderIM = bubbleIM = heavyIM = null;
    crushIM = ringIM = wallIM = gullIM = torpIM = null;
    overlay = overlayMat = null;
    crates = []; slicks = []; dyes = []; rings = []; walls = []; torps = [];
    S = null; keyWas = false; lastFireT = -1e9;
    lastHit.label = ''; lastHit.from = ''; lastHit.t = -1e9;
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
      blind: Math.max(0, p.blind), gulls: Math.max(0, p.gulls), turbo: Math.max(0, p.turbo) };
  };
  // Seconds until the live torpedo reaches the player, or 0. The HUD's incoming warning reads this.
  PU.incoming = function () {
    const me = S && S.player;
    if (!me || !torps.length) return 0;
    let best = 0;
    for (const p of torps) {
      if (p.owner === me) continue;
      const gapM = (me.routeD || 0) - p.d;
      if (gapM <= 0 || gapM > K.TORP_SPD * 3) continue;
      const eta = gapM / K.TORP_SPD;
      if (!best || eta < best) best = eta;
    }
    return best;
  };
  // What last landed on the PLAYER and who threw it: {label, from, ago}. The HUD raises its own
  // plate off status() rising edges, and this is how that plate says "TORPEDO HIT — LOU CANAL"
  // instead of "SPUN OUT".
  PU.lastHit = function () {
    return { label: lastHit.label, from: lastHit.from, ago: RR.Engine.time() - lastHit.t };
  };
  PU.debug = function () {
    return {
      enabled: PU.enabled(), active: active(),
      crates: crates.length, live: crates.filter((c) => !c.taken).length,
      held: PU.heldId(), rolling: PU.rolling(),
      slicks: slicks.length, dyes: dyes.length, rings: rings.length, walls: walls.length,
      torps: torps.map((p) => ({ d: Math.round(p.d), off: +p.off.toFixed(1),
        life: +p.life.toFixed(2), target: nameOf(p.target) })),
      incoming: +PU.incoming().toFixed(2),
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

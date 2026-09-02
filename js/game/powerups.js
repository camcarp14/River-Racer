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
  // FRONT WEIGHTS ARE DEFENCE. Measured before this tune, oddsAt(0) was turbo 25% / slick 22% /
  // dye 14% — 61% of the leader's table only ever hurt the boats behind her, and items ON widened
  // the field by 23 s against items OFF (fairness2, MAIN STEM, SKIPPER). P1 now draws the SHIELD
  // first and keeps a TURBO she can actually use; the offence lives in the tail's column, where it
  // compresses the race instead of stretching it.
  //
  // NAMES AND BLURBS ARE PLAIN. Every one of them says what the thing does to whom, in words you
  // would use out loud. GALE OFF THE LAKE is gone: its effect was a sideways nudge you could not
  // see and could not name, and a power-up you cannot perceive is not a power-up. The TORPEDO
  // replaces it in the same slot in the draw table — the tail's big swing at whoever is winning.
  PU.ITEMS = [
    { id: 'turbo', name: 'TURBO', short: 'TURBO', kind: 'self', color: 0x25ff7a, glyph: '»',
      blurb: 'Huge speed burst for 3 seconds.', front: 12, mid: 26, back: 18 },
    // id stays 'fender' — hud.js and the saved-preference path key off ids, and renaming a key to
    // match a label is how you break a save file for a caption.
    { id: 'fender', name: 'SHIELD', short: 'SHIELD', kind: 'self', color: 0x7ec8e3, glyph: '◌',
      // It blocks items and one HARD wall crash, but NOT a plain boat-to-boat ram — physics only
      // reports a shield hit on wall contact, and only above severity 0.45 (physics.js SHIELD_AWARE,
      // ~8 m/s into the quay). A graze keeps it. Say what it does rather than what the name implies.
      blurb: 'Blocks the next item or hard crash.', front: 46, mid: 20, back: 6 },
    { id: 'slick', name: 'OIL SLICK', short: 'OIL SLICK', kind: 'drop', color: 0x2a3c4e, glyph: '≈',
      blurb: 'Drops 3 slicks behind you. They spin out.', front: 16, mid: 22, back: 10 },
    { id: 'dye', name: 'GREEN DYE', short: 'GREEN DYE', kind: 'drop', color: 0x2ecc71, glyph: '◉',
      blurb: 'Green cloud astern. Blinds anyone in it.', front: 8, mid: 20, back: 12 },
    { id: 'deepdish', name: 'DEEP DISH', short: 'DEEP DISH', kind: 'self', color: 0xffb03a, glyph: '●',
      blurb: 'You turn heavy and smash boats aside.', front: 4, mid: 26, back: 20 },
    { id: 'bowwave', name: 'SHOCKWAVE', short: 'SHOCKWAVE', kind: 'burst', color: 0x9fe8ff, glyph: '(',
      blurb: 'Blast of water throws nearby boats away.', front: 2, mid: 20, back: 24 },
    { id: 'gulls', name: 'GULL SWARM', short: 'GULLS', kind: 'ahead', color: 0xf2f6f8, glyph: '^',
      blurb: 'Birds mob the 4 boats ahead of you.', front: 0, mid: 12, back: 26 },
    { id: 'torpedo', name: 'TORPEDO', short: 'TORPEDO', kind: 'ahead', color: 0xff5a3a, glyph: '➤',
      blurb: 'Homes on the next boat up the river.', front: 0, mid: 4, back: 34 },
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
    // Reach WAS the rivals' whole advantage: 4.5 m of it on top of aiSteer meant a rival passing
    // 8.7 m wide of a crate still pocketed it (measured T0b) while the player needed 4.4 m. aiSteer
    // is the honest version and main.js wires it in, so the extra reach is down to a metre — and
    // the player gets two, because you cannot see your own bow.
    AI_REACH: 1.0, PLAYER_REACH: 2.0,
    RESPAWN: 7.0,
    ROLL_T: 0.85,                           // how long the slot spins before it locks (player only)
    SHIELD_T: 12.0, SHIELD_BOUNCE: 22,      // what the blocked boat gets thrown back with
    HEAVY_T: 8.0, HEAVY_MASS: 6.0, HEAVY_TOP: 0.97,
    // The one-shot hit DEEP DISH lands per victim. SLAM_CD is a DRAMA budget as much as a balance
    // one: at 1.1 s a heavy boat held station on one rival and slammed it SEVEN times in eight
    // seconds (measured T4, thrown to 48.3 m/s against a 41 m/s top). Three seconds per victim, and
    // the reach is fixed rather than radius*9 — that read 8.8 m on a jet ski and 34 m on the tour
    // boat, so nobody could learn where the ring bites.
    SLAM_PUSH: 21, SLAM_YAW: 0.5, SLAM_CD: 3.0, SLAM_REACH: 8.0, SLAM_HOLD: 30,
    // SPIN_DRAG 1.9 stopped a spun hull to 5% of her speed: a slick cost 126 m, 3.3 s (behave3 V2).
    // At 1.0 it costs about 2 s — a mistake you drive out of, not a race you lose.
    SPIN_T: 1.6, SPIN_W: 5.5, SPIN_DRAG: 1.0,
    // The post-hit grace, and how fast a yaw kick is paid out (95% of it inside 0.25 s).
    GRACE_T: 2.5, IMMUNE_T: 1.5, YAW_RATE: 12,
    SLICK_T: 14.0, SLICK_R: 7.0, SLICK_N: 3, SLICK_SPREAD: 9.0, DROP_ARM: 0.9,
    DYE_T: 10.0, DYE_R0: 8.0, DYE_R1: 17.0, BLIND_T: 2.2, DYE_DRAG: 0.55,
    GULL_T: 4.5, GULL_RANGE: 320, GULL_MAX: 4, GULL_TOP: 0.80, GULL_WHEEL: 0.5,
    // At 62 m/s the fish closed on a 38 m/s hull at 24 m/s, so seven seconds of life reached about
    // 200 m of the 520 m it aimed at (measured U7: 200 m hit at 6.0 s, 280 m expired unfired) — the
    // tail's big swing was a dud. 90 m/s closes at ~52 and reaches ~360 m, and TORP_TRACK 2.6 still
    // lets a boat that moves get missed.
    TORP_SPD: 90, TORP_LIFE: 7.0, TORP_RANGE: 520, TORP_R: 4.6, TORP_TRACK: 2.6,
    TORP_SLOW: 0.40, TORP_ARM: 0.35,
    // WAVE_YAW is RADIANS of hull, not rad/s of angVel: physics unwinds angVel at 6.5/s and halves
    // it every frame bumpRecover is up, so 1.9 rad/s of applied spin was 0.11 rad/s two frames
    // later (measured T5) and two of the three throw items read as a shove with no rotation.
    WAVE_R: 34, WAVE_PUSH: 26, WAVE_SELF: 8.0, WAVE_YAW: 0.45,
    TURBO_T: 3.0, TURBO_KICK: 16.0, TURBO_ACC: 26, TURBO_TOP: 1.55, TURBO_WASH: 13,
    // THE AI'S ITEM ECONOMY, on ONE curve — RR.AI.tierW, the same convex w that tunes their
    // driving (0 rookie · 0.55 skipper · 1 legend), so nobody tunes one and mis-tunes the other.
    // AI_FIRE_GAP is the minimum seconds between one rival's shots. Measured without it: 19.1
    // (ROOKIE) / 21.3 (SKIPPER) / 15.0 (LEGEND) items per minute from the field, while the player
    // drew ONE crate a race — a rookie race was a torpedo range. AI_ITEMS_PER_MIN is what the gap
    // is aimed at with five rivals, and what the bar measures: <= 6 rookie, <= 9 skipper, <= 12
    // legend (5 rivals * 60 / gap is the ceiling; crate supply keeps them well under it).
    AI_FIRE_GAP: [12.0, 3.0], AI_ITEMS_PER_MIN: [6, 9, 12],
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
    // Online this is only a PREFERENCE — the room's mode came down with the start flag and one
    // player quietly switching items off mid-race is exactly the desync this whole file exists to
    // stop. So the live race is left alone unless the room itself is running without items.
    if (!itemsOn()) dropEverything();
    if (group) group.visible = itemsOn();
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
  // MULTIPLAYER AUTHORITY
  //
  // Three rules. Everything with net() in it below is one of them:
  //
  //   1. THE HOST OWNS THE CRATES AND EVERY DRAW. Placement is deterministic from the course seed,
  //      so all clients build the same rows — but availability is not placement. Two boats abreast
  //      through one crate can only be settled by one authority, and the draw is weighted by race
  //      position, which only an authority knows for everybody. So a client CLAIMS; it never rolls.
  //
  //   2. THE VICTIM'S OWN CLIENT APPLIES THE PHYSICS. net.js's applyRemote interpolates remote
  //      hulls from the wire; a shove written onto somebody else's boat fights that interpolation
  //      and rubber-bands. So every client plays the visuals for every boat, and only the boat's
  //      owner ever moves it. mine() is that line, and it is `true` for the whole field offline —
  //      which is why single-player runs the identical code and cannot rot.
  //
  //   3. AIM BY ROUTE DISTANCE, NOT WORLD POSITION. At 14 Hz a target has moved by the time the
  //      message lands; its arc length up the river has barely changed and every client agrees on
  //      it. The torpedo already flew that way, so it is the one item latency costs nothing.
  //
  // Four message types, all carried by net.js and owned here:
  //   pcl {c}                       client -> host   "I am through crate c"
  //   pgr {c,w,i,n}                 host -> all      "w gets crate c, and the item is i"
  //   pfr {w,i,n,x,z,h[,d,o,g]}     firer -> all     "w let item i go, from here, at these targets"
  //   pht {k,f,v[,n,x,z]}           victim -> all    "it hit me" / "my shield ate it"
  // ---------------------------------------------------------------------------------------------
  // A boat is only inside a crate's grab radius for about two tenths of a second at racing speed,
  // so an unanswered claim has to come round again INSIDE that window or it is simply lost. Three
  // claims for one crate cost nothing — the host answers the first and the rest die in silence.
  const CLAIM_RETRY = 0.4;
  const HOLD_GRACE = 0.7;    // a local authoritative change outranks a 14 Hz report this much older
  let grantSeq = 0, fireSeq = 0, netSeen = Object.create(null), netLog = [];

  function net() { return !!(S && S.mp && RR.Net && RR.Net.active); }
  function myId() { return net() && RR.Net.self ? RR.Net.self().id : null; }
  function isHost() { return net() && RR.Net.isHost(); }
  // The one line the whole design hangs on: offline this client owns the entire field, online it
  // owns exactly one hull.
  function mine(b) { return !net() || b === S.player; }
  function netIdOf(b) { return !b ? null : b === S.player ? myId() : (b.netId || null); }
  function boatById(id) {
    if (!id || !S) return null;
    if (id === myId()) return S.player;
    for (const b of S.boats) if (b.netId === id) return b;
    return null;                    // a peer who joined mid-race, or one that was never in this one
  }
  function trace(dir, m) {
    netLog.push(dir + m.t + ' ' + JSON.stringify(m));
    if (netLog.length > 80) netLog.shift();
  }
  function send(m) { if (net() && RR.Net.send) { trace('> ', m); RR.Net.send(m); } }
  // duplicate suppression, one flat table: a grant or a hit replayed is a no-op, never a second one
  function once(key) { if (netSeen[key]) return false; netSeen[key] = 1; return true; }
  function netReset() { grantSeq = 0; fireSeq = 0; netSeen = Object.create(null); netLog = []; }

  // net.js hands every pcl/pgr/pfr/pht straight here.
  PU.onNet = function (t, from, m) {
    if (!m || !net() || !active()) return;
    trace('< ', m);
    if (t === 'pcl') resolveClaim(from, m.c | 0);
    else if (t === 'pgr') applyGrant(m);
    else if (t === 'pfr') applyFire(from, m);
    else if (t === 'pht') applyHit(m);
  };

  // ---- the host's side of a crate -------------------------------------------------------------
  function resolveClaim(fromId, idx) {
    if (!isHost()) return;                    // not my job; the lowest id in the room answers
    const c = crates[idx];
    if (!c || c.taken) return;                // a claim for a crate already taken dies in silence:
    const b = boatById(fromId);               // first claim wins, and the loser sees the grant land
    if (!b || b.finished) return;             // a peer with no boat in THIS race gets no crates
    if (st(b).held) return;                   // a full slot never eats a crate, wherever it is
    const it = rollFor(b);                    // the draw is position-weighted — hence host-only
    const m = { t: 'pgr', c: idx, w: fromId, i: it.id, n: ++grantSeq };
    send(m);
    applyGrant(m);
  }

  function applyGrant(m) {
    const idx = m.c | 0, c = crates[idx];
    if (!c) return;
    if ((m.n | 0) > grantSeq) grantSeq = m.n | 0;   // a promoted host carries on the old numbering
    if (!once('g' + idx + ':' + (m.n | 0))) return; // a duplicate grant changes nothing
    if (c.taken) return;                            // two hosts for one frame: the first one stands
    c.taken = true; c.t = K.RESPAWN; c.claimT = 0;
    popRing(c.x, 0.5, c.z, 6, 0x6ff0ff);
    if (RR.FX && RR.FX.spray) RR.FX.spray(c.x, 1.0, c.z, 0, 4.5, 0, 12, 4.0, 1.2);
    const b = boatById(m.w), it = PU.byId(m.i);
    if (!b || !it) return;              // a grant to somebody who has left still spends the crate —
    const s = st(b);                    // leaving it standing would hand the next boat a free one
    s.held = it;
    s.roll = b === S.player ? K.ROLL_T : 0;   // the slot only spins for the player who has to read it
    s.aiPatience = null;
    s.stamp = RR.Engine.time();
    if (b === S.player) {
      if (RR.Audio && RR.Audio.checkpoint) RR.Audio.checkpoint();
      if (RR.Camera && RR.Camera.kick) RR.Camera.kick(0.12);
    }
  }

  // ---- an incoming shot -----------------------------------------------------------------------
  function applyFire(fromId, m) {
    const b = boatById(m.w || fromId);
    const it = PU.byId(m.i);
    if (!b || !it) return;                                  // a fire from a peer who is not in this
    if (!once('f' + (m.w || fromId) + ':' + (m.n | 0))) return;  // race is dropped, never drawn
    const s = st(b);
    s.held = null; s.roll = 0; s.stamp = RR.Engine.time();
    launch(b, it, m, null);
  }

  function applyHit(m) {
    if (m.k === 'sh') {
      if (!isFinite(m.x) || !isFinite(m.z)) return;   // never feed a malformed packet to a matrix
      // A shield ate something. Everybody pops the burst; only the boat that ran into it moves.
      popRing(m.x, 0.9, m.z, 13, 0x7ec8e3);
      popWall(m.x, m.z, 14, 0x9fe8ff);
      if (RR.FX && RR.FX.detonation) RR.FX.detonation(m.x, 0.5, m.z, 0.9);
      const vb = boatById(m.v);
      if (vb) { const s = st(vb); s.shield = 0; s.stamp = RR.Engine.time(); }
      if (m.f && m.f === myId()) bounceOff(S.player, m.x, m.z, vb);
      return;
    }
    if (m.k === 'sl' || m.k === 'dy') {
      const list = m.k === 'sl' ? slicks : dyes;
      for (const p of list) {
        if (p.oid !== m.f || (p.seq | 0) !== (m.n | 0) || (p.k | 0) !== (m.i | 0)) continue;
        p.t = m.k === 'sl' ? Math.min(p.t, 0.35) : 0;    // spent, or blown away by a shield
      }
      return;
    }
    if (m.k === 'tp') {
      const p = torpByKey(m.f, m.n | 0);
      if (!p) return;                        // already gone here: it expired, or it hit us first
      detonate(p, boatById(m.v), !!m.b);
      const i = torps.indexOf(p);
      if (i >= 0) torps.splice(i, 1);
    }
  }

  function torpByKey(oid, seq) {
    for (const p of torps) if (p.oid === oid && p.seq === seq) return p;
    return null;
  }

  function bounceOff(b, x, z, src) {
    if (!b || b.finished) return;
    const dx = b.pos.x - x, dz = b.pos.z - z;
    const d = Math.max(1e-3, Math.hypot(dx, dz));
    b.vel.x += (dx / d) * K.SHIELD_BOUNCE;
    b.vel.z += (dz / d) * K.SHIELD_BOUNCE;
    b.bumpRecover = Math.max(b.bumpRecover || 0, 0.8);
    land(b, src, 'BOUNCED OFF A SHIELD', 0.9, 0.75, 200);
  }

  const rd = (v) => Math.round(v * 10) / 10;
  const rd3 = (v) => Math.round(v * 1000) / 1000;

  // ROUTE DISTANCE IS ABSOLUTE ARC LENGTH: race.js writes routeD = lap*len + d, so on the LAKE
  // MICHIGAN CIRCUIT lap 2 starts at 2301 on a 2301 m route. Every pathAt sample therefore has to
  // WRAP, not clamp — a clamp pins the whole of lap 2 to the finish-line tangent, which is what
  // left the torpedo dead on launch and the AI's turbo test reading the seam (measured T13: fire
  // returned true and torps was [] on the next frame). One helper, used at every pathAt call site.
  function lapD(route, d) {
    const len = route.len;
    return route.loop ? (((d % len) + len) % len) : U().clamp(d, 0, len - 1);
  }
  // Where the course ENDS in absolute arc length, so a fish expires at the flag, not at the seam.
  function courseEnd(route) {
    return route.loop ? ((S && S.course && S.course.laps) || 1) * route.len : route.len;
  }
  // ai.js's tier weight, so items and driving run off one curve (rivals-14). Feature-detected: the
  // local fallback is the same formula.
  function tierW() {
    const d = diff();
    if (RR.AI && RR.AI.tierW) return RR.AI.tierW(d);
    return Math.pow(U().clamp((d - 0.7) / 0.75, 0, 1), 0.65);
  }

  // THE POST-HIT GRACE, in one place. Measured (fairness2, MAIN STEM, SKIPPER, autopilot player):
  // 13/7/9 hits on the player per race, with the same boat 'RUN OVER BY DEEP DISH' twice running —
  // items chained on whoever was already in trouble. A boat that is spun, blinded, freshly slammed
  // or within GRACE_T of its last hit cannot be hit again, by anything: slick, dye, gulls, torpedo,
  // DEEP DISH and SHOCKWAVE all ask here and nowhere else.
  function vulnerable(b) {
    const s = b._pu;
    if (!s) return true;
    if (s.spin > 0 || s.blind > 0 || (s.immune || 0) > 0) return false;
    return RR.Engine.time() - (s.lastHitT || -1e9) >= K.GRACE_T;
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
  const TPT = {}, PPT = {}, SPT = {};          // pathAt scratch — no allocation in update()
  const C0 = new THREE.Color();
  // GULL_MAX victims × 16 birds each — sized so the fourth victim is not the one that silently
  // gets no flock.
  const MAX_SLICK = 18, MAX_DYE = 10, MAX_RING = 10, MAX_AURA = 8, MAX_GULL = 64,
        // six torpedoes, not four: online every client flies EVERY boat's fish, and a full room is
        // six boats. Overflowing the pool would drop a projectile on one screen and not another.
        MAX_WALL = 4, MAX_TORP = 6;

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
  // Nine metres clear of anything else that draws a ring on the water. MEASURED (crates.js): a
  // crate 2.3 m from the HARBOR LOCK gate centre made taking the gate and taking the crate one
  // move and drew one unreadable glyph; course 2 had one 7 m from MARINA CITY SLIPS.
  function nearFurniture(state, x, z, r) {
    const r2 = r * r;
    for (const g of state.boostGates || []) if (U().dist2(x, z, g.x, g.z) < r2) return true;
    for (const cp of state.checkpoints || []) {
      const bx = cp.tz * cp.off, bz = cp.tx * cp.off;
      if (U().dist2(x, z, cp.x + bx, cp.z - bz) < r2) return true;
      if (U().dist2(x, z, cp.x - bx, cp.z + bz) < r2) return true;
    }
    return false;
  }

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
        if (pt.w < 16) continue;                  // never bait anybody between the piers: ai.js's
        // own tight-water number, and the width where blocking and shoving are vetoed too
        if (nearFurniture(state, cx, cz, 9)) continue;
        if (RR.River.hitObstacle && RR.River.hitObstacle(cx, cz, 2.5)) continue;
        // The beacon is an 11 m column and 8/16/34 crates on courses 0/1/2 stood under a bridge
        // deck with 5.5-6.4 m of clearance, so the shaft speared the steel. clearanceAt is the real
        // footprint (bridges.js:65) — duckY is a 57 m camera blob and would crop beacons a bridge
        // away. Baked at build time: the spans do not move, only their leaves do.
        let hy = 1;
        if (RR.Bridges && RR.Bridges.clearanceAt) {
          const cl = RR.Bridges.clearanceAt(cx, cz);
          if (isFinite(cl)) hy = U().clamp((cl - 0.5) / 11, 0.12, 1);
        }
        // claimT: online, how long this client waits for the host's answer before claiming again
        out.push({ x: cx, z: cz, d: pt.d, t: 0, spin: rng() * 6.283, seed: rng() * 6.283, taken: false, claimT: 0, hy });
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
    // Below w 0.35 a RIVAL's reach items are cut to 30% of their weight. ROOKIE is described as
    // 'good for learning the river' and a first-timer was being torpedoed and mobbed several times
    // a race (measured: spin 9 / gulls 11 / blind 5 over four ROOKIE races). The player's table is
    // never scaled, and the position weighting is untouched — only the tier tilts it.
    const cut = !boat.isPlayer && tierW() < 0.35 ? 0.3 : 1;
    const wOf = (it) => weightAt(it, p) * (it.kind === 'ahead' ? cut : 1);
    let total = 0;
    for (const it of PU.ITEMS) total += wOf(it);
    let r = (drawRng ? drawRng() : Math.random()) * total;
    for (const it of PU.ITEMS) {
      r -= wOf(it);
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
      immune: 0, lastHitT: -1e9,             // the grace clock — see vulnerable()
      yawKick: 0,                            // radians of hull still owed by a slam or a wave
      fireQueued: false,                     // a trigger pulled during the spin, waiting on the lock
      seed: (seedTick = (seedTick + 2.399963) % 6.283),
      baseMass: b.mass || 1,
      stamp: -1e9,                           // when this client last changed the slot on authority

      aiHold: 0, aiPatience: null, aiCheck: 0, aiFireT: -1e9, seekX: 0, seekZ: 0, seekT: 0,
    });
  }

  function give(b, item, instant) {
    const s = st(b);
    if (s.held) return false;
    s.held = item;
    s.roll = instant ? 0 : K.ROLL_T;
    s.fireQueued = false;                  // a new item never inherits the last one's trigger
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
  const hitLog = [];                    // the last 120 landings, for the harness and a bug report
  function land(victim, from, label, kick, dilScale, dilMs) {
    if (!victim) return;
    st(victim).lastHitT = RR.Engine.time();      // arms the grace: nothing else may land for 2.5 s
    hitLog.push({ t: rd(RR.Engine.time()), v: nameOf(victim), from: from ? nameOf(from) : '', label });
    if (hitLog.length > 120) hitLog.shift();
    chip(victim, 'bad', from && from !== victim ? label + ' — ' + nameOf(from) : label, 1900);
    // THE THROWER LEARNS IT LANDED, once, here — which is why no item counts its own hits any
    // more. A slick or a dye that just won the race was invisible from the firing end unless you
    // looked astern (powerups-12). Offline only by construction: online land() runs on the
    // VICTIM'S client, so credit would have to ride the wire the way the torpedo's does.
    if (from && from.isPlayer && victim !== from) {
      chip(from, 'item', label.split(' — ')[0] + ' — GOT ' + nameOf(victim), 1600);
      if (RR.Camera && RR.Camera.kick) RR.Camera.kick(0.15);
    }
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
  function consumeShield(b, from, label) {
    const s = st(b);
    if (s.shield <= 0) return false;
    s.shield = 0;
    b.shielded = false;                  // physics.js reads this: the absorb is spent
    b.shieldHit = 0;
    s.stamp = RR.Engine.time();
    popRing(b.pos.x, b.pos.y + 0.8, b.pos.z, 13, 0x7ec8e3);
    popWall(b.pos.x, b.pos.z, 14, 0x9fe8ff);
    if (RR.FX && RR.FX.detonation) RR.FX.detonation(b.pos.x, b.pos.y + 0.5, b.pos.z, 0.9);
    // Online a block is news twice over: the room needs the burst where it happened, and the boat
    // that ran into it needs the shove — which only ITS client is allowed to apply.
    if (net() && b === S.player) {
      send({ t: 'pht', k: 'sh', f: netIdOf(from), v: myId(), x: rd(b.pos.x), z: rd(b.pos.z) });
    }
    if (from && from !== b && !from.finished && mine(from)) bounceOff(from, b.pos.x, b.pos.z, b);
    // a block that does not say WHAT was blocked, and by whom, teaches nothing about who is behind
    if (from && from.isPlayer && from !== b) chip(from, 'item', 'SHIELD BLOCKED IT — ' + nameOf(b), 1500);
    if (b.isPlayer) {
      chip(b, 'item', label ? 'SHIELD BLOCKED ' + label + (from && from !== b ? ' — ' + nameOf(from) : '')
        : 'SHIELD BLOCKED IT', 1500);
      if (RR.Audio && RR.Audio.thud) RR.Audio.thud(0.7);
      if (RR.Camera && RR.Camera.kick) RR.Camera.kick(0.5);
      if (RR.Feel && RR.Feel.dilate) RR.Feel.dilate(0.7, 200);
    }
    return true;
  }

  // Who is up the road, by ARC LENGTH — the one measure of "ahead" that survives a 14 Hz feed.
  // Remote boats count: online they are the entire field.
  function ahead(b, range) {
    const out = [];
    const mineD = b.routeD || 0;
    for (const o of S.boats) {
      if (o === b || o.finished) continue;
      const gapM = (o.routeD || 0) - mineD;
      if (gapM > 2 && gapM < range) out.push({ o, gapM });
    }
    out.sort((a, c) => a.gapM - c.gapM);
    return out;
  }

  let lastFireT = -1e9;

  // Pulling the trigger. Everything the shot needs is decided ONCE, here, by the boat that fired —
  // origin, heading, targets, the torpedo's launch point on the route — and then replayed
  // identically everywhere by launch(). The origin travels with it because a remote hull is
  // interpolated and lags: draw the muzzle at the firer's own reported water or one shot becomes
  // two. Offline the message is built and consumed on the spot, so the same path is exercised.
  function fire(b) {
    const s = st(b);
    const it = s.held;
    if (!it) return false;
    // A press during the 0.85 s spin used to be thrown away, and the crate flash is the most
    // natural moment to press (measured T10: puFire() at rolling 0.65 returned false and the item
    // was still held a second later). Queue it; applyEffects pulls the trigger on the lock frame.
    if (s.roll > 0) { if (b.isPlayer) s.fireQueued = true; return false; }
    s.fireQueued = false;
    s.held = null;
    s.stamp = RR.Engine.time();

    const m = { t: 'pfr', w: netIdOf(b), i: it.id, n: ++fireSeq,
      x: rd(b.pos.x), z: rd(b.pos.z), h: rd3(b.heading) };
    let victims = null;
    if (it.id === 'gulls') {
      victims = ahead(b, K.GULL_RANGE).slice(0, K.GULL_MAX).map((e) => e.o);
    } else if (it.id === 'torpedo') {
      const list = ahead(b, K.TORP_RANGE);
      victims = list.length ? [list[0].o] : [];      // whoever is next up the road; see reTarget
      const route = S.route;
      if (route) {
        const d0 = b.routeD || 0;            // ABSOLUTE arc length: a clamp here killed lap 2
        U().pathAt(route, lapD(route, d0), TPT);
        m.d = rd(d0);
        m.o = rd((b.pos.x - TPT.x) * TPT.tz - (b.pos.z - TPT.z) * TPT.tx);
      }
    }
    if (victims && net()) m.g = victims.map(netIdOf).filter(Boolean);
    if (net()) send(m);
    launch(b, it, m, victims);
    if (b.isPlayer) lastFireT = RR.Engine.time();
    if (useHook) useHook(b, it);
    return true;
  }

  // The shot itself, run by EVERY client for EVERY boat. Visuals are unconditional; anything that
  // moves a hull is gated on mine() — offline that is the whole field, online it is only ever this
  // client's own boat. `victims` is the firer's own resolved list; a receiver passes null and the
  // ids on the wire are resolved instead.
  function launch(b, it, m, victims) {
    const s = st(b);
    const own = mine(b);
    const ox = m.x != null ? m.x : b.pos.x, oz = m.z != null ? m.z : b.pos.z;
    const hd = m.h != null ? m.h : b.heading;
    const fx = Math.sin(hd), fz = Math.cos(hd);

    if (it.id === 'turbo') {
      // A LIGHT-OFF, not a nudge. The instant kick is more than twice what it was, and behind it
      // sits three seconds of sustained thrust that holds the hull at 55% over her rated top end —
      // physics.js's 6 m/s² blow-off pulls against it the whole time, which is what makes the run
      // feel like something straining rather than a number being set.
      s.turbo = K.TURBO_T;
      b.turboFlame = 1;                            // the burn is a visual: every client lights it
      if (own) {
        b.boostEnergy = 1;
        b.boostFull = 1.35;
        b.boostKickT = 1.5;
        const sp = Math.hypot(b.vel.x, b.vel.z), cap = (b.spec.top || 40) * K.TURBO_TOP;
        if (sp < cap) {
          const add = Math.min(K.TURBO_KICK, cap - sp);
          b.vel.x += fx * add; b.vel.z += fz * add;
        }
      }
      popRing(ox, 0.4, oz, 15, 0x25ff7a);
      popWall(ox, oz, 13, 0x8dffc0);
      if (RR.FX) {
        const ex = ox - fx * b.radius * 1.5, ez = oz - fz * b.radius * 1.5;
        if (RR.FX.burn) RR.FX.burn(ex, b.pos.y + 0.6, ez, -fx * 26, 2.5, -fz * 26, 46, 9);
        if (RR.FX.spray) {
          RR.FX.spray(ex, b.pos.y + 0.3, ez, -b.vel.x * 0.35, 6.0, -b.vel.z * 0.35, 40, 9.0, 2.4);
          for (let i = 0; i < 2; i++) {
            const side = i ? 1 : -1;
            RR.FX.spray(ox + fz * side * b.radius, b.pos.y + 0.3, oz - fx * side * b.radius,
              fz * side * 13, 4.5, -fx * side * 13, 14, 5.0, 1.8);
          }
        }
      }
      chip(b, 'item', 'TURBO', 1400);
      recoil(b, 0.75, 0.55, 240);
      if (b.isPlayer && RR.Audio && RR.Audio.boostGate) RR.Audio.boostGate();

    } else if (it.id === 'fender') {
      s.shield = K.SHIELD_T;
      // physics.js (SHIELD_AWARE) reads this flag and absorbs one hard contact outright — no
      // scrub, no lost wheel — and reports it back as boat.shieldHit. See applyEffects.
      if (own) b.shielded = true;
      popRing(ox, b.pos.y + 0.6, oz, 12, 0x7ec8e3);
      popWall(ox, oz, 11, 0x9fe8ff);
      if (RR.FX && RR.FX.spray) RR.FX.spray(ox, b.pos.y + 0.5, oz, 0, 5.0, 0, 30, 6.5, 1.6);
      chip(b, 'item', 'SHIELD UP', 1600);
      recoil(b, 0.3, 0.85, 200);
      if (b.isPlayer && RR.Audio && RR.Audio.checkpoint) RR.Audio.checkpoint();

    } else if (it.id === 'deepdish') {
      s.heavy = K.HEAVY_T;
      s.slamCd = 0;
      if (own) b.mass = s.baseMass * K.HEAVY_MASS;   // mass is physics; the ring is not
      popRing(ox, 0.4, oz, 16, 0xffb03a);
      popWall(ox, oz, 15, 0xffa03a);
      if (RR.FX && RR.FX.detonation) RR.FX.detonation(ox, 0.3, oz, 1.1);
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
        const dx = ox - fx * back + lx * off, dz = oz - fz * back + lz * off;
        if (slicks.length >= MAX_SLICK) slicks.shift();
        // oid/seq/k name this patch on every screen, exactly the way the torpedo is named: online
        // the victim tells the room which slick it just spent, or one slick spins the whole field
        // in turn (powerups-15).
        slicks.push({ x: dx, z: dz, r: K.SLICK_R, t: K.SLICK_T, arm: K.DROP_ARM, owner: b,
          oid: m.w || null, seq: m.n | 0, k: i });
        if (RR.FX && RR.FX.spray) RR.FX.spray(dx, 0.4, dz, lx * off * 0.4, 2.4, lz * off * 0.4, 16, 4.0, 1.6, 2);
      }
      popRing(ox - fx * 6, 0.35, oz - fz * 6, 16, 0x7a5aa8);
      chip(b, 'item', 'OIL SLICK ASTERN', 1400);
      recoil(b, 0.22, 0, 0);
      if (b.isPlayer && RR.Audio && RR.Audio.splash) RR.Audio.splash(0.4);

    } else if (it.id === 'dye') {
      const dx = ox - fx * (b.radius + 4.5), dz = oz - fz * (b.radius + 4.5);
      if (dyes.length >= MAX_DYE) dyes.shift();
      dyes.push({ x: dx, z: dz, r: K.DYE_R0, t: K.DYE_T, life: K.DYE_T, arm: K.DROP_ARM, owner: b,
        oid: m.w || null, seq: m.n | 0, k: 0 });
      if (RR.FX && RR.FX.dyeBurst) {
        RR.FX.dyeBurst(dx, 0.8, dz, 70);
        RR.FX.dyeBurst(dx, 3.2, dz, 50);
      }
      popRing(dx, 0.35, dz, 18, 0x2ecc71);
      chip(b, 'item', 'GREEN DYE ASTERN', 1500);
      recoil(b, 0.3, 0, 0);
      if (b.isPlayer && RR.Audio && RR.Audio.splash) RR.Audio.splash(0.8);

    } else if (it.id === 'bowwave') {
      // The blast is measured from the firer's reported water on every client; who it MOVES is
      // decided one hull at a time, by the client that owns that hull.
      let hits = 0;
      for (const o of S.boats) {
        if (o === b || o.finished) continue;
        const dx = o.pos.x - ox, dz = o.pos.z - oz;
        const d2 = dx * dx + dz * dz;
        if (d2 > K.WAVE_R * K.WAVE_R || d2 < 1e-4) continue;
        if (!mine(o)) continue;
        if (!vulnerable(o)) continue;          // a boat already spinning is not hit twice
        if (consumeShield(o, b, 'SHOCKWAVE')) continue;
        const d = Math.sqrt(d2), k = 1 - d / K.WAVE_R;
        o.vel.x += (dx / d) * K.WAVE_PUSH * k;
        o.vel.z += (dz / d) * K.WAVE_PUSH * k;
        st(o).yawKick = (dx * fz - dz * fx > 0 ? 1 : -1) * K.WAVE_YAW * k;   // hull, not angVel
        o.bumpRecover = Math.max(o.bumpRecover || 0, 0.5 + k * 0.7);
        if (RR.FX && RR.FX.spray) RR.FX.spray(o.pos.x, o.pos.y + 0.4, o.pos.z,
          (dx / d) * 9, 5.0, (dz / d) * 9, 18, 5.5, 1.8);
        land(o, b, 'SHOCKWAVE', 1.2 * k, 0.7, 220);
        hits++;
      }
      if (own) { b.vel.x += fx * K.WAVE_SELF; b.vel.z += fz * K.WAVE_SELF; }
      popRing(ox, 0.35, oz, K.WAVE_R, 0x9fe8ff);
      popWall(ox, oz, K.WAVE_R, 0x9fe8ff);
      if (RR.FX) {
        if (RR.FX.detonation) RR.FX.detonation(ox, 0.4, oz, 1.0);
        if (RR.FX.spray) {
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * 6.283;
            RR.FX.spray(ox + Math.sin(a) * 4, 0.5, oz + Math.cos(a) * 4,
              Math.sin(a) * 22, 4.0, Math.cos(a) * 22, 8, 5.0, 2.0);
          }
        }
      }
      // the count is gone: land() credits the thrower once per victim, by name (powerups-12), and
      // online the firer cannot count its own hits anyway — every victim is somebody else's sum
      chip(b, 'item', 'SHOCKWAVE', 1400);
      recoil(b, 0.85, 0.5, 280);
      if (b.isPlayer && RR.Audio && RR.Audio.splash) RR.Audio.splash(1.0);

    } else if (it.id === 'gulls') {
      // The flock is aimed by ROUTE DISTANCE and the list travels with the shot, so every client
      // puts the birds on the same four boats. Only each victim's own client pays for them.
      const list = victims || (m.g || []).map(boatById);
      let hits = 0;
      for (const o of list) {
        if (!o || o.finished) continue;
        if (mine(o) && !vulnerable(o)) continue;
        if (mine(o) && consumeShield(o, b, 'GULL SWARM')) continue;
        const so = st(o);
        so.gulls = K.GULL_T;
        if (mine(o)) so.stamp = RR.Engine.time();
        hits++;
        // the flock ARRIVES: a burst of white over the wheelhouse on the frame it lands, so a
        // rival two hundred metres up the road visibly disappears into birds
        if (RR.FX && RR.FX.spray) RR.FX.spray(o.pos.x, o.pos.y + 3.4, o.pos.z, 0, 1.5, 0, 20, 7.0, 1.2, 3);
        popRing(o.pos.x, o.pos.y + 0.5, o.pos.z, 8, 0xf2f6f8);
        land(o, b, 'GULLS ON YOU', 0.7, 0.8, 220);
      }
      if (RR.Audio && RR.Audio.seagull) RR.Audio.seagull();
      chip(b, 'item', hits ? 'GULL SWARM' : 'GULL SWARM — NOBODY AHEAD', 1600);
      recoil(b, 0.15, 0, 0);

    } else if (it.id === 'torpedo') {
      // Fired UP THE ROUTE, not across open water: it advances in arc length and only slides
      // sideways to match its target, so it follows every bend of the river, never leaves the
      // channel, and cannot clip a wall. It is also the one item that reaches the leader from last
      // place, which is exactly the job the draw table gives it — and the one item a 14 Hz feed
      // costs nothing, because arc length is the number that is still true when the message lands.
      const target = victims ? (victims[0] || null) : (m.g && m.g.length ? boatById(m.g[0]) : null);
      const route = S.route;
      if (route) {
        const d0 = m.d != null ? m.d : (b.routeD || 0);   // absolute, so it flies on lap 2
        let off = m.o;
        if (off == null) {
          U().pathAt(route, lapD(route, d0), TPT);
          off = (ox - TPT.x) * TPT.tz - (oz - TPT.z) * TPT.tx;
        }
        if (torps.length >= MAX_TORP) torps.shift();
        torps.push({ d: d0 + b.radius + 2, off, x: ox, z: oz,
          hx: fx, hz: fz, life: K.TORP_LIFE, arm: K.TORP_ARM, acc: 0, reT: 0, owner: b, target,
          // every client runs the same projectile; this pair names it, so the hit the victim
          // declares takes the right one out of the water everywhere
          oid: m.w || null, seq: m.n | 0,
          // the warning latch lives on the PROJECTILE, never on the victim: one that expires
          // harmlessly must not leave a boat permanently un-warnable about the next one
          warned: !!(target && target.isPlayer) });
      }
      popRing(ox + fx * 5, 0.4, oz + fz * 5, 12, 0xff5a3a);
      if (RR.FX) {
        if (RR.FX.burn) RR.FX.burn(ox + fx * 5, b.pos.y + 0.5, oz + fz * 5, fx * 20, 2, fz * 20, 26, 7);
        if (RR.FX.spray) RR.FX.spray(ox + fx * 5, 0.4, oz + fz * 5, fx * 16, 4.5, fz * 16, 26, 6.0, 2.0);
      }
      if (target && target.isPlayer) chip(target, 'bad', 'TORPEDO INCOMING — ' + nameOf(b), 2200);
      chip(b, 'item', target ? 'TORPEDO AWAY — ' + nameOf(target) : 'TORPEDO — NOBODY AHEAD', 1700);
      recoil(b, 0.55, 0.6, 260);
      if (b.isPlayer && RR.Audio && RR.Audio.airhorn) RR.Audio.airhorn();
    }
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
    const online = net();
    for (let i = 0; i < crates.length; i++) {
      const c = crates[i];
      if (c.claimT > 0) c.claimT -= dt;
      if (c.taken) {
        c.t -= dt;
        if (c.t <= 0) { c.taken = false; c.t = 0; c.claimT = 0; }
        continue;
      }
      for (const b of S.boats) {
        if (b.finished || b.remote) continue;
        const s = st(b);
        if (s.held) continue;                          // a full slot never eats a crate
        let dd = (b.routeD || 0) - c.d;                // cheap arc-length reject first
        if (route.loop) dd = ((dd % route.len) + route.len * 1.5) % route.len - route.len * 0.5;
        if (dd < -70 || dd > 70) continue;
        const reach = b.radius + K.CRATE_R + (b.isPlayer ? K.PLAYER_REACH : K.AI_REACH);
        if (U().dist2(b.pos.x, b.pos.z, c.x, c.z) > reach * reach) continue;
        if (online) {
          // Online a client never decides it got the crate and never rolls the item: it CLAIMS,
          // and the host answers with a grant naming both. The retry window covers a lost claim
          // and the two frames it takes the next-lowest id to inherit a host that just left.
          if (c.claimT > 0) break;
          c.claimT = CLAIM_RETRY;
          if (isHost()) resolveClaim(myId(), i);
          else send({ t: 'pcl', c: i });
          break;
        }
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

  // Every running effect, ticked for EVERY boat so the auras and the burn read the same on every
  // screen — but with each write that moves a hull gated on own. Offline own is true throughout and
  // this is byte-for-byte the old behaviour; online a remote hull is driven only by applyRemote,
  // and a shove written here would be a fight with the interpolator, not a power-up.
  function applyEffects(dt, t) {
    for (const b of S.boats) {
      const s = b._pu;
      if (!s) continue;
      const own = mine(b);
      // Every timer keeps running after the PLAYER crosses the line — rivals are still racing for
      // 2nd to 6th and the results card ranks them — but nothing MOVES a hull that has finished:
      // main.js holds her at throttle 0.25 for the finale skyline shot, and a TURBO run under that
      // camera is not a shot. own says whose hull it is; drive says whether it may be pushed.
      const drive = own && !b.finished;
      if (s.roll > 0) {
        s.roll = Math.max(0, s.roll - dt);
        // the trigger pulled during the spin, fired on the frame the slot locks (powerups-07)
        if (s.roll <= 0 && s.fireQueued && b.isPlayer && !b.finished && S.phase === 'racing') fire(b);
      }
      if (s.slamCd > 0) s.slamCd -= dt;
      if (s.immune > 0) s.immune -= dt;
      // A yaw KICK: radians written straight onto the heading, paid out over ~0.25 s, with no drag
      // and nothing for physics' angVel unwind to scrub. This is what makes a SHOCKWAVE or a DEEP
      // DISH slam read as the hull coming round instead of a shove (powerups-09).
      if (s.yawKick) {
        const step = s.yawKick * (1 - Math.exp(-K.YAW_RATE * dt));
        s.yawKick -= step;
        if (drive) b.heading = U().wrapAngle(b.heading + step);
        if (Math.abs(s.yawKick) < 1e-3) s.yawKick = 0;
      }
      if (s.turbo > 0) {
        s.turbo -= dt;
        // The sustained half of the item. Hold the burn hot so effects.js keeps the flame lit and
        // the rooster tail running, and push towards the raised ceiling every frame — physics.js
        // is bleeding her back down at 6 m/s² the whole time, so this is a fight, not an assignment.
        if (drive) b.boostHeat = Math.max(b.boostHeat || 0, 0.95);
        b.turboFlame = 1;
        const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
        const cap = (b.spec.top || 40) * K.TURBO_TOP;
        const sp = Math.hypot(b.vel.x, b.vel.z);
        if (drive && sp < cap) {
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
          if (o === b || o.finished || !mine(o) || b.finished) continue;
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
        if (own) b.shielded = s.shield > 0;
        // It eats one real impact as well as one item — that is what makes it worth holding — but
        // only a HARD one. It used to go on any bounce above severity 0.12 AFTER the bounce had
        // already taken the speed: measured T2, a 15 m/s bank graze spent the bubble and the hull
        // still fell 15.5 -> 6.1 m/s. P1's physics now absorbs the contact itself above severity
        // 0.45 and reports boat.shieldHit; the fallback reads the same threshold off bumpRecover,
        // which physics writes as 0.18 + 0.40*sev, so > 0.36 is exactly sev > 0.45.
        if (own && RR.Physics && RR.Physics.SHIELD_AWARE) {
          if ((b.shieldHit || 0) > 0) { b.shieldHit = 0; consumeShield(b, null, 'A HARD CRASH'); }
        } else if (own && (b.bumpRecover || 0) > 0.36 && (b.crashTimer || 0) > 0.2) {
          b.bumpRecover = 0; consumeShield(b, null, 'A HARD CRASH');
        }
      } else if (b.shielded) b.shielded = false;
      if (s.heavy > 0) {
        s.heavy -= dt;
        if (s.heavy <= 0) { if (own) b.mass = s.baseMass; }
        else {
          // the trade, honoured without touching physics.js: heavy runs 7% short of her top end
          const cap = (b.spec.top || 40) * K.HEAVY_TOP;
          const sp = Math.hypot(b.vel.x, b.vel.z);
          if (drive && sp > cap) {
            const k = Math.max(cap / sp, 1 - (6.0 * dt) / sp);
            b.vel.x *= k; b.vel.z *= k;
          }
          if (!b.finished) bulldoze(b, dt);   // every client; only owned VICTIMS are actually moved
        }
      }
      if (s.spin > 0) {
        s.spin -= dt;
        if (drive) {
          b.angVel = s.spinDir * K.SPIN_W;
          const k = Math.exp(-K.SPIN_DRAG * dt);
          b.vel.x *= k; b.vel.z *= k;
        }
        // a hull going round backwards throws water off the whole of one side
        if (RR.FX && RR.FX.spray && Math.random() < dt * 26) {
          const a = Math.random() * 6.283;
          RR.FX.spray(b.pos.x + Math.sin(a) * b.radius, b.pos.y + 0.3, b.pos.z + Math.cos(a) * b.radius,
            Math.sin(a) * 7, 3.0, Math.cos(a) * 7, 4, 3.6, 1.4);
        }
      }
      if (s.blind > 0) {
        s.blind -= dt;
        if (drive) {
          const k = Math.exp(-K.DYE_DRAG * dt);     // forty pounds of powder is thick water
          b.vel.x *= k; b.vel.z *= k;
        }
      }
      if (s.gulls > 0) {
        s.gulls -= dt;
        // Birds are not scenery: they cost you the top of the rev range, whoever you are.
        const cap = (b.spec.top || 40) * K.GULL_TOP;
        const sp = Math.hypot(b.vel.x, b.vel.z);
        if (drive && sp > cap) {
          const k = Math.max(cap / sp, 1 - (9.0 * dt) / sp);
          b.vel.x *= k; b.vel.z *= k;
        }
      }
      // A rival who cannot see WEAVES. The player keeps the wheel — the windscreen is punishment
      // enough — but gulls fighting for the helm is the whole reason the item is worth drawing, so
      // the player gets a real shove on the heading too, small enough to catch and correct.
      const w = (s.blind > 0 ? 0.95 : 0) + (s.gulls > 0 ? 0.85 : 0);
      if (drive && w > 0) {
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
  // the item has to read as "I went through them". Two layers: a one-shot SLAM the first time each
  // victim is caught — the full 21 m/s throw, because the moment of contact is the event — and a
  // gentler shove while they are still under the ring, which cannot land again for SLAM_CD.
  //
  // The reach is FIXED. radius*9 read 8.8 m on a jet ski, 15.1 on a speedboat and 34 on the tour
  // boat, so the ring the item draws was a different weapon in every hull and nobody could learn
  // it. radius + 8 keeps the measured 8.8 m floor (jet ski 9.0, speedboat 9.7, F1 9.5).
  //
  // And the throw goes ACROSS the heavy boat's heading, not radially away from her: pushing a boat
  // you caught from ASTERN — the item's whole point, "smash boats aside" — threw her DOWN THE ROAD
  // at 48.3 m/s against a 41 m/s top (measured T4/x-02). Aside is where they go, with a quarter of
  // a forward component so it still reads as a hit, and nothing that adds to their top end.
  function crushR(b) { return (b.radius || 3) + K.SLAM_REACH; }
  function bulldoze(b, dt) {
    const rr = crushR(b);
    const heavyOwned = mine(b);
    const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
    const lx = fz, lz = -fx;                 // the heavy boat's beam
    for (const o of S.boats) {
      if (o === b || o.finished) continue;
      const dx = o.pos.x - b.pos.x, dz = o.pos.z - b.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > rr * rr || d2 < 1e-4) continue;
      const so = st(o);
      const own = mine(o);                   // the hull being run over decides that it was
      if (!vulnerable(o)) { if (heavyOwned) b.bumpRecover = 0; continue; }
      const sgn = (dx * lx + dz * lz) >= 0 ? 1 : -1;      // which beam they are on
      const px = lx * sgn + fx * 0.25, pz = lz * sgn + fz * 0.25;
      const pl = Math.hypot(px, pz) || 1;
      if (so.slamCd > 0) {
        // still under the ring, but already slammed: they get moved aside, not juggled
        if (own) { o.vel.x += (px / pl) * K.SLAM_HOLD * dt; o.vel.z += (pz / pl) * K.SLAM_HOLD * dt; }
        if (heavyOwned) b.bumpRecover = 0;
        continue;
      }
      if (own && consumeShield(o, b, 'DEEP DISH')) { so.slamCd = K.SLAM_CD; so.immune = K.IMMUNE_T; continue; }
      if (own) {
        o.vel.x += (px / pl) * K.SLAM_PUSH; o.vel.z += (pz / pl) * K.SLAM_PUSH;
        // never a boost: whatever the slam adds along the VICTIM'S own heading is capped at her top
        const ofx = Math.sin(o.heading), ofz = Math.cos(o.heading);
        const vf = o.vel.x * ofx + o.vel.z * ofz, otop = o.spec ? (o.spec.top || 40) : 40;
        if (vf > otop) { o.vel.x -= ofx * (vf - otop); o.vel.z -= ofz * (vf - otop); }
        so.yawKick = sgn * K.SLAM_YAW;       // hull, not angVel: physics scrubs angVel to nothing
        o.bumpRecover = Math.max(o.bumpRecover || 0, 1.1);
      }
      so.slamCd = K.SLAM_CD;                 // the beat is spent on every screen, hit or witness
      so.immune = K.IMMUNE_T;                // and they are not run over again while they recover
      if (heavyOwned) b.bumpRecover = 0;     // the heavy one is not rattled by the light one
      popRing(o.pos.x, o.pos.y + 0.5, o.pos.z, 12, 0xffb03a);
      if (RR.FX && RR.FX.detonation) RR.FX.detonation(o.pos.x, o.pos.y + 0.3, o.pos.z, 0.85);
      land(o, b, 'RUN OVER BY DEEP DISH', 1.5, 0.66, 220);
      if (b.isPlayer) {
        if (RR.Camera && RR.Camera.kick) RR.Camera.kick(0.45);
        if (RR.Audio && RR.Audio.thud) RR.Audio.thud(0.9);
      }
    }
  }

  // A drop is spent on the boat that found it — and online that has to be true on every screen or
  // one slick spins the whole room in turn. Same shape as the torpedo's claim: the victim declares.
  function sendSpent(kind, p) {
    if (!net() || !p.oid) return;
    send({ t: 'pht', k: kind, f: p.oid, n: p.seq | 0, i: p.k | 0 });
  }

  function updateHazards(dt) {
    for (let i = slicks.length - 1; i >= 0; i--) {
      const p = slicks[i];
      p.t -= dt; p.arm -= dt;
      if (p.t <= 0) { slicks.splice(i, 1); continue; }
      for (const b of S.boats) {
        if (b.finished || !mine(b)) continue;    // your oil, but MY spin-out to declare
        if (b === p.owner && p.arm > 0) continue;
        const s = st(b);
        if (!vulnerable(b)) continue;
        const rr = p.r + b.radius * 0.6;
        if (U().dist2(b.pos.x, b.pos.z, p.x, p.z) > rr * rr) continue;
        if (consumeShield(b, p.owner, 'OIL SLICK')) { p.t = 0; sendSpent('sl', p); break; }
        s.spin = K.SPIN_T;
        s.spinDir = (b.visRoll || 0) >= 0 ? 1 : -1;
        s.stamp = RR.Engine.time();
        p.t = Math.min(p.t, 0.35);           // a slick is spent on the boat that found it
        sendSpent('sl', p);                  // …on every screen, not just this one (powerups-15)
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
        if (b.finished || !mine(b)) continue;
        if (b === p.owner && p.arm > 0) continue;
        if (U().dist2(b.pos.x, b.pos.z, p.x, p.z) > p.r * p.r) continue;
        const s = st(b);
        // A block used to be worth exactly one frame: the shield went, the cloud stayed, and the
        // next frame blinded you anyway (measured U5). Do what the slick does — the 13 m burst ring
        // already reads as the cloud being blown apart.
        if (s.shield > 0) { consumeShield(b, p.owner, 'GREEN DYE'); p.t = 0; sendSpent('dy', p); break; }
        if (!vulnerable(b)) continue;
        land(b, p.owner, 'BLINDED BY GREEN DYE', 0.45, 0.8, 200);
        s.blind = K.BLIND_T;
        s.stamp = RR.Engine.time();
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
      // absolute arc length, so on a loop it expires at the FLAG (laps*len), not at the seam
      if (p.d >= courseEnd(route) - 4) { detonate(p, null); torps.splice(i, 1); continue; }

      // Re-acquire four times a second: it chases whoever is NEXT up the road, so a rival who
      // shields it or slides out of the way does not save the boat in front of them.
      p.reT -= dt;
      if (p.reT <= 0) {
        p.reT = 0.25;
        let best = 1e9, pick = null;
        for (const b of S.boats) {
          if (b === p.owner || b.finished) continue;
          if (!vulnerable(b)) continue;      // it passes a boat that is already spun and CLIMBS
          const gapM = (b.routeD || 0) - p.d;
          if (gapM > 1 && gapM < best) { best = gapM; pick = b; }
        }
        if (pick) p.target = pick;
      }
      // aim: slide across to wherever the target is sitting in the channel
      const tgt = p.target;
      if (tgt && !tgt.finished) {
        U().pathAt(route, lapD(route, tgt.routeD || 0), TPT);
        const toff = (tgt.pos.x - TPT.x) * TPT.tz - (tgt.pos.z - TPT.z) * TPT.tx;
        p.off = U().damp(p.off, toff, K.TORP_TRACK, dt);
      }
      U().pathAt(route, lapD(route, p.d), PPT);
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

      // THE HIT IS THE VICTIM'S CALL. Everybody flies the same fish — same arc length, same speed —
      // but only the client that owns a hull is allowed to say the fish found it, and it then tells
      // the room so the projectile leaves the water everywhere at once.
      let hit = null;
      for (const b of S.boats) {
        if (b.finished || !mine(b)) continue;
        if (b === p.owner && p.arm > 0) continue;
        if (!vulnerable(b)) continue;        // through a spun boat, still hunting the next one up
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
      if (hit) {
        // whether the shield ate it is decided here too, and travels with the claim — otherwise the
        // shooter's screen would say HIT while the victim's said BLOCKED
        const blocked = st(hit).shield > 0;
        if (net()) send({ t: 'pht', k: 'tp', f: p.oid, n: p.seq, v: netIdOf(hit), b: blocked ? 1 : 0 });
        detonate(p, hit, blocked);
        torps.splice(i, 1);
      }
    }
  }

  function detonate(p, victim, blocked) {
    popRing(p.x, 0.4, p.z, 26, 0xff5a3a);
    popRing(p.x, 0.4, p.z, 16, 0xffd0a0);
    popWall(p.x, p.z, 24, 0xcfe8ff);
    if (RR.FX) {
      if (RR.FX.detonation) RR.FX.detonation(p.x, 0.4, p.z, victim ? 1.7 : 1.0);
      if (RR.FX.burn) RR.FX.burn(p.x, 1.2, p.z, 0, 9, 0, victim ? 40 : 18, 12);
    }
    if (!victim) return;
    // credit is owed on every screen, including the shooter's — who learns it from the victim
    // online the victim's own client runs land() and the credit with it; here the shooter is being
    // told by the wire, and this chip is the only credit that reaches their screen
    if (!blocked && p.owner && p.owner.isPlayer && !mine(victim)) {
      chip(p.owner, 'item', 'TORPEDO HIT — ' + nameOf(victim), 1800);
      if (RR.Camera && RR.Camera.kick) RR.Camera.kick(0.3);
    }
    if (!mine(victim)) return;               // somebody else's hull: their client moves it, not ours
    if (consumeShield(victim, p.owner, 'TORPEDO')) return;
    const s = st(victim);
    s.spin = K.SPIN_T * 1.3;
    s.spinDir = (victim.visRoll || 0) >= 0 ? 1 : -1;
    s.stamp = RR.Engine.time();
    victim.vel.x *= K.TORP_SLOW; victim.vel.z *= K.TORP_SLOW;
    victim.vel.x += p.hx * 9; victim.vel.z += p.hz * 9;      // and a shove down the road with it
    victim.angVel += s.spinDir * 4.0;
    victim.bumpRecover = Math.max(victim.bumpRecover || 0, 1.6);
    land(victim, p.owner, 'TORPEDO HIT', 1.6, 0.5, 340);
    if (victim.isPlayer && RR.Audio && RR.Audio.thud) RR.Audio.thud(1.0);
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
    const w = tierW();                     // ai.js's own curve: 0 rookie · 0.55 skipper · 1 legend
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
    // PATIENCE IS A FLOOR, NOT THE LIMIT. Patience alone let the field fire 15-21 items a minute at
    // every tier (measured 12-race matrix), which decided the race before the driving did. One
    // rival may not fire again inside AI_FIRE_GAP of her own last shot: 12 s at ROOKIE, 3 s at
    // LEGEND, on the same w as her driving.
    const gap = U().lerp(K.AI_FIRE_GAP[0], K.AI_FIRE_GAP[1], w);
    if (RR.Engine.time() - (s.aiFireT || -1e9) < gap) return;
    if (s.aiPatience <= 0 || wants(b, s.held)) {
      if (aiVeto(b, s.held, w)) return;
      fire(b);
      s.aiFireT = RR.Engine.time();
      s.aiPatience = null;
      s.aiHold = U().lerp(2.2, 0.35, w);                  // no double-tapping the next crate
    }
  }
  // What a low tier will NOT do, whatever patience says: a ROOKIE does not put a torpedo into a
  // boat she is already alongside. ahead() targets whoever is next up the road, so this protects
  // the boat in front of her — usually the player — from a hit nobody could read coming.
  function aiVeto(b, it, w) {
    if (it.id !== 'torpedo' || w >= 0.35) return false;
    const list = ahead(b, K.TORP_RANGE);
    return !!(list.length && list[0].gapM < 40);
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
        // wrapped, not clamped: on lap 2 of the lake circuit a clamp measured the bend against the
        // FINISH-LINE tangent for the whole lap, so turbos landed in corners (powerups-x-03)
        U().pathAt(S.route, lapD(S.route, (b.routeD || 0) + 60), wpt);
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

  // A rival deviating for a crate the way a player does. main.js calls this between RR.AI.update
  // and RR.Physics.update; it is now the ONLY way the field goes and gets one, since K.AI_REACH is
  // down to a metre.
  PU.aiSteer = function (pilot, dt) {
    if (!pilot || !pilot.boat || !active()) return;
    const b = pilot.boat;
    const s = st(b);
    if (s.held || b.finished) { s.seekX = 0; s.seekZ = 0; return; }
    // Tight water, a hard bend and the grid are ai.js's own vetoes for blocking and shoving, and a
    // crate is not worth more than either: rivals darting between bridge piers for one bumped 16
    // times in 4 LEGEND races (rivals-12). Feature-detected — this works before and after ai.js
    // publishes the flags.
    if (pilot.tight || pilot.starting || (pilot.bend || 0) > 0.35) { s.seekX = 0; s.seekZ = 0; return; }
    s.seekT -= dt;
    if (s.seekT <= 0) {
      s.seekT = 0.25;
      s.seekX = 0; s.seekZ = 0;
      let best = 1e9;
      const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
      // never more than 0.6 of the channel off her line: in a 12 m gap 26 m of seek is a pier
      let latMax = 26;
      if (S.route) { U().pathAt(S.route, lapD(S.route, b.routeD || 0), SPT); latMax = Math.min(26, SPT.w * 0.6); }
      for (const c of crates) {
        if (c.taken) continue;
        const dx = c.x - b.pos.x, dz = c.z - b.pos.z;
        const along = dx * fx + dz * fz;
        if (along < 6 || along > 95) continue;
        const lat = Math.abs(dx * fz - dz * fx);
        if (lat > latMax) continue;
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
      SC.set(pulse, c.hy == null ? 1 : c.hy, pulse);      // clipped to the steel overhead, if any
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
  // Items are a RACE feature. The Architecture Tour is a ride and a time trial is a record against
  // a ghost that never had them, so those two run clean. Multiplayer used to be on that list
  // because nothing could agree on who got shoved; the host now can, so it races with items on.
  //
  // Which switch decides is the whole of rule 4: offline it is yours, online it is the HOST'S, and
  // it is frozen at the flag so nobody can change the rules of a race already running.
  function itemsOn() {
    if (net()) { try { return !!RR.Net.items(); } catch (e) { return true; } }
    return PU.enabled();
  }
  function active() {
    return !!(S && group && itemsOn() && crates.length && !S.tour && !S.timeTrial);
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
        s.immune = 0; s.yawKick = 0; s.fireQueued = false;
        b.turboFlame = 0; b.shielded = false; b.shieldHit = 0;
      }
    }
    if (overlay) overlay.visible = false;
  }

  PU.buildForRace = function (state) {
    PU.clear();
    // A ride and a record run never get crates at all, so they do not even pay to build them.
    // Multiplayer DOES: placement is seeded from the course alone, so every client in the room
    // lays out the identical rows without a single byte crossing the wire. Only availability is
    // negotiated — that is what the host is for.
    if (!state || state.tour || state.timeTrial || !RR.Engine.scene) return;
    S = state;
    netReset();
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
    hitLog.length = 0;
    netReset();
  };

  // race.js calls this once per frame with the live race state.
  PU.update = function (dt, state) {
    if (state) S = state;
    if (!S || !group) return;
    const on = active();
    group.visible = on;
    if (!on) { if (overlay) overlay.visible = false; return; }
    const t = RR.Engine.time();
    // The sim runs from the flag to the last boat home, not to the PLAYER's line: rivals fight for
    // 2nd to 6th for up to 12 s after she finishes and the results card ranks them. MEASURED (T11)
    // with this gated on 'racing': a torpedo's d froze at 626 for a whole second, a rival's heavy
    // timer sat at 8.0 and its flame stayed lit. Every write that MOVES a hull is gated on
    // !b.finished inside applyEffects; only the fire key needs a live race.
    if (S.phase !== 'countdown') {
      collect(dt);
      applyEffects(dt, t);
      updateHazards(dt);
      for (const b of S.boats) if (!b.isPlayer && !b.remote && !b.finished) aiBrain(b, dt);
      if (S.phase === 'racing') pollPlayerKey();
    }
    drawCrates(t);
    drawHazards(t);
    drawAuras(t);
    drawOverlay(t);
  };

  // E or SPACE fires it. Polled, not bound, so input.js never has to move for this.
  let keyWas = false;
  // main.js calls this on resume and on leaving photo mode. SPACE both confirms a menu row and
  // fires the held item, and the key is still down on the frame the race comes back — so the rising
  // edge below threw whatever you were holding every time you unpaused (powerups-08).
  PU.armKey = function () { keyWas = true; };
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
  // Live hazards near a point, for ai.js's avoidance: {x, z, r, kind} per slick and dye cloud whose
  // disc comes within r. Read-only and allocation-light — it is called from a pilot's update.
  PU.hazardsNear = function (x, z, r) {
    const out = [];
    if (!active()) return out;
    const rr = r || 0;
    for (const p of slicks) {
      const q = rr + p.r;
      if (U().dist2(x, z, p.x, p.z) <= q * q) out.push({ x: p.x, z: p.z, r: p.r, kind: 'slick' });
    }
    for (const p of dyes) {
      const q = rr + p.r;
      if (U().dist2(x, z, p.x, p.z) <= q * q) out.push({ x: p.x, z: p.z, r: p.r, kind: 'dye' });
    }
    return out;
  };
  // Every landing this race, in order: {t, v, from, label}. The harness measures the post-hit grace
  // off this, and a bug report can say who was hit twice.
  PU.hitLog = function () { return hitLog.slice(); };
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
      // A fish locked on a boat sitting BETWEEN it and you is not your problem yet: the plate ran
      // red for a torpedo that hit the boat behind (measured W4), and the HUD frames that plate as
      // the last moment a SHIELD is worth spending. The 4 Hz re-acquire flips it to you if it
      // misses.
      if (p.target && p.target !== me && (p.target.routeD || 0) < (me.routeD || 0)) continue;
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
  // ---------------------------------------------------------------------------------------------
  // The two ends of the position feed. A boat's own client is the only authority on what is running
  // on it, and net.js's 'pos' message is already that boat talking about itself — so the item state
  // rides there rather than in messages of its own. It also self-heals: a lost grant or a lost fire
  // is corrected within one 14 Hz tick instead of leaving a phantom item in a rival's slot forever.
  // ---------------------------------------------------------------------------------------------
  PU.netState = function (b) {
    const s = b && b._pu;
    if (!s || !active()) return null;
    const u = {};
    let n = 0;
    if (s.shield > 0) { u.s = rd(s.shield); n++; }
    if (s.heavy > 0) { u.hv = rd(s.heavy); n++; }
    if (s.spin > 0) { u.sp = rd(s.spin); n++; }
    if (s.blind > 0) { u.bl = rd(s.blind); n++; }
    if (s.gulls > 0) { u.gl = rd(s.gulls); n++; }
    if (s.turbo > 0) { u.tb = rd(s.turbo); n++; }
    if (s.held) { u.hi = s.held.id; n++; }    // published through the spin: the roll is a HUD beat
    return n ? u : null;                       // nothing running — and an absent u IS the all-clear
  };

  PU.applyNetState = function (b, u) {
    if (!S || !group || !b) return;
    const s = st(b);
    // Anything this client changed on authority in the last breath outranks a packet that was
    // already in the air when it happened — otherwise a grant flickers off and back on again.
    const fresh = RR.Engine.time() - (s.stamp || -1e9) < HOLD_GRACE;
    // rising edges are free per-victim FX: no message says "the birds got him", the feed does
    if (u && u.gl > 0 && s.gulls <= 0) {
      if (RR.FX && RR.FX.spray) RR.FX.spray(b.pos.x, b.pos.y + 3.4, b.pos.z, 0, 1.5, 0, 20, 7.0, 1.2, 3);
      popRing(b.pos.x, b.pos.y + 0.5, b.pos.z, 8, 0xf2f6f8);
    }
    if (u && u.sp > 0 && s.spin <= 0) popRing(b.pos.x, 0.35, b.pos.z, 14, 0x7a5aa8);
    // While fresh, a report may only RAISE a timer. A fire message and a position packet cross in
    // the air constantly — 70 ms of feed is always describing a boat as it was before the shot —
    // and letting the older one win is how a SHIELD or a DEEP DISH blinks out on the frame it lit.
    s.shield = pick(s.shield, u && u.s > 0 ? u.s : 0, fresh);
    s.heavy = pick(s.heavy, u && u.hv > 0 ? u.hv : 0, fresh);
    s.spin = pick(s.spin, u && u.sp > 0 ? u.sp : 0, fresh);
    s.blind = pick(s.blind, u && u.bl > 0 ? u.bl : 0, fresh);
    s.gulls = pick(s.gulls, u && u.gl > 0 ? u.gl : 0, fresh);
    s.turbo = pick(s.turbo, u && u.tb > 0 ? u.tb : 0, fresh);
    b.turboFlame = s.turbo > 0 ? 1 : 0;
    if (!fresh) { s.held = u && u.hi ? PU.byId(u.hi) : null; s.roll = 0; }
  };
  function pick(cur, rep, fresh) { return fresh && cur > rep ? cur : rep; }

  // Everything the network side is doing, for the two-client harness and for a bug report from a
  // real race: who is host, what the room agreed, which crates are down, who holds what, and the
  // last eighty protocol lines in and out.
  PU.netDebug = function () {
    if (!S) return null;
    return {
      online: net(), self: myId(), host: net() ? RR.Net.hostId() : null, isHost: isHost(),
      items: itemsOn(), active: active(), phase: S.phase,
      crates: crates.length,
      taken: crates.reduce((n, c) => n + (c.taken ? 1 : 0), 0),
      held: S.boats.map((b) => ({ id: netIdOf(b), name: nameOf(b), self: b === S.player,
        item: b._pu && b._pu.held ? b._pu.held.id : null,
        shield: b._pu ? +(b._pu.shield || 0).toFixed(1) : 0,
        spin: b._pu ? +(b._pu.spin || 0).toFixed(1) : 0,
        gulls: b._pu ? +(b._pu.gulls || 0).toFixed(1) : 0,
        heavy: b._pu ? +(b._pu.heavy || 0).toFixed(1) : 0 })),
      torps: torps.map((p) => ({ oid: p.oid, seq: p.seq, d: Math.round(p.d) })),
      log: netLog.slice(),
    };
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

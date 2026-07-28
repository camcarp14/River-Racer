/* River Racer — THE SALUTE.

   Under the Inland Navigation Rules a vessel asks a Chicago bascule for passage with one
   prolonged blast and one short, and the bridge answers with the same signal before the leaves
   move. Chicago has thirty-seven movable bridges, more than any city on earth, and invented the
   fixed-trunnion double-leaf bascule. This module owns that exchange and the chain it pays.

   The whole loop in one paragraph: a bascule ahead opens an ask window at 170 m and shuts it at
   55 m. SPACE inside the window arms the tender. Cross the span line with the leaves past 0.62
   and that is a CLEAN SALUTE — chain +1, boost paid, a beat of time dilation, the music opens up.
   Arrive early or late and you pass under a closed span: no crash, no penalty, but the chain
   resets to zero, and that reset is the sting. The real crash is the one you choose — every jump
   ramp is moored on a bascule approach, and a ramp taken with the span shut puts a hull through
   the girder at 90 mph.

   STATE ONLY. This module never touches the DOM: the HUD reads these fields and never writes
   them, and nothing here reads a DOM node. Every call out of this file — audio, dilation, grade —
   is optional and guarded, because silence is a shipping state. */
(function () {
  const S = {};
  const U = () => RR.U;
  const B = () => RR.Bridges;

  // ---- read-only state, for the HUD ----------------------------------------------------------
  S.chain = 0;          // clean salutes in a row (a threaded ramp counts three)
  S.best = 0;           // best chain this session
  S.window = 0;         // 1 at the far edge of the ask window, 0 at the near edge or with no ask
  S.armed = false;      // the tender has answered and the leaves are moving
  S.target = null;      // the span being asked, or null
  S.dist = 0;           // metres to that span
  S.open = 0;           // its leaves, 0..1 — the arc's second hand
  S.tier = 0;           // 0 · 1 = THE WAVE (x5) · 2 = THE RUN (x10)
  S.bankable = false;   // SPACE right now would bank the chain rather than ask
  S.event = null;       // 'ask' | 'clean' | 'threaded' | 'miss' | 'bank' — the callout
  S.eventT = 99;        // seconds since it fired
  S.eventN = 0;         // chain value the callout refers to

  // ---- tunables ------------------------------------------------------------------------------
  // The payout is the only place boost is handed out for a bridge; W3 owns checkpoints and gates
  // and must not pay for a salute as well.
  S.PAY = 0.35;             // a clean salute at chain x5 — scales 0.76x at x1 to 1.30x at x10
  S.THREAD_MUL = 1.6;       // through a raised slot, airborne
  S.THREAD_CHAIN = 3;       // and it is worth three links
  S.WAVE_AT = 5;            // chain that arms the lift wave
  S.RUN_AT = 10;            // chain that makes boost infinite and dyes the river
  S.BANK_AT = 3;            // lowest chain worth banking
  S.BANK_PAY = 0.075;       // per link, when you take the money instead of the next bridge

  // ---- internals -----------------------------------------------------------------------------
  let seen = 0;             // last consumed RR.Input.saluteCount
  let lastState = null;     // the race object we are attached to, so a restart resets us
  let waveT = 0;            // throttle on re-arming the wave
  let greenOn = false;      // did WE dye the river? never undo a dye the player asked for with G
  let musicSent = -1;
  let tierSent = -1;
  let live = false;

  function callout(kind, n) { S.event = kind; S.eventT = 0; S.eventN = n == null ? S.chain : n; }

  function tierOf(c) { return c >= S.RUN_AT ? 2 : c >= S.WAVE_AT ? 1 : 0; }

  function pushTier() {
    const t = tierOf(S.chain);
    if (t === S.tier) return;
    S.tier = t;
    if (t >= 2 && !greenOn && RR.Theme && RR.Theme.toggleGreenRiver && !RR.Theme.greenRiver) {
      RR.Theme.toggleGreenRiver(); greenOn = true;      // parade green, the one day a year
    } else if (t < 2 && greenOn && RR.Theme && RR.Theme.toggleGreenRiver && RR.Theme.greenRiver) {
      RR.Theme.toggleGreenRiver(); greenOn = false;
    }
  }

  function pushGrade() {
    if (S.tier === tierSent) return;
    tierSent = S.tier;
    if (RR.Post && RR.Post.setChainTier) RR.Post.setChainTier(S.tier);
  }

  function pushMusic() {
    const v = U().clamp(S.chain / 8, 0, 1);
    if (Math.abs(v - musicSent) < 0.06) return;
    musicSent = v;
    if (RR.Audio && RR.Audio.setMusicIntensity) RR.Audio.setMusicIntensity(v);
  }

  // Hand everything back. `hard` also drops the bridges, which only a race teardown should do.
  function reset(hard) {
    S.chain = 0; S.window = 0; S.armed = false; S.target = null; S.dist = 0; S.open = 0;
    S.bankable = false; S.event = null; S.eventT = 99; S.eventN = 0;
    pushTier(); pushGrade(); pushMusic();
    if (hard && B() && B().allDown) B().allDown();
  }
  S.reset = reset;

  function breakChain() {
    if (S.chain <= 0) return;
    callout('miss', S.chain);
    S.chain = 0;
    pushTier(); pushGrade(); pushMusic();
    // The silence is the punishment: everything snaps back over 400 ms and the music restarts
    // from layer one. audio.js is frozen — chainBreak() is requested, not written.
    if (RR.Feel && RR.Feel.dilate) RR.Feel.dilate(0.35, 400);
    if (RR.Audio && RR.Audio.chainBreak) RR.Audio.chainBreak();
  }

  // ---- the ask -------------------------------------------------------------------------------
  function ask(boat) {
    if (!live) return;
    // The boat's own signal always sounds, in or out of the window — a horn you can hear yourself
    // blow is how you learn where the window is.
    if (RR.Audio && RR.Audio.saluteHorn) RR.Audio.saluteHorn(boat.pos.x, boat.pos.z);
    else if (RR.Audio && RR.Audio.airhorn) RR.Audio.airhorn();

    if (S.target && S.window > 0) {
      if (B().arm(S.target)) {
        callout('ask', S.chain);
        // and the tender answers with the identical signal before anything moves
        if (RR.Audio && RR.Audio.bridgeHorn) RR.Audio.bridgeHorn(S.target.x, S.target.z);
      }
      return;
    }
    if (S.bankable) bank(boat);
  }
  S.arm = ask;

  function bank(boat) {
    const n = S.chain;
    if (n < S.BANK_AT) return;
    boat.boostEnergy = Math.min(1, (boat.boostEnergy || 0) + S.BANK_PAY * n);
    callout('bank', n);
    S.chain = 0;
    pushTier(); pushGrade(); pushMusic();
    if (RR.Audio && RR.Audio.boostGate) RR.Audio.boostGate();
  }

  // ---- the crossing --------------------------------------------------------------------------
  function crossed(span, boat) {
    const o = span.opening;
    if (o.open <= B().CLEAN_OPEN) { breakChain(); return; }
    const air = !!boat.airborne;
    S.chain += air ? S.THREAD_CHAIN : 1;
    if (S.chain > S.best) S.best = S.chain;
    const pay = S.PAY * (0.70 + 0.06 * Math.min(10, S.chain)) * (air ? S.THREAD_MUL : 1);
    boat.boostEnergy = Math.min(1, (boat.boostEnergy || 0) + pay);
    callout(air ? 'threaded' : 'clean', S.chain);
    pushTier(); pushGrade(); pushMusic();
    if (RR.Feel && RR.Feel.dilate) RR.Feel.dilate(air ? 0.55 : 0.80, air ? 400 : 320);
    if (RR.Audio && RR.Audio.boostGate) RR.Audio.boostGate();
  }

  // ---- per frame -----------------------------------------------------------------------------
  RR.Engine.onUpdate(function (dt) {
    const bridges = B();
    if (!bridges || !bridges.list) return;
    S.eventT += dt;

    const rs = RR.Race && RR.Race.state ? RR.Race.state() : null;
    // The Architecture Tour, the menu flythrough and every replay stay on the ambient clock: no
    // player-driven lift, no horn over the title music (VISION R4).
    const now = !!(rs && !rs.tour && rs.player);
    if (rs !== lastState) { lastState = rs; reset(true); }
    if (now !== live) {
      live = now;
      bridges.mode = live ? 'race' : 'ambient';
      if (!live) reset(true);
    }
    if (!live) { seen = RR.Input ? RR.Input.saluteCount : 0; return; }

    const boat = rs.player;
    const px = boat.pos.x, pz = boat.pos.z;
    const hx = Math.sin(boat.heading), hz = Math.cos(boat.heading);
    const spd = Math.hypot(boat.vel.x, boat.vel.z);

    // ---- crossings: every askable span, not just the one being asked. A bridge you never asked
    // for still counts against you — that is the whole reason the chain means anything.
    const spans = bridges.list();
    for (let i = 0; i < spans.length; i++) {
      const s = spans[i];
      if (!s.opening) continue;
      const dx = px - s.x, dz = pz - s.z;
      if (dx * dx + dz * dz > 90 * 90) { s._rel = undefined; continue; }
      const rel = dx * s.tx + dz * s.tz;                       // signed, along the course direction
      const prev = s._rel;
      s._rel = rel;
      if (prev === undefined || prev > 0 || rel <= 0) continue;
      if (Math.abs(dx * -s.tz + dz * s.tx) > s.halfSpan) continue;
      if (hx * s.tx + hz * s.tz < 0.25) continue;              // going backwards under it doesn't count
      crossed(s, boat);
    }

    // ---- the window
    const tgt = bridges.nextAhead(px, pz, hx, hz, bridges.WINDOW_M + 70);
    S.target = tgt;
    if (tgt) {
      S.dist = tgt.dist;
      S.open = tgt.opening.open;
      S.armed = bridges.armed(tgt);
      const w = bridges.WINDOW_M - bridges.WINDOW_NEAR_M;
      S.window = (!S.armed && tgt.dist <= bridges.WINDOW_M && tgt.dist >= bridges.WINDOW_NEAR_M)
        ? U().clamp((tgt.dist - bridges.WINDOW_NEAR_M) / w, 0, 1) : 0;
    } else {
      S.dist = 0; S.open = 0; S.armed = false; S.window = 0;
    }
    // Banking is only offered with NO bridge inside the ask range at all, armed or not: a second
    // press meant for the tender must never spend the chain by accident.
    S.bankable = S.chain >= S.BANK_AT && !(tgt && tgt.dist <= bridges.WINDOW_M);

    // ---- the ask
    if (RR.Input && RR.Input.saluteCount !== seen) { seen = RR.Input.saluteCount; ask(boat); }

    // ---- escalation
    if (S.tier >= 1) {
      waveT -= dt;
      if (waveT <= 0) {
        waveT = 0.4;
        bridges.armWave(px, pz, hx, hz, Math.max(20, spd), S.tier >= 2 ? 900 : 620,
          S.tier >= 2 ? 1.4 : 0.9);
      }
    } else waveT = 0;
    if (S.tier >= 2) boat.boostEnergy = 1;                     // THE RUN: the meter stops mattering
  });

  // kept so a caller wired to the placeholder still resolves; the module drives itself off
  // RR.Engine.onUpdate and needs no line in main.js
  S.update = function () {};

  RR.Salute = S;
})();

/* River Racer — THE FIRST BRIDGE: the playable cold open.

   Nobody reads a HOW TO PLAY screen and everybody plays a river, so the first sixty seconds are
   a river. This is NOT a new mode: main.js starts the MAIN STEM with the rivals off and the
   countdown skipped, and everything below is a prompt script laid over it — one line at a time,
   each one clearing itself the moment you obey it.

   The whole run down the stem, in metres of route (re-measured off the built course this round,
   not guessed — the ramps moved and the crates arrived):

     26  grid          223 FRANKLIN      355 WELLS       480 LASALLE     604 CLARK
     728 DEARBORN      853 STATE        1021 WABASH     1189 DUSABLE    1211 ramp foot
     1516 COLUMBUS     1756 ramp foot   2091 LAKE SHORE DR
     crate rows at 250 · 600 · 940 · 1275 · 1610 · 1955

   HOLD UP off the line, SHIFT clearing Franklin, and then the Loop closes in over the channel and
   the tender starts working down his sequence. That beat is a fact card, not an instruction: a
   bridge lift is the one thing on this river nobody in a boat can ask for, and the best thing in
   the game to look at. Past Wabash the channel opens out, the crates ride down the middle of it,
   and the first ramp is moored in the Riverwalk reach past DuSable. Past the last bridge the
   canyon lets go, the rig releases onto the skyline and the title lands.

   It is unloseable in every sense: no rivals, no timer, no wrong turn that ends it, and nothing
   overhead that can hurt you.

   ESC skips at any point. It runs once (`rr_save.seenOpening`) and afterwards lives in the menu
   as THE FIRST BRIDGE — and twenty seconds of silence on the menu hands it to an AI, which is the
   attract loop for free. The first input the player makes takes the wheel back.

   Every call out of this file is optional-guarded. It owns its own DOM layer (#opening in
   index.html) and writes nothing else's. */
(function () {
  const O = {};
  const $ = (id) => document.getElementById(id);

  const END_D = 2140;          // past DuSable Lake Shore Dr: the last bridge on the stem is behind you
  const FIN_HOLD_S = 4.9;      // 3.5 s of feel.js's finale, then a beat of the title standing alone
  const MAX_S = 180;           // SIM-seconds backstop — a boat parked on the bank still gets a title

  // One line at a time, each with the stretch of river it belongs to. `to` is a hard release: the
  // script never nags past the bridge it was talking about, and `done` lets obedience clear it
  // early.
  const BEATS = [
    {
      key: 'HOLD  ↑', line: 'FULL THROTTLE', sub: 'SHE CLIMBS HER OWN BOW WAVE',
      from: 0, to: 190, done: (c) => c.spd > 15,
    },
    {
      key: 'SHIFT', line: 'BOOST', sub: 'TAKE FRANKLIN ST FLAT',
      from: 150, to: 340, done: (c) => c.boost && c.spd > 22,
    },
    {
      // Not an instruction, because there is nothing to do about it — which is the point. LaSalle
      // and Clark are both inside this stretch, and on the tender's clock one of them is usually
      // standing open by the time you get there.
      key: null, line: 'THE TENDER IS LIFTING THE LOOP', sub: 'THIRTY-SEVEN MOVABLE BRIDGES · MORE THAN ANY CITY ON EARTH',
      from: 380, to: 640,
    },
    {
      // The crates are in this run now — powerups.js stopped holding them out of the cold open —
      // so this is an order the player can carry out rather than a fact about some other race.
      // It clears on USING one, not on holding one: the first row is 250 m off the line, so a beat
      // that cleared on a full slot was consumed 400 m before its own window opened and the line
      // was never once on screen. Rows at 600 and 940 straddle this stretch either way.
      key: 'E', line: 'RUN A GOLD CRATE', sub: 'THE SLOT SPINS YOU AN ITEM — E LETS IT GO',
      from: 640, to: 1040, done: (c) => c.used,
    },
    {
      // The window is RESOLVED AT start() from the ramp list, not written down here. All six ramps
      // moved this round — off the bascule approaches, into open water — and the constant that used
      // to be State St's lip spent the change pointing the player at empty river. Line and sub name
      // no street for the same reason.
      key: null, line: 'A RAMP, MOORED IN OPEN WATER', sub: 'SEND IT — NOTHING OVER YOU BUT SKY',
      from: 1e9, to: 1e9,
    },
  ];
  const RAMP_BEAT = BEATS.length - 1;

  // Aim the ramp beat at whichever ramp is actually moored on the run's own route. No ramp in
  // reach (another branch, or too near the start or the finish to call) leaves the window shut,
  // and the script simply has one line fewer.
  function aimRampBeat(route) {
    const b = BEATS[RAMP_BEAT];
    b.from = 1e9; b.to = 1e9;
    if (!route || !RR.Ramps || !RR.Ramps.list || !RR.U) return;
    let d = 0;
    for (const r of RR.Ramps.list) {
      const q = RR.U.pathNearest(route, r.x, r.z);
      if (Math.hypot(q.x - r.x, q.z - r.z) > 12) continue;      // moored on some other channel
      if (q.d < 420 || q.d > END_D - 120) continue;             // no room to call it, or past the end
      if (!d || q.d < d) d = q.d;
    }
    if (!d) return;
    b.from = Math.max(BEATS[RAMP_BEAT - 1].to, d - 170);        // ~5 s of warning at cold-open speed
    b.to = d + 34;                                              // released once the lip is astern
  }

  let live = false, attract = false, host = null;
  let beat = 0, shown = -1, pilot = null, ctl = null;
  let age = 0, itemSeen = null, wordT = 0, camLowT = 0, camLow = false, camShot = false;
  let airPeak = 0, topSpd = 0;
  let ending = 0, endT = 0;
  let els = null, listening = false, ended = null;

  // The power-ups belong to another workstream. Everything this file knows about them is whatever
  // they leave on the hull plus one published clock, both read through guarded accessors — so the
  // crate beat degrades to a line of text that times out on its own if they are not in the build.
  function firedRecently() {
    const P = RR.Powerups;
    return !!(P && P.firedAgo && P.firedAgo() < 1.5);
  }
  function heldItem(p) {
    const it = p && (p.item || p.powerup);
    if (!it) return null;
    return typeof it === 'string' ? it : (it.name || it.kind || it.id || 'POWER-UP');
  }

  // the nearest bascule ahead whose leaves are actually up, or null. Ambient only: nothing in the
  // game asks for a lift any more, so this is purely "is there a wall going up in front of me".
  function liftAhead(p) {
    const B = RR.Bridges;
    if (!B || !B.nextAhead) return null;
    const s = B.nextAhead(p.pos.x, p.pos.z, Math.sin(p.heading), Math.cos(p.heading), 90);
    return s && s.opening && s.opening.open > 0.25 ? s : null;
  }

  // ---- the overlay ---------------------------------------------------------------------------
  function E() {
    if (els) return els;
    const root = $('opening');
    if (!root) return null;
    els = {
      root, key: $('open-key'), txt: $('open-txt'), sub: $('open-sub'),
      word: $('open-word'), title: $('open-title'), tally: $('open-tally'),
    };
    return els;
  }

  function showLine(b) {
    const e = E();
    if (!e) return;
    if (b) {
      e.key.textContent = b.key || '';
      e.key.style.display = b.key ? '' : 'none';
      e.txt.textContent = b.line;
      e.sub.textContent = b.sub || '';
    }
    e.root.classList.toggle('line-on', !!b);
  }

  function showWord(s, secs) {
    const e = E();
    if (!e) return;
    if (s) e.word.textContent = s;
    e.root.classList.toggle('word-on', !!s);
    wordT = s ? (secs || 1.9) : 0;
  }

  function lean(on) {
    const h = $('hud');
    if (h) h.classList.toggle('lean', !!on);
    const r = E();
    if (r) {
      r.root.classList.toggle('on', !!on);
      if (!on) { r.root.classList.remove('line-on', 'word-on', 'title-on'); }
    }
  }

  // ---- lifecycle -----------------------------------------------------------------------------
  // main.js owns startRace and the way back to the title; it hands them over once, at boot.
  O.attach = function (h) { host = h || null; };

  O.shouldRun = function () {
    if (live) return false;
    if (RR.Progress && RR.Progress.seenOpening) return !RR.Progress.seenOpening();
    return false;                              // no save layer: never ambush a returning player
  };

  O.active = function () { return live; };
  // what the run is doing right now, for the test harness — no other module reads this
  O.detail = function () {
    return { live, attract, beat, d: Math.round(c.d), item: c.item, ending, ended,
      age: Math.round(age * 10) / 10 };
  };
  O.attracting = function () { return live && attract; };
  O.control = function () { return attract ? ctl : null; };

  O.start = function (opts) {
    if (live || !host || !host.startRace) return false;
    attract = !!(opts && opts.attract);
    beat = 0; shown = -1; itemSeen = null; wordT = 0; camLowT = 0; camLow = false; camShot = false;
    ending = 0; endT = 0; pilot = null; ctl = null; ended = null;
    age = 0; airPeak = 0; topSpd = 0; c.used = false;
    live = true;
    host.startRace();                          // MAIN STEM, one boat, no countdown, no timer
    const rs = RR.Race && RR.Race.state ? RR.Race.state() : null;
    if (!rs || !rs.player) { live = false; return false; }
    aimRampBeat(rs.route);                     // the ramps move; the script must not have to
    if (attract && RR.AI && RR.AI.createPilot) {
      pilot = RR.AI.createPilot(rs.player, { path: rs.route }, 2, 1.0);
      pilot.lane = 0;
      ctl = pilot.ctl;
    }
    lean(true);
    showLine(null); showWord(null);
    if (RR.HUD && RR.HUD.chip) RR.HUD.chip('near', attract ? 'ANY KEY — TAKE THE WHEEL' : 'ESC — SKIP', 4200);
    hookTakeover(attract);
    return true;
  };

  // "The first input the player makes takes the wheel." One listener, removed the instant it fires.
  function onAnyInput() { if (live && attract) O.takeWheel(); }
  function hookTakeover(on) {
    if (on === listening) return;
    listening = on;
    if (on) { window.addEventListener('keydown', onAnyInput); window.addEventListener('pointerdown', onAnyInput); }
    else { window.removeEventListener('keydown', onAnyInput); window.removeEventListener('pointerdown', onAnyInput); }
  }

  O.takeWheel = function () {
    if (!live || !attract) return;
    attract = false; pilot = null; ctl = null;
    hookTakeover(false);
    shown = -1;                                // re-announce whichever beat the river is on
    if (RR.HUD && RR.HUD.chip) RR.HUD.chip('near', 'YOU HAVE THE WHEEL · ESC SKIPS', 2600);
  };

  // ESC, or anything else that wants the river back
  function finish(toMenu, why) {
    if (!live) return;
    if (!ended || !/^land/.test(ended)) ended = why || 'skip';
    live = false; attract = false;
    hookTakeover(false);
    lean(false);
    if (RR.Camera && RR.Camera.setMode) RR.Camera.setMode(0);
    if (RR.Progress && RR.Progress.setSeenOpening) RR.Progress.setSeenOpening(true);
    if (toMenu && host && host.toMenu) host.toMenu();
  }

  O.skip = function () { finish(true, 'esc'); };
  // main.js calls this when a real race replaces the run underneath us; it must not bounce the
  // player back to the title, because a race is already starting.
  O.abort = function () { if (live) finish(false, 'race'); };

  // ---- the ending ----------------------------------------------------------------------------
  // Past the last bridge on the stem the canyon walls fall away. feel.js already owns exactly this
  // beat for the finish line — engine and music cut, three seconds of wind, the chase rig releases
  // onto the skyline — so the cold open ends on the same machinery the game ends on.
  function land(why) {
    if (ending) return;
    ending = 1; endT = 0; ended = 'land:' + (why || '?');
    showLine(null);
    showWord(null);
    camLow = false; camLowT = 0;
    if (RR.Camera && RR.Camera.setMode) RR.Camera.setMode(0);   // the release shot is a chase shot
    if (RR.HUD && RR.HUD.show) RR.HUD.show(false);              // the title gets the screen to itself
    const e = E();
    if (e) {
      // what the run was worth, in the opening's own voice rather than the HUD's — the cold open
      // has no results card, and a screen that cannot say what you did says the run was nothing
      e.tally.textContent = topSpd > 8 ? 'TOP SPEED  ' + Math.round(topSpd * 2.237) + ' MPH' : '';
      e.root.classList.add('title-on');
    }
    if (RR.Feel && RR.Feel.finale) RR.Feel.finale(() => { ending = 2; });
    else if (RR.Camera && RR.Camera.release) RR.Camera.release(3.5);
  }

  // ---- per frame -----------------------------------------------------------------------------
  const c = { d: 0, spd: 0, boost: false, item: null, used: false };

  RR.Engine.onUpdate(function (dt) {
    if (!live) return;
    const rs = RR.Race && RR.Race.state ? RR.Race.state() : null;
    const p = rs && rs.player;
    if (!p) { finish(true, 'noboat'); return; }

    c.d = p.routeD || 0;
    c.spd = Math.hypot(p.vel.x, p.vel.z);
    c.boost = !!(RR.Input && RR.Input.boost) || !!(ctl && ctl.boost);
    c.item = heldItem(p);
    if (!c.used && firedRecently()) c.used = true;      // sticky: the lesson does not un-learn
    age += dt;
    if (c.spd > topSpd) topSpd = c.spd;

    if (attract && pilot && RR.AI && RR.AI.update) RR.AI.update(pilot, dt, RR.Engine.time(), c.d);

    // ---- the word, for the two things this run can pay you. Airtime needs nothing but the ramp;
    // the pickup line only ever fires once the power-ups are in the build.
    if (p.airborne) airPeak = Math.max(airPeak, p.airTime || 0);
    else if (airPeak > 0) {
      if (airPeak > 0.7) showWord('AIR  ' + airPeak.toFixed(1) + ' S', 1.9);
      airPeak = 0;
    }
    if (c.item && c.item !== itemSeen) showWord(String(c.item).toUpperCase(), 1.9);
    itemSeen = c.item;
    if (wordT > 0) { wordT -= dt; if (wordT <= 0) showWord(null); }

    // ---- the camera drops to hull height and looks up as the steel goes over. Mode 2 is the hull
    // cam: 1.5 m off the water at 72 degrees, which is what turns a forty-metre leaf into a wall.
    // Once per run, and then never again: the leaves keep their own time now and half the Loop can
    // be standing open on one pass, and a rig that ducks for every one of them has a twitch.
    if ((!camShot || camLow) && liftAhead(p)) { camShot = true; camLowT = 2.4; }
    if (camLowT > 0) {
      camLowT -= dt;
      if (!camLow && !ending) { camLow = true; if (RR.Camera && RR.Camera.setMode) RR.Camera.setMode(2); }
    } else if (camLow) {
      camLow = false;
      if (RR.Camera && RR.Camera.setMode) RR.Camera.setMode(0);
    }

    // ---- the ending. Wall clock, not sim clock: the finale is running the world at 0.6x on
    // purpose and the title is not allowed to be on screen for two thirds longer because of it.
    // feel.js hands back at 3.5 s; the title holds a beat past that, then the menu comes up under
    // it. If feel.js is absent the timeout is the whole beat.
    if (ending) {
      endT += (RR.Engine.rawDt || dt);
      if (ending === 2 && endT < FIN_HOLD_S) return;
      if (ending === 2 || endT > 9) finish(true, ending === 2 ? 'title' : 'title-timeout');
      return;
    }
    const inLake = RR.River && RR.River.inLake ? RR.River.inLake(p.pos.x, p.pos.z) : false;
    const old = age > MAX_S;
    if (c.d > END_D || inLake || old) { land(c.d > END_D ? 'far' : inLake ? 'lake' : 'clock'); return; }

    // ---- the script. `want` is the one beat that has the screen right now, or -1 for none —
    // resolved every frame and written to the DOM only when it changes, so a released beat takes
    // its line with it instead of hanging over the next half-mile of river.
    let want = -1;
    while (beat < BEATS.length) {
      const b = BEATS[beat];
      if (c.d >= b.to) { beat++; continue; }
      if (c.d < b.from) break;
      if (b.done && b.done(c)) { beat++; continue; }
      if (attract) break;                      // the AI does not need to be told
      // the word for what just happened owns the screen on its own — an instruction you have
      // already carried out must not still be sitting over its own payoff
      if (wordT > 0) break;
      want = beat;
      break;
    }
    if (want !== shown) { shown = want; showLine(want < 0 ? null : BEATS[want]); }
  });

  RR.Opening = O;
})();

/* River Racer — THE FIRST BRIDGE: the playable cold open.

   Nobody reads a HOW TO PLAY screen and everybody plays a river, so the first sixty seconds are
   a river. This is NOT a new mode: main.js starts the MAIN STEM with the rivals off and the
   countdown skipped, and everything below is a prompt script laid over it — one line at a time,
   each one clearing itself the moment you obey it.

   The whole run down the stem, in metres of route (measured off the built course, not guessed):

     26  grid          224 FRANKLIN      356 WELLS       482 LASALLE     600 CLARK
     725 DEARBORN      818 ramp lip      856 STATE       1022 WABASH     1187 DUSABLE
     1519 COLUMBUS     2093 LAKE SHORE DR

   HOLD UP off the line, SHIFT clearing Franklin, and then two hundred metres short of LaSalle the
   amber lamp lights on the tender house and the only line that matters: SPACE, ASK FOR THE BRIDGE.
   Clark is a hundred and eighteen metres later and nobody tells you anything. State has a ramp on
   its approach and that one is a question, not an instruction. Past the last bridge the canyon
   lets go, the rig releases onto the skyline and the title lands.

   It is unloseable in the only sense that matters: no rivals, no timer, no wrong turn that ends
   it. The one thing that can hit you is a ramp taken with the span shut, and that is the lesson.

   ESC skips at any point. It runs once (`rr_save.seenOpening`) and afterwards lives in the menu
   as THE FIRST BRIDGE — and twenty seconds of silence on the menu hands it to an AI, which is the
   attract loop for free. The first input the player makes takes the wheel back.

   Every call out of this file is optional-guarded. It owns its own DOM layer (#opening in
   index.html) and writes nothing else's. */
(function () {
  const O = {};
  const $ = (id) => document.getElementById(id);

  const LASALLE = 482, CLARK = 600, STATE = 856, RAMP = 818;
  const END_D = 2140;          // past DuSable Lake Shore Dr: the last bridge on the stem is behind you
  const FIN_HOLD_S = 4.9;      // 3.5 s of feel.js's finale, then a beat of the title standing alone
  const MAX_S = 180;           // SIM-seconds backstop — a boat parked on the bank still gets a title

  // One line at a time, each with the stretch of river it belongs to. `to` is a hard release: the
  // script never nags past the bridge it was talking about. `done` lets obedience clear it early,
  // and `only` skips a beat that has nothing left to teach.
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
      key: 'SPACE', line: 'ASK FOR THE BRIDGE', sub: 'LASALLE ST · ONE PROLONGED BLAST AND ONE SHORT',
      from: LASALLE - 200, to: LASALLE + 26, done: (c) => c.chain > 0,
    },
    {
      // Clark is 118 m later and nobody tells you anything — unless LaSalle got away from you, in
      // which case the river asks once more rather than sulking.
      key: 'SPACE', line: 'ASK FOR THE BRIDGE', sub: 'CLARK ST',
      from: CLARK - 190, to: CLARK + 26, only: (c) => c.chain <= 0, done: (c) => c.chain > 0,
    },
    {
      // Not an instruction. Five of the six ramps in this game are moored on a bascule approach,
      // and with a live ceiling overhead every one of them asks the same question.
      key: null, line: 'A RAMP ON THE STATE ST APPROACH', sub: 'IS IT UP?',
      from: RAMP - 160, to: STATE + 24,
    },
  ];

  let live = false, attract = false, host = null;
  let beat = 0, shown = -1, pilot = null, ctl = null;
  let age = 0, chainSeen = 0, wordT = 0, camLowT = 0, camLow = false, askedSpan = null;
  let ending = 0, endT = 0;
  let els = null, listening = false, ended = null;

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
    if (h) { h.classList.toggle('lean', !!on); if (!on) h.classList.remove('chained'); }
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
    return { live, attract, beat, d: Math.round(c.d), chain: c.chain, ending, ended,
      age: Math.round(age * 10) / 10 };
  };
  O.attracting = function () { return live && attract; };
  O.control = function () { return attract ? ctl : null; };

  O.start = function (opts) {
    if (live || !host || !host.startRace) return false;
    attract = !!(opts && opts.attract);
    beat = 0; shown = -1; chainSeen = 0; wordT = 0; camLowT = 0; camLow = false;
    ending = 0; endT = 0; askedSpan = null; pilot = null; ctl = null; ended = null;
    age = 0;
    live = true;
    host.startRace();                          // MAIN STEM, one boat, no countdown, no timer
    const rs = RR.Race && RR.Race.state ? RR.Race.state() : null;
    if (!rs || !rs.player) { live = false; return false; }
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
      e.tally.textContent = c.chain > 0 ? 'SALUTE  ×' + c.chain : '';
      e.root.classList.add('title-on');
    }
    if (RR.Feel && RR.Feel.finale) RR.Feel.finale(() => { ending = 2; });
    else if (RR.Camera && RR.Camera.release) RR.Camera.release(3.5);
  }

  // ---- per frame -----------------------------------------------------------------------------
  const c = { d: 0, spd: 0, boost: false, chain: 0 };

  RR.Engine.onUpdate(function (dt) {
    if (!live) return;
    const rs = RR.Race && RR.Race.state ? RR.Race.state() : null;
    const p = rs && rs.player;
    if (!p) { finish(true, 'noboat'); return; }

    c.d = p.routeD || 0;
    c.spd = Math.hypot(p.vel.x, p.vel.z);
    c.boost = !!(RR.Input && RR.Input.boost) || !!(ctl && ctl.boost);
    c.chain = RR.Salute ? (RR.Salute.chain || 0) : 0;
    age += dt;

    // the attract pilot drives, and asks for its own bridges — the demo has to show the hook
    if (attract) {
      if (pilot && RR.AI && RR.AI.update) RR.AI.update(pilot, dt, RR.Engine.time(), c.d);
      if (RR.Salute && RR.Salute.arm && RR.Salute.window > 0 && !RR.Salute.armed &&
          askedSpan !== RR.Salute.target && RR.Salute.dist < Math.max(60, c.spd * 2.6)) {
        askedSpan = RR.Salute.target;
        RR.Salute.arm(p);
      }
    }

    // ---- the word. A clean salute says so in the opening's own voice; the HUD's chain numeral
    // is already saying the same thing, quieter, and keeps saying it for the rest of the game.
    if (RR.Salute && c.chain > chainSeen) {
      const ev = RR.Salute.event;
      showWord((ev === 'threaded' ? 'THREADED  ×' : 'SALUTE  ×') + c.chain, ev === 'threaded' ? 2.4 : 1.9);
      const h = $('hud');
      if (h) h.classList.add('chained');       // the numeral arrives with the thing it counts
    }
    chainSeen = c.chain;
    if (wordT > 0) { wordT -= dt; if (wordT <= 0) showWord(null); }

    // ---- the camera drops to hull height and looks up as the steel goes over. Mode 2 is the hull
    // cam: 1.5 m off the water at 72 degrees, which is what turns a forty-metre leaf into a wall.
    if (RR.Salute && RR.Salute.armed && RR.Salute.target && RR.Salute.dist < 80 && RR.Salute.open > 0.2) camLowT = 2.0;
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

    // ---- the script
    while (beat < BEATS.length) {
      const b = BEATS[beat];
      if (c.d >= b.to || (b.only && !b.only(c) && c.d >= b.from)) { beat++; shown = -1; continue; }
      if (c.d < b.from) break;
      if (b.done && b.done(c)) { beat++; shown = -1; continue; }
      if (attract) break;                      // the AI does not need to be told
      // the word for what just happened owns the screen on its own — an instruction you have
      // already carried out must not still be sitting over its own payoff
      if (wordT > 0) { if (shown !== -1) { shown = -1; showLine(null); } break; }
      if (shown !== beat) { shown = beat; showLine(b); }
      break;
    }
    if (beat >= BEATS.length || attract || (BEATS[beat] && c.d < BEATS[beat].from)) {
      if (shown !== -1) { shown = -1; showLine(null); }
    }
  });

  RR.Opening = O;
})();

/* River Racer — the on-screen control layer (touch devices only).

   A phone has no keyboard. What this replaces — "left half of the screen steers by finger x, right
   half is throttle" — could not boost, fire an item, brake, reverse, look astern or pause, which is
   to say it could not play the game. This is the whole mobile scheme, and it is built around one
   ergonomic fact: THROTTLE AND BOOST ARE BOTH HOLDS. So they share a single column under the right
   thumb — slide up out of GO into BOOST and the throttle never lifts.

   Landscape layout (the racing orientation):
     left   — steer zone, invisible and thumb-sized. The stick ANCHORS WHERE THE THUMB LANDS
              instead of demanding the thumb find it, and the anchor slides at full lock so the
              throw stays symmetrical however far the drag ran.
     right  — throttle column: BOOST / GO / REV, top to bottom. One thumb, no lift, and the gold
              hairline under BOOST is the tank, so "why is nothing happening" has an answer.
     inboard — FIRE (big, and gold the moment you are holding something), then ASTERN, then
              PAUSE, which dispatches ESC so main.js's one pause path stays the only pause path.

   Every finger is tracked by Touch.identifier: steer, throttle, boost and fire are all live at
   once, and a second finger landing never steals the first one's control. The widgets own the hit
   zones because the hit zones ARE the widgets; input.js owns what they mean, and this file only
   ever writes the fields of RR.Input.touch.

   Touch devices only. A laptop with a digitizer still has a mouse as its PRIMARY pointer and must
   never be shown thumb controls — RR.Input.hasTouch is that test, not "does a digitizer exist". */
(function () {
  window.RR = window.RR || {};
  const TC = { enabled: false };

  // ---------------------------------------------------------------------------- style
  // No backdrop-filter anywhere: a blurred layer over a full-screen WebGL canvas is a second
  // composite of the whole frame every frame, which is precisely the budget a phone does not have.
  const CSS = `
#rr-touch{position:fixed;inset:0;z-index:8;display:none;pointer-events:none;
  font:700 clamp(9px,min(2.9vh,1.75vw),15px)/1 var(--f-ui,"Arial Narrow","Helvetica Neue",Helvetica,Arial,sans-serif);
  color:var(--text,#EAF6FF);-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;
  --sl:0px;--sr:0px;--sb:0px;--stp:0px}
@supports (padding:env(safe-area-inset-left)){
  #rr-touch{--sl:env(safe-area-inset-left,0px);--sr:env(safe-area-inset-right,0px);
    --sb:env(safe-area-inset-bottom,0px);--stp:env(safe-area-inset-top,0px)}}
#rr-touch.on{display:block}
/* touch-action:none on the surfaces only — the menus are ordinary tappable DOM and must stay so */
#rr-touch .rt-hit{position:absolute;pointer-events:auto;touch-action:none;
  -webkit-tap-highlight-color:transparent}
/* the river itself: no double-tap zoom, no long-press selection, no rubber-band scroll mid-race */
#gl{touch-action:none}
html,body{overscroll-behavior:none}

/* The plate has to read against a bright riverbank, not just against water. At .50/.62 the resting
   captions measured barely legible over the pale seawall and the crowd — a first-thirty-seconds
   problem, since the PRESSED states are unmistakable. Nudged rather than solved with a slab: the
   brief here is still "do not obscure the river", and these are small panels at the two edges. */
#rr-touch .rt-panel{border-radius:3px;background:rgba(4,18,27,.60);
  box-shadow:inset 0 0 0 2px rgba(126,200,227,.38),0 .3em 1.2em rgba(0,0,0,.45)}
#rr-touch .rt-cap{font-size:.62em;letter-spacing:.26em;text-indent:.26em;color:rgba(234,246,255,.82);
  text-shadow:0 1px 3px rgba(0,0,0,.95),0 0 .5em rgba(0,0,0,.7)}

/* ------------------------------------------------------------------------ steering */
#rt-steer{left:var(--sl);bottom:var(--sb);width:min(46%,30em);height:min(62%,21em)}
/* a zero-size anchor: JS moves it by transform alone, so a drag never touches layout */
#rt-stick{position:absolute;left:0;top:0;width:0;height:0;opacity:.46;transition:opacity 160ms linear}
#rt-steer.act #rt-stick{opacity:.95}
#rt-track{position:absolute;left:-7.4em;top:-.3em;width:14.8em;height:.6em;border-radius:2px;
  background:rgba(4,18,27,.55);box-shadow:inset 0 0 0 2px rgba(126,200,227,.30)}
#rt-track i{position:absolute;left:50%;top:-.55em;width:2px;height:1.7em;margin-left:-1px;
  background:rgba(126,200,227,.55)}
#rt-knob{position:absolute;left:-2.1em;top:-2.1em;width:4.2em;height:4.2em;border-radius:3px;
  display:flex;align-items:center;justify-content:center;gap:.5em;
  background:rgba(6,22,34,.62);box-shadow:inset 0 0 0 2px var(--chi-blue,#7EC8E3),0 .2em .9em rgba(0,0,0,.5)}
#rt-knob b{font-size:.8em;line-height:1;color:var(--chi-blue,#7EC8E3)}
#rt-lab{position:absolute;left:-4em;top:2.9em;width:8em;text-align:center}

/* ------------------------------------------------------------ throttle / boost / rev */
#rt-thr{right:calc(var(--sr) + .9em);bottom:calc(var(--sb) + .9em);width:9.2em;height:19em;
  overflow:hidden;display:flex;flex-direction:column;opacity:.92;transition:opacity 160ms linear}
#rt-thr.g,#rt-thr.r{opacity:1}
.rt-band{position:relative;display:flex;align-items:center;justify-content:center;
  box-shadow:inset 0 -2px 0 rgba(126,200,227,.16)}
#rt-boost{height:30%}
#rt-go{height:41%}
#rt-rev{height:29%;box-shadow:none}
/* the tank, as a hairline: BOOST is the one control that can be pressed and do nothing */
#rt-tank{position:absolute;left:0;bottom:0;width:100%;height:3px;transform-origin:0 50%;
  background:var(--gold,#FFC857);opacity:.6}
#rt-thr.dry #rt-tank{background:var(--chi-red,#EF3340)}
#rt-thr.dry #rt-boost .rt-cap{color:rgba(234,246,255,.30)}
#rt-thr.b #rt-boost{background:rgba(255,200,87,.34);box-shadow:inset 0 0 0 2px var(--gold,#FFC857)}
#rt-thr.g #rt-go{background:rgba(0,105,62,.60);box-shadow:inset 0 0 0 2px #fff}
#rt-thr.r #rt-rev{background:rgba(239,51,64,.55);box-shadow:inset 0 0 0 2px #fff}
#rt-thr.b #rt-boost .rt-cap,#rt-thr.g #rt-go .rt-cap,#rt-thr.r #rt-rev .rt-cap{color:#fff}

/* --------------------------------------------------------------- fire / astern / pause */
#rt-fire{right:calc(var(--sr) + 11.1em);bottom:calc(var(--sb) + .9em);width:7.6em;height:7.6em;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.55em}
/* the hexagram is uikit's, but this one carries its own clip-path: the FIRE icon is the one place
   in the game where a missing stylesheet would leave a plain grey square on the control surface */
#rt-fire .star6{width:2.6em;height:2.6em;background:rgba(159,195,214,.45);
  clip-path:polygon(50% 0%,64.43% 25%,93.30% 25%,78.87% 50%,93.30% 75%,64.43% 75%,
                    50% 100%,35.57% 75%,6.70% 75%,21.13% 50%,6.70% 25%,35.57% 25%)}
#rt-fire.armed{box-shadow:inset 0 0 0 2px var(--gold,#FFC857),0 0 1.2em -.25em rgba(255,200,87,.75),
  0 .3em 1.2em rgba(0,0,0,.45)}
#rt-fire.armed .star6{background:var(--gold,#FFC857)}
#rt-fire.armed .rt-cap{color:var(--gold,#FFC857)}
#rt-fire.act{background:rgba(255,200,87,.45)}
#rt-fire.act .rt-cap{color:#fff}
/* min-height alongside the em height, on both of these: the stack is sized off the SHORT axis so it
   scales with the screen, and on an SE that put PAUSE at 37px — under the 44px floor everything
   else here holds to. The floor wins where the em is small and costs nothing where it is not. */
#rt-astern{right:calc(var(--sr) + 11.1em);bottom:calc(var(--sb) + 9.2em);width:7.6em;height:4em;
  min-height:44px;display:flex;align-items:center;justify-content:center}
#rt-astern.act{background:rgba(126,200,227,.34);box-shadow:inset 0 0 0 2px var(--chi-blue,#7EC8E3),
  0 .3em 1.2em rgba(0,0,0,.45)}
#rt-astern.act .rt-cap{color:#fff}
/* PAUSE rides the right-hand stack rather than the top corner: the top of a phone screen is where
   the HUD lives on every layout it will ever have, and a control that lands on top of the lap
   blade at one font size lands on top of the timer at the next. */
#rt-pause{right:calc(var(--sr) + 11.1em);bottom:calc(var(--sb) + 14em);width:7.6em;height:4em;
  min-height:44px;display:flex;align-items:center;justify-content:center;gap:.62em;opacity:.82}
#rt-pause i{width:.46em;height:1.5em;border-radius:1px;background:var(--chi-blue,#7EC8E3)}
#rt-pause.act{opacity:1;background:rgba(126,200,227,.30)}

/* ------------------------------------------------------------------ the architecture tour */
/* The tour is one of six things on the title screen, and on a phone it was a dead end: you board
   it, get the full driving stack — STEER, GO, BOOST, FIRE — and none of it does anything, because
   taking the wheel is F FIVE TIMES and a phone has no F. The docent is SPACE and the seat is C,
   which it also has none of. So the ride gets its own rail, and while the skipper has the wheel the
   controls that would lie about being connected stand down.
   The ritual is kept intact: five taps, with the count showing. It is the tour's one secret and
   collapsing it to a single button on touch would be a different game on a different device. */
#rr-touch.ride #rt-steer,#rr-touch.ride #rt-thr,#rr-touch.ride #rt-fire{display:none}
/* ABOVE the item socket, not beside it: the bottom-centre strip is the one piece of the bottom edge
   no thumb covers, which is exactly why the item slot is already there. Measured at .9em the rail
   overlapped the socket 38%. 9.2em is ASTERN's baseline — the rail and the right-hand stack then
   share one horizontal line, which reads as a deliberate row rather than a near miss. */
#rt-tour{position:absolute;left:50%;bottom:calc(var(--sb) + 9.2em);transform:translateX(-50%);
  display:none;align-items:flex-end;gap:.7em;pointer-events:none}
#rr-touch.tour #rt-tour{display:flex}
.rt-tb{position:relative;pointer-events:auto;touch-action:none;-webkit-tap-highlight-color:transparent;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.45em;
  min-height:44px;padding:.75em 1.05em}
.rt-tb.act{background:rgba(126,200,227,.30);box-shadow:inset 0 0 0 2px var(--chi-blue,#7EC8E3),
  0 .3em 1.2em rgba(0,0,0,.45)}
.rt-tb.act .rt-cap{color:#fff}
/* the five pips ARE input.js's tap counter, read back rather than counted again here */
#rt-pips{display:flex;gap:.34em}
#rt-pips i{width:.52em;height:.52em;border-radius:50%;background:rgba(126,200,227,.28);
  box-shadow:inset 0 0 0 1px rgba(126,200,227,.5)}
#rt-pips i.lit{background:var(--gold,#FFC857);box-shadow:0 0 .5em rgba(255,200,87,.8)}
#rr-touch.driving #rt-wheel .rt-cap{color:var(--gold,#FFC857)}
`;

  const HTML =
    '<div id="rt-steer" class="rt-hit">' +
      '<div id="rt-stick">' +
        '<div id="rt-track"><i></i></div>' +
        '<div id="rt-knob"><b>◀</b><b>▶</b></div>' +
        '<div id="rt-lab" class="rt-cap">STEER</div>' +
      '</div>' +
    '</div>' +
    '<div id="rt-thr" class="rt-hit rt-panel">' +
      '<div class="rt-band" id="rt-boost"><span class="rt-cap">BOOST</span><u id="rt-tank"></u></div>' +
      '<div class="rt-band" id="rt-go"><span class="rt-cap">GO</span></div>' +
      '<div class="rt-band" id="rt-rev"><span class="rt-cap">REV</span></div>' +
    '</div>' +
    '<div id="rt-fire" class="rt-hit rt-panel"><i class="star6"></i><span class="rt-cap">FIRE</span></div>' +
    '<div id="rt-astern" class="rt-hit rt-panel"><span class="rt-cap">ASTERN</span></div>' +
    '<div id="rt-pause" class="rt-hit rt-panel"><i></i><i></i></div>' +
    '<div id="rt-tour">' +
      '<div id="rt-about" class="rt-tb rt-panel"><span class="rt-cap">ABOUT</span></div>' +
      '<div id="rt-wheel" class="rt-tb rt-panel">' +
        '<span class="rt-cap" id="rt-wheel-cap">TAKE THE WHEEL</span>' +
        '<span id="rt-pips"><i></i><i></i><i></i><i></i><i></i></span>' +
      '</div>' +
      '<div id="rt-seat" class="rt-tb rt-panel"><span class="rt-cap">SEAT</span></div>' +
    '</div>';

  // band boundaries, as fractions of the column — these ARE the CSS heights above
  const F_BOOST = 0.30, F_REV = 0.71;

  let root = null, els = null, IN = null, T = null;
  let shown = false, emPx = 12, steerR = 72, restX = 0, restY = 0;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const findTouch = (list, id) => {
    for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
    return null;
  };
  // touch-action:none is what MAKES these events cancelable, but the compositor's touch-action map
  // is a frame behind the layout that created it — the first touch after the overlay appears (and,
  // measured, every touch on a tablet where the phone re-layout never fires) arrives with
  // cancelable=false. preventDefault on one of those cancels nothing and logs a console error
  // instead — and a console error is this project's failure condition. So ask before cancelling.
  const stop = (e) => { if (e.cancelable) e.preventDefault(); };

  // ---------------------------------------------------------------------- steering
  let steerId = null, steerOx = 0, steerOy = 0, zoneL = 0, zoneT = 0;

  function placeStick(x, y) {
    els.stick.style.transform = 'translate(' + (x - zoneL).toFixed(1) + 'px,' + (y - zoneT).toFixed(1) + 'px)';
  }
  function steerRest() {
    const r = els.steer.getBoundingClientRect();
    zoneL = r.left; zoneT = r.top;
    restX = r.left + Math.min(r.width * 0.5, emPx * 9.2);
    restY = r.top + Math.max(r.height * 0.5, r.height - emPx * 5.6);
    placeStick(restX, restY);
    els.knob.style.transform = 'none';
  }
  // Dead zone, then a mild expo: the first two millimetres of thumb travel are noise, and the
  // hundredth of steer either side of centre is where a boat at 80 mph is actually driven.
  function applySteer(x) {
    let dx = x - steerOx;
    if (dx > steerR) { steerOx = x - steerR; dx = steerR; }
    else if (dx < -steerR) { steerOx = x + steerR; dx = -steerR; }
    const dead = steerR * 0.10, span = steerR - dead;
    let v = 0;
    if (dx > dead) v = (dx - dead) / span;
    else if (dx < -dead) v = (dx + dead) / span;
    T.steer = v < 0 ? -Math.pow(-v, 1.3) : Math.pow(v, 1.3);
    els.knob.style.transform = 'translateX(' + dx.toFixed(1) + 'px)';
    placeStick(steerOx, steerOy);
  }
  function steerStart(e) {
    if (steerId === null && e.changedTouches.length) {
      const t = e.changedTouches[0];
      const r = els.steer.getBoundingClientRect();
      zoneL = r.left; zoneT = r.top;
      steerId = t.identifier; steerOx = t.clientX; steerOy = t.clientY;
      els.steer.classList.add('act');
      applySteer(t.clientX);
    }
    stop(e);
  }
  function steerMove(e) {
    if (steerId !== null) {
      const t = findTouch(e.changedTouches, steerId);
      if (t) { steerOy = t.clientY; applySteer(t.clientX); }
    }
    stop(e);
  }
  function steerEnd(e) {
    if (steerId !== null && findTouch(e.changedTouches, steerId)) releaseSteer();
    stop(e);
  }
  function releaseSteer() {
    steerId = null; T.steer = 0;
    els.steer.classList.remove('act');
    steerRest();
  }

  // ------------------------------------------------------------- throttle / boost / rev
  // The column takes MORE THAN ONE FINGER, deliberately. Sliding the thumb up out of GO into BOOST
  // is the intended move, but half the people who pick this up will instead hold GO and stab BOOST
  // with an index finger — and a scheme where that does nothing reads as a broken boost button. So
  // the bands are a union over every finger in the column, and throttle beats brake.
  const thrPts = new Map();
  let thrTop = 0, thrH = 1;

  function applyThr() {
    let boost = false, go = false, rev = false;
    thrPts.forEach((y) => {
      const f = clamp((y - thrTop) / thrH, 0, 1);
      if (f < F_BOOST) { boost = true; go = true; } else if (f < F_REV) go = true; else rev = true;
    });
    T.throttle = go ? 1 : 0;
    T.brake = !go && rev ? 1 : 0;
    T.boost = boost;
    els.thr.classList.toggle('b', boost);
    els.thr.classList.toggle('g', go);
    els.thr.classList.toggle('r', !go && rev);
  }
  function thrStart(e) {
    if (!thrPts.size) {
      const r = els.thr.getBoundingClientRect();
      thrTop = r.top; thrH = r.height || 1;
    }
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      thrPts.set(t.identifier, t.clientY);
    }
    applyThr();
    stop(e);
  }
  function thrMove(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (thrPts.has(t.identifier)) thrPts.set(t.identifier, t.clientY);
    }
    applyThr();
    stop(e);
  }
  function thrEnd(e) {
    for (let i = 0; i < e.changedTouches.length; i++) thrPts.delete(e.changedTouches[i].identifier);
    applyThr();
    stop(e);
  }
  function releaseThr() {
    thrPts.clear();
    applyThr();
  }

  // ---------------------------------------------------------------------- plain buttons
  function button(el, down, up) {
    let id = null;
    const release = () => {
      if (id === null) return;
      id = null; el.classList.remove('act');
      if (up) up();
    };
    el.addEventListener('touchstart', (e) => {
      if (id === null && e.changedTouches.length) {
        id = e.changedTouches[0].identifier;
        el.classList.add('act');
        if (down) down();
      }
      stop(e);
    }, { passive: false });
    const end = (e) => {
      if (id !== null && findTouch(e.changedTouches, id)) release();
      stop(e);
    };
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', end, { passive: false });
    el.addEventListener('touchmove', stop, { passive: false });
    return release;
  }

  // Synthesise the key rather than call the handler: main.js owns pausing, the tour handover and the
  // docent, input.js owns the five-tap chain, and every one of them is already wired to a window
  // keydown. A second way in is a second way for the two of them to get out of step — and the
  // five-tap chain in particular has timing state that only its own listener may touch.
  // keyUP as well as down, always: input.js latches keys[code] on the way down and clears it on the
  // way up, and its F chord ignores a tap arriving on a key it still believes is held. Without the
  // release, exactly one tap of TAKE THE WHEEL would ever register.
  function key(code) {
    const o = { code, key: code === 'Space' ? ' ' : code, bubbles: true, cancelable: true };
    window.dispatchEvent(new KeyboardEvent('keydown', o));
    window.dispatchEvent(new KeyboardEvent('keyup', o));
  }
  const pause = () => key('Escape');

  let releaseFire = null, releaseAstern = null, releasePause = null;
  const releaseTour = [];
  function releaseAll() {
    if (!els) return;
    releaseSteer(); releaseThr();
    if (releaseFire) releaseFire();
    if (releaseAstern) releaseAstern();
    if (releasePause) releasePause();
    for (const r of releaseTour) r();
    T.lookBack = false; T.item = false;
  }

  // --------------------------------------------------------------------------- visibility
  // The controls belong to the race and to nothing else: the title screen, the showroom, the pause
  // menu and the results are ordinary tappable DOM, and a throttle column over them is a trap.
  function wanted() {
    const hud = document.getElementById('hud');
    if (!hud || !hud.classList.contains('on')) return false;
    return !RR.Menus || !RR.Menus.screen || RR.Menus.screen() === 'none';
  }
  function setVisible(on) {
    if (on === shown) return;
    shown = on;
    releaseAll();
    T.on = on;
    root.classList.toggle('on', on);
    if (on) layout();
  }
  function layout() {
    emPx = parseFloat(getComputedStyle(root).fontSize) || 12;
    steerR = emPx * 6.4;
    steerRest();
  }

  // Ten times a second, not per frame — this is two class toggles and one transform. It hangs off
  // the render loop AND a timer: a timer alone starves on a busy main thread, and the loop alone
  // would leave the controls stale in the seconds before the engine starts.
  let pollT = 0, lastTank = -1, lastPips = -1;
  function tick() {
    const now = performance.now();
    if (!els || now - pollT < 100) return;
    pollT = now;
    setVisible(wanted());
    if (!shown) return;

    // the ride. `ride` is the state where the driving controls would LIE — aboard, skipper at the
    // wheel — so that is exactly the state where they stand down.
    const tour = !!(RR.Tour && RR.Tour.active());
    const driving = tour && RR.Tour.driving();
    root.classList.toggle('tour', tour);
    root.classList.toggle('ride', tour && !driving);
    root.classList.toggle('driving', driving);
    if (tour) {
      if (els.wheelCap.textContent !== (driving ? 'HAND BACK' : 'TAKE THE WHEEL')) {
        els.wheelCap.textContent = driving ? 'HAND BACK' : 'TAKE THE WHEEL';
      }
      const n = IN.fTaps | 0;
      if (n !== lastPips) {
        lastPips = n;
        for (let i = 0; i < els.pips.length; i++) els.pips[i].classList.toggle('lit', i < n);
      }
    }

    const held = RR.Powerups && RR.Powerups.heldId ? RR.Powerups.heldId() : null;
    els.fire.classList.toggle('armed', !!held);
    const S = RR.Race && RR.Race.state ? RR.Race.state() : null;
    const b = S && S.player;
    if (b) {
      const e = clamp(b.boostEnergy == null ? 1 : b.boostEnergy, 0, 1);
      if (Math.abs(e - lastTank) > 0.004) { lastTank = e; els.tank.style.transform = 'scaleX(' + e.toFixed(3) + ')'; }
      // physics.js: 0.15 to light it, 0.02 to keep it lit once it is already burning
      els.thr.classList.toggle('dry', e <= ((b.boostHeat || 0) > 0.3 ? 0.02 : 0.15));
    }
  }

  // ---------------------------------------------------------------------------- init
  TC.init = function () {
    if (TC._on) return;
    IN = RR.Input;
    if (!IN || !IN.touch || !IN.hasTouch) return;      // desktop mouse users get nothing at all
    TC._on = true; TC.enabled = true;
    T = IN.touch;

    const st = document.createElement('style');
    st.id = 'rr-touch-css';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);

    root = document.createElement('div');
    root.id = 'rr-touch';
    root.innerHTML = HTML;
    document.body.appendChild(root);
    TC.el = root;

    const $ = (id) => root.querySelector('#' + id);
    els = {
      steer: $('rt-steer'), stick: $('rt-stick'), knob: $('rt-knob'),
      thr: $('rt-thr'), tank: $('rt-tank'),
      fire: $('rt-fire'), astern: $('rt-astern'), pause: $('rt-pause'),
      wheel: $('rt-wheel'), wheelCap: $('rt-wheel-cap'), about: $('rt-about'), seat: $('rt-seat'),
      pips: root.querySelectorAll('#rt-pips i'),
    };

    els.steer.addEventListener('touchstart', steerStart, { passive: false });
    els.steer.addEventListener('touchmove', steerMove, { passive: false });
    els.steer.addEventListener('touchend', steerEnd, { passive: false });
    els.steer.addEventListener('touchcancel', steerEnd, { passive: false });
    els.thr.addEventListener('touchstart', thrStart, { passive: false });
    els.thr.addEventListener('touchmove', thrMove, { passive: false });
    els.thr.addEventListener('touchend', thrEnd, { passive: false });
    els.thr.addEventListener('touchcancel', thrEnd, { passive: false });

    releaseFire = button(els.fire, () => { T.item = true; if (IN.touchFire) IN.touchFire(); },
                                   () => { T.item = false; });
    releaseAstern = button(els.astern, () => { T.lookBack = true; }, () => { T.lookBack = false; });
    releasePause = button(els.pause, pause, null);
    // the ride's three. Every one of them is a key the device does not have, dispatched as the key.
    releaseTour.push(button(els.wheel, () => key('KeyF'), null));
    releaseTour.push(button(els.about, () => key('Space'), null));
    releaseTour.push(button(els.seat, () => key('KeyC'), null));

    // A phone that locks, a call that lands, an orientation change mid-corner: every one of them
    // can swallow the touchend, and a latched throttle with nobody holding it drives into a wall.
    const drop = () => releaseAll();
    window.addEventListener('blur', drop);
    window.addEventListener('visibilitychange', drop);
    document.addEventListener('visibilitychange', drop);
    window.addEventListener('resize', () => { if (shown) layout(); });
    window.addEventListener('orientationchange', () => { releaseAll(); setTimeout(() => { if (shown) layout(); }, 260); });

    layout();
    tick();
    if (RR.Engine && RR.Engine.onUpdate) RR.Engine.onUpdate(tick);
    setInterval(tick, 250);
  };

  TC.visible = () => shown;
  RR.Touch = TC;

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', TC.init);
  else TC.init();
})();

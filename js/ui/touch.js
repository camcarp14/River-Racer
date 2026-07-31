/* River Racer — the on-screen control layer (touch devices only).

   A phone has no keyboard. What this replaces — "left half of the screen steers by finger x, right
   half is throttle" — could not boost, fire an item, brake, reverse or pause, which is to say it
   could not play the game. This is the whole mobile scheme, and it is built around one
   ergonomic fact: THROTTLE AND BOOST ARE BOTH HOLDS. So they share a single column under the right
   thumb — slide up out of GO into BOOST and the throttle never lifts.

   Landscape layout (the racing orientation) — THREE shapes, and the shape is the label:
     left   — steer zone: the whole bottom-left corner is the hit area, but the WIDGET IS NAILED
              DOWN. One fixed tiller, and steer is the thumb's displacement about its fixed
              centre. (It used to anchor wherever the thumb landed and then slide that anchor at
              full lock. Two mechanisms, both of which made the wheel wander around the screen
              while you were driving. A wheel that moves is not a wheel.)
     right  — throttle column, one rounded plate: BOOST / GO / REV, top to bottom. One thumb, no
              lift, and the gold hairline under BOOST is the tank, so "why is nothing happening"
              has an answer.
     inboard — FIRE, a disc, gold the moment you are holding something; and above it, well clear,
              a small PAUSE disc, which dispatches ESC so main.js's one pause path stays the
              only pause path.

   What is NOT here, deliberately: an ASTERN button. Look-astern is a hold worth a dedicated
   sixth control on a keyboard, where controls are free; on a phone it was a 7.6x4em plate in the
   most valuable real estate on the screen for a thing a racing player presses approximately
   never. B/Q and gamepad LB still drive RR.Input.lookBack — touch simply no longer offers it.
   No gesture stands in for it either: every candidate (double-tap-hold in the steer zone, a
   second finger in the throttle column, a swipe past REV) collides with something you do while
   driving, and a camera that spins round on its own mid-corner is worse than not having it.

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
   brief here is still "do not obscure the river", and these are small panels at the two edges.
   ONE weight for every surface — plate, hairline ring, soft drop — and the RADIUS carries the
   difference, because the shape is what your thumb reads without looking: the throttle is a
   rounded column, FIRE is a disc, PAUSE is a small disc. Four squares in a corner told you
   nothing until you read them.
   No border-radius HERE, deliberately. The selector #rr-touch .rt-panel scores 1-1-0 and every
   one of the controls below is a bare id at 1-0-0, so a radius on the shared class silently
   outranks all three of them and the discs come out as rounded squares. Each shape declares its
   own. (Backticks are also banned in this comment: the whole block is a template literal.) */
#rr-touch .rt-panel{background:rgba(4,18,27,.60);
  box-shadow:inset 0 0 0 2px rgba(126,200,227,.34),0 .3em 1.2em rgba(0,0,0,.45)}
#rr-touch .rt-cap{font-size:.62em;letter-spacing:.26em;text-indent:.26em;color:rgba(234,246,255,.82);
  text-shadow:0 1px 3px rgba(0,0,0,.95),0 0 .5em rgba(0,0,0,.7)}

/* ------------------------------------------------------------------------ steering */
/* The ZONE is the hit area — the whole bottom-left corner, invisible, so a thumb that lands
   nowhere near the tiller still steers on the frame it lands. The WIDGET inside it does not
   move: steerRest() places #rt-stick once per layout and nothing during a drag ever writes that
   transform again. Only #rt-knob moves, and only inside the track. */
#rt-steer{left:var(--sl);bottom:var(--sb);width:min(46%,30em);height:min(62%,21em)}
/* a zero-size anchor: JS places it by transform alone, so layout is never touched */
#rt-stick{position:absolute;left:0;top:0;width:0;height:0;opacity:.5;transition:opacity 160ms linear}
#rt-steer.act #rt-stick{opacity:1}
/* --rt-r is steerR in px, published by layout(). CSS and JS have to agree on the throw or the
   knob lies about where full lock is — so there is exactly one number and JS owns it. */
#rt-track{position:absolute;left:calc(-1 * (var(--rt-r,72px) + 1.7em));top:-1.7em;
  width:calc(2 * var(--rt-r,72px) + 3.4em);height:3.4em;border-radius:1.7em;
  background:rgba(4,18,27,.58);box-shadow:inset 0 0 0 2px rgba(126,200,227,.30)}
#rt-track i{position:absolute;left:50%;top:.95em;width:2px;height:1.5em;margin-left:-1px;
  background:rgba(126,200,227,.42)}
#rt-track b{position:absolute;top:50%;transform:translateY(-50%);font-size:.8em;line-height:1;
  color:rgba(126,200,227,.55)}
#rt-track b:first-child{left:.9em}
#rt-track b:last-child{right:.9em}
#rt-knob{position:absolute;left:-1.45em;top:-1.45em;width:2.9em;height:2.9em;border-radius:50%;
  background:rgba(6,22,34,.78);box-shadow:inset 0 0 0 2px var(--chi-blue,#7EC8E3),0 .2em .9em rgba(0,0,0,.5)}
#rt-lab{position:absolute;left:-5em;top:2.45em;width:10em;text-align:center;
  transition:opacity 420ms linear}
/* the caption is scaffolding. It answers "where is the wheel" once — and now that the wheel is
   always in the same place, once is all it can answer. One drag retires it for the session. */
#rr-touch.steered #rt-lab{opacity:0}

/* ------------------------------------------------------------ throttle / boost / rev */
/* ONE plate with three bands in it, not three plates. Each band still clears 44px on its short
   side at every device font size: 19em x {30,41,29}% is 64/88/62px on a 14 and 51/70/50px in the
   worst case (portrait, where the em bottoms out at 9px). */
#rt-thr{right:calc(var(--sr) + .9em);bottom:calc(var(--sb) + .9em);width:8.6em;height:19em;
  border-radius:1.25em;overflow:hidden;display:flex;flex-direction:column;opacity:.94;
  transition:opacity 160ms linear}
#rt-thr.g,#rt-thr.r{opacity:1}
.rt-band{position:relative;display:flex;align-items:center;justify-content:center;
  box-shadow:inset 0 -1px 0 rgba(126,200,227,.20)}
#rt-boost{height:30%}
#rt-go{height:41%}
#rt-rev{height:29%;box-shadow:none}
/* the tank, as a hairline: BOOST is the one control that can be pressed and do nothing */
#rt-tank{position:absolute;left:0;bottom:0;width:100%;height:3px;transform-origin:0 50%;
  background:var(--gold,#FFC857);opacity:.62}
#rt-thr.dry #rt-tank{background:var(--chi-red,#EF3340)}
#rt-thr.dry #rt-boost .rt-cap{color:rgba(234,246,255,.30)}
/* pressed = the band FILLS. The white inner rings this used to draw were three more rectangles
   inside a shape whose entire point is that it is one shape; the fill and the white caption are
   already unmistakable, and BOOST keeps a warm inner glow because it is the one that pays. */
#rt-thr.b #rt-boost{background:rgba(255,200,87,.34);
  box-shadow:inset 0 0 1.8em -.5em rgba(255,200,87,.95)}
#rt-thr.g #rt-go{background:rgba(0,105,62,.62)}
#rt-thr.r #rt-rev{background:rgba(239,51,64,.55)}
#rt-thr.b #rt-boost .rt-cap,#rt-thr.g #rt-go .rt-cap,#rt-thr.r #rt-rev .rt-cap{color:#fff}

/* --------------------------------------------------------------------- fire / pause */
/* A DISC, and inboard of the column at the same baseline: round says "not the throttle" before
   you have read a word of it, and the thumb that is holding GO reaches it by sliding straight
   inboard. min-width/min-height alongside the em size on both discs — the surface is scaled off
   the SHORT axis so it tracks the screen, and on an SE that put the old PAUSE plate at 37px,
   under the 44px floor everything else here holds to. The floor wins where the em is small and
   costs nothing where it is not. */
#rt-fire{right:calc(var(--sr) + 11.4em);bottom:calc(var(--sb) + .9em);width:6.6em;height:6.6em;
  min-width:44px;min-height:44px;border-radius:50%;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.35em}
/* the hexagram is uikit's, but this one carries its own clip-path: the FIRE icon is the one place
   in the game where a missing stylesheet would leave a plain grey square on the control surface */
#rt-fire .star6{width:2.5em;height:2.5em;background:rgba(159,195,214,.5);
  clip-path:polygon(50% 0%,64.43% 25%,93.30% 25%,78.87% 50%,93.30% 75%,64.43% 75%,
                    50% 100%,35.57% 75%,6.70% 75%,21.13% 50%,6.70% 25%,35.57% 25%)}
#rt-fire.armed{box-shadow:inset 0 0 0 2px var(--gold,#FFC857),0 0 1.4em -.25em rgba(255,200,87,.8),
  0 .3em 1.2em rgba(0,0,0,.45)}
#rt-fire.armed .star6{background:var(--gold,#FFC857)}
#rt-fire.armed .rt-cap{color:var(--gold,#FFC857)}
#rt-fire.act{background:rgba(255,200,87,.45)}
#rt-fire.act .rt-cap{color:#fff}
/* PAUSE rides the right-hand side rather than the top corner: the top of a phone screen is where
   the HUD lives on every layout it will ever have, and a control that lands on top of the lap
   blade at one font size lands on top of the timer at the next. Small, because it is pressed
   once a race; centred over FIRE, because a column of two centres reads as one object; and
   2.6em clear of it, because an overshoot reaching for FIRE must not stop the race. */
#rt-pause{right:calc(var(--sr) + 12.7em);bottom:calc(var(--sb) + 10.1em);width:4em;height:4em;
  min-width:44px;min-height:44px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;gap:.42em;opacity:.72}
#rt-pause i{width:.4em;height:1.4em;border-radius:1px;background:var(--chi-blue,#7EC8E3)}
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
/* PAUSE is the one control that must survive the ride (a phone has no ESC and the tour is a place
   you have to be able to leave), so it drops into the corner the throttle column just vacated.
   That also takes it off the rail's baseline: on an SE the rail is wide enough that a PAUSE disc
   sitting at 10.1em on the right would have been 6px from it. */
#rr-touch.ride #rt-pause{right:calc(var(--sr) + .9em);bottom:calc(var(--sb) + .9em)}
/* ABOVE the item socket, not beside it: the bottom-centre strip is the one piece of the bottom edge
   no thumb covers, which is exactly why the item slot is already there. Measured at .9em the rail
   overlapped the socket 38%; 9.2em clears it, and with PAUSE gone to the corner during the ride
   nothing else is competing for that line. */
#rt-tour{position:absolute;left:50%;bottom:calc(var(--sb) + 9.2em);transform:translateX(-50%);
  display:none;align-items:flex-end;gap:.7em;pointer-events:none}
#rr-touch.tour #rt-tour{display:flex}
.rt-tb{position:relative;pointer-events:auto;touch-action:none;-webkit-tap-highlight-color:transparent;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.45em;
  border-radius:.55em;min-height:44px;padding:.75em 1.05em}
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
        '<div id="rt-track"><b>◀</b><i></i><b>▶</b></div>' +
        '<div id="rt-knob"></div>' +
        '<div id="rt-lab" class="rt-cap">STEER</div>' +
      '</div>' +
    '</div>' +
    '<div id="rt-thr" class="rt-hit rt-panel">' +
      '<div class="rt-band" id="rt-boost"><span class="rt-cap">BOOST</span><u id="rt-tank"></u></div>' +
      '<div class="rt-band" id="rt-go"><span class="rt-cap">GO</span></div>' +
      '<div class="rt-band" id="rt-rev"><span class="rt-cap">REV</span></div>' +
    '</div>' +
    '<div id="rt-fire" class="rt-hit rt-panel"><i class="star6"></i><span class="rt-cap">FIRE</span></div>' +
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
  // pivotOk is "has the tiller's centre ever been measured against a zone that was actually on
  // screen" — see steerRest. Without it the very first measurement, which happens while the whole
  // overlay is still display:none, would be trusted forever.
  let shown = false, emPx = 12, steerR = 72, pivotX = 0, pivotOk = false, learned = false;
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
  let steerId = null;

  // The ONLY writer of #rt-stick's transform, and it is called from layout() alone — never from a
  // touch handler. That is the whole fix: a resize or a rotation may move the tiller, a drag may
  // not. pivotX is the fixed centre in CLIENT coordinates; steer is measured from it, and it is
  // the one piece of steering state that survives a drag.
  //  x: 10.4em in from the zone's left edge, which puts full lock left at 3.2em — clear of the
  //     screen edge, where iOS keeps its own swipes.
  //  y: 5.6em up from the bottom, which is where a left thumb pivoting out of the corner sits.
  //     Vertical is presentation only: the tiller is a horizontal axis and applySteer ignores y.
  function steerRest() {
    const r = els.steer.getBoundingClientRect();
    // A HIDDEN ZONE HAS NO GEOMETRY, and measuring one anyway is how the tiller loses its centre.
    // `#rr-touch.ride #rt-steer{display:none}` is the Architecture Tour's passenger state, and it
    // holds while the overlay itself is up — so a resize there (iPad Split View, fullscreen enter
    // or exit, an iOS viewport change) lands in here with an all-zero rect. pivotX would become 0,
    // which is off the left edge of the screen, and applySteer's `x - pivotX` is then POSITIVE for
    // every touch the hardware can produce: starboard lock everywhere, port lock unreachable. It
    // survives the handover because nothing recomputes the pivot when the zone comes back.
    // Keeping the last good pivot is right rather than merely safe — the zone's box has not
    // changed, only its visibility, so the previous measurement is still the true one.
    if (!r.width) return;
    pivotOk = true;
    pivotX = r.left + Math.min(r.width * 0.5, emPx * 10.4);
    const pivotY = r.top + Math.max(r.height * 0.5, r.height - emPx * 5.6);
    els.stick.style.transform =
      'translate(' + (pivotX - r.left).toFixed(1) + 'px,' + (pivotY - r.top).toFixed(1) + 'px)';
    els.knob.style.transform = 'translateX(0px)';
  }
  // Dead zone, then a mild expo: the first two millimetres of thumb travel are noise, and the
  // hundredth of steer either side of centre is where a boat at 80 mph is actually driven.
  // Displacement about the FIXED centre, clamped — the old version moved the centre to meet the
  // thumb once the clamp bit, which is what made the widget crawl across the screen at full lock.
  // The throw grew from 6.4em to 7.2em to pay for the anchor that no longer follows you out.
  function applySteer(x) {
    const dx = clamp(x - pivotX, -steerR, steerR);
    const dead = steerR * 0.10, span = steerR - dead;
    let v = 0;
    if (dx > dead) v = (dx - dead) / span;
    else if (dx < -dead) v = (dx + dead) / span;
    T.steer = v < 0 ? -Math.pow(-v, 1.3) : Math.pow(v, 1.3);
    els.knob.style.transform = 'translateX(' + dx.toFixed(1) + 'px)';
  }
  function steerStart(e) {
    if (steerId === null && e.changedTouches.length) {
      // last line of defence: never steer from a centre that was never measured on a visible zone
      if (!pivotOk) layout();
      const t = e.changedTouches[0];
      steerId = t.identifier;
      els.steer.classList.add('act');
      if (!learned) { learned = true; root.classList.add('steered'); }
      applySteer(t.clientX);
    }
    stop(e);
  }
  function steerMove(e) {
    if (steerId !== null) {
      const t = findTouch(e.changedTouches, steerId);
      if (t) applySteer(t.clientX);
    }
    stop(e);
  }
  function steerEnd(e) {
    if (steerId !== null && findTouch(e.changedTouches, steerId)) releaseSteer();
    stop(e);
  }
  // Centres the knob without re-reading the zone: releasing must not be a chance to relocate.
  function releaseSteer() {
    steerId = null; T.steer = 0;
    els.steer.classList.remove('act');
    els.knob.style.transform = 'translateX(0px)';
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

  let releaseFire = null, releasePause = null;
  const releaseTour = [];
  function releaseAll() {
    if (!els) return;
    releaseSteer(); releaseThr();
    if (releaseFire) releaseFire();
    if (releasePause) releasePause();
    for (const r of releaseTour) r();
    // lookBack has no on-screen control any more, but input.js still ORs T.lookBack into the
    // camera every frame — so this keeps clearing it. A field that can only ever be false is
    // cheaper to keep honest than to prove nobody will ever set it again.
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
    steerR = emPx * 7.2;
    // one number, owned here: the track sizes itself off it so the knob cannot lie about lock
    root.style.setProperty('--rt-r', steerR.toFixed(1) + 'px');
    steerRest();
  }

  // Ten times a second, not per frame — this is two class toggles and one transform. It hangs off
  // the render loop AND a timer: a timer alone starves on a busy main thread, and the loop alone
  // would leave the controls stale in the seconds before the engine starts.
  let pollT = 0, lastTank = -1, lastPips = -1, wasRiding = false;
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
    const riding = tour && !driving;
    root.classList.toggle('ride', riding);
    root.classList.toggle('driving', driving);
    // The steer zone is display:none while the skipper has the wheel, so it has no geometry to be
    // measured from — and a resize during the ride changes the box it will come back at. Re-measure
    // on the way back to driving, which is the first frame the zone is real again.
    if (riding !== wasRiding) { wasRiding = riding; if (!riding) layout(); }
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
      fire: $('rt-fire'), pause: $('rt-pause'),
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

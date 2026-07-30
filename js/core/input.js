/* River Racer — keyboard / gamepad / touch input

   THE WHOLE KEY MAP lives here in one list, because it is documented in three places on screen
   (hud.js's key wall, and HOW TO PLAY + the pause legend in menus.js) and a binding nobody wrote
   down is a binding nobody finds. Add a key, add it to all four.

     W/↑ throttle · S/↓ brake+reverse · A·D/←·→ steer · SHIFT boost   (this file)
     E or SPACE fire item        (polled by powerups.js through I.pressed)
     B or Q look astern          (this file → camera.js)
     (touch: every one of those is on screen instead — ui/touch.js writes I.touch)
     [ ] cinematic shot          (this file → camera.js)
     F ×5 take the wheel         (this file → main.js, Architecture Tour only)
     C camera · N time of day · G green river · P photo · R reset · SPACE docent · ESC pause  (main.js)
     M sound · I power-ups       (menus.js; I only answers on the title and pause screens)
     ↑↓ ←→ select · ENTER confirm · BKSP back                          (menus.js)

   Gamepad: left stick steer · RT throttle · LT brake · A throttle · X boost · B fire item ·
   LB look astern · right stick free look (tour) · stick click re-centres. */
(function () {
  const I = { throttle: 0, brake: 0, steer: 0, boost: false, lookBack: false, lookX: 0, lookY: 0, lookDX: 0, lookDY: 0, lookCenter: false, raw: {} };
  const keys = {};

  // ---- the F chord ----------------------------------------------------------------------------
  // Five taps of F in a row is the Architecture Tour's "hand me the wheel". A key REPEAT is not a
  // tap (hold F down and nothing happens), and the window between taps is short enough that you
  // have to mean it — but every tap reports its count, so the game can tell you how far along you
  // are and the thing is findable instead of secret.
  I.F_TAPS = 5;
  I.F_WINDOW = 1.2;                  // seconds allowed between taps
  I.fTaps = 0;
  let fLastT = -99;

  // Vestigial: the salute was retired, but salute.js polls this counter and a missing member reads
  // as "a press arrived" on the very first frame. It stays at zero and nothing increments it.
  I.saluteCount = 0;
  I.salute = function () { if (I.onSalute) I.onSalute(); };

  window.addEventListener('keydown', (e) => {
    const held = keys[e.code];
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    // [ / ] cycle the cinematic shot rig. Guarded: camera.js may not have the rig yet.
    if ((e.code === 'BracketLeft' || e.code === 'BracketRight') && RR.Camera && RR.Camera.cycleShot) {
      RR.Camera.cycleShot(e.code === 'BracketLeft' ? -1 : 1);
    }
    if (e.code === 'KeyF' && !e.repeat && !held) {
      const now = performance.now() / 1000;
      I.fTaps = now - fLastT > I.F_WINDOW ? 1 : I.fTaps + 1;
      fLastT = now;
      if (I.onFTap) I.onFTap(I.fTaps, I.F_TAPS);
      if (I.fTaps >= I.F_TAPS) {
        I.fTaps = 0; fLastT = -99;
        if (I.onFiveF) I.onFiveF();
      }
    }
    if (I.onKey) I.onKey(e.code);
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  // ---- touch ----------------------------------------------------------------------------------
  // What used to live here was "left half of the screen steers by finger x, right half is
  // throttle": no boost, no item, no brake, no pause — a scheme you could not finish a race with.
  // The controls are ui/touch.js's now, because the hit zones ARE the widgets and only the widgets
  // know where they are. This file still owns what they MEAN. touch.js writes these fields and
  // nothing else; with the overlay absent .on stays false and every merge below is skipped, so a
  // build without it is exactly the keyboard game.
  const T = { on: false, steer: 0, throttle: 0, brake: 0, boost: false, lookBack: false, item: false };
  I.touch = T;

  // Is the PRIMARY pointer a finger? Not "does a digitizer exist" — a touchscreen laptop answers
  // yes to that and its owner is holding a mouse. hud.js and touch.js both key off this.
  I.hasTouch = (function () {
    const mm = (q) => !!(window.matchMedia && window.matchMedia(q).matches);
    const digitizer = (navigator.maxTouchPoints | 0) > 0 || 'ontouchstart' in window;
    return digitizer && (mm('(pointer: coarse)') || !mm('(pointer: fine)'));
  })();

  // A pad had no item button at all, which with power-ups shipping ON meant a pad player could not
  // play the default game. powerups.js polls I.pressed('KeyE'), so B/circle answers there — and so
  // does the on-screen FIRE button. The routing lives with the other bindings instead of teaching
  // another module about gamepads and touch.
  // The latch is for the tap: powerups.js polls on the rising edge of its own frame, and a thumb
  // can be down and up again between two of those polls.
  I.padItem = false;
  let fireLatch = 0;
  I.touchFire = function () { fireLatch = 2; };
  I.pressed = (code) => !!keys[code] || ((I.padItem || T.item || fireLatch > 0) && code === 'KeyE');

  // ---- free look: drag the world with the pointer -----------------------------------------
  // Only the Architecture Tour's seats read this (RR.Camera.seat), so a drag anywhere else is
  // harmless — but a drag that STARTS on a menu or the HUD belongs to the UI, not to the lens.
  let dragging = false, mdx = 0, mdy = 0, lastMX = 0, lastMY = 0;
  const onUI = (t) => !!(t && t.closest && t.closest('#menu, #hud, #loading, button, a, input, select'));
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || onUI(e.target)) return;
    dragging = true; lastMX = e.clientX; lastMY = e.clientY;
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    mdx += e.clientX - lastMX; mdy += e.clientY - lastMY;
    lastMX = e.clientX; lastMY = e.clientY;
  });
  const endDrag = () => { dragging = false; };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  window.addEventListener('blur', endDrag);

  I.update = function (dt) {
    let th = 0, br = 0, st = 0, bo = false;
    if (keys.KeyW || keys.ArrowUp) th = 1;
    if (keys.KeyS || keys.ArrowDown) br = 1;
    // Sign: heading increases COUNTER-clockwise in this world (forward = sin/cos of heading), so a
    // positive yaw command turns the boat to PORT — which is the convention ai.js writes and
    // physics.js integrates. The right-hand key therefore has to ask for a NEGATIVE steer. It was
    // wired the other way round, which is to say the wheel was backwards: measured on a frozen
    // camera, holding D walked the hull left across the frame.
    if (keys.KeyA || keys.ArrowLeft) st += 1;
    if (keys.KeyD || keys.ArrowRight) st -= 1;
    bo = !!(keys.ShiftLeft || keys.ShiftRight);
    // LOOK BACK: hold it and the whole chase rig swings round onto the bow to look astern.
    let lb = !!(keys.KeyB || keys.KeyQ);

    let lx = 0, ly = 0, recentre = false, padFire = false;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const ax = p.axes[0] || 0;
      if (Math.abs(ax) > 0.12) st = RR.U.clamp(st - ax, -1, 1);
      const rt = p.buttons[7] ? p.buttons[7].value : 0;
      const lt = p.buttons[6] ? p.buttons[6].value : 0;
      if (rt > 0.05) th = Math.max(th, rt);
      if (lt > 0.05) br = Math.max(br, lt);
      if (p.buttons[0] && p.buttons[0].pressed) th = 1;
      if (p.buttons[1] && p.buttons[1].pressed) padFire = true;       // B / circle: fire your item
      if (p.buttons[2] && p.buttons[2].pressed) bo = true;
      if (p.buttons[4] && p.buttons[4].pressed) lb = true;            // LB / L1: look astern
      // right stick is the passenger's head on the Architecture Tour
      const rx = p.axes[2] || 0, ry = p.axes[3] || 0;
      if (Math.abs(rx) > 0.14) lx = rx;                               // stick right = look right
      if (Math.abs(ry) > 0.14) ly = -ry;                              // stick up (negative) = look up
      if (p.buttons[10] && p.buttons[10].pressed) recentre = true;    // stick click: eyes front
      break;
    }

    // The thumbs, merged the same way the pad is: they RAISE a command, never lower one, so a pad
    // and a finger on the same boat cannot fight each other.
    if (T.on) {
      if (T.throttle > 0) th = Math.max(th, T.throttle);
      if (T.brake > 0) br = Math.max(br, T.brake);
      if (T.steer !== 0) st = RR.U.clamp(st - T.steer, -1, 1);   // +T.steer = screen right = starboard
      if (T.boost) bo = true;
      if (T.lookBack) lb = true;
    }
    if (fireLatch > 0) fireLatch--;

    // analog feel on digital keys
    const rate = 6.5;
    I.throttle = RR.U.damp(I.throttle, th, rate, dt);
    I.brake = RR.U.damp(I.brake, br, rate, dt);
    // A key is a switch and needs the ramp. A thumb on a stick is ALREADY an analog signal, and
    // 0.18 s of extra smoothing on top of it is the difference between steering the boat and
    // asking it politely — so a live stick gets the fast approach the keys can't have.
    const touching = T.on && T.steer !== 0;
    I.steer = RR.U.damp(I.steer, st, touching ? 9 : st === 0 ? 9 : 5.5, dt);
    I.boost = bo;
    I.lookBack = lb;
    I.padItem = padFire;
    I.lookX = lx; I.lookY = ly; I.lookCenter = recentre;
    // publish one frame's drag, capped: sitting on the menu for a minute must not bank up a whip
    I.lookDX = RR.U.clamp(mdx, -140, 140); I.lookDY = RR.U.clamp(mdy, -140, 140);
    mdx = 0; mdy = 0;
  };

  RR.Input = I;
})();

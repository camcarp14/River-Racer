/* River Racer — keyboard / gamepad / touch input */
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

  I.pressed = (code) => !!keys[code];

  // touch: left half steers by horizontal position, right half is throttle
  let touchSteer = 0, touchThrottle = 0;
  const touches = new Map();
  function readTouches() {
    touchSteer = 0; touchThrottle = 0;
    touches.forEach((t) => {
      if (t.x < window.innerWidth * 0.5) touchSteer = RR.U.clamp((t.x / (window.innerWidth * 0.25)) - 1, -1, 1);
      else touchThrottle = 1;
    });
  }
  window.addEventListener('touchstart', (e) => { for (const t of e.changedTouches) touches.set(t.identifier, { x: t.clientX, y: t.clientY }); readTouches(); }, { passive: true });
  window.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) { const o = touches.get(t.identifier); if (o) { o.x = t.clientX; o.y = t.clientY; } } readTouches(); }, { passive: true });
  window.addEventListener('touchend', (e) => { for (const t of e.changedTouches) touches.delete(t.identifier); readTouches(); }, { passive: true });
  window.addEventListener('touchcancel', (e) => { for (const t of e.changedTouches) touches.delete(t.identifier); readTouches(); }, { passive: true });

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

    let lx = 0, ly = 0, recentre = false;
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
      if (p.buttons[2] && p.buttons[2].pressed) bo = true;
      if (p.buttons[4] && p.buttons[4].pressed) lb = true;            // LB / L1: look astern
      // right stick is the passenger's head on the Architecture Tour
      const rx = p.axes[2] || 0, ry = p.axes[3] || 0;
      if (Math.abs(rx) > 0.14) lx = rx;                               // stick right = look right
      if (Math.abs(ry) > 0.14) ly = -ry;                              // stick up (negative) = look up
      if (p.buttons[10] && p.buttons[10].pressed) recentre = true;    // stick click: eyes front
      break;
    }

    if (touchThrottle > 0) th = Math.max(th, touchThrottle);
    if (touchSteer !== 0) st = RR.U.clamp(st - touchSteer, -1, 1);

    // analog feel on digital keys
    const rate = 6.5;
    I.throttle = RR.U.damp(I.throttle, th, rate, dt);
    I.brake = RR.U.damp(I.brake, br, rate, dt);
    I.steer = RR.U.damp(I.steer, st, st === 0 ? 9 : 5.5, dt);
    I.boost = bo;
    I.lookBack = lb;
    I.lookX = lx; I.lookY = ly; I.lookCenter = recentre;
    // publish one frame's drag, capped: sitting on the menu for a minute must not bank up a whip
    I.lookDX = RR.U.clamp(mdx, -140, 140); I.lookDY = RR.U.clamp(mdy, -140, 140);
    mdx = 0; mdy = 0;
  };

  RR.Input = I;
})();

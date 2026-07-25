/* River Racer — keyboard / gamepad / touch input */
(function () {
  const I = { throttle: 0, brake: 0, steer: 0, boost: false, raw: {} };
  const keys = {};

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    // [ / ] cycle the cinematic shot rig. Guarded: camera.js may not have the rig yet.
    if ((e.code === 'BracketLeft' || e.code === 'BracketRight') && RR.Camera && RR.Camera.cycleShot) {
      RR.Camera.cycleShot(e.code === 'BracketLeft' ? -1 : 1);
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

  I.update = function (dt) {
    let th = 0, br = 0, st = 0, bo = false;
    if (keys.KeyW || keys.ArrowUp) th = 1;
    if (keys.KeyS || keys.ArrowDown) br = 1;
    if (keys.KeyA || keys.ArrowLeft) st -= 1;
    if (keys.KeyD || keys.ArrowRight) st += 1;
    bo = !!(keys.ShiftLeft || keys.ShiftRight);

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const ax = p.axes[0] || 0;
      if (Math.abs(ax) > 0.12) st = RR.U.clamp(st + ax, -1, 1);
      const rt = p.buttons[7] ? p.buttons[7].value : 0;
      const lt = p.buttons[6] ? p.buttons[6].value : 0;
      if (rt > 0.05) th = Math.max(th, rt);
      if (lt > 0.05) br = Math.max(br, lt);
      if (p.buttons[0] && p.buttons[0].pressed) th = 1;
      if (p.buttons[2] && p.buttons[2].pressed) bo = true;
      break;
    }

    if (touchThrottle > 0) th = Math.max(th, touchThrottle);
    if (touchSteer !== 0) st = RR.U.clamp(st + touchSteer, -1, 1);

    // analog feel on digital keys
    const rate = 6.5;
    I.throttle = RR.U.damp(I.throttle, th, rate, dt);
    I.brake = RR.U.damp(I.brake, br, rate, dt);
    I.steer = RR.U.damp(I.steer, st, st === 0 ? 9 : 5.5, dt);
    I.boost = bo;
  };

  RR.Input = I;
})();

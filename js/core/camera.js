/* River Racer — chase camera with lag, banking, hull cam, and attract-mode flythrough */
(function () {
  const C = {};
  const U = () => RR.U;
  let mode = 0;                 // 0 chase, 1 close, 2 hood/hull
  const MODES = [
    { back: 16.5, up: 6.2, lookUp: 1.6, fov: 62, stiff: 4.2 },
    { back: 9.5, up: 3.4, lookUp: 1.3, fov: 66, stiff: 6.0 },
    { back: -0.6, up: 1.55, lookUp: 1.1, fov: 74, stiff: 22 },
  ];
  const pos = new THREE.Vector3(0, 30, 60);
  const look = new THREE.Vector3();
  let shake = 0;

  C.cycle = function () { mode = (mode + 1) % MODES.length; };
  C.kick = function (amount) { shake = Math.min(1.4, shake + amount); };
  C.setMode = function (m) { mode = m; };

  C.snapTo = function (boat) {
    const m = MODES[mode];
    const s = Math.sin(boat.heading), c = Math.cos(boat.heading);
    pos.set(boat.pos.x - s * m.back, boat.pos.y + m.up, boat.pos.z - c * m.back);
  };

  C.follow = function (boat, dt) {
    const cam = RR.Engine.camera;
    const m = MODES[mode];
    const s = Math.sin(boat.heading), c = Math.cos(boat.heading);
    // pull back a touch with speed for a sense of velocity
    const spd = Math.hypot(boat.vel.x, boat.vel.z);
    const back = m.back + spd * 0.10;
    const up = m.up + spd * 0.02;

    const tx = boat.pos.x - s * back;
    const tz = boat.pos.z - c * back;
    let ty = boat.pos.y + up;
    // duck under bridge decks so the span never cuts across the view —
    // unless the boat is jumping OVER the bridge, in which case the camera flies with it
    if (RR.Bridges && RR.Bridges.duckY) {
      const deckA = RR.Bridges.duckY(tx, tz), deckB = RR.Bridges.duckY(boat.pos.x, boat.pos.z);
      const deck = Math.min(deckA, deckB);
      if (isFinite(deck) && boat.pos.y < deck - 1.5) ty = Math.min(ty, deck - 1.4);
    }
    const k = 1 - Math.exp(-m.stiff * dt);
    pos.x += (tx - pos.x) * k;
    pos.z += (tz - pos.z) * k;
    pos.y += (ty - pos.y) * (1 - Math.exp(-(m.stiff + 3) * dt));

    // never sink the camera under the waves
    const wh = U().waterHeight(pos.x, pos.z, RR.Engine.time(), 1) + 0.9;
    if (pos.y < wh) pos.y = wh;

    look.set(boat.pos.x + s * 10, boat.pos.y + m.lookUp, boat.pos.z + c * 10);

    if (shake > 0.003) {
      const t = performance.now() * 0.045;
      pos.x += Math.sin(t * 1.7) * shake * 0.5;
      pos.y += Math.sin(t * 2.3 + 1) * shake * 0.35;
      look.x += Math.sin(t * 2.9 + 2) * shake * 0.7;
      shake *= Math.exp(-4.5 * dt);
    }

    cam.position.copy(pos);
    cam.lookAt(look);
    // subtle roll with the boat lean
    cam.rotation.z += boat.visRoll * (mode === 2 ? 0.55 : 0.16);
    const fovT = m.fov + spd * 0.16 + boat.boostHeat * 10;   // boost = a real FOV punch
    if (Math.abs(cam.fov - fovT) > 0.05) { cam.fov += (fovT - cam.fov) * Math.min(1, 3 * dt); cam.updateProjectionMatrix(); }
  };

  // menu background: drift down the Main Stem canyon
  let flyD = 400;
  C.flyover = function (dt, path) {
    const cam = RR.Engine.camera;
    flyD += dt * 26;
    if (flyD > path.len - 260) flyD = 150;
    const a = U().pathAt(path, flyD, C._fa || (C._fa = {}));
    const b = U().pathAt(path, flyD + 190, C._fb || (C._fb = {}));
    const t = RR.Engine.time();
    const y = 16 + Math.sin(t * 0.11) * 7;
    const side = Math.sin(t * 0.07) * a.w * 0.5;
    cam.position.set(a.x - a.tz * side, y, a.z + a.tx * side);
    cam.lookAt(b.x, 6 + Math.sin(t * 0.13) * 4, b.z);
    if (cam.fov !== 58) { cam.fov = 58; cam.updateProjectionMatrix(); }
  };

  RR.Camera = C;
})();

/* River Racer — opponent pilots: racing-line following with personality + rubber-band */
(function () {
  const A = {};
  const U = () => RR.U;

  const NAMES = ['“Wacker” Wade', 'Lou Canal', 'Stella Skyline', 'Deep Dish Dre', 'Goose Island Gus', 'El Tracks Elena', 'Marina Mae', 'Bridgeport Bo'];

  A.createPilot = function (boat, route, idx, difficulty) {
    const d = difficulty == null ? 1 : difficulty;    // 0.7 rookie · 1.0 skipper · 1.3 legend
    return {
      boat, route, diff: d,
      name: NAMES[idx % NAMES.length],
      lane: ((idx % 4) - 1.5) * 0.42,            // preferred offset across the channel (-1..1 of half width)
      skill: 0.60 + d * 0.24 + (idx * 0.37 % 1) * 0.12,
      aggression: 0.15 + d * 0.35 + (idx * 0.61 % 1) * 0.3,
      wobbleSeed: idx * 13.7,
      ctl: { throttle: 0, brake: 0, steer: 0, boost: false },
      stuckTimer: 0,
      boostTimer: 2 + idx * 1.7,
    };
  };

  const pt = {}, ptFar = {};
  A.update = function (pilot, dt, t, playerProgress) {
    const b = pilot.boat;
    const route = pilot.route;
    const speed = Math.hypot(b.vel.x, b.vel.z);
    b.bumpRecover = Math.max(0, (b.bumpRecover || 0) - dt);   // rattled for a beat after a hard bump

    // progress along route (race.js keeps b.routeD updated); loops wrap the lookahead
    const look = 16 + speed * 1.15;
    const path = route.path;
    const wrap = (d) => path.loop ? ((d % path.len) + path.len) % path.len : d;
    U().pathAt(path, wrap(b.routeD + look), pt);
    U().pathAt(path, wrap(b.routeD + look * 2.4), ptFar);

    // corner anticipation: angle between near and far tangents
    const bend = Math.abs(U().wrapAngle(Math.atan2(ptFar.tx, ptFar.tz) - Math.atan2(pt.tx, pt.tz)));

    // steer toward lookahead point offset into our lane, with a lazy sine wobble.
    // Better pilots wobble less and correct harder — legends hold a surgical line.
    const wobble = Math.sin(t * 0.6 + pilot.wobbleSeed) * (0.205 - pilot.diff * 0.06);
    const laneOff = (pilot.lane + wobble) * Math.max(4, pt.w - 8);
    const tx = pt.x - pt.tz * laneOff;
    const tz = pt.z + pt.tx * laneOff;
    const desired = Math.atan2(tx - b.pos.x, tz - b.pos.z);
    let err = U().wrapAngle(desired - b.heading);
    pilot.ctl.steer = U().clamp(err * (1.9 + pilot.diff * 0.5), -1, 1);

    // throttle: full unless a bend looms; brake hard only for hairpins
    let th = 1;
    if (bend > 0.35) th = U().lerp(1, 0.45, U().smoothstep(0.35, 1.1, bend));
    if (Math.abs(err) > 1.1) th = 0.35;
    pilot.ctl.brake = bend > 0.95 && speed > b.spec.top * 0.75 ? 0.6 : 0;

    // rubber-band: trail the player → run hotter; lead big → ease off.
    // Difficulty shapes both: legends barely rubber-band and never coast on a lead.
    const gap = playerProgress - b.routeD;                    // >0 means player ahead
    const rubber = U().clamp(gap / 420, -1, 1);
    th *= pilot.skill + rubber * (0.05 + pilot.diff * 0.08);
    if (rubber < 0) th *= 1 + rubber * Math.max(0, 1.15 - pilot.diff) * 0.35;
    pilot.ctl.throttle = U().clamp(th, 0, 1);

    // opportunistic boost on straights, more when behind; legends burn it earlier and harder
    pilot.boostTimer -= dt;
    pilot.ctl.boost = false;
    if (pilot.boostTimer <= 0 && bend < 0.2 && b.boostEnergy > (pilot.diff > 1.2 ? 0.35 : 0.5)) {
      if (rubber > -0.2 || Math.random() < pilot.aggression * 0.3) pilot.ctl.boost = true;
      if (b.boostEnergy < 0.15) pilot.boostTimer = 4 + Math.random() * 5;
    }

    // unstick: if wedged against a wall, back off and re-aim
    if (speed < 1.2 && pilot.ctl.throttle > 0.5) pilot.stuckTimer += dt;
    else pilot.stuckTimer = Math.max(0, pilot.stuckTimer - dt * 2);
    if (pilot.stuckTimer > 1.4) {
      pilot.ctl.throttle = 0;
      pilot.ctl.brake = 1;
      pilot.ctl.steer = -Math.sign(err || 1);
      if (pilot.stuckTimer > 2.6) pilot.stuckTimer = 0;
    }

    // a fresh bump saps steering authority + throttle, so a good shove actually costs them track
    if (b.bumpRecover > 0) { pilot.ctl.steer *= 0.30; pilot.ctl.throttle *= 0.65; }

    return pilot.ctl;
  };

  RR.AI = A;
})();

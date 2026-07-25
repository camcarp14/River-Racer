/* River Racer — opponent pilots: apex racing line, bounded rubber-band, drafting, discrete
   mistakes, blocking. Every tunable lives in A.K so the difficulty curve is auditable. */
(function () {
  const A = {};
  const U = () => RR.U;

  // Bubbly Creek is the real South Fork of the South Branch; Lockport is the real terminus of the
  // Sanitary & Ship Canal. Twelve so a six-boat field has variety across restarts.
  const NAMES = ['“Wacker” Wade', 'Lou Canal', 'Stella Skyline', 'Deep Dish Dre',
    'Goose Island Gus', 'El Tracks Elena', 'Marina Mae', 'Bridgeport Bo',
    'Pilsen Pearl', 'Bubbly Creek Benny', 'Lockport Lucia', 'Calumet Cal'];

  A.K = {
    APEX_GAIN: 0.62,        // half-widths pulled toward the inside of a bend at full lock
    APEX_DAMP: 2.5,         // how fast they slide onto the apex line
    RUBBER_MAX: 0.07,       // +/-7% top speed at diff 1.0. HARD LIMIT: never above 0.12.
    RUBBER_DEAD: 60,        // metres of gap inside which rubber-banding is ZERO. Never below 45.
    RUBBER_FULL: 400,       // metres at which the band saturates
    DRAFT_SEEK: 0.25,       // steer bias toward a tow
    DRAFT_MIN: 8, DRAFT_MAX: 30,
    MISTAKE_PERIOD: 12.0,   // seconds between mistake rolls
    MISTAKE_CHANCE: 0.55,   // x (1.4 - diff); ~0.39 rookie, 0.0 legend
    BLOCK_GAIN: 0.35,       // half-widths of cover
    BLOCK_RANGE: 14,        // metres behind
    BLOCK_HOLD: 0.7, BLOCK_COOLDOWN: 5.0,
    SHOVE_RANGE: 9, SHOVE_COOLDOWN: 3.5,
  };

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
      apex: 0, block: 0, _blockTgt: 0, blockT: 0, blockHold: 0,
      draftBias: 0, mistakeT: A.K.MISTAKE_PERIOD, errT: 0, errKind: '', errDir: 1,
    };
  };

  const pt = {}, ptFar = {};
  A.update = function (pilot, dt, t, playerProgress) {
    const b = pilot.boat;
    const route = pilot.route;
    const speed = Math.hypot(b.vel.x, b.vel.z);
    const S = RR.Race && RR.Race.state && RR.Race.state();

    // progress along route (race.js keeps b.routeD updated); loops wrap the lookahead
    const look = 16 + speed * 1.15;
    const path = route.path;
    const wrap = (d) => path.loop ? ((d % path.len) + path.len) % path.len : d;
    U().pathAt(path, wrap(b.routeD + look), pt);
    U().pathAt(path, wrap(b.routeD + look * 2.4), ptFar);

    // corner anticipation. The SIGN matters: without it every rival takes every corner the same
    // distance from the wall, which is what the old lane-offset-only line looked like.
    const bendSigned = U().wrapAngle(Math.atan2(ptFar.tx, ptFar.tz) - Math.atan2(pt.tx, pt.tz));
    const bend = Math.abs(bendSigned);

    // cut to the inside of the bend; better pilots commit harder and earlier.
    // bendSigned > 0 = channel turns right = inside is right = laneOff must go negative, because
    // positive laneOff puts the aim point to the LEFT (tx = pt.x - pt.tz * laneOff).
    const apexTgt = -Math.sign(bendSigned) * U().clamp(bend / 0.9, 0, 1) *
      A.K.APEX_GAIN * (0.55 + pilot.diff * 0.35);
    pilot.apex = U().damp(pilot.apex || 0, apexTgt, A.K.APEX_DAMP, dt);

    // ---- drafting: hunt for a tow. A rival 8-30 m ahead within 7 m laterally is free speed.
    pilot.draftBias = 0;
    if (S && S.phase === 'racing' && bend < 0.3) {
      const dfx = Math.sin(b.heading), dfz = Math.cos(b.heading);
      let bestAlong = 1e9, bestLat = 0;
      for (const o of S.boats) {
        if (o === b) continue;
        const dx = o.pos.x - b.pos.x, dz = o.pos.z - b.pos.z;
        const along = dx * dfx + dz * dfz, lat = dx * dfz - dz * dfx;
        if (along > A.K.DRAFT_MIN && along < A.K.DRAFT_MAX && Math.abs(lat) < 7 && along < bestAlong) {
          bestAlong = along; bestLat = lat;
        }
      }
      if (bestAlong < 1e8) {
        // tuck in behind until close, then pull out to the side with more room
        pilot.draftBias = bestAlong > 12
          ? U().clamp(bestLat / Math.max(4, pt.w - 8), -0.4, 0.4) * A.K.DRAFT_SEEK * 4
          : -Math.sign(bestLat || 1) * 0.30;
      }
    }

    // ---- blocking: cover the line of anyone directly astern and closing. Timer-driven, never
    // setTimeout — a wall-clock timer survives pause and warp and desyncs the whole field.
    pilot.blockT = Math.max(0, (pilot.blockT || 0) - dt);
    pilot.blockHold = Math.max(0, (pilot.blockHold || 0) - dt);
    if (pilot.blockHold <= 0) pilot._blockTgt = 0;
    const tightHere = pt.w < 14 ||
      (RR.Bridges && RR.Bridges.duckY && isFinite(RR.Bridges.duckY(b.pos.x, b.pos.z)));
    if (pilot.blockT <= 0 && !tightHere && S && S.phase === 'racing' && pilot.aggression > 0.35) {
      const bfx = Math.sin(b.heading), bfz = Math.cos(b.heading);
      for (const o of S.boats) {
        if (o === b) continue;
        const dx = o.pos.x - b.pos.x, dz = o.pos.z - b.pos.z;
        const along = dx * bfx + dz * bfz, lat = dx * bfz - dz * bfx;
        if (along < -2 && along > -A.K.BLOCK_RANGE && Math.abs(lat) < 9) {
          const closing = (o.vel.x * bfx + o.vel.z * bfz) - (b.vel.x * bfx + b.vel.z * bfz);
          if (closing > 1.5) {
            pilot._blockTgt = Math.sign(lat || 1) * A.K.BLOCK_GAIN;
            pilot.blockT = A.K.BLOCK_COOLDOWN;
            pilot.blockHold = A.K.BLOCK_HOLD;
            break;
          }
        }
      }
    }
    pilot.block = U().damp(pilot.block || 0, pilot._blockTgt || 0, 3.0, dt);

    // steer toward the lookahead point, offset into lane + apex + block + draft, with a lazy
    // sine wobble. Better pilots wobble less and correct harder — legends hold a surgical line.
    const wobble = Math.sin(t * 0.6 + pilot.wobbleSeed) * (0.205 - pilot.diff * 0.06);
    const laneOff = (pilot.lane + pilot.apex + wobble + (pilot.block || 0) + (pilot.draftBias || 0)) *
      Math.max(4, pt.w - 8);
    const tx = pt.x - pt.tz * laneOff;
    const tz = pt.z + pt.tx * laneOff;
    const desired = Math.atan2(tx - b.pos.x, tz - b.pos.z);
    let err = U().wrapAngle(desired - b.heading);
    pilot.ctl.steer = U().clamp(err * (1.9 + pilot.diff * 0.5), -1, 1);

    // shoulder-check: a rival running alongside gets leaned on. Aggression (which scales with
    // difficulty) sets how often; a long cooldown keeps it racing, not bumper cars.
    pilot.shoveT = Math.max(0, (pilot.shoveT || 0) - dt);
    if (pilot.shoveT <= 0 && speed > b.spec.top * 0.55 && S && S.phase === 'racing') {
      const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
      const R2 = A.K.SHOVE_RANGE * A.K.SHOVE_RANGE;
      for (const o of S.boats) {
        if (o === b) continue;
        const dx = o.pos.x - b.pos.x, dz = o.pos.z - b.pos.z;
        if (dx * dx + dz * dz > R2) continue;
        const along = dx * fx + dz * fz, lat = dx * fz - dz * fx;
        if (Math.abs(along) > 7 || Math.abs(lat) < 1.2) continue;  // alongside, not nose-to-tail
        if (Math.random() < pilot.aggression * 0.9) {
          pilot.shoveDir = Math.sign(lat);
          pilot.shoveHold = 0.45 + pilot.aggression * 0.4;
        }
        pilot.shoveT = A.K.SHOVE_COOLDOWN + Math.random() * 4;      // cooldown, hit or not
        break;
      }
    }
    if (pilot.shoveHold > 0) {
      pilot.shoveHold -= dt;
      pilot.ctl.steer = U().clamp(pilot.ctl.steer + pilot.shoveDir * 0.5, -1, 1);
    }

    // ---- rubber-band as a bounded TOP-SPEED band with a deadzone. A 7% nudge is invisible to
    // the player, keeps the pack together, and — crucially — is OFF when you are actually racing
    // someone. Past that, the player feels the game cheating and the illusion dies.
    const gapM = playerProgress - b.routeD;                    // >0 = player ahead
    const mag = U().clamp((Math.abs(gapM) - A.K.RUBBER_DEAD) / (A.K.RUBBER_FULL - A.K.RUBBER_DEAD), 0, 1);
    const band = A.K.RUBBER_MAX * (pilot.diff < 1 ? 1.7 : pilot.diff > 1.2 ? 0.55 : 1);
    b.rubber = 1 + Math.sign(gapM) * mag * band;               // physics.js consumes this

    // throttle: full unless a bend looms; brake hard only for hairpins
    let th = 1;
    if (bend > 0.35) th = U().lerp(1, 0.45, U().smoothstep(0.35, 1.1, bend));
    if (Math.abs(err) > 1.1) th = 0.35;
    pilot.ctl.brake = bend > 0.95 && speed > b.spec.top * 0.75 ? 0.6 : 0;
    th *= pilot.skill;
    pilot.ctl.throttle = U().clamp(th, 0, 1);

    // ---- discrete mistakes. Wobble amplitude alone makes low difficulty feel drunk, not human;
    // a rival who actually blows a corner reads as a rival. At diff 1.45 the multiplier is 0, so
    // LEGEND pilots literally never err. That is the correct shape of a difficulty curve.
    pilot.mistakeT = (pilot.mistakeT == null ? A.K.MISTAKE_PERIOD : pilot.mistakeT) - dt;
    if (pilot.mistakeT <= 0) {
      pilot.mistakeT = A.K.MISTAKE_PERIOD * (0.7 + Math.random() * 0.6);
      if (Math.random() < A.K.MISTAKE_CHANCE * Math.max(0, 1.4 - pilot.diff)) {
        pilot.errT = 0.6 + Math.random() * 0.5;
        pilot.errKind = bend > 0.4 ? 'wide' : 'lift';          // blow the corner, or just coast
        pilot.errDir = Math.random() < 0.5 ? -1 : 1;
      }
    }
    if (pilot.errT > 0) {
      pilot.errT -= dt;
      if (pilot.errKind === 'wide') {
        pilot.ctl.steer = U().clamp(pilot.ctl.steer * 0.35 + pilot.errDir * 0.25, -1, 1);
        pilot.ctl.throttle *= 0.85;
      } else pilot.ctl.throttle *= 0.45;
    }

    // ---- boost discipline
    pilot.boostTimer -= dt;
    pilot.ctl.boost = false;
    if (pilot.boostTimer <= 0 && bend < 0.28 && b.boostEnergy > (pilot.diff > 1.2 ? 0.35 : 0.5)) {
      if (gapM > -80 || Math.random() < pilot.aggression * 0.3) pilot.ctl.boost = true;
      if (b.boostEnergy < 0.15) pilot.boostTimer = 4 + Math.random() * 5;
    }
    // final dash: within 250 m of the flag and inside 40 m of the player, empty the tank
    if (S && S.route) {
      const toGo = S.route.len - (b.routeD % S.route.len);
      if (toGo < 250 && Math.abs(gapM) < 40) pilot.ctl.boost = b.boostEnergy > 0.12;
    }
    if (b.bumpRecover > 0) pilot.ctl.boost = false;             // rattled pilots don't hit the button

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

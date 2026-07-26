/* River Racer — opponent pilots: apex racing line, bounded rubber-band, drafting, discrete
   mistakes, blocking. Every tunable lives in A.K, and every difficulty knob is one ROOKIE->LEGEND
   pair resolved once per pilot by tune(), so the whole curve is auditable in one place. */
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
    RUBBER_MAX: 0.07,       // +/-7% top speed at band 1.0. HARD LIMIT: never above 0.12.
    RUBBER_DEAD: 60,        // metres of gap inside which rubber-banding is ZERO. Never below 45.
    RUBBER_FULL: 400,       // metres at which the band saturates
    PACE_MAX: 0.02,         // LEGEND's honest top-speed edge: +2%, and not one percent more.
    DRAFT_SEEK: 0.25,       // steer bias toward a tow
    DRAFT_MIN: 8, DRAFT_MAX: 30,
    MISTAKE_PERIOD: 12.0,   // seconds between mistake rolls
    MISTAKE_CHANCE: 0.55,   // scaled by tier: ~0.50 rookie · 0.29 skipper · 0.0 legend
    BLOCK_GAIN: 0.35,       // half-widths of cover
    BLOCK_RANGE: 14,        // metres behind
    BLOCK_HOLD: 0.7, BLOCK_COOLDOWN: 5.0,
    SHOVE_RANGE: 9, SHOVE_COOLDOWN: 3.5,
    BOOST_TANK: 0.90,       // physics.js pays 15% more for a boost lit from a tank this full
  };

  // The whole difficulty curve, as ROOKIE-value -> LEGEND-value pairs. `w` walks between them and
  // is deliberately CONVEX (q^0.65): SKIPPER already has to be a real race, so it sits 55% of the
  // way to LEGEND rather than the 40% a straight line would give it. Quoted third number is where
  // SKIPPER lands. d: 0.7 rookie · 1.0 skipper · 1.45 legend.
  function tune(d) {
    const K = A.K;
    const q = U().clamp((d - 0.7) / 0.75, 0, 1);
    const w = Math.pow(q, 0.65);                  // 0 rookie · 0.552 skipper · 1 legend
    const L = (a, b) => a + (b - a) * w;
    return {
      throttle:   L(0.76, 1.00),      // 0.89  straight-line throttle cap. Drag is normalised to
      // topSpeed, so cruise settles at sqrt(throttle): 87% / 94% / 100% of the hull's top end.
      liftBend:   L(0.36, 0.60),      // 0.49  rad of channel swing before they ease at all
      liftFloor:  L(0.40, 0.78),      // 0.61  throttle held at the apex of a big bend
      liftSpan:   L(0.78, 0.68),      // 0.73  rad from first ease to the floor
      brakeBend:  L(0.88, 1.20),      // 1.06  only a genuine hairpin is worth the brake
      brakeSpeed: L(0.75, 0.82),      // 0.79  of top speed before braking beats just lifting
      brakeForce: L(0.75, 0.44),      // 0.58
      panicTh:    L(0.34, 0.44),      // 0.40  throttle while the nose is badly off line
      apex:       L(0.78, 1.12),      // 0.97  x APEX_GAIN half-widths of cut to the inside
      apexDamp:   L(2.40, 3.40),      // 2.95  legends are ON the apex line, not sliding toward it
      look:       L(1.12, 1.38),      // 1.26  lookahead metres per m/s — reading further IS skill
      wobble:     L(0.140, 0.028),    // 0.078 lazy sine wander across the channel
      lane:       L(0.90, 0.45),      // 0.65  of the nominal lane offset; the fast line is the fast line
      react:      L(15, 26),          // 21.1  steering slew rate (1/s) = reaction time
      steerGain:  L(2.15, 2.70),      // 2.45
      mistake:    K.MISTAKE_CHANCE * (1 - w) * 0.82,  // 0.45 / 0.20 / 0.00 chance per roll
      blockGain:  L(0.32, 0.45),      // 0.39  half-widths of cover over the line behind
      blockHold:  L(0.62, 0.90),      // 0.78  s
      blockCool:  L(5.50, 4.20),      // 4.78  s
      // +0.03 so the tank is comfortably OVER the bonus line when the button goes down, not on it
      boostArm:   L(0.45, K.BOOST_TANK + 0.03), // 0.72  tank level they'll light it at
      boostBend:  L(0.24, 0.32),      // 0.28  bend they'll light it in
      boostHold:  L(0.38, 0.52),      // 0.46  bend they'll hold it through
      boostGap:   L(2.60, 0.50),      // 1.44  s between stints
      leadCap:    w < 0.15 ? 150 : 1e9,  // ROOKIE ONLY: a rival this far clear stops pressing it
      bandUp:     L(0.70, 1.00),      // 0.87  catch-UP band, used when the PLAYER is ahead
      // The catch-DOWN half is the one that quietly hands you races. It is exactly ZERO at LEGEND:
      // a rival who has beaten you to the front is never throttled back to keep you in the picture.
      bandDown:   L(1.60, 0.00),      // 0.72
      // LEGEND's only outright physical edge, and it is deliberately tiny: +2% top speed, worth
      // about 2 s over the Main Stem. They beat you on the line and the throttle, not the engine.
      pace:       1 + K.PACE_MAX * U().clamp((w - 0.6) / 0.4, 0, 1), // 1.000 / 1.000 / 1.020
    };
  }
  A.tune = tune;                                  // exposed so a tuning pass can print the table

  A.createPilot = function (boat, route, idx, difficulty) {
    const d = difficulty == null ? 1 : difficulty;    // 0.7 rookie · 1.0 skipper · 1.45 legend
    const k = tune(d);
    return {
      boat, route, diff: d, k,
      name: NAMES[idx % NAMES.length],
      // preferred offset across the channel (-1..1 of half width). Legends barely use it — the
      // fast line is the fast line, and a rival sitting a lane wide of it is a rival losing.
      lane: ((idx % 4) - 1.5) * 0.42 * k.lane,
      skill: U().clamp(k.throttle + (idx * 0.37 % 1) * 0.10 - 0.03, 0.3, 1),
      aggression: 0.15 + d * 0.35 + (idx * 0.61 % 1) * 0.3,
      wobbleSeed: idx * 13.7,
      ctl: { throttle: 0, brake: 0, steer: 0, boost: false },
      stuckTimer: 0,
      boostTimer: (0.4 + idx * 0.5) * k.boostGap,
      boosting: false,
      apex: 0, block: 0, _blockTgt: 0, blockT: 0, blockHold: 0, steerSm: 0,
      draftBias: 0, mistakeT: A.K.MISTAKE_PERIOD, errT: 0, errKind: '', errDir: 1,
    };
  };

  const pt = {}, ptFar = {};
  A.update = function (pilot, dt, t, playerProgress) {
    const b = pilot.boat;
    const route = pilot.route;
    const k = pilot.k || (pilot.k = tune(pilot.diff == null ? 1 : pilot.diff));
    const speed = Math.hypot(b.vel.x, b.vel.z);
    const S = RR.Race && RR.Race.state && RR.Race.state();

    // progress along route (race.js keeps b.routeD updated); loops wrap the lookahead.
    // Reading further down the channel IS the skill: it is what lets a pilot start the turn early
    // and carry speed instead of arriving hot and scrubbing it off.
    const look = 14 + speed * k.look;
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
    const apexTgt = -Math.sign(bendSigned) * U().clamp(bend / 0.9, 0, 1) * A.K.APEX_GAIN * k.apex;
    pilot.apex = U().damp(pilot.apex || 0, apexTgt, k.apexDamp, dt);

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
    const tightHere = pt.w < 16 ||
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
            pilot._blockTgt = Math.sign(lat || 1) * k.blockGain;
            pilot.blockT = k.blockCool;
            pilot.blockHold = k.blockHold;
            break;
          }
        }
      }
    }
    pilot.block = U().damp(pilot.block || 0, pilot._blockTgt || 0, 3.0, dt);

    // steer toward the lookahead point, offset into lane + apex + block + draft, with a lazy
    // sine wobble. Better pilots wobble less and correct harder — legends hold a surgical line.
    const wobble = Math.sin(t * 0.6 + pilot.wobbleSeed) * k.wobble;
    const laneOff = (pilot.lane + pilot.apex + wobble + (pilot.block || 0) + (pilot.draftBias || 0)) *
      Math.max(4, pt.w - 8);
    const tx = pt.x - pt.tz * laneOff;
    const tz = pt.z + pt.tx * laneOff;
    const desired = Math.atan2(tx - b.pos.x, tz - b.pos.z);
    let err = U().wrapAngle(desired - b.heading);
    // reaction time, modelled honestly as a slew rate on the hands rather than a stale aim point:
    // a rookie's correction arrives ~60 ms late and overshoots, a legend's is already there.
    const rawSteer = U().clamp(err * k.steerGain, -1, 1);
    pilot.steerSm = U().damp(pilot.steerSm == null ? rawSteer : pilot.steerSm, rawSteer, k.react, dt);
    pilot.ctl.steer = pilot.steerSm;

    // shoulder-check: a rival running alongside gets leaned on. Aggression (which scales with
    // difficulty) sets how often; a long cooldown keeps it racing, not bumper cars. Same tight-water
    // veto as blocking: leaning on someone inside the lock chamber or under a bridge pier isn't
    // hard racing, it's pinball, and the wedged boat loses half a minute to it.
    pilot.shoveT = Math.max(0, (pilot.shoveT || 0) - dt);
    if (pilot.shoveT <= 0 && !tightHere && speed > b.spec.top * 0.55 && S && S.phase === 'racing') {
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

    // ---- rubber-band as a bounded TOP-SPEED band with a deadzone, split into its two halves.
    // Catch-UP (you're ahead, they lift the pace) keeps the pack in your mirrors. Catch-DOWN
    // (they're ahead, held back so you can reel them in) is the half that quietly wins races FOR
    // the player — it is fat at ROOKIE, small at SKIPPER and exactly ZERO at LEGEND.
    const gapM = playerProgress - b.routeD;                    // >0 = player ahead
    const mag = U().clamp((Math.abs(gapM) - A.K.RUBBER_DEAD) / (A.K.RUBBER_FULL - A.K.RUBBER_DEAD), 0, 1);
    const band = A.K.RUBBER_MAX * (gapM > 0 ? k.bandUp : k.bandDown);
    b.rubber = k.pace * (1 + Math.sign(gapM) * mag * band);     // physics.js consumes this

    // throttle: full unless a bend looms. WHERE they lift is the single biggest difference between
    // the tiers — a LEGEND holds ~78% through a bend a ROOKIE takes at 40%, and only a hairpin
    // (>1.2 rad of channel swing) is worth touching the brake for.
    let th = 1;
    if (bend > k.liftBend) th = U().lerp(1, k.liftFloor, U().smoothstep(k.liftBend, k.liftBend + k.liftSpan, bend));
    if (Math.abs(err) > 1.1) th = Math.min(th, k.panicTh);
    pilot.ctl.brake = bend > k.brakeBend && speed > b.spec.top * k.brakeSpeed ? k.brakeForce : 0;
    th *= pilot.skill;
    pilot.ctl.throttle = U().clamp(th, 0, 1);

    // ---- discrete mistakes. Wobble amplitude alone makes low difficulty feel drunk, not human;
    // a rival who actually blows a corner reads as a rival. At LEGEND the multiplier is 0, so
    // those pilots literally never err. That is the correct shape of a difficulty curve.
    pilot.mistakeT = (pilot.mistakeT == null ? A.K.MISTAKE_PERIOD : pilot.mistakeT) - dt;
    if (pilot.mistakeT <= 0) {
      pilot.mistakeT = A.K.MISTAKE_PERIOD * (0.7 + Math.random() * 0.6);
      if (Math.random() < k.mistake) {
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

    // ---- boost discipline. physics.js pays a 15% BIGGER multiplier for a boost lit from a tank
    // above 0.90, so the correct policy is to hoard to full and then dump the whole tank down a
    // straight — not to trickle it away the instant the meter allows. LEGEND does exactly that;
    // ROOKIE lights it early, half-full, and gives it back in the next bend.
    pilot.boostTimer -= dt;
    if (pilot.boosting) {
      // stay lit until the tank is dry or a real bend arrives — a stint is worth more than a stab
      pilot.boosting = b.boostEnergy > 0.03 && bend < k.boostHold && pilot.ctl.throttle > pilot.skill * 0.6;
      if (!pilot.boosting) pilot.boostTimer = k.boostGap;
    } else if (pilot.boostTimer <= 0 && b.boostEnergy >= k.boostArm && pilot.ctl.throttle > pilot.skill * 0.9 &&
               (bend < k.boostBend || speed < b.spec.top * 0.82)) {
      // out of a bend the same fuel buys more, because the boost KICK is an acceleration, not a
      // top-speed number — so "straight ahead" and "still climbing back to speed" both qualify.
      pilot.boosting = true;
    }
    // ROOKIE ONLY: a rival a long way clear stops pressing the button. Nobody else eases up.
    if (gapM < -k.leadCap) pilot.boosting = false;
    pilot.ctl.boost = pilot.boosting;
    // final dash: inside the last 250 m the tank is worth nothing at the flag — empty it.
    if (S && S.route) {
      const toGo = S.route.len - (b.routeD % S.route.len);
      if (toGo < 250 && (pilot.diff > 1.2 || Math.abs(gapM) < 60)) {
        pilot.ctl.boost = b.boostEnergy > 0.05;
        pilot.boosting = pilot.ctl.boost;
      }
    }
    if (b.bumpRecover > 0) { pilot.ctl.boost = false; pilot.boosting = false; }  // rattled pilots don't hit the button

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

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
  A.NAMES = NAMES;                       // race.js's cup roster draws from this list; so does main.js

  // Twelve names and every race was Wade, Lou, Stella, Dre, Gus — in that order — because the
  // pilot took NAMES[idx]. A field is drawn per race instead; the cup overrides it with its own
  // stored roster, which is the whole point of a season. mulberry, never Math.random: a field is
  // game state and has to be reproducible from its seed.
  let field = null;
  A.newField = function (seed) {
    const pool = NAMES.slice();
    const rng = U().mulberry((seed >>> 0) || 1);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    field = pool;
    return pool.slice(0, 5);
  };
  // The tier weight, exported so the item brain runs off the SAME curve the driving does. It used
  // its own linear one, so SKIPPER played its items at 40% of legend while driving at 55%.
  A.tierW = (d) => Math.pow(U().clamp(((d == null ? 1 : d) - 0.7) / 0.75, 0, 1), 0.65);

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
    MISTAKE_CHANCE: 0.55,   // scaled by tier in tune(): 0.45 rookie · 0.20 skipper · 0.0 legend
    BLOCK_GAIN: 0.35,       // half-widths of cover
    BLOCK_RANGE: 14,        // metres behind
    BLOCK_HOLD: 0.7, BLOCK_COOLDOWN: 5.0,
    SHOVE_RANGE: 9, SHOVE_COOLDOWN: 3.5,
    PASS_HOLD: 1.5,         // seconds a pilot commits to the side she chose to pass on
    BOOST_TANK: 0.90,       // physics.js pays 15% more for a boost lit from a tank this full
    BOOST_SPILL: 0.97,      // a tank this full is about to waste the next gate — light it
  };

  // The whole difficulty curve, as ROOKIE-value -> LEGEND-value pairs. `w` walks between them and
  // is deliberately CONVEX (q^0.65): SKIPPER already has to be a real race, so it sits 55% of the
  // way to LEGEND rather than the 40% a straight line would give it. Quoted third number is where
  // SKIPPER lands. d: 0.7 rookie · 1.0 skipper · 1.45 legend.
  function tune(d) {
    const K = A.K;
    const w = A.tierW(d);                         // 0 rookie · 0.552 skipper · 1 legend
    const L = (a, b) => a + (b - a) * w;
    return {
      throttle:   L(0.76, 1.00),      // 0.89  straight-line throttle cap.
      // Drag is normalised to topSpeed, so the DRAG LAW alone settles at sqrt(throttle) — 87% /
      // 94% / 100%. The skin-friction term below full throttle takes a further bite out of that,
      // and physics.js now fades it with the wetted surface as the hull comes up on plane, so a
      // planing rival settles very close to the sqrt figure and a displacement one (the BELLE)
      // still sits well under it. Measured cruise, FORMULA 350 GT: 0.76 -> 84%, 0.89 -> 92%,
      // 1.00 -> 100% of top. The old comment quoted the drag law alone and was 10-17 points out.
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
      // The boost economy is EARNED, not issued: passive refill is a 33 s trickle and the tank
      // fills in lumps off checkpoints, caught slides and airtime. A LEGEND still hoards to the
      // full-tank bonus line, but the old +0.03 cushion meant sitting on a nearly-full tank
      // waiting for a top-up that no longer arrives on a timer — so the arm level is the bonus
      // line itself, and both ends came down a notch to keep the field spending what it earns.
      boostArm:   L(0.36, K.BOOST_TANK), // 0.66  tank level they'll light it at
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
      name: (field || NAMES)[idx % NAMES.length],
      // Preferred offset across the channel (-1..1 of half width). Legends barely use it — the
      // fast line is the fast line, and a rival sitting a lane wide of it is a rival losing.
      //
      // The SIGN has to agree with the grid. race.js puts boat i on the LEFT (+) when i is odd,
      // and this pilot drives boat i = idx + 1, so an EVEN idx is a left-hand boat and wants a
      // positive lane. The old ((idx % 4) - 1.5) gave three of five rivals the opposite sign, so
      // every race opened with them slewing diagonally across each other's bows: measured, a
      // full-severity three-boat crash at t = 1.4 s, every single start, identically.
      lane: (idx % 2 ? -1 : 1) * [0.63, 0.63, 0.21, 0.21, 0.42, 0.42][idx % 6] * 0.42 * k.lane,
      skill: U().clamp(k.throttle + (idx * 0.37 % 1) * 0.10 - 0.03, 0.3, 1),
      aggression: 0.15 + d * 0.35 + (idx * 0.61 % 1) * 0.3,
      wobbleSeed: idx * 13.7,
      ctl: { throttle: 0, brake: 0, steer: 0, boost: false },
      stuckTimer: 0,
      // Nobody leans on anybody off the line: block and shove are held off for the first six
      // seconds, which is the run to the first bridge.
      blockT: 6, shoveT: 6,
      // ROOKIE rivals do not light the full-tank boost on the first racing frame. They did — the
      // grid tank is 1.0 and this timer runs through the 3.6 s countdown — so a first-timer lost
      // every start to something they could not see, and then met the pile-up above. The 3.6
      // covers the countdown; they light it 1.5-5 s after the horn instead.
      boostTimer: d < 0.85 ? 3.6 + 1.5 + idx * 0.8 : (0.4 + idx * 0.5) * k.boostGap,
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

    // ---- across the line, and done ----
    // A finished rival used to keep full throttle: on a sprint she ran out of route, panicked on
    // the |err| clamp and did donuts at the flag; on the two-lap circuit she started a THIRD lap
    // and came back round through the player at 40 m/s during the finale shot. She coasts now.
    if (b.finished) {
      const c = pilot.ctl;
      c.throttle = speed > 8 ? 0 : 0.25;
      c.brake = 0; c.boost = false;
      pilot.boosting = false; pilot._blockTgt = 0; pilot.block = 0; pilot.shoveHold = 0; pilot.apex = 0;
      // steer back to the middle of the channel and stay out of the way
      const path = route.path;
      const dd = path.loop ? ((b.routeD % path.len) + path.len) % path.len : Math.min(path.len - 1, b.routeD);
      U().pathAt(path, dd, pt);
      const want = Math.atan2(pt.x - b.pos.x, pt.z - b.pos.z);
      c.steer = U().clamp(U().wrapAngle(want - b.heading) * 1.2, -1, 1);
      return c;
    }

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
    // published for powerups.js: crate-seeking has the same tight-water veto blocking and shoving
    // have had all along, and does not fire while the field is still sorting itself out
    pilot.tight = tightHere;
    pilot.bend = bend;
    pilot.starting = b.routeD < 200;
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
    // ---- traffic sense ----
    // The pack used to read as bumper cars — 228 rival-on-rival hits per four LEGEND races — because
    // nothing here knew another boat was in front of it. Two rules fix most of it: keep a following
    // distance, and pick the side you pass on by where the room actually is.
    let follow = 1, passBias = 0;
    if (S && S.phase === 'racing') {
      const ffx = Math.sin(b.heading), ffz = Math.cos(b.heading);
      let nearAhead = null, nearAlong = 1e9, squeeze = false;
      // the lateral window has to be wider than a hull: two 2 m radii touch at 4 m of separation,
      // so a 3 m window let the pair that was about to hit each other read as clear
      const latW = tightHere ? 6.5 : 4.5;
      for (const o of S.boats) {
        if (o === b) continue;
        const dx = o.pos.x - b.pos.x, dz = o.pos.z - b.pos.z;
        const along = dx * ffx + dz * ffz, lat = dx * ffz - dz * ffx;
        if (along > 1 && along < 11 && Math.abs(lat) < latW && along < nearAlong) { nearAlong = along; nearAhead = { o, along, lat }; }
        // Under a bridge or in the lock there is no room to be two abreast. Whoever is BEHIND on
        // the road gives way — measured, two rivals arriving at the first bridge on the same line
        // hit each other at full severity, twice, and the pair then blocked the span.
        if (tightHere && Math.abs(along) < 7 && Math.abs(lat) < 6.5 && (o.routeD || 0) > (b.routeD || 0)) squeeze = true;
      }
      if (squeeze) follow = Math.min(follow, k.liftFloor * 0.75);
      if (nearAhead) {
        const closing = (b.vel.x * ffx + b.vel.z * ffz) - (nearAhead.o.vel.x * ffx + nearAhead.o.vel.z * ffz);
        // lift rather than climb into her transom — but only when actually closing on her
        if (closing > 0.5 && nearAhead.along < 8) follow = Math.min(follow, k.liftFloor);
        // and commit to a side: whichever has more channel left, held for PASS_HOLD so the pilot
        // does not dither across her wake
        pilot.passT = Math.max(0, (pilot.passT || 0) - dt);
        if (pilot.passT <= 0 && !tightHere) {
          const myLat = (b.pos.x - pt.x) * pt.tz - (b.pos.z - pt.z) * pt.tx;
          const hers = myLat + nearAhead.lat;
          pilot.passDir = hers > 0 ? -1 : 1;               // go the side she is not on
          pilot.passT = A.K.PASS_HOLD;
        }
        if (pilot.passT > 0) passBias = pilot.passDir * 0.34;
      } else { pilot.passT = Math.max(0, (pilot.passT || 0) - dt); }
    }
    // …and steer round the working river. Tour boats, taxis and kayaks are solid to the physics and
    // the pilots drove straight into them (31 contacts per four ROOKIE races, one rival wedged on a
    // Wendella for 2.6 s). Same treatment for a slick or a dye cloud, once powerups.js publishes them.
    let dodge = 0;
    const lookR = 34;
    if (RR.Life && RR.Life.craft) {
      const dfx = Math.sin(b.heading), dfz = Math.cos(b.heading);
      for (const c of RR.Life.craft) {
        const dx = c.g.position.x - b.pos.x, dz = c.g.position.z - b.pos.z;
        const along = dx * dfx + dz * dfz, lat = dx * dfz - dz * dfx;
        if (along < 2 || along > lookR || Math.abs(lat) > 13) continue;
        dodge += -Math.sign(lat || 1) * U().clamp(1 - Math.abs(lat) / 13, 0, 1) * 0.35 * (1 - along / lookR);
      }
    }
    if (RR.Powerups && RR.Powerups.hazardsNear) {
      const hz = RR.Powerups.hazardsNear(b.pos.x, b.pos.z, lookR);
      const dfx = Math.sin(b.heading), dfz = Math.cos(b.heading);
      for (const h of (hz || [])) {
        const dx = h.x - b.pos.x, dz = h.z - b.pos.z;
        const along = dx * dfx + dz * dfz, lat = dx * dfz - dz * dfx;
        const r = (h.r || 6) + 3;
        if (along < 2 || along > lookR || Math.abs(lat) > r) continue;
        dodge += -Math.sign(lat || 1) * U().clamp(1 - Math.abs(lat) / r, 0, 1) * 0.45 * (1 - along / lookR);
      }
    }
    dodge = U().clamp(dodge, -0.5, 0.5);
    // The RACING LINE fades in over the first 200 m; the LANE does not. That distinction is the
    // whole fix: the lane is what holds a boat on the side of the channel the grid put her on
    // (createPilot now signs it to match), so fading it out sends all six converging on the
    // centreline together — measured, two same-row pairs hitting at severity 0.6-0.8 within
    // 30 m of the flag. It is the apex cut and the wobble that make them cross each other, so
    // those are what wait until the field is strung out.
    const settle = U().smoothstep(60, 220, b.routeD);
    const laneOff = (pilot.lane + (pilot.apex + wobble) * settle +
      (pilot.block || 0) + (pilot.draftBias || 0) + passBias + dodge) *
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
    th = Math.min(th, follow);                                 // a boat three metres off the bow
    // what the pilot MEANT to ask for, before the panic clamp: the unstick timer reads this, or a
    // rival wedged nose-first (which is exactly when |err| trips the clamp) never counts as stuck
    const wantTh = th * pilot.skill;
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
    // The tank is filled by buoy lines and caught slides, not by a clock, so a tank sitting at
    // the ceiling is not discipline — it is the next checkpoint being thrown away. Anything this
    // full spends, whatever the pilot's usual patience.
    const armAt = b.boostEnergy >= A.K.BOOST_SPILL ? 0 : k.boostArm;
    if (pilot.boosting) {
      // stay lit until the tank is dry or a real bend arrives — a stint is worth more than a stab
      pilot.boosting = b.boostEnergy > 0.03 && bend < k.boostHold && pilot.ctl.throttle > pilot.skill * 0.6;
      if (!pilot.boosting) pilot.boostTimer = k.boostGap;
    } else if (pilot.boostTimer <= 0 && b.boostEnergy >= armAt && pilot.ctl.throttle > pilot.skill * 0.9 &&
               (bend < k.boostBend || speed < b.spec.top * 0.82)) {
      // out of a bend the same fuel buys more, because the boost KICK is an acceleration, not a
      // top-speed number — so "straight ahead" and "still climbing back to speed" both qualify.
      pilot.boosting = true;
    }
    // ROOKIE ONLY: a rival a long way clear stops pressing the button. Nobody else eases up.
    if (gapM < -k.leadCap) pilot.boosting = false;
    pilot.ctl.boost = pilot.boosting;
    // final dash: inside the last 250 m the tank is worth nothing at the flag — empty it.
    // Measured against the WHOLE race, not the lap: routeD carries lap*len, so `len - routeD % len`
    // also hits 250 at the end of lap 1 on the two-lap circuit and every legend started lap 2 dry.
    if (S && S.route) {
      const total = S.route.loop ? (S.course.laps || 1) * S.route.len : (S.finishD || S.route.len);
      const toGo = total - b.routeD;
      if (toGo < 250 && (pilot.diff > 1.2 || Math.abs(gapM) < 60)) {
        pilot.ctl.boost = b.boostEnergy > 0.05;
        pilot.boosting = pilot.ctl.boost;
      }
    }
    if (b.bumpRecover > 0) { pilot.ctl.boost = false; pilot.boosting = false; }  // rattled pilots don't hit the button

    // Unstick: if wedged against a wall, back off and re-aim. Gated on what the pilot ASKED for
    // (wantTh), not on what came out after the panic clamp and a 'lift' mistake had cut it — those
    // two push the throttle under 0.5 in exactly the situation this exists for. A pilot grinding
    // along the concrete at walking pace counts as stuck too, which is where they actually get
    // caught now that a nose-in hit no longer pins the hull outright.
    const grinding = speed < 3.5 && ((b.scrapeT || 0) > 0 || (b.contactT || 0) > 0);
    if ((speed < 1.2 || grinding) && wantTh > 0.5 && (!S || S.phase === 'racing')) pilot.stuckTimer += dt;
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

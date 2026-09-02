/* River Racer — arcade boat hydrodynamics, collisions, wave riding.
   Arcade, but with one honest physical idea per feature: a hull climbs its own bow wave, peaks in
   resistance around 20 kt, then breaks free and the bow drops. Everything else hangs off that. */
(function () {
  const P = {};
  const U = () => RR.U;
  const wn = { pitch: 0, roll: 0, h: 0 };
  // One slap = one clean thwack. SLAP_W is pi/SLAP_LIFE so the shudder is a single half-cycle that
  // starts and ends at zero; the old 48 rad/s ran a whole cycle inside 130 ms, which is a wobble.
  const SLAP_LIFE = 0.13, SLAP_W = Math.PI / SLAP_LIFE;
  // while resetLock is running the throttle is dead — hoisted so the sim never allocates per frame
  const lockCtl = { throttle: 0, brake: 0, steer: 0, boost: false };

  P.createBoat = function (spec, mesh) {
    return {
      spec, mesh,
      pos: new THREE.Vector3(0, 0, 0),
      vel: { x: 0, z: 0 },
      heading: 0, angVel: 0,
      vy: 0, airborne: false, airTime: 0,
      boostEnergy: 1, boostHeat: 0, boostKickT: 0, boostFull: 1,
      rpm: 0,
      visRoll: 0, visPitch: 0,
      radius: (mesh.userData.size ? mesh.userData.size.r : 2) * 0.7,
      // how far the highest bit of her stands over the waterline — screen, arch, wheelhouse. This
      // is what a bascule deck actually meets, and on the BELLE it is a two-deck superstructure.
      hullTop: Math.max(1.6, (mesh.userData.size ? mesh.userData.size.r : 2) * 0.8),
      hullLen: (mesh.userData.size && mesh.userData.size.len) || 5,   // waterline the hull averages
      mass: spec.mass || 1,
      bumpRecover: 0,
      hint: {},
      water: null,          // last waterQuery result snapshot
      wakePhase: Math.random() * 10,
      crashTimer: 0,
      isPlayer: false,
      finished: false,
      // feel state
      planeF: 0, hump: 0,
      slapPhase: 0, slapT: 0,
      prevThrottle: 0, diveT: 0,
      drifting: false, driftTime: 0, launchArmed: true,
      // the slide: how long she has been sliding, whether this slide has paid, cooldown to the next pay
      slideT: 0, slidePaid: false, catchCool: 0, lastPay: null,
      draft: 0, _draftHit: 0,
      rubber: 1,
      scrapeT: 0, contactT: 0, resetLock: 0,
      flowX: 0, flowZ: 0,
      _steerMag: 0,                                    // |steer| this frame, read by P.bounce
      shielded: false, shieldHit: 0,                   // powerups.js raises shielded; P.bounce reports shieldHit
    };
  };
  // powerups.js checks this before trusting boat.shieldHit (the honest absorb below in P.bounce)
  P.SHIELD_AWARE = true;

  // R is a free teleport unless it costs something. FEEL §1.10.
  P.resetPenalty = function (boat) {
    if (!boat) return;
    boat.boostEnergy = Math.max(0, boat.boostEnergy - 0.30);
    boat.resetLock = 1.2;
  };

  // ---- poling off ----
  // A hull in sustained contact at walking pace cannot always drive out of it. P.bounce's
  // wall-follow assist has already swung her parallel to whatever she is touching, so ahead runs
  // her along it and astern runs her back along it; against a pier she just circles the thing,
  // shedding to the bounce every frame the speed the throttle keeps putting back. Nothing in the
  // hull model separates the two — the astern pivot walk used to, as a side effect, because it
  // translated the centre of mass sideways, and ai.js's unstick manoeuvre (throttle 0, brake 1,
  // full opposite lock) is tuned around exactly that. With the walk gone, two boats on the North
  // Shore course sat on the same lake pier for 15.8 s, measured, against 2.4-5.0 s before.
  // So put the separation where it belongs — in the contact, not in the steering model. This is
  // the crew poling off: it exists only while she is actually touching, only below walking pace,
  // and only while somebody is asking for ahead or astern, so it is never felt out in the channel.
  // n points into free water at both call sites (waterQuery's normal runs bank -> centreline, and
  // hitObstacle's is the direction the penetration is resolved along).
  // 14 m/s^2 fading by 9 m/s (was 9 by 7): a 60 deg nose-in with the throttle held used to grind
  // at 2-3 m/s for 5-7 s, above ai.js's unstick threshold and below where 9 could reach.
  function poleOff(boat, nx, nz, ctl, dt) {
    const sp = Math.hypot(boat.vel.x, boat.vel.z);
    if (sp >= 9 || (ctl.throttle <= 0.25 && ctl.brake <= 0.25)) return;
    const off = 14.0 * (1 - sp / 9) * dt;                 // fades out entirely by 9 m/s
    boat.vel.x += nx * off;
    boat.vel.z += nz * off;
  }

  // ctl: {throttle 0..1, brake 0..1, steer -1..1, boost bool}
  P.update = function (boat, dt, ctl, t) {
    const spec = boat.spec;

    if (boat.resetLock > 0) {
      boat.resetLock = Math.max(0, boat.resetLock - dt);
      lockCtl.steer = ctl.steer * 0.5;                   // you can point it, you can't drive it
      ctl = lockCtl;
    }

    boat._steerMag = Math.abs(ctl.steer);                   // P.bounce reads it: no shoulder-off against the wheel

    const fx = Math.sin(boat.heading), fz = Math.cos(boat.heading);
    let speedF = boat.vel.x * fx + boat.vel.z * fz;          // signed forward speed
    let speedL = boat.vel.x * fz - boat.vel.z * fx;          // lateral slip
    const speed = Math.hypot(boat.vel.x, boat.vel.z);

    // ---- the plane transition ----
    // planeF: 0 = displacement, 1 = fully planing. hump peaks halfway through, which is exactly
    // where a real resistance curve peaks (the boat is dragging its own bow wave uphill).
    // Signed forward speed, not |v|: a hull backing down at 12-18 m/s is not on plane, and on the
    // unsigned speed she got planeTurn, the planing grip cut and lift going astern.
    const pSpd = spec.plane || 0;
    const planeF = pSpd <= 0 ? 1 : U().smoothstep(pSpd * 0.55, pSpd * 1.25, Math.max(0, speedF));
    const hump = 4 * planeF * (1 - planeF);
    boat.planeF = planeF;                                    // HUD / audio / music all read this
    boat.hump = hump;

    // ---- boost: a RESOURCE with a PUNCH, not a top-speed multiplier ----
    // Engaging needs a real reserve (0.15) but once lit it burns to fumes (0.02) — hysteresis
    // you can feel in the meter.
    const canEngage = boat.boostEnergy > (boat.boostHeat > 0.3 ? 0.02 : 0.15);
    const boosting = !!ctl.boost && ctl.throttle > 0.3 && canEngage && !boat.finished;
    if (boosting && !boat._wasBoost) {
      boat.boostKickT = 0.45;                                // the shove
      boat.boostFull = boat.boostEnergy > 0.90 ? 1.15 : 1.0; // a full tank pays 15% more — save it
      if (boat.onBoostStart) boat.onBoostStart(boat.boostFull);
    }
    if (!boosting && boat._wasBoost && boat.onBoostEnd) boat.onBoostEnd();
    // the denied edge: SHIFT pressed on a dry tank says so once per press (a dry click, the
    // reserve segments blink) — measured, the old silence was indistinguishable from a broken key
    if (ctl.boost && !boat._wasAsk && !canEngage && ctl.throttle > 0.3 && !boat.finished && boat.onBoostDenied) {
      boat.onBoostDenied(boat.boostEnergy);
    }
    boat._wasAsk = !!ctl.boost;
    boat._wasBoost = boosting;
    boat.boostKickT = Math.max(0, (boat.boostKickT || 0) - dt);

    const bMul = boosting ? 1 + (spec.boost - 1) * (boat.boostFull || 1) : 1;
    const topSpeed = spec.top * bMul * (boat.rubber || 1) * (1 + (boat.draft || 0) * 0.04);
    const accel = spec.accel * bMul + (boat.boostKickT > 0 ? (spec.boostKick || 9) : 0);

    if (boosting) boat.boostEnergy = Math.max(0, boat.boostEnergy - dt * 0.34);   // 2.9 s from full
    // Passive refill is a trickle, not an allowance. At 0.100/s the meter refilled itself every
    // ten seconds whatever you did, which made boost a cooldown; at 0.030 a full tank means you
    // have been brave for a while — literally: it only runs above 85% of top speed with the wheel
    // inside half lock, i.e. flat out and pointing where you are going. Measured: the
    // unconditional 0.030 was 42-74% of every hull's supply, and on speed alone a held-lock corner
    // (the FORMULA settles at 85.1% of top under full lock) still trickled. Everything else —
    // checkpoints, gates, the caught slide, airtime and a TURBO out of a crate — pays for risk.
    else if (speed > 0.85 * topSpeed && Math.abs(ctl.steer) < 0.5) {
      boat.boostEnergy = Math.min(1, boat.boostEnergy + dt * 0.030);                    // 33 s refill, flat out
    }
    boat.boostHeat = U().damp(boat.boostHeat, boosting ? 1 : 0, boosting ? 14 : 5, dt);

    // ---- steering: effective with water under the hull, way on, OR wash over the blade ----
    // A rudder needs flow past it, which is why wayOn exists. But a skipper turning in her own
    // length does not wait for way on — she works the throttle against the helm and steers on prop
    // wash, and at a standstill that is ALL she has. Without it a three-point turn in a 60 m
    // channel was a fight, which is exactly the note this round. wash is gone by 9 m/s, so racing
    // feel above walking pace is untouched, measured: at 5 m/s and above wayOn still wins.
    const steerAuthority = boat.airborne ? 0.25 : 1;
    const wayOn = U().clamp(speed / 6.5, 0.12, 1);
    const wash = (0.30 + 0.55 * U().clamp(ctl.throttle + ctl.brake, 0, 1)) *
                 (1 - U().smoothstep(2.5, 9.0, speed));
    // The top-end steering tax is per hull (spec.highSpeed; 0.34 was flat): it is what makes the
    // roster more than a top-speed ladder — the jetski keeps 90% of her wheel at top, the
    // podracer 45% — and it is the reason her 61 m/s does not win every bend.
    const highSpeed = 1 - U().clamp(speed / topSpeed, 0, 1) * (spec.highSpeed == null ? 0.34 : spec.highSpeed);
    const planeTurn = 1 + planeF * 0.22;                              // a planing hull pivots flatter
    const speedFactor = Math.max(wayOn, boat.airborne ? 0 : wash) * highSpeed * planeTurn;
    // Backing down, the ROTATION still follows the stick: push left and her head comes left. The
    // physically faithful thing is to invert it — a hull going astern steers from her stern, the
    // way a car does in reverse — and it was in here, and from a chase camera it read as the boat
    // ignoring you.
    const targetAng = ctl.steer * spec.turn * speedFactor * steerAuthority;
    // asymmetric: bite hard into the turn, let the wheel unwind lazily. This is where punch lives.
    // Turn-in 15 (was 11): with the key ramp at 12 the key-to-90%-yaw is 0.30 s on the jetski,
    // measured, against 0.38-0.53 — and the input ramp alone could not get there under 0.32.
    const turningIn = Math.abs(targetAng) > Math.abs(boat.angVel);
    boat.angVel = U().damp(boat.angVel, targetAng, turningIn ? 15.0 : 6.5, dt);
    // Hold on to the yaw actually integrated this frame — the hull-tracking term below has to turn
    // the velocity through exactly this angle, and boat.angVel is scrubbed again three lines down
    // on a bump frame, which would silently desync the two.
    const dHead = boat.angVel * dt;
    boat.heading = U().wrapAngle(boat.heading + dHead);

    // a real hit costs you the wheel for a beat — 0.55 per 60 Hz frame, so the same wheel at 20 Hz
    if (boat.bumpRecover > 0) boat.angVel *= Math.pow(0.55, dt * 60);
    boat.bumpRecover = Math.max(0, (boat.bumpRecover || 0) - dt);
    boat.scrapeT = Math.max(0, (boat.scrapeT || 0) - dt);
    boat.contactT = Math.max(0, (boat.contactT || 0) - dt);
    boat.catchCool = Math.max(0, (boat.catchCool || 0) - dt);

    // turning scrubs speed (harder for low-grip hulls: x1.15 runabout, x1.9 F1, x2.15 podracer,
    // and nothing extra above grip 4, so the BELLE is untouched)
    const scrub = Math.abs(boat.angVel) * speed * 0.028 * (4 / (spec.grip + 1)) *
      (1 + 2 * Math.max(0, 1 - spec.grip / 4));
    if (speedF > 0) speedF -= scrub * dt;

    // ---- longitudinal forces ----
    if (!boat.airborne) {
      // the hump term is the whole personality: at planeF 0.5 the FORMULA drags 2.2x, then the
      // resistance collapses and it surges. Drafting in a wake trough cuts it further.
      // Quadratic drag is normalised to the CURRENT topSpeed, not spec.top: throttle*accel = drag*v^2
      // settles at exactly the normalising speed, so anything that moves topSpeed — boost, the
      // full-tank bonus, the AI rubber band — has to appear here or it changes nothing at all.
      // (The 6 m/s^2 blow-off below is a ceiling; it only ever bites on the way DOWN.)
      const drag = (accel / (topSpeed * topSpeed)) *
        (1 + (spec.hump || 0) * hump * 2.2) * (1 - (boat.draft || 0) * 0.28);
      speedF += ctl.throttle * accel * dt;
      speedF -= drag * speedF * Math.abs(speedF) * dt;
      // Engine braking / skin friction goes with the wetted surface. A hull up on plane at racing
      // speed has almost none, so a lift is a COAST — from settled top to half speed in 1.9 (jetski)
      // to 3.6 s (FORMULA), measured, against 1.0-1.3 s when the 0.35 ran at every speed and every
      // lift was a 2.6 g brake. She gets it back as she sits down below 45% of top (the hover hull
      // has no plane to come off, hence the speed fade), so she still stops in the harbour. The
      // BELLE never planes and keeps the whole 0.35. Part throttle now settles on the drag law
      // alone: sqrt(throttle) of top — 0.81 for a 10% trim. ai.js's throttle caps read that law.
      const skin = 0.35 * (1 - planeF * U().smoothstep(0.15 * topSpeed, 0.45 * topSpeed, speed));
      speedF -= skin * speedF * dt * (1 - ctl.throttle);
      if (ctl.brake > 0) {
        // 1.5x accel (was 1.15): top to half speed in 0.5-0.9 s, so S is the fast way down, not
        // a 50% bonus on top of a lift that already did the braking. (The BELLE keeps 1.15 —
        // spec.brakeBite — she has no brakes to speak of and her handling is measured.)
        if (speedF > 0.5) speedF -= ctl.brake * accel * (spec.brakeBite == null ? 1.5 : spec.brakeBite) * dt;
        // Astern. 0.30 of her top end and a stern gear that engages in about a second: nobody is
        // going to RACE backwards, but getting out of a dead end has to be a manoeuvre, not a
        // sentence. (Was 0.22 and less than half this bite, which is why it felt like being towed.)
        else speedF = Math.max(-spec.top * 0.30, speedF - ctl.brake * accel * 0.62 * dt);
      }
      // lateral grip. Planing shrinks the wetted area, so the hull genuinely holds less.
      const gripEff = spec.grip * (1 - 0.30 * planeF);
      speedL *= Math.exp(-gripEff * dt);
      // ---- she goes where she points ----
      // The velocity below is rebuilt in THIS frame's basis, so unless something carries it round
      // with the yaw, the heading simply rotates out from under it and the only thing that ever
      // re-aligns the two is gripEff. That is a first-order lag, and at racing speed it is enormous:
      // measured, the hull ran 26-34 deg of slip at full lock — a quarter turn of crab between where
      // her nose points and where she is actually going, in every corner, all race. The old stern
      // step-out (speedL += ctl.steer * speed * 0.075 * slipGain) then pushed that same lateral
      // velocity further the way the wheel was already going, so hard cornering was a sideways skate
      // that also ate half the speed. Both are what "left is right and right is left" felt like.
      //
      // A keel with water on it carries the velocity round with the hull, so rotate the velocity by
      // the yaw instead of waiting for a damper to mop it up. `bite` is the fraction of this frame's
      // yaw the water actually takes her through; 1.0 tracks true.
      //
      // What she gives up is slipGain, and only there: on plane (planeF), near her top end
      // (speed/topSpeed), with real lock on (|steer|), on a hull the roster calls loose (spec.drift).
      // That keeps the whole spread — measured at full lock and settled speed, the LAKESIDE QUEEN
      // slips 4.0 deg, the FORMULA 5.0, the CFD RIB 5.0, the F1H2O 6.8, the BLACKHAWK 8.8 and the
      // PODRACER 10.8 — a trace of slide at the limit and nothing at all in an ordinary corner
      // (1.0-3.0 deg at half lock, where the old model was already at 12-15).
      // 0.34 is measured, not taste: 0.20 leaves three of six hulls unable to break traction at all,
      // 0.50 is back to a 16 deg crab on the loose hulls.
      const slipGain = (spec.drift || 0.5) * planeF *
        U().clamp(speed / topSpeed, 0, 1) * Math.abs(ctl.steer);
      const bite = dHead * (1 - 0.34 * slipGain);
      const cb = Math.cos(bite), sb = Math.sin(bite);
      const carried = speedF * cb - speedL * sb;              // exact rotation, not the small-angle
      speedL = speedF * sb + speedL * cb;                     // form, which grows |v| ~10%/s at lock
      speedF = carried;
      // (The astern pivot walk that used to sit here — speedL damped toward boat.angVel * a stern
      // arm, so the centre of mass crabbed sideways while backing — is gone. It cost 25-38 deg of
      // slip going astern AND about half the sternway the gear had just given you, so getting out
      // of a dead end read as the boat wandering off on her own. She now backs along her own keel
      // like she does everything else: 0.5-5.4 deg of slip astern under full lock.)
      // ---- the slide, and the catch ----
      // A slide is lateral velocity above a per-hull threshold at racing speed. The CATCH is
      // steering toward the side the velocity lies on — positive steer is port, and the velocity
      // lies to port when speedL is positive, so the catch is sign(steer) === sign(speedL). (It was
      // !==, which is the opposite: holding lock INTO a corner pushes the velocity wide, to the
      // outside, and that read as 'drifting' 90-96% of the time at full lock and paid a capped
      // 0.50 per 6 s for doing nothing skilful.) The catch is worth grip and boost; sliding wide is
      // worth nothing. Pay is per catch, not per second: once, after >= 0.25 s of slide, sized by
      // the slip (0.05 + 0.015/m/s, cap 0.20), never twice in 2 s, and only to a human — ai.js's
      // pilots do not weave for boost. boat.drifting is the catch itself (the HUD's DRIFT chip).
      const slideAt = 2.2 * (spec.drift || 0.5);
      const sliding = Math.abs(speedL) > slideAt && speed > 0.6 * topSpeed;
      const catching = sliding && Math.abs(ctl.steer) > 0.3 && Math.sign(ctl.steer) === Math.sign(speedL);
      if (sliding) boat.slideT = (boat.slideT || 0) + dt;
      else { boat.slideT = 0; boat.slidePaid = false; }
      boat.drifting = catching;
      if (catching) {
        speedL *= Math.exp(-gripEff * 0.55 * dt);            // extra bite while catching it
        boat.driftTime = (boat.driftTime || 0) + dt;
        if (boat.isPlayer && !boat.slidePaid && boat.slideT >= 0.25 && boat.catchCool <= 0) {
          const pay = Math.min(0.20, 0.05 + 0.015 * Math.min(8, Math.abs(speedL)));
          const slipDeg = Math.atan2(Math.abs(speedL), Math.abs(speedF)) * 180 / Math.PI;
          boat.boostEnergy = Math.min(1, boat.boostEnergy + pay);
          boat.slidePaid = true; boat.catchCool = 2.0;
          boat.lastPay = { kind: 'catch', amount: pay, t };
          if (boat.onCatch) boat.onCatch(pay, slipDeg);
        }
      } else {
        boat.driftTime = Math.max(0, (boat.driftTime || 0) - dt * 2.5);
      }
    } else {
      speedF -= 0.12 * speedF * dt;                          // just air drag
      boat.drifting = false;
      // airtime pays 0.20/s (was 0.10) now that the trickle only runs flat out; the stint's total
      // is reported as one pay on splashdown so the HUD can print a number, not a blur
      const airPay = Math.min(1 - boat.boostEnergy, 0.20 * dt);
      boat.boostEnergy += airPay;
      boat._airPay = (boat._airPay || 0) + airPay;
    }
    // releasing boost decays instead of snapping: 6 m/s^2 blow-off
    if (speedF > topSpeed) speedF -= Math.min(speedF - topSpeed, 6.0 * dt);

    boat.vel.x = fx * speedF + fz * speedL;
    boat.vel.z = fz * speedF - fx * speedL;
    boat.pos.x += boat.vel.x * dt;
    boat.pos.z += boat.vel.z * dt;
    // river current, from last frame's channel tangent (see RR.River.flow)
    boat.pos.x += boat.flowX * dt;
    boat.pos.z += boat.flowZ * dt;

    // ---- vertical: ride the analytic wave field ----
    const amp = RR.River.waveAmp(boat.pos.x, boat.pos.z);
    U().waterNormalPitchRoll(boat.pos.x, boat.pos.z, t, amp, wn, boat.hullLen);
    const rideY = wn.h + 0.10 + planeF * (spec.lift == null ? 0.28 : spec.lift) + (spec.hover || 0);

    // hull slap: a planing hull crossing chop slams once per wave it meets, so the rate is the
    // ENCOUNTER frequency — speed over crest spacing — and crest spacing grows with fetch. The
    // river's boat-wake slop is metres apart; Lake Michigan's swell runs 120-185 m crest to crest,
    // so out there the hull pounds about once a second, hard, instead of buzzing at 7 Hz.
    const slapAmp = (spec.slap || 0) * planeF * amp * U().clamp(speed / topSpeed, 0.15, 1);
    if (!boat.airborne && slapAmp > 0.06) {
      const chopLen = 7.5 + (amp - 1) * 40;                  // 7.5 m in the canyon, ~99 m on open lake
      boat.slapPhase += dt * (0.8 + speed / chopLen);
      if (boat.slapPhase >= 1) {
        boat.slapPhase -= 1;
        boat.slapT = SLAP_LIFE;                              // 130 ms of visible shudder
        if (boat.onSlap) boat.onSlap(U().clamp(slapAmp * 0.9, 0, 1));
      }
    }
    boat.slapT = Math.max(0, boat.slapT - dt);

    if (!boat.airborne) {
      // launch off steep lake swells at speed. One launch per face: re-arm only after the hull is
      // back on level water, or it re-triggers the instant it lands and chatters up a long swell
      // in a string of 20 cm hops.
      // Thresholds track the swell: the lake face is ~1.6x steeper than it used to be, so 0.024
      // would now trip on every second crest and the lake would be one long involuntary hop.
      const relSlope = -(wn.pitch * fz + wn.roll * fx);
      if (relSlope < 0.013) boat.launchArmed = true;
      // The 0.10 tolerance is not slop: pos.y chases rideY through a rate-14 damper, and on a face
      // dropping at 2 m/s it legitimately trails ~0.15 m behind. Hold it at the old 0.05 and the
      // gate silently rejects exactly the steep descending faces it exists to catch.
      if (boat.launchArmed && speed > topSpeed * 0.7 && relSlope > 0.030 && amp > 2 && boat.pos.y <= rideY + 0.10) {
        boat.airborne = true;
        boat.launchArmed = false;
        // rarer crests, so each one throws harder — but capped, or a big face at 35 m/s is 8 m of air
        boat.vy = Math.min(7.0, speed * relSlope * 3.0 + 1.2);
        if (boat.onLaunch) boat.onLaunch(speed);
      } else {
        boat.pos.y = U().damp(boat.pos.y, rideY, 14, dt);
        boat.vy = 0;
      }
    }
    if (boat.airborne) {
      boat.airTime += dt;
      boat.vy -= 9.8 * dt;
      boat.pos.y += boat.vy * dt;
      if (boat.pos.y <= rideY) {
        boat.pos.y = rideY;
        const impact = Math.min(1, -boat.vy * 0.14 + boat.airTime * 0.2);
        boat.airborne = false; boat.airTime = 0; boat.vy = 0;
        if ((boat._airPay || 0) > 0.005) boat.lastPay = { kind: 'air', amount: boat._airPay, t };
        boat._airPay = 0;
        if (boat.onSplashdown) boat.onSplashdown(impact);
      }
    }

    // ---- no ceiling ----
    // A boat ON THE WATER was never in reach of a bascule: 5.8 m of soffit over two metres of
    // freeboard, so the safe line under a closed span has always cost nothing. Airborne off a ramp
    // it used to clip the deck, and that was fair only while the salute existed and the player was
    // the one who had asked for the span. With the salute retired, a leaf that happens to be down
    // is a cycle nobody can influence, so clipping it would be punishment for the game's own
    // timing. Ramps launch clean over — and through — the span again.
    // (RR.Bridges.clearanceAt still exists; nothing here calls it.)

    // ---- jump ramps: ride up the wedge, launch off the lip (speed sets the arc) ----
    if (RR.Ramps) {
      const r = RR.Ramps.query(boat.pos.x, boat.pos.z);
      // The deck is a run-up, not a step: she is on it only if she is RUNNING it — velocity within
      // ~45 deg of the ramp axis (0.7 of speed) — or already climbing from the foot (took the deck
      // at prog < 0.3). Clipping a flank at 90 deg used to pop her 3 m up the wedge and back down.
      const spR = r ? Math.hypot(boat.vel.x, boat.vel.z) : 0;
      const running = r && (boat.vel.x * r.dirx + boat.vel.z * r.dirz >= 0.7 * spR ||
        (boat._ramp && boat._rampAcq < 0.3));
      if (running) {
        if (boat.pos.y <= r.y + 0.6) {
          boat.pos.y = r.y;
          boat.airborne = false; boat.vy = 0; boat.airTime = 0;
          if (!boat._ramp) boat._rampAcq = r.prog;
          boat._ramp = r;
        }
      } else if (boat._ramp) {
        const sp = Math.hypot(boat.vel.x, boat.vel.z);
        const fwd = boat.vel.x * boat._ramp.dirx + boat.vel.z * boat._ramp.dirz;
        if (boat._ramp.prog > 0.65 && fwd > 5) {          // went over the lip, not off the side
          boat.airborne = true;
          boat.vy = sp * boat._ramp.slope * 1.25 + 1.6;
          boat.airTime = 0;
          if (boat.onLaunch) boat.onLaunch(sp);
        }
        boat._ramp = null;
      }
    }

    // ---- collisions: banks, obstacles, walls ----
    const wq = RR.River.waterQuery(boat.pos.x, boat.pos.z, boat.hint);
    boat.water = wq;
    const clear = wq.clear - boat.radius * 0.6;
    if (clear < 0) {
      boat.pos.x += wq.nx * -clear;
      boat.pos.z += wq.nz * -clear;
      // The lock is the one 'bank' that is a genuine wall — eight metres of Corps of Engineers
      // concrete with a timber rub strip bolted to it — so it throws you back a little harder
      // than a sheet-pile quay does. The graze is still cheap: P.bounce scales everything by how
      // squarely you hit, which is what keeps a 24 m chamber passable at racing pace.
      P.bounce(boat, wq.nx, wq.nz, wq.path === 'lock' ? 0.36 : 0.28, dt);
      poleOff(boat, wq.nx, wq.nz, ctl, dt);
    }
    // Obstacles are capsules a couple of metres thick and dt can reach 50 ms on a bad frame, which
    // at speed is a stride long enough to step straight over a pier or a guide wall. When the step
    // gets that long, sweep the midpoint first: cheap, and it is the difference between a wall and
    // a wall that mostly works.
    const stepLen = Math.hypot(boat.vel.x + boat.flowX, boat.vel.z + boat.flowZ) * dt;
    if (stepLen > 1.2) {
      const mid = RR.River.hitObstacle(boat.pos.x - boat.vel.x * dt * 0.5, boat.pos.z - boat.vel.z * dt * 0.5,
        boat.radius * 0.55);
      if (mid) {
        boat.pos.x += mid.nx * mid.pen - boat.vel.x * dt * 0.5;
        boat.pos.z += mid.nz * mid.pen - boat.vel.z * dt * 0.5;
        P.bounce(boat, mid.nx, mid.nz, 0.40, dt);
      }
    }
    const ob = RR.River.hitObstacle(boat.pos.x, boat.pos.z, boat.radius * 0.55);
    if (ob) {
      boat.pos.x += ob.nx * ob.pen;
      boat.pos.z += ob.nz * ob.pen;
      P.bounce(boat, ob.nx, ob.nz, 0.40, dt);             // pier fender: slightly livelier
      poleOff(boat, ob.nx, ob.nz, ctl, dt);
    }
    // cache this frame's current for the next integration step (wq aliases a shared scratch)
    const flow = RR.River.flow || 0;
    if (flow && wq.q && wq.path !== 'lake') { boat.flowX = wq.q.tx * flow; boat.flowZ = wq.q.tz * flow; }
    else { boat.flowX = 0; boat.flowZ = 0; }

    // ---- visual attitude: trim, torque roll, bow dive ----
    // throttle-off bow dive: chop the throttle at speed and the bow drops as the hull re-wets
    const dTh = (ctl.throttle - boat.prevThrottle) / Math.max(dt, 1e-4);
    boat.prevThrottle = ctl.throttle;
    if (dTh < -3.5 && planeF > 0.5) boat.diveT = 0.42;
    boat.diveT = Math.max(0, boat.diveT - dt);

    // Sign convention: mesh.rotateX(visPitch) — NEGATIVE visPitch = bow UP.
    const accelPitch = U().clamp((ctl.throttle * accel - ctl.brake * accel) * 0.012, -0.1, 0.16);
    const trim = -0.18 * hump          // climbing the hump: the bow rears ~10 degrees
               + 0.020 * planeF;       // settled on plane: the bow tucks down, running flat
    const dive = (spec.dive || 0.10) * U().smoothstep(0, 0.42, boat.diveT);
    // The old blanket speed-trim reared the bow at EVERY speed, which swamped the hump — the boat
    // sat at 10 deg nose-up all the way to the top end. A planing hull runs flat, so fade it out
    // as the hull comes up and the hump becomes the only place the bow really rears.
    let targetPitch = boat.airborne ? -0.12
      : (-accelPitch - wn.pitch * 1.7 * fz - wn.roll * 1.7 * fx) * 0.5
        - Math.min(0.14, speed * 0.004) * (1 - planeF * 0.75) + trim + dive;
    if (boat._ramp) targetPitch = -boat._ramp.slope * 1.15;   // nose-up climbing the wedge

    // prop torque reaction: a right-hand prop rolls the hull to port under load. It vanishes on
    // plane, where the boat rides its own lift instead of hanging off the shaft.
    const torque = -(spec.torque || 0) * ctl.throttle * (1 - planeF * 0.6);
    // 1.7 / 1.5 on a swell-only slope lands on the same peak-to-peak attitude the old 1.4 / 1.2
    // reached against the full field — same size of motion, none of the ripple frequency in it.
    const targetRoll = ctl.steer * spec.lean * U().clamp(speed / 14, 0, 1)
                     + (wn.roll * fz - wn.pitch * fx) * 1.5 + torque;

    boat.visPitch = U().damp(boat.visPitch, targetPitch, 5, dt) +
                    boat.slapT * 0.26 * Math.sin(boat.slapT * SLAP_W);
    boat.visRoll = U().damp(boat.visRoll, targetRoll, 5, dt);

    // ---- engine rpm for audio ----
    const load = U().clamp(Math.abs(speedF) / topSpeed, 0, 1);
    boat.rpm = U().damp(boat.rpm, U().clamp(ctl.throttle * 0.55 + load * 0.45 + (boosting ? 0.12 : 0), 0.06, 1.15), 4, dt);

    boat.crashTimer = Math.max(0, boat.crashTimer - dt);
  };

  // Separate the normal and the tangent. Bounce the normal, but only SCRUB the tangent, and only
  // in proportion to how squarely you hit — a 5-degree graze off the seawall should cost almost
  // nothing, which is the difference between a river and a bumper-car track.
  // dt: the scrub is an IMPULSE on the first frame of a contact and a RATE while it lasts. It used
  // to be the impulse on every frame, so leaning on a quay pinned every hull at accel*dt/0.06 —
  // 4.8 m/s at 60 Hz, 10.5 m/s at the engine's 20 Hz clamp, measured: a phone got a gentler wall.
  P.bounce = function (boat, nx, nz, restitution, dt) {
    const vn = boat.vel.x * nx + boat.vel.z * nz;
    if (vn >= 0) return;
    if (dt == null) dt = 1 / 60;
    const speed = Math.hypot(boat.vel.x, boat.vel.z);
    const incidence = speed > 0.01 ? Math.min(1, -vn / speed) : 1;   // 0 = graze, 1 = head-on
    const fx = Math.sin(boat.heading), fz = Math.cos(boat.heading);
    const fwd = boat.vel.x * fx + boat.vel.z * fz;                    // signed: astern is negative
    const severity = Math.min(1, -vn / 18);
    // SHIELD (powerups.js raises boat.shielded while one is up): a hard hit — severity > 0.45,
    // 8 m/s into the wall — is absorbed: no scrub, a firm 0.5 bounce, no lost wheel, and
    // boat.shieldHit tells powerups.js to spend the bubble. A softer touch bounces as normal and
    // keeps it, so a quay scrape no longer eats the leader's most common draw.
    const absorbed = !!boat.shielded && severity > 0.45;

    const tx = boat.vel.x - vn * nx, tz = boat.vel.z - vn * nz;
    const sustained = (boat.contactT || 0) > 0;
    // In sustained contact vn is what the frame accumulated, so the incidence the rate sees is
    // normalised to a 60 Hz frame — otherwise a 20 Hz step reads 3x squarer and scrubs harder.
    const incS = speed > 0.01 ? Math.min(1, -vn / (60 * dt) / speed) : 1;
    let keep = sustained ? Math.exp(-(3.6 + 37 * incS * incS) * dt)          // same loss per second at 60 Hz
                         : 1 - 0.06 - 0.62 * incidence * incidence;          // 94% @ 0deg, 32% @ 90deg
    if (absorbed) { keep = 1; restitution = 0.5; }
    const rvn = -restitution * vn;
    boat.vel.x = tx * keep + nx * rvn;
    boat.vel.z = tz * keep + nz * rvn;
    boat.contactT = 0.12;                                              // sustained until 0.12 s without a touch

    // which way along the wall is 'ahead' — the HULL's forward vector, not the velocity: on the
    // velocity a hull backing along the quay was swung 170-180 deg onto her stern-ward tangent
    // (measured, walltrace case D), and the most common recovery in the game flipped the boat.
    // || 1 covers a nose dead square on.
    const along = Math.sign(-nz * fx + nx * fz) || 1;
    const wallHead = Math.atan2(-nz * along, nx * along);
    // wall-follow assist: at shallow incidence, nudge the heading parallel to the quay so the hull
    // slides down the seawall instead of sticking and spinning. Ahead only (fwd > 0.2 — a hull
    // pivoting off a pin has 0.5 m/s of way on when this first fires): astern the plain
    // reflection is enough, and it does not turn her round.
    if (incidence < 0.30 && fwd > 0.2) {
      boat.heading = U().wrapAngle(boat.heading +
        U().wrapAngle(wallHead - boat.heading) * Math.min(1, 5.0 * (0.30 - incidence)));
      boat.scrapeT = 0.20;                                           // sustained concrete scrape
    }
    // shoulder-off: the counterpart of the graze assist for a nose-in at a grind. A hull square
    // on with the throttle held sat at 2-3 m/s for 5-7 s, measured. It keys on how squarely the
    // BOW points into the wall (bowIn), not the velocity's incidence, which in a sustained grind
    // is the sliver the last frame's thrust added. Rotate her toward the tangent her bow already
    // leans to — but NEVER against a player's wheel (physics.update's feel rule: from a chase
    // camera a hull that turns on her own reads as the boat ignoring you), so it is for ai.js
    // pilots and a player who is not steering.
    const bowIn = -(fx * nx + fz * nz);                                 // 1 = bow square into the wall
    if (bowIn > 0.5 && !absorbed && Math.hypot(boat.vel.x, boat.vel.z) < 5 &&
        (!boat.isPlayer || boat._steerMag < 0.2)) {
      boat.heading = U().wrapAngle(boat.heading +
        U().wrapAngle(wallHead - boat.heading) * (1 - Math.exp(-21 * bowIn * dt)));   // 0.35*bowIn of the way per 60 Hz frame
      boat.bumpRecover = Math.max(boat.bumpRecover || 0, 0.15);
    }

    if (absorbed) boat.shieldHit = Math.max(boat.shieldHit || 0, severity);
    if (severity > 0.12 && boat.crashTimer <= 0) {
      boat.crashTimer = 0.35;
      if (!absorbed) boat.bumpRecover = Math.max(boat.bumpRecover || 0, 0.18 + severity * 0.40);
      if (boat.onCrash) boat.onCrash(severity, nx, nz);
    }
  };

  // drafting: sitting in another hull's wake trough cuts drag. 4-22 m astern, within 3.5 m lateral.
  function draftPair(me, you) {
    const fx = Math.sin(me.heading), fz = Math.cos(me.heading);
    const ddx = you.pos.x - me.pos.x, ddz = you.pos.z - me.pos.z;
    const along = ddx * fx + ddz * fz, lat = ddx * fz - ddz * fx;
    if (along > 4 && along < 22 && Math.abs(lat) < 3.5) {
      me._draftHit = Math.max(me._draftHit || 0, 1 - (along - 4) / 18);
    }
  }

  // boat-vs-boat circle collisions + the drafting sweep (same O(n^2) loop — never a second one).
  // dt is optional (defaults to one frame) so older two-arg call sites keep working.
  P.collidePairs = function (boats, dt) {
    if (dt == null) dt = 1 / 60;
    for (let i = 0; i < boats.length; i++) {
      for (let j = i + 1; j < boats.length; j++) {
        const a = boats[i], b = boats[j];
        draftPair(a, b); draftPair(b, a);
        if (Math.abs(a.pos.y - b.pos.y) > 3) continue;       // a boat sailing overhead clears the one below
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const rr = (a.radius + b.radius) * 1.06;             // contact registers as the hulls visually touch
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const nx = dx / d, nz = dz / d;
          const ma = a.mass || 1, mb = b.mass || 1, inv = 1 / (ma + mb);
          // positional separation — the lighter hull gives way more
          const pen = rr - d;
          a.pos.x -= nx * pen * (mb * inv); a.pos.z -= nz * pen * (mb * inv);
          b.pos.x += nx * pen * (ma * inv); b.pos.z += nz * pen * (ma * inv);
          const rvx = b.vel.x - a.vel.x, rvz = b.vel.z - a.vel.z;
          const vn = rvx * nx + rvz * nz;
          if (vn < 0) {
            const e = 0.42;                                  // restitution: give the shove some pop
            const jimp = -(1 + e) * vn * ma * mb * inv;
            a.vel.x -= nx * jimp / ma; a.vel.z -= nz * jimp / ma;
            b.vel.x += nx * jimp / mb; b.vel.z += nz * jimp / mb;
            // lateral shove knocks a rival off their racing line on glancing hits
            const tx = -nz, tz = nx, shove = (rvx * tx + rvz * tz) * 0.3;
            a.vel.x -= tx * shove * (mb * inv); a.vel.z -= tz * shove * (mb * inv);
            b.vel.x += tx * shove * (ma * inv); b.vel.z += tz * shove * (ma * inv);
            // small yaw kick so a solid hit visibly spins them
            const yaw = U().clamp(-vn * 0.02, 0, 0.45);
            a.angVel -= yaw * (mb * inv); b.angVel += yaw * (ma * inv);
            const sev = Math.min(1, -vn / 11);
            if (sev > 0.1) {
              if (a.onBump) a.onBump(sev, -nx, -nz);          // fire for BOTH; per-boat handler decides player vs AI
              if (b.onBump) b.onBump(sev, nx, nz);
            }
          }
        }
      }
    }
    for (let i = 0; i < boats.length; i++) {
      const b = boats[i];
      b.draft = U().damp(b.draft || 0, b._draftHit || 0, 4, dt);
      b._draftHit = 0;
    }
  };

  P.applyVisual = function (boat) {
    const m = boat.mesh;
    m.position.copy(boat.pos);
    m.rotation.set(0, 0, 0);
    m.rotateY(boat.heading);
    m.rotateX(boat.visPitch);
    m.rotateZ(-boat.visRoll);
    if (m.userData.tick) m.userData.tick(RR.Engine.time(), boat);   // animated parts (podracer turbines/plasma)
  };

  RR.Physics = P;
})();

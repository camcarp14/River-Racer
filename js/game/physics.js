/* River Racer — arcade boat hydrodynamics, collisions, wave riding */
(function () {
  const P = {};
  const U = () => RR.U;
  const wn = { pitch: 0, roll: 0, h: 0 };

  P.createBoat = function (spec, mesh) {
    return {
      spec, mesh,
      pos: new THREE.Vector3(0, 0, 0),
      vel: { x: 0, z: 0 },
      heading: 0, angVel: 0,
      vy: 0, airborne: false, airTime: 0,
      boostEnergy: 1, boostHeat: 0,
      rpm: 0,
      visRoll: 0, visPitch: 0,
      radius: (mesh.userData.size ? mesh.userData.size.r : 2) * 0.7,
      mass: spec.mass || 1,
      bumpRecover: 0,
      hint: {},
      water: null,          // last waterQuery result snapshot
      wakePhase: Math.random() * 10,
      crashTimer: 0,
      isPlayer: false,
      finished: false,
    };
  };

  // ctl: {throttle 0..1, brake 0..1, steer -1..1, boost bool}
  P.update = function (boat, dt, ctl, t) {
    const spec = boat.spec;

    // ---- boost meter: drains fast, regens slow — a resource you spend on straights and jumps.
    // Engaging needs a real reserve (0.15) but once lit it burns down to fumes (hysteresis).
    const canEngage = boat.boostEnergy > (boat.boostHeat > 0.3 ? 0.02 : 0.15);
    const boosting = ctl.boost && ctl.throttle > 0.3 && canEngage && !boat.finished;
    if (boosting) boat.boostEnergy = Math.max(0, boat.boostEnergy - dt * 0.38);
    else boat.boostEnergy = Math.min(1, boat.boostEnergy + dt * 0.085);
    boat.boostHeat = U().damp(boat.boostHeat, boosting ? 1 : 0, 6, dt);

    const topSpeed = spec.top * (boosting ? spec.boost : 1);
    const accel = spec.accel * (boosting ? spec.boost : 1);

    const fx = Math.sin(boat.heading), fz = Math.cos(boat.heading);
    let speedF = boat.vel.x * fx + boat.vel.z * fz;         // signed forward speed
    let speedL = boat.vel.x * fz - boat.vel.z * fx;          // lateral slip
    const speed = Math.hypot(boat.vel.x, boat.vel.z);

    // ---- steering: effective only with water under the hull and way on ----
    const steerAuthority = boat.airborne ? 0.25 : 1;
    const speedFactor = U().clamp(speed / 7, 0.15, 1) * (1 - U().clamp(speed / topSpeed, 0, 1) * 0.28);
    const targetAng = ctl.steer * spec.turn * speedFactor * steerAuthority * (speedF < -0.5 ? -1 : 1);
    boat.angVel = U().damp(boat.angVel, targetAng, 7, dt);
    boat.heading = U().wrapAngle(boat.heading + boat.angVel * dt);

    // turning scrubs speed (harder for low-grip hulls)
    const scrub = Math.abs(boat.angVel) * speed * 0.028 * (4 / (spec.grip + 1));
    speedF -= scrub * dt * speedF > 0 ? scrub * dt : 0;

    // ---- longitudinal forces ----
    if (!boat.airborne) {
      const drag = accel / (spec.top * spec.top);            // quadratic drag sized to top speed
      speedF += ctl.throttle * accel * dt;
      speedF -= drag * speedF * Math.abs(speedF) * dt;
      speedF -= 0.35 * speedF * dt * (1 - ctl.throttle);     // engine braking / water friction
      if (ctl.brake > 0) {
        if (speedF > 0.5) speedF -= ctl.brake * accel * 1.15 * dt;
        else speedF = Math.max(-spec.top * 0.22, speedF - ctl.brake * accel * 0.45 * dt); // reverse
      }
      // lateral grip
      speedL *= Math.exp(-spec.grip * dt);
      // drift kick: hard steering at speed sheds the stern outward a touch
      speedL += ctl.steer * speed * 0.055 * dt * (3.6 - spec.grip);
    } else {
      speedF -= 0.12 * speedF * dt;                          // just air drag
    }
    if (speedF > topSpeed) speedF = U().lerp(speedF, topSpeed, Math.min(1, 2.5 * dt));

    boat.vel.x = fx * speedF + fz * speedL;
    boat.vel.z = fz * speedF - fx * speedL;
    boat.pos.x += boat.vel.x * dt;
    boat.pos.z += boat.vel.z * dt;

    // ---- vertical: ride the analytic wave field ----
    const amp = RR.River.waveAmp(boat.pos.x, boat.pos.z);
    U().waterNormalPitchRoll(boat.pos.x, boat.pos.z, t, amp, wn);
    const rideY = wn.h + 0.12 + Math.min(0.35, speed * 0.012) + (spec.hover || 0);   // planing lift + any hover cushion
    if (!boat.airborne) {
      // launch off steep lake swells at speed
      const relSlope = -(wn.pitch * fz + wn.roll * fx);
      if (speed > topSpeed * 0.7 && relSlope > 0.028 && amp > 2 && boat.pos.y <= rideY + 0.05) {
        boat.airborne = true;
        boat.vy = speed * relSlope * 2.1 + 1.2;
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
        if (boat.onSplashdown) boat.onSplashdown(impact);
      }
    }

    // ---- jump ramps: ride up the wedge, launch off the lip (speed sets the arc) ----
    if (RR.Ramps) {
      const r = RR.Ramps.query(boat.pos.x, boat.pos.z);
      if (r) {
        if (boat.pos.y <= r.y + 0.6) {
          boat.pos.y = r.y;
          boat.airborne = false; boat.vy = 0; boat.airTime = 0;
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
      P.bounce(boat, wq.nx, wq.nz, 0.35);
    }
    const ob = RR.River.hitObstacle(boat.pos.x, boat.pos.z, boat.radius * 0.55);
    if (ob) {
      boat.pos.x += ob.nx * ob.pen;
      boat.pos.z += ob.nz * ob.pen;
      P.bounce(boat, ob.nx, ob.nz, 0.45);
    }

    // ---- visual attitude ----
    const accelPitch = U().clamp((ctl.throttle * accel - ctl.brake * accel) * 0.012, -0.1, 0.16);
    let targetPitch = boat.airborne ? -0.12 : (-accelPitch - wn.pitch * 1.4 * (fz) - wn.roll * 1.4 * fx) * 0.5 - Math.min(0.14, speed * 0.004);
    if (boat._ramp) targetPitch = -boat._ramp.slope * 1.15;   // nose-up climbing the wedge
    const targetRoll = ctl.steer * spec.lean * U().clamp(speed / 14, 0, 1) + (wn.roll * fz - wn.pitch * fx) * 1.2;
    boat.visPitch = U().damp(boat.visPitch, targetPitch, 5, dt);
    boat.visRoll = U().damp(boat.visRoll, targetRoll, 5, dt);

    // ---- engine rpm for audio ----
    const load = U().clamp(Math.abs(speedF) / topSpeed, 0, 1);
    boat.rpm = U().damp(boat.rpm, U().clamp(ctl.throttle * 0.55 + load * 0.45 + (boosting ? 0.12 : 0), 0.06, 1.15), 4, dt);

    boat.crashTimer = Math.max(0, boat.crashTimer - dt);
  };

  P.bounce = function (boat, nx, nz, restitution) {
    const vn = boat.vel.x * nx + boat.vel.z * nz;
    if (vn < 0) {
      boat.vel.x -= (1 + restitution) * vn * nx;
      boat.vel.z -= (1 + restitution) * vn * nz;
      boat.vel.x *= 0.82; boat.vel.z *= 0.82;
      const severity = Math.min(1, -vn / 18);
      if (severity > 0.12 && boat.crashTimer <= 0) {
        boat.crashTimer = 0.35;
        if (boat.onCrash) boat.onCrash(severity, nx, nz);
      }
    }
  };

  // boat-vs-boat circle collisions
  P.collidePairs = function (boats) {
    for (let i = 0; i < boats.length; i++) {
      for (let j = i + 1; j < boats.length; j++) {
        const a = boats[i], b = boats[j];
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

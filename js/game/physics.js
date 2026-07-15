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

    // ---- boost meter ----
    const boosting = ctl.boost && ctl.throttle > 0.3 && boat.boostEnergy > 0.02 && !boat.finished;
    if (boosting) boat.boostEnergy = Math.max(0, boat.boostEnergy - dt * 0.30);
    else boat.boostEnergy = Math.min(1, boat.boostEnergy + dt * 0.115);
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
    const rideY = wn.h + 0.12 + Math.min(0.35, speed * 0.012);   // planing lifts the bow region
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
    const targetPitch = boat.airborne ? -0.12 : (-accelPitch - wn.pitch * 1.4 * (fz) - wn.roll * 1.4 * fx) * 0.5 - Math.min(0.14, speed * 0.004);
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
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const rr = (a.radius + b.radius) * 0.62;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const nx = dx / d, nz = dz / d;
          const pen = (rr - d) * 0.5;
          a.pos.x -= nx * pen; a.pos.z -= nz * pen;
          b.pos.x += nx * pen; b.pos.z += nz * pen;
          const rvx = b.vel.x - a.vel.x, rvz = b.vel.z - a.vel.z;
          const vn = rvx * nx + rvz * nz;
          if (vn < 0) {
            const imp = -vn * 0.55;
            a.vel.x -= nx * imp; a.vel.z -= nz * imp;
            b.vel.x += nx * imp; b.vel.z += nz * imp;
            const sev = Math.min(1, -vn / 14);
            if (sev > 0.15) {
              if (a.isPlayer && a.onBump) a.onBump(sev);
              if (b.isPlayer && b.onBump) b.onBump(sev);
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
  };

  RR.Physics = P;
})();

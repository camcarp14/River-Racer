/* River Racer — bootstrap + game flow */
(function () {
  const $ = (id) => document.getElementById(id);
  let boats = [], player = null, pilots = [];
  let mode = 'menu';                       // menu | race | paused
  let raceState = null;
  let landmarkTags = [];                   // {x, z, name, r2} for HUD callouts

  function setLoad(f, msg) {
    $('load-fill').style.width = Math.round(f * 100) + '%';
    if (msg) $('load-msg').textContent = msg;
  }

  const STEPS = [
    ['SURVEYING THE RIVER…', () => { RR.River.init(); }],
    ['POURING LAKE MICHIGAN…', () => { RR.Sky.init(); RR.Water.init(); }],
    ['RAISING THE SKYLINE…', () => { RR.City.init(); }],
    ['DRESSING THE LANDMARKS…', () => { landmarkTags = RR.Landmarks.init(); }],
    ['LOWERING THE BRIDGES…', () => { RR.Bridges.init(); RR.Ramps.init(); }],
    ['LAYING THE RIVERWALK…', () => { RR.Riverwalk.init(); }],
    ['OPENING THE LOCK…', () => { RR.Lake.init(); }],
    ['RAISING THE GOLD COAST…', () => {
      for (const D of [RR.Northshore, RR.Streeterville]) {
        if (!D) continue;
        D.init();
        if (D.tags) landmarkTags = landmarkTags.concat(D.tags);
      }
    }],
    ['RIGGING THE SAILBOATS…', () => { RR.Scenery.init(); if (RR.Eggs) { RR.Eggs.init(); if (RR.Eggs.tags) landmarkTags = landmarkTags.concat(RR.Eggs.tags); } }],
    ['FILLING THE STREETS…', () => { RR.Life.init(); RR.Fireworks.init(); }],
    ['FUELING THE BOATS…', () => { RR.FX.init(); RR.HUD.init(); RR.Minimap.init(); }],
  ];

  function boot() {
    RR.Engine.init();
    let i = 0;
    (function next() {
      if (i < STEPS.length) {
        setLoad(i / STEPS.length, STEPS[i][0]);
        const fn = STEPS[i][1];
        i++;
        requestAnimationFrame(() => { fn(); next(); });
      } else {
        finishBoot();
      }
    })();
  }

  // showroom: the vehicle-select boat idles live on the lake, skyline behind it
  const SHOW = { x: 2150, z: 620 };
  let showBoat = null, showIdx = -1;

  function finishBoot() {
    setLoad(1, 'READY');
    if (RR.Theme) { RR.Theme.buildLamps(); RR.Theme.apply('day'); }
    RR.Menus.init(startRace);
    RR.Menus.onVehicleFocus = (i) => {
      if (showIdx === i && showBoat) return;
      if (showBoat) RR.Engine.scene.remove(showBoat);
      showBoat = RR.Boats.build(RR.Boats.CATALOG[i]);
      showBoat.position.set(SHOW.x, 0.3, SHOW.z);
      RR.Engine.scene.add(showBoat);
      showIdx = i;
    };
    RR.Menus.onResume = () => { mode = 'race'; };
    RR.Menus.onQuit = quitToTitle;
    RR.Engine.onUpdate(update);
    RR.Engine.start();
    setTimeout(() => { $('loading').style.display = 'none'; }, 250);
    window.RRTest.ready = true;
  }

  // ---------- race lifecycle ----------
  function clearBoats() {
    for (const b of boats) RR.Engine.scene.remove(b.mesh);
    RR.FX.clearBoats();
    boats = []; pilots = []; player = null;
  }

  function startRace(courseIdx, vehicleIdx, timeTrial) {
    clearBoats();
    const N = timeTrial ? 1 : 6;
    const catalog = RR.Boats.CATALOG;
    // one-design racing: every rival runs the SAME hull as you (fair fight, pure skill),
    // each in its own livery so you can tell the field apart at speed
    const LIVERY = [0xd8dce0, 0x2f8f4f, 0x8a2fb0, 0xe07820, 0x16303f];
    for (let i = 0; i < N; i++) {
      const base = catalog[vehicleIdx];
      const spec = i === 0 ? base : Object.assign({}, base, { hull: LIVERY[(i - 1) % LIVERY.length] });
      const mesh = RR.Boats.build(spec);
      RR.Engine.scene.add(mesh);
      const b = RR.Physics.createBoat(spec, mesh);
      b.isPlayer = i === 0;
      boats.push(b);
      RR.FX.registerBoat(b);
    }
    player = boats[0];

    raceState = RR.Race.start(courseIdx, boats, player);

    pilots = [];
    const diff = RR.Menus && RR.Menus.difficulty ? RR.Menus.difficulty() : 1;
    for (let i = 1; i < boats.length; i++) {
      const p = RR.AI.createPilot(boats[i], { path: raceState.route }, i - 1, diff);
      boats[i].pilotName = p.name;
      pilots.push(p);
    }

    // effect + audio hooks
    for (const b of boats) {
      b.onCrash = (sev, nx, nz) => {
        RR.FX.splashBurst(b.pos.x, b.pos.y, b.pos.z, sev);
        if (b.isPlayer) { RR.Audio.thud(sev); RR.Audio.splash(sev * 0.7); RR.Camera.kick(sev * 0.9); }
      };
      b.onSplashdown = (imp) => {
        RR.FX.splashBurst(b.pos.x, b.pos.y, b.pos.z, imp);
        if (b.isPlayer) { RR.Audio.splash(imp); RR.Camera.kick(imp * 0.5); }
      };
      b.onLaunch = () => { if (b.isPlayer) RR.Audio.seagull(); };
      b.onBump = (sev, nx, nz) => {
        RR.FX.splashBurst(b.pos.x, b.pos.y, b.pos.z, sev * 0.6);
        if (b.isPlayer) { RR.Audio.thud(sev * 0.9); RR.Camera.kick(sev * 0.7); }
        else { b.bumpRecover = Math.max(b.bumpRecover || 0, 0.30 + sev * 0.55); }  // a solid hit rattles the AI
      };
    }

    RR.Race.onCount = (n) => { RR.HUD.countdown(n); if (n > 0) RR.Audio.countdownBeep(false); else { RR.Audio.countdownBeep(true); RR.Audio.airhorn(); } };
    RR.Race.onCheckpoint = (n, total) => {
      RR.HUD.checkpointFlash(n, total); RR.Audio.checkpoint();
      if (player) { player.boostEnergy = Math.min(1, player.boostEnergy + 0.45); RR.Camera.kick(0.25); RR.HUD.flash('+BOOST'); }
    };
    RR.Race.onLap = () => { RR.Audio.checkpoint(); };
    RR.Race.onPlayerFinish = (pos) => {
      RR.Audio.finishFanfare(pos === 1); RR.Audio.airhorn(); RR.HUD.showPlacement(pos);
      const g = raceState && raceState.finishGate;
      if (g) {
        if (RR.FX.confetti) RR.FX.confetti(g.x, 12, g.z, 260);
        if (RR.Fireworks && RR.Fireworks.burstAt) {
          RR.Fireworks.burstAt(g.x - 18, 26, g.z, [1, 0.82, 0.3]);
          RR.Fireworks.burstAt(g.x + 16, 32, g.z + 8, null);
          setTimeout(() => RR.Fireworks.burstAt && RR.Fireworks.burstAt(g.x, 30, g.z - 10, [0.42, 0.72, 1]), 450);
        }
      }
    };
    RR.Race.onRaceOver = (results) => {
      mode = 'results';
      RR.HUD.show(false);
      RR.Audio.stopEngine();
      if (RR.Audio.setRaceMusic) RR.Audio.setRaceMusic(false);
      RR.Menus.showResults(results, raceState.course.id);
    };

    RR.Audio.init();
    RR.Audio.startEngine(player.spec.kind);
    if (RR.Audio.setRaceMusic) RR.Audio.setRaceMusic(true);
    RR.HUD.show(true);
    RR.Camera.setMode(0);
    RR.Camera.snapTo(player);
    mode = 'race';
  }

  function quitToTitle() {
    mode = 'menu';
    RR.HUD.show(false);
    RR.Audio.stopEngine();
    if (RR.Audio.setRaceMusic) RR.Audio.setRaceMusic(false);
    clearBoats();
    raceState = null;
  }

  function resetToCourse() {
    if (!raceState || !player) return;
    const pt = RR.U.pathAt(raceState.route, Math.max(6, (raceState.route.loop ? player.routeD % raceState.route.len : player.routeD) - 8), {});
    player.pos.set(pt.x, 0.2, pt.z);
    player.heading = Math.atan2(pt.tx, pt.tz);
    player.vel.x = 0; player.vel.z = 0; player.angVel = 0;
    player.airborne = false; player.vy = 0;
    RR.Camera.snapTo(player);
  }

  // ---------- global keys ----------
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyC' && mode === 'race') RR.Camera.cycle();
    if (e.code === 'KeyR' && mode === 'race') resetToCourse();
    if (e.code === 'KeyN' && RR.Theme) { const m = RR.Theme.toggle(); if (RR.HUD && RR.HUD.flash) RR.HUD.flash(m.toUpperCase()); }
    if (e.code === 'KeyG' && RR.Theme && RR.Theme.toggleGreenRiver) {
      const on = RR.Theme.toggleGreenRiver();
      if (RR.HUD && RR.HUD.flash) RR.HUD.flash(on ? 'RIVER DYED GREEN' : 'RIVER RESTORED');
    }
    if (e.code === 'KeyP' && (mode === 'race' || mode === 'photo')) togglePhotoMode();
    if (e.code === 'Escape' && mode === 'photo') togglePhotoMode();
    if (e.code === 'Escape' && mode === 'race') { mode = 'paused'; RR.Menus.showPause(); }
    RR.Audio.init(); RR.Audio.resume();
  }, { once: false });
  window.addEventListener('pointerdown', () => { RR.Audio.init(); RR.Audio.resume(); });

  // ---------- per-frame ----------
  const aiCtl = { throttle: 0, brake: 0, steer: 0, boost: false };
  let tagCooldown = 0;
  let photoAngle = 0;

  // freeze the sim and swing a slow cinematic camera around the boat for screenshots
  function togglePhotoMode() {
    if (mode === 'race') {
      mode = 'photo'; RR.HUD.show(false); RR.Audio.stopEngine();
      if (RR.HUD.flash) RR.HUD.flash('PHOTO MODE');
    } else if (mode === 'photo') {
      mode = 'race'; RR.HUD.show(true);
      if (player) { RR.Audio.startEngine(player.spec.kind); RR.Camera.snapTo(player); }
    }
  }

  function update(dt, t) {
    if (RR.Life) RR.Life.update(dt, t);          // crowds + traffic animate in every scene
    if (RR.Fireworks) RR.Fireworks.update(dt);
    if (mode === 'menu' || mode === 'results') {
      if (RR.Water && RR.Water.material) RR.Water.material.uniforms.uNumBoats.value = 0;  // no stale foam
      if (RR.Menus.screen() === 'vehicle' && showBoat) {
        // showroom: slow orbit around the boat bobbing on the lake chop
        const amp = RR.River.waveAmp(SHOW.x, SHOW.z);
        showBoat.position.y = RR.U.waterHeight(SHOW.x, SHOW.z, t, amp) + 0.18;
        showBoat.rotation.set(Math.sin(t * 0.7) * 0.035, t * 0.4, Math.sin(t * 0.55) * 0.045);
        const cam = RR.Engine.camera;
        const oa = t * 0.14, r = 10.5;
        cam.position.set(SHOW.x + Math.sin(oa) * r, 3.4 + Math.sin(t * 0.3) * 0.5, SHOW.z + Math.cos(oa) * r);
        cam.up.set(0, 1, 0);
        cam.lookAt(SHOW.x, showBoat.position.y + 0.9, SHOW.z);
        if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); }
        return;
      }
      if (showBoat && RR.Menus.screen() !== 'vehicle') { RR.Engine.scene.remove(showBoat); showBoat = null; showIdx = -1; }
      // attract flythrough behind the menus
      const main = RR.River.paths.main;
      if (main) RR.Camera.flyover(dt, main);
      RR.Race.animateGates && raceState && RR.Race.animateGates(t);
      return;
    }
    if (showBoat) { RR.Engine.scene.remove(showBoat); showBoat = null; showIdx = -1; }   // never leak into a race
    if (mode === 'photo') {
      if (!player) return;
      photoAngle += dt * 0.25;                       // slow orbit; world keeps shimmering (Life/Fireworks/water run above)
      const r = 15 + Math.sin(t * 0.2) * 4, cy = player.pos.y + 5.5;
      const cam = RR.Engine.camera;
      cam.up.set(0, 1, 0);
      cam.position.set(player.pos.x + Math.sin(photoAngle) * r, cy, player.pos.z + Math.cos(photoAngle) * r);
      cam.lookAt(player.pos.x, player.pos.y + 1, player.pos.z);
      RR.Race.animateGates && raceState && RR.Race.animateGates(t);
      return;
    }
    if (mode === 'paused') return;
    if (!raceState || !player) return;

    RR.Input.update(dt);
    RR.Race.update(dt);

    const racing = raceState.phase !== 'countdown';

    // player
    const pc = racing && !player.finished ? RR.Input : { throttle: player.finished ? 0.25 : 0, brake: 0, steer: RR.Input.steer * 0.4, boost: false };
    RR.Physics.update(player, dt, pc, t);

    // AI
    for (const p of pilots) {
      RR.AI.update(p, dt, t, player.routeD);
      const c = racing ? p.ctl : aiCtl;
      RR.Physics.update(p.boat, dt, c, t);
    }

    RR.Physics.collidePairs(boats);

    // drawbridge warning: a bascule leaf rising just ahead sounds its horn + scatters gulls
    if (racing && RR.Bridges && RR.Bridges.openings) {
      for (const o of RR.Bridges.openings) {
        const near = RR.U.dist2(player.pos.x, player.pos.z, o.x, o.z) < 95 * 95;
        if (near && o.rising && !o._warned) {
          o._warned = true; RR.Audio.airhorn(); RR.Audio.seagull();
          for (let k = 0; k < 6; k++) RR.FX.spray(o.x + (Math.random() - 0.5) * 14, 7 + Math.random() * 3, o.z + (Math.random() - 0.5) * 14,
            (Math.random() - 0.5) * 6, 3, (Math.random() - 0.5) * 6, 1, 3, 1);
        }
        if (!o.rising) o._warned = false;                 // re-arm once the leaf settles
      }
    }
    // passing wake: a taxi/tour boat sweeping close abeam at speed rocks the player
    if (RR.Life && RR.Life.craft) {
      for (const c of RR.Life.craft) {
        const cx = c.g.position.x, cz = c.g.position.z;
        const d2 = RR.U.dist2(player.pos.x, player.pos.z, cx, cz);
        if (d2 < 22 * 22 && d2 > 1 && c.spd > 3) {
          const dd = Math.sqrt(d2), dx = (player.pos.x - cx) / dd, dz = (player.pos.z - cz) / dd;
          const push = (1 - dd / 22) * c.spd * 0.06;
          player.vel.x += dx * push * dt * 8; player.vel.z += dz * push * dt * 8;
          player.visRoll += (dx * Math.cos(player.heading) - dz * Math.sin(player.heading)) * push * 0.02;
          if (Math.random() < 0.22) RR.FX.spray(player.pos.x, player.pos.y + 0.1, player.pos.z, dx * 3, 1.5, dz * 3, 1, 2, 1);
        }
      }
    }

    for (const b of boats) RR.Physics.applyVisual(b);

    // feed boat positions to the water shader for bow-wave foam
    if (RR.Water && RR.Water.material) {
      const u = RR.Water.material.uniforms;
      const n = Math.min(8, boats.length);
      u.uNumBoats.value = n;
      for (let i = 0; i < n; i++) {
        const b = boats[i];
        u.uBoats.value[i].set(b.pos.x, b.pos.z, RR.U.clamp(Math.hypot(b.vel.x, b.vel.z) / 12, 0, 1), b.heading);
      }
    }

    RR.Race.animateGates(t);
    RR.FX.update(boats, dt, t);
    if (!(window.RRTest && window.RRTest._freecam)) RR.Camera.follow(player, dt);
    RR.Engine.trackShadow(player.pos.x, player.pos.z);

    RR.HUD.update(dt, player, raceState);
    RR.Minimap.draw(raceState, player, boats);

    RR.Audio.update(dt, {
      rpm: player.rpm,
      speed: Math.hypot(player.vel.x, player.vel.z),
      throttle: pc.throttle || 0,
      turning: Math.abs(pc.steer || 0),
      airborne: player.airborne,
      inLake: RR.River.inLake(player.pos.x, player.pos.z),
    });

    // landmark callouts
    tagCooldown -= dt;
    if (tagCooldown <= 0) {
      for (const tag of landmarkTags) {
        if (RR.U.dist2(player.pos.x, player.pos.z, tag.x, tag.z) < tag.r2) {
          RR.HUD.tagLandmark(tag.name);
          tagCooldown = 1.5;
          break;
        }
      }
    }
  }

  // ---------- automated-test API ----------
  window.RRTest = {
    ready: false,
    startRace: (c, v) => { RR.Menus.hide(); RR.Audio.setMusic(false); startRace(c || 0, v || 0, false); },
    warp: (sec) => {
      // during warp the AI takes the player's wheel so the sim actually progresses
      if (player && !window.RRTest._autopilot) {
        const p = RR.AI.createPilot(player, { path: raceState.route }, 3, 0.9);
        window.RRTest._autopilot = p;
        const realInput = RR.Input.update;
        RR.Input.update = function (dt) {
          realInput.call(RR.Input, dt);
          RR.AI.update(p, dt, RR.Engine.time(), player.routeD);
          RR.Input.throttle = p.ctl.throttle; RR.Input.brake = p.ctl.brake;
          RR.Input.steer = p.ctl.steer; RR.Input.boost = p.ctl.boost;
        };
      }
      RR.Engine.warp(sec);
    },
    // debug inspection: freeze a free camera anywhere in the world
    setCamera: (px, py, pz, lx, ly, lz) => {
      const cam = RR.Engine.camera;
      cam.position.set(px, py, pz);
      cam.up.set(0, 1, 0);
      cam.lookAt(lx, ly, lz);
      window.RRTest._freecam = true;
    },
    clearCamera: () => { window.RRTest._freecam = false; },
    // debug: drop the player somewhere with way on, e.g. lined up on a jump ramp
    teleport: (x, z, heading, speed) => {
      if (!player) return;
      player.pos.set(x, 0.3, z);
      if (heading != null) player.heading = heading;
      const sp = speed == null ? 25 : speed;
      player.vel.x = Math.sin(player.heading) * sp;
      player.vel.z = Math.cos(player.heading) * sp;
      player.hint = {};                 // stale water-query hints would drag the boat back
      player.routeHint = null;
      RR.Camera.snapTo(player);
    },
    night: (m) => { if (RR.Theme) RR.Theme.apply(typeof m === 'string' ? m : (m ? 'night' : 'day')); },
    // hold full quality (disable adaptive downgrade) — used by visual tests on the software renderer
    pinQuality: () => { RR.Engine.setAutoQuality(false); if (RR.Reflect) RR.Reflect.enabled = true; if (RR.Post) RR.Post.enabled = true; },
    getState: () => ({
      scene: mode === 'menu' ? 'menu' : mode === 'results' ? 'results' : 'race',
      speed: player ? Math.hypot(player.vel.x, player.vel.z) : 0,
      pos: player ? [player.pos.x, player.pos.y, player.pos.z] : [0, 0, 0],
      checkpoint: player ? player.nextCp : 0,
      racePos: player ? player.racePos : 0,
      fps: RR.Engine.fps(),
    }),
  };

  let booted = false;
  function bootOnce() { if (!booted) { booted = true; boot(); } }
  window.addEventListener('DOMContentLoaded', bootOnce);
  if (document.readyState !== 'loading') bootOnce();
})();

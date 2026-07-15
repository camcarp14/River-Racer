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
    ['LOWERING THE BRIDGES…', () => { RR.Bridges.init(); }],
    ['OPENING THE LOCK…', () => { RR.Lake.init(); }],
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

  function finishBoot() {
    setLoad(1, 'READY');
    RR.Menus.init(startRace);
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
    boats = []; pilots = []; player = null;
  }

  function startRace(courseIdx, vehicleIdx, timeTrial) {
    clearBoats();
    const N = timeTrial ? 1 : 6;
    const catalog = RR.Boats.CATALOG;
    for (let i = 0; i < N; i++) {
      const spec = i === 0 ? catalog[vehicleIdx] : catalog[(vehicleIdx + 1 + i) % catalog.length];
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
    for (let i = 1; i < boats.length; i++) {
      const p = RR.AI.createPilot(boats[i], { path: raceState.route }, i - 1, 1);
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
      b.onBump = (sev) => { RR.Audio.thud(sev * 0.8); RR.Camera.kick(sev * 0.5); };
    }

    RR.Race.onCount = (n) => { RR.HUD.countdown(n); if (n > 0) RR.Audio.countdownBeep(false); else { RR.Audio.countdownBeep(true); RR.Audio.airhorn(); } };
    RR.Race.onCheckpoint = (n, total) => { RR.HUD.checkpointFlash(n, total); RR.Audio.checkpoint(); };
    RR.Race.onLap = () => { RR.Audio.checkpoint(); };
    RR.Race.onPlayerFinish = (pos) => { RR.Audio.finishFanfare(pos === 1); RR.Audio.airhorn(); };
    RR.Race.onRaceOver = (results) => {
      mode = 'results';
      RR.HUD.show(false);
      RR.Audio.stopEngine();
      RR.Menus.showResults(results, raceState.course.id);
    };

    RR.Audio.init();
    RR.Audio.startEngine(player.spec.kind);
    RR.HUD.show(true);
    RR.Camera.setMode(0);
    RR.Camera.snapTo(player);
    mode = 'race';
  }

  function quitToTitle() {
    mode = 'menu';
    RR.HUD.show(false);
    RR.Audio.stopEngine();
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
    if (e.code === 'Escape' && mode === 'race') { mode = 'paused'; RR.Menus.showPause(); }
    RR.Audio.init(); RR.Audio.resume();
  }, { once: false });
  window.addEventListener('pointerdown', () => { RR.Audio.init(); RR.Audio.resume(); });

  // ---------- per-frame ----------
  const aiCtl = { throttle: 0, brake: 0, steer: 0, boost: false };
  let tagCooldown = 0;

  function update(dt, t) {
    if (mode === 'menu' || mode === 'results') {
      // attract flythrough behind the menus
      const main = RR.River.paths.main;
      if (main) RR.Camera.flyover(dt, main);
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
    for (const b of boats) RR.Physics.applyVisual(b);

    RR.Race.animateGates(t);
    RR.FX.update(boats, dt, t);
    RR.Camera.follow(player, dt);
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
    startRace: (c, v) => { startRace(c || 0, v || 0, false); },
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

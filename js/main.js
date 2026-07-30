/* River Racer — bootstrap + game flow */
(function () {
  const $ = (id) => document.getElementById(id);
  let boats = [], player = null, pilots = [];
  let remotes = [], netSendT = 0;          // multiplayer: network-driven rival boats + broadcast throttle
  let mode = 'boot';                       // boot | menu | race | paused | photo | results
  let raceState = null;
  let landmarkTags = [];                   // {x, z, name, r2} for HUD callouts
  let booted = 0;                          // 0 not started · 1 building · 2 rendering the ride

  function setLoad(f, msg) {
    $('load-fill').style.width = Math.round(f * 100) + '%';
    if (msg) $('load-msg').textContent = msg;
  }

  // The render loop now starts three steps in (the load is a boat ride), which means every module
  // that self-arms from RR.Engine.onUpdate is live while the back half of the world is still being
  // built — and eggs.js throws spray from its own update. So the particle pool comes up with the
  // river, not with the HUD. Every label is unchanged; only which step does the work moved.
  const STEPS = [
    ['SURVEYING THE RIVER…', () => { RR.River.init(); RR.FX.init(); }],
    ['REVERSING THE FLOW…', () => { RR.Sky.init(); RR.Water.init(); }],
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
    ['RIGGING THE SAILBOATS…', () => {
      RR.Scenery.init();
      // eggs, sculpture and signs all expose init() + tags. Each also self-arms from onUpdate, but
      // calling init() HERE matters: it must run before RR.Theme.buildLamps() in finishBoot or the
      // municipal Y's night uplights are dropped.
      for (const M of [RR.Eggs, RR.Sculpture, RR.Signs]) {
        if (!M) continue;
        M.init();
        if (M.tags) landmarkTags = landmarkTags.concat(M.tags);
      }
    }],
    ['FILLING THE STREETS…', () => { RR.Life.init(); RR.Fireworks.init(); }],
    ['DYEING THE WATER GREEN…', () => { RR.HUD.init(); RR.Minimap.init(); }],
  ];

  // The load is a boat ride. The render loop and the menu flythrough start as soon as there is a
  // river and a sky to fly over — three steps in — so the last two thirds of the build happen
  // behind a live shot of Chicago assembling itself, with the progress bar reduced to a hairline
  // along the bottom of it. Before that the veil holds, because an empty blue void is not a boat
  // ride.
  const RIDE_AT = 3;                        // river + sky/water + city are up
  function startRide() {
    if (booted !== 1) return;
    booted = 2;
    RR.Engine.onUpdate(bootFly);
    RR.Engine.start();
    const l = $('loading');
    if (l) l.classList.remove('veil');
  }
  function bootFly(dt) {
    if (mode !== 'boot') return;
    const main = RR.River && RR.River.paths && RR.River.paths.main;
    if (main) RR.Camera.flyover(dt, main);
  }

  function boot() {
    RR.Engine.init();
    let i = 0;
    (function next() {
      if (i < STEPS.length) {
        setLoad(i / STEPS.length, STEPS[i][0]);
        const fn = STEPS[i][1];
        i++;
        requestAnimationFrame(() => {
          fn();
          if (i >= RIDE_AT) startRide();
          next();
        });
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
    if (RR.Menus.applyVolumes) RR.Menus.applyVolumes();
    RR.Menus.onVehicleFocus = (i) => {
      const liv = RR.Menus.livery ? RR.Menus.livery() : null;
      if (showIdx === i && showBoat && showBoat.userData.livery === liv) return;
      if (showBoat) RR.Engine.scene.remove(showBoat);
      showBoat = RR.Boats.build(liverySpec(RR.Boats.CATALOG[i]));
      showBoat.userData.livery = liv;
      showBoat.position.set(SHOW.x, 0.3, SHOW.z);
      // A fixed 10.5 m orbit frames a 6 m runabout and parks the lens INSIDE the 30 m WACKER
      // BELLE, so measure the hull once and pull the rig back only when she outgrows the shot.
      const bb = new THREE.Box3().setFromObject(showBoat);
      showBoat.userData.showLen = Math.max(bb.max.z - bb.min.z, bb.max.x - bb.min.x);
      RR.Engine.scene.add(showBoat);
      showIdx = i;
    };
    RR.Menus.onResume = () => { mode = 'race'; RR.Engine.timeScale = 1; };
    RR.Menus.onQuit = quitToTitle;
    setupNet();
    if (RR.NetUI) RR.NetUI.init();
    RR.Engine.onUpdate(update);
    RR.Engine.start();                                 // a no-op if startRide already ran
    const load = $('loading');
    if (load) { load.classList.add('gone'); setTimeout(() => { load.style.display = 'none'; }, 500); }
    mode = 'menu';
    window.RRTest.ready = true;
  }

  // ---------- multiplayer wiring (dormant unless a room is joined) ----------
  function setupNet() {
    if (!RR.Net) return;
    RR.Net.on('start', (info) => {
      if (RR.Menus.hide) RR.Menus.hide();
      RR.Audio.setMusic(false);
      startRace(info.courseIdx | 0, 0, false, RR.Net.roster());
      mode = 'race';
    });
    RR.Net.on('finish', (id, elapsed) => {
      const b = remotes.find((x) => x.netId === id);
      if (b) { b.finished = true; b.finishTime = elapsed; }
    });
    RR.Net.on('alldone', (results) => {
      mode = 'results'; RR.HUD.show(false); RR.Audio.stopEngine();
      if (RR.Audio.setRaceMusic) RR.Audio.setRaceMusic(false);
      if (RR.Menus.showNetResults) RR.Menus.showNetResults(results, raceState && raceState.course && raceState.course.id);
    });
  }

  // ---------- race lifecycle ----------
  function clearBoats() {
    for (const b of boats) RR.Engine.scene.remove(b.mesh);
    RR.FX.clearBoats();
    boats = []; pilots = []; remotes = []; player = null;
  }

  // the chosen livery is cosmetic only — it never touches a physics field
  function liverySpec(base) {
    const liv = RR.Menus && RR.Menus.livery ? RR.Menus.livery() : null;
    return liv == null ? base : Object.assign({}, base, { hull: liv });
  }

  // The Architecture Tour is not a race and it is not a free camera: it is a ride. You board the
  // WACKER BELLE as a passenger, she runs the river herself, and five taps of F buy you the wheel.
  let docent = null;                 // the skipper's autopilot (an AI pilot with the racing filed off)
  let tourDriving = false, tourCam = 0;
  // look[] is an offset from the eye, in the boat's own frame: +z is forward, +y is up.
  const TOUR_VIEWS = [
    { key: 'seat', name: 'PASSENGER SEAT', look: [1.4, 2.0, 32], fov: 62 },
    { key: 'foredeck', name: 'FOREDECK', look: [-0.9, 5.0, 26], fov: 64 },
    { key: 'stern', name: 'AFT DECK', look: [0, -1.4, 26], fov: 60 },
    { key: 'wheel', name: 'WHEELHOUSE', look: [0.55, 0.35, 30], fov: 60 },
    { key: 'helm', name: 'HELM', look: [0, -6.5, 44], fov: 56, contain: 3 },
    { name: 'CHASE', stock: 0 },
  ];
  const tcEye = new THREE.Vector3(), tcLook = new THREE.Vector3();
  const tcQuat = new THREE.Quaternion(), tcEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const tourPt = {};
  function tourSpec() {
    const c = RR.Boats.CATALOG;
    return c.find((v) => v.id === 'tourboat') || c[0];
  }
  // A point in the boat's own frame, in world space. Same basis physics.applyVisual gives the mesh
  // (rotateY -> rotateX -> rotateZ = Euler order YXZ), so a seat pose really is bolted to the deck:
  // when her bow lifts, so does the view, and the bulwark stays put in the frame.
  function boatLocal(out, b, l) {
    tcEuler.set(b.visPitch || 0, b.heading, -(b.visRoll || 0));
    tcQuat.setFromEuler(tcEuler);
    return out.set(l[0], l[1], l[2]).applyQuaternion(tcQuat).add(b.pos);
  }
  function setTourView(i) {
    tourCam = ((i % TOUR_VIEWS.length) + TOUR_VIEWS.length) % TOUR_VIEWS.length;
    const v = TOUR_VIEWS[tourCam];
    if (RR.Camera.lookReset) RR.Camera.lookReset(true);   // a new seat puts your eyes back on the bow
    if (v.stock != null) { RR.Camera.setMode(v.stock); if (player) RR.Camera.snapTo(player); }
    if (RR.HUD.flash) RR.HUD.flash(v.name);
  }
  // The seats are bolted to the boat, so these poses are rigid — no spring, no lag. The vessel
  // itself is 200 tonnes of slow, which is all the smoothing a shot from her deck needs. What does
  // move is your head: the pose is where you are SITTING, and where you are LOOKING is yours.
  function tourCamera(b, dt) {
    const v = TOUR_VIEWS[tourCam];
    const seats = (b.mesh.userData && b.mesh.userData.seatCams) || null;
    if (v.stock != null || !seats || !seats[v.key]) return false;
    const eye = seats[v.key];
    boatLocal(tcEye, b, eye);
    boatLocal(tcLook, b, [eye[0] + v.look[0], eye[1] + v.look[1], eye[2] + v.look[2]]);
    // the seats ride the boat and cannot land in a wall; a lens hung 30 m astern can, so that one
    // gets the same keep-out the chase rig uses
    if (v.contain && RR.River && RR.River.waterQuery) {
      const q = RR.River.waterQuery(tcEye.x, tcEye.z, null);
      if (q && q.clear < v.contain) { tcEye.x += q.nx * (v.contain - q.clear); tcEye.z += q.nz * (v.contain - q.clear); }
      // and duck it under the bridge decks, or every crossing on the Main Stem is a black frame
      if (RR.Bridges && RR.Bridges.duckY) {
        const deckY = Math.min(RR.Bridges.duckY(tcEye.x, tcEye.z),
          RR.Bridges.duckY((tcEye.x + b.pos.x) * 0.5, (tcEye.z + b.pos.z) * 0.5),
          RR.Bridges.duckY(b.pos.x, b.pos.z));
        if (isFinite(deckY)) tcEye.y = Math.min(tcEye.y, deckY - 1.3);
      }
    }
    // The arrows are the wheel — but only once you have the wheel. Until then they are your neck,
    // which is the one control a passenger actually has. (The pointer drag and the right stick are
    // read inside RR.Camera.seat and work in either case.)
    if (!tourDriving && RR.Camera.lookNudge) {
      const I = RR.Input, r = 1.6 * (dt > 0 ? dt : 1 / 60);
      let dy = 0, dp = 0;
      if (I.pressed('ArrowLeft')) dy -= r;
      if (I.pressed('ArrowRight')) dy += r;
      if (I.pressed('ArrowUp')) dp += r;
      if (I.pressed('ArrowDown')) dp -= r;
      if (dy || dp) RR.Camera.lookNudge(dy, dp);
    }
    // Now put the lens on the seat and let the head turn. The mount stays bolted to the deck; only
    // the eyes move — which is the whole of the difference between riding a boat and watching one.
    RR.Camera.seat(tcEye.x, tcEye.y, tcEye.z, tcLook.x, tcLook.y, tcLook.z, dt, { fov: v.fov });
    return true;
  }
  function setTourDriving(on) {
    if (!raceState || !raceState.tour || tourDriving === on) return;
    tourDriving = on;
    const crew = player.mesh.userData.crew;
    if (crew && crew.skipper) crew.skipper.visible = !on;
    if (RR.HUD.flash) RR.HUD.flash(on ? 'YOU HAVE THE WHEEL' : 'THE SKIPPER HAS THE WHEEL');
    // …and name the controls this device actually has. "W A S D" on a phone is the same lie the
    // rest of the touch tier spent its time deleting.
    const how = RR.Input.hasTouch ? 'YOU ARE STEERING — STEER PAD AND GO' : 'YOU ARE STEERING — W A S D';
    if (RR.HUD.chip) RR.HUD.chip('near', on ? how : 'THE SKIPPER IS STEERING AGAIN', 3000);
    // Steering her yourself is the whole point of the secret, so that is what unlocks her. From
    // here on she is in the ride picker — announced on a chip of her own, since flash() shows
    // one line at a time and that line belongs to the handover.
    if (on && RR.Boats.unlock && RR.Boats.unlock('tourboat') && RR.HUD.chip) {
      RR.HUD.chip('gold', 'WACKER BELLE UNLOCKED · PICK HER IN THE RIDE LIST', 8000);
    }
    RR.Audio.airhorn();
    RR.Camera.kick(0.3);
    setTourView(on ? 4 : 0);              // hand her over from the HELM shot: you need to see her length
  }

  // The tour, as two questions anyone may ask. ui/touch.js needs both of them every tenth of a
  // second: a phone has no F to take the wheel with and no SPACE to ask about a building, so the
  // control layer has to know it is on a ride, and whether that ride is currently being driven,
  // before it can offer either. Exposed here rather than read off RRTest, which is a test hook and
  // not an interface — and as two closures rather than a live object, so nothing can write them.
  RR.Tour = {
    active: () => !!(raceState && raceState.tour),
    driving: () => tourDriving,
  };

  // roster (multiplayer) = [{id, name, boatIdx, isSelf}] sorted identically on every client
  function startRace(courseIdx, vehicleIdx, timeTrial, roster, tourMode, cupRound) {
    clearBoats();
    if (RR.HUD.resetSession) RR.HUD.resetSession();
    if (RR.Feel && RR.Feel.cancelFinale) RR.Feel.cancelFinale();   // a finish beat must not open over a new race
    RR.Engine.timeScale = 1;                          // clear any pause/photo slo-mo from a prior race
    const catalog = RR.Boats.CATALOG;
    const mp = !!(roster && roster.length);

    if (mp) {
      // one boat per real player — each brings their OWN chosen boat; mine is the player
      for (const r of roster) {
        // the index is remote input: wrap it into range in both directions, never index off the end
        const spec = catalog[(((r.boatIdx | 0) % catalog.length) + catalog.length) % catalog.length];
        const mesh = RR.Boats.build(spec);
        RR.Engine.scene.add(mesh);
        const b = RR.Physics.createBoat(spec, mesh);
        b.isPlayer = !!r.isSelf;
        b.displayName = r.name;
        if (!r.isSelf) { b.remote = true; b.netId = r.id; remotes.push(b); }
        boats.push(b);
        RR.FX.registerBoat(b);
      }
      player = boats.find((b) => b.isPlayer) || boats[0];
    } else {
      const N = (timeTrial || tourMode) ? 1 : 6;
      // one-design racing: every rival runs the SAME hull as you (fair fight, pure skill),
      // each in its own livery so you can tell the field apart at speed
      const LIVERY = [0xd8dce0, 0x2f8f4f, 0x8a2fb0, 0xe07820, 0x16303f];
      const base = tourMode ? tourSpec() : (catalog[vehicleIdx] || catalog[0]);
      // …with one exception: six 30 m tour boats in a 60 m channel cannot pass each other, they can
      // only gridlock. Take the BELLE out for a race and the field runs the stock offshore hull.
      const rivalBase = base.kind === 'tourboat' ? (catalog.find((v) => v.id === 'speedboat') || catalog[0]) : base;
      for (let i = 0; i < N; i++) {
        // the tour boat is a working vessel with a name on her bow — no livery paint
        const spec = tourMode ? base
          : i === 0 ? liverySpec(base) : Object.assign({}, rivalBase, { hull: LIVERY[(i - 1) % LIVERY.length] });
        const mesh = RR.Boats.build(spec);
        RR.Engine.scene.add(mesh);
        const b = RR.Physics.createBoat(spec, mesh);
        b.isPlayer = i === 0;
        boats.push(b);
        RR.FX.registerBoat(b);
      }
      player = boats[0];
    }

    raceState = RR.Race.start(courseIdx, boats, player, { timeTrial: !!timeTrial, tour: !!tourMode });
    raceState.mp = mp;

    pilots = [];
    docent = null;
    tourDriving = false;
    RR.Input.onFTap = null; RR.Input.onFiveF = null;
    if (tourMode) {
      // The skipper is an AI pilot with the racing filed off her: she reads the river four times
      // further ahead than a jet ski does (a 30 m hull that turns in 34 m has to), never cuts an
      // apex, never touches the boost, and never makes a mistake with forty passengers aboard.
      docent = RR.AI.createPilot(player, { path: raceState.route }, 0, 1.2);
      const k = docent.k;
      k.look = 3.6; k.apex = 0.30; k.wobble = 0.02; k.mistake = 0; k.boostArm = 9;
      k.liftBend = 0.45; k.liftFloor = 0.72; k.liftSpan = 0.80; k.react = 8; k.steerGain = 2.2;
      docent.lane = 0; docent.aggression = 0;
      // 0.75 throttle settles this hull at 9 m/s — 18 knots, about what the real boats run. (Not
      // sqrt(0.75) x top: at part throttle the friction term physics.js adds below full throttle
      // dominates a hull with an acceleration this low.)
      docent.skill = 0.75;
      // F five times in a row hands over the wheel. The window between taps is short enough that
      // nobody trips it by leaning on a key, and every tap says how far along you are.
      RR.Input.onFTap = (n, need) => {
        if (n < need && RR.HUD.chip) RR.HUD.chip('near', 'F ' + n + '/' + need + ' — TAKE THE WHEEL?', 1100);
      };
      RR.Input.onFiveF = () => setTourDriving(!tourDriving);
    } else if (!mp) {
      // A championship is a season, so the field has to be the same six boats every round, under
      // the same names, at the difficulty the cup began at. race.js stores that roster; without it
      // the standings table can only say "RIVAL 3".
      const board = RR.Race.cup ? RR.Race.cup() : null;
      const isCupRound = !!(board && !board.done &&
        (cupRound === true || (cupRound == null && RR.Race.cupCourseIdx && RR.Race.cupCourseIdx() === courseIdx)));
      const names = isCupRound && RR.Race.cupFieldNames ? RR.Race.cupFieldNames() : null;
      const cupDiff = isCupRound && RR.Race.cupDifficulty ? RR.Race.cupDifficulty() : null;
      const diff = cupDiff != null ? cupDiff : (RR.Menus && RR.Menus.difficulty ? RR.Menus.difficulty() : 1);
      // the item brain plays at the round's difficulty too — mid-cup the menu's current setting is
      // the wrong number, and a rival who fires a torpedo like a novice in the final is not a rival
      if (RR.Powerups && RR.Powerups.setDifficulty) RR.Powerups.setDifficulty(diff);
      for (let i = 1; i < boats.length; i++) {
        const p = RR.AI.createPilot(boats[i], { path: raceState.route }, i - 1, diff);
        if (names && names[i]) p.name = names[i];
        boats[i].pilotName = p.name;
        pilots.push(p);
      }
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
      // hull slap: the texture that stops the ride feeling like ice
      b.onSlap = (k) => {
        if (b.isPlayer) {
          if (RR.Audio.hullSlap) RR.Audio.hullSlap(k);
          RR.Camera.kick(k * 0.28);
        }
        RR.FX.spray(b.pos.x, b.pos.y + 0.1, b.pos.z, 0, 2.2 + k * 3, 0, 2, 2.0 + k * 2, 1.1);
      };
    }

    RR.Race.onCount = (n) => { RR.HUD.countdown(n); if (n > 0) RR.Audio.countdownBeep(false); else { RR.Audio.countdownBeep(true); RR.Audio.airhorn(); } };
    // THE BUOY RULE. race.js pays the gate itself now — between the buoys 0.10-0.26 by line
    // quality and clean-gate streak, outside them 0.06 — so the flat +0.45 that used to live here
    // is gone. All this adds is the tell: a clean line reads +BOOST, a wide one reads WIDE.
    RR.Race.onCheckpoint = (n, total, gate) => {
      const clean = !gate || gate.clean;
      RR.HUD.checkpointFlash(n, total); RR.Audio.checkpoint();
      if (!player) return;
      RR.Camera.kick(clean ? 0.25 : 0.12);
      if (RR.HUD.chip) RR.HUD.chip(clean ? 'near' : 'bad', clean ? '+BOOST' : 'WIDE — LESS BOOST', 1100);
      else RR.HUD.flash(clean ? '+BOOST' : 'WIDE');
    };
    RR.Race.onLap = () => { RR.Audio.checkpoint(); };
    // race.js already pays the boost, kicks the camera and rings the chime; all this adds is the
    // gate's name, so the player learns WHICH line paid.
    RR.Race.onBoostGate = (gate) => {
      if (gate && gate.name && RR.HUD.chip) RR.HUD.chip('near', String(gate.name).toUpperCase() + ' +BOOST', 1300);
    };
    RR.Race.onPlayerFinish = (pos, time) => {
      if (raceState.mp && RR.Net.active) RR.Net.sendFinish(time);   // tell the room my elapsed time
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
    RR.Audio.startEngine(player.spec.engine || player.spec.kind);   // the tour boat runs a diesel
    if (RR.Audio.setRaceMusic) RR.Audio.setRaceMusic(true);
    RR.HUD.show(true);
    RR.Camera.setMode(0);
    RR.Camera.snapTo(player);
    if (tourMode) {
      tourCam = 0;
      if (RR.Camera.lookReset) RR.Camera.lookReset(true);   // never board with the last run's head angle
      if (RR.HUD.chip) RR.HUD.chip('near', 'C: CHANGE SEAT · DRAG OR ←→ TO LOOK · SPACE: ABOUT THIS BUILDING · F ×5: TAKE THE WHEEL', 7000);
    }
    mode = 'race';
  }

  function quitToTitle() {
    mode = 'menu';
    if (RR.Feel && RR.Feel.cancelFinale) RR.Feel.cancelFinale();
    RR.Engine.timeScale = 1;
    docent = null; tourDriving = false;
    RR.Input.onFTap = null; RR.Input.onFiveF = null;
    RR.HUD.show(false);
    RR.Audio.stopEngine();
    if (RR.Audio.setRaceMusic) RR.Audio.setRaceMusic(false);
    clearBoats();
    if (RR.Race.end) RR.Race.end();
    raceState = null;
  }

  function resetToCourse() {
    if (!raceState || !player) return;
    const pt = RR.U.pathAt(raceState.route, Math.max(6, (raceState.route.loop ? player.routeD % raceState.route.len : player.routeD) - 8), {});
    player.pos.set(pt.x, 0.2, pt.z);
    player.heading = Math.atan2(pt.tx, pt.tz);
    player.vel.x = 0; player.vel.z = 0; player.angVel = 0;
    player.airborne = false; player.vy = 0;
    // a free tow back to the line has to cost something, or the wall is a shortcut
    if (RR.Physics.resetPenalty) RR.Physics.resetPenalty(player);   // −0.30 boost, 1.2 s dead throttle
    if (RR.HUD.chip) RR.HUD.chip('bad', 'RESET −1.2s', 1400);
    RR.Camera.snapTo(player);
  }

  // One pause path, called from ESC, from the thumb control (which dispatches ESC) and from the
  // orientation gate below. Anything that stops the world has to stop it the same way, or the two
  // callers drift and one of them leaves timeScale at 0 with no menu on top of it.
  function pauseRace() {
    if (mode !== 'race') return false;
    mode = 'paused'; RR.Engine.timeScale = 0; RR.Menus.showPause();
    return true;
  }

  // ---------- global keys ----------
  window.addEventListener('keydown', (e) => {
    // Aboard the tour boat C walks the boat: four places to stand or sit, the helm shot, then the
    // stock chase rig — so the free look you have in a race is still there on the ride.
    if (e.code === 'KeyC' && mode === 'race') {
      if (raceState && raceState.tour) setTourView(tourCam + 1);
      else RR.Camera.cycle();
    }
    if (e.code === 'KeyR' && mode === 'race') resetToCourse();
    if (e.code === 'KeyN' && RR.Theme) { const m = RR.Theme.toggle(); if (RR.HUD && RR.HUD.flash) RR.HUD.flash(m.toUpperCase()); }
    if (e.code === 'KeyG' && RR.Theme && RR.Theme.toggleGreenRiver) {
      const on = RR.Theme.toggleGreenRiver();
      if (RR.HUD && RR.HUD.flash) RR.HUD.flash(on ? 'RIVER DYED GREEN' : 'RIVER RESTORED');
    }
    // Architecture Tour: SPACE alongside a landmark opens the docent panel. This is the mode that
    // justifies every hour the world agents spent on the buildings.
    if (e.code === 'Space' && mode === 'race' && raceState && raceState.tour && RR.HUD.docent) {
      if (nearTag) RR.HUD.docent(nearTag.name, nearTag.sub || '');
      else RR.HUD.docent(null);
    }
    if (e.code === 'KeyP' && (mode === 'race' || mode === 'photo')) togglePhotoMode();
    // both of these used to fall through into the pause branch in the SAME event: leaving photo
    // mode, or menus.js resuming from pause, sets mode='race' and the next line re-paused you.
    if (e.code === 'Escape' && mode === 'photo') togglePhotoMode();
    else if (e.code === 'Escape' && mode === 'race' && !e.defaultPrevented) pauseRace();
    RR.Audio.init(); RR.Audio.resume();
  }, { once: false });
  window.addEventListener('pointerdown', () => { RR.Audio.init(); RR.Audio.resume(); });

  // ---------- the phone shell ----------
  // Everything below is about the PAGE rather than the race, which is why it lives here and not in
  // engine.js: a handset browser has three habits that make a full-screen canvas game unplayable,
  // and each one has to be answered once, at the top.

  // 1. THE VIEWPORT IS NOT A CONSTANT. A mobile URL bar slides away and window.innerHeight changes
  //    under the running game; iOS reports the new size a beat AFTER an orientation change, and the
  //    `resize` that engine.js resizes the renderer from does not always arrive. visualViewport
  //    does. So: listen to the signal that is reliable, publish ONE number, and give it to both
  //    sides — the drawing buffer (engine.js, via the event) and the HUD box (--rr-vh, via CSS).
  //    It is window.innerHeight and not 100vh deliberately: on iOS 100vh is the URL-bar-HIDDEN
  //    height whatever the bar is currently doing, which is exactly the gap this has to close.
  let vpW = 0, vpH = 0, vpQueued = false;
  function syncViewport() {
    vpQueued = false;
    const w = window.innerWidth, h = window.innerHeight;
    document.documentElement.style.setProperty('--rr-vh', h + 'px');
    thumbsKnown = false; measureThumbs();            // the stack is sized in vh/vw ems: re-measure
    if (w === vpW && h === vpH) return;
    vpW = w; vpH = h;
    // engine.js (renderer + camera aspect), touch.js (thumb geometry) and uikit's media queries all
    // hang off this one event. Re-entry is bounded: the size is already stored, so a listener that
    // asks for another sync finds nothing changed and stops.
    window.dispatchEvent(new Event('resize'));
  }
  function queueViewport() {
    if (vpQueued) return;
    vpQueued = true;
    requestAnimationFrame(syncViewport);
  }

  // 2. FULLSCREEN AND LANDSCAPE, best effort. Neither can be asked for outside a user gesture, so
  //    the first tap of the session buys both. Both are allowed to fail silently and nothing is
  //    permitted to depend on either: iOS Safari has no Fullscreen API for a canvas and no Screen
  //    Orientation lock at all, so every entry point is feature-tested and every promise is caught.
  //    (On iOS the answer is the home screen instead — see the apple-mobile-web-app meta tags.)
  //    Desktop is exempt: a browser that goes fullscreen because you clicked RACE is a browser
  //    fighting its user.
  let immersiveTried = false;
  function lockLandscape() {
    const so = window.screen && window.screen.orientation;
    if (!so || typeof so.lock !== 'function') return;
    try { const p = so.lock('landscape'); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not permitted here */ }
  }
  function goImmersive() {
    if (immersiveTried || !RR.Input || !RR.Input.hasTouch) return;
    immersiveTried = true;
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (!req || document.fullscreenElement || document.webkitFullscreenElement) { lockLandscape(); return; }
    try {
      const p = req.call(el, { navigationUI: 'hide' });
      if (p && p.then) p.then(lockLandscape, () => {}); else lockLandscape();
    } catch (e) { lockLandscape(); }
  }

  // 3. A TABLET IS A TOUCH DEVICE THAT IS NOT A PHONE. uikit's phone HUD is keyed to
  //    max-height:500px, so an iPad in landscape keeps the DESKTOP layout — dial and chips in the
  //    bottom-right corner — while touch.js, which keys off hasTouch, puts the throttle column
  //    there. Publish how wide the control stack actually is and let index.html step the two
  //    widgets inboard of it. Measured rather than recomputed from touch.js's ems: the overlay is
  //    display:none until a race, so the first real measurement lands when the HUD comes up.
  //    BOTH corners, not just the right one: the steering pad is the bottom-LEFT of the same
  //    screen, and on a tablet the rival ticker and the landmark blade sit entirely inside it —
  //    your thumb covers the gaps and the building name. So publish the pad's height as well and
  //    let those two climb above it, the mirror of what --rr-thumbs-w does on the right.
  let thumbsKnown = false, thumbsWanted = false;     // false on a desktop: this then costs one bool
  function measureThumbs() {
    if (thumbsKnown || !thumbsWanted) return;
    const el = document.getElementById('rt-fire');
    const sz = document.getElementById('rt-steer');
    if (!el || !sz) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return;                        // display:none until the overlay is up
    thumbsKnown = true;
    const st = document.documentElement.style;
    st.setProperty('--rr-thumbs-w', Math.round(window.innerWidth - r.left) + 'px');
    st.setProperty('--rr-steer-h', Math.round(sz.getBoundingClientRect().height) + 'px');
  }

  // 4. ROTATING THE PHONE MUST STOP THE RACE. uikit's rotate gate covers the screen in portrait,
  //    but covering the screen is not stopping the boat: measured at 31.9 m/s with a finger on GO,
  //    the hull still ran 17 m blind behind the gate — far enough to find a seawall or miss a
  //    checkpoint you cannot see. Every phone player rotates by accident at least once, and losing a
  //    race to it is the one failure this whole workstream would not be forgiven for.
  //    The predicate is matchMedia with the gate's OWN query text rather than a width/height
  //    comparison of our own: two ways of asking "is the gate up" is two answers waiting to differ,
  //    and the wrong half of that pair pauses a landscape race or leaves a portrait one running.
  const ROTATE_Q = '(orientation:portrait) and (max-width:620px)';
  function watchRotate() {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(ROTATE_Q);
    const check = () => { if (mq.matches) pauseRace(); };   // pauseRace no-ops unless mode==='race'
    // addEventListener is the modern spelling; addListener is what older WebKit answers to, and a
    // phone browser old enough to need the fallback is exactly the phone this matters on.
    if (mq.addEventListener) mq.addEventListener('change', check);
    else if (mq.addListener) mq.addListener(check);
    // …and a belt-and-braces pass on the resize the rotation itself produces: iOS has been known to
    // resize without firing the media query listener when the URL bar moves in the same gesture.
    window.addEventListener('orientationchange', () => setTimeout(check, 120));
    check();
  }

  function installShell() {
    thumbsWanted = !!(RR.Input && RR.Input.hasTouch);
    if (thumbsWanted) document.documentElement.classList.add('rr-thumbs');
    watchRotate();
    syncViewport();
    window.addEventListener('resize', queueViewport);
    window.addEventListener('pageshow', queueViewport);
    // iOS resizes the window some time after it reports the rotation, so ask again as it settles
    window.addEventListener('orientationchange', () => {
      queueViewport();
      for (const ms of [120, 350, 700]) setTimeout(syncViewport, ms);
    });
    document.addEventListener('fullscreenchange', () => { queueViewport(); setTimeout(syncViewport, 260); });
    document.addEventListener('webkitfullscreenchange', () => { queueViewport(); setTimeout(syncViewport, 260); });
    const vv = window.visualViewport;
    if (vv) { vv.addEventListener('resize', queueViewport); vv.addEventListener('scroll', queueViewport); }
    // touchend, not touchstart: Safari only counts the END of a tap as a user gesture, and a
    // click covers the pointer devices that never send a touch at all.
    window.addEventListener('touchend', goImmersive, { passive: true });
    window.addEventListener('click', goImmersive);
  }

  // ---------- per-frame ----------
  const aiCtl = { throttle: 0, brake: 0, steer: 0, boost: false };
  let tagCooldown = 0;
  let nearTag = null;               // the landmark you are alongside right now (Architecture Tour)
  let rivalT = 0;
  const rivalBuf = [];              // hoisted: the doppler list must not allocate per frame

  // photo mode: drop the whole world into 0.25x slo-mo and swing a cinematic camera.
  // Everything — boats, crowds, traffic, water, easter eggs — slows together (engine timeScale).
  function togglePhotoMode() {
    if (mode === 'race') {
      mode = 'photo'; RR.HUD.show(false); RR.Engine.timeScale = 0.25;
      if (RR.HUD.cine) RR.HUD.cine(true, RR.Camera.shotLabel ? RR.Camera.shotLabel() : '');
    } else if (mode === 'photo') {
      mode = 'race'; RR.HUD.show(true); RR.Engine.timeScale = 1;
      if (RR.HUD.cine) RR.HUD.cine(false);
      if (player) RR.Camera.snapTo(player);
    }
  }

  function update(dt, t) {
    measureThumbs();                             // self-gating: a no-op the moment the stack is measured
    if (RR.Life) RR.Life.update(dt, t);          // crowds + traffic animate in every scene
    if (RR.Fireworks) RR.Fireworks.update(dt);
    if (mode === 'menu' || mode === 'results') {
      if (RR.Water && RR.Water.material) RR.Water.material.uniforms.uNumBoats.value = 0;  // no stale foam
      if (RR.Menus.screen() === 'vehicle' && showBoat) {
        // showroom: slow orbit around the boat bobbing on the lake chop
        const amp = RR.River.waveAmp(SHOW.x, SHOW.z);
        // the lake sheet renders 9 cm below the analytic wave field, so a boat parked at +0.18
        // shows 30 cm of daylight under its chines from 4 m away — every hull is modelled with
        // its designed waterline on the group origin, so sit that origin just into the water
        showBoat.position.y = RR.U.waterHeight(SHOW.x, SHOW.z, t, amp) - 0.16 + (showBoat.userData.hoverShow || 0);
        showBoat.rotation.set(Math.sin(t * 0.7) * 0.035, t * 0.4, Math.sin(t * 0.55) * 0.045);
        if (showBoat.userData.tick) showBoat.userData.tick(t, null);   // spin turbines / flicker plasma on display
        const cam = RR.Engine.camera;
        const len = showBoat.userData.showLen || 0;
        const r = Math.max(10.5, len * 0.85), up = Math.max(3.4, len * 0.20);
        const oa = t * 0.14;
        cam.position.set(SHOW.x + Math.sin(oa) * r, up + Math.sin(t * 0.3) * 0.5, SHOW.z + Math.cos(oa) * r);
        cam.up.set(0, 1, 0);
        cam.lookAt(SHOW.x, showBoat.position.y + Math.max(0.9, len * 0.06), SHOW.z);
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
    if (mode === 'paused') return;                   // timeScale 0 already froze the map; skip the sim entirely
    if (!raceState || !player) return;
    // in photo mode the sim below still runs — just at 0.25x via engine.timeScale — so the
    // whole scene glides in slo-mo; only the camera is overridden (at the follow site).

    RR.Input.update(dt);
    RR.Race.update(dt);
    // powerups.js keeps the pickup in a slot of its own; anything that wants to know what the
    // player is holding reads it off the hull. held() waits for the roll to land.
    if (RR.Powerups && RR.Powerups.held) player.item = RR.Powerups.held();

    const racing = raceState.phase !== 'countdown';

    // player — or, on the Architecture Tour until you have taken the wheel, the skipper
    let pc;
    if (raceState.tour && !tourDriving && docent) {
      RR.AI.update(docent, dt, t, player.routeD);
      docent.ctl.boost = false;                       // she does not have a boost button
      pc = docent.ctl;
    } else {
      pc = racing && !player.finished ? RR.Input : { throttle: player.finished ? 0.25 : 0, brake: 0, steer: RR.Input.steer * 0.4, boost: false };
    }
    RR.Physics.update(player, dt, pc, t);
    // The tour is a loop, not a one-way trip: at the far end of the route the run starts over at
    // the head of the river rather than steaming off into open lake for ten minutes.
    if (raceState.tour && !tourDriving && raceState.route && !raceState.route.loop &&
        player.routeD > raceState.route.len - 70) {
      RR.U.pathAt(raceState.route, 14, tourPt);
      player.pos.set(tourPt.x, 0.2, tourPt.z);
      player.heading = Math.atan2(tourPt.tx, tourPt.tz);
      player.vel.x = Math.sin(player.heading) * 6; player.vel.z = Math.cos(player.heading) * 6;
      player.routeD = 14; player._inLap = 14; player.routeHint = null; player.hint = {};
      RR.Audio.airhorn();
      if (RR.HUD.chip) RR.HUD.chip('near', 'NEXT TOUR DEPARTING', 3000);
    }

    // AI (single-player only)
    for (const p of pilots) {
      RR.AI.update(p, dt, t, player.routeD);
      if (RR.Powerups && RR.Powerups.aiSteer) RR.Powerups.aiSteer(p, dt);   // deviate for a crate
      const c = racing ? p.ctl : aiCtl;
      RR.Physics.update(p.boat, dt, c, t);
    }

    // multiplayer: rivals are network-driven — interpolate them, and broadcast my own boat
    if (raceState.mp && RR.Net.active) {
      for (const b of remotes) RR.Net.applyRemote(b, dt);
      netSendT -= dt;
      if (netSendT <= 0) { RR.Net.sendState(player); netSendT = 1 / 14; }   // ~14 Hz
    }

    if (!raceState.mp) RR.Physics.collidePairs(boats, dt);   // MP contact handled visually; no authoritative push (avoids fighting the net)

    // A bascule leaf rising just ahead scatters the gulls off the girder, and the horn is the
    // TENDER'S — every lift is his own now, since nothing in the game can ask him for one.
    if (racing && RR.Bridges && RR.Bridges.openings) {
      for (const o of RR.Bridges.openings) {
        const near = RR.U.dist2(player.pos.x, player.pos.z, o.x, o.z) < 95 * 95;
        if (near && o.rising && !o._warned) {
          o._warned = true;
          if (RR.Audio.airhorn) RR.Audio.airhorn();
          if (RR.Audio.seagull) RR.Audio.seagull();
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
    RR.Replay.sample(player, t);      // self-gating at 20 Hz; a no-op unless Race started a time trial

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
    let seated = false;
    if (mode === 'photo') {
      // rawDt so the rig keeps swinging at a natural rate while the world runs at 0.25x
      RR.Camera.cinematic(player, dt, RR.Engine.rawDt || dt);   // [ and ] cycle the five shots
      if (RR.HUD.cine) RR.HUD.cine(true, RR.Camera.shotLabel ? RR.Camera.shotLabel() : '');
    } else if (!(window.RRTest && window.RRTest._freecam)) {
      seated = raceState.tour && tourCamera(player, dt);
      if (!seated) RR.Camera.follow(player, dt);
    }
    RR.Engine.trackShadow(player.pos.x, player.pos.z);

    // W5's seam into the composite pass: speed drives the radial streaks. 46 is the next-best
    // hull's top speed, so ordinary boats reach full streaks at their own ceiling and the podracer
    // overdrives past it (post.js clamps). The grade's other input was the salute chain; with the
    // salute retired nothing pushes the tier off zero, so nothing calls setChainTier any more.
    if (RR.Post && RR.Post.setSpeed) RR.Post.setSpeed(Math.hypot(player.vel.x, player.vel.z) / 46);

    RR.HUD.update(dt, player, raceState);
    RR.Minimap.draw(raceState, player, boats);

    // the chase rig computes its own bridge duck; a seat bolted to the deck has to ask directly,
    // and passing under a bascule leaf on the open deck is exactly when the reverb should slam shut
    let duck = RR.Camera.duck ? RR.Camera.duck() : 0;
    if (seated) {
      const deckY = RR.Bridges && RR.Bridges.duckY ? RR.Bridges.duckY(player.pos.x, player.pos.z) : Infinity;
      duck = isFinite(deckY) ? 1 : 0;
    }
    const lock = window.CHICAGO && CHICAGO.lake && CHICAGO.lake.lock;
    const inLock = !!lock && RR.U.dist2(player.pos.x, player.pos.z, lock.x, lock.z) < 90 * 90;
    RR.Audio.update(dt, {
      rpm: player.rpm,
      speed: Math.hypot(player.vel.x, player.vel.z),
      top: player.spec.top,
      throttle: pc.throttle || 0,
      turning: Math.abs(pc.steer || 0),
      airborne: player.airborne,
      inLake: RR.River.inLake(player.pos.x, player.pos.z),
      x: player.pos.x,
      duck, nearLock: inLock,
      planeF: player.planeF || 0,
      boostHeat: player.boostHeat || 0,
      progress: raceState.route ? RR.U.clamp((player.routeD || 0) / Math.max(1, raceState.route.len * (raceState.course.laps || 1)), 0, 1) : 0,
      racePos: player.racePos || 1,
      nBoats: boats.length,
      lead: (player.racePos || 1) <= 2,
    });
    // the lock is a 2.4 s concrete box and the bridge underside is 1.15 s — same send, two rooms
    if (RR.Audio.setSpace) RR.Audio.setSpace(Math.max(duck, inLock ? 0.85 : 0), inLock ? 0.9 : duck * 0.85);
    if (RR.Audio.scrape) RR.Audio.scrape((player.scrapeT || 0) > 0, RR.U.clamp((player.scrapeT || 0) * 2, 0, 1));

    // rival doppler list, 10 Hz, into a hoisted buffer
    rivalT -= dt;
    if (rivalT <= 0 && RR.Audio.setRivals) {
      rivalT = 0.1;
      rivalBuf.length = 0;
      const rs = Math.sin(player.heading), rc = Math.cos(player.heading);
      for (const b of boats) {
        if (b === player) continue;
        const dx = b.pos.x - player.pos.x, dz = b.pos.z - player.pos.z;
        const d = Math.max(1, Math.hypot(dx, dz));
        if (d > 60) continue;
        rivalBuf.push({ d, lat: (dx * rc - dz * rs) / d,
          closeRate: ((b.vel.x - player.vel.x) * dx + (b.vel.z - player.vel.z) * dz) / d,
          rpm: b.rpm, kind: b.spec.kind });
      }
      rivalBuf.sort((a, b) => a.d - b.d);
      RR.Audio.setRivals(rivalBuf.slice(0, 3));
    }

    // landmark callouts
    tagCooldown -= dt;
    if (tagCooldown <= 0) {
      nearTag = null;
      for (const tag of landmarkTags) {
        if (RR.U.dist2(player.pos.x, player.pos.z, tag.x, tag.z) < tag.r2) {
          nearTag = tag;
          RR.HUD.tagLandmark(tag.name, tag.sub);
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
    // Architecture Tour hooks: board her, change seats, take the wheel
    startTour: (c) => { RR.Menus.hide(); RR.Audio.setMusic(false); startRace(c || 0, 0, false, null, true); },
    tourView: (i) => setTourView(i | 0),
    tourWheel: (on) => setTourDriving(on !== false),
    tourState: () => (raceState && raceState.tour ? {
      driving: tourDriving, view: TOUR_VIEWS[tourCam].name,
      speed: Math.hypot(player.vel.x, player.vel.z), routeD: Math.round(player.routeD),
    } : null),
    cupBoard: () => (RR.Race.cupBoard ? RR.Race.cupBoard() : null),
    // multiplayer test hooks (mock transport = same-browser tabs talk over BroadcastChannel)
    netJoin: (room, name, boatIdx) => RR.Net.join({ room, name, boatIdx: boatIdx || 0, transport: RR.Transports.mock() }),
    netStart: (c) => RR.Net.startAsHost(c || 0),
    netRoster: () => RR.Net.roster(),
    netResults: () => RR.Net.results(),
    netCount: () => RR.Net.count(),
    netActive: () => !!(RR.Net && RR.Net.active),
    netRemotes: () => remotes.map((b) => ({ id: b.netId, name: b.displayName, x: +b.pos.x.toFixed(1), z: +b.pos.z.toFixed(1), finished: !!b.finished })),
    netPhase: () => (raceState ? raceState.phase : null),
    netItems: () => !!(RR.Net && RR.Net.items && RR.Net.items()),
    // power-ups over the wire: the crate table, who holds what, and the protocol trace both ways
    puNet: () => (RR.Powerups && RR.Powerups.netDebug ? RR.Powerups.netDebug() : null),
    puCrates: () => (RR.Powerups && RR.Powerups.crates
      ? RR.Powerups.crates().map((c, i) => ({ i, x: +c.x.toFixed(1), z: +c.z.toFixed(1), d: Math.round(c.d), taken: !!c.taken }))
      : []),
    puFire: () => !!(RR.Powerups && RR.Powerups.use && RR.Powerups.use()),
    // step the sim without handing the wheel to the warp autopilot (which would drive off a crate)
    step: (sec) => RR.Engine.warp(sec == null ? 0.5 : sec),
    selfProgress: () => (player ? { routeD: Math.round(player.routeD), lap: player.lap, finished: !!player.finished } : null),
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
    // the phone shell, as facts rather than assumptions: does the HUD's box agree with the drawing
    // buffer, are the thumb controls up, and did fullscreen/orientation actually take
    shell: () => ({
      touch: !!(RR.Input && RR.Input.hasTouch),
      overlay: !!(RR.Touch && RR.Touch.visible && RR.Touch.visible()),
      tier: RR.Engine.tier,
      vw: window.innerWidth, vh: window.innerHeight,
      cssVh: getComputedStyle(document.documentElement).getPropertyValue('--rr-vh').trim(),
      hudH: Math.round($('hud').getBoundingClientRect().height),
      canvas: [RR.Engine.renderer.domElement.width, RR.Engine.renderer.domElement.height],
      dpr: window.devicePixelRatio || 1,
      fullscreen: !!(document.fullscreenElement || document.webkitFullscreenElement),
      fsApi: !!document.documentElement.requestFullscreen,
      lockApi: !!(window.screen && window.screen.orientation && window.screen.orientation.lock),
    }),
    immersive: () => { immersiveTried = false; goImmersive(); return true; },
    // hold full quality (disable adaptive downgrade) — used by visual tests on the software renderer
    pinQuality: () => { RR.Engine.setAutoQuality(false); if (RR.Reflect) RR.Reflect.enabled = true; if (RR.Post) RR.Post.enabled = true; },
    // A fresh boot already lands on the title screen, so this is only a way BACK to it from a race
    // or a tour. Setting mode='menu' by hand would leave RR.Race.state() truthy on the title
    // screen, which re-satisfies the `live` guard in bridges.js and puts the ambient tender's horn
    // back under the title music — so it goes out the front door instead.
    toTitle: () => {
      quitToTitle();
      if (RR.Menus.showTitle) RR.Menus.showTitle();
      return true;
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
  // The scripted cold open is gone and a fresh save now boots straight to the title, so there is
  // nothing left to skip. Harness scripts that still ask for it get the way back to the title.
  window.RRTest.skipOpening = window.RRTest.toTitle;

  function bootOnce() { if (!booted) { booted = 1; installShell(); boot(); } }
  window.addEventListener('DOMContentLoaded', bootOnce);
  if (document.readyState !== 'loading') bootOnce();
})();

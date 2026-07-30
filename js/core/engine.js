/* River Racer — renderer, scene, main loop, performance tiers + adaptive quality */
(function () {
  const E = { SKIP_REFLECT: 1, autoQuality: true, timeScale: 1, rawDt: 0, wantShadows: true };
  E.setAutoQuality = function (on) { E.autoQuality = on; };
  let renderer, scene, camera;
  let updateFns = [];
  let last = 0, simTime = 0, running = false;
  // -1 so the very first throttled frame renders the map rather than sampling an empty one
  let fpsEMA = 60, qualityTimer = 0, pixelScale = 1, shadowPhase = -1;

  // ---------------------------------------------------------------------------------------
  // PERFORMANCE TIERS
  //
  // A phone is not a small desktop. Three things in this renderer are each, on their own, more
  // than a mid-range mobile GPU has: a 3x backbuffer (2532x1170 to fill a 844x390 view), the
  // planar water mirror (a second pass over essentially the whole world), and a 2048 PCF-soft
  // shadow map (a third pass over every caster). The adaptive ladder below would eventually find
  // its way down to something playable, but only after ten seconds of stutter and only by
  // stripping everything, in the wrong order, because its thresholds assume a 60 fps target.
  //
  // So the tier is decided BEFORE the renderer exists and the phone never renders a heavy frame.
  // Each field is a named, reversible decision — see the mobile row for what a phone gives up.
  const TIERS = {
    desktop: {
      maxPR: 2, msaa: true, fpsK: 1,
      reflect: true, reflectScale: 0.42, reflectFar: 2600, reflectOff: 40, reflectOn: 54, reflectKeep: 42,
      shadowMap: 2048, shadowType: 'soft', shadowHalfCap: Infinity, shadowEvery: 1,
      bloomDiv: 2, blurPasses: 4, streaks: 1,
      fineWater: 1, cloudOctaves: 3,
    },
    mobile: {
      // 1.5 is the cap, not 2 and not 3. A phone reports dpr 3 and 844x390 CSS px; at 3x that is
      // a 2.96 Mpx backbuffer, at 2x 1.32 Mpx, at 1.5x 0.74 Mpx. The HUD is DOM and stays native
      // sharp either way, so the only thing 3x buys is sub-pixel detail on a 460 ppi screen that
      // no one can resolve at 40 mph — and it costs 4x the fill rate on every pass in the frame.
      maxPR: 1.5, msaa: false,
      // The ladder aims at 30 fps on a phone, not 60. Without this every rung would fire at once
      // on a device that is locked to a perfectly playable 30 and never recover.
      fpsK: 0.5,
      // First and biggest: BOOT with no planar mirror. In daylight the water falls back to its
      // sky-fresnel term, which still knows which way each wave face points, and reads as the
      // opaque grey-green channel the Chicago River actually is. At NIGHT it is a real loss — the
      // mirror is what puts the lit window grids on the water — so the mirror is something a phone
      // can EARN back: hold the ON threshold without it and it comes on at a third of the desktop
      // resolution; drop under 26 and it goes again. A phone never boots with it and a slow one
      // never sees it.
      // 54, not 48. Measured, switching the mirror on costs ~40% of the frame — so a phone sitting
      // at exactly 48 without it lands near 29 WITH it, which is inside the band and therefore
      // stays: that device parks at 29 fps when it could have had 48, and one extra boat on screen
      // tips it through 26 and starts the pair oscillating. 54 lands near 32, clear of both the 26
      // floor and the 30 the whole mobile ladder aims at. reflectKeep is the other half of that
      // arithmetic — see the probation in the quality loop.
      reflect: false, reflectScale: 0.30, reflectOff: 26, reflectOn: 54, reflectKeep: 28,
      // far stays at the desktop 2.6 km. A 700 m mirror measured 194 draw calls cheaper again, but
      // the reflection camera's far plane is also what the water samples where nothing was drawn,
      // and out on the open lake the skyline it would cut away IS the shot. Not taken un-verified.
      reflectFar: 2600,
      // Shadows stay ON — a boat with no contact shadow floats above the river — but at a quarter
      // of the texels, plain PCF instead of the soft 3x3, a 200 m sun frustum instead of 360 m
      // (which also culls two thirds of the casters), and re-rendered every OTHER frame. One
      // frame of lag in a shadow edge at 30 fps is not a thing an eye can see.
      shadowMap: 1024, shadowType: 'pcf', shadowHalfCap: 200, shadowEvery: 2,
      // Bloom stays — the golden-hour glow and the lit windows ARE the look. It just runs its
      // gaussian at quarter res over two passes instead of half res over four: an eighth of the
      // fill for a very slightly wider, softer glow. Speed streaks go: six extra full-res taps
      // in the composite is the single most expensive line of shader in the frame.
      bloomDiv: 4, blurPasses: 2, streaks: 0,
      // The two shader octave rungs are deliberately NOT taken. Each is one texture2D over part of
      // one surface — order 0.1 ms of a 33 ms budget on any GPU that can run this at all — and
      // both were rendered with and without: dropping the water's close-up octave turns the near
      // field plastic, and collapsing the sky to one octave turns every cloud into a blob. They
      // are still rungs on the ladder below, so a device that really is that slow still gets them.
      fineWater: 1, cloudOctaves: 3,
    },
  };
  let Q = TIERS.desktop;
  let maxPR = 2;

  // Touch alone is not a phone: a Windows laptop with a touchscreen has a mouse and must keep the
  // desktop tier. The screen, not the window, sets the size test — a 900 px browser window on a
  // 27" monitor is still a desktop. UA is a tie-breaker for the one case the media queries miss
  // (an in-app webview), never the only signal.
  function detect() {
    const mm = (q) => !!(window.matchMedia && window.matchMedia(q).matches);
    const touch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
    const s = window.screen || {};
    const big = Math.max(s.width || window.innerWidth, s.height || window.innerHeight);
    const small = big <= 1180;                 // every phone, and every tablet short of an iPad Pro
    const fingerFirst = mm('(pointer: coarse)') || !mm('(any-pointer: fine)');
    const uaMobile = /Android|iPhone|iPod|iPad|Mobile|Silk|Kindle/i.test(navigator.userAgent || '');
    return (touch && small && (fingerFirst || uaMobile)) ? 'mobile' : 'desktop';
  }

  function normTier(v) {
    if (v == null) return null;
    v = String(v).toLowerCase();
    if (v === 'mobile' || v === 'low' || v === 'phone') return 'mobile';
    if (v === 'desktop' || v === 'high' || v === 'full') return 'desktop';
    return null;                               // 'auto' and anything unknown means "use detection"
  }

  // ?tier=mobile forces the phone tier on a desktop so it can be tested; ?tier=desktop gets a fast
  // tablet the good version. Either sticks in localStorage so the settings UI has somewhere to
  // write, and ?tier=auto clears it again.
  const TIER_KEY = 'rr.tier';
  function readOverride() {
    let raw = null;
    try {
      const q = /[?&#](?:tier|quality)=([\w-]+)/.exec(window.location.search + window.location.hash);
      if (q) raw = q[1];
      if (raw) {
        const t = normTier(raw);
        if (t) localStorage.setItem(TIER_KEY, t); else localStorage.removeItem(TIER_KEY);
        return t;
      }
      return normTier(localStorage.getItem(TIER_KEY));
    } catch (e) { return normTier(raw); }      // file:// with storage blocked still honours the URL
  }

  E.detectedTier = detect();
  E.tierOverride = readOverride();

  // set once the adaptive ladder has decided this device can afford a mirror the tier did not give
  // it. Survives theme switches (which re-run applyQuality) so the water never flickers.
  // reflectTrial counts the quality passes a freshly-enabled mirror still has to survive; reflectWait
  // is the back-off after a failed trial, in the same units; reflectBackoff is the length of the NEXT
  // one, doubling on each failure so a device that cannot hold it settles instead of oscillating.
  let reflectEarned = false, reflectTrial = 0, reflectWait = 0, reflectBackoff = 2;
  function dropMirror() {
    RR.Reflect.enabled = false;
    reflectEarned = false;
    reflectTrial = 0;
    reflectWait = reflectBackoff;
    reflectBackoff = Math.min(40, reflectBackoff * 2);       // 3 s, 6 s, 12 s … capped at a minute
    if (RR.Water && RR.Water.material) RR.Water.material.uniforms.uReflectStrength.value = 0;
  }

  function selectTier(name) {
    E.tier = TIERS[name] ? name : 'desktop';
    E.mobile = E.tier === 'mobile';
    Q = TIERS[E.tier];
    E.quality = Q;
    reflectEarned = false;
    reflectTrial = 0; reflectWait = 0; reflectBackoff = 2;
    maxPR = Math.min(window.devicePixelRatio || 1, Q.maxPR);
  }
  selectTier(E.tierOverride || E.detectedTier);

  // Push the current tier onto everything that exists right now. Safe to call at any point in the
  // boot: the water and sky materials are built long after E.init(), so theme.js calls this again.
  E.applyQuality = function () {
    if (RR.Reflect) {
      RR.Reflect.scale = Q.reflectScale;
      RR.Reflect.far = Q.reflectFar;
      if (RR.Reflect.setAllowed) RR.Reflect.setAllowed(Q.reflect || reflectEarned);
    }
    if (RR.Post) {
      if (RR.Post.setTier) RR.Post.setTier(Q);
      if (RR.Post.streaks > Q.streaks) RR.Post.streaks = Q.streaks;
    }
    if (RR.Water && RR.Water.material) {
      const u = RR.Water.material.uniforms;
      if (u.uFineDetail && u.uFineDetail.value > Q.fineWater) u.uFineDetail.value = Q.fineWater;
    }
    if (RR.Sky && RR.Sky.mat && RR.Sky.mat.uniforms.uCloudOctaves) {
      const u = RR.Sky.mat.uniforms.uCloudOctaves;
      if (u.value > Q.cloudOctaves) u.value = Q.cloudOctaves;
    }
    if (E.sun) {
      const sh = E.sun.shadow;
      if (sh.mapSize.x !== Q.shadowMap) {
        sh.mapSize.set(Q.shadowMap, Q.shadowMap);
        if (sh.map) { sh.map.dispose(); sh.map = null; }   // three allocates once; force a rebuild
        // the rebuild has to happen on the next frame even if the throttle would have skipped it
        if (renderer) renderer.shadowMap.needsUpdate = true;
      }
      const c = sh.camera, half = Math.min(Q.shadowHalfCap, Math.abs(c.right) || Q.shadowHalfCap);
      c.left = -half; c.right = half; c.top = half; c.bottom = -half;
      c.updateProjectionMatrix();
    }
    if (renderer) {
      const want = Q.shadowType === 'soft' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      if (renderer.shadowMap.type !== want) {
        renderer.shadowMap.type = want;
        // the filter is a shader define, so every program that reads the map has to be rebuilt
        if (scene) scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
      }
      // only when it actually moved — setSize() reallocates the drawing buffer, and this runs on
      // every theme switch
      if (renderer.getPixelRatio() !== maxPR * pixelScale) onResize();
    }
  };

  // 'mobile' | 'desktop' force a tier and remember it; 'auto' (or null) returns to detection.
  // A settings screen calls this; so does ?tier= on the URL.
  E.setTier = function (name) {
    const t = normTier(name);
    try { if (t) localStorage.setItem(TIER_KEY, t); else localStorage.removeItem(TIER_KEY); } catch (e) { /* storage blocked */ }
    E.tierOverride = t;
    selectTier(t || E.detectedTier);
    pixelScale = 1;
    E.applyQuality();
    // the presets carry the shadow extents and the water colours, so the tier only really lands
    // once they are re-applied — but only after init(), or there are no lights to write to yet
    if (renderer && RR.Theme && RR.Theme.apply) RR.Theme.apply(RR.Theme.mode);
    return E.tier;
  };

  E.init = function () {
    const canvas = document.getElementById('gl');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.msaa, powerPreference: 'high-performance' });
    renderer.setPixelRatio(maxPR);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = Q.shadowType === 'soft' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = true;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 9000);
    camera.position.set(0, 40, 120);
    camera.layers.enable(E.SKIP_REFLECT);   // main view shows everything; the reflection cam skips layer 1

    // Key light. Chicago is 41.9 N and the Main Branch runs east-west, so the sun belongs in the
    // SOUTHERN half of the sky: north-bank walls face south and burn, south-bank walls stay cool.
    // E.sunDir / E.sunDist are the single source of truth — theme.js writes them, trackShadow reads.
    E.sunDir = new THREE.Vector3(-0.5668, 0.6947, 0.4429).normalize();
    E.sunDist = 1400;
    const sun = new THREE.DirectionalLight(0xffeed8, 1.85);
    sun.position.copy(E.sunDir).multiplyScalar(E.sunDist);
    sun.castShadow = true;
    sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
    const half0 = Math.min(360, Q.shadowHalfCap);
    sun.shadow.camera.near = 100; sun.shadow.camera.far = 3400;
    sun.shadow.camera.left = -half0; sun.shadow.camera.right = half0;
    sun.shadow.camera.top = half0; sun.shadow.camera.bottom = -half0;
    sun.shadow.bias = -0.00055;
    sun.shadow.normalBias = 0.9;
    sun.layers.enable(E.SKIP_REFLECT);      // lights must reach layer-1 objects too (layers gate illumination)
    scene.add(sun);
    scene.add(sun.target);
    E.sun = sun;

    // Two unshadowed directionals. Lambert lights per-vertex in r14x, so these are nearly free,
    // and one key in a canyon is what crushes the shaded bank to black.
    E.fillDir = new THREE.Vector3(0.5567, 0.5000, -0.6634).normalize();
    const fill = new THREE.DirectionalLight(0x8fb4d8, 0.34);   // cold north-sky fill, opens the shaded bank
    fill.castShadow = false;
    fill.layers.enable(E.SKIP_REFLECT);
    fill.position.copy(E.fillDir).multiplyScalar(900);
    scene.add(fill); scene.add(fill.target);
    E.fill = fill;

    // river bounce, aimed UP from below the world: bridge soffits, cornice undersides and hull
    // bottoms otherwise render as flat black slabs because nothing in the rig ever hits them.
    const bounce = new THREE.DirectionalLight(0x6f8f72, 0.22);
    bounce.castShadow = false;
    bounce.layers.enable(E.SKIP_REFLECT);
    bounce.position.set(0, -600, 90);
    scene.add(bounce); scene.add(bounce.target);
    E.bounce = bounce;

    const hemi = new THREE.HemisphereLight(0xa8c8e8, 0x6e6a60, 0.95);
    hemi.layers.enable(E.SKIP_REFLECT);
    scene.add(hemi);
    E.hemi = hemi;

    scene.fog = new THREE.Fog(0xc3d2dd, 520, 3900);

    window.addEventListener('resize', onResize);

    E.renderer = renderer; E.scene = scene; E.camera = camera;

    // tier before allocation: the bloom chain and the mirror both size their render targets in
    // init(), and a phone should never pay for the desktop-sized pair even once
    if (RR.Post && RR.Post.setTier) RR.Post.setTier(Q);
    if (RR.Reflect) { RR.Reflect.scale = Q.reflectScale; RR.Reflect.far = Q.reflectFar; RR.Reflect.init(); }
    if (RR.Post) RR.Post.init(renderer);
    E.applyQuality();
    console.log(`[RR] quality tier: ${E.tier}${E.tierOverride ? ' (forced)' : ' (detected)'} — `
      + `${window.innerWidth}x${window.innerHeight} css @${maxPR}x, reflections ${Q.reflect ? 'on' : 'off'}`);
  };

  function onResize() {
    if (!renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(maxPR * pixelScale);
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // shadow camera follows a world position (the player) so the map stays sharp
  E.trackShadow = function (x, z) {
    E.sun.target.position.set(x, 0, z);
    E.sun.position.copy(E.sunDir).multiplyScalar(E.sunDist).add(E.sun.target.position);
    E.fill.target.position.set(x, 0, z);
    E.fill.position.copy(E.fillDir).multiplyScalar(900).add(E.fill.target.position);
    E.bounce.target.position.set(x, 0, z);
    E.bounce.position.set(x, -600, z + 90);
  };

  E.onUpdate = function (fn) { updateFns.push(fn); };

  E.start = function () {
    if (running) return;
    running = true;
    last = performance.now();
    renderer.setAnimationLoop(tick);
  };

  let warpBank = 0;                       // seconds of instant simulation requested by the test API
  E.warp = function (sec) { warpBank += sec; };
  E.fps = function () { return fpsEMA; };
  E.time = function () { return simTime; };

  function step(dt) {
    simTime += dt;
    for (let i = 0; i < updateFns.length; i++) updateFns[i](dt, simTime);
  }

  function tick(now) {
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    E.rawDt = dt;                    // real wall-clock dt (camera swings, UI use this)

    const inst = 1000 / Math.max(1, now - (tick._p || now - 16));
    tick._p = now;
    fpsEMA = fpsEMA * 0.95 + Math.min(120, inst) * 0.05;

    // adaptive quality: hold ~60fps on modest GPUs, restore full quality when there's headroom.
    // Degrades gently in order (resolution → reflections → bloom → shadows) and recovers with hysteresis.
    // Every threshold is scaled by Q.fpsK, which is 1 on desktop (so these numbers are literal) and
    // 0.5 on a phone, where 30 fps is the target and a 60 fps rung would strip the frame on sight.
    // Every ceiling is the TIER's, so a rung can never restore something the tier does not allow.
    qualityTimer += dt;
    if (qualityTimer > 1.5) {
      qualityTimer = 0;
      if (E.autoQuality) {
        const K = Q.fpsK;
        // first rung, above every other: the speed streaks are the only thing here the player
        // never sees the absence of, so they go before a single pixel of resolution does.
        if (RR.Post) {
          if (fpsEMA < 50 * K && RR.Post.streaks > 0) RR.Post.streaks = 0;
          else if (fpsEMA > 57 * K && RR.Post.streaks < Q.streaks) RR.Post.streaks = Q.streaks;
        }
        if (fpsEMA < 47 * K && pixelScale > 0.55) { pixelScale = Math.max(0.55, pixelScale - 0.15); onResize(); }
        else if (fpsEMA > 57 * K && pixelScale < 1) { pixelScale = Math.min(1, pixelScale + 0.1); onResize(); }
        // The mirror is the one rung with its own thresholds rather than scaled ones: the phone
        // tier boots with it vetoed (allowed=false) and can only earn it back here, on evidence.
        // It is also the one rung big enough to invalidate the measurement that turned it on — a
        // second pass over essentially the whole world — so it comes back ON PROBATION and has to
        // prove it held. Two quality passes (3 s) later the EMA either cleared reflectKeep or the
        // mirror goes off again and the next attempt waits twice as long. A device that genuinely
        // cannot afford it therefore stops asking instead of flickering across the band edge; a
        // device that can pays the 3 s once. Nothing here fires when autoQuality is off.
        if (RR.Reflect) {
          if (reflectWait > 0) reflectWait--;
          if (fpsEMA < Q.reflectOff && RR.Reflect.enabled) {
            dropMirror();
          } else if (reflectTrial > 0 && RR.Reflect.enabled) {
            // on trial: hold the verdict until the EMA has had time to catch up with the new cost
            if (--reflectTrial === 0 && fpsEMA < Q.reflectKeep) dropMirror();
            else if (reflectTrial === 0) reflectBackoff = 2;      // it held — forgive the history
          } else if (fpsEMA > Q.reflectOn && !RR.Reflect.enabled && reflectWait === 0) {
            reflectEarned = true;
            if (!RR.Reflect.allowed && RR.Reflect.setAllowed) RR.Reflect.setAllowed(true);
            RR.Reflect.enabled = true;
            reflectTrial = 2;
          }
        }
        // shader rungs before bloom: dome cloud octaves 3 -> 1, then the water's close-up octave.
        // Never swap materials here — a program recompile mid-race stalls far worse than it saves.
        if (RR.Sky && RR.Sky.mat && RR.Sky.mat.uniforms.uCloudOctaves) {
          const u = RR.Sky.mat.uniforms.uCloudOctaves;
          u.value = fpsEMA < 44 * K ? 1 : (fpsEMA > 55 * K ? Q.cloudOctaves : Math.min(u.value, Q.cloudOctaves));
        }
        if (RR.Water && RR.Water.material && RR.Water.material.uniforms.uFineDetail) {
          const u = RR.Water.material.uniforms.uFineDetail;
          u.value = fpsEMA < 44 * K ? 0 : (fpsEMA > 55 * K ? Q.fineWater : Math.min(u.value, Q.fineWater));
        }
        if (RR.Post) { if (fpsEMA < 32 * K && RR.Post.enabled) RR.Post.enabled = false; else if (fpsEMA > 50 * K && !RR.Post.enabled) RR.Post.enabled = true; }
        if (fpsEMA < 26 * K && renderer.shadowMap.enabled) { renderer.shadowMap.enabled = false; E.sun.castShadow = false; }
        else if (fpsEMA > 52 * K && !renderer.shadowMap.enabled) { renderer.shadowMap.enabled = true; E.sun.castShadow = E.wantShadows; }
      }
    }

    if (warpBank > 0) {
      // burn warp time in fixed sub-steps so physics stays sane during tests
      const h = 1 / 60;
      let spent = 0;
      while (spent < warpBank && spent < 12) { step(h); spent += h; }
      warpBank = Math.max(0, warpBank - spent);
    }
    // one global clock: pause sets timeScale 0 (whole map freezes), photo slo-mo sets 0.25.
    // simTime advances by the same scaled dt so t-driven animations freeze/slow in lockstep.
    step(dt * (E.timeScale != null ? E.timeScale : 1));

    // The shadow map is a whole extra pass over every caster in the sun frustum. On a phone it is
    // re-rendered every OTHER frame: the map lags the world by ~16 ms, which no eye reads on a
    // soft-edged ground shadow, and it hands back half of the cost of having shadows at all.
    if (renderer.shadowMap.enabled && Q.shadowEvery > 1) {
      shadowPhase = (shadowPhase + 1) % Q.shadowEvery;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = shadowPhase === 0;
    } else if (!renderer.shadowMap.autoUpdate && Q.shadowEvery <= 1) {
      renderer.shadowMap.autoUpdate = true;
    }

    if (RR.Reflect && RR.Reflect.enabled) RR.Reflect.update(renderer, scene, camera);
    if (RR.Post && RR.Post.enabled) RR.Post.render(renderer, scene, camera);
    else renderer.render(scene, camera);
  }

  RR.Engine = E;
})();

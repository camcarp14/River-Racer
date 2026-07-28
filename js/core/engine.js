/* River Racer — renderer, scene, main loop, adaptive quality */
(function () {
  const E = { SKIP_REFLECT: 1, autoQuality: true, timeScale: 1, rawDt: 0, wantShadows: true };
  E.setAutoQuality = function (on) { E.autoQuality = on; };
  let renderer, scene, camera;
  let updateFns = [];
  let last = 0, simTime = 0, running = false;
  let fpsEMA = 60, qualityTimer = 0, pixelScale = 1;
  const MAX_PR = Math.min(window.devicePixelRatio || 1, 2);

  E.init = function () {
    const canvas = document.getElementById('gl');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(MAX_PR);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 100; sun.shadow.camera.far = 3400;
    sun.shadow.camera.left = -360; sun.shadow.camera.right = 360;
    sun.shadow.camera.top = 360; sun.shadow.camera.bottom = -360;
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

    if (RR.Reflect) RR.Reflect.init();
    if (RR.Post) RR.Post.init(renderer);
  };

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(MAX_PR * pixelScale);
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
    qualityTimer += dt;
    if (qualityTimer > 1.5) {
      qualityTimer = 0;
      if (E.autoQuality) {
        // first rung, above every other: the speed streaks are the only thing here the player
        // never sees the absence of, so they go before a single pixel of resolution does.
        if (RR.Post) {
          if (fpsEMA < 50 && RR.Post.streaks > 0) RR.Post.streaks = 0;
          else if (fpsEMA > 57 && RR.Post.streaks < 1) RR.Post.streaks = 1;
        }
        if (fpsEMA < 47 && pixelScale > 0.55) { pixelScale = Math.max(0.55, pixelScale - 0.15); onResize(); }
        else if (fpsEMA > 57 && pixelScale < 1) { pixelScale = Math.min(1, pixelScale + 0.1); onResize(); }
        if (RR.Reflect) {
          if (fpsEMA < 40 && RR.Reflect.enabled) {
            RR.Reflect.enabled = false;
            if (RR.Water && RR.Water.material) RR.Water.material.uniforms.uReflectStrength.value = 0;
          } else if (fpsEMA > 54 && !RR.Reflect.enabled) RR.Reflect.enabled = true;
        }
        // shader rungs before bloom: dome cloud octaves 3 -> 1, then the water's close-up octave.
        // Never swap materials here — a program recompile mid-race stalls far worse than it saves.
        if (RR.Sky && RR.Sky.mat && RR.Sky.mat.uniforms.uCloudOctaves) {
          RR.Sky.mat.uniforms.uCloudOctaves.value = fpsEMA < 44 ? 1 : (fpsEMA > 55 ? 3 : RR.Sky.mat.uniforms.uCloudOctaves.value);
        }
        if (RR.Water && RR.Water.material && RR.Water.material.uniforms.uFineDetail) {
          RR.Water.material.uniforms.uFineDetail.value = fpsEMA < 44 ? 0 : (fpsEMA > 55 ? 1 : RR.Water.material.uniforms.uFineDetail.value);
        }
        if (RR.Post) { if (fpsEMA < 32 && RR.Post.enabled) RR.Post.enabled = false; else if (fpsEMA > 50 && !RR.Post.enabled) RR.Post.enabled = true; }
        if (fpsEMA < 26 && renderer.shadowMap.enabled) { renderer.shadowMap.enabled = false; E.sun.castShadow = false; }
        else if (fpsEMA > 52 && !renderer.shadowMap.enabled) { renderer.shadowMap.enabled = true; E.sun.castShadow = E.wantShadows; }
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

    if (RR.Reflect && RR.Reflect.enabled) RR.Reflect.update(renderer, scene, camera);
    if (RR.Post && RR.Post.enabled) RR.Post.render(renderer, scene, camera);
    else renderer.render(scene, camera);
  }

  RR.Engine = E;
})();

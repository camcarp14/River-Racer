/* River Racer — renderer, scene, main loop, adaptive quality */
(function () {
  const E = { SKIP_REFLECT: 1, autoQuality: true, timeScale: 1, rawDt: 0 };
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

    // golden-hour key light from the west (sun low over the river canyon)
    const sun = new THREE.DirectionalLight(0xffdcae, 1.55);
    sun.position.set(-0.72, 0.38, -0.16).multiplyScalar(1400);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 200; sun.shadow.camera.far = 3200;
    sun.shadow.camera.left = -320; sun.shadow.camera.right = 320;
    sun.shadow.camera.top = 320; sun.shadow.camera.bottom = -320;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 2.0;
    sun.layers.enable(E.SKIP_REFLECT);      // lights must reach layer-1 objects too (layers gate illumination)
    scene.add(sun);
    scene.add(sun.target);
    E.sun = sun;

    const hemi = new THREE.HemisphereLight(0xcfe3f0, 0x44505c, 0.68);
    hemi.layers.enable(E.SKIP_REFLECT);
    scene.add(hemi);
    E.hemi = hemi;

    scene.fog = new THREE.Fog(0xd8c9a8, 900, 4200);

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
    E.sun.position.set(x - 0.72 * 1400, 0.38 * 1400, z - 0.16 * 1400);
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
        if (fpsEMA < 47 && pixelScale > 0.55) { pixelScale = Math.max(0.55, pixelScale - 0.15); onResize(); }
        else if (fpsEMA > 57 && pixelScale < 1) { pixelScale = Math.min(1, pixelScale + 0.1); onResize(); }
        if (RR.Reflect) { if (fpsEMA < 40 && RR.Reflect.enabled) RR.Reflect.enabled = false; else if (fpsEMA > 54 && !RR.Reflect.enabled) RR.Reflect.enabled = true; }
        if (RR.Post) { if (fpsEMA < 32 && RR.Post.enabled) RR.Post.enabled = false; else if (fpsEMA > 50 && !RR.Post.enabled) RR.Post.enabled = true; }
        if (fpsEMA < 26 && renderer.shadowMap.enabled) { renderer.shadowMap.enabled = false; E.sun.castShadow = false; }
        else if (fpsEMA > 52 && !renderer.shadowMap.enabled) { renderer.shadowMap.enabled = true; E.sun.castShadow = true; }
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

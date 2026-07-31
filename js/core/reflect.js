/* River Racer — planar reflections: a mirror camera renders the world across the
   water plane (y=0) into a texture the water shader samples. Real skyline mirroring. */
(function () {
  // strength is per-preset (theme.js writes P.water.refl); scale and far are per performance tier.
  // `painted` is false until the target has real pixels in it — engine.js reads it so a mirror
  // that is only re-rendered every other frame still renders the frame it is switched on, rather
  // than blending one frame of an empty black target onto the river.
  const R = { strength: 0.62, scale: 0.42, far: 2600, allowed: true, painted: false };
  let rt, vcam, ready = false;

  // `enabled` is the adaptive ladder's switch; `allowed` is the performance tier's veto. They are
  // separate because they answer to different owners: the ladder flips `enabled` on a slow second,
  // and RRTest.pinQuality() forces it true for screenshots — neither of which may put a second
  // full-scene pass back onto a phone. Setting `enabled` is always honoured, it just cannot win.
  let want = true;
  Object.defineProperty(R, 'enabled', {
    get() { return want && R.allowed; },
    set(v) { want = !!v; },
    enumerable: true, configurable: true,
  });
  R.setAllowed = function (on) {
    R.allowed = !!on;
    // the water shader falls back to its sky-fresnel term the moment this hits zero
    if (!R.allowed && RR.Water && RR.Water.material) RR.Water.material.uniforms.uReflectStrength.value = 0;
    else if (R.allowed && R.resize) R.resize();      // R.scale may have changed with the tier
  };

  const reflectorPos = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const rot = new THREE.Matrix4();
  const normal = new THREE.Vector3();
  const view = new THREE.Vector3();
  const look = new THREE.Vector3();
  const target = new THREE.Vector3();
  const textureMatrix = new THREE.Matrix4();

  // 0.42-res is plenty — the tap is distorted by the wave normal before it is sampled, so the
  // 29% pixel saving is invisible and it is the largest single win in the frame budget.
  // R.scale is per-tier: a phone that has been handed the mirror back by hand gets a cheaper one.
  //
  // The floor is on the TEXEL COUNT, not on each axis. It used to be max(256, ...) per side, and
  // on a 844x390 phone that turned a 253x117 request into a 256x256 SQUARE: the target is sampled
  // by screen-space UV, so a square target on a 2.16:1 view spends 56% of its texels on vertical
  // resolution the screen cannot use while the horizontal axis — the one you actually read a
  // skyline reflection along — sits at 256 for 1266 backbuffer pixels. Same budget reshaped to the
  // view's aspect is 375x173: 46% more horizontal resolution for the identical fill and not one
  // extra draw call. A desktop never reaches the floor (537x302 at 1280x720), so this is
  // bit-for-bit the same target there.
  const MIN_TEXELS = 65000;
  function size() {
    let w = window.innerWidth * R.scale, h = window.innerHeight * R.scale;
    const k = Math.sqrt(MIN_TEXELS / Math.max(1, w * h));
    if (k > 1) { w *= k; h *= k; }
    return [Math.max(32, w | 0), Math.max(32, h | 0)];
  }

  R.init = function () {
    const [w, h] = size();
    rt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    rt.texture.encoding = THREE.sRGBEncoding;    // capture screen-space colours to match the water output
    vcam = new THREE.PerspectiveCamera();
    R.texture = rt.texture;
    R.textureMatrix = textureMatrix;
    ready = true;
    window.addEventListener('resize', R.resize);
  };

  R.resize = function () { if (ready) { const [w2, h2] = size(); rt.setSize(w2, h2); R.painted = false; } };

  R.update = function (renderer, scene, camera) {
    if (!ready || !R.enabled) return;
    const W = RR.Water;
    if (!W || !W.material) return;

    reflectorPos.set(0, 0, 0);
    camPos.setFromMatrixPosition(camera.matrixWorld);
    rot.extractRotation(camera.matrixWorld);
    normal.set(0, 1, 0);

    view.subVectors(reflectorPos, camPos);
    if (view.dot(normal) > 0) return;                 // camera underwater — skip
    view.reflect(normal).negate().add(reflectorPos);

    look.set(0, 0, -1).applyMatrix4(rot).add(camPos);
    target.subVectors(reflectorPos, look);
    target.reflect(normal).negate().add(reflectorPos);

    vcam.position.copy(view);
    vcam.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
    vcam.lookAt(target);
    // build our own projection rather than copying the main camera's: the far plane has to really
    // move to 2600 for the cull frustum to shrink, and that cull is where the saving is.
    vcam.fov = camera.fov;
    vcam.aspect = camera.aspect;
    vcam.near = camera.near;
    vcam.far = R.far;                                 // nothing past 2.6 km survives the ripple + blend
    vcam.updateMatrixWorld();
    vcam.updateProjectionMatrix();

    textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    textureMatrix.multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse);

    // hide the water itself (and its heavy spray) while capturing the mirror
    const wv = W.group ? W.group.visible : true;
    if (W.group) W.group.visible = false;
    const shadowWas = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;            // reuse last frame's shadow map
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, vcam);
    renderer.setRenderTarget(prev);
    renderer.shadowMap.autoUpdate = shadowWas;
    if (W.group) W.group.visible = wv;
    R.painted = true;

    const u = W.material.uniforms;
    u.uReflect.value = rt.texture;
    u.uReflectMatrix.value.copy(textureMatrix);
    u.uReflectStrength.value = R.strength;
  };

  RR.Reflect = R;
})();

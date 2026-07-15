/* River Racer — planar reflections: a mirror camera renders the world across the
   water plane (y=0) into a texture the water shader samples. Real skyline mirroring. */
(function () {
  const R = { enabled: true };
  let rt, vcam, ready = false;

  const reflectorPos = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const rot = new THREE.Matrix4();
  const normal = new THREE.Vector3();
  const view = new THREE.Vector3();
  const look = new THREE.Vector3();
  const target = new THREE.Vector3();
  const textureMatrix = new THREE.Matrix4();

  // half-res is plenty — the reflection is rippled and blended, so the cost saving is invisible
  function size() { return [Math.max(256, (window.innerWidth * 0.5) | 0), Math.max(256, (window.innerHeight * 0.5) | 0)]; }

  R.init = function () {
    const [w, h] = size();
    rt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    rt.texture.encoding = THREE.sRGBEncoding;    // capture screen-space colours to match the water output
    vcam = new THREE.PerspectiveCamera();
    R.texture = rt.texture;
    R.textureMatrix = textureMatrix;
    ready = true;
    window.addEventListener('resize', () => { const [w2, h2] = size(); rt.setSize(w2, h2); });
  };

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
    vcam.far = camera.far;
    vcam.aspect = camera.aspect;
    vcam.updateMatrixWorld();
    vcam.projectionMatrix.copy(camera.projectionMatrix);

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

    const u = W.material.uniforms;
    u.uReflect.value = rt.texture;
    u.uReflectMatrix.value.copy(textureMatrix);
    u.uReflectStrength.value = 0.62;
  };

  RR.Reflect = R;
})();

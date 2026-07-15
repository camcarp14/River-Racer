/* River Racer — bloom. Capture the scene exactly as it hits the screen, extract the
   bright bits, gaussian-blur them, and add them back for a golden-hour glow.
   Works in display (sRGB) space so the existing colour grade is preserved. */
(function () {
  const P = { enabled: true };
  let sceneRT, brightRT, blurA, blurB, quad, cam, brightMat, blurMat, compMat, ready = false;

  const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  const BRIGHT = `
    uniform sampler2D tDiffuse; uniform float threshold; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float k = max(0.0, l - threshold) / max(l, 1e-4);
      gl_FragColor = vec4(c * k * smoothstep(0.0, 0.25, l - threshold + 0.15), 1.0);
    }`;
  const BLUR = `
    uniform sampler2D tDiffuse; uniform vec2 dir; uniform vec2 res; varying vec2 vUv;
    void main(){
      vec2 px = dir / res;
      vec3 s = texture2D(tDiffuse, vUv).rgb * 0.2270;
      s += texture2D(tDiffuse, vUv + px * 1.3846).rgb * 0.3162;
      s += texture2D(tDiffuse, vUv - px * 1.3846).rgb * 0.3162;
      s += texture2D(tDiffuse, vUv + px * 3.2308).rgb * 0.0702;
      s += texture2D(tDiffuse, vUv - px * 3.2308).rgb * 0.0702;
      gl_FragColor = vec4(s, 1.0);
    }`;
  const COMP = `
    uniform sampler2D tScene; uniform sampler2D tBloom; uniform float strength; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tScene, vUv).rgb;
      vec3 b = texture2D(tBloom, vUv).rgb;
      gl_FragColor = vec4(c + b * strength, 1.0);
    }`;

  function rt(w, h, srgb) {
    const t = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
    if (srgb) t.texture.encoding = THREE.sRGBEncoding;   // capture the screen-space image
    return t;
  }

  P.init = function () {
    const w = window.innerWidth, h = window.innerHeight, hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    sceneRT = rt(w, h, true);
    brightRT = rt(hw, hh, false); blurA = rt(hw, hh, false); blurB = rt(hw, hh, false);
    cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    brightMat = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, threshold: { value: 0.75 } }, vertexShader: VS, fragmentShader: BRIGHT, depthTest: false, depthWrite: false });
    blurMat = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() }, res: { value: new THREE.Vector2(hw, hh) } }, vertexShader: VS, fragmentShader: BLUR, depthTest: false, depthWrite: false });
    compMat = new THREE.ShaderMaterial({ uniforms: { tScene: { value: null }, tBloom: { value: null }, strength: { value: 0.85 } }, vertexShader: VS, fragmentShader: COMP, depthTest: false, depthWrite: false });
    window.addEventListener('resize', P.resize);
    ready = true;
  };

  P.resize = function () {
    if (!ready) return;
    const w = window.innerWidth, h = window.innerHeight, hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    sceneRT.setSize(w, h); brightRT.setSize(hw, hh); blurA.setSize(hw, hh); blurB.setSize(hw, hh);
    blurMat.uniforms.res.value.set(hw, hh);
  };

  function pass(renderer, mat, target) {
    quad.material = mat;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(quad, cam);
  }

  P.render = function (renderer, scene, camera) {
    if (!ready) { renderer.render(scene, camera); return; }
    renderer.setRenderTarget(sceneRT);
    renderer.clear();
    renderer.render(scene, camera);

    brightMat.uniforms.tDiffuse.value = sceneRT.texture; pass(renderer, brightMat, brightRT);
    blurMat.uniforms.tDiffuse.value = brightRT.texture; blurMat.uniforms.dir.value.set(1, 0); pass(renderer, blurMat, blurA);
    blurMat.uniforms.tDiffuse.value = blurA.texture; blurMat.uniforms.dir.value.set(0, 1); pass(renderer, blurMat, blurB);
    blurMat.uniforms.tDiffuse.value = blurB.texture; blurMat.uniforms.dir.value.set(1, 0); pass(renderer, blurMat, blurA);
    blurMat.uniforms.tDiffuse.value = blurA.texture; blurMat.uniforms.dir.value.set(0, 1); pass(renderer, blurMat, blurB);

    compMat.uniforms.tScene.value = sceneRT.texture;
    compMat.uniforms.tBloom.value = blurB.texture;
    quad.material = compMat;
    renderer.setRenderTarget(null);
    renderer.render(quad, cam);
  };

  RR.Post = P;
})();

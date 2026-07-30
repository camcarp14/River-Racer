/* River Racer — bloom. Capture the scene exactly as it hits the screen, extract the
   bright bits, gaussian-blur them, and add them back for a golden-hour glow.
   Works in display (sRGB) space so the existing colour grade is preserved. */
(function () {
  const P = { enabled: true, streaks: 1, lowRes: false };
  let sceneRT, brightRT, blurA, blurB, quad, cam, brightMat, blurMat, compMat, ready = false;

  // Bloom's cost is the gaussian, and the gaussian's cost is resolution x passes. Desktop runs it
  // at half res over four passes; the phone tier runs quarter res over two — an EIGHTH of the fill
  // for a glow that is only very slightly wider, because dropping the resolution doubles the
  // kernel's reach in screen space and very nearly pays the missing passes back. The bright pass
  // and the composite are unchanged, so the grade is bit-for-bit the same picture underneath.
  let div = 2, passes = 4;
  P.setTier = function (q) {
    if (!q) return;
    const d = q.bloomDiv || 2, p = q.blurPasses || 4;
    if (d === div && p === passes) return;
    div = d; passes = p;
    P.lowRes = div > 2;
    P.resize();
  };

  // The grade has two authors. theme.js owns the BASE (day/sunset/dusk/night), the salute chain
  // owns a modulation on top of it, and neither may clobber the other — so the base is kept here
  // and every uniform is recomposed from it. `tier` is the chain expressed as 0 (cold) .. 1 (x5,
  // THE WAVE) .. 2 (x10, THE RUN); `speed` is 0..1 and drives the radial streaks.
  const base = {
    lift: [0.020, 0.026, 0.036], gamma: [0.98, 1.00, 1.02], gain: [1.03, 1.01, 0.99],
    sat: 1.06, vig: 0.30, threshold: 0.80, strength: 0.55,
  };
  let tier = 0, tierTarget = 0, speed = 0, speedTarget = 0;

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
  // The composite already runs in display (sRGB) space, so it is the right place to grade —
  // zero extra passes. uLift is the fix for crushed blacks: it maps 0.0 onto a *tinted* floor
  // instead of onto nothing, which is why no facade in the canyon reads as pure black any more.
  const COMP = `
    uniform sampler2D tScene; uniform sampler2D tBloom; uniform float strength;
    uniform vec3 uLift, uGamma, uGain;
    uniform float uSat, uVig, uStreak;
    varying vec2 vUv;
    void main(){
      float r = clamp(length(vUv - 0.5) * 1.42, 0.0, 1.0);
      vec3 bl = texture2D(tBloom, vUv).rgb * strength;
      vec3 c = texture2D(tScene, vUv).rgb + bl;
      // Speed. Six taps marching back toward the vanishing point — an object moving outward has
      // its past positions nearer the centre, so that is the direction a motion blur samples.
      // The middle third stays sharp: only the periphery tears, which is what the eye actually
      // reads as 85 MPH. FOV alone reads as a lens change, not as velocity.
      float sw = smoothstep(0.30, 1.0, r) * uStreak;
      if (sw > 0.004) {
        vec2 st = (vec2(0.5) - vUv) * (0.038 * sw);
        vec2 uv = vUv;
        vec3 acc = vec3(0.0);
        for (int i = 0; i < 6; i++) { uv += st; acc += texture2D(tScene, uv).rgb; }
        acc *= 1.0 / 6.0;
        c = mix(c, acc + bl, sw * 0.80) + acc * (sw * 0.05);
      }
      c = clamp(c, 0.0, 1.0);
      c = pow(c, uGamma);                       // per-channel gamma splits shadow/highlight hue
      c = c * uGain + uLift * (1.0 - c);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c *= 1.0 - uVig * pow(r, 2.4);
      gl_FragColor = vec4(c, 1.0);
    }`;

  function rt(w, h, srgb) {
    const t = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
    if (srgb) t.texture.encoding = THREE.sRGBEncoding;   // capture the screen-space image
    return t;
  }

  P.init = function () {
    const w = window.innerWidth, h = window.innerHeight;
    const hw = Math.max(1, (w / div) | 0), hh = Math.max(1, (h / div) | 0);
    sceneRT = rt(w, h, true);
    brightRT = rt(hw, hh, false); blurA = rt(hw, hh, false); blurB = rt(hw, hh, false);
    cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    brightMat = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, threshold: { value: 0.80 } }, vertexShader: VS, fragmentShader: BRIGHT, depthTest: false, depthWrite: false });
    blurMat = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() }, res: { value: new THREE.Vector2(hw, hh) } }, vertexShader: VS, fragmentShader: BLUR, depthTest: false, depthWrite: false });
    compMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null }, tBloom: { value: null }, strength: { value: 0.55 },
        uLift: { value: new THREE.Vector3(0.020, 0.026, 0.036) },
        uGamma: { value: new THREE.Vector3(0.98, 1.00, 1.02) },
        uGain: { value: new THREE.Vector3(1.03, 1.01, 0.99) },
        uSat: { value: 1.06 },
        uVig: { value: 0.30 },
        uStreak: { value: 0 },
      },
      vertexShader: VS, fragmentShader: COMP, depthTest: false, depthWrite: false,
    });
    window.addEventListener('resize', P.resize);
    ready = true;
    applyGrade();
  };

  // A chain does not put a colour filter on Chicago — it tightens the picture. Contrast climbs,
  // the lifted floor is pulled back down, saturation pinches and the vignette closes in, so at x5
  // the city reads harder and narrower without ever reading as a different city. The x5 numbers
  // (sat 1.06 -> 0.88, vignette 0.30 -> 0.44) are VISION's, exactly.
  function applyGrade() {
    if (!ready) return;
    const t1 = tier < 1 ? tier : 1, t2 = tier > 1 ? tier - 1 : 0;
    const k = t1 + t2 * 0.6;
    const u = compMat.uniforms;
    u.uLift.value.set(base.lift[0] * (1 - 0.35 * k), base.lift[1] * (1 - 0.35 * k), base.lift[2] * (1 - 0.22 * k));
    u.uGamma.value.set(base.gamma[0] * (1 + 0.045 * k), base.gamma[1] * (1 + 0.038 * k), base.gamma[2] * (1 + 0.028 * k));
    u.uGain.value.set(base.gain[0] * (1 + 0.045 * k), base.gain[1] * (1 + 0.014 * k), base.gain[2] * (1 - 0.020 * k));
    u.uSat.value = base.sat * (1 - 0.170 * t1) * (1 - 0.060 * t2);
    u.uVig.value = base.vig + 0.14 * t1 + 0.06 * t2;
    brightMat.uniforms.threshold.value = base.threshold * (1 - 0.10 * k);
    u.strength.value = base.strength * (1 + 0.30 * k);
  }

  // theme.js drives these per preset. Safe before init(): the base is remembered and applied
  // the moment the uniforms exist, so load order can't throw and can't lose a preset.
  P.setGrade = function (g) {
    if (!g) return;
    if (g.lift) base.lift = [g.lift[0], g.lift[1], g.lift[2]];
    if (g.gamma) base.gamma = [g.gamma[0], g.gamma[1], g.gamma[2]];
    if (g.gain) base.gain = [g.gain[0], g.gain[1], g.gain[2]];
    if (g.sat != null) base.sat = g.sat;
    if (g.vignette != null) base.vig = g.vignette;
    applyGrade();
  };
  P.setBloom = function (b) {
    if (!b) return;
    if (b.threshold != null) base.threshold = b.threshold;
    if (b.strength != null) base.strength = b.strength;
    applyGrade();
  };

  // ---- the two seams W1/W2 drive. Both are pure setters: cheap, clamped, never throw. ----

  // n is the RAW salute chain (0, 1, 2, ...). x5 is THE WAVE, x10 is THE RUN and the ceiling.
  P.setChainTier = function (n) {
    const c = (+n > 0) ? +n : 0;
    tierTarget = c >= 10 ? 2 : (c >= 5 ? 1 + (c - 5) * 0.2 : c * 0.2);
  };
  // n is normalised speed 0..1. A caller handing us m/s instead reveals itself the first time it
  // goes above walking pace, and the unit is then LATCHED — otherwise an idling hull at 0.9 m/s
  // would be read as a normalised 0.9 and streak the frame while sitting still.
  let mps = false;
  P.setSpeed = function (n) {
    let v = +n;
    if (!(v > 0)) v = 0;
    if (v > 1.5) mps = true;
    if (mps) v /= 58;                     // quickest hull in the game tops out at 61 m/s
    speedTarget = v > 1 ? 1 : v;
  };
  P.chainTier = function () { return tier; };

  P.resize = function () {
    if (!ready) return;
    const w = window.innerWidth, h = window.innerHeight;
    const hw = Math.max(1, (w / div) | 0), hh = Math.max(1, (h / div) | 0);
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

    // Both of these are damped, never snapped. 6/s is a 400 ms settle, which is the number
    // VISION gives for a chain break: the grade lets go over the same beat the music does.
    const dt = Math.min(0.1, (RR.Engine && RR.Engine.rawDt) || 0.0167);
    speed += (speedTarget - speed) * (1 - Math.exp(-9 * dt));
    if (tier !== tierTarget) {
      tier += (tierTarget - tier) * (1 - Math.exp(-6 * dt));
      if (Math.abs(tierTarget - tier) < 0.0008) tier = tierTarget;
      applyGrade();
    }
    // P.streaks is the autoQuality rung (engine.js drops it first, before pixel scale)
    compMat.uniforms.uStreak.value = P.streaks > 0 ? speed * P.streaks : 0;

    renderer.setRenderTarget(sceneRT);
    renderer.clear();
    renderer.render(scene, camera);

    brightMat.uniforms.tDiffuse.value = sceneRT.texture; pass(renderer, brightMat, brightRT);
    // ping-pong H,V,H,V… — `passes` is 4 on desktop (identical to what it always was) and 2 on a phone
    let src = brightRT;
    for (let i = 0; i < passes; i++) {
      const dst = (i & 1) ? blurB : blurA;
      blurMat.uniforms.tDiffuse.value = src.texture;
      blurMat.uniforms.dir.value.set((i & 1) ? 0 : 1, (i & 1) ? 1 : 0);
      pass(renderer, blurMat, dst);
      src = dst;
    }

    compMat.uniforms.tScene.value = sceneRT.texture;
    compMat.uniforms.tBloom.value = src.texture;
    quad.material = compMat;
    renderer.setRenderTarget(null);
    renderer.render(quad, cam);
  };

  RR.Post = P;
})();

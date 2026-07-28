/* River Racer — wakes, spray, splashes, boost flames, gulls */
(function () {
  const FX = {};
  const U = () => RR.U;

  // ---------- wake ribbons: per-boat foam trail ----------
  // Foam does not FADE, it BREAKS UP: the sheet behind a transom tears into patches, the middle
  // opens first because that is where the two divergent crests are pulling apart from, and the
  // last thing left is scattered cells of white. The old ribbon was a flat 0.42 alpha modulated by
  // a product of two sines — which is a checkerboard, and read as chalky grey triangles laid on a
  // plate for the entire race. Same geometry, same draw call; the erosion is all in the shader.
  const WAKE_SEGS = 56;
  const WAKE_LIFE = 2.4;
  function createWake(scene) {
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array(WAKE_SEGS * 2 * 3);
    const alpha = new Float32Array(WAKE_SEGS * 2);
    const wake = new Float32Array(WAKE_SEGS * 2 * 3);   // [side -1/+1, age 0..1, seed]
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aWake', new THREE.BufferAttribute(wake, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < WAKE_SEGS - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      idx.push(a, b, c, b, d, c);
    }
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        attribute float aAlpha;
        attribute vec3 aWake;
        varying float vA;
        varying vec2 vP;
        varying vec3 vW;
        void main() {
          vA = aAlpha; vP = position.xz; vW = aWake;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform float uTime;
        varying float vA;
        varying vec2 vP;
        varying vec3 vW;
        float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
        float vn(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x),
                     mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        void main() {
          float u = abs(vW.x);
          float age = vW.y;
          // the churn is solid across the strip at the transom; by mid-life only the two crests
          // are still carrying foam and the middle has opened up
          float band = mix(1.0, smoothstep(0.02, 0.90, u), smoothstep(0.02, 0.34, age));
          band *= 1.0 - smoothstep(0.74, 1.0, u);                    // always feather the outer edge
          float n = vn(vP * 1.05 + vec2(uTime * 0.17, -uTime * 0.11)) * 0.52
                  + vn(vP * 3.40 - vec2(uTime * 0.31, uTime * 0.23)) * 0.32
                  + vn(vP * 8.10 + vec2(uTime * 0.44, uTime * 0.37)) * 0.16;
          n += vW.z * 0.10;                                          // per-segment grain, so the strip is not one field
          float er = smoothstep(age * 1.25 - 0.14, age * 1.25 + 0.30, n + band * 0.26);
          float a = vA * band * er;
          if (a < 0.006) discard;
          gl_FragColor = vec4(0.93, 0.97, 0.99, a);
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    mesh.layers.set(1);              // skip in the reflection pass
    scene.add(mesh);
    return { mesh, geo, pts: [], mat };
  }

  const wakeDefault = { x: 0, z: 0, px: 1, pz: 0, born: 0, str: 0, sd: 0, j0: 1, j1: 1 };
  function updateWake(w, boat, dt, t) {
    const speed = Math.hypot(boat.vel.x, boat.vel.z);
    // drop a segment roughly every 2.2m of travel
    const last = w.pts[w.pts.length - 1];
    const need = !last || U().dist2(boat.pos.x, boat.pos.z, last.x, last.z) > 4.8;
    if (need && !boat.airborne) {
      const s = Math.sin(boat.heading), c = Math.cos(boat.heading);
      w.pts.push({
        x: boat.pos.x - s * boat.radius * 0.8, z: boat.pos.z - c * boat.radius * 0.8,
        px: c, pz: -s, born: t, str: U().clamp(speed / 22, 0.12, 1),
        sd: Math.random(),
        // the trailing edge of a real wake is ragged, not two parallel lines
        j0: 0.80 + Math.random() * 0.42, j1: 0.80 + Math.random() * 0.42,
      });
      if (w.pts.length > WAKE_SEGS) w.pts.shift();
    }
    const verts = w.geo.attributes.position.array;
    const alpha = w.geo.attributes.aAlpha.array;
    const wk = w.geo.attributes.aWake.array;
    const n = w.pts.length;
    wakeDefault.x = boat.pos.x; wakeDefault.z = boat.pos.z; wakeDefault.born = t;
    for (let i = 0; i < WAKE_SEGS; i++) {
      const p = w.pts[Math.min(i, n - 1)] || wakeDefault;
      const age = U().clamp((t - p.born) / WAKE_LIFE, 0, 1);
      const width = (0.7 + age * WAKE_LIFE * 1.35) * (0.65 + p.str * 0.7);
      // the erosion carries the tail, so this only has to take the peak off — a linear fade to
      // nothing is exactly what made the old ribbon read as a uniform grey plate
      const fade = i >= n ? 0 : p.str * 0.55 * (1 - age * age * 0.75);
      const y = U().waterHeight(p.x, p.z, t, RR.River.waveAmp(p.x, p.z)) + 0.06;
      const o = i * 6;
      const wA = width * p.j0, wB = width * p.j1;
      verts[o] = p.x + p.px * wA; verts[o + 1] = y; verts[o + 2] = p.z + p.pz * wA;
      verts[o + 3] = p.x - p.px * wB; verts[o + 4] = y; verts[o + 5] = p.z - p.pz * wB;
      alpha[i * 2] = alpha[i * 2 + 1] = fade;
      wk[o] = -1; wk[o + 1] = age; wk[o + 2] = p.sd;
      wk[o + 3] = 1; wk[o + 4] = age; wk[o + 5] = p.sd;
    }
    w.geo.attributes.position.needsUpdate = true;
    w.geo.attributes.aAlpha.needsUpdate = true;
    w.geo.attributes.aWake.needsUpdate = true;
    w.mat.uniforms.uTime.value = t;
  }

  // ---------- spray particles: one shared points cloud ----------
  // A spray sheet is thousands of centimetre-scale droplets, not a handful of soft discs. Every
  // point here is sized in real metres, stays translucent (thrown water never reads as opaque
  // white — it would also cross the bloom threshold and turn into a lens flare), shrinks and fades
  // to nothing over its life, and smears along its own screen-space travel when it moves fast,
  // which is how a camera actually records a droplet. Anything about to hit the lens fades out
  // rather than splatting a white disc across the frame.
  const MAXP = 900;
  const P_GRAV = 13;
  let pGeo, pPts, pMat, pool, poolIdx = 0;
  function initParticles(scene) {
    pGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(MAXP * 3);
    const drop = new Float32Array(MAXP * 4);       // [diameter in metres, alpha, edge hardness, seed]
    const vel = new Float32Array(MAXP * 3);        // world velocity, for the motion smear
    for (let i = 0; i < MAXP; i++) pos[i * 3 + 1] = -50;
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    pGeo.setAttribute('aDrop', new THREE.BufferAttribute(drop, 4).setUsage(THREE.DynamicDrawUsage));
    pGeo.setAttribute('aVel', new THREE.BufferAttribute(vel, 3).setUsage(THREE.DynamicDrawUsage));
    pool = [];
    // g = gravity multiplier: 1 for a heavy drop, ~0.3 for mist that hangs, 0 for speed streaks
    for (let i = 0; i < MAXP; i++) {
      pool.push({ x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, life: 0, age: 99,
        s0: 0.1, a0: 0.2, core: 0.3, seed: 0, g: 1, drag: 1, fp: 1.3, sMin: 0.4 });
    }
    pMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        uH: { value: 720 }, uAspect: { value: 16 / 9 },
        uCol: { value: new THREE.Vector3(0.93, 0.96, 0.98) },   // cool white; the river is green
        uCamVel: { value: new THREE.Vector3() },
      },
      vertexShader: `
        uniform float uH;
        uniform float uAspect;
        uniform vec3 uCamVel;
        attribute vec4 aDrop;
        attribute vec3 aVel;
        varying float vA;
        varying float vCore;
        varying float vRot;
        varying float vStretch;
        varying float vSeed;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float depth = max(0.05, -mv.z);
          float px = aDrop.x * projectionMatrix[1][1] * 0.5 * uH / depth;
          // smear along motion RELATIVE TO THE LENS: a droplet keeping pace with a chase camera
          // is still on screen and must stay round, however fast the world says it is going
          vec4 cp2 = projectionMatrix * (mv + modelViewMatrix * vec4((aVel - uCamVel) * 0.02, 0.0));
          vec2 s1 = gl_Position.xy / max(1e-4, gl_Position.w);
          vec2 s2 = cp2.xy / max(1e-4, cp2.w);
          vec2 d = (s2 - s1) * vec2(uAspect, 1.0) * uH * 0.5;
          float dl = length(d);
          // torn water is never round: every droplet carries its own ellipticity, and fast ones
          // stretch further along their travel
          vStretch = max(clamp(dl / max(px, 1.5), 1.0, 2.5), 1.0 + 0.45 * fract(aDrop.w * 0.618));
          vRot = dl > 0.75 ? atan(d.y, d.x) : aDrop.w;
          vCore = aDrop.z;
          vSeed = aDrop.w;
          // a droplet that would cover a fat patch of screen is a lens blob, not spray, whatever
          // the camera distance — so fade on projected SIZE, not just on depth, and cap the sprite
          vA = aDrop.y * smoothstep(0.55, 2.0, depth) * mix(1.0, 0.12, smoothstep(24.0, 70.0, px));
          gl_PointSize = clamp(px * vStretch, 1.0, 44.0);
        }`,
      fragmentShader: `
        uniform vec3 uCol;
        varying float vA;
        varying float vCore;
        varying float vRot;
        varying float vStretch;
        varying float vSeed;
        void main() {
          // A NEGATIVE seed marks grit struck off a bascule's lattice rather than thrown water.
          // Costs no attribute and no second draw call, and it inherits the smear-along-travel
          // that makes a spark a streak instead of a dot. Over 1.0 so it crosses the bloom
          // threshold the way something genuinely incandescent should.
          vec3 col = vSeed < 0.0 ? vec3(1.70, 0.66, 0.20) : uCol;
          vec2 d = gl_PointCoord - 0.5;
          float ca = cos(vRot), sa = sin(vRot);
          vec2 q = vec2(d.x * ca + d.y * sa, d.y * ca - d.x * sa);
          q.y *= vStretch;                       // long axis along travel, thin across it
          float r = length(q) * 2.0;
          // ragged rim. Torn water has one; a lens blob does not, and that tell is the whole
          // difference between "spray" and "someone smudged the camera".
          float ang = atan(q.y, q.x + 1e-5);
          r *= 1.0 + 0.14 * sin(ang * 3.0 + vSeed) + 0.07 * sin(ang * 5.0 - vSeed * 2.3);
          float a = vA * (1.0 - smoothstep(vCore, 1.0, r));
          if (a < 0.004) discard;
          gl_FragColor = vec4(col, a);
        }`,
    });
    pPts = new THREE.Points(pGeo, pMat);
    pPts.frustumCulled = false;
    pPts.renderOrder = 3;
    pPts.layers.set(1);
    // gl_PointSize is device pixels, so the shader needs the height of the buffer it is drawing
    // into — bloom renders the scene to an off-screen target, not straight to the canvas.
    pPts.onBeforeRender = function (r) {
      const t = r.getRenderTarget();
      const w = t ? t.width : r.domElement.width, h = t ? t.height : r.domElement.height;
      pMat.uniforms.uH.value = h;
      pMat.uniforms.uAspect.value = w / Math.max(1, h);
    };
    scene.add(pPts);
  }

  // FROZEN signature — other modules call it. size is a multiplier, not a diameter.
  // The mist/drop mix is deliberate: fine mist alone reads as fog, drops alone read as buckshot.
  FX.spray = function (x, y, z, vx, vy, vz, count, spread, size) {
    // sized for the chase camera, which rides ~20 m astern: a droplet has to be ~0.2-0.6 m across
    // to project to the handful of pixels that reads as a droplet from back there. Sub-linear in
    // size so the big callers (geysers pass 3.4) get chunkier water without getting blobs.
    const base = 0.15 + 0.17 * Math.pow(size || 1, 0.75);
    for (let i = 0; i < count; i++) {
      const p = pool[poolIdx]; poolIdx = (poolIdx + 1) % MAXP;
      const heavy = Math.random() < 0.28;
      const jit = base * 1.6;
      p.x = x + (Math.random() - 0.5) * jit;
      p.y = y + (Math.random() - 0.5) * jit * 0.6;
      p.z = z + (Math.random() - 0.5) * jit;
      const sp = spread * (heavy ? 0.75 : 1.35);
      p.vx = vx + (Math.random() - 0.5) * sp;
      p.vy = vy * (heavy ? 1 : 0.8) + Math.random() * sp * 0.7;
      p.vz = vz + (Math.random() - 0.5) * sp;
      p.age = 0;
      p.seed = Math.random() * 6.283;
      // Lives are short on purpose: the boat outruns its own spray at 30 m/s, so anything that
      // survives half a second is no longer spray — it is a blob loitering in front of the lens.
      if (heavy) {
        p.s0 = base * (1.2 + Math.random() * 1.0);
        p.a0 = 0.36 + Math.random() * 0.16;      // peak alpha stays well under opaque
        p.core = 0.45 + Math.random() * 0.25;
        p.life = 0.35 + Math.random() * 0.45;
        p.g = 1; p.drag = 0.55; p.fp = 1.3; p.sMin = 0.55;
      } else {
        p.s0 = base * (0.5 + Math.random() * 0.8);
        p.a0 = 0.20 + Math.random() * 0.14;
        p.core = 0.02 + Math.random() * 0.18;
        p.life = 0.22 + Math.random() * 0.26;
        p.g = 0.3; p.drag = 2.6; p.fp = 2.0; p.sMin = 0.3;
      }
    }
  };

  // ---------- sparks: grit and hot steel off a bascule's lattice, same Points cloud ----------
  // Rides the spray pool rather than the confetti one because that pool fades ALPHA. Confetti
  // fades by darkening the colour at full opacity, which is fine for paper and turns an ember
  // into a brown square on its way out.
  FX.sparks = function (x, y, z, vx, vz, n) {
    if (!pool) return;
    for (let i = 0; i < n; i++) {
      const p = pool[poolIdx]; poolIdx = (poolIdx + 1) % MAXP;
      const a = Math.random() * 6.283, sp = 4 + Math.random() * 13;
      p.x = x + (Math.random() - 0.5) * 1.4;
      p.y = y + (Math.random() - 0.5) * 0.7;
      p.z = z + (Math.random() - 0.5) * 1.4;
      p.vx = vx + Math.cos(a) * sp;
      p.vy = 1.0 + Math.random() * 7.5;
      p.vz = vz + Math.sin(a) * sp;
      p.age = 0;
      p.life = 0.28 + Math.random() * 0.36;
      p.s0 = 0.10 + Math.random() * 0.13;
      p.a0 = 0.55 + Math.random() * 0.35;
      p.core = 0.55;
      p.seed = -(0.05 + Math.random() * 6.2);        // negative = hot; see the fragment shader
      p.g = 1.15; p.drag = 0.8; p.fp = 1.6; p.sMin = 0.45;
    }
  };

  // ---------- speed lines: weightless streaks tearing past the lens, same Points cloud ----------
  // Zero new draw calls — the whole point. Only the player gets them, and only near the ceiling.
  let streakAcc = 0;
  function speedLines(boat, dt) {
    const top = boat.spec.top || 40;
    const n = U().clamp((Math.hypot(boat.vel.x, boat.vel.z) / top - 0.72) / 0.28, 0, 1)
            + (boat.boostHeat || 0) * 0.5;
    if (n <= 0) { streakAcc = 0; return; }
    streakAcc += n * 26 * dt;
    const s = Math.sin(boat.heading), c = Math.cos(boat.heading);
    while (streakAcc >= 1) {
      streakAcc -= 1;
      const p = pool[poolIdx]; poolIdx = (poolIdx + 1) % MAXP;
      const side = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 9);
      const ahead = 8 + Math.random() * 26;
      p.x = boat.pos.x + s * ahead + c * side;
      p.y = boat.pos.y + 0.6 + Math.random() * 4.2;
      p.z = boat.pos.z + c * ahead - s * side;
      p.vx = -boat.vel.x * 1.25; p.vy = 0; p.vz = -boat.vel.z * 1.25;
      // hairline and faint: the shader smears these along their own travel, so a streak is what
      // the motion makes it, not a sprite big enough to be mistaken for spray.
      p.life = 0.26; p.age = 0;
      p.s0 = 0.16; p.a0 = 0.22; p.core = 0.25; p.seed = Math.random() * 6.283;
      p.g = 0; p.drag = 0; p.fp = 1.1; p.sMin = 0.7;
    }
  }

  const camPrev = new THREE.Vector3();
  function updateParticles(dt) {
    const pos = pGeo.attributes.position.array;
    const drp = pGeo.attributes.aDrop.array;
    const vel = pGeo.attributes.aVel.array;
    const cp = RR.Engine.camera.position, cv = pMat.uniforms.uCamVel.value;
    if (dt > 5e-4) {
      cv.set((cp.x - camPrev.x) / dt, (cp.y - camPrev.y) / dt, (cp.z - camPrev.z) / dt);
      const m = cv.length();
      if (m > 90) cv.multiplyScalar(90 / m);   // a camera snap between races must not smear the world
    }
    camPrev.copy(cp);
    for (let i = 0; i < MAXP; i++) {
      const p = pool[i];
      const o = i * 3, q = i * 4;
      if (p.age >= p.life) { pos[o + 1] = -50; drp[q + 1] = 0; continue; }
      p.age += dt;
      p.vy -= P_GRAV * p.g * dt;
      const k = Math.max(0, 1 - p.drag * dt);      // air drag: mist stalls and hangs, drops carry
      p.vx *= k; p.vy *= k; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const u = Math.min(1, p.age / p.life);
      // dissolve into the surface instead of blinking out. The threshold sits below y=0 because
      // lake swell runs to half a metre and spray in a trough must not vanish in mid-air; the
      // water is opaque and writes depth, so anything genuinely under it is hidden regardless.
      const sink = U().clamp((p.y + 0.35) / 0.3, 0, 1);
      if (p.y < -0.35) p.age = p.life;
      pos[o] = p.x; pos[o + 1] = p.y; pos[o + 2] = p.z;
      vel[o] = p.vx; vel[o + 1] = p.vy; vel[o + 2] = p.vz;
      drp[q] = p.s0 * (p.sMin + (1 - p.sMin) * (1 - u));
      drp[q + 1] = p.a0 * Math.pow(1 - u, p.fp) * Math.min(1, p.age * 20) * sink;
      drp[q + 2] = p.core;
      drp[q + 3] = p.seed;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.aDrop.needsUpdate = true;
    pGeo.attributes.aVel.needsUpdate = true;
  }

  // ---------- confetti: bright multicolor celebration pieces ----------
  const MAXC = 700;
  const CONF_COLORS = [
    [1.0, 0.824, 0.29],    // gold #ffd24a
    [1.0, 0.231, 0.188],   // red #ff3b30
    [0.494, 0.784, 0.89],  // sky #7ec8e3
    [1.0, 1.0, 1.0],       // white
    [0.18, 0.8, 0.443],    // green #2ecc71
  ];
  let cGeo, cPts, cPool, cIdx = 0;
  function initConfetti(scene) {
    cGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(MAXC * 3);
    const col = new Float32Array(MAXC * 3);
    for (let i = 0; i < MAXC; i++) pos[i * 3 + 1] = -50;
    cGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    cGeo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    cPool = [];
    for (let i = 0; i < MAXC; i++) cPool.push({ x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, life: 0, age: 99, r: 1, g: 1, b: 1 });
    const tex = U().canvasTexture(32, 32, (ctx) => {
      ctx.shadowColor = 'rgba(255,255,255,1)';
      ctx.shadowBlur = 5;
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.fillRect(9, 9, 14, 14);              // soft square-ish sprite
    });
    const mat = new THREE.PointsMaterial({
      size: 0.55, map: tex, vertexColors: true, transparent: true,
      depthWrite: false, sizeAttenuation: true,          // normal blending so colors read
    });
    cPts = new THREE.Points(cGeo, mat);
    cPts.frustumCulled = false;
    cPts.renderOrder = 4;
    cPts.layers.set(1);
    scene.add(cPts);
  }

  FX.confetti = function (x, y, z, n) {
    if (!cPool) return;
    for (let i = 0; i < n; i++) {
      const p = cPool[cIdx]; cIdx = (cIdx + 1) % MAXC;
      const c = CONF_COLORS[(Math.random() * CONF_COLORS.length) | 0];
      p.x = x; p.y = y; p.z = z;
      p.vx = (Math.random() - 0.5) * 10;       // lateral ±5
      p.vy = 6 + Math.random() * 6;            // upward 6..12
      p.vz = (Math.random() - 0.5) * 10;
      p.life = 1.6 + Math.random() * 1.0;
      p.age = 0;
      p.r = c[0]; p.g = c[1]; p.b = c[2];
    }
  };

  function updateConfetti(dt, t) {
    const pos = cGeo.attributes.position.array;
    const col = cGeo.attributes.color.array;
    for (let i = 0; i < MAXC; i++) {
      const p = cPool[i];
      if (p.age < p.life) {
        p.age += dt;
        p.vy -= 6 * dt;
        p.x += (p.vx + Math.sin(t * 8 + i) * 1.7) * dt;   // per-piece flutter
        p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < -0.2) p.age = p.life;
        const fade = Math.max(0, 1 - p.age / p.life);
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        col[i * 3] = p.r * fade; col[i * 3 + 1] = p.g * fade; col[i * 3 + 2] = p.b * fade;
      } else {
        pos[i * 3 + 1] = -50;
      }
    }
    cGeo.attributes.position.needsUpdate = true;
    cGeo.attributes.color.needsUpdate = true;
  }

  // ---------- gulls circling over the lake ----------
  let gulls = [];
  function initGulls(scene) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xf5f6f8, side: THREE.DoubleSide });
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Group();
      const wingGeo = new THREE.PlaneGeometry(1.5, 0.4);
      const L = new THREE.Mesh(wingGeo, mat); L.position.x = -0.7; L.layers.set(1); g.add(L);
      const Rw = new THREE.Mesh(wingGeo, mat); Rw.position.x = 0.7; Rw.layers.set(1); g.add(Rw);
      const cx = RR.River.lakeWestX + 400 + Math.random() * 1200;
      const cz = RR.River.lakeShoreZTop + 200 + Math.random() * 800;
      gulls.push({ g, L, R: Rw, cx, cz, r: 30 + Math.random() * 60, h: 14 + Math.random() * 26, ph: Math.random() * 9, sp: 0.25 + Math.random() * 0.3 });
      scene.add(g);
    }
  }
  function updateGulls(t) {
    for (const b of gulls) {
      const a = t * b.sp + b.ph;
      b.g.position.set(b.cx + Math.cos(a) * b.r, b.h + Math.sin(t * 0.7 + b.ph) * 2, b.cz + Math.sin(a) * b.r);
      b.g.rotation.y = -a - Math.PI / 2;
      const flap = Math.sin(t * 7 + b.ph) * 0.6;
      b.L.rotation.y = flap; b.R.rotation.y = -flap;
    }
  }

  // ---------- per-boat continuous spray from hull at speed ----------
  // Every emitter here is rate-limited PER SECOND, not per frame. Per-frame emission scaled with
  // the frame rate, and at 60 fps six boats on boost filled the whole 900-particle pool with a
  // white fog you could not see your own hull through — the single worst readability bug at speed.
  function fire(boat, key, perSec, dt) {
    const acc = boat._fxAcc || (boat._fxAcc = {});
    acc[key] = (acc[key] || 0) + perSec * dt;
    if (acc[key] < 1) return false;
    acc[key] -= 1;
    return true;
  }

  function hullSpray(boat, dt, t) {
    const speed = Math.hypot(boat.vel.x, boat.vel.z);
    if (boat.airborne || speed < 6) return;
    const s = Math.sin(boat.heading), c = Math.cos(boat.heading);
    const intensity = U().clamp(speed / boat.spec.top, 0, 1);
    const near = boat.isPlayer ? 1 : 0.55;        // rivals are far away; they don't need the density
    // hovercraft (podracer): the turbines blast the surface below, so the "water marks"
    // are two plumes kicked UP off the water rather than spray peeling off a hull
    if (boat.spec.hover) {
      const wy = U().waterHeight(boat.pos.x, boat.pos.z, t, RR.River.waveAmp(boat.pos.x, boat.pos.z));
      const wash = intensity + (boat.boostHeat > 0.4 ? 0.5 : 0);
      if (!fire(boat, 'hover', 22 * near, dt)) return;
      for (const side of [-1, 1]) {
        const ex = boat.pos.x + c * side * boat.radius * 0.7 + s * boat.radius * 0.7;
        const ez = boat.pos.z - s * side * boat.radius * 0.7 + c * boat.radius * 0.7;
        FX.spray(ex, wy + 0.05, ez,
          boat.vel.x * 0.14 + c * side * 1.6, 1.5 + wash * 2.8, boat.vel.z * 0.14 - s * side * 1.6,
          2, 1.5 + wash, 0.95);
      }
      return;
    }
    // A planing hull throws its sheet off the forward chine: forward, outward and LOW, hugging the
    // water — not a fountain over the deck. The two shoulders alternate so it reads as one
    // continuous sheet rather than a stutter of puffs on random sides.
    if (fire(boat, 'hull', 46 * (0.3 + 0.7 * intensity) * near, dt)) {
      const side = (boat._fxSide = -(boat._fxSide || 1));
      const fwd = boat.radius * (Math.random() * 1.15 - 0.2);   // spread down the chine, not one point
      // clear of the waterline and outboard of the hull: a sheet that peels below the surface is
      // eaten by the water's depth buffer, and one inside the beam hides behind the boat
      FX.spray(
        boat.pos.x + s * fwd + c * side * boat.radius * 0.85,
        U().waterHeight(boat.pos.x, boat.pos.z, t, RR.River.waveAmp(boat.pos.x, boat.pos.z)) + 0.3,
        boat.pos.z + c * fwd - s * side * boat.radius * 0.85,
        // leaves the chine at near hull speed — water peeled off the bow is already moving with
        // the boat; air drag is what makes it fall astern, and that is what shapes the plume
        boat.vel.x * 0.82 + c * side * (2.4 + intensity * 6.5),
        1.3 + intensity * 2.3,
        boat.vel.z * 0.82 - s * side * (2.4 + intensity * 6.5),
        5, 1.6, 0.8);
    }
    // boost: a rooster tail off the stern so the burn is unmistakable. It is thrown WIDE, not
    // straight up, because straight up is exactly where the chase camera is looking.
    if (boat.boostHeat > 0.4 && speed > 8 && fire(boat, 'boost', 22 * near, dt)) {
      const side = Math.random() < 0.5 ? -1 : 1;
      FX.spray(
        boat.pos.x - s * boat.radius * 1.3 + c * side * boat.radius * 0.5,
        boat.pos.y + 0.25,
        boat.pos.z - c * boat.radius * 1.3 - s * side * boat.radius * 0.5,
        boat.vel.x * 0.3 + c * side * 3.5, 3.0 + intensity * 3.0, boat.vel.z * 0.3 - s * side * 3.5,
        3, 3.2, 1.3);
    }
    // hard turns throw a rooster fan
    if (Math.abs(boat.visRoll) > 0.18 && speed > 12 && fire(boat, 'turn', 26 * near, dt)) {
      const side = Math.sign(boat.visRoll);
      FX.spray(
        boat.pos.x - s * boat.radius * 0.6 + c * side * boat.radius * 0.7,
        boat.pos.y + 0.2,
        boat.pos.z - c * boat.radius * 0.6 - s * side * boat.radius * 0.7,
        boat.vel.x * 0.62 + c * side * (5 + intensity * 8),
        2.8 + intensity * 3.4,
        boat.vel.z * 0.62 - s * side * (5 + intensity * 8),
        3, 2.6, 1.1);
    }
  }

  // ---------- boost flame: additive cone pair at the stern while the burn is hot ----------
  function createFlame(boat) {
    const size = boat.mesh.userData && boat.mesh.userData.size;
    const sternZ = size ? -(size.len || 4) / 2 : -(boat.radius || 2);   // size.len (size.l was a bug → NaN → invisible flames)
    const g = new THREE.Group();
    const outer = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 1.4, 6),
      new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    outer.rotation.x = -Math.PI / 2;           // cone tip aft (-z local)
    outer.layers.set(1);
    outer.renderOrder = 3;
    const inner = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.85, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff3cf, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    inner.rotation.x = -Math.PI / 2;
    inner.position.z = -0.12;                  // white-hot core sits inside the orange sheath
    inner.layers.set(1);
    inner.renderOrder = 3;
    g.add(outer); g.add(inner);
    g.position.set(0, 0.35, sternZ - 0.5);
    g.visible = false;
    return g;
  }

  function updateFlame(w, boat, t) {
    if (!boat.mesh || boat.mesh.userData.noFlame) return;   // podracer runs its own engine glows
    if (!w.flame) {
      w.flame = createFlame(boat);
      boat.mesh.add(w.flame);
    }
    const heat = boat.boostHeat || 0;
    const on = heat > 0.45;
    w.flame.visible = on;
    if (on) w.flame.scale.setScalar(0.7 + heat * (0.6 + 0.25 * Math.sin(t * 40)));
  }

  FX.splashBurst = function (x, y, z, intensity) {
    FX.spray(x, y + 0.2, z, 0, 3.5 + intensity * 5, 0, Math.floor(16 + intensity * 30), 4.2 + intensity * 3, 2.0);
  };

  // ---------- near miss: threading the needle at speed pays boost ----------
  // Rearms only after the hulls separate again, so sitting alongside a rival earns nothing.
  const nearArmed = new Map();
  let nearTokens = 3, nearRefill = 0;
  function nearMiss(boats, dt) {
    nearRefill -= dt;
    if (nearRefill <= 0) { nearTokens = 3; nearRefill = 1; }     // max 3 per second
    let me = null;
    for (const b of boats) if (b.isPlayer) { me = b; break; }
    if (!me || me.finished) return;
    const fast = Math.hypot(me.vel.x, me.vel.z) > (me.spec.top || 40) * 0.55;
    for (const o of boats) {
      if (o === me) continue;
      const gap = Math.sqrt(U().dist2(me.pos.x, me.pos.z, o.pos.x, o.pos.z)) - me.radius - o.radius;
      const armed = nearArmed.get(o) !== false;
      if (gap > 6) { nearArmed.set(o, true); continue; }
      if (gap < 3.0 && gap > 0 && armed && fast && nearTokens > 0) {
        nearArmed.set(o, false);
        nearTokens--;
        me.boostEnergy = Math.min(1, me.boostEnergy + 0.06);
        if (RR.HUD && RR.HUD.chip) RR.HUD.chip('near', 'NEAR MISS +BOOST', 1100);
        else if (RR.HUD && RR.HUD.flash) RR.HUD.flash('NEAR MISS +BOOST');
      }
    }
  }

  // ---------- scrape: concrete on gelcoat, sparks of grit off the seawall ----------
  function scrapeFX(boat, dt) {
    const on = (boat.scrapeT || 0) > 0;
    if (boat.isPlayer && RR.Audio && RR.Audio.scrape) {
      const k = U().clamp(Math.hypot(boat.vel.x, boat.vel.z) / (boat.spec.top || 40), 0, 1);
      if (on !== !!boat._scrapeWas) RR.Audio.scrape(on, k);
      else if (on) RR.Audio.scrape(true, k);
    }
    boat._scrapeWas = on;
    if (!on) return;
    if (!fire(boat, 'scrape', boat.isPlayer ? 16 : 8, dt)) return;
    // boat.water aliases river.js's one shared scratch, so by now it holds whichever hull was
    // queried last — ask again for THIS boat or the spray peels off someone else's wall
    const w = RR.River.waterQuery(boat.pos.x, boat.pos.z, boat.hint);
    if (!w) return;
    // spray peels off the quay on the side the hull is riding
    const px = boat.pos.x - w.nx * (boat.radius * 0.8), pz = boat.pos.z - w.nz * (boat.radius * 0.8);
    FX.spray(px, boat.pos.y + 0.25, pz, -w.nx * 4 + boat.vel.x * 0.25, 2.2, -w.nz * 4 + boat.vel.z * 0.25, 3, 2.2, 0.9);
  }

  const wakes = new Map();
  FX.init = function () {
    const scene = RR.Engine.scene;
    initParticles(scene);
    initConfetti(scene);
    initGulls(scene);
    FX._scene = scene;
  };

  FX.registerBoat = function (boat) {
    wakes.set(boat, createWake(FX._scene));
  };

  // called between races — wake meshes are per-boat and must not outlive their boat
  FX.clearBoats = function () {
    wakes.forEach((w) => {
      FX._scene.remove(w.mesh);
      w.geo.dispose();
      w.mat.dispose();
      if (w.flame) {                 // cones ride on boat.mesh (removed with the boat) — just free GPU resources
        if (w.flame.parent) w.flame.parent.remove(w.flame);
        w.flame.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
        w.flame = null;
      }
    });
    wakes.clear();
    nearArmed.clear();          // keyed by boat object — must not outlive the boats
    if (RR.Audio && RR.Audio.scrape) RR.Audio.scrape(false, 0);
  };

  FX.update = function (boats, dt, t) {
    for (const b of boats) {
      const w = wakes.get(b);
      if (w) { updateWake(w, b, dt, t); updateFlame(w, b, t); }
      hullSpray(b, dt, t);
      scrapeFX(b, dt);
      if (b.isPlayer) speedLines(b, dt);
    }
    nearMiss(boats, dt);
    updateParticles(dt);
    updateConfetti(dt, t);
    updateGulls(t);
  };

  RR.FX = FX;
})();

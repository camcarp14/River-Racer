/* River Racer — water: river ribbons + lake sheet, one animated shader.
   Vertex displacement mirrors RR.U.waterHeight — keep the two in sync. */
(function () {
  const W = {};
  let mat;

  function buildMaterial() {
    const noiseTex = RR.U.canvasTexture(256, 256, (ctx, w, h) => {
      const rng = RR.U.mulberry(9182);
      const img = ctx.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        const v = 110 + rng() * 145;
        img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    });
    noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;

    mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uNoise: { value: noiseTex },
        uSunDir: { value: new THREE.Vector3(-0.72, 0.38, -0.16).normalize() },
        uCamPos: { value: new THREE.Vector3() },
        // Chicago River green vs Lake Michigan blue
        uDeepRiver: { value: new THREE.Color(0x1e4d43) },
        uShallowRiver: { value: new THREE.Color(0x3e7d68) },
        uDeepLake: { value: new THREE.Color(0x14496b) },
        uShallowLake: { value: new THREE.Color(0x2e7d9e) },
        uSkyLow: { value: new THREE.Color(0xffd9a0) },
        uSkyHigh: { value: new THREE.Color(0x74a9c9) },
        uFogColor: { value: new THREE.Color(0xd8c9a8) },
        uFogNear: { value: 900 },
        uFogFar: { value: 4200 },
        uReflect: { value: null },
        uReflectMatrix: { value: new THREE.Matrix4() },
        uReflectStrength: { value: 0 },
        uNumBoats: { value: 0 },
        uBoats: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
      },
      vertexShader: `
        uniform float uTime;
        attribute float aAmp;      // wave amplitude scale per vertex (river 1, lake ~3.3)
        attribute float aShore;    // 0 center of channel .. 1 at banks (foam band)
        attribute float aLake;     // 0 river, 1 lake (color blend)
        uniform mat4 uReflectMatrix;
        varying vec3 vWorld;
        varying float vShore;
        varying float vLake;
        varying float vAmp;
        varying vec4 vReflectCoord;
        float wh(vec2 p, float t, float amp) {
          return amp * (
            0.055 * sin(p.x * 0.11 + t * 1.35) +
            0.045 * sin(p.y * 0.13 - t * 1.02 + p.x * 0.04) +
            0.032 * sin((p.x + p.y) * 0.061 + t * 0.71) +
            0.022 * sin(p.x * 0.23 - p.y * 0.17 + t * 2.1));
        }
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          wp.y += wh(wp.xz, uTime, aAmp);
          vWorld = wp.xyz;
          vShore = aShore;
          vLake = aLake;
          vAmp = aAmp;
          vReflectCoord = uReflectMatrix * wp;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform float uTime;
        uniform sampler2D uNoise;
        uniform vec3 uSunDir, uCamPos;
        uniform vec3 uDeepRiver, uShallowRiver, uDeepLake, uShallowLake, uSkyLow, uSkyHigh;
        uniform vec3 uFogColor;
        uniform float uFogNear, uFogFar;
        uniform sampler2D uReflect;
        uniform float uReflectStrength;
        uniform int uNumBoats;
        uniform vec4 uBoats[8];
        varying vec3 vWorld;
        varying float vShore;
        varying float vLake;
        varying float vAmp;
        varying vec4 vReflectCoord;
        void main() {
          // ripple normal from two scrolling noise layers + analytic swell
          vec2 uv1 = vWorld.xz * 0.055 + vec2(uTime * 0.028, uTime * 0.021);
          vec2 uv2 = vWorld.xz * 0.11 - vec2(uTime * 0.031, -uTime * 0.017);
          float n1 = texture2D(uNoise, uv1).r;
          float n2 = texture2D(uNoise, uv2).r;
          float bump = (n1 + n2 - 1.0);
          float sx = cos(vWorld.x * 0.11 + uTime * 1.35) * 0.0061 * vAmp + bump * 0.10;
          float sz = cos(vWorld.z * 0.13 - uTime * 1.02) * 0.0059 * vAmp + (n2 - 0.5) * 0.12;
          vec3 N = normalize(vec3(-sx * 2.4, 1.0, -sz * 2.4));

          vec3 V = normalize(uCamPos - vWorld);
          float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 4.2);

          vec3 deep = mix(uDeepRiver, uDeepLake, vLake);
          vec3 shallow = mix(uShallowRiver, uShallowLake, vLake);
          vec3 base = mix(deep, shallow, clamp(0.35 + bump * 0.5, 0.0, 1.0));
          // shallower, lighter, greener water near the banks
          base = mix(base, base * 1.12 + vec3(0.03, 0.06, 0.04), smoothstep(0.55, 1.0, vShore) * 0.5 * (1.0 - vLake));

          // sky reflection tint: warmer when looking toward the low western sun
          float westness = clamp(dot(normalize(vec3(V.x, 0.0, V.z)), vec3(0.72, 0.0, 0.16)), 0.0, 1.0);
          vec3 sky = mix(uSkyHigh, uSkyLow, westness * 0.85 + 0.1);

          // real planar reflection of the skyline, rippled by the wave normal
          vec3 refl = sky;
          if (uReflectStrength > 0.0 && vReflectCoord.w > 0.0) {
            vec2 ruv = vReflectCoord.xy / vReflectCoord.w;
            ruv += N.xz * 0.04 + vec2(bump * 0.015);
            if (ruv.x > 0.005 && ruv.x < 0.995 && ruv.y > 0.005 && ruv.y < 0.995) {
              vec3 rc = texture2D(uReflect, ruv).rgb;
              refl = mix(sky, rc, uReflectStrength);
            }
          }

          vec3 col = mix(base, refl, fresnel * 0.9);

          // sun glitter
          vec3 H = normalize(uSunDir + V);
          float spec = pow(max(dot(N, H), 0.0), 220.0) * 2.6;
          float sparkle = pow(max(dot(N, H), 0.0), 900.0) * 5.0 * step(0.62, n2);
          col += vec3(1.0, 0.83, 0.58) * (spec + sparkle);

          // bank foam: soft lapping line at the seawalls
          float foamBand = smoothstep(0.78, 0.97, vShore + bump * 0.14 + 0.05 * sin(uTime * 1.7 + vWorld.x * 0.5 + vWorld.z * 0.4));
          col = mix(col, vec3(0.86, 0.92, 0.92), foamBand * 0.5 * (1.0 - vLake * 0.55));

          // bow-wave foam churned up around each moving boat
          float boatFoam = 0.0;
          for (int i = 0; i < 8; i++) {
            if (i >= uNumBoats) break;
            vec4 b = uBoats[i];
            vec2 d = vWorld.xz - b.xy;
            float dist = length(d);
            vec2 fwd = vec2(sin(b.w), cos(b.w));
            float f = dot(d, fwd);
            boatFoam += smoothstep(6.0, 1.2, dist) * (0.35 + 0.65 * smoothstep(-1.5, 3.5, f)) * b.z;
          }
          boatFoam = clamp(boatFoam, 0.0, 1.0);
          col = mix(col, vec3(0.93, 0.96, 0.97), boatFoam * 0.55);

          float fog = smoothstep(uFogNear, uFogFar, distance(uCamPos, vWorld));
          col = mix(col, uFogColor, fog);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    return mat;
  }

  // 3-lane ribbon (left bank, center, right bank) so foam only lives at the edges
  function buildRibbon3(path, isLakePath) {
    const n = path.n;
    const L = 3;
    const verts = new Float32Array(n * L * 3);
    const amp = new Float32Array(n * L);
    const shore = new Float32Array(n * L);
    const lake = new Float32Array(n * L);
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      let tx = path.x[i1] - path.x[i0], tz = path.z[i1] - path.z[i0];
      const tl = Math.max(1e-6, Math.hypot(tx, tz)); tx /= tl; tz /= tl;
      const wHalf = path.w[i] + 2.5;
      const lx = -tz, lz = tx;
      const a = RR.River.waveAmp(path.x[i], path.z[i]);
      const lk = isLakePath ? RR.U.smoothstep(RR.River.lakeWestX - 150, RR.River.lakeWestX + 300, path.x[i]) : 0;
      for (let l = 0; l < L; l++) {
        const f = l / (L - 1) * 2 - 1;      // -1, 0, 1
        const vi = i * L + l;
        verts[vi * 3] = path.x[i] + lx * wHalf * f;
        verts[vi * 3 + 1] = 0;
        verts[vi * 3 + 2] = path.z[i] + lz * wHalf * f;
        amp[vi] = a;
        shore[vi] = Math.abs(f);
        lake[vi] = lk;
      }
    }
    const idx = [];
    for (let i = 0; i < n - 1; i++) {
      for (let l = 0; l < L - 1; l++) {
        const a = i * L + l, b = i * L + l + 1, c = (i + 1) * L + l, d = (i + 1) * L + l + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setAttribute('aAmp', new THREE.BufferAttribute(amp, 1));
    geo.setAttribute('aShore', new THREE.BufferAttribute(shore, 1));
    geo.setAttribute('aLake', new THREE.BufferAttribute(lake, 1));
    geo.setIndex(idx);
    return geo;
  }

  W.init = function () {
    buildMaterial();
    const scene = RR.Engine.scene;
    const R = RR.River;
    const group = new THREE.Group();       // all water meshes, so reflection can hide them
    scene.add(group);
    W.group = group;
    W.material = mat;

    for (const key in R.paths) {
      if (key.startsWith('lake')) continue;               // the lake sheet covers open water
      const geo = buildRibbon3(R.paths[key], key === 'main');
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = true;
      mesh.receiveShadow = false;
      group.add(mesh);
    }

    // lake sheet: big segmented grid so vertex waves read properly.
    // starts 30m shy of the river-ribbon end and rides 9cm lower to dodge z-fighting at the seam
    const lakeW = R.lakeEastX - (R.lakeWestX - 30) + 300;
    const lakeH = R.lakeShoreZBot - R.lakeShoreZTop + 600;
    const gx = Math.min(150, Math.floor(lakeW / 22)), gz = Math.min(150, Math.floor(lakeH / 22));
    const lg = new THREE.PlaneGeometry(lakeW, lakeH, gx, gz);
    lg.rotateX(-Math.PI / 2);
    lg.translate(R.lakeWestX - 30 + lakeW / 2, -0.09, R.lakeShoreZTop - 300 + lakeH / 2);
    const cnt = lg.attributes.position.count;
    const amp = new Float32Array(cnt), shoreA = new Float32Array(cnt), lakeA = new Float32Array(cnt);
    for (let i = 0; i < cnt; i++) {
      const x = lg.attributes.position.getX(i), z = lg.attributes.position.getZ(i);
      amp[i] = RR.U.lerp(1.2, 3.3, RR.U.smoothstep(R.lakeWestX, R.lakeWestX + 500, x));
      shoreA[i] = 0;
      lakeA[i] = RR.U.smoothstep(R.lakeWestX - 100, R.lakeWestX + 350, x);
    }
    lg.setAttribute('aAmp', new THREE.BufferAttribute(amp, 1));
    lg.setAttribute('aShore', new THREE.BufferAttribute(shoreA, 1));
    lg.setAttribute('aLake', new THREE.BufferAttribute(lakeA, 1));
    const lakeMesh = new THREE.Mesh(lg, mat);
    group.add(lakeMesh);

    RR.Engine.onUpdate((dt, t) => {
      mat.uniforms.uTime.value = t;
      mat.uniforms.uCamPos.value.copy(RR.Engine.camera.position);
    });
  };

  RR.Water = W;
})();

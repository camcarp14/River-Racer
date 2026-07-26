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
        uSunDir: { value: new THREE.Vector3(-0.5668, 0.6947, 0.4429).normalize() },
        uSunColor: { value: new THREE.Color(0xffe9c8) },
        uCamPos: { value: new THREE.Vector3() },
        // The Chicago River is opaque, algal, desaturated grey-green — Secchi depth under a
        // metre. It is not teal. Lake Michigan really is turquoise over the sand shoals.
        uDeepRiver: { value: new THREE.Color(0x2b3a34) },
        uShallowRiver: { value: new THREE.Color(0x5e7a64) },
        uDeepLake: { value: new THREE.Color(0x0f3559) },
        uShallowLake: { value: new THREE.Color(0x2e8a99) },
        uSkyLow: { value: new THREE.Color(0xd3e0e8) },
        uSkyHigh: { value: new THREE.Color(0x4e86bd) },
        uFogColor: { value: new THREE.Color(0xc3d2dd) },
        uFogNear: { value: 520 },
        uFogFar: { value: 3900 },
        uReflect: { value: null },
        uReflectMatrix: { value: new THREE.Matrix4() },
        uReflectStrength: { value: 0 },
        // Chicago River foam is tan-green, never white. Green-river mode swaps it for pale mint.
        uFoamTint: { value: new THREE.Color(0.84, 0.86, 0.80) },
        uFineDetail: { value: 1 },     // autoQuality rung: drops the close-up octave under 44 fps
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
        varying float vH;
        varying vec4 vReflectCoord;
        // THE FOUR FUNCTIONS BELOW ARE A LITERAL MIRROR OF RR.U.swellFactor / swellHeight /
        // waterHeight / waveCrestScale. Change one, change both, or hulls float or sink.
        float swellF(float amp) { return clamp((amp - 1.0) / 2.3, 0.0, 1.0); }
        float sh(vec2 p, float t, float amp) {
          float s = swellF(amp), c = amp * (1.0 - 0.45 * s);
          return c * (
              0.055 * sin(p.x * 0.11 + t * 1.35) +
              0.045 * sin(p.y * 0.13 - t * 1.02 + p.x * 0.04) +
              0.032 * sin((p.x + p.y) * 0.061 + t * 0.71)
            ) + s * (
              0.95 * sin(p.y * 0.031822 - p.x * 0.011852 - t * 0.57717) +
              0.55 * sin(p.y * 0.023320 - p.x * 0.047865 - t * 0.72272)
            );
        }
        float wh(vec2 p, float t, float amp) {
          float s = swellF(amp);
          return sh(p, t, amp) + amp * (1.0 - 0.45 * s) * 0.022 * sin(p.x * 0.23 - p.y * 0.17 + t * 2.1);
        }
        float crestScale(float amp) {
          float s = swellF(amp);
          return amp * (1.0 - 0.45 * s) * 0.154 + s * 1.50;
        }
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float hh = wh(wp.xz, uTime, aAmp);
          wp.y += hh;
          vH = hh / max(0.05, crestScale(aAmp));   // -1..1 crest factor, same meaning river or lake
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
        uniform vec3 uSunDir, uSunColor, uCamPos;
        uniform vec3 uDeepRiver, uShallowRiver, uDeepLake, uShallowLake, uSkyLow, uSkyHigh;
        uniform vec3 uFogColor;
        uniform float uFogNear, uFogFar;
        uniform sampler2D uReflect;
        uniform float uReflectStrength;
        uniform int uNumBoats;
        uniform vec4 uBoats[8];
        uniform vec3 uFoamTint;
        uniform float uFineDetail;
        varying vec3 vWorld;
        varying float vShore;
        varying float vLake;
        varying float vAmp;
        varying float vH;
        varying vec4 vReflectCoord;
        void main() {
          // ripple normal from three scrolling noise octaves + analytic swell
          vec2 uv1 = vWorld.xz * 0.055 + vec2(uTime * 0.028, uTime * 0.021);
          vec2 uv2 = vWorld.xz * 0.11 - vec2(uTime * 0.031, -uTime * 0.017);
          vec2 uv3 = vWorld.xz * 0.27 + vec2(uTime * 0.071, -uTime * 0.058);
          float n1 = texture2D(uNoise, uv1).r;
          float n2 = texture2D(uNoise, uv2).r;
          float n3 = texture2D(uNoise, uv3).r;   // fine octave: close-up sparkle detail
          // The fine octaves ran to the horizon and aliased into a shimmer. Fade them out past
          // 35 m: it kills the worst aliasing in the game and buys real texture under the hull.
          float dcam = distance(uCamPos, vWorld);
          float nearF = 1.0 - smoothstep(35.0, 140.0, dcam);
          float n4 = 0.5;
          if (uFineDetail > 0.5) n4 = texture2D(uNoise, vWorld.xz * 0.62 + vec2(uTime * 0.13, -uTime * 0.11)).r;
          float bump = (n1 + n2 - 1.0) + ((n3 - 0.5) * 0.40 + (n4 - 0.5) * 0.26) * nearF;
          float sAmp = clamp((vAmp - 1.0) / 2.3, 0.0, 1.0);
          float cAmp = vAmp * (1.0 - 0.45 * sAmp);
          // Analytic slope of the swell trains, with a 2.6x SHADING gain (geometry is untouched —
          // the hulls still sit on wh()). A real 3.5 m sea on a 185 m wavelength is a four-degree
          // face; four degrees of a mirror lake is invisible, and the ripple noise below would
          // otherwise out-shout it. This is what actually draws the crest.
          float g1 = cos(vWorld.z * 0.031822 - vWorld.x * 0.011852 - uTime * 0.57717) * sAmp * 2.6;
          float g2 = cos(vWorld.z * 0.023320 - vWorld.x * 0.047865 - uTime * 0.72272) * sAmp * 2.6;
          float sx = cos(vWorld.x * 0.11 + uTime * 1.35) * 0.0061 * cAmp
                     - 0.011259 * g1 - 0.026326 * g2 + bump * 0.10;
          float sz = cos(vWorld.z * 0.13 - uTime * 1.02) * 0.0059 * cAmp
                     + 0.030231 * g1 + 0.012826 * g2 + (n2 - 0.5) * 0.12 + (n3 - 0.5) * 0.05;
          vec3 N = normalize(vec3(-sx * 2.4, 1.0, -sz * 2.4));

          vec3 V = normalize(uCamPos - vWorld);
          float grazing = pow(1.0 - max(dot(N, V), 0.0), 4.8);
          float fresnel = 0.02 + 0.98 * grazing;

          vec3 deep = mix(uDeepRiver, uDeepLake, vLake);
          vec3 shallow = mix(uShallowRiver, uShallowLake, vLake);
          vec3 base = mix(deep, shallow, clamp(0.35 + bump * 0.5, 0.0, 1.0));
          // shallower, lighter, greener water near the banks
          base = mix(base, base * 1.12 + vec3(0.03, 0.06, 0.04), smoothstep(0.55, 1.0, vShore) * 0.5 * (1.0 - vLake));
          // light the crests and sink the troughs — signed, because on open water the dark trough
          // is half of what tells you a swell is passing. Twice the swing out on the lake.
          base *= (1.0 + vH * (0.10 + 0.14 * vLake)) * (1.0 - grazing * 0.22);
          // The river meets vertical sheet pile and limestone, not a beach. The contact shadow
          // in the last half-metre is what makes the water look like it is IN a channel.
          float wallShade = smoothstep(0.84, 1.0, vShore);
          base *= mix(1.0, 0.70, wallShade * (1.0 - vLake));

          // sky reflection tint: warmer when looking back into the sun, wherever it currently is
          vec3 sunH = normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + vec3(0.0001, 0.0, 0.0));
          float westness = clamp(dot(normalize(vec3(V.x, 0.0, V.z)), -sunH), 0.0, 1.0);
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

          // turbidity split: the river is opaque and chop-rough, so it reflects far less than
          // the lake. Two lines, and it is the difference between "river" and "swimming pool".
          float reflMul = mix(0.62, 1.00, vLake);
          vec3 col = mix(base, refl, clamp(fresnel * 0.9 * reflMul, 0.0, 1.0));

          // sun glitter. Squashing the normal horizontally stretches the glitter into a streak
          // along the sun azimuth, which is what a real glitter path looks like.
          vec3 H = normalize(uSunDir + V);
          vec3 Ng = normalize(vec3(N.x * 0.55, N.y, N.z * 0.55));
          float ndh = max(dot(Ng, H), 0.0);
          float spec = pow(ndh, 300.0) * 2.4;
          float sparkle = pow(ndh, 900.0) * 7.0 * smoothstep(0.54, 0.74, n3) * (0.55 + 0.9 * n2);
          col += uSunColor * (spec + sparkle);

          // foam grain: break flat white up with the mid noise octave
          float foamGrain = 0.6 + 0.8 * n2;

          // Whitecaps. Past about force 4 the crests of a Lake Michigan swell curl and break, and
          // a scatter of white is the single strongest cue that a sea is RUNNING rather than
          // sitting. Gated on the swell ramp, so the sheltered harbour never grows any.
          float cap = smoothstep(0.58, 0.96, vH) * sAmp * smoothstep(0.54, 0.82, n2);
          col = mix(col, uFoamTint, clamp(cap * foamGrain, 0.0, 1.0) * 0.50);

          // bank foam: a thin scum line against the wall, not a surf break
          float foamBand = smoothstep(0.905, 1.0, vShore + bump * 0.10 + 0.035 * sin(uTime * 1.9 + vWorld.x * 0.55 + vWorld.z * 0.42));
          col = mix(col, uFoamTint, clamp(foamBand * foamGrain, 0.0, 1.0) * 0.34 * (1.0 - vLake * 0.6));

          // Wake. The Kelvin half-angle is 19.47 deg — a constant of deep-water physics and
          // instantly recognisable — so the arms diverge at lat = along * tan(19.47) = 0.3532.
          float bowFoam = 0.0, trailFoam = 0.0;
          for (int i = 0; i < 8; i++) {
            if (i >= uNumBoats) break;
            vec4 b = uBoats[i];
            vec2 d = vWorld.xz - b.xy;
            vec2 fwd = vec2(sin(b.w), cos(b.w));
            vec2 rgt = vec2(fwd.y, -fwd.x);
            float along = -dot(d, fwd);                 // metres BEHIND the boat
            float lat = abs(dot(d, rgt));
            bowFoam += smoothstep(5.5, 1.0, length(d)) * b.z * 0.9;
            float trail = smoothstep(26.0, 0.0, along) * step(0.0, along);
            trailFoam += trail * smoothstep(2.4 + along * 0.10, 0.0, lat) * b.z * 0.55;
            float arm = abs(lat - along * 0.3532);
            trailFoam += trail * smoothstep(1.8, 0.0, arm) * b.z * 0.45;
          }
          trailFoam = clamp(trailFoam * foamGrain, 0.0, 1.0);
          bowFoam = clamp(bowFoam * foamGrain, 0.0, 1.0);
          col = mix(col, uFoamTint, trailFoam * 0.55);
          col = mix(col, min(uFoamTint * 1.07, vec3(1.0)), bowFoam * 0.55);

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
      // river and lake water really are different colours and they meet at the lock — blend
      // over 120 m either side of it rather than at a hard edge
      const lk = isLakePath ? RR.U.smoothstep(RR.River.lakeWestX - 120, RR.River.lakeWestX + 120, path.x[i]) : 0;
      // the river ribbon dives under the lake sheet at its mouth so the seam never
      // shows as a bright edge-on strip across the exit
      const endFade = isLakePath ? Math.max(0, (i - (n - 5)) / 4) : 0;
      for (let l = 0; l < L; l++) {
        const f = l / (L - 1) * 2 - 1;      // -1, 0, 1
        const vi = i * L + l;
        verts[vi * 3] = path.x[i] + lx * wHalf * f;
        verts[vi * 3 + 1] = -0.16 * endFade;
        verts[vi * 3 + 2] = path.z[i] + lz * wHalf * f;
        amp[vi] = a;
        shore[vi] = Math.abs(f) * (1 - endFade);
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
      amp[i] = RR.U.lerp(1.0, 3.3, RR.U.smoothstep(R.lakeWestX, R.lakeWestX + 420, x));
      shoreA[i] = 0;
      lakeA[i] = RR.U.smoothstep(R.lakeWestX - 120, R.lakeWestX + 120, x);   // matches the river ribbon blend
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

/* River Racer — sky dome, sun disc, moon, clouds, stars.
   Clouds live in the dome fragment shader as scrolling fBm: the 20 camera-facing billboards
   this used to draw were 20 draw calls for something that never moved convincingly. */
(function () {
  const S = {};

  // one 256² tileable value-noise tile, built off a 32² lattice so it is smooth rather than
  // white — three fetches of this are the whole cloud layer
  function cloudNoiseTexture() {
    const tex = RR.U.canvasTexture(256, 256, (ctx, w, h) => {
      const rng = RR.U.mulberry(4471);
      const N = 32, lat = new Float32Array(N * N);
      for (let i = 0; i < N * N; i++) lat[i] = rng();
      const sm = (t) => t * t * (3 - 2 * t);
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        const fy = y / h * N, y0 = Math.floor(fy), ty = sm(fy - y0), y1 = (y0 + 1) % N;
        for (let x = 0; x < w; x++) {
          const fx = x / w * N, x0 = Math.floor(fx), tx = sm(fx - x0), x1 = (x0 + 1) % N;
          const a = lat[y0 * N + x0], b = lat[y0 * N + x1];
          const c = lat[y1 * N + x0], d = lat[y1 * N + x1];
          const top = a + (b - a) * tx, bot = c + (d - c) * tx;
          const v = Math.round((top + (bot - top) * ty) * 255);
          const p = (y * w + x) * 4;
          img.data[p] = v; img.data[p + 1] = v; img.data[p + 2] = v; img.data[p + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  S.init = function () {
    const scene = RR.Engine.scene;
    const rng = RR.U.mulberry(7331);

    const geo = new THREE.SphereGeometry(4600, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        cZenith: { value: new THREE.Color(0x2f6fb8) },
        cMid: { value: new THREE.Color(0x8db8dc) },
        cHorizon: { value: new THREE.Color(0xd3e0e8) },
        cWest: { value: new THREE.Color(0xf2e2c6) },
        sunDir: { value: new THREE.Vector3(-0.5668, 0.6947, 0.4429).normalize() },
        uNight: { value: 0 },
        nZenith: { value: new THREE.Color(0x04091a) },
        nMid: { value: new THREE.Color(0x0c1730) },
        nHorizon: { value: new THREE.Color(0x2a3348) },
        uTime: { value: 0 },
        uCloudNoise: { value: cloudNoiseTexture() },
        uCloudCover: { value: 0.42 },
        uCloudLit: { value: new THREE.Color(0xfbfbf8) },
        uCloudShade: { value: new THREE.Color(0xb7c2cc) },
        uCloudOpacity: { value: 0.85 },
        uCloudOctaves: { value: 3 },
        uMoonDir: { value: new THREE.Vector3(0.5868, 0.6428, 0.4925).normalize() },
        uMoonDirA: { value: new THREE.Vector3(0.5868, 0.6428, 0.4925).normalize() },
        uMoonDirB: { value: new THREE.Vector3(0.5868, 0.6428, 0.4925).normalize() },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 cZenith, cMid, cHorizon, cWest, sunDir;
        uniform vec3 nZenith, nMid, nHorizon;
        uniform float uNight, uTime;
        uniform sampler2D uCloudNoise;
        uniform float uCloudCover, uCloudOpacity, uCloudOctaves;
        uniform vec3 uCloudLit, uCloudShade;
        uniform vec3 uMoonDir, uMoonDirA, uMoonDirB;
        varying vec3 vDir;
        void main() {
          vec3 D = normalize(vDir);
          float h = clamp(D.y, 0.0, 1.0);
          // smoother multi-band gradient: horizon -> mid -> mid/zenith blend -> zenith
          vec3 col = mix(cHorizon, cMid, smoothstep(0.0, 0.30, h));
          col = mix(col, mix(cMid, cZenith, 0.55), smoothstep(0.18, 0.46, h));
          col = mix(col, cZenith, smoothstep(0.40, 0.82, h));
          float sd = max(dot(D, sunDir), 0.0);
          float sunAmt = pow(sd, 4.0);
          col = mix(col, cWest, sunAmt * (1.0 - h * 0.6));
          col = mix(col, cWest * vec3(1.06, 0.92, 0.80), pow(sd, 2.0) * pow(1.0 - h, 3.0) * 0.45);
          col += vec3(1.0, 0.62, 0.30) * pow(sd, 3.5) * pow(1.0 - h, 2.5) * 0.35;
          col = mix(col, vec3(1.0, 0.78, 0.5), pow(1.0 - h, 6.0) * 0.35 * (0.4 + 0.6 * sunAmt));

          // ---- clouds: fBm on a plane projection, so they foreshorten toward the horizon ----
          vec2 cuv = D.xz / max(D.y, 0.055);
          float f = texture2D(uCloudNoise, cuv * 0.055 + uTime * vec2( 0.0035,  0.0018)).r * 0.55;
          if (uCloudOctaves > 1.5) {
            f += texture2D(uCloudNoise, cuv * 0.127 + uTime * vec2( 0.0061, -0.0022)).r * 0.28;
            f += texture2D(uCloudNoise, cuv * 0.281 + uTime * vec2( 0.0104,  0.0043)).r * 0.17;
          } else {
            f *= 1.82;
          }
          float cLo = 1.0 - uCloudCover;
          float cov = smoothstep(cLo, cLo + 0.22, f);
          cov *= smoothstep(0.02, 0.16, D.y);                    // no hard dome edge at the horizon
          float lit = smoothstep(-0.20, 0.55, dot(D, sunDir));
          vec3 cloudCol = mix(uCloudShade, uCloudLit, lit);
          // undersides catch the low sun — the single thing that sells a sunset sky
          cloudCol += vec3(1.0, 0.42, 0.16) * pow(sd, 5.0) * 0.8 * (1.0 - uNight);
          col = mix(col, cloudCol, cov * uCloudOpacity);

          // ---- sun: the real disc is 0.53 deg. Small and hot, and let bloom do the flare. ----
          float disc = smoothstep(0.9999855, 0.9999925, sd);
          float limb = smoothstep(0.9999790, 0.9999880, sd);
          col += vec3(1.00, 0.94, 0.82) * disc * 5.2;
          col += vec3(1.00, 0.86, 0.62) * limb * 1.1;
          col += vec3(1.00, 0.74, 0.44) * pow(sd, 900.0) * 1.30;
          col += vec3(1.00, 0.66, 0.38) * pow(sd, 90.0) * 0.42;
          col += vec3(1.00, 0.60, 0.34) * pow(sd, 8.0) * 0.16;

          // ---- night sky: dark gradient + sodium city glow + a moon with maria ----
          if (uNight > 0.001) {
            vec3 nsky = mix(nHorizon, nMid, smoothstep(0.0, 0.34, h));
            nsky = mix(nsky, nZenith, smoothstep(0.14, 0.72, h));
            nsky = mix(nsky, vec3(0.32, 0.22, 0.14), pow(1.0 - h, 9.0) * 0.7);
            float mwd = dot(D, normalize(vec3(0.62, 0.16, -0.55)));
            nsky += vec3(0.085, 0.10, 0.145) * exp(-mwd * mwd * 55.0) * smoothstep(0.06, 0.42, h);
            nsky = mix(nsky, cloudCol * 0.5, cov * uCloudOpacity);
            float md = max(dot(D, uMoonDir), 0.0);
            float mdisc = smoothstep(0.9999870, 0.9999935, md);
            float m1 = smoothstep(0.99999880, 0.99999960, dot(D, uMoonDirA));
            float m2 = smoothstep(0.99999900, 0.99999970, dot(D, uMoonDirB));
            vec3 moonCol = vec3(0.96, 0.96, 0.93) * (1.0 - 0.22 * m1 - 0.16 * m2);
            nsky += moonCol * mdisc * 3.4;
            nsky += vec3(0.62, 0.70, 0.92) * pow(md, 1600.0) * 0.55;
            nsky += vec3(0.40, 0.48, 0.72) * pow(md, 40.0) * 0.10;
            col = mix(col, nsky, uNight);
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const dome = new THREE.Mesh(geo, mat);
    dome.renderOrder = -10;
    scene.add(dome);
    S.dome = dome;
    S.mat = mat;

    // ---------- stars (hidden by day) ----------
    const starN = 1400, sPos = new Float32Array(starN * 3), sCol = new Float32Array(starN * 3);
    for (let i = 0; i < starN; i++) {
      const u = rng(), v = rng() * 0.9 + 0.06;
      const th = u * Math.PI * 2, ph = Math.acos(v);
      const r = 4400;
      const y = r * Math.cos(ph);
      sPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      sPos[i * 3 + 1] = y;
      sPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      // varied brightness: mostly dim, a few bright, slight blue/warm cast
      let b = (rng() < 0.12 ? 0.75 + rng() * 0.25 : 0.25 + rng() * 0.45);
      // Chicago's sky glow eats everything below ~20 deg; stars down at the horizon are the tell
      b *= RR.U.smoothstep(0.06, 0.34, y / r);
      const w = rng() * 0.12;
      sCol[i * 3] = b * (1.0 - w * 0.3);
      sCol[i * 3 + 1] = b;
      sCol[i * 3 + 2] = Math.min(1, b * (1.0 + w));
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
    const starTex = RR.U.canvasTexture(32, 32, (ctx) => {
      const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(230,235,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
    });
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 11, map: starTex, transparent: true, depthWrite: false, fog: false, sizeAttenuation: true, opacity: 1.0, vertexColors: true }));
    stars.renderOrder = -8; stars.visible = false; stars.frustumCulled = false;
    scene.add(stars);
    S.stars = stars;

    // continuous, not a >0.5 toggle: dusk sits at night = 0.45 and must read as blue hour
    S.setNight = function (f) {
      mat.uniforms.uNight.value = f;
      stars.visible = f > 0.10;
      stars.material.opacity = RR.U.smoothstep(0.10, 0.85, f);
    };

    // the moon needs its own direction — at dusk the sun disc is below the horizon and the
    // moon is already up over the lake. A/B are the two maria patches, ~0.1 deg off axis.
    S.setMoon = function (x, y, z) {
      const d = new THREE.Vector3(x, y, z).normalize();
      const ref = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const a = new THREE.Vector3().crossVectors(d, ref).normalize();
      const b = new THREE.Vector3().crossVectors(d, a).normalize();
      mat.uniforms.uMoonDir.value.copy(d);
      mat.uniforms.uMoonDirA.value.copy(d).addScaledVector(a, 0.0021).addScaledVector(b, 0.0009).normalize();
      mat.uniforms.uMoonDirB.value.copy(d).addScaledVector(a, -0.0011).addScaledVector(b, -0.0017).normalize();
    };
    S.setMoon(0.5868, 0.6428, 0.4925);

    RR.Engine.onUpdate((dt, t) => {
      const cam = RR.Engine.camera;
      dome.position.set(cam.position.x, 0, cam.position.z);
      stars.position.set(cam.position.x, 0, cam.position.z);
      mat.uniforms.uTime.value = t;
    });
  };

  RR.Sky = S;
})();

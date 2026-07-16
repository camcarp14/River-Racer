/* River Racer — sky dome, sun disc, clouds, distant haze */
(function () {
  const S = {};

  S.init = function () {
    const scene = RR.Engine.scene;

    // gradient dome: golden hour looking west, cool zenith
    const geo = new THREE.SphereGeometry(4600, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        cZenith: { value: new THREE.Color(0x2e6a9e) },
        cMid: { value: new THREE.Color(0x9fc4d8) },
        cHorizon: { value: new THREE.Color(0xffd9a0) },
        cWest: { value: new THREE.Color(0xffb35c) },
        sunDir: { value: new THREE.Vector3(-0.72, 0.20, -0.16).normalize() },
        uNight: { value: 0 },
        nZenith: { value: new THREE.Color(0x030711) },
        nMid: { value: new THREE.Color(0x0a1428) },
        nHorizon: { value: new THREE.Color(0x223049) },
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
        uniform float uNight;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, 0.0, 1.0);
          // smoother multi-band gradient: horizon -> mid -> mid/zenith blend -> zenith
          vec3 col = mix(cHorizon, cMid, smoothstep(0.0, 0.30, h));
          col = mix(col, mix(cMid, cZenith, 0.55), smoothstep(0.18, 0.46, h));
          col = mix(col, cZenith, smoothstep(0.40, 0.82, h));
          float sd = max(dot(normalize(vDir), sunDir), 0.0);
          float sunAmt = pow(sd, 4.0);
          // richer west tint hugging the horizon around the sun
          col = mix(col, cWest, sunAmt * (1.0 - h * 0.6));
          col = mix(col, cWest * vec3(1.06, 0.92, 0.80), pow(sd, 2.0) * pow(1.0 - h, 3.0) * 0.45);
          // soft warm glow lobe where the sun sits low
          col += vec3(1.0, 0.62, 0.30) * pow(sd, 3.5) * pow(1.0 - h, 2.5) * 0.35;
          // warm horizon band that glows into the golden hour
          col = mix(col, vec3(1.0, 0.78, 0.5), pow(1.0 - h, 6.0) * 0.35 * (0.4 + 0.6 * sunAmt));
          float disc = smoothstep(0.99900, 0.99955, sd);
          col += vec3(1.0, 0.9, 0.72) * disc * 3.4;          // bright disc — blooms
          float glow = pow(sd, 22.0);
          col += vec3(1.0, 0.74, 0.44) * glow * 0.85;
          float halo = pow(sd, 6.0);
          col += vec3(1.0, 0.6, 0.34) * halo * 0.28;

          // ---- night sky: dark gradient + warm city glow at the horizon + a moon ----
          if (uNight > 0.001) {
            vec3 nsky = mix(nHorizon, nMid, smoothstep(0.0, 0.34, h));
            nsky = mix(nsky, nZenith, smoothstep(0.14, 0.72, h));
            nsky = mix(nsky, vec3(0.32, 0.22, 0.14), pow(1.0 - h, 9.0) * 0.7);   // sodium-lit horizon haze
            // faint diagonal Milky-Way band across the upper sky
            float mwd = dot(normalize(vDir), normalize(vec3(0.62, 0.16, -0.55)));
            nsky += vec3(0.085, 0.10, 0.145) * exp(-mwd * mwd * 55.0) * smoothstep(0.06, 0.42, h);
            float moon = smoothstep(0.99920, 0.99965, sd);
            nsky += vec3(0.95, 0.96, 1.0) * moon * 2.6;
            nsky += vec3(0.5, 0.58, 0.82) * pow(sd, 60.0) * 0.4;
            col = mix(col, nsky, uNight);
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const dome = new THREE.Mesh(geo, mat);
    dome.renderOrder = -10;
    scene.add(dome);
    S.dome = dome;

    // sparse flat-bottomed cumulus as billboards, kept high and far
    const rng = RR.U.mulberry(7331);
    const cloudTex = RR.U.canvasTexture(256, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) {
        const cx = w * (0.18 + rng() * 0.64), cy = h * (0.35 + rng() * 0.28), r = 14 + rng() * 26;
        const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
        g.addColorStop(0, 'rgba(255,246,235,0.55)');
        g.addColorStop(1, 'rgba(255,246,235,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
      }
    });
    // wide soft stratus sheets — fewer, flatter, fainter lobes
    const stratusTex = RR.U.canvasTexture(256, 96, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < 12; i++) {
        const cx = w * (0.12 + rng() * 0.76), cy = h * (0.38 + rng() * 0.24), r = 26 + rng() * 42;
        ctx.save();
        ctx.translate(cx, cy); ctx.scale(2.6, 1);
        const g = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
        g.addColorStop(0, 'rgba(255,244,232,0.30)');
        g.addColorStop(1, 'rgba(255,244,232,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
        ctx.restore();
      }
    });
    const cGeo = new THREE.PlaneGeometry(1, 1);
    const cMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.9 });
    const stMat = new THREE.MeshBasicMaterial({ map: stratusTex, transparent: true, depthWrite: false, fog: false, opacity: 0.75 });
    S.clouds = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(cGeo, cMat);
      const ang = rng() * Math.PI * 2, dist = 2400 + rng() * 1600;
      m.position.set(Math.cos(ang) * dist, 320 + rng() * 380, Math.sin(ang) * dist);
      const s = 500 + rng() * 700;
      m.scale.set(s, s * 0.42, 1);
      m.renderOrder = -9;
      scene.add(m);
      S.clouds.push(m);
    }
    // a handful of big soft stratus puffs at varied heights (same hide-at-night path)
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(cGeo, stMat);
      const ang = rng() * Math.PI * 2, dist = 2600 + rng() * 1500;
      m.position.set(Math.cos(ang) * dist, 220 + rng() * 620, Math.sin(ang) * dist);
      const s = 1100 + rng() * 1300;
      m.scale.set(s, s * (0.18 + rng() * 0.12), 1);
      m.renderOrder = -9;
      scene.add(m);
      S.clouds.push(m);
    }

    // ---------- stars (hidden by day) ----------
    const starN = 1400, sPos = new Float32Array(starN * 3), sCol = new Float32Array(starN * 3);
    for (let i = 0; i < starN; i++) {
      // upper hemisphere of the dome
      const u = rng(), v = rng() * 0.9 + 0.06;
      const th = u * Math.PI * 2, ph = Math.acos(v);
      const r = 4400;
      sPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      sPos[i * 3 + 1] = r * Math.cos(ph);
      sPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      // varied brightness: mostly dim, a few bright, slight blue/warm cast
      const b = (rng() < 0.12 ? 0.75 + rng() * 0.25 : 0.25 + rng() * 0.45);
      const w = rng() * 0.12;
      sCol[i * 3] = b * (1.0 - w * 0.3);
      sCol[i * 3 + 1] = b;
      sCol[i * 3 + 2] = b * (1.0 + w) > 1 ? 1 : b * (1.0 + w);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
    const starTex = RR.U.canvasTexture(32, 32, (ctx) => {
      const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(230,235,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
    });
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 14, map: starTex, transparent: true, depthWrite: false, fog: false, sizeAttenuation: true, opacity: 0.95, vertexColors: true }));
    stars.renderOrder = -8; stars.visible = false; stars.frustumCulled = false;
    scene.add(stars);
    S.stars = stars;
    S.mat = mat;

    S.setNight = function (f) {
      mat.uniforms.uNight.value = f;
      stars.visible = f > 0.5;
      for (const c of S.clouds) c.visible = f < 0.5;   // clear night skies show the stars
    };

    RR.Engine.onUpdate((dt) => {
      const cam = RR.Engine.camera;
      dome.position.set(cam.position.x, 0, cam.position.z);
      stars.position.set(cam.position.x, 0, cam.position.z);
      for (const c of S.clouds) c.quaternion.copy(cam.quaternion);
    });
  };

  RR.Sky = S;
})();

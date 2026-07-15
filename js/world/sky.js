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
          vec3 col = mix(cHorizon, cMid, smoothstep(0.0, 0.28, h));
          col = mix(col, cZenith, smoothstep(0.22, 0.75, h));
          float sd = max(dot(normalize(vDir), sunDir), 0.0);
          float sunAmt = pow(sd, 4.0);
          col = mix(col, cWest, sunAmt * (1.0 - h * 0.55));
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
    const cGeo = new THREE.PlaneGeometry(1, 1);
    const cMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.9 });
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

    // ---------- stars (hidden by day) ----------
    const starN = 900, sPos = new Float32Array(starN * 3), sSize = new Float32Array(starN);
    for (let i = 0; i < starN; i++) {
      // upper hemisphere of the dome
      const u = rng(), v = rng() * 0.9 + 0.06;
      const th = u * Math.PI * 2, ph = Math.acos(v);
      const r = 4400;
      sPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      sPos[i * 3 + 1] = r * Math.cos(ph);
      sPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      sSize[i] = 6 + rng() * 18;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    starGeo.setAttribute('size', new THREE.BufferAttribute(sSize, 1));
    const starTex = RR.U.canvasTexture(32, 32, (ctx) => {
      const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(230,235,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
    });
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 14, map: starTex, transparent: true, depthWrite: false, fog: false, sizeAttenuation: true, opacity: 0.95 }));
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

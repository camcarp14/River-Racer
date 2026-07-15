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
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 cZenith, cMid, cHorizon, cWest, sunDir;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 col = mix(cHorizon, cMid, smoothstep(0.0, 0.28, h));
          col = mix(col, cZenith, smoothstep(0.22, 0.75, h));
          float sunAmt = pow(max(dot(normalize(vDir), sunDir), 0.0), 5.0);
          col = mix(col, cWest, sunAmt * (1.0 - h * 0.6));
          float disc = smoothstep(0.9993, 0.9997, dot(normalize(vDir), sunDir));
          col += vec3(1.0, 0.86, 0.62) * disc * 2.4;
          float glow = pow(max(dot(normalize(vDir), sunDir), 0.0), 32.0);
          col += vec3(1.0, 0.72, 0.4) * glow * 0.55;
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

    RR.Engine.onUpdate((dt) => {
      const cam = RR.Engine.camera;
      dome.position.set(cam.position.x, 0, cam.position.z);
      for (const c of S.clouds) c.quaternion.copy(cam.quaternion);
    });
  };

  RR.Sky = S;
})();

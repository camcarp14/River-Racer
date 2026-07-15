/* River Racer — day / night theming. Swaps lights, fog, sky, water colours, the
   buildings' lit-window glow and the street-lamp lights. Toggle with N. */
(function () {
  const T = { mode: 'day', lamps: [], _mesh: null };

  // world builders call this with each lamp globe position so night can light them up
  T.addLamp = function (x, y, z, c) { T.lamps.push([x, y, z, c || 0xffe6b0]); };

  T.buildLamps = function () {
    if (!T.lamps.length || T._mesh) return;
    const geoms = [], _c = new THREE.Color();
    for (const [x, y, z, c] of T.lamps) {
      const g = new THREE.SphereGeometry(0.55, 6, 5);
      g.translate(x, y, z);
      _c.setHex(c).convertSRGBToLinear();
      const n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geoms.push(g);
    }
    // chunked so a single buffer never gets silly
    T._mesh = new THREE.Group();
    for (let i = 0; i < geoms.length; i += 1500) {
      const m = new THREE.Mesh(RR.City.mergeGeoms(geoms.slice(i, i + 1500)), new THREE.MeshBasicMaterial({ vertexColors: true }));
      T._mesh.add(m);
    }
    T._mesh.visible = false;
    RR.Engine.scene.add(T._mesh);
  };

  const DAY = {
    sun: 0xffdcae, sunI: 1.55, hemi: 0xcfe3f0, hemiG: 0x44505c, hemiI: 0.68, exposure: 0.95,
    fog: 0xd8c9a8, fogNear: 900, fogFar: 4200,
    water: { deepR: 0x1e4d43, shalR: 0x3e7d68, deepL: 0x14496b, shalL: 0x2e7d9e, skyLo: 0xffd9a0, skyHi: 0x74a9c9, fog: 0xd8c9a8 },
  };
  const NIGHT = {
    sun: 0x9fb2dc, sunI: 0.5, hemi: 0x27324c, hemiG: 0x0d121c, hemiI: 0.4, exposure: 1.35,
    fog: 0x0a1120, fogNear: 650, fogFar: 3500,
    water: { deepR: 0x081820, shalR: 0x123038, deepL: 0x06111d, shalL: 0x102838, skyLo: 0x1c2740, skyHi: 0x080f1c, fog: 0x0a1120 },
  };

  T.apply = function (mode) {
    T.mode = mode;
    const night = mode === 'night';
    const P = night ? NIGHT : DAY, E = RR.Engine;
    E.sun.color.setHex(P.sun); E.sun.intensity = P.sunI;
    E.hemi.color.setHex(P.hemi); E.hemi.groundColor.setHex(P.hemiG); E.hemi.intensity = P.hemiI;
    E.renderer.toneMappingExposure = P.exposure;
    E.scene.fog.color.setHex(P.fog); E.scene.fog.near = P.fogNear; E.scene.fog.far = P.fogFar;

    if (RR.Sky && RR.Sky.setNight) RR.Sky.setNight(night ? 1 : 0);

    if (RR.Water && RR.Water.material) {
      const u = RR.Water.material.uniforms, c = P.water;
      u.uDeepRiver.value.setHex(c.deepR); u.uShallowRiver.value.setHex(c.shalR);
      u.uDeepLake.value.setHex(c.deepL); u.uShallowLake.value.setHex(c.shalL);
      u.uSkyLow.value.setHex(c.skyLo); u.uSkyHigh.value.setHex(c.skyHi);
      u.uFogColor.value.setHex(c.fog);
      u.uReflectStrength && (u._nightRefl = night);
    }

    const cm = RR.City.material();      // lit windows glow via the emissive map
    cm.emissiveIntensity = night ? 1.15 : 0;

    if (T._mesh) T._mesh.visible = night;
  };

  T.toggle = function () { T.apply(T.mode === 'day' ? 'night' : 'day'); return T.mode; };

  RR.Theme = T;
})();

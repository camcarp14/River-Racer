/* River Racer — day / night theming. Swaps lights, fog, sky, water colours, the
   buildings' lit-window glow and the street-lamp lights. Toggle with N. */
(function () {
  const T = { mode: 'day', lamps: [], _mesh: null, greenRiver: false };
  // St. Patrick's Day dye — vivid emerald, applied to the river uniforms only (the lake stays blue)
  const GREEN_DEEP = 0x0a5c2a, GREEN_SHALLOW = 0x14b34a;

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

  const PRESETS = {
    day: {
      sun: 0xffdcae, sunI: 1.55, hemi: 0xcfe3f0, hemiG: 0x44505c, hemiI: 0.68, exposure: 0.95,
      fog: 0xd8c9a8, fogNear: 900, fogFar: 4200, night: 0, emissive: 0, fireworks: false, lamps: false,
      sky: { zenith: 0x2e6a9e, mid: 0x9fc4d8, horizon: 0xffd9a0, west: 0xffb35c },
      water: { deepR: 0x1e4d43, shalR: 0x3e7d68, deepL: 0x14496b, shalL: 0x2e7d9e, skyLo: 0xffd9a0, skyHi: 0x74a9c9, fog: 0xd8c9a8 },
    },
    sunset: {
      sun: 0xff9a54, sunI: 1.7, hemi: 0xf0b488, hemiG: 0x5a4238, hemiI: 0.85, exposure: 1.2,
      fog: 0xecb182, fogNear: 850, fogFar: 4200, night: 0, emissive: 0.4, fireworks: false, lamps: true,
      sky: { zenith: 0x3a4674, mid: 0xcf847a, horizon: 0xff8438, west: 0xff5230 },
      water: { deepR: 0x35474c, shalR: 0x7a7658, deepL: 0x354458, shalL: 0x88745e, skyLo: 0xffa856, skyHi: 0x9a6478, fog: 0xecb182 },
    },
    night: {
      sun: 0x9fb2dc, sunI: 0.5, hemi: 0x27324c, hemiG: 0x0d121c, hemiI: 0.4, exposure: 1.35,
      fog: 0x0a1120, fogNear: 650, fogFar: 3500, night: 1, emissive: 1.15, fireworks: true, lamps: true,
      sky: { zenith: 0x2e6a9e, mid: 0x9fc4d8, horizon: 0xffd9a0, west: 0xffb35c },
      water: { deepR: 0x081820, shalR: 0x123038, deepL: 0x06111d, shalL: 0x102838, skyLo: 0x1c2740, skyHi: 0x080f1c, fog: 0x0a1120 },
    },
  };
  const ORDER = ['day', 'sunset', 'night'];

  T.apply = function (mode) {
    const P = PRESETS[mode] || PRESETS.day;
    T.mode = mode;
    const E = RR.Engine;
    E.sun.color.setHex(P.sun); E.sun.intensity = P.sunI;
    E.hemi.color.setHex(P.hemi); E.hemi.groundColor.setHex(P.hemiG); E.hemi.intensity = P.hemiI;
    E.renderer.toneMappingExposure = P.exposure;
    E.scene.fog.color.setHex(P.fog); E.scene.fog.near = P.fogNear; E.scene.fog.far = P.fogFar;

    if (RR.Sky && RR.Sky.mat) {
      const u = RR.Sky.mat.uniforms;
      u.cZenith.value.setHex(P.sky.zenith); u.cMid.value.setHex(P.sky.mid);
      u.cHorizon.value.setHex(P.sky.horizon); u.cWest.value.setHex(P.sky.west);
      if (RR.Sky.setNight) RR.Sky.setNight(P.night);
    }

    if (RR.Water && RR.Water.material) {
      const u = RR.Water.material.uniforms, c = P.water;
      u.uDeepRiver.value.setHex(c.deepR); u.uShallowRiver.value.setHex(c.shalR);
      u.uDeepLake.value.setHex(c.deepL); u.uShallowLake.value.setHex(c.shalL);
      u.uSkyLow.value.setHex(c.skyLo); u.uSkyHigh.value.setHex(c.skyHi);
      u.uFogColor.value.setHex(c.fog);
    }

    RR.City.material().emissiveIntensity = P.emissive;
    if (T._mesh) T._mesh.visible = P.lamps;
    if (RR.Fireworks) RR.Fireworks.setActive(P.fireworks);

    // re-apply the St. Patrick's Day dye last so it survives every day/sunset/night switch
    if (T.greenRiver && RR.Water && RR.Water.material) {
      const u = RR.Water.material.uniforms;
      const dim = mode === 'night' ? 0.45 : 1;
      u.uDeepRiver.value.setHex(GREEN_DEEP).multiplyScalar(dim);
      u.uShallowRiver.value.setHex(GREEN_SHALLOW).multiplyScalar(dim);
    }
  };

  T.toggle = function () {
    const i = (ORDER.indexOf(T.mode) + 1) % ORDER.length;
    T.apply(ORDER[i]);
    return T.mode;
  };

  T.toggleGreenRiver = function () {
    T.greenRiver = !T.greenRiver;
    T.apply(T.mode);
    return T.greenRiver;
  };

  RR.Theme = T;
})();

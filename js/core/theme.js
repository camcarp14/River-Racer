/* River Racer — day / night theming. Swaps lights, fog, sky, water colours, the
   buildings' lit-window glow and the street-lamp lights. Toggle with N. */
(function () {
  const T = { mode: 'day', lamps: [], _mesh: null, greenRiver: false };
  // St. Patrick's Day dye — the real fluorescein kelly green the boats lay down every March
  const GREEN_DEEP = 0x00A651, GREEN_SHALLOW = 0x17B169;

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

  // A compass bearing t (deg clockwise from north) at altitude a is (sin t cos a, sin a, -cos t cos a).
  // Every sunDir below sits in the SOUTHERN half of the sky except night, where the moon rises
  // over the lake ahead of you and lays its glitter path on the water you are driving into.
  const PRESETS = {
    day: {
      sunDir: [-0.5668, 0.6947, 0.4429], skyDir: [-0.5668, 0.6947, 0.4429],
      sunDist: 1400, shadowHalf: 360, shadowFar: 3400, shadows: true,
      sun: 0xffeed8, sunI: 1.85,
      fillDir: [0.5567, 0.5000, -0.6634], fill: 0x8fb4d8, fillI: 0.34,
      bounce: 0x6f8f72, bounceI: 0.22,
      hemi: 0xa8c8e8, hemiG: 0x6e6a60, hemiI: 0.95,
      exposure: 0.88,
      fog: 0xc3d2dd, fogNear: 520, fogFar: 3900,
      night: 0, emissive: 0, fireworks: false, lamps: false,
      sky: { zenith: 0x2f6fb8, mid: 0x8db8dc, horizon: 0xd3e0e8, west: 0xf2e2c6 },
      cloud: { cover: 0.42, lit: 0xfbfbf8, shade: 0xb7c2cc, opacity: 0.85 },
      bloom: { threshold: 0.80, strength: 0.55 },
      grade: { lift: [0.020, 0.026, 0.036], gamma: [0.98, 1.00, 1.02], gain: [1.03, 1.01, 0.99], sat: 1.06, vignette: 0.30 },
      sunGlitter: 0xffe9c8,
      water: { deepR: 0x2b3a34, shalR: 0x5e7a64, deepL: 0x0f3559, shalL: 0x2e8a99,
               skyLo: 0xd3e0e8, skyHi: 0x4e86bd, fog: 0xc3d2dd, refl: 0.62 },
    },
    sunset: {
      sunDir: [-0.8553, 0.1564, -0.4938], skyDir: [-0.8553, 0.1564, -0.4938],
      sunDist: 1900, shadowHalf: 460, shadowFar: 4400, shadows: true,
      sun: 0xff9142, sunI: 2.60,
      fillDir: [0.8517, 0.4226, 0.3100], fill: 0x5878a8, fillI: 0.42,
      bounce: 0x8a5a3a, bounceI: 0.18,
      hemi: 0xf2b48a, hemiG: 0x4a3f3a, hemiI: 0.75,
      exposure: 1.10,
      fog: 0xe8a978, fogNear: 420, fogFar: 3600,
      night: 0, emissive: 0.45, fireworks: false, lamps: true,
      sky: { zenith: 0x1e3a6e, mid: 0x7a6f96, horizon: 0xff9a3c, west: 0xff5a26 },
      cloud: { cover: 0.50, lit: 0xffb072, shade: 0x6a5878, opacity: 0.90 },
      bloom: { threshold: 0.66, strength: 1.05 },
      grade: { lift: [0.030, 0.020, 0.030], gamma: [1.02, 1.00, 0.98], gain: [1.06, 1.00, 0.96], sat: 1.12, vignette: 0.36 },
      sunGlitter: 0xff7a2e,
      // Lake Michigan at a low sun is INDIGO AND COPPER, never warm grey: the body of the water
      // is deep blue and every wave face that tilts toward the sun mirrors the burning horizon.
      // The old shalL (0x7a6a5e) was a desaturated putty and it owned 60% of the frame.
      water: { deepR: 0x2a3630, shalR: 0x6b6a4e, deepL: 0x121f4a, shalL: 0x2d3a72,
               skyLo: 0xff9a4a, skyHi: 0x43497f, fog: 0xef8f4e, refl: 0.80 },
    },
    // blue hour: the only state where the sky is still readable AND every window, lamp and
    // navigation light is lit. skyDir is BELOW the horizon while the key light still rims west faces.
    dusk: {
      sunDir: [-0.8355, 0.0872, -0.5425], skyDir: [-0.8371, -0.0610, -0.5436],
      sunDist: 1900, shadowHalf: 460, shadowFar: 4400, shadows: false,
      sun: 0xff9d6a, sunI: 0.42,
      fillDir: [0.8068, 0.5736, 0.1422], fill: 0x3f5f96, fillI: 0.30,
      bounce: 0x2a4a5a, bounceI: 0.14,
      hemi: 0x4a6ea8, hemiG: 0x2a3040, hemiI: 1.15,
      exposure: 1.30,
      fog: 0x2e4870, fogNear: 380, fogFar: 3200,
      night: 0.45, emissive: 0.85, fireworks: false, lamps: true,
      sky: { zenith: 0x10214a, mid: 0x27417a, horizon: 0x7a5f8e, west: 0xd4744e },
      cloud: { cover: 0.38, lit: 0x9a7f9e, shade: 0x2a3a62, opacity: 0.75 },
      bloom: { threshold: 0.58, strength: 1.20 },
      grade: { lift: [0.030, 0.036, 0.058], gamma: [1.05, 1.02, 0.96], gain: [0.98, 1.00, 1.08], sat: 1.10, vignette: 0.40 },
      sunGlitter: 0xffb07a,
      water: { deepR: 0x16232c, shalR: 0x2b4048, deepL: 0x091a3e, shalL: 0x1b3a6e,
               skyLo: 0x8f6382, skyHi: 0x141f52, fog: 0x2e4870, refl: 0.88 },
    },
    night: {
      sunDir: [0.5868, 0.6428, 0.4925], skyDir: [0.5868, 0.6428, 0.4925],   // this is the MOON
      sunDist: 1500, shadowHalf: 380, shadowFar: 3600, shadows: true,
      sun: 0xaebfe0, sunI: 0.62,
      fillDir: [-0.8830, 0.3420, -0.3214], fill: 0x3a2f28, fillI: 0.30,     // sodium city glow from the west
      bounce: 0x253844, bounceI: 0.16,
      hemi: 0x1e2c4a, hemiG: 0x1a1a20, hemiI: 0.55,
      exposure: 1.45,
      fog: 0x0d1626, fogNear: 400, fogFar: 3000,
      night: 1, emissive: 1.35, fireworks: true, lamps: true,
      sky: { zenith: 0x2f6fb8, mid: 0x8db8dc, horizon: 0xd3e0e8, west: 0xf2e2c6 },
      nsky: { zenith: 0x04091a, mid: 0x0c1730, nHorizon: 0x2a3348 },
      cloud: { cover: 0.20, lit: 0x2a3348, shade: 0x0a1020, opacity: 0.45 },
      bloom: { threshold: 0.50, strength: 1.45 },
      grade: { lift: [0.016, 0.020, 0.034], gamma: [1.06, 1.03, 0.96], gain: [0.96, 0.99, 1.10], sat: 1.12, vignette: 0.44 },
      sunGlitter: 0xcfdcff,
      water: { deepR: 0x0a1418, shalR: 0x14262a, deepL: 0x050e18, shalL: 0x0e2230,
               skyLo: 0x16223a, skyHi: 0x070d1a, fog: 0x0d1626, refl: 0.92 },
    },
  };
  const ORDER = ['day', 'sunset', 'dusk', 'night'];

  T.apply = function (mode) {
    const P = PRESETS[mode] || PRESETS.day;
    T.mode = mode;
    const E = RR.Engine;
    E.sun.color.setHex(P.sun); E.sun.intensity = P.sunI;
    E.hemi.color.setHex(P.hemi); E.hemi.groundColor.setHex(P.hemiG); E.hemi.intensity = P.hemiI;
    E.renderer.toneMappingExposure = P.exposure;
    E.scene.fog.color.setHex(P.fog); E.scene.fog.near = P.fogNear; E.scene.fog.far = P.fogFar;

    // one source of truth for the key light; trackShadow() rebuilds every position from these
    E.sunDir.set(P.sunDir[0], P.sunDir[1], P.sunDir[2]).normalize();
    E.sunDist = P.sunDist;
    E.fillDir.set(P.fillDir[0], P.fillDir[1], P.fillDir[2]).normalize();
    E.fill.color.setHex(P.fill); E.fill.intensity = P.fillI;
    E.bounce.color.setHex(P.bounce); E.bounce.intensity = P.bounceI;
    E.wantShadows = P.shadows;                 // dusk light is too grazing to be worth the map
    E.sun.castShadow = P.shadows && E.renderer.shadowMap.enabled;
    const sc = E.sun.shadow.camera;
    sc.left = -P.shadowHalf; sc.right = P.shadowHalf;
    sc.top = P.shadowHalf; sc.bottom = -P.shadowHalf;
    sc.far = P.shadowFar;
    sc.updateProjectionMatrix();
    E.trackShadow(E.sun.target.position.x, E.sun.target.position.z);

    if (RR.Sky && RR.Sky.mat) {
      const u = RR.Sky.mat.uniforms;
      u.cZenith.value.setHex(P.sky.zenith); u.cMid.value.setHex(P.sky.mid);
      u.cHorizon.value.setHex(P.sky.horizon); u.cWest.value.setHex(P.sky.west);
      const ns = P.nsky || PRESETS.night.nsky;
      if (u.nZenith) u.nZenith.value.setHex(ns.zenith);
      if (u.nMid) u.nMid.value.setHex(ns.mid);
      if (u.nHorizon) u.nHorizon.value.setHex(ns.nHorizon);
      // the sky's disc is NOT the key-light direction at dusk — the sun has already set
      if (u.sunDir) u.sunDir.value.set(P.skyDir[0], P.skyDir[1], P.skyDir[2]).normalize();
      if (u.uCloudCover) u.uCloudCover.value = P.cloud.cover;
      if (u.uCloudLit) u.uCloudLit.value.setHex(P.cloud.lit);
      if (u.uCloudShade) u.uCloudShade.value.setHex(P.cloud.shade);
      if (u.uCloudOpacity) u.uCloudOpacity.value = P.cloud.opacity;
      if (RR.Sky.setNight) RR.Sky.setNight(P.night);
    }

    if (RR.Water && RR.Water.material) {
      const u = RR.Water.material.uniforms, c = P.water;
      u.uDeepRiver.value.setHex(c.deepR); u.uShallowRiver.value.setHex(c.shalR);
      u.uDeepLake.value.setHex(c.deepL); u.uShallowLake.value.setHex(c.shalL);
      u.uSkyLow.value.setHex(c.skyLo); u.uSkyHigh.value.setHex(c.skyHi);
      u.uFogColor.value.setHex(c.fog);
      u.uFogNear.value = P.fogNear; u.uFogFar.value = P.fogFar;
      u.uSunDir.value.copy(E.sunDir);
      if (u.uSunColor) u.uSunColor.value.setHex(P.sunGlitter);
    }
    if (RR.Reflect) RR.Reflect.strength = P.water.refl;

    if (RR.Post) { if (RR.Post.setBloom) RR.Post.setBloom(P.bloom); if (RR.Post.setGrade) RR.Post.setGrade(P.grade); }

    // W2 buckets the city into ten facade families; each carries its own night-window density,
    // so the emissive multiplier is per-material. Falls back to the single legacy material.
    const mats = (RR.City.materials ? RR.City.materials() : [RR.City.material()]);
    for (const m of mats) m.emissiveIntensity = P.emissive * ((m.userData && m.userData.nightMul) || 1);
    if (T._mesh) T._mesh.visible = P.lamps;
    if (RR.Fireworks) RR.Fireworks.setActive(P.fireworks);

    // re-apply the St. Patrick's Day dye last so it survives every day/sunset/dusk/night switch
    if (T.greenRiver && RR.Water && RR.Water.material) {
      const u = RR.Water.material.uniforms;
      const dim = P.night > 0.5 ? 0.45 : 1;
      u.uDeepRiver.value.setHex(GREEN_DEEP).multiplyScalar(dim);
      u.uShallowRiver.value.setHex(GREEN_SHALLOW).multiplyScalar(dim);
      // the dye reads flatter and more opaque than clean water — every photograph shows it
      if (u.uFoamTint) u.uFoamTint.value.setRGB(0.81, 0.93, 0.85);
      if (RR.Reflect) RR.Reflect.strength = P.water.refl * 0.55;
    } else if (RR.Water && RR.Water.material) {
      const u = RR.Water.material.uniforms;
      if (u.uFoamTint) u.uFoamTint.value.setRGB(0.84, 0.86, 0.80);
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

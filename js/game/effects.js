/* River Racer — wakes, spray, splashes, boost flames, gulls */
(function () {
  const FX = {};
  const U = () => RR.U;

  // ---------- wake ribbons: per-boat fading foam trail ----------
  const WAKE_SEGS = 56;
  function createWake(scene) {
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array(WAKE_SEGS * 2 * 3);
    const alpha = new Float32Array(WAKE_SEGS * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
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
        varying float vA;
        varying vec2 vP;
        void main() { vA = aAlpha; vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uTime;
        varying float vA;
        varying vec2 vP;
        void main() {
          float n = sin(vP.x * 3.1 + uTime * 2.0) * sin(vP.y * 2.7 - uTime * 1.7);
          float a = vA * (0.42 + 0.18 * n);
          gl_FragColor = vec4(0.88, 0.95, 0.97, a);
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    mesh.layers.set(1);              // skip in the reflection pass
    scene.add(mesh);
    return { mesh, geo, pts: [], mat };
  }

  function updateWake(w, boat, dt, t) {
    const speed = Math.hypot(boat.vel.x, boat.vel.z);
    // drop a segment roughly every 2.2m of travel
    const last = w.pts[w.pts.length - 1];
    const need = !last || U().dist2(boat.pos.x, boat.pos.z, last.x, last.z) > 4.8;
    if (need && !boat.airborne) {
      const s = Math.sin(boat.heading), c = Math.cos(boat.heading);
      w.pts.push({ x: boat.pos.x - s * boat.radius * 0.8, z: boat.pos.z - c * boat.radius * 0.8, px: c, pz: -s, born: t, str: U().clamp(speed / 22, 0.12, 1) });
      if (w.pts.length > WAKE_SEGS) w.pts.shift();
    }
    const verts = w.geo.attributes.position.array;
    const alpha = w.geo.attributes.aAlpha.array;
    const n = w.pts.length;
    for (let i = 0; i < WAKE_SEGS; i++) {
      const p = w.pts[Math.min(i, n - 1)] || { x: boat.pos.x, z: boat.pos.z, px: 1, pz: 0, born: t, str: 0 };
      const age = t - p.born;
      const width = (0.7 + age * 1.35) * (0.65 + p.str * 0.7);
      const fade = Math.max(0, p.str * 0.6 * (1 - age / 2.4));
      const y = U().waterHeight(p.x, p.z, t, RR.River.waveAmp(p.x, p.z)) + 0.06;
      const o = i * 6;
      verts[o] = p.x + p.px * width; verts[o + 1] = y; verts[o + 2] = p.z + p.pz * width;
      verts[o + 3] = p.x - p.px * width; verts[o + 4] = y; verts[o + 5] = p.z - p.pz * width;
      alpha[i * 2] = alpha[i * 2 + 1] = i >= n ? 0 : fade;
    }
    w.geo.attributes.position.needsUpdate = true;
    w.geo.attributes.aAlpha.needsUpdate = true;
    w.mat.uniforms.uTime.value = t;
  }

  // ---------- spray particles: one shared points cloud ----------
  const MAXP = 900;
  let pGeo, pPts, pool, poolIdx = 0;
  function initParticles(scene) {
    pGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(MAXP * 3);
    const attr = new Float32Array(MAXP * 3);       // vx spare: [size, born, life]
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    pool = [];
    // g = gravity multiplier: 1 for water spray, 0 for the weightless speed streaks
    for (let i = 0; i < MAXP; i++) pool.push({ x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, life: 0, age: 99, size: 1, g: 1 });
    const tex = U().canvasTexture(64, 64, (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.5, 'rgba(235,245,250,0.5)');
      g.addColorStop(1, 'rgba(235,245,250,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    });
    const mat = new THREE.PointsMaterial({ size: 1.6, map: tex, transparent: true, depthWrite: false, opacity: 0.85, sizeAttenuation: true });
    pPts = new THREE.Points(pGeo, mat);
    pPts.frustumCulled = false;
    pPts.renderOrder = 3;
    pPts.layers.set(1);
    scene.add(pPts);
  }

  FX.spray = function (x, y, z, vx, vy, vz, count, spread, size) {
    for (let i = 0; i < count; i++) {
      const p = pool[poolIdx]; poolIdx = (poolIdx + 1) % MAXP;
      p.x = x; p.y = y; p.z = z;
      p.vx = vx + (Math.random() - 0.5) * spread;
      p.vy = vy + Math.random() * spread * 0.7;
      p.vz = vz + (Math.random() - 0.5) * spread;
      p.life = 0.5 + Math.random() * 0.5;
      p.age = 0;
      p.size = size || 1;
      p.g = 1;
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
      p.life = 0.30; p.age = 0; p.size = 0.6; p.g = 0;
    }
  }

  function updateParticles(dt) {
    const pos = pGeo.attributes.position.array;
    for (let i = 0; i < MAXP; i++) {
      const p = pool[i];
      if (p.age < p.life) {
        p.age += dt;
        p.vy -= 13 * p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < -0.2) p.age = p.life;
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      } else {
        pos[i * 3 + 1] = -50;
      }
    }
    pGeo.attributes.position.needsUpdate = true;
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
          1, 1.5 + wash, 1.1);
      }
      return;
    }
    if (fire(boat, 'hull', 24 * intensity * near, dt)) {
      const side = Math.random() < 0.5 ? -1 : 1;
      FX.spray(
        boat.pos.x + s * boat.radius * 0.5 + c * side * boat.radius * 0.55,
        boat.pos.y + 0.15,
        boat.pos.z + c * boat.radius * 0.5 - s * side * boat.radius * 0.55,
        boat.vel.x * 0.35 + c * side * (2 + intensity * 5),
        1.6 + intensity * 2.6,
        boat.vel.z * 0.35 - s * side * (2 + intensity * 5),
        2, 1.6, 1);
    }
    // boost: a rooster tail off the stern so the burn is unmistakable. It is thrown WIDE, not
    // straight up, because straight up is exactly where the chase camera is looking.
    if (boat.boostHeat > 0.4 && speed > 8 && fire(boat, 'boost', 18 * near, dt)) {
      const side = Math.random() < 0.5 ? -1 : 1;
      FX.spray(
        boat.pos.x - s * boat.radius * 1.3 + c * side * boat.radius * 0.5,
        boat.pos.y + 0.25,
        boat.pos.z - c * boat.radius * 1.3 - s * side * boat.radius * 0.5,
        -boat.vel.x * 0.34 + c * side * 3.5, 3.4 + intensity * 3.4, -boat.vel.z * 0.34 - s * side * 3.5,
        2, 3.0, 1.8);
    }
    // hard turns throw a rooster fan
    if (Math.abs(boat.visRoll) > 0.18 && speed > 12 && fire(boat, 'turn', 26 * near, dt)) {
      const side = Math.sign(boat.visRoll);
      FX.spray(
        boat.pos.x - s * boat.radius * 0.6 + c * side * boat.radius * 0.7,
        boat.pos.y + 0.2,
        boat.pos.z - c * boat.radius * 0.6 - s * side * boat.radius * 0.7,
        boat.vel.x * 0.25 + c * side * (5 + intensity * 8),
        2.8 + intensity * 3.4,
        boat.vel.z * 0.25 - s * side * (5 + intensity * 8),
        3, 2.6, 1.4);
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
    FX.spray(x, y + 0.2, z, 0, 3.5 + intensity * 5, 0, Math.floor(12 + intensity * 26), 4.5 + intensity * 3, 1.6);
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
    const w = boat.water;
    if (!w) return;
    if (!fire(boat, 'scrape', boat.isPlayer ? 16 : 8, dt)) return;
    // spray peels off the quay on the side the hull is riding
    const px = boat.pos.x - w.nx * (boat.radius * 0.8), pz = boat.pos.z - w.nz * (boat.radius * 0.8);
    FX.spray(px, boat.pos.y + 0.25, pz, -w.nx * 4 + boat.vel.x * 0.25, 2.2, -w.nz * 4 + boat.vel.z * 0.25, 2, 2.2, 1.1);
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

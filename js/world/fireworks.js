/* River Racer — fireworks over Navy Pier at night. Additive particle rockets that
   arc up from the pier and burst into colored peonies, reflected on the dark water. */
(function () {
  const F = { active: false };
  const MAX = 2600;
  let geo, pts, pool = [], idx = 0, launchT = 1.2, bases = [];
  const COLORS = [
    [1.0, 0.32, 0.34], [1.0, 0.82, 0.30], [0.42, 1.0, 0.55], [0.42, 0.72, 1.0],
    [0.90, 0.50, 1.0], [1.0, 1.0, 1.0], [1.0, 0.55, 0.22], [0.4, 1.0, 0.95],
  ];

  function alloc() { const p = pool[idx]; idx = (idx + 1) % MAX; return p; }

  function rocket() {
    const base = bases[(Math.random() * bases.length) | 0];
    const c = COLORS[(Math.random() * COLORS.length) | 0];
    const p = alloc();
    p.kind = 0;
    p.x = base.x + (Math.random() - 0.5) * 60; p.y = 3; p.z = base.z + (Math.random() - 0.5) * 60;
    p.vx = (Math.random() - 0.5) * 5; p.vz = (Math.random() - 0.5) * 5; p.vy = 40 + Math.random() * 16;
    p.age = 0; p.life = 1.7 + Math.random() * 0.7; p.r = c[0]; p.g = c[1]; p.b = c[2];
  }
  function burst(x, y, z, c) {
    const n = 110 + (Math.random() * 80 | 0);
    const spd = 15 + Math.random() * 11;
    const ring = Math.random() < 0.35;                 // some bursts are flat rings
    for (let i = 0; i < n; i++) {
      const p = alloc();
      let dx, dy, dz;
      if (ring) { const th = Math.random() * Math.PI * 2; dx = Math.cos(th); dy = (Math.random() - 0.5) * 0.25; dz = Math.sin(th); }
      else { const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u); dx = r * Math.cos(th); dy = u; dz = r * Math.sin(th); }
      const s = spd * (0.55 + Math.random() * 0.6);
      p.kind = 1; p.x = x; p.y = y; p.z = z;
      p.vx = dx * s; p.vy = dy * s + 2.5; p.vz = dz * s;
      p.age = 0; p.life = 1.4 + Math.random() * 1.2;
      p.r = c[0]; p.g = c[1]; p.b = c[2];
    }
  }

  F.setActive = function (on) { F.active = on; };

  // fire one burst immediately at a point, regardless of the night-only flag.
  // colorArrOrNull: [r,g,b] 0..1 or null for a random palette color. No-op before init.
  F.burstAt = function (x, y, z, colorArrOrNull) {
    if (!geo) return;
    burst(x, y, z, colorArrOrNull || COLORS[(Math.random() * COLORS.length) | 0]);
  };

  // ---- THE FINISH ----------------------------------------------------------------------------
  // A win is an event. The Navy Pier week clock and the night-only flag do not apply here: this
  // is a scripted show over wherever the boat stopped, queued on the SCALED clock so it runs long
  // with the rest of RR.Feel's finale instead of racing past it.
  const CHI = [[0.31, 0.69, 0.91], [0.95, 0.96, 0.97], [0.85, 0.14, 0.16]];   // the city flag
  const sched = [];
  let schedT = 0, wasFin = false;

  F.finale = function (x, z, big) {
    if (!geo) return;
    sched.length = 0; schedT = 0;
    const n = big ? 11 : 4;
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996;                          // golden angle: no two shells stack up
      const r = 30 + (i % 4) * 24;
      sched.push({
        t: 0.15 + i * (big ? 0.40 : 0.60),
        x: x + Math.cos(a) * r, y: 40 + (i % 3) * 15, z: z + Math.sin(a) * r,
        c: (big && i % 4 === 3) ? null : CHI[i % 3],
      });
    }
  };

  // 1-based finishing position of the player, or 0 if there is no result yet.
  function placeOfPlayer() {
    const S = RR.Race && RR.Race.state && RR.Race.state();
    if (!S || !S.results) return 0;
    for (let i = 0; i < S.results.length; i++) if (S.results[i].boat && S.results[i].boat.isPlayer) return i + 1;
    return 0;
  }

  F.init = function () {
    const np = window.CHICAGO.lake.navyPier;
    bases = [
      { x: np.tip.x - 30, z: np.tip.z - 30 },
      { x: np.tip.x + 40, z: np.tip.z + 20 },
      { x: (np.root.x + np.tip.x) / 2, z: np.tip.z - 90 },
      { x: np.tip.x + 90, z: np.tip.z - 40 },
    ];
    for (let i = 0; i < MAX; i++) pool.push({ kind: 1, x: 0, y: -1000, z: 0, vx: 0, vy: 0, vz: 0, age: 9, life: 0, r: 0, g: 0, b: 0 });
    const posA = new Float32Array(MAX * 3), colA = new Float32Array(MAX * 3);
    for (let i = 0; i < MAX; i++) posA[i * 3 + 1] = -1000;
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posA, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(colA, 3).setUsage(THREE.DynamicDrawUsage));
    const tex = RR.U.canvasTexture(64, 64, (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    });
    pts = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 3.4, map: tex, vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    pts.frustumCulled = false; pts.renderOrder = 4;
    RR.Engine.scene.add(pts);
  };

  // Navy Pier does not fire continuously all summer: it is Wednesdays at 9:30 pm and Saturdays
  // at 10:15 pm, Memorial Day through Labor Day. One game "week" is compressed to 210 s so a
  // player still sees a show, but the pattern — a short midweek display and a long Saturday one
  // — is the real one, and the sky is quiet in between.
  const WEEK = 210;
  const SHOWS = [[0.30, 22, 0.75], [0.78, 34, 1.0]];   // [phase, seconds, intensity]
  let weekT = 0.30 * WEEK - 6;                          // start just before the Wednesday show
  F.showing = 0;

  F.update = function (dt) {
    if (!geo) return;
    if (F.active) {
      weekT = (weekT + dt) % WEEK;
      let intensity = 0;
      for (const sh of SHOWS) {
        const t0 = sh[0] * WEEK;
        if (weekT >= t0 && weekT < t0 + sh[1]) {
          const into = weekT - t0;
          intensity = sh[2] * Math.min(1, into / 2.5) * Math.min(1, (sh[1] - into) / 3.5);
        }
      }
      F.showing = intensity;
      if (intensity > 0.02) {
        launchT -= dt * (0.6 + intensity);
        if (launchT <= 0) {
          rocket();
          if (Math.random() < 0.6 * intensity) rocket();
          if (Math.random() < 0.3 * intensity) rocket();
          launchT = 0.35 + Math.random() * 1.2 / Math.max(0.25, intensity);
        }
      }
    } else F.showing = 0;

    // self-arming off RR.Feel, so a win needs no line in main.js and degrades to nothing if the
    // finale module never lands
    const fin = !!(RR.Feel && RR.Feel.finishing && RR.Feel.finishing());
    if (fin && !wasFin) {
      const S = RR.Race && RR.Race.state && RR.Race.state();
      const p = S && S.player && S.player.pos;
      if (p && placeOfPlayer() === 1) F.finale(p.x, p.z, true);
    }
    wasFin = fin;
    if (sched.length) {
      schedT += dt;
      while (sched.length && sched[0].t <= schedT) {
        const s = sched.shift();
        burst(s.x, s.y, s.z, s.c || COLORS[(Math.random() * COLORS.length) | 0]);
        // requested of the audio workstream, guarded: a shell you can see and not hear is a
        // screensaver. Silent until doFireworkReport exists.
        if (RR.Audio && RR.Audio.fireworkReport) RR.Audio.fireworkReport(s.x, s.z);
      }
    }

    const pos = geo.attributes.position.array, col = geo.attributes.color.array;
    for (let i = 0; i < MAX; i++) {
      const p = pool[i];
      if (p.age < p.life) {
        p.age += dt;
        p.vy -= 9.2 * dt;
        if (p.kind === 1) { const dr = Math.exp(-0.85 * dt); p.vx *= dr; p.vy *= dr; p.vz *= dr; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.kind === 0 && p.age >= p.life) { burst(p.x, p.y, p.z, [p.r, p.g, p.b]); p.age = p.life + 1; pos[i * 3 + 1] = -1000; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; }
        const fade = p.kind === 1 ? Math.max(0, 1 - p.age / p.life) : 1;
        const tw = p.kind === 1 ? (0.68 + 0.32 * Math.sin(p.age * 42 + i)) : 1.4;   // spark twinkle, bright rocket
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        col[i * 3] = p.r * fade * tw; col[i * 3 + 1] = p.g * fade * tw; col[i * 3 + 2] = p.b * fade * tw;
      } else {
        pos[i * 3 + 1] = -1000; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };

  RR.Fireworks = F;
})();

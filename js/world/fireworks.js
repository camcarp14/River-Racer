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

  F.update = function (dt) {
    if (!geo) return;
    if (F.active) {
      launchT -= dt;
      if (launchT <= 0) { rocket(); if (Math.random() < 0.6) rocket(); if (Math.random() < 0.3) rocket(); launchT = 0.5 + Math.random() * 1.4; }
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

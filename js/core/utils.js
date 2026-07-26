/* River Racer — shared utilities. Global namespace: RR */
window.RR = window.RR || {};

(function () {
  const U = {};

  U.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smoothstep = (a, b, x) => { const t = U.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // frame-rate independent exponential approach
  U.damp = (cur, target, rate, dt) => U.lerp(cur, target, 1 - Math.exp(-rate * dt));
  U.wrapAngle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  U.dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };

  // deterministic RNG so the city looks identical every load
  U.mulberry = function (seed) {
    let s = seed >>> 0;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // ---- Water surface height (CPU mirror of the vertex shader — keep in sync with water.js) ----
  // amp: wave amplitude scale (river ~1, lake ~3.2)
  U.waterHeight = function (x, z, t, amp) {
    return amp * (
      0.055 * Math.sin(x * 0.11 + t * 1.35) +
      0.045 * Math.sin(z * 0.13 - t * 1.02 + x * 0.04) +
      0.032 * Math.sin((x + z) * 0.061 + t * 0.71) +
      0.022 * Math.sin(x * 0.23 - z * 0.17 + t * 2.1)
    );
  };
  // The long swell only — the first three terms, 46-73 m from crest to crest. The fourth term of
  // waterHeight is a ~27 m ripple: surface texture a hull straddles rather than a wave it can climb.
  U.swellHeight = function (x, z, t, amp) {
    return amp * (
      0.055 * Math.sin(x * 0.11 + t * 1.35) +
      0.045 * Math.sin(z * 0.13 - t * 1.02 + x * 0.04) +
      0.032 * Math.sin((x + z) * 0.061 + t * 0.71)
    );
  };
  // Attitude of a hull `len` metres long floating here. HEIGHT still comes from the full field —
  // that is what the vertex shader draws and the boat has to sit on it — but PITCH and ROLL come
  // from centred differences across the hull's own footprint, over the swell alone. Sampling the
  // full field 1.2 m apart measured the slope of the ripples instead, which on the lake (amp 3.3)
  // fed a ~1.4 Hz tremor straight into the boat's attitude.
  U.waterNormalPitchRoll = function (x, z, t, amp, out, len) {
    const e = (len > 0 ? len : 9) * 0.5;
    out.pitch = (U.swellHeight(x, z + e, t, amp) - U.swellHeight(x, z - e, t, amp)) / (2 * e); // slope along +z
    out.roll = (U.swellHeight(x + e, z, t, amp) - U.swellHeight(x - e, z, t, amp)) / (2 * e);  // slope along +x
    out.h = U.waterHeight(x, z, t, amp);
    return out;
  };

  // ---- Catmull-Rom resampling of [x,z,w] control points into dense arrays ----
  // returns { x:Float32Array, z:Float32Array, w:Float32Array, cum:Float32Array, len, n }
  U.resamplePath = function (pts, spacing) {
    spacing = spacing || 8;
    const P = (i) => pts[U.clamp(i, 0, pts.length - 1)];
    const cr = (p0, p1, p2, p3, t, k) => {
      const t2 = t * t, t3 = t2 * t;
      return 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t +
        (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
        (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
    };
    const raw = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const steps = Math.max(2, Math.ceil(segLen / spacing));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        raw.push([cr(p0, p1, p2, p3, t, 0), cr(p0, p1, p2, p3, t, 1), cr(p0, p1, p2, p3, t, 2)]);
      }
    }
    raw.push([...pts[pts.length - 1]]);
    const n = raw.length;
    const x = new Float32Array(n), z = new Float32Array(n), w = new Float32Array(n), cum = new Float32Array(n);
    let len = 0;
    for (let i = 0; i < n; i++) {
      x[i] = raw[i][0]; z[i] = raw[i][1]; w[i] = raw[i][2];
      if (i > 0) len += Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]);
      cum[i] = len;
    }
    return { x, z, w, cum, len, n };
  };

  // position/tangent at arc-length d along a resampled path
  U.pathAt = function (path, d, out) {
    out = out || {};
    d = U.clamp(d, 0, path.len);
    // binary search cum
    let lo = 0, hi = path.n - 1;
    while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (path.cum[mid] <= d) lo = mid; else hi = mid; }
    const span = Math.max(1e-6, path.cum[hi] - path.cum[lo]);
    const t = (d - path.cum[lo]) / span;
    out.x = U.lerp(path.x[lo], path.x[hi], t);
    out.z = U.lerp(path.z[lo], path.z[hi], t);
    out.w = U.lerp(path.w[lo], path.w[hi], t);
    const tx = path.x[hi] - path.x[lo], tz = path.z[hi] - path.z[lo];
    const tl = Math.max(1e-6, Math.hypot(tx, tz));
    out.tx = tx / tl; out.tz = tz / tl;
    out.d = d;
    return out;
  };

  // nearest point on path to (px,pz); hint = last known index for O(1) tracking
  U.pathNearest = function (path, px, pz, hint, searchRadius) {
    let best = Infinity, bi = 0;
    let lo = 0, hi = path.n - 2;
    if (hint != null && searchRadius) { lo = Math.max(0, hint - searchRadius); hi = Math.min(path.n - 2, hint + searchRadius); }
    for (let i = lo; i <= hi; i++) {
      const d = U.dist2(px, pz, path.x[i], path.z[i]);
      if (d < best) { best = d; bi = i; }
    }
    // project onto the two adjacent segments for sub-sample accuracy
    let res = { idx: bi, dist: Math.sqrt(best), d: path.cum[bi], x: path.x[bi], z: path.z[bi], w: path.w[bi], tx: 1, tz: 0 };
    for (let s = Math.max(0, bi - 1); s <= Math.min(path.n - 2, bi); s++) {
      const ax = path.x[s], az = path.z[s], bx = path.x[s + 1], bz = path.z[s + 1];
      const abx = bx - ax, abz = bz - az;
      const ab2 = abx * abx + abz * abz; if (ab2 < 1e-9) continue;
      let t = ((px - ax) * abx + (pz - az) * abz) / ab2;
      t = U.clamp(t, 0, 1);
      const qx = ax + abx * t, qz = az + abz * t;
      const dd = Math.hypot(px - qx, pz - qz);
      if (dd <= res.dist + 1e-9) {
        const seglen = Math.sqrt(ab2);
        res.dist = dd; res.idx = s;
        res.d = path.cum[s] + seglen * t;
        res.x = qx; res.z = qz;
        res.w = U.lerp(path.w[s], path.w[s + 1], t);
        res.tx = abx / seglen; res.tz = abz / seglen;
      }
    }
    return res;
  };

  // ---- Canvas texture helpers ----
  U.canvasTexture = function (w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  };

  U.formatTime = function (sec) {
    if (!isFinite(sec)) return '--:--.--';
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60), c = Math.floor((sec * 100) % 100);
    return m + ':' + String(s).padStart(2, '0') + '.' + String(c).padStart(2, '0');
  };
  U.ordinal = (n) => n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH';

  RR.U = U;
})();

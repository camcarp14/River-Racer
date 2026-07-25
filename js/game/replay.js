/* River Racer — one ring buffer serves both the time-trial ghost and the replay camera.
   20 Hz, 7 floats per sample (x, y, z, heading, visRoll, visPitch, speed). 5 minutes is
   6000 x 7 x 4 B = 168 KB in RAM; storage quantises to Int16 and base64s to ~30 KB per
   (course, hull), which fits localStorage comfortably.

   Fully self-contained: if sample() is never called, ghosts are simply absent — no error. */
(function () {
  const R = {};
  const U = () => RR.U;

  const HZ = 20;
  const STRIDE = 7;
  const MAX_SEC = 300;
  const CAP = HZ * MAX_SEC;

  let buf = null, count = 0, courseId = null, hullId = null, baseT = null;
  R.recording = false;
  R.ghost = null;                      // the active playback object, or null

  function ensure() { if (!buf) buf = new Float32Array(CAP * STRIDE); }

  // ---------- recording ----------
  R.begin = function (course, hull) {
    ensure();
    courseId = course == null ? null : String(course);
    hullId = hull == null ? null : String(hull);
    count = 0; baseT = null;
    R.recording = true;
  };

  // Called from main.js every frame; the clock gates it down to 20 Hz.
  // Sample INDEX has to mean elapsed seconds, because playAt() reads it as t * HZ. So the first
  // sample after begin() anchors the clock and every later slot is claimed by elapsed time — any
  // monotonic seconds clock works, and a client running below 20 fps records a ghost that still
  // plays back at the right pace instead of one sample per frame.
  R.sample = function (boat, t) {
    if (!R.recording || !boat) return;
    ensure();
    let idx = count;
    if (t != null) {
      if (baseT == null) baseT = t;
      idx = Math.floor((t - baseT) * HZ + 1e-6);
      if (idx < count) return;                      // this slot is already written
      // a stalled frame skipped slots: hold the last pose through the gap so index stays time
      while (count < idx && count > 0 && count < CAP) {
        const p = (count - 1) * STRIDE, g = count * STRIDE;
        for (let i = 0; i < STRIDE; i++) buf[g + i] = buf[p + i];
        count++;
      }
    }
    if (count >= CAP) return;                       // 5 minutes is already a very slow lap
    const o = count * STRIDE;
    buf[o] = boat.pos.x; buf[o + 1] = boat.pos.y; buf[o + 2] = boat.pos.z;
    buf[o + 3] = boat.heading; buf[o + 4] = boat.visRoll || 0; buf[o + 5] = boat.visPitch || 0;
    buf[o + 6] = Math.hypot(boat.vel.x, boat.vel.z);
    count++;
  };

  R.length = () => count;
  R.duration = () => count / HZ;

  // ---------- storage: Int16 quantised, base64'd ----------
  // Positions live in a +/-16 km world, so 0.5 m quantisation is 1 cm of visible ghost error at
  // the scale you ever see one. Angles get the full circle over the Int16 range.
  const PSCALE = 4;               // 1/4 m per unit -> +/- 8192 m
  function key(course, hull) { return 'rr_ghost_' + course + '_' + hull; }

  function encode(n) {
    const q = new Int16Array(n * STRIDE);
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      q[o] = U().clamp(Math.round(buf[o] * PSCALE), -32000, 32000);
      q[o + 1] = U().clamp(Math.round(buf[o + 1] * 100), -32000, 32000);
      q[o + 2] = U().clamp(Math.round(buf[o + 2] * PSCALE), -32000, 32000);
      q[o + 3] = Math.round(buf[o + 3] / Math.PI * 32000);
      q[o + 4] = U().clamp(Math.round(buf[o + 4] * 8000), -32000, 32000);
      q[o + 5] = U().clamp(Math.round(buf[o + 5] * 8000), -32000, 32000);
      q[o + 6] = U().clamp(Math.round(buf[o + 6] * 100), -32000, 32000);
    }
    const bytes = new Uint8Array(q.buffer);
    let s = '';
    for (let i = 0; i < bytes.length; i += 4096) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(bytes.length, i + 4096)));
    }
    return btoa(s);
  }

  function decode(b64) {
    const s = atob(b64);
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    const q = new Int16Array(bytes.buffer);
    const n = (q.length / STRIDE) | 0;
    const f = new Float32Array(n * STRIDE);
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      f[o] = q[o] / PSCALE; f[o + 1] = q[o + 1] / 100; f[o + 2] = q[o + 2] / PSCALE;
      f[o + 3] = q[o + 3] / 32000 * Math.PI;
      f[o + 4] = q[o + 4] / 8000; f[o + 5] = q[o + 5] / 8000; f[o + 6] = q[o + 6] / 100;
    }
    return { data: f, n, hz: HZ };
  }

  // Save if it beat the stored best. Returns true when a new ghost was written.
  R.commit = function (time) {
    R.recording = false;
    if (!buf || count < 4 || courseId == null || !isFinite(time)) return false;
    try {
      const k = key(courseId, hullId);
      const oldT = parseFloat(localStorage.getItem(k + '_t'));
      if (isFinite(oldT) && oldT <= time) return false;
      localStorage.setItem(k, encode(count));
      localStorage.setItem(k + '_t', String(time));
      return true;
    } catch (e) { return false; }     // storage may be unavailable from file:// — fine
  };
  R.finish = R.commit;               // stub-era alias

  R.bestTime = function (course, hull) {
    try { const v = parseFloat(localStorage.getItem(key(course, hull) + '_t')); return isFinite(v) ? v : null; }
    catch (e) { return null; }
  };

  // ---------- playback ----------
  R.ghost = null;
  R.load = function (course, hull) {
    try {
      const raw = localStorage.getItem(key(course, hull));
      if (!raw) return null;
      const g = decode(raw);
      g.time = R.bestTime(course, hull);
      return g.n > 1 ? g : null;
    } catch (e) { return null; }
  };
  R.loadGhost = R.load;              // stub-era alias

  const OUT = { x: 0, y: 0, z: 0, heading: 0, roll: 0, pitch: 0, speed: 0 };
  R.playAt = function (g, t, out) {
    out = out || OUT;
    if (!g || !g.n) return null;
    const f = U().clamp(t * g.hz, 0, g.n - 1);
    const i = Math.floor(f), j = Math.min(g.n - 1, i + 1), k = f - i;
    const a = i * STRIDE, b = j * STRIDE, d = g.data;
    out.x = U().lerp(d[a], d[b], k);
    out.y = U().lerp(d[a + 1], d[b + 1], k);
    out.z = U().lerp(d[a + 2], d[b + 2], k);
    out.heading = d[a + 3] + U().wrapAngle(d[b + 3] - d[a + 3]) * k;
    out.roll = U().lerp(d[a + 4], d[b + 4], k);
    out.pitch = U().lerp(d[a + 5], d[b + 5], k);
    out.speed = U().lerp(d[a + 6], d[b + 6], k);
    out.done = t >= g.n / g.hz;
    return out;
  };

  // route distance of the ghost at time t, for the HUD delta chip (nearest-sample, good enough
  // at 20 Hz — the chip only updates 4 times a second)
  R.progressAt = function (g, route, t) {
    if (!g || !route) return null;
    const p = R.playAt(g, t, OUT);
    if (!p) return null;
    const q = U().pathNearest(route, p.x, p.z, g._hint, g._hint != null ? 60 : 0);
    g._hint = q.idx;
    return q.d;
  };

  // ---------- ghost mesh ----------
  // Built from the normal boat builder, then made translucent and pushed onto layer 1 so it never
  // appears in the planar water reflection (a ghost reflection is confusing, not atmospheric).
  R.buildMesh = function (spec) {
    if (!RR.Boats || !RR.Boats.build) return null;
    const mesh = RR.Boats.build(spec);
    mesh.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.38;
      o.material.depthWrite = false;
      if (o.material.emissive) { o.material.emissive = new THREE.Color(0x7ec8e3); o.material.emissiveIntensity = 0.55; }
      o.castShadow = false; o.receiveShadow = false;
      o.layers.set(1);
    });
    mesh.layers.set(1);
    mesh.userData.noFlame = true;
    return mesh;
  };

  R.clear = function () { R.recording = false; count = 0; baseT = null; };

  RR.Replay = R;
})();

/* River Racer — feel: time dilation and the finish sequence.

   RR.Engine.timeScale already exists and every system honours it (engine.js:163); this module is
   the only thing allowed to drive it as a dramatic tool.

   Two rules make it safe to hand out to every other workstream:

   1. Every dilation lives on the WALL clock, not the sim clock, and carries its own return-to-1.0
      envelope. A dilation cannot outlive its own duration even if the race ends, the boat is
      deleted, or the caller never speaks again. There is no code path that leaves the game in
      slow motion.
   2. This module never owns timeScale outright — it multiplies whatever the rest of the game has
      set. Pause writes 0, photo mode writes 0.25, startRace writes 1; each of those is adopted as
      the new base and cancels any dilation in flight, because a global state change should never
      inherit a dramatic beat from the scene before it. */
(function () {
  const F = {};
  const U = () => RR.U;
  const wallNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  // ---- dilation ------------------------------------------------------------------------------
  // A fixed pool: overlapping calls compose by taking the STRONGEST (lowest) live scale rather
  // than fighting over one variable, and each entry eases itself back to 1.0 on the way out, so
  // the combined value is continuous even when a deep dilation expires under a shallow one.
  const SLOTS = 6;
  const HARD_CAP_MS = 1400;                  // nothing gets to slow the game for longer than this
  const slots = [];
  for (let i = 0; i < SLOTS; i++) slots.push({ t0: 0, t1: 0, scale: 1, rise: 0, fall: 0 });

  let base = 1, lastWrite = null, applied = 1;

  function sstep(e0, e1, x) {
    if (e1 <= e0) return x >= e1 ? 1 : 0;
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  }

  // scale < 1 slows the world. ms is the whole beat including its own ease in and out.
  F.dilate = function (scale, ms) {
    if (!RR.Engine) return;
    let s = +scale;
    if (!isFinite(s) || s >= 1) return;                    // 1.0 or nonsense: nothing to do
    s = Math.max(0.05, s);
    let dur = +ms;
    if (!isFinite(dur) || dur <= 0) dur = 200;
    dur = Math.min(HARD_CAP_MS, dur);
    push(s, dur, Math.min(70, dur * 0.18), dur * 0.45);
  };

  function push(s, dur, rise, fall) {
    const n = wallNow();
    // reuse the slot that expires soonest — a dead one if there is one, the weakest live one if not
    let k = 0, worst = Infinity;
    for (let i = 0; i < SLOTS; i++) {
      const sl = slots[i];
      const rank = sl.t1 <= n ? -1 : sl.t1;
      if (rank < worst) { worst = rank; k = i; }
    }
    const sl = slots[k];
    sl.t0 = n; sl.t1 = n + dur; sl.scale = s; sl.rise = rise; sl.fall = fall;
  }

  function combined(n) {
    let m = 1;
    for (let i = 0; i < SLOTS; i++) {
      const sl = slots[i];
      if (n >= sl.t1 || n < sl.t0) continue;
      const life = sl.t1 - sl.t0;
      const u = n - sl.t0;
      // rises from 1 into the scale, holds, then returns to exactly 1 at u = life
      const w = sstep(0, sl.rise, u) * (1 - sstep(life - sl.fall, life, u));
      const v = 1 + (sl.scale - 1) * w;
      if (v < m) m = v;
    }
    return m;
  }

  function clearSlots() { for (let i = 0; i < SLOTS; i++) slots[i].t1 = 0; }

  // Hand the clock back, now. Deliberately does NOT touch a finale in flight: a pending results
  // card is worth more than a clean clock, and the finale releases the dilation itself.
  F.reset = function () {
    clearSlots();
    applied = 1;
    if (RR.Engine) { RR.Engine.timeScale = base; lastWrite = base; }
  };

  F.scale = function () { return applied; };

  // ---- the finish ----------------------------------------------------------------------------
  // The city lets you go: the engine and the music CUT — not fade — and for three seconds there is
  // nothing but wind, a hull coming off plane, and the chase rig releasing onto the skyline.
  const fin = { stage: -1, t0: 0, cb: null, fired: false };
  const FIN_MUSIC_MS = 3000, FIN_CARD_MS = 3500, FIN_HOLD_MS = 3200;

  F.finale = function (cb) {
    if (fin.stage >= 0) {                        // already running: never double-cut, never eat a cb
      if (typeof cb === 'function' && !fin.cb) fin.cb = cb;
      return;
    }
    fin.stage = 0; fin.t0 = wallNow(); fin.cb = typeof cb === 'function' ? cb : null; fin.fired = false;
    try {
      if (RR.Audio && RR.Audio.stopEngine) RR.Audio.stopEngine();
      if (RR.Audio && RR.Audio.setRaceMusic) RR.Audio.setRaceMusic(false);
      if (RR.Audio && RR.Audio.setMusicIntensity) RR.Audio.setMusicIntensity(0);
      if (RR.Audio && RR.Audio.wind) RR.Audio.wind(1, 400);          // requested, guarded: silent until it exists
      if (RR.Camera && RR.Camera.release) RR.Camera.release(FIN_CARD_MS / 1000);
    } catch (e) { /* the results card matters more than the beat */ }
    push(0.60, FIN_HOLD_MS, 260, 700);           // three seconds of the world running long
  };

  F.finishing = function () { return fin.stage >= 0; };

  // quit-to-title mid-finale: drop the beat AND the callback, because the screen it would open
  // no longer exists. The only caller that should ever want this is a teardown path.
  F.cancelFinale = function () { fin.stage = -1; fin.cb = null; fin.fired = true; F.reset(); };

  function finTick(n) {
    if (fin.stage < 0) return;
    const el = n - fin.t0;
    if (fin.stage === 0 && el >= FIN_MUSIC_MS) {
      fin.stage = 1;
      try {
        if (RR.Audio && RR.Audio.wind) RR.Audio.wind(0, 900);
        if (RR.Audio && RR.Audio.setMusic) RR.Audio.setMusic(true);   // full arrangement, over a live shot
        if (RR.Audio && RR.Audio.setMusicIntensity) RR.Audio.setMusicIntensity(1);
      } catch (e) { /* silence is a shipping state */ }
    }
    if (!fin.fired && el >= FIN_CARD_MS) {
      fin.fired = true;
      const cb = fin.cb; fin.cb = null;
      fin.stage = -1;
      if (cb) { try { cb(); } catch (e) { /* never strand the caller */ } }
    }
  }

  // ---- the one write per frame ---------------------------------------------------------------
  function tick() {
    const E = RR.Engine;
    if (!E) return;
    const ts = E.timeScale == null ? 1 : E.timeScale;
    if (lastWrite === null || Math.abs(ts - lastWrite) > 1e-6) {
      // somebody else moved the clock: pause, photo mode, a race starting. Adopt it and drop
      // anything in flight — a dramatic beat must never survive a scene change.
      base = U() ? U().clamp(ts, 0, 1) : Math.min(1, Math.max(0, ts));
      clearSlots();
      applied = 1;
    }
    const n = wallNow();
    finTick(n);
    applied = combined(n);
    const want = base * applied;
    E.timeScale = want;
    lastWrite = want;
  }

  if (RR.Engine && RR.Engine.onUpdate) RR.Engine.onUpdate(tick);

  RR.Feel = F;
})();

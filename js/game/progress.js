/* River Racer — RECORDS. The smallest honest progression: one versioned localStorage key,
   `rr_save`, holding medals and best time per course, unlocks, whether the opening has been
   seen, and whether power-ups are switched on. (It also still holds the retired salute chain,
   read-only now — see below.)

   One key, because four scattered keys is how a save file rots: `rr_best_<course>` and
   `rr_unlocked` are absorbed on first load and then left alone, so a build from before this
   round still hands its records over instead of losing them.

   Every storage call is wrapped: a page opened from file:// can refuse localStorage outright
   (and Safari throws rather than returning null), and a refused save must cost you a record,
   never a race. Nothing in this module is allowed to throw at a caller. */
(function () {
  const P = {};

  const KEY = 'rr_save';
  P.VERSION = 1;

  // AUTHOR pace in metres per second over the whole course, and the step down to each medal
  // BELOW it. These are pace, not time, so they hold for a two-lap loop and a one-way sprint
  // alike, and a course's own character sets its number: the lake circuit is chop and two big
  // turns, the Full River Run drags you through the North Branch narrows first.
  P.PAR = { mainstem: 37, southbranch: 35, riverrun: 35, lakecircuit: 32 };
  P.PAR_DEFAULT = 35;
  P.TIERS = [['AUTHOR', 1.00], ['GOLD', 0.90], ['SILVER', 0.79], ['BRONZE', 0.64]];
  // …and the target moves with the hull, or the medal is a statement about the boat rather than
  // about the driver. The reference is the FORMULA 350 GT at 41 m/s (the field's stock hull);
  // an AUTHOR time in the LAKESIDE QUEEN has to be as hard to find as one in the podracer, which
  // is otherwise fast enough to walk every medal in the game the moment it is earned.
  P.PAR_REF_TOP = 41;
  P.PAR_HULL_MIN = 0.72;      // the LAKESIDE QUEEN at 30 m/s sits just inside this
  P.PAR_HULL_MAX = 1.50;      // and the podracer at 61 just inside this; the bounds are only a
                              // sanity rail against a future hull with a silly number on it
  function hullFactor(top) {
    if (!(top > 0)) return 1;
    const f = top / P.PAR_REF_TOP;
    return f < P.PAR_HULL_MIN ? P.PAR_HULL_MIN : f > P.PAR_HULL_MAX ? P.PAR_HULL_MAX : f;
  }

  // `powerups` is a PREFERENCE rather than a record, but it belongs in the same file: it is the one
  // switch that changes what a race is, and a save carried to another machine should carry it too.
  // ON is the default, so an old save without the field reads as ON through the migrate below.
  function blank() {
    return { v: P.VERSION, times: {}, medals: {}, chains: {}, lens: {}, unlocks: {}, seenOpening: false, runs: 0, powerups: true };
  }

  function readRaw(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function writeRaw(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }

  let save = null;

  // The absorb pass. Runs once, the first time anybody asks for the save, and only for keys the
  // new file does not already carry — re-absorbing would let a stale `rr_best_` overwrite a
  // better time banked since.
  function absorb(s) {
    for (const id of ['mainstem', 'riverrun', 'southbranch', 'lakecircuit']) {
      if (s.times[id] != null) continue;
      const v = parseFloat(readRaw('rr_best_' + id));
      if (isFinite(v) && v > 0) s.times[id] = v;
    }
    try {
      const u = JSON.parse(readRaw('rr_unlocked') || '{}');
      if (u && typeof u === 'object') for (const k in u) if (u[k]) s.unlocks[k] = 1;
    } catch (e) { /* a corrupt legacy key is not worth a save file */ }
  }

  function load() {
    if (save) return save;
    let s = null;
    try {
      const raw = readRaw(KEY);
      const o = raw ? JSON.parse(raw) : null;
      if (o && typeof o === 'object') s = o;
    } catch (e) { /* corrupt or refused — start clean rather than die on boot */ }
    const fresh = !s;
    if (!s) s = blank();
    // forward-migrate: every field the current version expects, present and of the right type
    const b = blank();
    for (const k in b) if (s[k] == null || typeof s[k] !== typeof b[k]) s[k] = b[k];
    s.v = P.VERSION;
    save = s;
    if (fresh) { absorb(s); flush(); }
    return save;
  }

  function flush() {
    if (!save) return false;
    return writeRaw(KEY, JSON.stringify(save));
  }

  P.get = function () { return load(); };
  P.set = function (k, v) { const s = load(); s[k] = v; flush(); return v; };
  P.save = flush;
  P.wipe = function () { save = blank(); flush(); return save; };

  // ---------- times ----------
  P.bestTime = function (course) {
    const v = load().times[course];
    return typeof v === 'number' && isFinite(v) ? v : null;
  };
  // Returns true only when the run actually beat the record — the results strip has nothing to
  // say otherwise. `len` is banked alongside so a menu can quote medal targets for a course
  // whose route is not currently built.
  P.recordTime = function (course, time, len) {
    if (!isFinite(time) || time <= 0) return false;
    const s = load();
    if (len > 0) s.lens[course] = len;
    const old = P.bestTime(course);
    if (old != null && old <= time) { flush(); return false; }
    s.times[course] = time;
    flush();
    return true;
  };

  // ---------- the chain (retired) ----------
  // The salute is gone, so nothing banks a chain any more. The field and both accessors stay:
  // race.js still asks (`RACE.bestChain`), and a save file written by an older build should keep
  // whatever it recorded rather than have the number silently deleted out from under it.
  P.bestChain = function (course) {
    const v = load().chains[course];
    return typeof v === 'number' && isFinite(v) ? v : 0;
  };
  P.recordChain = function (course, chain) {
    const n = Math.max(0, Math.round(chain || 0));
    if (!n) return false;
    const s = load();
    if ((s.chains[course] || 0) >= n) return false;
    s.chains[course] = n;
    flush();
    return true;
  };

  // ---------- medals ----------
  P.courseLength = function (course) {
    const v = load().lens[course];
    return typeof v === 'number' && v > 0 ? v : null;
  };
  P.parTimes = function (course, len, hullTop) {
    const L = len > 0 ? len : P.courseLength(course);
    if (!L) return null;
    const pace = (P.PAR[course] || P.PAR_DEFAULT) * hullFactor(hullTop);
    const out = {};
    for (const t of P.TIERS) out[t[0]] = L / (pace * t[1]);
    return out;
  };
  // The medal a given time is worth, or null for a finish slower than bronze pace.
  P.medal = function (course, time, len, hullTop) {
    const par = P.parTimes(course, len, hullTop);
    if (!par || !isFinite(time)) return null;
    for (const t of P.TIERS) if (time <= par[t[0]]) return t[0];
    return null;
  };
  P.medalOf = function (course) { return load().medals[course] || null; };
  P.rank = function (medal) {
    if (!medal) return -1;
    for (let i = 0; i < P.TIERS.length; i++) if (P.TIERS[i][0] === medal) return P.TIERS.length - 1 - i;
    return -1;
  };
  // Bank the medal this run was worth. Never demotes: a bad run does not take a gold off you.
  P.awardMedal = function (course, time, len, hullTop) {
    const m = P.medal(course, time, len, hullTop);
    const prev = P.medalOf(course);
    if (m && P.rank(m) > P.rank(prev)) {
      load().medals[course] = m;
      flush();
      return { medal: m, prev, improved: true };
    }
    return { medal: m, prev, improved: false };
  };

  // ---------- unlocks ----------
  // boats.js stays the live authority (it owns `rr_unlocked` and `pickable()`); this is the
  // record of it inside the one save file, and boats.js reads it back on the next boot.
  P.unlocked = function (id) { return !!load().unlocks[id]; };
  P.unlock = function (id) {
    if (!id) return false;
    const s = load();
    if (s.unlocks[id]) return false;
    s.unlocks[id] = 1;
    flush();
    return true;
  };

  // ---------- the opening ----------
  // The scripted cold open was removed; nothing calls these any more. They stay only because
  // `seenOpening` is already written into saved profiles, and changing the save-record shape to
  // delete one dead boolean is a worse trade than leaving it.
  P.seenOpening = function () { return !!load().seenOpening; };
  P.setSeenOpening = function (v) { return P.set('seenOpening', v !== false); };

  // ---------- the last run ----------
  // race.js banks the run at the finish crossing and leaves it here; the results strip reads it a
  // beat later, once the finale has let go of the screen. Kept in memory rather than in the save
  // file — a run you have already walked away from is not a record.
  let lastRun = null;
  P.noteRun = function (run) { lastRun = run || null; return lastRun; };
  P.summary = function (course) {
    if (!lastRun) return null;
    return course != null && lastRun.course !== course ? null : lastRun;
  };

  // Everything a course row on a menu needs, in one call.
  P.courseRecord = function (course) {
    return {
      course,
      time: P.bestTime(course),
      chain: P.bestChain(course),
      medal: P.medalOf(course),
      par: P.parTimes(course),
    };
  };

  RR.Progress = P;
})();

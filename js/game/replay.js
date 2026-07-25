/* River Racer — time-trial ghosts and the cinematic replay buffer.
   STUB — owned by W6 (feel), which replaces this file. Every entry point is a safe no-op, so
   race.js may call these unconditionally: a ghost that was never sampled is simply absent. */
(function () {
  const R = { recording: false, ghost: null };

  R.begin = function () {};
  R.sample = function () {};
  R.finish = function () { return null; };
  R.loadGhost = function () { return null; };
  R.clear = function () { R.ghost = null; };

  RR.Replay = R;
})();

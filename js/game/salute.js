/* River Racer — THE SALUTE, RETIRED. This file is a shim, not a mechanic.

   The salute — ask a Chicago bascule for passage with one prolonged blast and one short, then
   beat the leaves through the span, and chain it — was cut after the owner's playtest, along
   with its on-screen chain counter and approach arc. The bridges keep everything that made them
   worth watching: they still raise and lower on the tender's own cycle, with the bells, the
   gates and the stopped traffic. What went is the player-facing hook, and with it the reason a
   ramp on a bascule approach could wreck you for a bridge cycle you had no say in.

   Seventeen files read this state, most of them one guarded line deep in something else's job.
   Rather than reopen all seventeen, the module stays and answers "nothing is happening" forever:
   every field is a permanent zero, false or null, and every entry point is a no-op. A reader
   asking `if (RR.Salute.chain > 0)` therefore does nothing at all, without having to know the
   feature was removed. Delete this file only once nothing reads RR.Salute. */
(function () {
  const S = {};

  // ---- the read-only state, permanently at rest ----------------------------------------------
  S.chain = 0;          // clean salutes in a row
  S.best = 0;           // best chain this session
  S.window = 0;         // how far into the ask window a bascule ahead is
  S.armed = false;      // the tender has answered and the leaves are moving
  S.target = null;      // the span being asked
  S.dist = 0;           // metres to that span
  S.open = 0;           // its leaves, 0..1
  S.tier = 0;           // escalation tier
  S.bankable = false;   // a press right now would bank the chain
  S.event = null;       // 'ask' | 'clean' | 'threaded' | 'miss' | 'bank'
  S.eventT = 99;        // seconds since it fired — a very long time ago, which is the truth
  S.eventN = 0;         // chain value the callout referred to

  // ---- and the entry points, which do nothing ------------------------------------------------
  S.arm = function () {};
  S.reset = function () {};
  S.update = function () {};

  RR.Salute = S;
})();

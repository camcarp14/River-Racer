/* River Racer — Chicago's public sculpture: the Picasso, Calder's Flamingo, the Bat Column,
   Cloud Gate's plaza company. STUB — owned by W5 (life + easter eggs), which replaces this file.
   Self-initialising: main.js does not call init(), so the module arms itself on first frame. */
(function () {
  const S = { tags: [], _armed: false };

  S.init = function () {
    if (S._armed) return;
    S._armed = true;
  };

  RR.Engine.onUpdate(function arm() { S.init(); });

  RR.Sculpture = S;
})();

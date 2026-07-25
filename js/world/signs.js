/* River Racer — Chicago signage: the Chicago Theatre marquee, Wrigley's clock faces, tavern
   and hot-dog-stand signs, all drawn into one atlas. STUB — owned by W5, which replaces this file.
   Self-initialising: main.js does not call init(), so the module arms itself on first frame. */
(function () {
  const S = { tags: [], _armed: false };

  S.init = function () {
    if (S._armed) return;
    S._armed = true;
  };

  RR.Engine.onUpdate(function arm() { S.init(); });

  RR.Signs = S;
})();

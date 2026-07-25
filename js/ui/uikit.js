/* River Racer — the shared UI design tokens (Chicago flag palette, type scale, easing) injected
   as a stylesheet before any HUD or menu renders.
   STUB — owned by W7 (presentation), which replaces this file. */
(function () {
  const K = {};

  K.css = '';

  K.init = function () {
    if (!K.css || K._on) return;
    K._on = true;
    const s = document.createElement('style');
    s.id = 'rr-uikit';
    s.textContent = K.css;
    document.head.appendChild(s);
  };

  K.init();

  RR.UIKit = K;
})();

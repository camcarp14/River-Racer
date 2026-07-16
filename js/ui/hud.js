/* River Racer — in-race HUD DOM bindings */
(function () {
  const H = {};
  const $ = (id) => document.getElementById(id);
  let els = null;
  let cpFlashT = 0, tagT = 0, lastTagged = null;

  H.init = function () {
    els = {
      hud: $('hud'), speed: $('speed-num'), throttle: $('throttle-fill'),
      pos: $('pos-big'), posSuf: $('pos-suffix'), posTotal: $('pos-total'), lap: $('lap-line'),
      timer: $('timer-num'), cpFlash: $('checkpoint-flash'), wrong: $('wrongway'),
      count: $('countdown'), tag: $('landmark-tag'), vig: $('vignette'),
    };
  };

  H.show = function (on) { els.hud.classList.toggle('on', on); };

  H.countdown = function (n) {
    els.count.style.display = 'block';
    if (n > 0) {
      els.count.textContent = n;
      els.count.style.color = '#fff';
    } else {
      els.count.textContent = 'GO!';
      els.count.style.color = '#2ecc71';
      setTimeout(() => { els.count.style.display = 'none'; }, 900);
    }
  };

  H.checkpointFlash = function (n, total) {
    els.cpFlash.textContent = 'CHECKPOINT ' + n + ' / ' + total;
    els.cpFlash.style.opacity = 1;
    cpFlashT = 1.1;
  };

  H.flash = function (text) {
    els.cpFlash.textContent = text;
    els.cpFlash.style.opacity = 1;
    cpFlashT = 0.9;
  };

  // big animated "1ST!" placement pop the moment you cross the line
  H.showPlacement = function (pos) {
    const el = $('placement'), big = $('placement-big'), sub = $('placement-sub');
    big.textContent = pos + RR.U.ordinal(pos).toUpperCase();
    big.style.color = pos === 1 ? '#ffd24a' : pos === 2 ? '#dde3e8' : pos === 3 ? '#d0824a' : '#9fb4c0';
    sub.textContent = pos === 1 ? '★ RIVER CHAMP ★' : 'FINISH';
    el.classList.remove('on');
    void el.offsetWidth;                       // restart the CSS animation
    el.classList.add('on');
    setTimeout(() => el.classList.remove('on'), 2700);
  };

  // landmark callouts as you pass them
  H.tagLandmark = function (name) {
    if (name === lastTagged) return;
    lastTagged = name;
    els.tag.textContent = name.toUpperCase();
    els.tag.style.opacity = 1;
    tagT = 2.6;
  };

  H.update = function (dt, boat, race) {
    const speed = Math.hypot(boat.vel.x, boat.vel.z);
    els.speed.textContent = Math.round(speed * 2.237);          // m/s → mph
    // speed vignette: the edges close in as you approach (and boost past) top speed
    if (els.vig) {
      const f = RR.U.clamp((speed / boat.spec.top - 0.7) * 2.0, 0, 1) * 0.5 + boat.boostHeat * 0.2;
      els.vig.style.opacity = f.toFixed(2);
    }
    els.throttle.style.width = Math.round(boat.boostEnergy * 100) + '%';
    els.throttle.style.background = boat.boostHeat > 0.5
      ? 'linear-gradient(90deg,#ffc857,#ff3b30)'
      : 'linear-gradient(90deg,#7ec8e3,#ffc857)';

    if (race) {
      const p = boat.racePos || 1;
      els.pos.textContent = p;
      els.posSuf.textContent = RR.U.ordinal(p);
      els.posTotal.textContent = '/ ' + race.boats.length;
      const total = race.checkpoints.length;
      if (race.route.loop) {
        els.lap.textContent = 'LAP ' + Math.min(race.course.laps, boat.lap + 1) + '/' + race.course.laps;
      } else {
        els.lap.textContent = 'CHECKPOINT ' + Math.min(boat.nextCp, total) + '/' + total;
      }
      els.timer.textContent = RR.U.formatTime(race.time);
      els.wrong.style.display = race.wrongWay ? 'block' : 'none';
    }

    if (cpFlashT > 0) { cpFlashT -= dt; if (cpFlashT <= 0) els.cpFlash.style.opacity = 0; }
    if (tagT > 0) { tagT -= dt; if (tagT <= 0) { els.tag.style.opacity = 0; lastTagged = null; } }
  };

  RR.HUD = H;
})();

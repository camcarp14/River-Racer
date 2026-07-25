/* River Racer — the in-race HUD.
   H.init() replaces #hud.innerHTML wholesale from TEMPLATE, so the markup in index.html can never
   diverge from the code. TEMPLATE therefore OWNS <canvas id="minimap"> — main.js runs
   HUD.init() then Minimap.init(), and minimap.js finds that node by id. */
(function () {
  const H = {};
  const $ = (id) => document.getElementById(id);
  let els = null;

  // 216x288 minimap canvas lives here, not in index.html — see the note above.
  const TEMPLATE = `
  <div id="race-info">
    <div id="pos-plate"><span id="pos-big">1</span><span id="pos-suffix">ST</span><span id="pos-total">/6</span></div>
    <div id="lap-line">CHECKPOINT 0/12</div>
  </div>
  <div id="timer"><small>RACE TIME</small><span id="timer-num">0:00.00</span><div id="delta"></div></div>
  <div id="gaps"><span class="ah">AHEAD<b>—</b></span><span class="bh">BEHIND<b>—</b></span></div>
  <canvas id="minimap" width="216" height="288"></canvas>
  <div id="speedo">
    <canvas id="spd-ticks" width="336" height="336"></canvas>
    <div id="spd-arc"></div>
    <div id="speed-num">0</div>
    <div id="speed-unit">MPH</div>
    <div id="boost"></div>
    <div id="boost-label">BOOST</div>
  </div>
  <div id="chips"></div>
  <div id="ticker"></div>
  <div id="checkpoint-flash"></div>
  <div id="wrongway">WRONG WAY HOMIE</div>
  <div id="placement"><div id="placement-big"></div><div id="placement-sub"></div><div class="stars"></div></div>
  <div id="vignette"></div>
  <div id="countdown"><div id="cd-star"></div><span id="cd-num"></span></div>
  <div id="cd-scatter"></div>
  <div id="landmark-tag"><div id="lt-blade"><i class="star6"></i><span id="lt-name"></span></div><div id="lt-sub"></div></div>
  <div id="docent"></div>
  <div id="boost-hint"><b>W/↑</b> throttle &nbsp;<b>A·D/←·→</b> steer &nbsp;<b>S/↓</b> brake<br><b>SHIFT</b> boost &nbsp;<b>C</b> camera &nbsp;<b>[ ]</b> shot &nbsp;<b>N</b> time of day &nbsp;<b>G</b> green river &nbsp;<b>P</b> photo &nbsp;<b>R</b> reset &nbsp;<b>ESC</b> pause</div>`;

  const CINE = `<div class="bar t"></div><div class="bar b"></div><div class="meta"></div><div class="rec">REC</div>`;

  let cpFlashT = 0, tagT = 0, tagName = null;
  const tagSeen = new Map();            // name -> ms, so a landmark never re-announces within 45 s
  const chips = new Map();              // kind -> {el, t}
  let lastPos = 0, lastCells = -1, lastBurn = null, lastSpeed = -1, lastArc = '';
  let lastLap = '', lastTimer = '', lastWrong = null;
  let hintT = 0, hintGone = false;
  let tickerT = 0;

  H.init = function () {
    const hud = $('hud');
    hud.innerHTML = TEMPLATE;

    let cine = $('cine');
    if (!cine) { cine = document.createElement('div'); cine.id = 'cine'; cine.innerHTML = CINE; document.body.appendChild(cine); }

    els = {
      hud, speed: $('speed-num'), arc: $('spd-arc'), boost: $('boost'),
      plate: $('pos-plate'), pos: $('pos-big'), posSuf: $('pos-suffix'), posTotal: $('pos-total'),
      lap: $('lap-line'), timer: $('timer'), timerNum: $('timer-num'), delta: $('delta'),
      gaps: $('gaps'), raceInfo: $('race-info'), speedo: $('speedo'),
      cpFlash: $('checkpoint-flash'), wrong: $('wrongway'),
      count: $('countdown'), cdNum: $('cd-num'), cdStar: $('cd-star'), scatter: $('cd-scatter'),
      tag: $('landmark-tag'), ltName: $('lt-name'), ltSub: $('lt-sub'), docent: $('docent'),
      vig: $('vignette'), chips: $('chips'), ticker: $('ticker'), hint: $('boost-hint'),
      cine, cineMeta: cine.querySelector('.meta'),
    };

    // ten cells, column-reverse so index 0 is the bottom and the last to empty.
    // 0-1 red + hatched = the 0.15 engage threshold, made countable.
    for (let i = 0; i < 10; i++) {
      const c = document.createElement('div');
      c.className = 'cell' + (i < 2 ? ' hot reserve' : i < 5 ? ' mid' : '');
      els.boost.appendChild(c);
    }
    drawTicks($('spd-ticks'));
  };

  // one-time canvas: 27 radial ticks over the same 270 deg the conic-gradient arc sweeps
  function drawTicks(cv) {
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const S = cv.width, c = S / 2, em = S / 10.5;
    ctx.clearRect(0, 0, S, S);
    // CSS conic angle A (clockwise from 12 o'clock) -> canvas angle A - 90 deg
    const ang = (A) => (A - 90) * Math.PI / 180;
    for (let k = 0; k < 27; k++) {
      const A = 225 + (270 / 26) * k, a = ang(A);
      const major = k % 5 === 0;
      const r1 = em * 4.05, r0 = r1 - em * (major ? 0.9 : 0.5);
      ctx.strokeStyle = major ? 'rgba(126,200,227,.55)' : 'rgba(126,200,227,.22)';
      ctx.lineWidth = major ? 4 : 2;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
      ctx.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.strokeStyle = '#EF3340';
    ctx.lineWidth = em * 0.16;
    ctx.beginPath();
    ctx.arc(c, c, em * 4.5, ang(225 + 270 * 0.92), ang(225 + 270));
    ctx.stroke();
  }

  H.show = function (on) {
    if (!els) return;
    els.hud.classList.toggle('on', on);
    if (on && !hintGone) { hintT = 9; els.hint.classList.remove('gone'); }
  };

  // ---------- countdown ----------
  H.countdown = function (n) {
    if (!els) return;
    els.count.classList.add('on');
    els.cdNum.classList.toggle('go', n <= 0);
    els.cdNum.textContent = n > 0 ? n : 'GO!';
    // restart both animations
    const st = els.cdStar;
    st.style.animation = 'none'; els.cdNum.style.animation = 'none';
    void st.offsetWidth;
    st.style.animation = ''; els.cdNum.style.animation = '';
    if (n <= 0) {
      scatterStars();
      setTimeout(() => els.count.classList.remove('on'), 900);
    }
  };

  // the four stars of the flag, thrown to the four corners on GO
  function scatterStars() {
    els.scatter.innerHTML = '';
    const d = [[-34, -26], [34, -26], [-34, 26], [34, 26]];
    for (const [dx, dy] of d) {
      const s = document.createElement('i');
      s.className = 'star6';
      s.style.setProperty('--dx', dx + 'vw');
      s.style.setProperty('--dy', dy + 'vh');
      els.scatter.appendChild(s);
    }
    setTimeout(() => { if (els) els.scatter.innerHTML = ''; }, 800);
  }

  H.checkpointFlash = function (n, total) {
    if (!els) return;
    els.cpFlash.textContent = 'CHECKPOINT ' + n + ' / ' + total;
    els.cpFlash.style.opacity = 1;
    cpFlashT = 1.1;
  };

  H.flash = function (text) {
    if (!els) return;
    els.cpFlash.textContent = text;
    els.cpFlash.style.opacity = 1;
    cpFlashT = 0.9;
  };

  // ---------- status chips ----------
  H.chip = function (kind, text, ms) {
    if (!els) return;
    let c = chips.get(kind);
    if (!c) {
      const el = document.createElement('div');
      el.className = 'chip ' + kind;
      els.chips.appendChild(el);
      c = { el, t: 0 };
      chips.set(kind, c);
    }
    if (c.el.textContent !== text) c.el.textContent = text;
    c.t = (ms == null ? 900 : ms) / 1000;
  };

  function updateChips(dt) {
    chips.forEach((c, kind) => {
      c.t -= dt;
      if (c.t <= 0) { c.el.remove(); chips.delete(kind); }
    });
  }

  // ---------- placement ----------
  H.showPlacement = function (pos) {
    if (!els) return;
    const el = $('placement'), big = $('placement-big'), sub = $('placement-sub');
    const stars = el.querySelector('.stars');
    big.textContent = pos + RR.U.ordinal(pos).toUpperCase();
    big.style.color = pos === 1 ? '#FFC857' : pos === 2 ? '#DDE3E8' : pos === 3 ? '#C97B3C' : '#EAF6FF';
    sub.textContent = pos === 1 ? 'RIVER CHAMP' : 'FINISH';
    stars.innerHTML = '';
    const delays = [420, 500, 580, 660];
    for (let i = 0; i < 4; i++) {
      const s = document.createElement('i');
      s.className = 'star6';
      s.style.animationDelay = delays[i] + 'ms';
      if (pos !== 1) s.style.background = 'rgba(239,51,64,.35)';
      stars.appendChild(s);
    }
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    setTimeout(() => el.classList.remove('on'), 2700);
  };

  // ---------- landmark callout ----------
  // sub is the terse-caps architect/year/height line: BERTRAND GOLDBERG · 1964 · 179 M
  H.tagLandmark = function (name, sub) {
    if (!els || !name) return;
    const key = String(name);
    const nowMs = (window.performance && performance.now) ? performance.now() : Date.now();
    const seen = tagSeen.get(key);
    if (key === tagName) return;
    if (seen != null && nowMs - seen < 45000) return;
    tagSeen.set(key, nowMs);
    tagName = key;
    els.ltName.textContent = key.toUpperCase();
    els.ltSub.textContent = sub ? String(sub).toUpperCase() : '';
    els.ltSub.classList.toggle('off', !sub);
    els.tag.classList.add('on');
    tagT = 3.2;
  };

  // Architecture Tour: SPACE near a landmark opens the three-line docent panel
  H.docent = function (name, lines) {
    if (!els) return;
    if (!name) { els.docent.classList.remove('on'); return; }
    els.docent.innerHTML = '<h4></h4><div></div>';
    els.docent.querySelector('h4').textContent = String(name).toUpperCase();
    els.docent.querySelector('div').textContent = (lines || '').toUpperCase();
    els.docent.classList.add('on');
  };

  // ---------- ghost / best-split delta ----------
  H.setDelta = function (sec) {
    if (!els) return;
    if (sec == null || !isFinite(sec)) { els.delta.classList.remove('on'); return; }
    els.delta.textContent = (sec >= 0 ? '+' : '−') + Math.abs(sec).toFixed(2);
    els.delta.classList.toggle('up', sec >= 0);
    els.delta.classList.toggle('dn', sec < 0);
    els.delta.classList.add('on');
  };

  H.setGaps = function (ahead, behind) {
    if (!els) return;
    const on = ahead != null || behind != null;
    els.gaps.classList.toggle('on', on);
    if (!on) return;
    els.gaps.children[0].innerHTML = 'AHEAD<b>' + (ahead == null ? '—' : ahead.toFixed(1) + 's') + '</b>';
    els.gaps.children[1].innerHTML = 'BEHIND<b>' + (behind == null ? '—' : behind.toFixed(1) + 's') + '</b>';
  };

  // ---------- cinematic overlay ----------
  H.cine = function (on, label) {
    if (!els) return;
    els.cine.classList.toggle('on', !!on);
    if (on && label && els.cineMeta.textContent !== label) els.cineMeta.textContent = label;
  };

  // ---------- rival ticker ----------
  function drawTicker(race, boat) {
    if (!race || !race.boats || race.boats.length < 2 || race.tour) { els.ticker.classList.remove('on'); return; }
    let ahead = null, behind = null, ag = 0, bg = 0;
    const spd = Math.max(6, Math.hypot(boat.vel.x, boat.vel.z));
    for (const b of race.boats) {
      if (b === boat) continue;
      const d = (b.routeD - boat.routeD) / spd;
      if (d > 0) { if (ahead === null || d < ag) { ahead = b; ag = d; } }
      else if (behind === null || -d < bg) { behind = b; bg = -d; }
    }
    const rows = [];
    if (ahead) rows.push(['ahead', nameOf(ahead), ag]);
    if (behind) rows.push(['behind', nameOf(behind), bg]);
    if (!rows.length) { els.ticker.classList.remove('on'); return; }
    els.ticker.classList.add('on');
    while (els.ticker.children.length > rows.length) els.ticker.lastChild.remove();
    while (els.ticker.children.length < rows.length) {
      const r = document.createElement('div');
      r.className = 'tick-row';
      r.innerHTML = '<span class="n"></span><span class="g"></span>';
      els.ticker.appendChild(r);
    }
    rows.forEach((r, i) => {
      const el = els.ticker.children[i];
      const cls = 'tick-row ' + r[0] + (r[2] < 0.5 ? ' close' : '');
      if (el.className !== cls) el.className = cls;
      const n = r[1], g = (r[0] === 'ahead' ? '+' : '−') + r[2].toFixed(1);
      if (el.children[0].textContent !== n) el.children[0].textContent = n;
      if (el.children[1].textContent !== g) el.children[1].textContent = g;
    });
    H.setGaps(ahead ? ag : null, behind ? bg : null);
  }
  function nameOf(b) {
    return String(b.displayName || b.pilotName || 'RIVAL').toUpperCase();
  }

  // ---------- per frame ----------
  H.update = function (dt, boat, race) {
    if (!els) return;
    const speed = Math.hypot(boat.vel.x, boat.vel.z);
    const mph = Math.round(speed * 2.237);
    if (mph !== lastSpeed) { els.speed.textContent = mph; lastSpeed = mph; }

    const top = (boat.spec && boat.spec.top) || 40;
    els.arc.style.setProperty('--spd', RR.U.clamp(speed / (top * 1.35), 0, 1).toFixed(3));
    const hot = speed > top * 0.92;
    const arcCol = boat.boostHeat > 0.35 ? '#EF3340' : hot ? '#FFC857' : '#7EC8E3';
    if (arcCol !== lastArc) { els.arc.style.setProperty('--arc', arcCol); lastArc = arcCol; }
    els.arc.classList.toggle('hot', hot || boat.boostHeat > 0.35);

    // speed vignette: the edges close in as you approach — and boost past — top speed
    if (els.vig) els.vig.style.opacity = (RR.U.clamp((speed / top - 0.7) * 2.0, 0, 1) * 0.5 + (boat.boostHeat || 0) * 0.2).toFixed(2);

    const cells = Math.round(RR.U.clamp(boat.boostEnergy || 0, 0, 1) * 10);
    if (cells !== lastCells) {
      for (let i = 0; i < 10; i++) els.boost.children[i].classList.toggle('on', i < cells);
      lastCells = cells;
    }
    const burn = (boat.boostHeat || 0) > 0.35;
    if (burn !== lastBurn) { els.boost.classList.toggle('burning', burn); lastBurn = burn; }

    // chips driven straight off the physics fields
    if ((boat.draft || 0) > 0.25) H.chip('draft', 'DRAFTING', 150);
    if (boat.drifting) H.chip('drift', 'DRIFT ×' + (boat.driftTime || 0).toFixed(1) + 's', 150);
    updateChips(dt);

    if (race) {
      const tour = !!race.tour;
      if (els.raceInfo.style.display !== (tour ? 'none' : '')) {
        els.raceInfo.style.display = tour ? 'none' : '';
        els.timer.style.display = tour ? 'none' : '';
        els.speedo.style.display = '';
      }
      if (!tour) {
        const p = boat.racePos || 1;
        if (p !== lastPos) {
          els.pos.textContent = p;
          els.posSuf.textContent = RR.U.ordinal(p);
          els.pos.style.color = p === 1 ? '#FFC857' : p === 2 ? '#DDE3E8' : p === 3 ? '#C97B3C' : '#FFFFFF';
          els.pos.classList.remove('flip'); void els.pos.offsetWidth; els.pos.classList.add('flip');
          // rank change is the most emotionally loaded event in a racing game; it used to have none
          if (lastPos) {
            const cls = p < lastPos ? 'up' : 'down';
            els.plate.classList.remove('up', 'down');
            void els.plate.offsetWidth;
            els.plate.classList.add(cls);
            setTimeout(() => els.plate && els.plate.classList.remove(cls), 400);
          }
          els.posTotal.textContent = '/' + race.boats.length;
          lastPos = p;
        }
        const total = race.checkpoints ? race.checkpoints.length : 0;
        const lap = race.route && race.route.loop
          ? 'LAP ' + Math.min(race.course.laps, boat.lap + 1) + '/' + race.course.laps
          : 'CHECKPOINT ' + Math.min(boat.nextCp, total) + '/' + total;
        if (lap !== lastLap) { els.lap.textContent = lap; lastLap = lap; }
        const tm = RR.U.formatTime(race.time);
        if (tm !== lastTimer) { els.timerNum.textContent = tm; lastTimer = tm; }
      }
      const ww = !!race.wrongWay;
      if (ww !== lastWrong) { els.wrong.style.display = ww ? 'block' : 'none'; lastWrong = ww; }

      // ghost delta in a time trial, gaps + ticker in a race
      tickerT -= dt;
      if (tickerT <= 0) {
        tickerT = 0.1;
        if (race.timeTrial) {
          H.setGaps(null, null);
          els.ticker.classList.remove('on');
          H.setDelta(RR.Race && RR.Race.ghostDelta ? RR.Race.ghostDelta() : null);
        } else {
          H.setDelta(null);
          drawTicker(race, boat);
        }
      }
    }

    // the key wall is not permanent furniture: it fades 9 s in and lives on the pause screen
    if (!hintGone && hintT > 0) {
      hintT -= dt;
      if (hintT <= 0) { hintGone = true; els.hint.classList.add('gone'); }
    }

    if (cpFlashT > 0) { cpFlashT -= dt; if (cpFlashT <= 0) els.cpFlash.style.opacity = 0; }
    if (tagT > 0) { tagT -= dt; if (tagT <= 0) { els.tag.classList.remove('on'); tagName = null; } }
  };

  H.resetSession = function () {
    tagSeen.clear(); tagName = null; lastPos = 0; hintGone = false; hintT = 0;
    if (els) { els.hint.classList.remove('gone'); els.docent.classList.remove('on'); }
  };

  RR.HUD = H;
})();

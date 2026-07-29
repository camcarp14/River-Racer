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
    <canvas id="spd-ticks" width="384" height="384"></canvas>
    <canvas id="spd-boost" width="384" height="384"></canvas>
    <div id="spd-arc"></div>
    <div id="speed-num">0</div>
    <div id="speed-unit">MPH</div>
    <div id="boost-legend"><div id="prime">PRIME</div><div id="boost-label">BOOST</div></div>
  </div>
  <div id="item-call"></div>
  <div id="incoming"><i class="star6"></i><span>TORPEDO INCOMING</span><b>0.0</b></div>
  <div id="item-slot">
    <div id="item-box">
      <div id="item-head">ITEM</div>
      <div id="item-well">
        <i id="item-glow"></i>
        <canvas id="item-icon" width="192" height="192"></canvas>
        <i id="item-ring"></i>
      </div>
      <div id="item-foot"><b id="item-key">E</b><span id="item-act">EMPTY</span></div>
    </div>
    <div id="item-name">DRIVE INTO A CRATE</div>
    <div id="item-sub"></div>
    <div id="item-pips"></div>
  </div>
  <div id="chips"></div>
  <div id="ticker"></div>
  <div id="checkpoint-flash"></div>
  <div id="wrongway">WRONG WAY — TURN AROUND</div>
  <div id="placement"><div id="placement-big"></div><div id="placement-sub"></div><div class="stars"></div></div>
  <div id="vignette"></div>
  <div id="countdown"><div id="cd-star"></div><span id="cd-num"></span></div>
  <div id="cd-scatter"></div>
  <div id="landmark-tag"><div id="lt-blade"><i class="star6"></i><span id="lt-name"></span></div><div id="lt-sub"></div></div>
  <div id="docent"></div>
  <div id="boost-hint"><b>W/↑</b> throttle &nbsp;<b>A·D/←·→</b> steer &nbsp;<b>S/↓</b> brake &amp; reverse &nbsp;<b>SHIFT</b> boost<br><span id="hint-item"><b class="key">E</b> or <b class="key">SPACE</b> fire your item &nbsp;</span><b>B·Q</b> look astern &nbsp;<b>C</b> camera &nbsp;<b>[ ]</b> shot<br><b>N</b> time of day &nbsp;<b>G</b> green river &nbsp;<b>P</b> photo &nbsp;<b>R</b> reset &nbsp;<b>M</b> sound &nbsp;<b>ESC</b> pause<span id="hint-tour" style="display:none"><br><b>SPACE</b> about this building &nbsp;<b>F ×5</b> take the wheel &nbsp;<b>C</b> change seat &nbsp;<b>DRAG</b> look around</span></div>`;

  const CINE = `<div class="bar t"></div><div class="bar b"></div><div class="meta"></div><div class="rec">REC</div>`;

  // every ring radius below is quoted in these units, so the three dial layers stay concentric
  const RING_EM = 11.9;

  let cpFlashT = 0, tagT = 0, tagName = null;
  const tagSeen = new Map();            // name -> ms, so a landmark never re-announces within 45 s
  const chips = new Map();              // kind -> {el, t}
  let lastPos = 0, lastBoost = '', lastSpeed = -1, lastArc = '';
  let lastLap = '', lastTimer = '', lastWrong = null;
  let hintT = 0, hintGone = false, hintItems = null, hintTour = null;
  let tickerT = 0;

  // The key wall must never list a key that does nothing in the run you are actually in: SPACE is
  // the docent aboard the Architecture Tour and the item trigger everywhere else, and with items
  // switched off (or in a time trial) there is no item to fire at all. Repainted every frame rather
  // than only while the wall is counting down, because the switch that decides it lives on the
  // pause menu and can be thrown long after the nine seconds are up.
  function paintHintKeys(race) {
    const items = !!(RR.Powerups && RR.Powerups.active && RR.Powerups.active());
    const tour = !!(race && race.tour);
    if (items !== hintItems) { hintItems = items; if (els.hintItem) els.hintItem.style.display = items ? '' : 'none'; }
    if (tour !== hintTour) { hintTour = tour; if (els.hintTour) els.hintTour.style.display = tour ? '' : 'none'; }
  }

  H.init = function () {
    const hud = $('hud');
    hud.innerHTML = TEMPLATE;

    let cine = $('cine');
    if (!cine) { cine = document.createElement('div'); cine.id = 'cine'; cine.innerHTML = CINE; document.body.appendChild(cine); }

    els = {
      hud, speed: $('speed-num'), arc: $('spd-arc'),
      boost: $('spd-boost'), prime: $('prime'),
      plate: $('pos-plate'), pos: $('pos-big'), posSuf: $('pos-suffix'), posTotal: $('pos-total'),
      lap: $('lap-line'), timer: $('timer'), timerNum: $('timer-num'), delta: $('delta'),
      gaps: $('gaps'), raceInfo: $('race-info'), speedo: $('speedo'),
      cpFlash: $('checkpoint-flash'), wrong: $('wrongway'),
      count: $('countdown'), cdNum: $('cd-num'), cdStar: $('cd-star'), scatter: $('cd-scatter'),
      tag: $('landmark-tag'), ltName: $('lt-name'), ltSub: $('lt-sub'), docent: $('docent'),
      vig: $('vignette'), chips: $('chips'), ticker: $('ticker'), hint: $('boost-hint'),
      hintItem: $('hint-item'), hintTour: $('hint-tour'),
      slot: $('item-slot'), icon: $('item-icon'), itemName: $('item-name'), pips: $('item-pips'),
      call: $('item-call'), itemSub: $('item-sub'), itemAct: $('item-act'), itemKey: $('item-key'),
      inc: $('incoming'), incNum: $('incoming') ? $('incoming').querySelector('b') : null,
      cine, cineMeta: cine.querySelector('.meta'),
    };
    els.boostCtx = els.boost ? els.boost.getContext('2d') : null;
    els.iconCtx = els.icon ? els.icon.getContext('2d') : null;

    buildPips();
    drawIcon(null);
    drawTicks($('spd-ticks'));
    lastBoost = '';
    drawBoost(0, false);
  };

  // one-time canvas: 27 radial ticks over the same 270 deg the conic-gradient arc sweeps
  function drawTicks(cv) {
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const S = cv.width, c = S / 2, em = S / RING_EM;
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

  // ---------- boost: the outer ring of the dial ----------
  // Ten segments over the speed arc's own 270 deg sweep, starting down-left. Bottom two are the
  // 0.15 reserve the engine will not light below; top two are the PRIME band, because the 15 %
  // full-tank bonus was a secret nobody could see themselves earning.
  const BOOST_COL = ['#EF3340', '#EF3340', '#7EC8E3', '#7EC8E3', '#7EC8E3',
    '#7EC8E3', '#7EC8E3', '#7EC8E3', '#FFC857', '#FFC857'];
  function drawBoost(energy, burn) {
    const ctx = els && els.boostCtx;
    if (!ctx) return;
    const cells = Math.round(RR.U.clamp(energy, 0, 1) * 10);
    const prime = energy > 0.90;
    const key = cells + '|' + (prime ? 1 : 0) + '|' + (burn ? 1 : 0);
    if (key === lastBoost) return;
    lastBoost = key;
    const S = els.boost.width, c = S / 2, em = S / RING_EM;
    ctx.clearRect(0, 0, S, S);
    ctx.lineCap = 'butt';
    ctx.lineWidth = em * 0.80;
    const r = em * 5.42, D = Math.PI / 180;
    for (let k = 0; k < 10; k++) {
      const a0 = (135 + k * 27) * D;
      const on = k < cells;
      const col = on ? BOOST_COL[k] : 'rgba(255,255,255,.075)';
      ctx.strokeStyle = col;
      if (on && (burn || (prime && k >= 8))) { ctx.shadowBlur = em * 0.55; ctx.shadowColor = col; }
      else ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(c, c, r, a0, a0 + 24 * D);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    // the reserve line: where the engine stops answering, made countable
    const a = 188.5 * D;
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * (r - em * 0.42), c + Math.sin(a) * (r - em * 0.42));
    ctx.lineTo(c + Math.cos(a) * (r + em * 0.42), c + Math.sin(a) * (r + em * 0.42));
    ctx.stroke();
    if (els.prime) els.prime.classList.toggle('on', prime);
  }

  H.show = function (on) {
    if (!els) return;
    els.hud.classList.toggle('on', on);
    if (!on) {
      clearCall();
      els.slot.className = ''; slotCls = '';
      if (els.inc) els.inc.classList.remove('on');
      incOn = false; incTxt = ''; incNear = null;
    }
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
  // 'item' is the power-up module's own kind and never a chip: what you just fired is the loudest
  // thing that has happened in the last second and it gets the callout plate instead.
  H.chip = function (kind, text, ms) {
    if (!els) return;
    if (kind === 'item') { itemCall(text, /SHIELD BLOCKED/.test(text) ? 'save' : 'fire'); return; }
    let c = chips.get(kind);
    if (!c) {
      const el = document.createElement('div');
      el.className = 'chip ' + kind;
      els.chips.appendChild(el);
      c = { el, t: 0, age: 0 };
      chips.set(kind, c);
    }
    if (c.el.textContent !== text) c.el.textContent = text;
    c.t = (ms == null ? 900 : ms) / 1000;
    c.age = 0;
  };

  function updateChips(dt) {
    chips.forEach((c, kind) => {
      c.t -= dt; c.age += dt;
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

  // ================================================================== THE ITEMS
  // RR.Powerups owns the items and touches no DOM; this file owns the DOM and touches no logic.
  // Every read below is guarded, so a build without the module simply has no slot.

  // ---------- the icons ----------
  // The eight glyphs in the item table ('»', '◌', '≈') render differently on every OS and vanish
  // at 90 px. Drawn strokes do not. Same reason the flag star is a clip-path, never a character.
  function iconInk(hex) {
    let r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    // the oil slick is nearly black: unlifted it is a hole in the plate, not an icon
    const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
    if (lum < 0.55) {
      const k = (0.55 - lum) / 0.55 * 0.82;
      r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k;
    }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }

  function drawIcon(def) {
    const ctx = els && els.iconCtx;
    if (!ctx) return;
    const S = els.icon.width, c = S / 2;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, S, S);
    ctx.strokeStyle = ctx.fillStyle = def ? iconInk(def.color) : 'rgba(150,190,212,.55)';
    ctx.lineWidth = S * 0.09;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const id = def ? def.id : null;
    const TAU = Math.PI * 2;
    const dot = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
    const ring = (x, y, r, lw) => { ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); };

    if (id === 'turbo') {
      // three chevrons: the one glyph that still reads as speed at ninety pixels
      ctx.lineWidth = S * 0.085;
      for (let i = 0; i < 3; i++) {
        const x = S * 0.40 + i * S * 0.20;
        ctx.beginPath();
        ctx.moveTo(x - S * 0.14, c - S * 0.20); ctx.lineTo(x, c); ctx.lineTo(x - S * 0.14, c + S * 0.20);
        ctx.stroke();
      }
    } else if (id === 'fender') {
      // a heater shield with the flag star on it — an outlined bubble read as a zero
      const w = S * 0.235, top = S * 0.235, bot = S * 0.80;
      ctx.lineWidth = S * 0.082;
      ctx.beginPath();
      ctx.moveTo(c - w, top); ctx.lineTo(c + w, top); ctx.lineTo(c + w, S * 0.50);
      ctx.quadraticCurveTo(c + w, bot - S * 0.10, c, bot);
      ctx.quadraticCurveTo(c - w, bot - S * 0.10, c - w, S * 0.50);
      ctx.closePath(); ctx.stroke();
      if (RR.UIKit && RR.UIKit.star6) { RR.UIKit.star6(ctx, c, S * 0.50, S * 0.135, 0); ctx.fill(); }
    } else if (id === 'slick') {
      // a patch of oil, with the wave cut back OUT of it: strokes over a fill of the same ink
      // would be invisible, and the slick has to look like something lying on the water
      ctx.beginPath(); ctx.ellipse(c, c, S * 0.345, S * 0.225, 0, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = S * 0.055;
      for (let r = 0; r < 2; r++) {
        const y = c + (r ? S * 0.085 : -S * 0.085);
        ctx.beginPath();
        for (let i = 0; i <= 20; i++) {
          const x = S * 0.26 + (S * 0.48) * (i / 20);
          const yy = y + Math.sin(i / 20 * Math.PI * 2 + r * 2.2) * S * 0.030;
          if (i) ctx.lineTo(x, yy); else ctx.moveTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    } else if (id === 'dye') {
      // a puff of dye trailing off astern
      for (const p of [[0.42, 0.50, 0.185], [0.62, 0.48, 0.205], [0.52, 0.65, 0.165], [0.52, 0.36, 0.145]]) {
        dot(S * p[0], S * p[1], S * p[2]);
      }
      dot(S * 0.24, S * 0.72, S * 0.062);
      dot(S * 0.13, S * 0.80, S * 0.038);
    } else if (id === 'deepdish') {
      // a deep-dish pie seen from above, one slice cut out of it
      ring(c, c, S * 0.30, S * 0.115);
      ctx.beginPath();
      ctx.moveTo(c, c); ctx.lineTo(c + S * 0.225, c - S * 0.135); ctx.lineTo(c + S * 0.225, c + S * 0.135);
      ctx.closePath(); ctx.fill();
      for (const p of [[-0.11, -0.10], [-0.15, 0.07], [0.01, 0.11]]) dot(c + S * p[0], c + S * p[1], S * 0.046);
    } else if (id === 'bowwave') {
      // SHOCKWAVE goes off all round you now, so the icon is concentric, not one-sided
      for (let i = 0; i < 3; i++) ring(c, c, S * (0.135 + i * 0.105), S * 0.072);
      dot(c, c, S * 0.052);
    } else if (id === 'gulls') {
      ctx.lineWidth = S * 0.075;
      const g = [[0.50, 0.34, 0.15], [0.31, 0.58, 0.11], [0.70, 0.62, 0.11]];
      for (const [gx, gy, gr] of g) {
        const x = S * gx, y = S * gy, w = S * gr;
        ctx.beginPath();
        ctx.moveTo(x - w, y + w * 0.42);
        ctx.quadraticCurveTo(x - w * 0.45, y - w * 0.5, x, y + w * 0.12);
        ctx.quadraticCurveTo(x + w * 0.45, y - w * 0.5, x + w, y + w * 0.42);
        ctx.stroke();
      }
    } else if (id === 'torpedo') {
      const hh = S * 0.105, nose = S * 0.82;
      ctx.beginPath();
      ctx.moveTo(S * 0.30, c - hh); ctx.lineTo(S * 0.62, c - hh);
      ctx.quadraticCurveTo(nose, c - hh * 0.72, nose, c);
      ctx.quadraticCurveTo(nose, c + hh * 0.72, S * 0.62, c + hh);
      ctx.lineTo(S * 0.30, c + hh);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(S * 0.31, c - hh); ctx.lineTo(S * 0.20, c - hh * 2.1); ctx.lineTo(S * 0.255, c);
      ctx.lineTo(S * 0.20, c + hh * 2.1); ctx.lineTo(S * 0.31, c + hh);
      ctx.closePath(); ctx.fill();
      ctx.lineWidth = S * 0.05;
      ctx.beginPath();
      ctx.moveTo(S * 0.07, c - hh * 2.4); ctx.lineTo(S * 0.21, c - hh * 2.4);
      ctx.moveTo(S * 0.04, c + hh * 2.4); ctx.lineTo(S * 0.18, c + hh * 2.4);
      ctx.stroke();
    } else {
      // Empty: the crate itself, so the thing to go and hit is the thing in the slot. Lid band,
      // base band and cross-braced middle panel — a bare square with an X in it reads as a
      // missing-image placeholder, which is the one thing this must never look like.
      ctx.lineWidth = S * 0.062;
      const a = S * 0.215, b = S * 0.785, t = S * 0.355, u = S * 0.645;
      ctx.strokeRect(a, a, b - a, b - a);
      ctx.beginPath();
      ctx.moveTo(a, t); ctx.lineTo(b, t);
      ctx.moveTo(a, u); ctx.lineTo(b, u);
      ctx.stroke();
      ctx.lineWidth = S * 0.05;
      ctx.beginPath();
      ctx.moveTo(a, t); ctx.lineTo(b, u);
      ctx.moveTo(b, t); ctx.lineTo(a, u);
      ctx.stroke();
    }
  }

  // ---------- the live-effect pips ----------
  // status() is seconds remaining; the bar is that over the tunable it started at, so a SHIELD
  // running out looks like a SHIELD running out and not like a label.
  const PIPS = [['turbo', 'TURBO', 'TURBO_T', 3], ['shield', 'SHIELD', 'SHIELD_T', 12],
    ['heavy', 'HEAVY', 'HEAVY_T', 8], ['spin', 'SPUN', 'SPIN_T', 1.6],
    ['blind', 'BLIND', 'BLIND_T', 2.2], ['gulls', 'GULLS', 'GULL_T', 4.5]];
  const pipEls = [];
  function buildPips() {
    pipEls.length = 0;
    if (!els || !els.pips) return;
    els.pips.innerHTML = '';
    for (const p of PIPS) {
      const el = document.createElement('span');
      el.className = 'pip';
      el.dataset.k = p[0];
      el.innerHTML = p[1] + '<i></i>';
      els.pips.appendChild(el);
      pipEls.push({ el, bar: el.querySelector('i'), on: false, w: -1 });
    }
  }
  function updatePips(P, s) {
    if (!pipEls.length) return;
    const K = P.K || {};
    for (let i = 0; i < PIPS.length; i++) {
      const p = pipEls[i], v = s ? (s[PIPS[i][0]] || 0) : 0;
      const on = v > 0.05;
      if (on !== p.on) { p.el.classList.toggle('on', on); p.on = on; }
      if (!on) continue;
      const w = Math.round(RR.U.clamp(v / (K[PIPS[i][2]] || PIPS[i][3]), 0, 1) * 20) * 5;
      if (w !== p.w) { p.bar.style.width = w + '%'; p.w = w; }
    }
  }

  // ---------- the callout ----------
  // fire = you did it, hit = it was done to you, save = the SHIELD ate it. One line, one plate,
  // on the axis the eye is already on — this is read at eighty miles an hour or not at all.
  // The plate lives and dies on WALL time, on timers, and its VISIBILITY is a plain class — never a
  // keyframe. A composited animation only advances on frames that actually land, so on a stalled
  // frame an opacity-animated callout is simply never seen. The keyframe here is the pop and
  // nothing else; if it is dropped the plate still reads.
  let callTone = '', callWall = -1e9, callHold = 0, callGone = 0;
  const nowMs = () => ((window.performance && performance.now) ? performance.now() : Date.now());
  function clearCall() {
    if (callHold) clearTimeout(callHold);
    if (callGone) clearTimeout(callGone);
    callHold = callGone = 0; callTone = '';
    if (els && els.call) els.call.className = '';
  }
  function itemCall(text, tone) {
    if (!els || !els.call) return;
    // a hit landing in the same frame as your own SHIELD eating it must not shout over the save
    if (tone === 'hit' && callTone === 'save' && nowMs() - callWall < 70) return;
    if (callHold) clearTimeout(callHold);
    if (callGone) clearTimeout(callGone);
    els.call.className = '';
    void els.call.offsetWidth;                       // restart the pop, not just the text
    els.call.textContent = String(text || '').toUpperCase();
    els.call.className = 'on ' + tone;
    callTone = tone; callWall = nowMs();
    const hold = tone === 'hit' ? 1400 : 1150;
    callHold = setTimeout(() => { if (els) els.call.className = 'on ' + tone + ' out'; }, hold);
    callGone = setTimeout(clearCall, hold + 280);
  }
  function hitCall(text) {
    itemCall(text, 'hit');
    // powerups.js chipped the same event a beat earlier this frame; one voice, not two
    const c = chips.get('bad');
    if (c && c.age < 0.3) { c.el.remove(); chips.delete('bad'); }
  }

  // ---------- what just landed on you ----------
  // Every hostile effect in powerups.js goes through its land() helper, which publishes the item
  // label and the pilot who threw it on lastHit(). Reading that instead of watching status()
  // timers is the only way SHOCKWAVE and the DEEP DISH slam get a plate at all — neither leaves a
  // timer on you, only a shove — and it is what turns "SPUN OUT" into "TORPEDO HIT — LOU CANAL".
  let lastHitAt = -1e9;
  function watchHits(P) {
    if (!P.lastHit || !RR.Engine || !RR.Engine.time) return;
    const lh = P.lastHit();
    // ago outside this window means either old news or a sim clock that has been reset under us
    // between races — neither is something to shout about
    if (!lh || !lh.label || !(lh.ago >= 0 && lh.ago < 1.0)) return;
    const at = RR.Engine.time() - lh.ago;
    if (at <= lastHitAt + 1e-3) return;
    lastHitAt = at;
    // Several labels already carry their own em dash ("OIL SLICK — SPINNING OUT"). Appending the
    // pilot to one of those makes a two-dash, eight-word plate that is unreadable at speed, so the
    // pilot replaces the second clause rather than following it: "OIL SLICK — DEEP DISH DRE".
    hitCall(lh.from ? lh.label.split(' — ')[0] + ' — ' + lh.from : lh.label);
  }

  // ---------- the incoming-torpedo warning ----------
  // The torpedo is the one item that reaches you from three places back, and it arrives from
  // astern where there is nothing to see. incoming() is seconds until it lands; below 1.2 s the
  // plate goes urgent, which is roughly the last moment a SHIELD is worth spending.
  let incOn = false, incTxt = '', incNear = null;
  function updateIncoming(P) {
    if (!els.inc) return;
    const eta = P.incoming ? P.incoming() : 0;
    const on = eta > 0.05;
    if (on !== incOn) { els.inc.classList.toggle('on', on); incOn = on; }
    if (!on) return;
    const s = eta.toFixed(1);
    if (s !== incTxt) { els.incNum.textContent = s; incTxt = s; }
    const near = eta < 1.2;
    if (near !== incNear) { els.inc.classList.toggle('near', near); incNear = near; }
  }

  // ---------- the slot ----------
  // Three states and two moments. The states are EMPTY / SPINNING / HOLDING, and they are told
  // apart by frame, colour and words, not by the icon alone — an empty slot that looks like a full
  // one is the whole reason this was rebuilt. The moments are the LOCK (the spin stops and you now
  // have a thing) and the FIRE (you no longer do), and each gets its own one-shot.
  const LOCK_T = 0.62, FIRED_T = 0.34, BLURB_T = 3.4;
  let slotCls = null, lastFace = '', lastItemName = '';
  let lastAct = '', lastSub = '', lastHeldId = null, lockT = 0, firedT = 0, blurbT = 0;

  // blurbs arrive as sentences ("Drops 3 slicks behind you. They spin out."); the HUD speaks in
  // caps and has room for one clause
  function blurbOf(def) {
    if (!def || !def.blurb) return '';
    return String(def.blurb).split('.')[0].toUpperCase();
  }

  function setText(el, key, txt) {
    if (el && key !== txt) el.textContent = txt;
    return txt;
  }

  function updateItems(dt) {
    const P = RR.Powerups;
    const on = !!(P && P.active && P.active());
    if (!on) {
      if (slotCls !== '') { els.slot.className = ''; slotCls = ''; }
      if (incOn) { els.inc.classList.remove('on'); incOn = false; }
      return;
    }
    const roll = P.rolling ? P.rolling() : 0;
    const face = P.rollFace ? P.rollFace() : null;
    const held = P.held ? P.held() : null;
    const hid = held ? held.id : null;

    // held() stays null for the whole 0.85 s spin, so this edge IS the lock
    if (hid !== lastHeldId) {
      if (hid) { lockT = LOCK_T; blurbT = BLURB_T; } else if (lastHeldId) { firedT = FIRED_T; }
      lastHeldId = hid;
    }
    if (lockT > 0) lockT -= dt;
    if (firedT > 0) firedT -= dt;
    if (blurbT > 0) blurbT -= dt;

    const fid = face ? face.id : '';
    if (fid !== lastFace) {
      drawIcon(face);
      lastFace = fid;
      els.slot.style.setProperty('--item',
        face ? '#' + face.color.toString(16).padStart(6, '0') : '#7EC8E3');
    }

    const state = roll > 0 ? 'roll' : hid ? 'held' : 'empty';
    const cls = 'on ' + state + (lockT > 0 ? ' lock' : '') + (firedT > 0 ? ' fired' : '');
    if (cls !== slotCls) { els.slot.className = cls; slotCls = cls; }

    // The blade carries the loudest thing there is to say. Empty, that is not the word "empty" —
    // it is what to do about it.
    const nm = held ? held.name : (roll > 0 && face) ? face.name : 'DRIVE INTO A CRATE';
    lastItemName = setText(els.itemName, lastItemName, nm);
    lastAct = setText(els.itemAct, lastAct, held ? 'FIRE' : roll > 0 ? '' : 'EMPTY');
    lastSub = setText(els.itemSub, lastSub, held && blurbT > 0 ? blurbOf(held) : '');
    if (els.itemKey && P.KEY && els.itemKey.textContent !== P.KEY) els.itemKey.textContent = P.KEY;

    const status = P.status ? P.status() : null;   // one call, two readers: status() allocates
    updatePips(P, status);
    watchHits(P);
    updateIncoming(P);
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

    drawBoost(boat.boostEnergy || 0, (boat.boostHeat || 0) > 0.35);

    updateItems(dt);
    paintHintKeys(race);

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
    hintItems = null; hintTour = null;
    clearCall(); callWall = -1e9;
    slotCls = null; lastFace = ''; lastItemName = '';
    lastAct = ''; lastSub = ''; lastHeldId = null; lockT = firedT = blurbT = 0;
    // a stamp from the previous run would otherwise swallow the first real hit of this one
    lastHitAt = -1e9;
    incOn = false; incTxt = ''; incNear = null;
    if (els) {
      els.hint.classList.remove('gone'); els.docent.classList.remove('on');
      els.slot.className = '';
      if (els.inc) els.inc.classList.remove('on');
      els.itemName.textContent = 'DRIVE INTO A CRATE';
      if (els.itemAct) els.itemAct.textContent = 'EMPTY';
      if (els.itemSub) els.itemSub.textContent = '';
      els.slot.style.setProperty('--item', '#7EC8E3');
      drawIcon(null);
      for (const p of pipEls) { p.el.classList.remove('on'); p.on = false; p.w = -1; }
    }
  };

  RR.HUD = H;
})();

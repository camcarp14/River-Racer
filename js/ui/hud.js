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
  <div id="item-slot">
    <div id="item-lab">ITEM</div>
    <div id="item-box"><canvas id="item-icon" width="192" height="192"></canvas><b id="item-key">E</b></div>
    <div id="item-name">RUN A CRATE</div>
    <div id="item-pips"></div>
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
  <div id="boost-hint"><b>W/↑</b> throttle &nbsp;<b>A·D/←·→</b> steer &nbsp;<b>S/↓</b> brake &amp; reverse &nbsp;<b>SHIFT</b> boost &nbsp;<b class="key">E</b> fire your item<br><b>B</b> look astern &nbsp;<b>C</b> camera &nbsp;<b>[ ]</b> shot &nbsp;<b>N</b> time of day &nbsp;<b>G</b> green river &nbsp;<b>P</b> photo &nbsp;<b>R</b> reset &nbsp;<b>ESC</b> pause</div>`;

  const CINE = `<div class="bar t"></div><div class="bar b"></div><div class="meta"></div><div class="rec">REC</div>`;

  // every ring radius below is quoted in these units, so the three dial layers stay concentric
  const RING_EM = 11.9;

  let cpFlashT = 0, tagT = 0, tagName = null;
  const tagSeen = new Map();            // name -> ms, so a landmark never re-announces within 45 s
  const chips = new Map();              // kind -> {el, t}
  let lastPos = 0, lastBoost = '', lastSpeed = -1, lastArc = '';
  let lastLap = '', lastTimer = '', lastWrong = null;
  let hintT = 0, hintGone = false;
  let tickerT = 0;

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
      slot: $('item-slot'), icon: $('item-icon'), itemName: $('item-name'), pips: $('item-pips'),
      call: $('item-call'),
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
    if (!on) { clearCall(); els.slot.className = ''; slotCls = ''; }
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
    if (kind === 'item') { itemCall(text, /FENDER TOOK/.test(text) ? 'save' : 'fire'); return; }
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
    // the wake slick is nearly black: unlifted it is a hole in the plate, not an icon
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
    ctx.clearRect(0, 0, S, S);
    ctx.strokeStyle = ctx.fillStyle = def ? iconInk(def.color) : 'rgba(159,195,214,.5)';
    ctx.lineWidth = S * 0.09;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const id = def ? def.id : null;

    const chev = (x, w, h, lw) => {
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(x - w, c - h); ctx.lineTo(x, c); ctx.lineTo(x - w, c + h);
      ctx.stroke();
    };
    const arcs = (cx, r0, n, a0, a1) => {
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.arc(cx, c, r0 + i * S * 0.11, a0, a1);
        ctx.stroke();
      }
    };

    if (id === 'turbo') {
      for (let i = 0; i < 3; i++) chev(c * 0.62 + i * S * 0.20, S * 0.14, S * 0.20, S * 0.085);
    } else if (id === 'fender') {
      ctx.lineWidth = S * 0.085;
      ctx.beginPath(); ctx.arc(c, c, S * 0.30, 0.35, Math.PI * 2 - 0.35); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(c, c, S * 0.155, S * 0.31, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (id === 'slick') {
      ctx.lineWidth = S * 0.075;
      for (let r = 0; r < 3; r++) {
        const y = c + (r - 1) * S * 0.19;
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) {
          const x = S * 0.19 + (S * 0.62) * (i / 24);
          const yy = y + Math.sin(i / 24 * Math.PI * 2 + r) * S * 0.045;
          if (i) ctx.lineTo(x, yy); else ctx.moveTo(x, yy);
        }
        ctx.stroke();
      }
    } else if (id === 'dye') {
      ctx.beginPath(); ctx.arc(c, c, S * 0.145, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = S * 0.062;
      arcs(c, S * 0.235, 2, 0, Math.PI * 2);
    } else if (id === 'deepdish') {
      ctx.lineWidth = S * 0.12;
      ctx.beginPath(); ctx.arc(c, c, S * 0.28, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(c, c); ctx.lineTo(c + S * 0.21, c - S * 0.12); ctx.lineTo(c + S * 0.21, c + S * 0.12);
      ctx.closePath(); ctx.fill();
    } else if (id === 'bowwave') {
      ctx.lineWidth = S * 0.075;
      arcs(c - S * 0.14, S * 0.12, 3, -1.05, 1.05);
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
    } else if (id === 'gale') {
      ctx.lineWidth = S * 0.075;
      const rows = [[0.30, 0.62], [0.50, 0.78], [0.70, 0.55]];
      for (const [fy, fw] of rows) {
        const y = S * fy, x1 = S * 0.16 + S * fw;
        ctx.beginPath(); ctx.moveTo(S * 0.16, y); ctx.lineTo(x1, y); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x1 - S * 0.10, y - S * 0.075); ctx.lineTo(x1, y); ctx.lineTo(x1 - S * 0.10, y + S * 0.075);
        ctx.stroke();
      }
    } else {
      // empty: the crate itself, so the thing to go and hit is the thing in the slot
      ctx.lineWidth = S * 0.07;
      ctx.strokeRect(S * 0.24, S * 0.24, S * 0.52, S * 0.52);
      ctx.beginPath();
      ctx.moveTo(S * 0.24, S * 0.40); ctx.lineTo(S * 0.76, S * 0.40);
      ctx.moveTo(S * 0.24, S * 0.60); ctx.lineTo(S * 0.76, S * 0.60);
      ctx.stroke();
    }
  }

  // ---------- the live-effect pips ----------
  // status() is seconds remaining; the bar is that over the tunable it started at, so a FENDER
  // running out looks like a FENDER running out and not like a label.
  const PIPS = [['shield', 'FENDER', 'SHIELD_T', 12], ['heavy', 'HEAVY', 'HEAVY_T', 7],
    ['spin', 'SPIN', 'SPIN_T', 1], ['blind', 'BLIND', 'BLIND_T', 1],
    ['gulls', 'GULLS', 'GULL_T', 3], ['gale', 'GALE', 'GALE_T', 1.2]];
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
  // fire = you did it, hit = it was done to you, save = the FENDER ate it. One line, one plate,
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
    // a hit landing in the same frame as your own FENDER eating it must not shout over the save
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

  // ---------- rising edges: what just landed on you ----------
  const HITS = [['spin', 'SPUN OUT'], ['blind', 'BLINDED'], ['gulls', 'GULLS ON YOU'],
    ['gale', 'GALE OFF THE LAKE']];
  const wasHit = { spin: 0, blind: 0, gulls: 0, gale: 0 };
  function watchHits(s) {
    if (!s) return;
    for (let i = 0; i < HITS.length; i++) {
      const k = HITS[i][0], v = s[k] || 0;
      if (v > wasHit[k] + 0.05) hitCall(HITS[i][1]);
      wasHit[k] = v;
    }
  }

  // The bow wave leaves no timer on you, only a shove, so the only honest signal is the firing
  // itself. onUse is the module's published hook and the HUD is its natural owner.
  let puHooked = false;
  function hookPowerups(P) {
    if (puHooked || !P.onUse) return;
    puHooked = true;
    P.onUse((boat, item) => {
      if (!boat || boat.isPlayer || !item || item.id !== 'bowwave' || !curBoat) return;
      const R = (P.K && P.K.WAVE_R) || 26;
      if (RR.U.dist2(curBoat.pos.x, curBoat.pos.z, boat.pos.x, boat.pos.z) <= R * R) hitCall('BOW WAVE');
    });
  }

  let curBoat = null, slotCls = null, lastFace = '', lastItemName = '';
  function updateItems() {
    const P = RR.Powerups;
    const on = !!(P && P.active && P.active());
    if (!on) {
      if (slotCls !== '') { els.slot.className = ''; slotCls = ''; }
      return;
    }
    hookPowerups(P);
    const roll = P.rolling ? P.rolling() : 0;
    const face = P.rollFace ? P.rollFace() : null;
    const held = P.held ? P.held() : null;
    const fid = face ? face.id : '';
    if (fid !== lastFace) {
      drawIcon(face);
      lastFace = fid;
      if (face) els.slot.style.setProperty('--item', '#' + face.color.toString(16).padStart(6, '0'));
    }
    const cls = 'on ' + (roll > 0 ? 'roll' : held ? 'held' : 'empty');
    if (cls !== slotCls) { els.slot.className = cls; slotCls = cls; }
    const nm = held ? held.name : (roll > 0 && face) ? face.name : 'RUN A CRATE';
    if (nm !== lastItemName) { els.itemName.textContent = nm; lastItemName = nm; }
    const status = P.status ? P.status() : null;   // one call, two readers: status() allocates
    updatePips(P, status);
    watchHits(status);
  }

  // ---------- per frame ----------
  H.update = function (dt, boat, race) {
    if (!els) return;
    curBoat = boat;
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

    updateItems();

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
    clearCall(); callWall = -1e9;
    slotCls = null; lastFace = ''; lastItemName = '';
    wasHit.spin = wasHit.blind = wasHit.gulls = wasHit.gale = 0;
    if (els) {
      els.hint.classList.remove('gone'); els.docent.classList.remove('on');
      els.slot.className = '';
      drawIcon(null);
      for (const p of pipEls) { p.el.classList.remove('on'); p.on = false; p.w = -1; }
    }
  };

  RR.HUD = H;
})();

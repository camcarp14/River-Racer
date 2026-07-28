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
  <div id="chain"><div id="chain-lab">SALUTE</div><div id="chain-num">&times;0</div><div id="chain-sub"></div></div>
  <div id="salute">
    <canvas id="sal-ring" width="420" height="224"></canvas>
    <div id="sal-cue"></div>
    <div id="sal-name"></div>
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
  <div id="boost-hint"><b>W/↑</b> throttle &nbsp;<b>A·D/←·→</b> steer &nbsp;<b>S/↓</b> brake &nbsp;<b>SHIFT</b> boost &nbsp;<b class="key">SPACE</b> ask for the bridge<br><b>C</b> camera &nbsp;<b>[ ]</b> shot &nbsp;<b>N</b> time of day &nbsp;<b>G</b> green river &nbsp;<b>P</b> photo &nbsp;<b>R</b> reset &nbsp;<b>ESC</b> pause</div>`;

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
      chain: $('chain'), chainNum: $('chain-num'), chainSub: $('chain-sub'),
      salute: $('salute'), salRing: $('sal-ring'), salCue: $('sal-cue'), salName: $('sal-name'),
      cine, cineMeta: cine.querySelector('.meta'),
    };
    els.boostCtx = els.boost ? els.boost.getContext('2d') : null;
    els.salCtx = els.salRing ? els.salRing.getContext('2d') : null;

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

  // ================================================================= THE SALUTE
  // RR.Salute is read here and never written: W1 owns the logic and touches no DOM, this file
  // owns the DOM and touches no logic. Every field below degrades to "widget hidden" if the
  // module or the bridge tunables are missing.

  // ---------- the chain numeral ----------
  let lastChainTxt = '', lastTier = -1, lastZero = null;
  let chainEvent = null, chainEventT = 99, deadHold = false, deadTimer = 0, subT = 0;
  let lastSub = '', lastSubCls = '';
  let runRace = null, runBest = 0;

  // best chain of THIS run, for the results strip — RR.Salute.best is the whole session's
  H.runChain = function () { return runBest; };

  function chainCall(kind, n) {
    if (kind === 'miss') {
      // the break: the old number flashes red and dies, and only then does the zero appear
      els.chainNum.textContent = '×' + n;
      lastChainTxt = '';
      els.chainNum.classList.remove('pop', 'dead');
      void els.chainNum.offsetWidth;
      els.chainNum.classList.add('dead');
      // wall clock, not sim clock: the CSS keyframes run on wall time and a stalled frame must
      // not skip the one animation in the HUD that has to be seen
      deadHold = true;
      if (deadTimer) clearTimeout(deadTimer);
      deadTimer = setTimeout(clearDead, 640);
      setSub('CHAIN LOST', 'bad', 1.5);
      return;
    }
    if (kind === 'clean' || kind === 'threaded') {
      els.chainNum.classList.remove('pop');
      void els.chainNum.offsetWidth;
      els.chainNum.classList.add('pop');
      setSub(kind === 'threaded' ? 'THREADED ×3' : 'CLEAN SALUTE', '', 1.3);
    } else if (kind === 'bank') setSub('BANKED ×' + n + ' → BOOST', 'bank', 1.7);
    else if (kind === 'ask') setSub('THE BRIDGE ANSWERS', 'bank', 1.2);
  }

  function clearDead() {
    deadHold = false; deadTimer = 0; lastChainTxt = '';
    if (els) els.chainNum.classList.remove('dead');
  }

  function setSub(text, cls, secs) {
    subT = secs;
    if (text !== lastSub) { els.chainSub.textContent = text; lastSub = text; }
    const c = 'on' + (cls ? ' ' + cls : '');
    if (c !== lastSubCls) { els.chainSub.className = c; lastSubCls = c; }
  }

  function updateChain(dt, race) {
    const S = RR.Salute;
    const on = !!(S && race && !race.tour);
    els.chain.classList.toggle('on', on);
    if (!on) { runRace = race; runBest = 0; return; }
    if (race !== runRace) { runRace = race; runBest = 0; }
    if (S.chain > runBest) runBest = S.chain;

    // a callout restarts eventT at zero, so a repeat of the same kind is still a new event
    if (S.event && (S.event !== chainEvent || S.eventT < chainEventT)) {
      chainEvent = S.event;
      chainCall(S.event, S.eventN);
    }
    chainEventT = S.eventT;

    if (!deadHold) {
      const txt = '×' + S.chain;
      if (txt !== lastChainTxt) { els.chainNum.textContent = txt; lastChainTxt = txt; }
    }

    const tier = S.tier | 0;
    const zero = S.chain === 0 && !deadHold;
    if (tier !== lastTier || zero !== lastZero) {
      els.chain.className = 'on' + (zero ? ' zero' : '') + (tier ? ' t' + tier : '');
      lastTier = tier; lastZero = zero;
    }

    // BANK is offered only when a press could not possibly be meant for a bridge, so the prompt
    // appears only when the press really would spend the chain
    if (subT > 0) subT -= dt;
    if (subT <= 0) {
      if (S.bankable) setSub('BANK ×' + S.chain + ' →', 'bank', 0.2);
      else if (lastSubCls !== '') { els.chainSub.className = ''; lastSubCls = ''; }
    }
  }

  // ---------- the arc ----------
  const SAL_CX = 210, SAL_CY = 172, SAL_R = 148, SAL_W = 420, SAL_H = 224;
  let salRamp = null, salRampFor = null, lastCue = '', lastName = '', lastSalCls = '';

  // the ramp moored on this span's approach, if any — five of the six sit 40-48 m upstream of a
  // bascule, which is the whole reason the ceiling can wreck you
  function rampFor(span) {
    if (span === salRampFor) return salRamp;
    salRampFor = span; salRamp = null;
    const L = RR.Ramps && RR.Ramps.list;
    if (L) {
      for (let i = 0; i < L.length; i++) {
        if (RR.U.dist2(L[i].bx, L[i].bz, span.x, span.z) < 900) { salRamp = L[i]; break; }
      }
    }
    return salRamp;
  }

  function salArc(ctx, u0, u1, w, col, glow) {
    if (u1 <= u0) return;
    ctx.lineWidth = w;
    ctx.strokeStyle = col;
    ctx.shadowBlur = glow ? 13 : 0;
    ctx.shadowColor = col;
    ctx.beginPath();
    ctx.arc(SAL_CX, SAL_CY, SAL_R, Math.PI * (1 + u0), Math.PI * (1 + u1));
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function salPip(ctx, u, col, big) {
    const a = Math.PI * (1 + RR.U.clamp(u, 0, 1));
    ctx.save();
    ctx.translate(SAL_CX + Math.cos(a) * SAL_R, SAL_CY + Math.sin(a) * SAL_R);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = col;
    const h = big ? 26 : 16, w = big ? 9 : 5;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }

  // The ring carries two different readouts because the player asks two different questions.
  // Before the ask it is the WINDOW: a fuse burning from the far edge toward the near one, with a
  // red tail where a press would no longer clear the leaves in time. After the tender answers it
  // is the LIFT CYCLE: a green band where the slot is genuinely open and a fat pip showing where
  // this boat, at this speed, actually arrives.
  function drawSalute(m) {
    const ctx = els.salCtx;
    ctx.clearRect(0, 0, SAL_W, SAL_H);
    ctx.lineCap = 'butt';
    // dark casing first: this widget lives over sunlit water, where a translucent ring vanishes
    salArc(ctx, 0, 1, 23, 'rgba(4,18,27,.55)');
    salArc(ctx, 0, 1, 17, 'rgba(126,200,227,.22)');
    if (m.mode === 'armed') {
      // the band is where the slot is genuinely open; the fat pip is where THIS boat arrives
      salArc(ctx, m.b0, m.b1, 17, m.ok ? 'rgba(62,209,126,.85)' : 'rgba(62,209,126,.40)', m.ok);
      salArc(ctx, 0, m.uNow, 5, 'rgba(255,255,255,.45)');
      salPip(ctx, m.uArr, m.ok ? '#3ED17E' : '#EF3340', true);
    } else if (m.mode === 'shut') {
      salArc(ctx, 0, 1, 17, 'rgba(239,51,64,.42)');
    } else {
      const wait = m.mode === 'wait';
      salArc(ctx, m.f, 1, 17, wait ? 'rgba(126,200,227,.42)' : '#FFC857', !wait);
      if (m.fLate < 1) salArc(ctx, Math.max(m.f, m.fLate), 1, 17, '#EF3340');
      salPip(ctx, m.f, wait ? '#9FC3D6' : '#FFC857', true);
    }

    // the leaves themselves, hinged at their banks: the same machine the steel is running
    const hw = SAL_R * 0.60, L = 84, th = RR.U.clamp(m.open, 0, 1) * 1.12;
    const tx = Math.cos(th) * L, ty = Math.sin(th) * L;
    if (m.clean) {
      ctx.fillStyle = 'rgba(126,200,227,.20)';
      ctx.fillRect(SAL_CX - (hw - tx), SAL_CY - ty - 3, (hw - tx) * 2, ty + 3);
    }
    ctx.lineWidth = 7;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(126,200,227,.34)';
    ctx.beginPath();
    ctx.moveTo(SAL_CX - hw - 32, SAL_CY); ctx.lineTo(SAL_CX - hw, SAL_CY);
    ctx.moveTo(SAL_CX + hw, SAL_CY); ctx.lineTo(SAL_CX + hw + 32, SAL_CY);
    ctx.stroke();
    ctx.lineCap = 'round';
    for (let p = 0; p < 2; p++) {
      ctx.lineWidth = p ? 11 : 16;
      ctx.strokeStyle = p ? (m.clean ? '#EAF6FF' : '#8F4A3A') : 'rgba(4,18,27,.6)';
      ctx.beginPath();
      ctx.moveTo(SAL_CX - hw, SAL_CY); ctx.lineTo(SAL_CX - hw + tx, SAL_CY - ty);
      ctx.moveTo(SAL_CX + hw, SAL_CY); ctx.lineTo(SAL_CX + hw - tx, SAL_CY - ty);
      ctx.stroke();
    }
  }

  const SM = { mode: 'wait', f: 0, fLate: 1, open: 0, clean: false, ok: false, b0: 0, b1: 1, uNow: 0, uArr: 0 };

  function updateSalute(boat, race) {
    const S = RR.Salute, B = RR.Bridges;
    const tgt = S && S.target;
    const on = !!(tgt && tgt.opening && B && race && !race.tour && els.salCtx);
    if (!on) {
      if (lastSalCls !== '') { els.salute.className = ''; lastSalCls = ''; }
      return;
    }

    const LIFT = B.LIFT_S, CL = B.CLEAN_OPEN;
    const CYC = LIFT + B.HOLD_S + B.FALL_S;
    const t0 = LIFT * CL;                                   // leaves reach clean here
    const t1 = LIFT + B.HOLD_S + B.FALL_S * (1 - CL);       // and drop back through it here
    const spd = Math.max(6, Math.hypot(boat.vel.x, boat.vel.z));
    const eta = S.dist / spd;

    SM.open = S.open;
    SM.clean = S.open > CL;
    SM.fLate = 1;
    let cue, cls;
    if (S.armed && tgt.opening.cmd != null) {
      const el = (RR.Engine.time ? RR.Engine.time() : 0) - tgt.opening.cmd;
      const arrive = el + eta;
      SM.mode = 'armed';
      SM.ok = arrive > t0 && arrive < t1;
      SM.b0 = t0 / CYC; SM.b1 = t1 / CYC;
      SM.uNow = RR.U.clamp(el / CYC, 0, 1);
      SM.uArr = RR.U.clamp(arrive / CYC, 0, 1);
      cue = SM.ok ? 'CLEAR' : arrive <= t0 ? 'EARLY' : 'LATE';
      cls = SM.ok ? 'ok' : 'bad';
    } else if (S.dist > B.WINDOW_M) {
      SM.mode = 'wait'; SM.f = 0; SM.ok = false;
      cue = ''; cls = 'wait';
    } else if (S.dist >= B.WINDOW_NEAR_M) {
      SM.mode = 'ask';
      SM.f = 1 - S.window;
      // a press only pays if the leaves can still make it: this is where that stops being true
      SM.fLate = RR.U.clamp((B.WINDOW_M - spd * t0) / (B.WINDOW_M - B.WINDOW_NEAR_M), 0, 1);
      SM.ok = eta > t0 && eta < t1;
      cue = eta <= t0 ? 'TOO LATE' : eta >= t1 ? 'WAIT' : 'SPACE';
      cls = eta <= t0 ? 'bad' : eta >= t1 ? 'wait' : 'ask';
    } else {
      SM.mode = 'shut'; SM.f = 1; SM.ok = false;
      cue = SM.clean ? 'GO' : 'SHUT';
      cls = SM.clean ? 'ok' : 'bad';
    }
    drawSalute(SM);

    if (cue !== lastCue) { els.salCue.textContent = cue; lastCue = cue; }
    const c = 'on ' + cls;
    if (c !== lastSalCls) { els.salute.className = c; lastSalCls = c; }

    let name = String(tgt.name || 'BASCULE').toUpperCase() + '<b>' + Math.round(S.dist) + ' M</b>';
    const rp = rampFor(tgt);
    if (rp) {
      const dx = rp.x - boat.pos.x, dz = rp.z - boat.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 135 && dx * Math.sin(boat.heading) + dz * Math.cos(boat.heading) > 2) {
        name += '<i class="' + (SM.ok || SM.clean ? '' : 'no') + '">▲ RAMP ' + Math.round(d) + ' M</i>';
      }
    }
    if (name !== lastName) { els.salName.innerHTML = name; lastName = name; }
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

    updateChain(dt, race);
    updateSalute(boat, race);

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
    runRace = null; runBest = 0;
    chainEvent = null; chainEventT = 99; subT = 0;
    if (deadTimer) clearTimeout(deadTimer);
    deadHold = false; deadTimer = 0;
    lastChainTxt = ''; lastTier = -1; lastZero = null; lastSub = ''; lastSubCls = '';
    lastCue = ''; lastName = ''; lastSalCls = ''; salRamp = null; salRampFor = null;
    if (els) {
      els.hint.classList.remove('gone'); els.docent.classList.remove('on');
      els.chainNum.classList.remove('pop', 'dead');
      els.chainSub.className = ''; els.salute.className = '';
    }
  };

  RR.HUD = H;
})();

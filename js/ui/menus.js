/* River Racer — menu flow: title → vehicle → course → race → results.
   The identity here is the Chicago flag: two light-blue bars at their true proportions and four
   six-pointed stars, each captioned with what it actually commemorates. The flag is a map of this
   course — two bars for the river's branches — which is why it sits behind the title. */
(function () {
  const MENU = {};
  const $ = (id) => document.getElementById(id);
  let root, screen = 'title', sel = 0, vehicleIdx = 0, courseIdx = 0;
  let onStartRace = null;
  let timeTrial = false, tourMode = false, cupMode = false, cupPending = false;

  const STAR = '<i class="star6"></i>';
  const STAR_CAPS = ['FORT DEARBORN', 'GREAT FIRE 1871', 'COLUMBIAN EXPO 1893', 'CENTURY OF PROGRESS 1933'];

  MENU.init = function (startRaceCb) {
    root = $('menu');
    onStartRace = startRaceCb;
    showTitle();
  };

  MENU.screen = () => screen;
  MENU.selection = () => ({ vehicleIdx, courseIdx });

  function html(s) {
    root.innerHTML = s;
    root.classList.remove('off');
    root.classList.toggle('showroom', screen === 'vehicle');
    root.classList.toggle('title-screen', screen === 'title');
    root.classList.toggle('paused', screen === 'pause');
    // the post-race screens sit over a still-rendering city: without a scrim the tables are unreadable
    root.classList.toggle('scrim', screen === 'cup' || screen === 'results');
  }
  MENU.hide = function () { root.classList.add('off'); root.classList.remove('paused', 'title-screen', 'scrim'); screen = 'none'; };

  // ---------- livery: purely cosmetic, remembered between sessions ----------
  const LIVERIES = [null, 0xD8DCE0, 0x2F8F4F, 0x8A2FB0, 0xE07820, 0x16303F];
  let liveryIdx = (() => { try { return Math.max(0, Math.min(5, parseInt(localStorage.getItem('rr_livery') || '0', 10) || 0)); } catch (e) { return 0; } })();
  MENU.livery = () => LIVERIES[liveryIdx];

  // ---------- title ----------
  function showTitle() {
    screen = 'title'; sel = 0; timeTrial = false; tourMode = false; cupMode = false; cupPending = false;
    const cup = RR.Race && RR.Race.cup ? RR.Race.cup() : null;
    const rounds = (RR.Race && RR.Race.CUP_ROUNDS ? RR.Race.CUP_ROUNDS.length : 4);
    // a championship in progress is a thing you RESUME, and the title screen should say where you are
    const cupLabel = !cup ? 'CHAMPIONSHIP'
      : cup.done ? 'CHAMPIONSHIP · FINAL'
        : 'CHAMPIONSHIP · ROUND ' + Math.min(rounds, cup.round + 1) + '/' + rounds;
    html(`
      <div class="stars">${STAR_CAPS.map((c) => '<div class="starcol">' + STAR + '<span>' + c + '</span></div>').join('')}</div>
      <div id="title">RIVER<br>RACER</div>
      <div id="subtitle">CHICAGO · LAKE MICHIGAN</div>
      <div class="menu-list">
        <div class="menu-item" data-i="0">RACE</div>
        <div class="menu-item" data-i="1">${cupLabel}</div>
        <div class="menu-item" data-i="2">TIME TRIAL</div>
        <div class="menu-item" data-i="3">ARCHITECTURE TOUR</div>
        <div class="menu-item" data-i="4">MULTIPLAYER</div>
        <div class="menu-item" data-i="5">HOW TO PLAY</div>
      </div>
      <div class="menu-note">↑↓ SELECT · ENTER CONFIRM · ♪ PRESS ANY KEY FOR SOUND<br>BUILT ON THE REAL CHICAGO RIVER</div>
    `);
    bindClicks([
      () => showVehicles({}),
      () => { cupMode = true; if (cup) showCupBoard(-1); else { cupPending = true; showVehicles({ cup: true }); } },
      () => showVehicles({ tt: true }),
      () => { tourMode = true; showVehicles({ tour: true }); },
      () => { if (RR.NetUI && RR.NetUI.openEntry) RR.NetUI.openEntry(); },
      showHelp,
    ]);
    paintSel();
    RR.Audio.setMusic(true);
  }
  MENU.showTitle = showTitle;
  MENU.toTitle = showTitle;

  function showHelp() {
    screen = 'help'; sel = 0;
    html(`
      <div id="select-title">HOW TO PLAY</div>
      <div class="menu-note" style="font-size:15px;max-width:640px;line-height:2.1;">
        <b>W / ↑</b> — throttle &nbsp;&nbsp; <b>S / ↓</b> — brake &amp; reverse &nbsp;&nbsp; <b>A·D / ←·→</b> — steer<br>
        <b>SHIFT</b> — boost. The bottom two cells of the meter are hatched: that is your reserve,
        and the engine will not light below it.<br>
        <b>C</b> camera &nbsp; <b>[ ]</b> cinematic shot &nbsp; <b>P</b> photo &nbsp; <b>N</b> time of day &nbsp;
        <b>G</b> green river &nbsp; <b>R</b> reset &nbsp; <b>ESC</b> pause<br><br>
        Thread the checkpoint buoys — <span style="color:#EF3340">red LEFT</span>,
        <span style="color:#3ED17E">green RIGHT</span>. Gold gates off the racing line pay boost.<br>
        Hold a drift and the meter fills; graze the wall at a shallow angle and you barely lose a thing —
        hit it square and you lose everything.
      </div>
      <div class="menu-list"><div class="menu-item sel" data-i="0">BACK</div></div>
    `);
    bindClicks([showTitle]);
  }

  // ---------- vehicle select: live 3D showroom ----------
  // The picker shows only the hulls you have earned, but the CATALOG keeps its numbering (indices
  // go over the wire and address the showroom). `ridePick` is that filtered view: card data-i and
  // `sel` are positions in it, and `.i` on each entry is the real catalog index.
  let ridePick = [];
  function showVehicles(opts) {
    opts = opts || {};
    screen = 'vehicle';
    ridePick = RR.Boats.pickable();
    if (!ridePick.length) ridePick = [{ v: RR.Boats.CATALOG[0], i: 0 }];
    const at = ridePick.findIndex((e) => e.i === vehicleIdx);
    if (at < 0) vehicleIdx = ridePick[0].i;      // last ride is locked again (or was never pickable)
    sel = Math.max(0, at);
    timeTrial = !!opts.tt; tourMode = !!opts.tour; cupMode = !!opts.cup;
    const cards = ridePick.map((e, k) => `
      <div class="card" data-i="${k}">
        <div class="tag">${e.v.kind.toUpperCase()}</div>
        <h3>${e.v.name}</h3>
        <canvas width="220" height="110" id="vcard-${k}"></canvas>
      </div>`).join('');
    const label = cupMode ? 'THE CHICAGO CUP' : tourMode ? 'ARCHITECTURE TOUR' : timeTrial ? 'TIME TRIAL' : 'RACE';
    html(`
      <div id="select-title">PICK YOUR RIDE</div>
      <div id="select-sub">${label} · ←→ SELECT · ENTER CONFIRM · BKSP BACK</div>
      <div id="ride-panel">
        <div class="tag" id="ride-kind"></div>
        <h3 id="ride-name"></h3>
        <div class="desc" id="ride-desc"></div>
        <canvas id="radar" width="260" height="260"></canvas>
        <div id="spec-sheet"></div>
        <div id="livery"></div>
      </div>
      <div id="cards" class="dock">${cards}</div>
    `);
    bindCards(ridePick.length, (k) => {
      vehicleIdx = ridePick[k].i;
      // the cup is created only once the difficulty is CHOSEN — creating it here stamped the
      // championship with the previous session's difficulty and wiped a cup already in progress
      if (cupMode) showDifficulty();
      else showCourses();
    });
    drawVehicleCards();
    buildLivery();
    paintSel();
  }

  // `spec` is the hull currently under the cursor, not the last one confirmed: the stock swatch
  // has to show the paint you are actually looking at.
  function buildLivery(spec) {
    const el = $('livery');
    if (!el) return;
    const base = spec || RR.Boats.CATALOG[vehicleIdx] || RR.Boats.CATALOG[0];
    el.innerHTML = LIVERIES.map((c, i) => {
      const hex = '#' + (c == null ? base.hull : c).toString(16).padStart(6, '0');
      return `<i data-l="${i}" class="${i === liveryIdx ? 'sel' : ''}" style="background:${hex}"></i>`;
    }).join('');
    el.querySelectorAll('i').forEach((n) => {
      n.addEventListener('click', (e) => {
        e.stopPropagation();
        liveryIdx = +n.dataset.l;
        try { localStorage.setItem('rr_livery', String(liveryIdx)); } catch (err) { /* fine */ }
        buildLivery(base);
        // the showroom speaks catalog indices, and `sel` is a position in the filtered picker
        if (MENU.onVehicleFocus) MENU.onVehicleFocus(ridePick[sel] ? ridePick[sel].i : vehicleIdx);
        RR.Audio.uiMove();
      });
    });
  }

  const SPECS = {
    jetski: [['LOA', '3.2 M'], ['BEAM', '1.15 M'], ['ENGINE', '1050 CC'], ['DRY', '310 KG']],
    speedboat: [['LOA', '7.8 M'], ['BEAM', '2.35 M'], ['ENGINE', 'TWIN V8'], ['DISP', '1.4 T']],
    f1: [['LOA', '5.4 M'], ['HULL', 'TUNNEL'], ['ENGINE', '2.5 L V6'], ['DRY', '390 KG']],
    runabout: [['LOA', '6.6 M'], ['HULL', 'MAHOGANY'], ['YEAR', '1947'], ['DISP', '1.2 T']],
    rescue: [['LOA', '7.8 M'], ['HULL', 'RIB COLLAR'], ['UNIT', 'CFD MARINE 7-1'], ['DISP', '1.6 T']],
    tourboat: [['LOA', '30.0 M'], ['BEAM', '7.4 M'], ['ENGINE', 'TWIN DIESEL'], ['SEATS', '180']],
    podracer: [['DRIVE', '2× RADIAL'], ['TETHER', 'PLASMA BINDER'], ['CLASS', 'BOONTA'], ['DRY', '390 KG']],
  };
  const AXES = ['SPEED', 'ACCEL', 'TURN', 'GRIP', 'BOOST'];
  function statVec(v) {
    return [v.top / 61, v.accel / 21, v.turn / 2.5, v.grip / 3.7, (v.boost - 1) / 0.30]
      .map((x) => RR.U.clamp(x, 0.04, 1));
  }
  let radarCur = null, radarGhost = null, radarFrom = null, radarT = 1;

  function updateRidePanel(k) {
    const e = ridePick[k];
    const v = e && e.v;
    const kind = $('ride-kind');
    if (!v || !kind) return;
    kind.textContent = v.kind.toUpperCase();
    $('ride-name').textContent = v.name;
    if ($('ride-desc')) $('ride-desc').textContent = v.desc;
    const spec = SPECS[v.id] || SPECS[v.kind] || [];
    $('spec-sheet').innerHTML = spec.map((r) => `<div class="k">${r[0]}</div><div class="v">${r[1]}</div>`).join('');
    const next = statVec(v);
    if (radarCur && radarCur.join() !== next.join()) radarGhost = radarCur.slice();
    radarFrom = radarCur ? radarCur.slice() : next.slice();
    radarCur = next;
    radarT = 0;
    buildLivery(v);
    if (MENU.onVehicleFocus) MENU.onVehicleFocus(e.i);
  }

  // Radar over four bars: a ghost of the previously-focused hull turns a stat display into a
  // decision tool for five lines of code.
  function drawRadar() {
    const cv = $('radar');
    if (!cv || !radarCur) return;
    const ctx = cv.getContext('2d');
    const S = cv.width, c = S / 2, R = S * 0.36;
    ctx.clearRect(0, 0, S, S);
    radarT = Math.min(1, radarT + 0.06);
    const k = 1 - Math.pow(1 - radarT, 3);
    const val = radarCur.map((x, i) => RR.U.lerp(radarFrom[i], x, k));
    const pt = (i, r) => {
      const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
      return [c + Math.cos(a) * R * r, c + Math.sin(a) * R * r];
    };
    ctx.lineWidth = 1;
    for (const ring of [0.25, 0.5, 0.75, 1.0]) {
      ctx.strokeStyle = 'rgba(126,200,227,.14)';
      ctx.beginPath();
      for (let i = 0; i < 5; i++) { const [x, y] = pt(i, ring); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.closePath(); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(126,200,227,.26)';
    for (let i = 0; i < 5; i++) {
      const [x, y] = pt(i, 1);
      ctx.beginPath(); ctx.moveTo(c, c); ctx.lineTo(x, y); ctx.stroke();
    }
    if (radarGhost) {
      ctx.fillStyle = 'rgba(255,200,87,.16)';
      ctx.beginPath();
      for (let i = 0; i < 5; i++) { const [x, y] = pt(i, radarGhost[i]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(126,200,227,.22)';
    ctx.strokeStyle = '#7EC8E3'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) { const [x, y] = pt(i, val[i]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#FFC857';
    for (let i = 0; i < 5; i++) { const [x, y] = pt(i, val[i]); ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#9FC3D6';
    ctx.font = '10px "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < 5; i++) { const [x, y] = pt(i, 1.18); ctx.fillText(AXES[i], x, y + 3); }
    ctx.textAlign = 'left';
    if (radarT < 1) requestAnimationFrame(drawRadar);
  }

  function drawVehicleCards() {
    ridePick.forEach((e, k) => {
      const v = e.v;
      const c = $('vcard-' + k);
      if (!c) return;
      const ctx = c.getContext('2d');
      const hull = '#' + v.hull.toString(16).padStart(6, '0');
      const deck = '#' + v.deck.toString(16).padStart(6, '0');
      const acc = '#' + v.accent.toString(16).padStart(6, '0');
      ctx.clearRect(0, 0, 220, 110);
      ctx.strokeStyle = 'rgba(126,200,227,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(8, 84);
      for (let x = 8; x < 212; x += 8) ctx.lineTo(x, 84 + Math.sin(x * 0.15 + k) * 2.5);
      ctx.stroke();
      ctx.save();
      ctx.translate(110, 70);
      const draw = {
        jetski() {
          ctx.fillStyle = hull; poly([[-38, 8], [30, 8], [44, -2], [30, -8], [-30, -10], [-42, -2]]);
          ctx.fillStyle = deck; poly([[-26, -8], [8, -8], [2, -20], [-20, -20]]);
          ctx.fillStyle = acc; poly([[8, -8], [26, -6], [30, -14], [12, -16]]);
        },
        speedboat() {
          ctx.fillStyle = hull; poly([[-70, 6], [52, 6], [78, -6], [50, -12], [-66, -12]]);
          ctx.fillStyle = deck; poly([[-62, -12], [46, -12], [40, -20], [-56, -20]]);
          ctx.fillStyle = acc; ctx.fillRect(-50, -18, 70, 3);
        },
        f1() {
          ctx.fillStyle = hull; poly([[-60, 6], [40, 6], [70, -4], [36, -8], [-56, -10]]);
          ctx.fillStyle = deck; poly([[-20, -8], [20, -8], [14, -22], [-12, -22]]);
          ctx.fillStyle = acc; ctx.fillRect(-56, -20, 26, 4);
        },
        runabout() {
          ctx.fillStyle = hull; poly([[-60, 6], [48, 6], [66, -8], [44, -13], [-56, -13]]);
          ctx.fillStyle = deck; poly([[-54, -13], [42, -13], [38, -18], [-48, -18]]);
          ctx.fillStyle = acc; ctx.fillRect(-40, -17, 60, 2);
        },
        // she fills the card because she fills the channel: a long low open deck under an awning,
        // with the pilot house right aft where the real architecture boats put it
        tourboat() {
          ctx.fillStyle = hull; poly([[-92, 8], [78, 8], [96, -2], [76, -9], [-88, -9]]);
          ctx.fillStyle = deck; ctx.fillRect(-84, -13, 156, 4);
          ctx.fillStyle = acc; poly([[-64, -15], [62, -15], [62, -19], [-64, -19]]);
          ctx.fillStyle = deck; ctx.fillRect(-60, -19, 4, 6); ctx.fillRect(56, -19, 4, 6);
          ctx.fillStyle = hull; poly([[-86, -13], [-56, -13], [-56, -27], [-84, -27]]);
        },
      };
      (draw[v.kind] || draw.speedboat)();
      ctx.restore();
      function poly(pts) { ctx.beginPath(); pts.forEach((p, j) => j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill(); }
    });
  }

  // ---------- difficulty ----------
  let difficulty = (() => { try { return parseFloat(localStorage.getItem('rr_diff')) || 1; } catch (e) { return 1; } })();
  MENU.difficulty = () => difficulty;
  const DIFFS = [
    { name: 'ROOKIE', v: 0.7, desc: 'Rivals cruise the scenic route. A friendly Sunday on the river.' },
    { name: 'SKIPPER', v: 1.0, desc: 'A fair fight from Wolf Point to the lighthouse.' },
    { name: 'LEGEND', v: 1.45, desc: 'They run the perfect line, never lift, and show no mercy.' },
  ];
  function showDifficulty() {
    screen = 'difficulty';
    sel = Math.max(0, DIFFS.findIndex((d) => d.v === difficulty));
    const rows = DIFFS.map((d, i) => `<div class="menu-item" data-i="${i}">${d.name}</div>`).join('');
    html(`
      <div id="select-title">HOW TOUGH ARE THE RIVALS?</div>
      <div id="select-sub">${cupMode ? 'FOUR ROUNDS AT THIS SETTING · ' : ''}↑↓ SELECT · ENTER RACE · BKSP BACK</div>
      <div class="menu-list">${rows}</div>
      <div class="menu-note" id="diff-desc" style="max-width:520px;">${DIFFS[sel].desc}</div>
    `);
    bindClicks(DIFFS.map((d) => () => {
      difficulty = d.v;
      try { localStorage.setItem('rr_diff', String(d.v)); } catch (e) { /* fine */ }
      if (cupMode && cupPending && RR.Race.cupBegin) { RR.Race.cupBegin(vehicleIdx, difficulty, 6); cupPending = false; }
      launch();
    }));
    paintSel();
  }

  // ---------- course select ----------
  function showCourses() {
    screen = 'course'; sel = courseIdx;
    const cards = RR.Race.COURSES.map((c, i) => {
      const best = RR.Race.best(c.id);
      return `
      <div class="card" data-i="${i}">
        <div class="tag">${c.loop ? c.laps + ' LAPS' : 'SPRINT'}</div>
        <h3>${c.name}</h3>
        <canvas width="220" height="110" id="ccard-${i}"></canvas>
        <div class="desc">${c.desc}</div>
        <div class="statbar"><span>BEST&nbsp;</span><span style="color:#FFC857">${best ? RR.U.formatTime(best) : '—'}</span></div>
      </div>`;
    }).join('');
    html(`
      <div id="select-title">PICK YOUR WATER</div>
      <div id="select-sub">←→ SELECT · ENTER RACE · BKSP BACK</div>
      <div id="cards">${cards}</div>
    `);
    bindCards(RR.Race.COURSES.length, (i) => { courseIdx = i; (timeTrial || tourMode) ? launch() : showDifficulty(); });
    drawCourseCards();
    paintSel();
  }

  function drawCourseCards() {
    RR.Race.COURSES.forEach((c, i) => {
      const cv = $('ccard-' + i);
      if (!cv) return;
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, 220, 110);
      let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      for (const key in RR.River.paths) {
        const p = RR.River.paths[key];
        for (let j = 0; j < p.n; j += 6) {
          minX = Math.min(minX, p.x[j]); maxX = Math.max(maxX, p.x[j]);
          minZ = Math.min(minZ, p.z[j]); maxZ = Math.max(maxZ, p.z[j]);
        }
      }
      const s = Math.min(190 / (maxX - minX), 86 / (maxZ - minZ));
      const ox = 110 - (minX + maxX) / 2 * s, oy = 55 - (minZ + maxZ) / 2 * s;
      ctx.strokeStyle = 'rgba(126,200,227,0.25)';
      ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (const key in RR.River.paths) strokePath(RR.River.paths[key]);
      ctx.strokeStyle = '#FFC857';
      ctx.lineWidth = 2.4;
      for (const seg of c.segments) {
        const p = RR.River.paths[seg.path];
        if (p) strokePath(p, seg.fromFrac || 0, seg.toFrac == null ? 1 : seg.toFrac);
      }
      function strokePath(p, f0, f1) {
        const j0 = Math.floor((f0 || 0) * (p.n - 1)), j1 = Math.ceil((f1 == null ? 1 : f1) * (p.n - 1));
        ctx.beginPath();
        for (let j = j0; j <= j1; j += 4) {
          const x = p.x[j] * s + ox, y = p.z[j] * s + oy;
          if (j === j0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    });
  }

  // ---------- results ----------
  function hullName(b) {
    return String((b && b.spec && b.spec.name) || '—').toUpperCase();
  }
  function fmtGap(d) {
    return d < 60 ? '+' + d.toFixed(2) : '+' + RR.U.formatTime(d);
  }
  function resultRows(results, cup) {
    const t0 = results.length && isFinite(results[0].time) ? results[0].time : 0;
    return results.map((r, i) => {
      const gap = isFinite(r.time) ? (i === 0 ? '+0.00' : fmtGap(r.time - t0)) : '—';
      const pts = cup ? `<span class="pts">${RR.Race.CUP_POINTS[Math.min(i, RR.Race.CUP_POINTS.length - 1)]}</span>` : '';
      return `
      <div class="result-row ${cup ? 'cup ' : ''}${r.boat && r.boat.isPlayer ? 'you ' : ''}p${i + 1}">
        <span class="p">${i + 1}</span>
        <span class="n">${r.boat && r.boat.isPlayer ? 'YOU' : String(r.boat && r.boat.pilotName || 'RIVAL').toUpperCase()}</span>
        <span class="h">${hullName(r.boat)}</span>
        <span class="t">${isFinite(r.time) ? RR.U.formatTime(r.time) : 'DNF'}</span>
        <span class="gap">${gap}</span>${pts}
      </div>`;
    }).join('');
  }

  MENU.showResults = function (results, courseId) {
    screen = 'results'; sel = 0;
    const prevBest = bestAtStart;
    const me = results.find((r) => r.boat && r.boat.isPlayer);
    const record = !!(me && isFinite(me.time) && (!prevBest || me.time < prevBest - 1e-6));
    // cupRecord() BANKS the round — call it exactly once, here, before anything reads the board
    const cup = cupMode && RR.Race.cupRecord ? RR.Race.cupRecord(results) : null;
    const board = cup && RR.Race.cupBoard ? RR.Race.cupBoard() : null;
    const fresh = board ? board.roundsDone - 1 : -1;
    const round = board && board.rounds[fresh] ? board.rounds[fresh] : null;
    const head = `<div class="result-head${cup ? ' cup' : ''}"><span>POS</span><span>PILOT</span><span>HULL</span><span>TIME</span><span>GAP</span>${cup ? '<span>PTS</span>' : ''}</div>`;
    const title = board ? 'ROUND ' + board.roundsDone + ' RESULT'
      : (results[0] && results[0].boat && results[0].boat.isPlayer ? 'RIVER CHAMP' : 'RACE COMPLETE');
    const sub = board
      ? 'THE CHICAGO CUP · ROUND ' + board.roundsDone + ' OF ' + board.total + (round ? ' · ' + up(round.name) : '')
      : 'BEST: ' + (prevBest ? RR.U.formatTime(prevBest) : '—');
    html(`
      <div id="select-title">${title}</div>
      <div id="select-sub">${sub}</div>
      ${record ? '<div id="record-banner">★ NEW COURSE RECORD ★</div>' : ''}
      <div id="results-list">${head}${resultRows(results, !!cup)}</div>
      <div class="menu-list" style="margin-top:1.4em;">
        ${board ? `<div class="menu-item" data-i="0">${board.done ? 'FINAL STANDINGS' : 'CHAMPIONSHIP STANDINGS'} ▸</div>
        <div class="menu-item" data-i="1">TITLE SCREEN</div>`
        : `<div class="menu-item" data-i="0">RACE AGAIN</div>
        <div class="menu-item" data-i="1">CHANGE COURSE</div>
        <div class="menu-item" data-i="2">TITLE SCREEN</div>`}
      </div>
    `);
    bindClicks(board
      ? [() => showCupBoard(fresh), () => { cupMode = false; showTitle(); }]
      : [() => launch(), () => { cupMode = false; showCourses(); }, () => { cupMode = false; showTitle(); }]);
    paintSel();
  };

  // ---------- the championship board ----------
  // Everything the owner asked for on one screen: which round just went, which is next, every
  // racer by name with their finish and points in each round, the running total, and the move
  // since last time. RR.Race.cupBoard() hands over the whole bracket; this only draws it.
  const CUP_TAGS = { mainstem: 'MAIN STEM', southbranch: 'S BRANCH', riverrun: 'RIVER RUN', lakecircuit: 'LAKE' };
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  function up(s) { return String(s == null ? '' : s).toUpperCase().replace(/[&<>"]/g, (c) => ESC[c]); }
  function ord(n) { return n + RR.U.ordinal(n); }
  function tagOf(r) { return CUP_TAGS[r.id] || String(r.name || '').split(' ')[0]; }

  // Standings as they stood BEFORE the last round, so the table can show who climbed and who fell.
  // Same tie-break as race.js (points, then wins, then best single finish, then the player).
  function movementMap(board) {
    const cut = board.roundsDone - 1;
    if (cut < 1) return null;                       // before round two everyone is level: no movement
    const prev = board.standings.map((r) => {
      let pts = 0, wins = 0, best = 99;
      for (let i = 0; i < cut; i++) {
        const p = r.perRound[i];
        if (!p) continue;
        pts += r.perRoundPts[i] || 0;
        if (p === 1) wins++;
        if (p < best) best = p;
      }
      return { idx: r.idx, isPlayer: r.isPlayer, pts, wins, best };
    });
    prev.sort((a, b) => (b.pts - a.pts) || (b.wins - a.wins) || (a.best - b.best) ||
      (a.isPlayer ? -1 : b.isPlayer ? 1 : a.idx - b.idx));
    const m = new Map();
    prev.forEach((r, i) => m.set(r.idx, i + 1));
    return m;
  }

  function cupBracket(board, fresh) {
    return '<div class="cup-bracket">' + board.rounds.map((r, i) => {
      const done = r.state === 'done', next = r.state === 'current';
      const mine = done ? r.results.find((x) => x.isPlayer) : null;
      const laps = r.laps > 1 ? r.laps + ' LAPS' : 'SPRINT';
      let l1, l2;
      if (done) {
        l1 = `<i class="star6"></i><b>${up(r.winner ? r.winner.name : '—')}</b>`;
        l2 = mine ? `YOU ${ord(mine.pos)} · ${mine.pts} PTS` : 'DID NOT RACE';
      } else if (next) {
        l1 = '<b>UP NEXT</b>';
        l2 = laps + ' · ' + board.points[0] + ' PTS TO WIN';
      } else {
        l1 = 'TO COME';
        l2 = laps;
      }
      const cls = done ? (i === fresh ? 'done fresh' : 'done') : next ? 'next' : 'later';
      return `<div class="cup-round ${cls}">
        <div class="rn">ROUND ${i + 1}</div>
        <div class="rname">${up(r.name)}</div>
        <div class="rline">${l1}</div>
        <div class="rline${done && mine ? ' me' : ''}">${l2}</div>
      </div>`;
    }).join('') + '</div>';
  }

  function cupSeasonTable(board) {
    const mv = movementMap(board);
    const head = `<div class="cup-row head">
      <span>POS</span><span class="n">PILOT</span>
      ${board.rounds.map((r, i) => `<span class="rh${r.state === 'current' ? ' now' : ''}">R${i + 1}<i>${up(tagOf(r))}</i></span>`).join('')}
      <span>WINS</span><span>PTS</span><span>+/−</span></div>`;
    const lead = Math.max(1, board.standings.length ? board.standings[0].pts : 1);
    const rows = board.standings.map((s) => {
      const cells = board.rounds.map((r, i) => {
        const pos = s.perRound[i];
        if (!pos) return `<span class="cup-cell none${r.state === 'current' ? ' now' : ''}">–</span>`;
        return `<span class="cup-cell p${pos}"><b class="pp">${pos}</b><i class="pv">+${s.perRoundPts[i] || 0}</i></span>`;
      }).join('');
      const d = mv ? (mv.get(s.idx) || s.pos) - s.pos : 0;
      const move = !mv ? '<span class="cup-mv">–</span>'
        : d > 0 ? `<span class="cup-mv up">▲${d}</span>`
          : d < 0 ? `<span class="cup-mv dn">▼${-d}</span>` : '<span class="cup-mv">–</span>';
      return `<div class="cup-row line p${s.pos}${s.isPlayer ? ' you' : ''}">
        <span class="ps">${s.pos}</span>
        <span class="n"><i class="bar" style="width:${(6 + 94 * s.pts / lead).toFixed(1)}%"></i>${s.isPlayer ? '<i class="star6"></i>' : ''}<b>${up(s.name)}</b></span>
        ${cells}
        <span class="cup-wins${s.wins ? ' has' : ''}">${s.wins || '–'}</span>
        <span class="cup-tot"><b>${s.pts}</b><i>${s.gap ? '−' + s.gap : 'LEADER'}</i></span>
        ${move}
      </div>`;
    }).join('');
    return `<div class="cup-table">${head}${rows}</div>`;
  }

  function cupChampionBand(board) {
    const c = board.champion;
    if (!c) return '';
    const p = board.player;
    const wins = c.wins + (c.wins === 1 ? ' WIN' : ' WINS');
    const tail = (!c.isPlayer && p) ? `<div class="sub2">YOU FINISHED ${ord(p.pos)} ON ${p.pts} POINTS</div>` : '';
    // the champion's own season, round by round — the bracket makes way for this screen, so the
    // run that won it has to survive somewhere
    const run = board.rounds.map((r, i) => {
      const pos = c.perRound[i];
      return `<span class="${pos === 1 ? 'w' : ''}">${up(tagOf(r))} <b>${pos ? ord(pos) : '—'}</b></span>`;
    }).join('');
    return `<div class="cup-champ${c.isPlayer ? ' mine' : ''}">
      <div class="band"><i class="star6"></i>CHICAGO CUP CHAMPION<i class="star6"></i></div>
      <div class="who">${c.isPlayer ? 'YOU' : up(c.name)}</div>
      <div class="sub">${c.pts} POINTS · ${wins} FROM ${board.total} ROUNDS</div>
      <div class="run">${run}</div>
      ${tail}
    </div>`;
  }

  // fresh = index of the round that has just been raced, or -1 when opened from the title screen
  function showCupBoard(fresh) {
    const board = RR.Race.cupBoard ? RR.Race.cupBoard() : null;
    if (!board) { showTitle(); return; }
    screen = 'cup'; sel = 0; cupMode = true; cupPending = false;
    timeTrial = false; tourMode = false;
    // resuming a season from the title screen must put you back in the hull you started it in
    if (RR.Boats.CATALOG[board.hull]) vehicleIdx = board.hull;
    const nextRound = board.current >= 0 ? board.rounds[board.current] : null;
    const justRan = fresh >= 0 ? board.rounds[fresh] : null;
    const kicker = board.done
      ? 'FOUR ROUNDS · ONE RIVER · THE CHAMPIONSHIP IS DECIDED'
      : justRan
        ? `ROUND ${fresh + 1} OF ${board.total} COMPLETE · <b>${up(justRan.name)}</b>` +
          (nextRound ? ` &nbsp;·&nbsp; <span class="nx">NEXT: ${up(nextRound.name)}</span>` : '')
        : board.roundsDone
          ? `${board.roundsDone} OF ${board.total} ROUNDS RUN &nbsp;·&nbsp; <span class="nx">NEXT: ${up(nextRound ? nextRound.name : '')}</span>`
          : `<span class="nx">ROUND 1 OF ${board.total} · ${up(nextRound ? nextRound.name : '')}</span>`;
    const cta = board.done
      ? `<div class="menu-item primary" data-i="0">NEW CHAMPIONSHIP</div>
         <div class="menu-item" data-i="1">TITLE SCREEN</div>`
      : `<div class="menu-item primary" data-i="0">RACE ROUND ${board.current + 1} · ${up(nextRound ? nextRound.name : '')}</div>
         <div class="menu-item" data-i="1">TITLE SCREEN</div>
         <div class="menu-item dim" data-i="2">ABANDON · START A NEW CHAMPIONSHIP</div>`;
    html(`
      <div id="cup-board">
        <div class="cup-head">
          <div class="cup-crest">${STAR}${STAR}${STAR}${STAR}</div>
          <div class="cup-title">THE CHICAGO CUP</div>
          <div class="cup-kicker">${kicker}</div>
        </div>
        ${board.done ? cupChampionBand(board) : cupBracket(board, fresh)}
        ${cupSeasonTable(board)}
        <div class="cup-cta">${cta}</div>
        <div class="cup-note">↑↓ SELECT · ENTER CONFIRM${board.done ? '' : ' · POINTS ' + board.points.join('/')}</div>
      </div>
    `);
    const newCup = () => { if (RR.Race.cupAbandon) RR.Race.cupAbandon(); cupMode = true; cupPending = true; showVehicles({ cup: true }); };
    bindClicks(board.done
      ? [newCup, () => { cupMode = false; showTitle(); }]
      : [() => launch(), () => { cupMode = false; showTitle(); }, newCup]);
    paintSel();
  }
  MENU.showCupBoard = showCupBoard;

  // multiplayer results come from the net roster, not from boat objects
  MENU.showNetResults = function (results, courseId) {
    screen = 'results'; sel = 0;
    const t0 = results.length ? results[0].time : 0;
    const rows = results.map((r, i) => `
      <div class="result-row ${r.isSelf ? 'you ' : ''}p${i + 1}">
        <span class="p">${r.place || i + 1}</span><span class="n">${String(r.name || '').toUpperCase()}</span>
        <span class="h">${String((RR.Boats.CATALOG[r.boatIdx | 0] || {}).name || '—').toUpperCase()}</span>
        <span class="t">${isFinite(r.time) ? RR.U.formatTime(r.time) : 'DNF'}</span>
        <span class="gap">${i === 0 ? '+0.00' : fmtGap(r.time - t0)}</span>
      </div>`).join('');
    html(`
      <div id="select-title">RACE COMPLETE</div>
      <div id="select-sub">MULTIPLAYER · ${String(courseId || '').toUpperCase()}</div>
      <div id="results-list"><div class="result-head"><span>POS</span><span>PILOT</span><span>HULL</span><span>TIME</span><span>GAP</span></div>${rows}</div>
      <div class="menu-list" style="margin-top:1.4em;"><div class="menu-item" data-i="0">TITLE SCREEN</div></div>
    `);
    bindClicks([() => { if (RR.Net && RR.Net.leave) RR.Net.leave(); showTitle(); }]);
    paintSel();
  };

  // ---------- pause ----------
  MENU.showPause = function () {
    screen = 'pause'; sel = 0;
    const stars = [20, 40, 60, 80].map((l) => `<i class="star6" style="left:${l}%"></i>`).join('');
    html(`
      <div id="pause-flag">${stars}</div>
      <div id="select-title">PAUSED</div>
      <div class="menu-list">
        <div class="menu-item" data-i="0">RESUME</div>
        <div class="menu-item" data-i="1">RESTART RACE</div>
        <div class="menu-item" data-i="2">QUIT TO TITLE</div>
      </div>
      <div id="vol-panel">
        <label>MUSIC<input type="range" id="vol-music" min="0" max="100" value="${Math.round(volMusic * 100)}"></label>
        <label>SFX&nbsp;&nbsp;&nbsp;<input type="range" id="vol-sfx" min="0" max="100" value="${Math.round(volSfx * 100)}"></label>
      </div>
      <div class="menu-note" style="margin-top:1.4em;max-width:640px">
        <b>W/↑</b> throttle · <b>A·D/←·→</b> steer · <b>S/↓</b> brake · <b>SHIFT</b> boost<br>
        <b>C</b> camera · <b>[ ]</b> shot · <b>P</b> photo · <b>N</b> time of day · <b>G</b> green river · <b>R</b> reset
      </div>
    `);
    bindClicks([() => { MENU.hide(); if (MENU.onResume) MENU.onResume(); },
                () => { launch(); },
                () => { cupMode = false; if (MENU.onQuit) MENU.onQuit(); showTitle(); }]);
    const m = $('vol-music'), s = $('vol-sfx');
    if (m) m.oninput = () => { volMusic = m.value / 100; if (RR.Audio.setMusicLevel) RR.Audio.setMusicLevel(volMusic); store(); };
    if (s) s.oninput = () => { volSfx = s.value / 100; if (RR.Audio.setSfxLevel) RR.Audio.setSfxLevel(volSfx); store(); };
    paintSel();
  };

  let volMusic = 1, volSfx = 1;
  try {
    const v = JSON.parse(localStorage.getItem('rr_vol') || 'null');
    if (v) { volMusic = v.m != null ? v.m : 1; volSfx = v.s != null ? v.s : 1; }
  } catch (e) { /* fine */ }
  function store() { try { localStorage.setItem('rr_vol', JSON.stringify({ m: volMusic, s: volSfx })); } catch (e) { /* fine */ } }
  MENU.applyVolumes = function () {
    if (RR.Audio.setMusicLevel) RR.Audio.setMusicLevel(volMusic);
    if (RR.Audio.setSfxLevel) RR.Audio.setSfxLevel(volSfx);
  };

  let bestAtStart = null;
  function launch() {
    if (cupMode && RR.Race.cupCourseIdx) courseIdx = RR.Race.cupCourseIdx();
    // race.js has already written the new best by the time showResults runs, so snapshot the mark
    // to beat here or the record banner fires on every single run
    const c = RR.Race.COURSES[courseIdx];
    bestAtStart = c ? RR.Race.best(c.id) : null;
    MENU.hide();
    RR.Audio.setMusic(false);
    onStartRace(courseIdx, vehicleIdx, timeTrial, null, tourMode);
  }

  // ---------- selection plumbing ----------
  let actions = [];
  function bindClicks(fns) {
    actions = fns;
    root.querySelectorAll('.menu-item').forEach((el) => {
      el.addEventListener('click', () => { sel = +el.dataset.i; RR.Audio.uiSelect(); actions[sel](); });
      el.addEventListener('mouseenter', () => { sel = +el.dataset.i; paintSel(); });
    });
  }
  function bindCards(n, confirm) {
    actions = [];
    for (let i = 0; i < n; i++) actions.push(() => confirm(i));
    root.querySelectorAll('.card').forEach((el) => {
      el.addEventListener('click', () => { sel = +el.dataset.i; RR.Audio.uiSelect(); confirm(sel); });
      el.addEventListener('mouseenter', () => { sel = +el.dataset.i; paintSel(); });
    });
  }
  function paintSel() {
    root.querySelectorAll('.menu-item, .card').forEach((el) => {
      el.classList.toggle('sel', +el.dataset.i === sel);
    });
    const dd = $('diff-desc');
    if (dd && screen === 'difficulty' && DIFFS[sel]) dd.textContent = DIFFS[sel].desc;
    if (screen === 'vehicle') { updateRidePanel(sel); drawRadar(); }
  }

  window.addEventListener('keydown', (e) => {
    if (screen === 'none') return;
    RR.Audio.init();
    const vertical = screen === 'title' || screen === 'results' || screen === 'pause' || screen === 'help' ||
      screen === 'difficulty' || screen === 'cup';
    if ((vertical && e.code === 'ArrowUp') || (!vertical && e.code === 'ArrowLeft')) { sel = (sel - 1 + actions.length) % actions.length; RR.Audio.uiMove(); paintSel(); }
    else if ((vertical && e.code === 'ArrowDown') || (!vertical && e.code === 'ArrowRight')) { sel = (sel + 1) % actions.length; RR.Audio.uiMove(); paintSel(); }
    else if (e.code === 'Enter' || e.code === 'Space') { RR.Audio.uiSelect(); if (actions[sel]) actions[sel](); }
    else if (e.code === 'Backspace' || e.code === 'Escape') {
      if (screen === 'vehicle' || screen === 'help' || screen === 'cup') showTitle();
      else if (screen === 'course') showVehicles({ tt: timeTrial, tour: tourMode, cup: cupMode });
      else if (screen === 'difficulty') { if (cupMode) showVehicles({ cup: true }); else showCourses(); }
      else if (screen === 'pause') { MENU.hide(); if (MENU.onResume) MENU.onResume(); }
      e.preventDefault();
    }
  });

  RR.Menus = MENU;
})();

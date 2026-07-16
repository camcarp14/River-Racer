/* River Racer — menu flow: title → vehicle → course → race → results. Keyboard + mouse. */
(function () {
  const MENU = {};
  const $ = (id) => document.getElementById(id);
  let root, screen = 'title', sel = 0, vehicleIdx = 0, courseIdx = 0;
  let onStartRace = null;

  const CHI_STARS = '✶ ✶ ✶ ✶';

  MENU.init = function (startRaceCb) {
    root = $('menu');
    onStartRace = startRaceCb;
    showTitle();
  };

  MENU.screen = () => screen;
  MENU.selection = () => ({ vehicleIdx, courseIdx });

  function html(s) { root.innerHTML = s; root.classList.remove('off'); root.classList.toggle('showroom', screen === 'vehicle'); }
  MENU.hide = function () { root.classList.add('off'); screen = 'none'; };

  // ---------- title ----------
  function showTitle() {
    screen = 'title'; sel = 0;
    html(`
      <div class="stars">${CHI_STARS}</div>
      <div id="title">RIVER<br>RACER</div>
      <div id="subtitle">CHICAGO ·  LAKE MICHIGAN</div>
      <div class="menu-list">
        <div class="menu-item" data-i="0">RACE</div>
        <div class="menu-item" data-i="1">TIME TRIAL</div>
        <div class="menu-item" data-i="2">HOW TO PLAY</div>
      </div>
      <div class="menu-note">↑↓ SELECT &nbsp;·&nbsp; ENTER CONFIRM &nbsp;·&nbsp; ♪ PRESS ANY KEY FOR SOUND<br>BUILT ON THE REAL CHICAGO RIVER</div>
    `);
    bindClicks([() => showVehicles(false), () => showVehicles(true), showHelp]);
    paintSel();
    RR.Audio.setMusic(true);
  }

  function showHelp() {
    screen = 'help'; sel = 0;
    html(`
      <div id="select-title">HOW TO PLAY</div>
      <div class="menu-note" style="font-size:15px;max-width:640px;line-height:2.1;">
        <b>W / ↑</b> — throttle &nbsp;&nbsp; <b>S / ↓</b> — brake &amp; reverse &nbsp;&nbsp; <b>A·D / ←·→</b> — steer<br>
        <b>SHIFT</b> — boost (watch the meter under your speed — spend it wisely) &nbsp;&nbsp; <b>C</b> — camera &nbsp;&nbsp; <b>R</b> — reset to course<br>
        <b>ESC</b> — pause &nbsp;&nbsp; Gamepad and touch supported.<br><br>
        Thread the checkpoint buoys — <span style="color:#ff5b4c">red LEFT</span>, <span style="color:#2ecc71">green RIGHT</span>.
        The river is narrow and the seawalls are real concrete; the lake is open water with real chop.<br>
        Cut clean lines under the bridges, save boost for the straights, and mind the lock walls.
      </div>
      <div class="menu-list"><div class="menu-item sel" data-i="0">BACK</div></div>
    `);
    bindClicks([showTitle]);
  }

  // ---------- vehicle select: live 3D showroom — the boat idles on the lake mid-screen ----------
  let timeTrial = false;
  function showVehicles(tt) {
    screen = 'vehicle'; sel = vehicleIdx; timeTrial = tt;
    const cards = RR.Boats.CATALOG.map((v, i) => `
      <div class="card" data-i="${i}">
        <div class="tag">${v.kind.toUpperCase()}</div>
        <h3>${v.name}</h3>
        <canvas width="220" height="110" id="vcard-${i}"></canvas>
      </div>`).join('');
    html(`
      <div id="select-title">PICK YOUR RIDE</div>
      <div id="select-sub">${timeTrial ? 'TIME TRIAL' : 'RACE'} · ←→ SELECT · ENTER CONFIRM · BKSP BACK</div>
      <div id="ride-panel">
        <div class="tag" id="ride-kind"></div>
        <h3 id="ride-name"></h3>
        <div class="desc" id="ride-desc"></div>
        <div id="ride-stats"></div>
      </div>
      <div id="cards" class="dock">${cards}</div>
    `);
    bindCards(RR.Boats.CATALOG.length, (i) => { vehicleIdx = i; showCourses(); });
    drawVehicleCards();
    paintSel();
  }

  function updateRidePanel(i) {
    const v = RR.Boats.CATALOG[i];
    const kind = $('ride-kind');
    if (!v || !kind) return;
    kind.textContent = v.kind.toUpperCase();
    $('ride-name').textContent = v.name;
    $('ride-desc').textContent = v.desc;
    const control = (v.turn / 2.5) * 0.5 + (v.grip / 3.7) * 0.5;
    $('ride-stats').innerHTML =
      stat('SPEED', v.top / 46) + stat('ACCEL', v.accel / 15.5) +
      stat('CONTROL', control) + stat('BOOST', (v.boost - 1) / 0.3);
    if (MENU.onVehicleFocus) MENU.onVehicleFocus(i);
  }

  function stat(label, f) {
    return `<div class="statbar"><span style="width:52px">${label}</span><div class="track"><div class="fill" style="width:${Math.round(f * 100)}%"></div></div></div>`;
  }

  // little side-view sketches on 2D canvas — cheap, charming
  function drawVehicleCards() {
    RR.Boats.CATALOG.forEach((v, i) => {
      const c = $('vcard-' + i);
      if (!c) return;
      const ctx = c.getContext('2d');
      const hull = '#' + v.hull.toString(16).padStart(6, '0');
      const deck = '#' + v.deck.toString(16).padStart(6, '0');
      const acc = '#' + v.accent.toString(16).padStart(6, '0');
      ctx.clearRect(0, 0, 220, 110);
      // water line
      ctx.strokeStyle = 'rgba(126,200,227,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(8, 84);
      for (let x = 8; x < 212; x += 8) ctx.lineTo(x, 84 + Math.sin(x * 0.15 + i) * 2.5);
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
      <div id="select-sub">↑↓ SELECT · ENTER RACE · BKSP BACK</div>
      <div class="menu-list">${rows}</div>
      <div class="menu-note" id="diff-desc" style="max-width:520px;">${DIFFS[sel].desc}</div>
    `);
    bindClicks(DIFFS.map((d) => () => {
      difficulty = d.v;
      try { localStorage.setItem('rr_diff', String(d.v)); } catch (e) { /* fine */ }
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
        <div class="statbar"><span>BEST&nbsp;</span><span style="color:#ffc857">${best ? RR.U.formatTime(best) : '—'}</span></div>
      </div>`;
    }).join('');
    html(`
      <div id="select-title">PICK YOUR WATER</div>
      <div id="select-sub">←→ SELECT · ENTER RACE · BKSP BACK</div>
      <div id="cards">${cards}</div>
    `);
    bindCards(RR.Race.COURSES.length, (i) => { courseIdx = i; timeTrial ? launch() : showDifficulty(); });
    drawCourseCards();
    paintSel();
  }

  // top-down course thumbnails from the actual channel polylines
  function drawCourseCards() {
    RR.Race.COURSES.forEach((c, i) => {
      const cv = $('ccard-' + i);
      if (!cv) return;
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, 220, 110);
      // bounds over all channels
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
      // all channels faint
      ctx.strokeStyle = 'rgba(126,200,227,0.25)';
      ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (const key in RR.River.paths) strokePath(RR.River.paths[key]);
      // course route bright
      ctx.strokeStyle = '#ffc857';
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
  MENU.showResults = function (results, courseId) {
    screen = 'results'; sel = 0;
    const best = RR.Race.best(courseId);
    const rows = results.map((r, i) => `
      <div class="result-row ${r.boat.isPlayer ? 'you' : ''}">
        <span>${i + 1}${RR.U.ordinal(i + 1).toLowerCase()} &nbsp; ${r.boat.isPlayer ? 'YOU' : r.boat.pilotName}</span>
        <span class="t">${isFinite(r.time) ? RR.U.formatTime(r.time) : 'DNF'}</span>
      </div>`).join('');
    html(`
      <div id="select-title">${results[0] && results[0].boat.isPlayer ? '🏆 RIVER CHAMP' : 'RACE COMPLETE'}</div>
      <div id="select-sub">BEST: ${best ? RR.U.formatTime(best) : '—'}</div>
      <div id="results-list">${rows}</div>
      <div class="menu-list" style="margin-top:26px;">
        <div class="menu-item" data-i="0">RACE AGAIN</div>
        <div class="menu-item" data-i="1">CHANGE COURSE</div>
        <div class="menu-item" data-i="2">TITLE SCREEN</div>
      </div>
    `);
    bindClicks([launch, showCourses, showTitle]);
    paintSel();
  };

  // ---------- pause ----------
  MENU.showPause = function () {
    screen = 'pause'; sel = 0;
    html(`
      <div id="select-title">PAUSED</div>
      <div class="menu-list">
        <div class="menu-item" data-i="0">RESUME</div>
        <div class="menu-item" data-i="1">RESTART RACE</div>
        <div class="menu-item" data-i="2">QUIT TO TITLE</div>
      </div>
    `);
    bindClicks([() => { MENU.hide(); if (MENU.onResume) MENU.onResume(); },
                () => { launch(); },
                () => { if (MENU.onQuit) MENU.onQuit(); showTitle(); }]);
    paintSel();
  };

  function launch() {
    MENU.hide();
    RR.Audio.setMusic(false);
    onStartRace(courseIdx, vehicleIdx, timeTrial);
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
    if (screen === 'vehicle') updateRidePanel(sel);
  }

  window.addEventListener('keydown', (e) => {
    if (screen === 'none') return;
    RR.Audio.init();
    const vertical = screen === 'title' || screen === 'results' || screen === 'pause' || screen === 'help' || screen === 'difficulty';
    if ((vertical && e.code === 'ArrowUp') || (!vertical && e.code === 'ArrowLeft')) { sel = (sel - 1 + actions.length) % actions.length; RR.Audio.uiMove(); paintSel(); }
    else if ((vertical && e.code === 'ArrowDown') || (!vertical && e.code === 'ArrowRight')) { sel = (sel + 1) % actions.length; RR.Audio.uiMove(); paintSel(); }
    else if (e.code === 'Enter' || e.code === 'Space') { RR.Audio.uiSelect(); if (actions[sel]) actions[sel](); }
    else if (e.code === 'Backspace' || e.code === 'Escape') {
      if (screen === 'vehicle' || screen === 'help') showTitle();
      else if (screen === 'course') showVehicles(timeTrial);
      else if (screen === 'difficulty') showCourses();
      else if (screen === 'pause') { MENU.hide(); if (MENU.onResume) MENU.onResume(); }
      e.preventDefault();
    }
  });

  MENU.toTitle = showTitle;

  RR.Menus = MENU;
})();

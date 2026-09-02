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

  // A finger, not a mouse. Asked live rather than cached at boot: the same browser window can be
  // dragged onto a touchscreen, and a tablet in a keyboard case answers differently once docked.
  // Everything it gates is an ADDITION for touch — nothing a keyboard could do goes away.
  const coarse = () => !!(window.matchMedia && matchMedia('(hover:none) and (pointer:coarse)').matches);

  // BKSP is how you left a picker, and a phone has no BKSP. One chip, in the corner, on every
  // screen whose only way back was that key. CSS keeps it invisible to a mouse.
  const BACK_CHIP = '<button id="rr-back" class="back-chip" type="button">&#9666; BACK</button>';
  function bindBack(fn) {
    const b = $('rr-back');
    if (b) b.addEventListener('click', (e) => { e.preventDefault(); RR.Audio.uiMove(); fn(); });
  }

  MENU.init = function (startRaceCb) {
    root = $('menu');
    onStartRace = startRaceCb;
    showTitle();
  };

  MENU.screen = () => screen;
  MENU.selection = () => ({ vehicleIdx, courseIdx });

  let screenT = 0;                 // when the current screen was drawn — the confirm debounce reads it
  function html(s) {
    screenT = performance.now();
    root.innerHTML = s;
    root.classList.remove('off');
    root.classList.toggle('showroom', screen === 'vehicle');
    root.classList.toggle('title-screen', screen === 'title');
    root.classList.toggle('paused', screen === 'pause');
    // the post-race screens sit over a still-rendering city: without a scrim the tables are
    // unreadable, and the same is true of the prose on HOW TO PLAY over the attract flythrough
    root.classList.toggle('scrim', screen === 'cup' || screen === 'results' || screen === 'help');
    paintSound();
  }
  MENU.hide = function () {
    root.classList.add('off'); root.classList.remove('paused', 'title-screen', 'scrim'); screen = 'none';
    paintSound();
  };

  // ---------- livery: purely cosmetic, remembered between sessions ----------
  const LIVERIES = [null, 0xD8DCE0, 0x2F8F4F, 0x8A2FB0, 0xE07820, 0x16303F];
  let liveryIdx = (() => { try { return Math.max(0, Math.min(5, parseInt(localStorage.getItem('rr_livery') || '0', 10) || 0)); } catch (e) { return 0; } })();
  MENU.livery = () => LIVERIES[liveryIdx];

  // ---------- what the player was last doing ----------
  // CONTINUE only means something if there is something to continue. Prefer rr_save (W3 owns it)
  // and fall back to a key of our own, so the entry works before progress.js is real.
  function lastRun() {
    try {
      const p = RR.Progress && RR.Progress.get ? (RR.Progress.get() || {}) : {};
      if (p.last && p.last.c != null) return p.last;
      const v = JSON.parse(localStorage.getItem('rr_last') || 'null');
      if (v && v.c != null) return v;
    } catch (e) { /* fine */ }
    return null;
  }
  function rememberRun(c, v) {
    const rec = { c, v };
    try { localStorage.setItem('rr_last', JSON.stringify(rec)); } catch (e) { /* fine */ }
    if (RR.Progress && RR.Progress.set) RR.Progress.set('last', rec);
  }

  // ---------- title ----------
  function showTitle() {
    screen = 'title'; sel = 0; timeTrial = false; tourMode = false; cupMode = false; cupPending = false;
    const cup = RR.Race && RR.Race.cup ? RR.Race.cup() : null;
    const rounds = (RR.Race && RR.Race.CUP_ROUNDS ? RR.Race.CUP_ROUNDS.length : 4);
    // a championship in progress is a thing you RESUME, and the title screen should say where you are
    const cupLabel = !cup ? 'CHAMPIONSHIP'
      : cup.done ? 'CHAMPIONSHIP · FINAL'
        : 'CHAMPIONSHIP · ROUND ' + Math.min(rounds, cup.round + 1) + '/' + rounds;

    // The list is built, not written out, because CONTINUE comes and goes and data-i indices have
    // to stay in step with the action array.
    const rows = [], acts = [];
    const last = lastRun();
    const openCup = cup && !cup.done;
    if (openCup) {
      rows.push('CONTINUE · ROUND ' + Math.min(rounds, cup.round + 1));
      acts.push(() => { cupMode = true; showCupBoard(-1); });
    } else if (last && RR.Race.COURSES[last.c]) {
      rows.push('CONTINUE · ' + String(RR.Race.COURSES[last.c].name).toUpperCase());
      acts.push(() => { courseIdx = last.c; if (RR.Boats.CATALOG[last.v]) vehicleIdx = last.v; launch(); });
    }
    rows.push('RACE');                    acts.push(() => showVehicles({}));
    rows.push(cupLabel);                  acts.push(() => { cupMode = true; if (cup) showCupBoard(-1); else { cupPending = true; showVehicles({ cup: true }); } });
    rows.push('TIME TRIAL');              acts.push(() => showVehicles({ tt: true }));
    rows.push('ARCHITECTURE TOUR');       acts.push(() => { tourMode = true; showVehicles({ tour: true }); });
    rows.push('MULTIPLAYER');             acts.push(() => { if (RR.NetUI && RR.NetUI.openEntry) RR.NetUI.openEntry(); });
    rows.push('HOW TO PLAY');             acts.push(showHelp);

    html(`
      <div class="stars">${STAR_CAPS.map((c) => '<div class="starcol">' + STAR + '<span>' + c + '</span></div>').join('')}</div>
      <div id="title">RIVER<br>RACER</div>
      <div id="subtitle">CHICAGO · LAKE MICHIGAN</div>
      <div class="menu-list">
        ${rows.map((r, i) => `<div class="menu-item" data-i="${i}">${r}</div>`).join('')}
      </div>
      <div id="switches"><div id="snd-row" class="sound-row"></div>${puRowHTML()}</div>
      <div class="menu-note"><span class="k-hint">↑↓ SELECT · ENTER CONFIRM · <b>M</b> SOUND · <b>I</b> POWER-UPS<br></span>BUILT ON THE REAL CHICAGO RIVER</div>
    `);
    bindClicks(acts);
    const row = $('snd-row');
    if (row) row.addEventListener('click', () => MENU.toggleSound());
    bindPowerupRow();
    buildSoundChip();
    paintSound();
    paintSel();
    RR.Audio.setMusic(true);   // remembered while muted; it starts the moment sound is switched on
  }
  MENU.showTitle = showTitle;
  MENU.toTitle = showTitle;

  // Every key the game answers to, on one screen. It is a TABLE and not prose because prose is how
  // the look-astern binding went a whole build undocumented — and because this panel has to fit
  // 720p: a HOW TO PLAY tall enough to overflow clips its own title off the top and its own BACK
  // button off the bottom, which is exactly what happened the last time three lines were added.
  // Measured, not eyeballed: at 1280x720 this runs from y=68 to y=652 of the 720 available.
  const HELP_KEYS = [
    ['W / ↑', 'throttle', 'S / ↓', 'brake &amp; reverse'],
    ['A·D / ←·→', 'steer', 'SHIFT', 'boost'],
    ['E / SPACE', 'fire your item', 'B / Q', 'look astern'],
    ['C', 'camera', '[ ]', 'cinematic shot'],
    ['P', 'photo mode', 'R', 'reset to the course'],
    ['N', 'time of day', 'G', 'dye the river green'],
    ['M', 'sound', 'I', 'power-ups on / off'],
    ['ESC', 'pause', '↑↓ ←→ ENTER', 'menus · BKSP back'],
  ];
  function showHelp() {
    screen = 'help'; sel = 0;
    const grid = HELP_KEYS.map((r) => `<b>${r[0]}</b><span>${r[1]}</span><b>${r[2]}</b><span>${r[3]}</span>`).join('');
    html(`
      <div id="select-title">HOW TO PLAY</div>
      <div class="menu-note help-note">
        <div class="t-hint b help-row"><b>ON A PHONE</b> — hold it in landscape. Your LEFT thumb steers:
          put it down anywhere on the left of the screen and the stick comes to you.<br>
          Your RIGHT thumb has one column, three bands. Hold <b>GO</b> to drive, and
          <b style="color:#FFC857">SLIDE UP into BOOST WITHOUT LIFTING OFF</b> — that is the whole trick,
          and it is why boost and throttle share a column. Slide down to <b>REV</b> to brake and back
          her out of trouble. <b>FIRE</b>, <b>ASTERN</b> and <b>PAUSE</b> are inboard of it.</div>
        <div class="t-hint b help-row"><b>ARCHITECTURE TOUR</b> — the ride has its own row along the
          bottom: <b>ABOUT</b> for the building you are passing, <b>SEAT</b> to move around the boat,
          and <b>TAKE THE WHEEL</b> — tap it five times and she is yours.</div>
        <div class="k-hint help-grid">${grid}</div>
        <div class="k-hint help-row"><b>GAMEPAD</b> — LEFT STICK steer · RT throttle ·
          LT brake · A throttle · X boost · B fire item · LB look astern</div>
        <div class="k-hint help-row" style="margin-top:.5em"><b>ARCHITECTURE TOUR</b> — <b>F</b>×5 take the wheel ·
          <b>SPACE</b> about this building · <b>C</b> change seat · DRAG or RIGHT STICK to look around</div>
        <div style="margin-top:.9em;line-height:1.75">
          <span class="k-hint"><b>SHIFT</b> is boost. </span>The boost meter is the ring on the dial. The two
          <span style="color:#EF3340">red</span> segments at the bottom are a reserve the engine
          will not burn, and above <span style="color:#FFC857">PRIME</span> boost is 15% stronger.<br>
          Drive into a gold <span style="color:#FFC857">CRATE</span> in the channel and the slot
          spins you an item.<span class="k-hint"> <b>E</b> or <b>SPACE</b> fires it.</span><span class="t-hint"> The <b>FIRE</b> pad fires it.</span> What you
          can draw depends on your position: out front you get <b>SHIELD</b> and things to drop
          behind you, at the back you get <b>TORPEDO</b>, <b>GULL SWARM</b> and <b>SHOCKWAVE</b>.<span class="k-hint"> <b>I</b> turns items off.</span><br>
          Thread the checkpoint buoys — <span style="color:#EF3340">red LEFT</span>,
          <span style="color:#3ED17E">green RIGHT</span>. Gold gates off the racing line pay boost.
          So do the things nobody tells you about: <b>catching a slide</b> (steer INTO it as the
          stern lets go), <b>air</b> off a ramp or a lake swell, and <b>drafting</b> a rival's wake.
          The meter only trickles back up when you are flat out, so boost is earned, not waited for.
          The nine bascule bridges raise and lower on their own all day, like the real ones do.
          A raised span gives you more clearance, not less — you can always get under.
        </div>
      </div>
      <div class="menu-list" style="margin-top:.9em"><div class="menu-item sel" data-i="0">BACK</div></div>
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
      ${BACK_CHIP}
      <div id="select-title">PICK YOUR RIDE</div>
      <div id="select-sub">${label}<span class="k-hint"> · ←→ SELECT · ENTER CONFIRM · BKSP BACK</span><span class="t-hint"> · TAP A HULL, TAP IT AGAIN TO TAKE IT</span></div>
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
    bindBack(showTitle);
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
    { name: 'ROOKIE', v: 0.7, desc: 'Rivals go slow and make mistakes. Good for learning the river.' },
    { name: 'SKIPPER', v: 1.0, desc: 'An even match. Rivals race hard but still get things wrong.' },
    { name: 'LEGEND', v: 1.45, desc: 'Rivals hold the perfect line, never lift, and never make a mistake.' },
  ];
  function showDifficulty() {
    screen = 'difficulty';
    sel = Math.max(0, DIFFS.findIndex((d) => d.v === difficulty));
    const rows = DIFFS.map((d, i) => `<div class="menu-item" data-i="${i}">${d.name}</div>`).join('');
    html(`
      ${BACK_CHIP}
      <div id="select-title">HOW TOUGH ARE THE RIVALS?</div>
      <div id="select-sub">${cupMode ? 'FOUR ROUNDS AT THIS SETTING' : ''}<span class="k-hint">${cupMode ? ' · ' : ''}↑↓ SELECT · ENTER RACE · BKSP BACK</span><span class="t-hint">${cupMode ? ' · ' : ''}TAP A LEVEL TO RACE</span></div>
      <div class="menu-list">${rows}</div>
      <!-- the one sentence that says what these three words MEAN was the least readable text in
           the game: a plain note in dim ink over a bright live flythrough. It gets a panel
           (uikit's #diff-desc rule) rather than putting the whole picker behind the scrim — the
           difficulty screen is meant to sit over the live river like the other pickers. -->
      <div class="menu-note" id="diff-desc" style="max-width:520px;">${DIFFS[sel].desc}</div>
    `);
    bindClicks(DIFFS.map((d) => () => {
      difficulty = d.v;
      try { localStorage.setItem('rr_diff', String(d.v)); } catch (e) { /* fine */ }
      if (cupMode && cupPending && RR.Race.cupBegin) { RR.Race.cupBegin(vehicleIdx, difficulty, 6); cupPending = false; }
      launch();
    }));
    bindBack(() => { if (cupMode) showVehicles({ cup: true }); else showCourses(); });
    paintSel();
  }

  // ---------- course select ----------
  function showCourses() {
    screen = 'course'; sel = courseIdx;
    // BEST is the record for the hull you are about to drive, not the overall one: a single
    // podracer run (61 m/s against the FORMULA's 41) used to stand as THE course record for every
    // other boat for good, so no other hull could ever post one. The overall line still shows
    // beside it when a faster boat holds it.
    const hullId = (RR.Boats.CATALOG[vehicleIdx] || {}).id;
    const cards = RR.Race.COURSES.map((c, i) => {
      const mine = RR.Race.best(c.id, hullId);
      const any = RR.Race.best(c.id);
      const alsoAny = any != null && (mine == null || any < mine - 1e-6);
      return `
      <div class="card" data-i="${i}">
        <div class="tag">${c.loop ? c.laps + ' LAPS' : 'SPRINT'}</div>
        <h3>${c.name}</h3>
        <canvas width="220" height="110" id="ccard-${i}"></canvas>
        <div class="desc">${c.desc}</div>
        <div class="statbar"><span>BEST&nbsp;</span><span style="color:#FFC857">${mine ? RR.U.formatTime(mine) : '—'}</span>${
          alsoAny ? `<span style="opacity:.6;margin-left:.5em">ANY ${RR.U.formatTime(any)}</span>` : ''}</div>
      </div>`;
    }).join('');
    html(`
      ${BACK_CHIP}
      <div id="select-title">PICK YOUR COURSE</div>
      <div id="select-sub"><span class="k-hint">←→ SELECT · ENTER RACE · BKSP BACK</span><span class="t-hint">TAP A COURSE, TAP IT AGAIN TO RACE IT</span></div>
      <div id="cards">${cards}</div>
    `);
    bindCards(RR.Race.COURSES.length, (i) => { courseIdx = i; (timeTrial || tourMode) ? launch() : showDifficulty(); });
    drawCourseCards();
    bindBack(() => showVehicles({ tt: timeTrial, tour: tourMode, cup: cupMode }));
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
  // A row whose boat was still on the water when the card opened carries `projected`: race.js has
  // worked out where she will cross from her own average speed, so the row says so with a ≈ and
  // quotes the gap in METRES, which is the honest number. It used to print DNF — for a rival who
  // was three seconds behind you.
  function resultRows(results, cup) {
    const t0 = results.length && isFinite(results[0].time) ? results[0].time : 0;
    return results.map((r, i) => {
      const est = !!r.projected;
      const gap = isFinite(r.time)
        ? (est && r.gapM != null ? '−' + Math.round(r.gapM) + ' m' : i === 0 ? '+0.00' : fmtGap(r.time - t0))
        : '—';
      const pts = cup ? `<span class="pts">${RR.Race.CUP_POINTS[Math.min(i, RR.Race.CUP_POINTS.length - 1)]}</span>` : '';
      const time = isFinite(r.time) ? (est ? '≈' : '') + RR.U.formatTime(r.time) : 'DNF';
      return `
      <div class="result-row ${cup ? 'cup ' : ''}${r.boat && r.boat.isPlayer ? 'you ' : ''}${est ? 'est ' : ''}p${i + 1}">
        <span class="p">${i + 1}</span>
        <span class="n">${r.boat && r.boat.isPlayer ? 'YOU' : String(r.boat && r.boat.pilotName || 'RIVAL').toUpperCase()}</span>
        <span class="h">${hullName(r.boat)}</span>
        <span class="t">${time}</span>
        <span class="gap">${gap}</span>${pts}
      </div>`;
    }).join('');
  }

  // ---------- the medal strip ----------
  // A results screen that cannot say what changed means the run changed nothing. The salute is
  // retired, so what a run moves now is the medal — and only that, and only when it exists.
  // RR.Progress is W3's; every shape below is optional and a missing one draws no strip at all.
  const MEDALS = ['BRONZE', 'SILVER', 'GOLD', 'AUTHOR'];
  function medalName(m) {
    if (m == null || m === '') return null;
    if (typeof m === 'number') return MEDALS[Math.max(0, Math.min(3, m))] || null;
    return String(m).toUpperCase();
  }
  // The whole ladder, not just the rung you landed on. A player who missed BRONZE by 1.8 s used to
  // see NOTHING — no strip at all — and so never learned that a medal ladder exists or how close
  // they were. The pars are scaled to the hull you actually drove (progress.js hullFactor), so the
  // strip says which hull they are for.
  function medalStrip(courseId) {
    let medal = null, prev = null, par = null, time = null, hull = null;
    try {
      const P = RR.Progress;
      const s = P && P.summary ? P.summary(courseId) : null;
      if (s) {
        medal = medalName(s.medal); prev = medalName(s.prevMedal);
        par = s.par; time = s.time; hull = s.hull;
      }
    } catch (e) { /* the strip is never worth an exception */ }
    if (!par || !isFinite(time)) {
      if (!medal) return '';
      const body = (prev && prev !== medal) ? `<s>${prev}</s> → <u>${medal}</u>` : `<u>${medal}</u>`;
      return `<div id="medal-strip"><i class="star6"></i>MEDAL<span>${body}</span></div>`;
    }
    // par is keyed by tier name in progress.js; accept an array too so a reshuffle cannot blank it
    const tiers = MEDALS.map((name, i) => {
      const t = Array.isArray(par) ? par[i] : (par[name.toLowerCase()] != null ? par[name.toLowerCase()] : par[name]);
      return { name, t: typeof t === 'number' && isFinite(t) ? t : null };
    }).filter((x) => x.t != null);
    if (!tiers.length) return '';
    const earnedIdx = medal ? MEDALS.indexOf(medal) : -1;
    const rungs = tiers.map((x, i) => {
      const got = earnedIdx >= 0 && i <= earnedIdx;
      return `<span class="rung${got ? ' got' : ''}${i === earnedIdx ? ' now' : ''}">${x.name} ${RR.U.formatTime(x.t)}</span>`;
    }).join('');
    // the next rung up is the target this run just missed — the number that brings you back
    const next = tiers.find((x) => x.t < time - 1e-6 && (earnedIdx < 0 || MEDALS.indexOf(x.name) > earnedIdx))
      || tiers.slice().reverse().find((x) => x.t < time - 1e-6);
    const nextLine = next ? `<span class="next">NEXT: ${next.name} −${(time - next.t).toFixed(2)}s</span>` : '';
    const move = (prev && medal && prev !== medal) ? `<s>${prev}</s> → ` : '';
    const head = medal ? `${move}<u>${medal}</u>` : 'NO MEDAL';
    return `<div id="medal-strip"><i class="star6"></i>MEDAL<span>${head}</span>` +
      `<div class="ladder">${rungs}${nextLine}</div>` +
      (hull ? `<div class="ladder-note">TARGETS FOR ${up(hullNameOf(hull))}</div>` : '') + `</div>`;
  }
  function hullNameOf(id) {
    const v = RR.Boats && RR.Boats.CATALOG ? RR.Boats.CATALOG.find((x) => x.id === id) : null;
    return v ? v.name : id;
  }

  MENU.showResults = function (results, courseId) {
    screen = 'results'; sel = 0;
    const prevBest = bestAtStart;
    const me = results.find((r) => r.boat && r.boat.isPlayer);
    // The banner needs a mark to have BEATEN. On a first finish there is none, and calling that a
    // course record devalued the banner on the one screen where it first appears — so the first
    // run says what it actually is.
    const first = !prevBest && !!(me && isFinite(me.time));
    const record = !!(me && isFinite(me.time) && prevBest && me.time < prevBest - 1e-6);
    // Read the live race BEFORE anything tears it down: the ghost's time and whether it was beaten
    // live on the race state, and quitToTitle (below, on every exit) drops it.
    const S = RR.Race.state ? RR.Race.state() : null;
    const tt = !!(S && S.timeTrial);
    const ghostT = S && isFinite(S.ghostTime) ? S.ghostTime : null;
    const ghostBeaten = !!(S && S.ghostBeaten);
    // cupRecord() BANKS the round — call it exactly once, here, before anything reads the board
    const cup = cupMode && RR.Race.cupRecord ? RR.Race.cupRecord(results) : null;
    const board = cup && RR.Race.cupBoard ? RR.Race.cupBoard() : null;
    const fresh = board ? board.roundsDone - 1 : -1;
    const round = board && board.rounds[fresh] ? board.rounds[fresh] : null;
    const head = `<div class="result-head${cup ? ' cup' : ''}"><span>POS</span><span>PILOT</span><span class="h">HULL</span><span>TIME</span><span>GAP</span>${cup ? '<span>PTS</span>' : ''}</div>`;
    // A one-boat field is not a podium: the time trial is about the ghost, so it says so.
    const title = board ? 'ROUND ' + board.roundsDone + ' RESULT'
      : tt ? (ghostBeaten ? 'NEW BEST LAP' : ghostT != null ? 'LAP COMPLETE' : 'FIRST LAP SET')
        : (results[0] && results[0].boat && results[0].boat.isPlayer ? 'RIVER CHAMP' : 'RACE COMPLETE');
    let sub;
    if (board) {
      sub = 'THE CHICAGO CUP · ROUND ' + board.roundsDone + ' OF ' + board.total + (round ? ' · ' + up(round.name) : '');
    } else if (tt) {
      const d = ghostT != null && me && isFinite(me.time) ? me.time - ghostT : null;
      sub = 'TIME TRIAL' + (ghostT != null ? ' · GHOST ' + RR.U.formatTime(ghostT) : ' · NO GHOST YET') +
        (me && isFinite(me.time) ? ' · YOU ' + RR.U.formatTime(me.time) : '') +
        (d != null ? ' <b style="color:' + (d < 0 ? '#3ED17E' : '#EF3340') + '">' + (d < 0 ? '−' : '+') + Math.abs(d).toFixed(2) + '</b>' : '');
    } else {
      // the difficulty the run was actually raced at: a time set against ROOKIE traffic and one
      // set against LEGEND are not the same result, and the card never said which it was
      sub = 'BEST: ' + (prevBest ? RR.U.formatTime(prevBest) : '—') + ' · ' + diffName();
    }
    html(`
      <div id="select-title">${title}</div>
      <div id="select-sub">${sub}</div>
      ${record ? '<div id="record-banner">★ NEW COURSE RECORD ★</div>'
        : first ? '<div id="record-banner">FIRST TIME SET · ' + RR.U.formatTime(me.time) + '</div>' : ''}
      <div id="results-list">${head}${resultRows(results, !!cup)}</div>
      ${medalStrip(courseId)}
      <div class="menu-list" style="margin-top:1.0em;">
        ${board ? `<div class="menu-item" data-i="0">${board.done ? 'FINAL STANDINGS' : 'CHAMPIONSHIP STANDINGS'} ▸</div>
        <div class="menu-item" data-i="1">TITLE SCREEN</div>`
        : `<div class="menu-item" data-i="0">RACE AGAIN</div>
        <div class="menu-item" data-i="1">CHANGE COURSE</div>
        <div class="menu-item" data-i="2">TITLE SCREEN</div>`}
      </div>
    `);
    // EVERY exit tears the race down first. Only the pause menu's QUIT used to, so the finished
    // field, the finish arch, the crates and a truthy RR.Race.state() rode out onto the title
    // screen — where the bridge tender's horn plays under the title music and the lock stalls on
    // the boat still parked between its sills. quitToTitle is idempotent, so RACE AGAIN can take
    // the same door before it opens the next race.
    bindClicks(board
      ? [() => { quit(); showCupBoard(fresh); }, () => { quit(); cupMode = false; showTitle(); }]
      : [() => { quit(); launch(); }, () => { quit(); cupMode = false; showCourses(); }, () => { quit(); cupMode = false; showTitle(); }]);
    paintSel();
  };
  // the one teardown door: main.js's quitToTitle (clearBoats, RR.Race.end, engine + music off,
  // timeScale back to 1). Safe to call twice and safe to call with no race up.
  function quit() { if (MENU.onQuit) MENU.onQuit(); }
  function diffName() {
    const d = difficulty;
    const row = DIFFS.find((x) => x.v === d);
    return row ? row.name : 'SKIPPER';
  }

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
      ? 'ALL ' + board.total + ' ROUNDS RUN · FINAL STANDINGS'
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
        <div class="cup-note"><span class="k-hint">↑↓ SELECT · ENTER CONFIRM${board.done ? '' : ' · '}</span>${board.done ? '' : 'POINTS ' + board.points.join('/')}</div>
      </div>
    `);
    const newCup = () => { if (RR.Race.cupAbandon) RR.Race.cupAbandon(); cupMode = true; cupPending = true; showVehicles({ cup: true }); };
    bindClicks(board.done
      ? [newCup, () => { quit(); cupMode = false; showTitle(); }]
      : [() => launch(), () => { quit(); cupMode = false; showTitle(); }, newCup]);
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
      <div id="results-list"><div class="result-head"><span>POS</span><span>PILOT</span><span class="h">HULL</span><span>TIME</span><span>GAP</span></div>${rows}</div>
      <div class="menu-list" style="margin-top:1.0em;"><div class="menu-item" data-i="0">TITLE SCREEN</div></div>
    `);
    bindClicks([() => { if (RR.Net && RR.Net.leave) RR.Net.leave(); quit(); showTitle(); }]);
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
        <div class="menu-item" data-i="1">RESTART ${cupMode ? 'ROUND' : 'RACE'}</div>
        <div class="menu-item" data-i="2">QUIT TO TITLE</div>
      </div>
      <div id="vol-panel">
        <div id="snd-row" class="sound-row"></div>
        ${puRowHTML()}
        <label>MUSIC<input type="range" id="vol-music" min="0" max="100" value="${Math.round(volMusic * 100)}"></label>
        <label>SFX&nbsp;&nbsp;&nbsp;<input type="range" id="vol-sfx" min="0" max="100" value="${Math.round(volSfx * 100)}"></label>
      </div>
      <div class="menu-note k-hint" style="margin-top:1.1em;max-width:790px;line-height:1.75">
        <b>W/↑</b> throttle · <b>A·D/←·→</b> steer · <b>S/↓</b> brake &amp; reverse · <b>SHIFT</b> boost<br>
        <b style="color:#FFC857">E</b> or <b style="color:#FFC857">SPACE</b> fire the item you are holding ·
        <b style="color:#FFC857">I</b> power-ups on / off<br>
        <b>B·Q</b> look astern · <b>C</b> camera · <b>[ ]</b> shot · <b>P</b> photo · <b>N</b> time of day ·
        <b>G</b> green river · <b>R</b> reset<br>
        <b>M</b> sound · <b>ESC</b> resume · TOUR — <b>F</b>×5 take the wheel ·
        <b>SPACE</b> about this building · <b>C</b> change seat
      </div>
    `);
    bindClicks([() => { MENU.hide(); if (MENU.onResume) MENU.onResume(); },
                () => { launch(); },
                () => { cupMode = false; if (MENU.onQuit) MENU.onQuit(); showTitle(); }]);
    const m = $('vol-music'), s = $('vol-sfx');
    if (m) m.oninput = () => { volMusic = m.value / 100; if (RR.Audio.setMusicLevel) RR.Audio.setMusicLevel(volMusic); store(); };
    if (s) s.oninput = () => { volSfx = s.value / 100; if (RR.Audio.setSfxLevel) RR.Audio.setSfxLevel(volSfx); store(); };
    const row = $('snd-row');
    if (row) row.addEventListener('click', () => MENU.toggleSound());
    bindPowerupRow();
    buildSoundChip();
    paintSound();
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
    buildSoundChip();
  };

  // ---------- sound: off until asked for ----------
  // The game boots silent, so the loudest thing on the title screen has to be the control that
  // says so. A fixed chip rather than a menu row: it must also be reachable mid-race and from the
  // pause screen, and it pulses while muted so nobody plays the whole game thinking there is none.
  const SPK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/>' +
    '<path class="w" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>' +
    '<path class="x" d="M16.5 9.5l5 5M21.5 9.5l-5 5"/></svg>';
  let soundChip = null;
  const soundOff = () => !!(RR.Audio && RR.Audio.muted && RR.Audio.muted());

  function buildSoundChip() {
    if (soundChip || !document.body) return;
    soundChip = document.createElement('button');
    soundChip.id = 'sound-chip';
    soundChip.type = 'button';
    soundChip.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); MENU.toggleSound(); });
    document.body.appendChild(soundChip);
    paintSound();
  }

  function paintSound() {
    const off = soundOff();
    if (soundChip) {
      soundChip.classList.toggle('off', off);
      soundChip.innerHTML = `${SPK}<b>${off ? 'SOUND OFF' : 'SOUND ON'}</b><i>${off ? 'PRESS M' : 'M'}</i>`;
      soundChip.setAttribute('aria-pressed', off ? 'false' : 'true');
      soundChip.title = off ? 'Turn the sound on (M)' : 'Mute (M)';
    }
    const row = $('snd-row');
    if (row) {
      row.classList.toggle('off', off);
      row.innerHTML = `${SPK}<b>${off ? 'SOUND OFF' : 'SOUND ON'}</b><i>PRESS M</i>`;
    }
    // One control per screen. The corner chip stands down wherever a screen hosts its own row,
    // and during a race entirely: the top-right corner belongs to the minimap, ESC is one key
    // away, and the pause legend carries M.
    const menuOn = !!root && !root.classList.contains('off');
    if (soundChip) soundChip.classList.toggle('hidden', !menuOn || !!row);
    const panel = $('vol-panel');
    if (panel) panel.classList.toggle('muted', off);
  }

  MENU.toggleSound = function () {
    if (!RR.Audio || !RR.Audio.setMuted) return;
    const wasOff = soundOff();
    RR.Audio.setMuted(!wasOff);
    if (wasOff) { MENU.applyVolumes(); RR.Audio.uiSelect(); }   // first sound you hear is your own click
    paintSound();
  };
  MENU.paintSound = paintSound;

  // ---------- power-ups: on unless you say otherwise ----------
  // Items ship ON — they are the answer to "it's not just whoever gets out first" — but a player
  // who wants a clean race has to be able to find the switch without leaving the title screen, so
  // it stands beside the sound plate in the same municipal metal. The module persists the value;
  // this only paints it. No module, no row: a switch that does nothing is worse than no switch.
  const CRATE = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path class="w" d="M4.5 6.5h15v11h-15z"/><path class="w" d="M4.5 10h15M4.5 14h15"/>' +
    '<path class="x" d="M5.5 5.5l13 13M18.5 5.5l-13 13"/></svg>';
  const puOn = () => !!(RR.Powerups && RR.Powerups.enabled && RR.Powerups.enabled());
  function puRowHTML() {
    if (!RR.Powerups || !RR.Powerups.setEnabled) return '';
    return '<div id="pu-row" class="opt-row"></div>';
  }
  function paintPowerups() {
    const row = $('pu-row');
    if (!row) return;
    const on = puOn();
    row.classList.toggle('off', !on);
    row.innerHTML = `${CRATE}<b>POWER-UPS ${on ? 'ON' : 'OFF'}</b><i>PRESS I</i>`;
    row.title = on ? 'Turn power-ups off (I)' : 'Turn power-ups on (I)';
  }
  function bindPowerupRow() {
    const row = $('pu-row');
    if (!row) return;
    row.addEventListener('click', () => MENU.togglePowerups());
    paintPowerups();
  }
  MENU.togglePowerups = function () {
    if (!RR.Powerups || !RR.Powerups.toggle) return;
    RR.Powerups.toggle();
    paintPowerups();
    if (RR.Audio && RR.Audio.uiSelect) RR.Audio.uiSelect();
  };

  let bestAtStart = null;
  function launch() {
    if (cupMode && RR.Race.cupCourseIdx) courseIdx = RR.Race.cupCourseIdx();
    // race.js has already written the new best by the time showResults runs, so snapshot the mark
    // to beat here or the record banner fires on every single run
    const c = RR.Race.COURSES[courseIdx];
    bestAtStart = c ? RR.Race.best(c.id) : null;
    if (!tourMode && !timeTrial && !cupMode) rememberRun(courseIdx, vehicleIdx);
    MENU.hide();
    RR.Audio.setMusic(false);
    // cupMode goes over EXPLICITLY. main.js used to infer a cup round from "this course happens to
    // be the one the open cup is on next", so a plain RACE → LEGEND on that course silently got a
    // ROOKIE field under the cup's names, and the difficulty screen lied.
    onStartRace(courseIdx, vehicleIdx, timeTrial, null, tourMode, !!cupMode);
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
  // A card is two things at once: the cursor that drives the showroom (the live 3D hull, the
  // radar, the spec sheet, the course map) and the confirm button. A mouse separates them with
  // hover — a finger has nothing to separate them with, so on a touchscreen the first tap is the
  // look and the second is the choice. Without this a phone player can never see a boat's stats:
  // the tap that would show them also leaves the screen.
  function bindCards(n, confirm) {
    actions = [];
    for (let i = 0; i < n; i++) actions.push(() => confirm(i));
    root.querySelectorAll('.card').forEach((el) => {
      el.addEventListener('click', () => {
        const i = +el.dataset.i;
        if (coarse() && i !== sel) { sel = i; RR.Audio.uiMove(); paintSel(); return; }
        sel = i; RR.Audio.uiSelect(); confirm(sel);
      });
      // a touchscreen fires this ahead of the click it is about to send, which would move the
      // cursor onto the card before the tap could tell that it had moved
      el.addEventListener('mouseenter', () => { if (coarse()) return; sel = +el.dataset.i; paintSel(); });
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

  // Its own listener, deliberately: the one below returns early during a race, and M has to work
  // everywhere — title, showroom, mid-race, pause.
  const typing = (t) => !!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable));
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyM' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (typing(e.target)) return;
    MENU.toggleSound();
  });

  // I for ITEMS, the mate of M for sound — same guards, but deliberately NOT global. Sound is a
  // comfort setting and belongs everywhere; the crates are the race, and a key that empties the
  // channel from the cockpit is a cheat with a shortcut. It answers only where the switch it
  // drives is on screen to answer back: the title screen and the pause menu.
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyI' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (screen !== 'title' && screen !== 'pause') return;
    if (typing(e.target)) return;
    MENU.togglePowerups();
  });

  window.addEventListener('keydown', (e) => {
    if (screen === 'none') return;
    // A menu belongs to whoever is not typing in it. The multiplayer name and room boxes sit over
    // the title screen, so without this Backspace navigated BACK instead of deleting a character
    // and Space re-rendered the form out from under the caret — measured: you could not type a
    // space in your own name.
    if (typing(e.target)) return;
    RR.Audio.init();
    const vertical = screen === 'title' || screen === 'results' || screen === 'pause' || screen === 'help' ||
      screen === 'difficulty' || screen === 'cup';
    if ((vertical && e.code === 'ArrowUp') || (!vertical && e.code === 'ArrowLeft')) { sel = (sel - 1 + actions.length) % actions.length; RR.Audio.uiMove(); paintSel(); }
    else if ((vertical && e.code === 'ArrowDown') || (!vertical && e.code === 'ArrowRight')) { sel = (sel + 1) % actions.length; RR.Audio.uiMove(); paintSel(); }
    else if (e.code === 'Enter' || e.code === 'Space') {
      // A confirm is a PRESS, never a repeat: holding ENTER on the title used to walk title →
      // vehicle → course → difficulty in 130 ms and start a race nobody chose. The 150 ms after a
      // screen change is the same guard against the tail of the keystroke that opened it — and it
      // deliberately does not cover Backspace, so backing out fast stays fast.
      if (e.repeat || performance.now() - screenT < 150) return;
      RR.Audio.uiSelect();
      if (actions[sel]) actions[sel]();
    } else if (e.code === 'Backspace' || e.code === 'Escape') {
      if (e.repeat) return;
      if (screen === 'vehicle' || screen === 'help' || screen === 'cup') showTitle();
      else if (screen === 'course') showVehicles({ tt: timeTrial, tour: tourMode, cup: cupMode });
      else if (screen === 'difficulty') { if (cupMode) showVehicles({ cup: true }); else showCourses(); }
      else if (screen === 'pause') { MENU.hide(); if (MENU.onResume) MENU.onResume(); }
      e.preventDefault();
    }
  });

  RR.Menus = MENU;
})();

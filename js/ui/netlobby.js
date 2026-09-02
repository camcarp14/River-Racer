/* River Racer — online lobby / name entry / results overlay.
   The real lobby + leaderboard live in Slack; this is the thin in-game surface that
   the Slack "Play" button drops you into (via ?room=CODE&name=NAME&boat=IDX).
   THERE IS ONE WAY IN BY HAND: the MULTIPLAYER row on the title screen, which calls
   openEntry() — the same call, with the same (absent) arguments, that the floating
   PLAY ONLINE button used to make. The button was deleted rather than repositioned:
   it was a second copy of a control the title menu already carries, it was pinned to
   the viewport rather than to a screen, and it therefore floated on over the boat
   cards on PICK YOUR RIDE and over the course cards after them. A deep link still
   opens this form on its own (see the ?room= handler in init). */
(function () {
  const UI = {};
  const $ = (s, r) => (r || document).querySelector(s);
  let root, panels = {}, autoStart = 6;
  // production transport is Trystero P2P; tests can override this factory
  UI.transportFactory = function () { return RR.Transports && RR.Transports.trystero && RR.Transports.trystero(); };

  const CSS = `
  #net-ui{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;font-family:inherit;background:rgba(6,12,20,.55);backdrop-filter:blur(3px)}
  #net-ui.on{display:flex}
  #net-ui .np{background:var(--panel-hi);border:2px solid var(--rule);border-radius:3px;padding:26px 30px;min-width:340px;max-width:440px;color:var(--text);font-family:var(--f-ui);box-shadow:0 18px 60px rgba(0,0,0,.5)}
  #net-ui h2{margin:0 0 4px;font:400 1.6em/1 var(--f-display);letter-spacing:.04em;color:var(--gold)}
  #net-ui .sub{opacity:.7;font-size:13px;margin-bottom:16px;letter-spacing:.12em}
  #net-ui label{display:block;font-size:12px;letter-spacing:.14em;opacity:.75;margin:12px 0 4px}
  #net-ui input,#net-ui select{width:100%;box-sizing:border-box;background:var(--ink-900);border:2px solid var(--rule-soft);color:var(--text);border-radius:2px;padding:10px 12px;font-size:15px;font-family:inherit}
  #net-ui .row{display:flex;gap:10px}
  #net-ui .row>*{flex:1}
  #net-ui button{margin-top:16px;width:100%;background:var(--sign-green);border:0;box-shadow:inset 0 0 0 2px #fff;color:#fff;font-weight:700;letter-spacing:.2em;padding:12px;border-radius:2px;font-size:15px;cursor:pointer;font-family:inherit}
  @media (hover:hover){#net-ui button:hover{filter:brightness(1.12)}}
  #net-ui button:disabled{opacity:.5;cursor:default;filter:none}
  #net-ui button.ghost{background:transparent;box-shadow:inset 0 0 0 2px var(--rule-soft);color:var(--text-dim);font-weight:600}
  #net-ui .seat{display:flex;align-items:center;gap:10px;padding:9px 12px;margin:6px 0;background:var(--panel);border-radius:2px;border:0;box-shadow:inset 0 0 0 2px var(--rule-soft)}
  #net-ui .seat .dot{width:9px;height:9px;border-radius:50%;background:#3ED17E;flex:0 0 auto}
  #net-ui .seat b{flex:1;font-weight:600} #net-ui .seat .tag{font-size:11px;opacity:.6;letter-spacing:.14em}
  #net-ui .host-badge{color:var(--gold);font-size:11px;letter-spacing:.14em}
  #net-ui .code{font-size:26px;letter-spacing:.28em;color:var(--chi-blue);font-family:var(--f-num);font-weight:700;text-align:center;margin:2px 0 2px}
  #net-ui .mode{display:flex;align-items:center;gap:10px;margin:12px 0 2px;padding:9px 12px;background:var(--panel);border-radius:2px;box-shadow:inset 0 0 0 2px var(--rule-soft)}
  #net-ui .mode b{flex:1;font-size:12px;letter-spacing:.14em;opacity:.75;font-weight:600}
  #net-ui .mode .val{font-weight:700;letter-spacing:.16em;font-size:13px}
  #net-ui .mode .val.on{color:var(--sign-green)} #net-ui .mode .val.off{color:var(--text-dim)}
  #net-ui .mode button{margin:0;width:auto;padding:6px 12px;font-size:11px;letter-spacing:.14em}
  #net-ui .note{font-size:11px;letter-spacing:.06em;opacity:.6;margin:4px 2px 0}
  #net-ui ol{margin:8px 0 0;padding:0;list-style:none}
  #net-ui ol li{display:flex;gap:12px;align-items:baseline;padding:8px 12px;margin:5px 0;background:var(--panel);border-radius:2px}
  #net-ui ol li .pl{font:400 1.35em/1 var(--f-display);color:var(--gold);width:26px}
  #net-ui ol li.me{box-shadow:inset .28em 0 0 var(--gold)}
  #net-ui ol li .tm{margin-left:auto;opacity:.85;font-family:var(--f-num);font-variant-numeric:tabular-nums}

  /* The lobby is a FORM, and a landscape phone gives a form 390px of height. It scrolls inside its
     own plate rather than running off the top of the screen — where the JOIN button lives — and it
     keeps clear of the notch and the home indicator. */
  @media (max-height:560px){
    #net-ui{padding:calc(4px + var(--sat)) calc(4px + var(--sar)) calc(4px + var(--sab)) calc(4px + var(--sal))}
    #net-ui .np{max-height:100%;overflow-y:auto;overscroll-behavior:contain;padding:12px 16px;min-width:0;width:min(94vw,420px)}
    #net-ui h2{font-size:1.3em} #net-ui .sub{font-size:11px;margin-bottom:8px}
    #net-ui label{margin:8px 0 3px} #net-ui .code{font-size:20px}
    #net-ui .seat{padding:7px 10px;margin:4px 0} #net-ui .mode{margin:8px 0 2px;padding:7px 10px}
    #net-ui ol li{padding:6px 10px;margin:4px 0}
    #net-ui button{margin-top:10px}
  }
  /* an iPhone SE in landscape is 375px tall — the Leave button was the 3px that did not fit */
  @media (max-height:400px){
    #net-ui .np{padding:8px 12px}
    #net-ui h2{font-size:1.15em} #net-ui .sub{margin-bottom:5px}
    #net-ui label{margin:5px 0 2px} #net-ui .code{font-size:17px}
    #net-ui .seat{padding:5px 10px;margin:3px 0} #net-ui .mode{margin:5px 0 2px;padding:5px 10px}
    #net-ui button{margin-top:6px}
  }
  /* a thumb needs 44px of anything it has to hit — the room code field most of all */
  @media (hover:none) and (pointer:coarse){
    #net-ui input,#net-ui select,#net-ui button{min-height:44px}
    #net-ui .mode button{min-height:38px;padding:8px 14px}
  }
  `;

  function boatOptions(sel) {
    // pickable() drops hulls that have not been earned yet — the option VALUE stays the catalog
    // index, because that is what goes over the wire as boatIdx
    const list = RR.Boats.pickable ? RR.Boats.pickable() : RR.Boats.CATALOG.map((v, i) => ({ v, i }));
    return list.map((e) => `<option value="${e.i}"${e.i === sel ? ' selected' : ''}>${e.v.name}</option>`).join('');
  }
  function fmt(t) { const m = Math.floor(t / 60), s = (t - m * 60); return m + ':' + s.toFixed(1).padStart(4, '0'); }
  function esc(s) { return String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }

  UI.init = function () {
    if (root) return;
    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    root = document.createElement('div'); root.id = 'net-ui'; document.body.appendChild(root);

    RR.Net.on('roster', renderWaiting);
    RR.Net.on('start', () => hide());
    RR.Net.on('alldone', showResults);

    // launched from Slack / a shared link?
    const q = new URLSearchParams(location.search);
    const room = q.get('room');
    if (room) UI.openEntry({ room: room, name: q.get('name'), boat: parseInt(q.get('boat') || '', 10) });
  };

  // The form sits OVER the title screen, so menus.js and input.js are both still listening. They
  // now ignore events whose target is a text box, but the form owns its own keys as well: Enter
  // joins, Escape cancels, and nothing inside it reaches the menu at all.
  function ownKeys(el) {
    if (!el || el.dataset.rrKeys) return;
    el.dataset.rrKeys = '1';
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Enter' && !e.repeat) { e.preventDefault(); const j = $('#ne-join'); if (j) j.click(); }
      else if (e.code === 'Escape' && !e.repeat) { e.preventDefault(); hide(); }
    });
    el.addEventListener('keyup', (e) => e.stopPropagation());
  }

  UI.openEntry = function (pre) {
    pre = pre || {};
    const savedName = pre.name || localStorage.getItem('rr_name') || '';
    const savedBoat = isFinite(pre.boat) ? pre.boat : (RR.Menus.selection ? RR.Menus.selection().vehicleIdx : 0);
    const roomVal = pre.room || '';
    root.innerHTML = `<div class="np">
      <h2>PLAY ONLINE</h2>
      <div class="sub">Race your coworkers live. Same room code = same race.</div>
      <label>YOUR NAME</label><input id="ne-name" maxlength="24" placeholder="e.g. Cam" value="${esc(savedName)}">
      <label>BOAT</label><select id="ne-boat">${boatOptions(savedBoat)}</select>
      <label>ROOM CODE</label>
      <div class="row"><input id="ne-room" maxlength="12" placeholder="ROOM" value="${esc(roomVal)}" style="text-transform:uppercase"
        autocapitalize="characters" autocorrect="off" autocomplete="off" spellcheck="false">
      <button class="ghost" id="ne-new" style="margin-top:0;flex:0 0 auto;width:auto;padding:12px 16px">New</button></div>
      <button id="ne-join">JOIN RACE</button>
      <button class="ghost" id="ne-cancel">Cancel</button>
    </div>`;
    show();
    $('#ne-new').onclick = () => { $('#ne-room').value = randCode(); };
    if (!roomVal) $('#ne-room').value = randCode();
    $('#ne-cancel').onclick = () => hide();
    $('#ne-join').onclick = () => {
      const name = ($('#ne-name').value || 'Racer').trim().slice(0, 24) || 'Racer';
      const boat = parseInt($('#ne-boat').value, 10) || 0;
      const rm = ($('#ne-room').value || '').trim().toUpperCase() || randCode();
      localStorage.setItem('rr_name', name);
      const tp = UI.transportFactory();
      if (!tp) { alert('Online play needs to be opened from a hosted page (not a local file).'); return; }
      RR.Net.join({ room: rm, name: name, boatIdx: boat, transport: tp }).then(renderWaiting);
    };
  };

  function renderWaiting() {
    if (!RR.Net.active) return;
    // don't cover an in-progress race/results
    if (RR.Net.self()._finished) return;
    // …and a peer arriving MID-RACE fires 'roster' at everyone still driving. The field is frozen
    // at the flag, so a late arrival cannot join this race and must not throw the lobby back up
    // over it either: they wait in their own lobby and ride in the next one.
    if (RR.Net.started && RR.Net.started()) return;
    const roster = RR.Net.roster();
    const host = RR.Net.isHost();
    const me = RR.Net.self();
    // THE ROOM HAS ONE MODE. One player with items off in a room with items on is a broken race, so
    // the host's switch is the only one that counts and every seat is shown what it is set to. A
    // guest whose own preference differs is told so plainly rather than being quietly overruled.
    const items = RR.Net.items ? RR.Net.items() : true;
    const myPref = !!(RR.Powerups && RR.Powerups.enabled && RR.Powerups.enabled());
    // …and this seat may be the one that arrived mid-race. Its own flag never dropped, so without
    // asking the room it would think it owned an idle lobby and start a race of one over the top
    // of everybody else's.
    const busy = !!(RR.Net.roomRacing && RR.Net.roomRacing());
    root.innerHTML = `<div class="np">
      <h2>LOBBY</h2><div class="sub">Room</div>
      <div class="code">${esc(RR.Net.room)}</div>
      <div class="sub" style="text-align:center">${roster.length} racer${roster.length === 1 ? '' : 's'} — starts at ${autoStart} or when the host begins</div>
      <div id="ne-seats"></div>
      <div class="mode"><b>POWER-UPS</b><span class="val ${items ? 'on' : 'off'}" id="ne-mode">${items ? 'ON' : 'OFF'}</span>
      ${host ? '<button class="ghost" id="ne-items">CHANGE</button>' : '<span class="tag">HOST&rsquo;S CALL</span>'}</div>
      ${!host && myPref !== items ? `<div class="note">Your setting is ${myPref ? 'ON' : 'OFF'} — this room races with items ${items ? 'ON' : 'OFF'}.</div>` : ''}
      <label>YOUR BOAT</label><select id="ne-boat2">${boatOptions(me.boatIdx)}</select>
      ${busy ? '<button disabled>Race in progress — you’re in the next one</button>'
        : host ? '<button id="ne-start">START RACE</button>' : '<button disabled>Waiting for host to start…</button>'}
      <button class="ghost" id="ne-leave">Leave</button>
    </div>`;
    show();
    $('#ne-seats').innerHTML = roster.map((r) => `<div class="seat"><span class="dot"></span><b>${esc(r.name)}${r.isSelf ? ' (you)' : ''}</b><span class="tag">${esc(RR.Boats.CATALOG[r.boatIdx] ? RR.Boats.CATALOG[r.boatIdx].name : '')}</span>${r.id === minId(roster) ? '<span class="host-badge">HOST</span>' : ''}</div>`).join('');
    $('#ne-boat2').onchange = (e) => RR.Net.setBoat(parseInt(e.target.value, 10) || 0);
    $('#ne-leave').onclick = () => { RR.Net.leave(); hide(); };
    const itemsBtn = $('#ne-items');
    // the host's switch IS the room's: flip it, re-publish it, and every lobby repaints
    if (itemsBtn) itemsBtn.onclick = () => {
      if (RR.Powerups && RR.Powerups.setEnabled) RR.Powerups.setEnabled(!myPref);
      if (RR.Net.announce) RR.Net.announce();
      renderWaiting();
    };
    if (host && !busy) $('#ne-start').onclick = () => RR.Net.startAsHost(RR.Menus.selection ? RR.Menus.selection().courseIdx : 0);
    // Auto-start when full (host fires it for everyone) — but never off a room we have only half
    // heard from: peer-join arrives before the hello that says whether a race is already running.
    if (host && !busy && roster.length >= autoStart && (!RR.Net.heardAll || RR.Net.heardAll())) {
      RR.Net.startAsHost(RR.Menus.selection ? RR.Menus.selection().courseIdx : 0);
    }
  }

  function showResults(results) {
    root.innerHTML = `<div class="np">
      <h2>RESULTS</h2><div class="sub">Room ${esc(RR.Net.room)} — items ${RR.Net.items && RR.Net.items() ? 'on' : 'off'}</div>
      <ol>${results.map((r) => `<li class="${r.isSelf ? 'me' : ''}"><span class="pl">${r.place}</span><b>${esc(r.name)}</b><span class="tag">${esc(RR.Boats.CATALOG[r.boatIdx] ? RR.Boats.CATALOG[r.boatIdx].name : '')}</span><span class="tm">${fmt(r.time)}</span></li>`).join('')}</ol>
      ${RR.Net.isHost() ? '<button id="ne-again">RACE AGAIN</button>' : '<button disabled>Waiting for host…</button>'}
      <button class="ghost" id="ne-leave2">Leave</button>
    </div>`;
    show();
    const again = $('#ne-again');
    if (again) again.onclick = () => { RR.Net.resetRace(); RR.Net.startAsHost(RR.Menus.selection ? RR.Menus.selection().courseIdx : 0); };
    $('#ne-leave2').onclick = () => { RR.Net.leave(); hide(); if (RR.Menus.showTitle) RR.Menus.showTitle(); };
    // non-host: when the host restarts, RR.Net 'start' hides this and the race begins
    RR.Net.on('start', () => hide());
  }

  function minId(roster) { let m = roster[0].id; for (const r of roster) if (r.id < m) m = r.id; return m; }
  function randCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)]; return s; }
  function show() { root.classList.add('on'); ownKeys(root); }
  function hide() { root.classList.remove('on'); }
  UI.show = show; UI.hide = hide;

  RR.NetUI = UI;
})();

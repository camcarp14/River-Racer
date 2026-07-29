/* River Racer — multiplayer netplay core (transport-agnostic).
   Single-player is completely untouched: none of this runs unless a room is joined.
   A "transport" (Trystero P2P in production, a mock BroadcastChannel for tests) is
   injected at join time and only needs: connect(room, meta) -> Promise, selfId,
   on(evt, cb) for 'peer-join'|'peer-leave'|'message', send(obj), close(). */
(function () {
  const N = { active: false, room: null };
  const U = () => RR.U;
  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  let tp = null;
  const self = { id: null, name: 'Racer', boatIdx: 0, ready: false };
  const peers = new Map();                 // id -> {id, name, boatIdx, ready, items, buf, finished, finishTime}
  const handlers = { roster: [], start: [], finish: [], alldone: [] };
  let started = false, seed = 1, courseIdx = 0, items = true, field = null;

  function emit(evt) { const a = Array.prototype.slice.call(arguments, 1); for (const f of handlers[evt]) f.apply(null, a); }
  N.on = function (evt, cb) { if (handlers[evt]) handlers[evt].push(cb); };

  N.join = function (opts) {
    self.name = String(opts.name || 'Racer').slice(0, 24);
    self.boatIdx = opts.boatIdx | 0;
    tp = opts.transport;
    N.room = opts.room;
    N.active = true;
    tp.on('peer-join', function (id, m) { addPeer(id, m); sendHello(); emit('roster'); });
    tp.on('peer-leave', function (id) { peers.delete(id); emit('roster'); });
    tp.on('message', onMessage);
    return Promise.resolve(tp.connect(opts.room, helloMsg())).then(function () {
      self.id = tp.selfId;
      sendHello();
      emit('roster');
    });
  };

  // Whether THIS client would like items. The room does not have to agree — the host's answer is
  // the one that counts (see N.items) — but every client publishes its own so the lobby can say so.
  function localItems() {
    try { return !!(RR.Powerups && RR.Powerups.enabled && RR.Powerups.enabled()); } catch (e) { return true; }
  }
  function helloMsg() { return { t: 'hello', name: self.name, boatIdx: self.boatIdx, ready: self.ready, items: localItems(), racing: started }; }
  function sendHello() { if (tp) tp.send(helloMsg()); }

  function addPeer(id, m) {
    if (id === self.id) return;
    let p = peers.get(id);
    if (!p) { p = { id: id, buf: null, finished: false, finishTime: 0 }; peers.set(id, p); }
    if (m) {
      if (m.name != null) p.name = String(m.name).slice(0, 24);
      if (m.boatIdx != null) p.boatIdx = m.boatIdx | 0;
      if (m.ready != null) p.ready = !!m.ready;
      if (m.items != null) p.items = !!m.items;
      if (m.racing != null) p.racing = !!m.racing;
    }
    return p;
  }

  // THE FIELD IS FROZEN AT THE FLAG. These are the ids that were in the room when it dropped, and
  // once the race is running the host job may only move between THEM. Power-ups made isHost()
  // load-bearing mid-race — the host is the only client that resolves crate claims — and peer ids
  // are random, so a coworker who opens the room link while a race is on has a 1-in-N chance of
  // sorting lowest. Without this, every crate on the course goes dead for everybody the moment
  // they arrive: the racers keep sending `pcl` and the new "host" has no race, no crate table and
  // no boat to answer with.
  function freezeField() {
    field = Object.create(null);
    field[self.id] = 1;
    peers.forEach(function (p) { field[p.id] = 1; });
  }

  function onMessage(id, msg) {
    if (!msg || id === self.id) return;
    switch (msg.t) {
      case 'hello': addPeer(id, msg); emit('roster'); break;
      case 'ready': { const p = addPeer(id); p.ready = !!msg.ready; emit('roster'); break; }
      case 'start':
        // A SECOND 'start' is the host calling a rematch: the flag never drops twice in one race,
        // and swallowing it in the latch stranded every guest on the results card while the host
        // drove off alone. But it has to actually BE the host — a peer who joined mid-race sees an
        // idle room and its lobby will happily auto-start one, and honouring that would throw
        // everybody still driving back onto the grid.
        if (started) {
          if (id !== N.hostId()) break;
          N.resetRace();
        }
        if (!started) {
          started = true; seed = msg.seed; courseIdx = msg.courseIdx;
          items = msg.items == null ? true : !!msg.items;   // the host's item setting is the room's
          freezeField();
          emit('start', { seed: seed, courseIdx: courseIdx, items: items });
        }
        break;
      case 'pos': { const p = peers.get(id); if (p) p.buf = mkBuf(msg); break; }
      case 'finish': { const p = peers.get(id); if (p && !p.finished) { p.finished = true; p.finishTime = msg.e; emit('finish', id, msg.e); checkAllDone(); } break; }
      // Power-ups. The wire carries four of them: a crate CLAIM up to the host, the host's GRANT
      // (which names the item — a client never rolls its own), a FIRE broadcast, and a HIT the
      // victim's own client declares. powerups.js owns every rule; net.js only carries them.
      case 'pcl': case 'pgr': case 'pfr': case 'pht':
        if (RR.Powerups && RR.Powerups.onNet) RR.Powerups.onNet(msg.t, id, msg);
        break;
    }
  }

  // ---- lobby ----
  N.self = function () { return self; };
  N.roster = function () {
    const list = [{ id: self.id, name: self.name, boatIdx: self.boatIdx, isSelf: true, ready: self.ready, finished: self._finished, finishTime: self._finishTime }];
    peers.forEach(function (p) { list.push({ id: p.id, name: p.name || 'Racer', boatIdx: p.boatIdx || 0, isSelf: false, ready: !!p.ready, finished: !!p.finished, finishTime: p.finishTime }); });
    list.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    return list;
  };
  N.count = function () { return peers.size + 1; };
  N.setReady = function (r) { self.ready = r; if (tp) tp.send({ t: 'ready', ready: r }); emit('roster'); };

  // deterministic host: lowest id in the room decides start — and, once racing, resolves crate
  // claims. If the host drops, the next-lowest id inherits both jobs on the very next frame.
  N.hostId = function () {
    let min = self.id;
    peers.forEach(function (p) {
      if (started && field && !field[p.id]) return;   // arrived after the flag: not in this race
      if (p.id < min) min = p.id;
    });
    return min;
  };
  N.isHost = function () { return N.hostId() === self.id; };
  // Has the flag dropped? The roster is frozen at that moment — a peer who arrives after it is a
  // spectator in the lobby until the next race, never a boat spliced into a running one.
  N.started = function () { return started; };

  // One player with items off in a room with items on is a broken race, so there is exactly one
  // answer: the host's. Before the flag drops that is the host's live preference; after it, the
  // value that came down with 'start' — which cannot then change under anybody mid-race.
  N.items = function () {
    if (started) return items;
    const h = N.hostId();
    if (h === self.id) return localItems();
    const p = peers.get(h);
    return p && p.items != null ? !!p.items : true;
  };
  // the host flipping the switch in the lobby: re-publish and repaint every seat
  N.announce = function () { sendHello(); emit('roster'); };

  // Is a race already under way in this room? Every hello says so, and a peer who arrives mid-race
  // needs the answer: its own `started` is false (it never saw the flag), so without this its lobby
  // would offer a START button that can only ever start a race of one.
  N.roomRacing = function () {
    if (started) return true;
    let any = false;
    peers.forEach(function (p) { if (p.racing) any = true; });
    return any;
  };
  // Have we actually HEARD from every peer, or only watched them arrive? Only a hello carries
  // `racing`, and the auto-start must not fire on a room it only half knows.
  N.heardAll = function () {
    let all = true;
    peers.forEach(function (p) { if (p.items == null) all = false; });
    return all;
  };

  N.startAsHost = function (course) {
    if (started) return;
    started = true;
    courseIdx = course | 0;
    seed = (Date.now() % 1000000) + 1;
    items = localItems();
    freezeField();
    if (tp) tp.send({ t: 'start', seed: seed, courseIdx: courseIdx, items: items });
    emit('start', { seed: seed, courseIdx: courseIdx, items: items });
  };

  // raw send for the power-up protocol. A message posted into a room that has gone away is a
  // no-op, never a throw — a dropped peer must not take a firing boat down with it.
  N.send = function (msg) { if (tp && msg) { try { tp.send(msg); } catch (e) { /* peer mid-drop */ } } };

  // ---- in-race position sync ----
  // `u` is the sender's own item state. It rides here rather than in messages of its own because
  // the boat that owns an effect is the only client entitled to say how much of it is left, and
  // this feed is already that boat telling the room about itself. It is omitted when nothing is
  // running, and an absent `u` is itself the all-clear.
  N.sendState = function (b) {
    if (!tp) return;
    const m = { t: 'pos', x: r3(b.pos.x), y: r3(b.pos.y), z: r3(b.pos.z), h: r3(b.heading),
      p: r3(b.visPitch), r: r3(b.visRoll), vx: r3(b.vel.x), vz: r3(b.vel.z), bh: r3(b.boostHeat || 0), d: r1(b.routeD) };
    const u = RR.Powerups && RR.Powerups.netState ? RR.Powerups.netState(b) : null;
    if (u) m.u = u;
    tp.send(m);
  };
  function mkBuf(m) { return { x: m.x, y: m.y, z: m.z, h: m.h, pitch: m.p, roll: m.r, vx: m.vx, vz: m.vz, bh: m.bh, d: m.d, u: m.u || null, at: nowMs() }; }

  // drive a remote boat toward its latest network state, dead-reckoning across the gap
  N.applyRemote = function (b, dt) {
    const p = peers.get(b.netId);
    if (!p || !p.buf) return;
    const s = p.buf, age = Math.min(0.4, (nowMs() - s.at) / 1000);
    const tx = s.x + s.vx * age, tz = s.z + s.vz * age;
    b.pos.x = U().damp(b.pos.x, tx, 11, dt);
    b.pos.z = U().damp(b.pos.z, tz, 11, dt);
    b.pos.y = U().damp(b.pos.y, s.y, 9, dt);
    b.heading = angDamp(b.heading, s.h, 11, dt);
    b.visPitch = U().damp(b.visPitch, s.pitch, 8, dt);
    b.visRoll = U().damp(b.visRoll, s.roll, 8, dt);
    b.boostHeat = s.bh;
    b.vel.x = s.vx; b.vel.z = s.vz;          // feed wake FX + water shader
    if (!b.finished) b.routeD = s.d;          // trust reported progress for standings
    // …and trust its own report of what is running on it: shields, gulls and the item in the slot
    if (RR.Powerups && RR.Powerups.applyNetState) RR.Powerups.applyNetState(b, s.u);
  };

  // ---- finish / results ----
  N.sendFinish = function (elapsed) {
    self._finished = true; self._finishTime = elapsed;
    if (tp) tp.send({ t: 'finish', e: elapsed });
    checkAllDone();
  };
  function checkAllDone() {
    const roster = N.roster();
    if (roster.every(function (r) { return r.finished; })) emit('alldone', results());
  }
  function results() {
    return N.roster().filter(function (r) { return r.finished; })
      .sort(function (a, b) { return a.finishTime - b.finishTime; })
      .map(function (r, i) { return { place: i + 1, name: r.name, time: r.finishTime, boatIdx: r.boatIdx, isSelf: r.isSelf }; });
  }
  N.results = results;

  N.setBoat = function (idx) { self.boatIdx = idx | 0; sendHello(); emit('roster'); };

  // rematch: clear the race latch + everyone's finish state so the host can start again
  N.resetRace = function () {
    started = false; field = null;           // the next flag freezes a fresh field
    self._finished = false; self._finishTime = 0;
    items = localItems();                    // the next start negotiates the mode again
    peers.forEach(function (p) { p.finished = false; p.finishTime = 0; p.buf = null; });
    emit('roster');
  };

  N.leave = function () {
    if (tp) { try { tp.send({ t: 'bye' }); } catch (e) {} try { tp.close(); } catch (e) {} }
    tp = null; peers.clear(); started = false; field = null; N.active = false;
    self.ready = false; self._finished = false; self._finishTime = 0;
    for (const k in handlers) handlers[k].length = 0;
  };

  function angDamp(a, target, lambda, dt) {
    let d = ((target - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    return a + d * (1 - Math.exp(-lambda * dt));
  }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function r1(v) { return Math.round(v * 10) / 10; }

  RR.Net = N;
})();

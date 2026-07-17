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
  const peers = new Map();                 // id -> {id, name, boatIdx, ready, buf, finished, finishTime}
  const handlers = { roster: [], start: [], finish: [], alldone: [] };
  let started = false, seed = 1, courseIdx = 0;

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

  function helloMsg() { return { t: 'hello', name: self.name, boatIdx: self.boatIdx, ready: self.ready }; }
  function sendHello() { if (tp) tp.send(helloMsg()); }

  function addPeer(id, m) {
    if (id === self.id) return;
    let p = peers.get(id);
    if (!p) { p = { id: id, buf: null, finished: false, finishTime: 0 }; peers.set(id, p); }
    if (m) { if (m.name != null) p.name = String(m.name).slice(0, 24); if (m.boatIdx != null) p.boatIdx = m.boatIdx | 0; if (m.ready != null) p.ready = !!m.ready; }
    return p;
  }

  function onMessage(id, msg) {
    if (!msg || id === self.id) return;
    switch (msg.t) {
      case 'hello': addPeer(id, msg); emit('roster'); break;
      case 'ready': { const p = addPeer(id); p.ready = !!msg.ready; emit('roster'); break; }
      case 'start':
        if (!started) { started = true; seed = msg.seed; courseIdx = msg.courseIdx; emit('start', { seed: seed, courseIdx: courseIdx }); }
        break;
      case 'pos': { const p = peers.get(id); if (p) p.buf = mkBuf(msg); break; }
      case 'finish': { const p = peers.get(id); if (p && !p.finished) { p.finished = true; p.finishTime = msg.e; emit('finish', id, msg.e); checkAllDone(); } break; }
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

  // deterministic host: lowest id in the room decides start
  N.isHost = function () {
    let min = self.id;
    peers.forEach(function (p) { if (p.id < min) min = p.id; });
    return min === self.id;
  };

  N.startAsHost = function (course) {
    if (started) return;
    started = true;
    courseIdx = course | 0;
    seed = (Date.now() % 1000000) + 1;
    if (tp) tp.send({ t: 'start', seed: seed, courseIdx: courseIdx });
    emit('start', { seed: seed, courseIdx: courseIdx });
  };

  // ---- in-race position sync ----
  N.sendState = function (b) {
    if (!tp) return;
    tp.send({ t: 'pos', x: r3(b.pos.x), y: r3(b.pos.y), z: r3(b.pos.z), h: r3(b.heading),
      p: r3(b.visPitch), r: r3(b.visRoll), vx: r3(b.vel.x), vz: r3(b.vel.z), bh: r3(b.boostHeat || 0), d: r1(b.routeD) });
  };
  function mkBuf(m) { return { x: m.x, y: m.y, z: m.z, h: m.h, pitch: m.p, roll: m.r, vx: m.vx, vz: m.vz, bh: m.bh, d: m.d, at: nowMs() }; }

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
    started = false; self._finished = false; self._finishTime = 0;
    peers.forEach(function (p) { p.finished = false; p.finishTime = 0; p.buf = null; });
    emit('roster');
  };

  N.leave = function () {
    if (tp) { try { tp.send({ t: 'bye' }); } catch (e) {} try { tp.close(); } catch (e) {} }
    tp = null; peers.clear(); started = false; N.active = false;
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

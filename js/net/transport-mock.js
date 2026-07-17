/* River Racer — mock transport over BroadcastChannel. Same-origin browsing contexts
   (e.g. multiple tabs) in one browser share it, so it drives the automated 2-player
   tests and also works as a real "everyone on this one machine" fallback. Production
   cross-machine play uses the Trystero P2P transport instead. */
(function () {
  RR.Transports = RR.Transports || {};

  RR.Transports.mock = function () {
    let ch = null, selfId = null, meta = null;
    const peers = new Set();
    const cbs = { 'peer-join': [], 'peer-leave': [], 'message': [] };
    const fire = (e, a, b) => { for (const f of cbs[e]) f(a, b); };

    function rid() { return 'm' + Math.floor(Math.random() * 1e9).toString(36) + Date.now().toString(36); }

    const T = {
      get selfId() { return selfId; },
      on(evt, cb) { if (cbs[evt]) cbs[evt].push(cb); },
      connect(room, m) {
        selfId = rid(); meta = m || {};
        ch = new BroadcastChannel('rr-' + room);
        ch.onmessage = (ev) => {
          const d = ev.data;
          if (!d || d.id === selfId) return;
          if (d.kind === 'hello' || d.kind === 'hello-ack') {
            const isNew = !peers.has(d.id);
            if (isNew) { peers.add(d.id); fire('peer-join', d.id, d.meta); }
            if (d.kind === 'hello') ch.postMessage({ kind: 'hello-ack', id: selfId, meta: meta });
          } else if (d.kind === 'leave') {
            if (peers.delete(d.id)) fire('peer-leave', d.id);
          } else if (d.kind === 'msg') {
            if (!peers.has(d.id)) { peers.add(d.id); fire('peer-join', d.id, null); }
            fire('message', d.id, d.data);
          }
        };
        ch.postMessage({ kind: 'hello', id: selfId, meta: meta });
        return Promise.resolve();
      },
      send(obj) { if (ch) ch.postMessage({ kind: 'msg', id: selfId, data: obj }); },
      close() { if (ch) { try { ch.postMessage({ kind: 'leave', id: selfId }); } catch (e) {} ch.close(); ch = null; } peers.clear(); },
    };
    return T;
  };
})();

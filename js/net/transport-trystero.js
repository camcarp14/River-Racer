/* River Racer — production P2P transport over WebRTC, via Trystero.
   Trystero handles signaling through free public infrastructure (no server, no cost)
   and establishes direct browser-to-browser data channels. Position data then flows
   peer-to-peer, so live racing is free at any volume.

   Expects a vendored Trystero global at window.Trystero = { joinRoom, selfId }.
   (The vendored build js/vendor/trystero.global.js sets this.) If it's missing —
   e.g. opened offline from file:// — this returns null and the game stays single-player. */
(function () {
  RR.Transports = RR.Transports || {};

  RR.Transports.trystero = function () {
    const T = window.Trystero;
    if (!T || !T.joinRoom) return null;

    let room = null, sendMsg = null;
    const cbs = { 'peer-join': [], 'peer-leave': [], 'message': [] };
    const fire = (e, a, b) => { for (const f of cbs[e]) f(a, b); };

    return {
      get selfId() { return T.selfId; },
      on(evt, cb) { if (cbs[evt]) cbs[evt].push(cb); },
      connect(roomId /*, meta */) {
        // relays: Trystero's default strategy; appId namespaces our rooms away from other apps
        room = T.joinRoom({ appId: 'river-racer-arcade' }, String(roomId));
        const pair = room.makeAction('m');
        sendMsg = pair[0];
        pair[1]((data, peerId) => fire('message', peerId, data));
        room.onPeerJoin((id) => fire('peer-join', id, null));   // names arrive via our own 'hello' message
        room.onPeerLeave((id) => fire('peer-leave', id));
        return Promise.resolve();
      },
      send(obj) { if (sendMsg) { try { sendMsg(obj); } catch (e) { /* peer mid-drop */ } } },
      close() { if (room) { try { room.leave(); } catch (e) {} room = null; } },
    };
  };
})();

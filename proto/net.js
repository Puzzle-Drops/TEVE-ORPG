/* proto/net.js
 * Network interface for up-to-6 player co-op.
 * Stub transport (single-player). Wire to peer.js (CDN) in a follow-up by
 * replacing send/connect with real WebRTC P2P calls — the rest of the app
 * already uses this clean interface.
 */
(function () {
    'use strict';

    const ProtoNet = {
        role: 'host',
        peerId: 'local-' + Math.random().toString(36).slice(2, 8),
        peers: [],          // { id, name, characterStats }
        handlers: new Set(),
    };

    ProtoNet.connect = function (roomCode) {
        // Stub: become host immediately. Real wiring would create or join a room.
        ProtoNet.role = roomCode ? 'client' : 'host';
        return Promise.resolve({ role: ProtoNet.role, peerId: ProtoNet.peerId });
    };
    ProtoNet.send = function (type, payload) {
        // Stub: no-op. Real transport would relay to peers.
    };
    ProtoNet.onMessage = function (h) {
        ProtoNet.handlers.add(h);
        return () => ProtoNet.handlers.delete(h);
    };
    ProtoNet.disconnect = function () { ProtoNet.peers.length = 0; };
    ProtoNet.isHost = function () { return ProtoNet.role === 'host'; };

    window.ProtoNet = ProtoNet;
})();

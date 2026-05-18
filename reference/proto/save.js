/* proto/save.js
 * Minimal localStorage save: position, level, exp.
 * Auto-saves periodically.
 */
(function () {
    'use strict';

    const KEY = 'teve-proto-save-v1';

    const ProtoSave = {};

    ProtoSave.load = function () {
        try {
            const raw = localStorage.getItem(KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (err) { console.warn('save load', err); return null; }
    };
    ProtoSave.save = function () {
        const p = Proto.player;
        if (!p) return;
        const data = {
            v: 1,
            level: p.level, exp: p.exp,
            position: { x: p.position.x, z: p.position.z },
            gold: Proto.gold || 0,
        };
        try { localStorage.setItem(KEY, JSON.stringify(data)); }
        catch (err) { console.warn('save write', err); }
    };

    window.ProtoSave = ProtoSave;
})();

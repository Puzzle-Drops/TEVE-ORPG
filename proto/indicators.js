/* proto/indicators.js
 * League-of-Legends-style spell/attack-move indicators.
 *
 * One persistent set of meshes (range ring, AoE preview ring, target highlight,
 * attack-move crosshair) that we toggle visible/invisible per frame based on
 * the active "indicator session".
 *
 * Sessions are started by holding a key (Q/W/E/R/A). On key release the
 * waiting intent is committed (cast / attack-move) at whatever the cursor
 * was pointing at. Right-click or Escape cancels.
 *
 * Session shape:
 *   { kind: 'ability'|'attackMove', slot?, def? }
 */
(function () {
    'use strict';

    const ProtoInd = {
        rangeRing: null,
        previewRing: null,
        previewFill: null,
        targetHighlight: null,
        crosshair: null,
        moveTrail: null,
        active: null,        // current session
        previousTarget: null, // for highlight tracking
    };

    ProtoInd.init = function () {
        // Helper: build an always-on-top decal material (draws over terrain + units).
        const decalMat = (color, opacity) => {
            const m = new THREE.MeshBasicMaterial({
                color, transparent: true, opacity,
                side: THREE.DoubleSide,
                depthTest: false, depthWrite: false,
            });
            m.userData.baseOpacity = opacity;
            return m;
        };

        const rrMat = decalMat(0xfff2a0, 0.6);
        ProtoInd.rangeRing = new THREE.Mesh(new THREE.RingGeometry(0.94, 1.0, 96), rrMat);
        ProtoInd.rangeRing.rotation.x = -Math.PI / 2;
        ProtoInd.rangeRing.position.y = 0.04;
        ProtoInd.rangeRing.renderOrder = 8000;
        ProtoInd.rangeRing.visible = false;
        ProtoScene.effectsRoot.add(ProtoInd.rangeRing);

        const prMat = decalMat(0xc599ff, 0.95);
        ProtoInd.previewRing = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.0, 64), prMat);
        ProtoInd.previewRing.rotation.x = -Math.PI / 2;
        ProtoInd.previewRing.position.y = 0.05;
        ProtoInd.previewRing.renderOrder = 8001;
        ProtoInd.previewRing.visible = false;
        ProtoScene.effectsRoot.add(ProtoInd.previewRing);
        const pfMat = decalMat(0xc599ff, 0.22);
        ProtoInd.previewFill = new THREE.Mesh(new THREE.CircleGeometry(1.0, 64), pfMat);
        ProtoInd.previewFill.rotation.x = -Math.PI / 2;
        ProtoInd.previewFill.position.y = 0.045;
        ProtoInd.previewFill.renderOrder = 8000;
        ProtoInd.previewFill.visible = false;
        ProtoScene.effectsRoot.add(ProtoInd.previewFill);

        const thMat = decalMat(0xff6644, 0.95);
        ProtoInd.targetHighlight = new THREE.Mesh(new THREE.RingGeometry(0.82, 0.96, 48), thMat);
        ProtoInd.targetHighlight.rotation.x = -Math.PI / 2;
        ProtoInd.targetHighlight.position.y = 0.06;
        ProtoInd.targetHighlight.renderOrder = 8002;
        ProtoInd.targetHighlight.visible = false;
        ProtoScene.effectsRoot.add(ProtoInd.targetHighlight);

        // Connector line from cursor to highlighted target.
        // Built lazily as a thin Mesh quad, oriented per frame.
        const lineMat = decalMat(0xff8855, 0.9);
        ProtoInd.connector = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.06), lineMat);
        ProtoInd.connector.rotation.x = -Math.PI / 2;
        ProtoInd.connector.position.y = 0.07;
        ProtoInd.connector.renderOrder = 8003;
        ProtoInd.connector.visible = false;
        ProtoScene.effectsRoot.add(ProtoInd.connector);
        // OS cursor becomes the crosshair; no in-world crosshair mesh.
    };

    /* ---------- API ---------- */

    /** Begin showing the appropriate indicator for the given ability slot.
     *  Pre-condition: caller has already validated slot exists. */
    ProtoInd.startAbility = function (slot, def) {
        if (def.targetType === 'self') return false;
        ProtoInd.active = { kind: 'ability', slot, def, byHover: false };
        return true;
    };

    /** Begin attack-move indicator (key-driven, commit on release/click). */
    ProtoInd.startAttackMove = function () {
        ProtoInd.active = { kind: 'attackMove', byHover: false };
    };

    /** Hover preview from HUD: shows the indicator but doesn't accept commit.
     *  Cleared by endPreview() when the cursor leaves the slot. */
    ProtoInd.previewAbility = function (slot, def) {
        if (def.targetType === 'self') return;
        // Don't override a key-driven session
        if (ProtoInd.active && !ProtoInd.active.byHover) return;
        if (ProtoInd.active) ProtoInd.cancel();
        ProtoInd.active = { kind: 'ability', slot, def, byHover: true };
    };
    ProtoInd.previewAttackMove = function () {
        if (ProtoInd.active && !ProtoInd.active.byHover) return;
        if (ProtoInd.active) ProtoInd.cancel();
        ProtoInd.active = { kind: 'attackMove', byHover: true };
    };
    /** Cancel the active session ONLY if it was started by hover. */
    ProtoInd.endPreview = function () {
        if (ProtoInd.active && ProtoInd.active.byHover) ProtoInd.cancel();
    };

    /** Cancel any active session. */
    ProtoInd.cancel = function () {
        ProtoInd.active = null;
        ProtoInd.rangeRing.visible = false;
        ProtoInd.previewRing.visible = false;
        ProtoInd.previewFill.visible = false;
        ProtoInd.targetHighlight.visible = false;
        ProtoInd.connector.visible = false;
    };

    /** Pick the enemy under (or closest to) the cursor — IGNORES player range.
     *  The player will walk into ability range automatically. */
    function pickCursorEnemy(player, cursor) {
        // 1) Direct hover always wins if it's hostile
        const ent = ProtoInput.hoverEntity;
        if (ent && ent.isHostile && !ent.dead) return ent;
        // 2) Otherwise: nearest hostile to cursor (any distance from player)
        let best = null, bestD = Infinity;
        for (const e of ProtoCombat.allHostilesOf(player)) {
            const dCursor = Math.hypot(e.position.x - cursor.x, e.position.z - cursor.z);
            if (dCursor < bestD) { best = e; bestD = dCursor; }
        }
        // Cursor must be reasonably close to the chosen enemy (3.5 units),
        // otherwise treat as "no target" (player clicked empty space).
        if (best && bestD <= 3.5) return best;
        return null;
    }
    ProtoInd.isActive = function () { return !!ProtoInd.active; };

    /** True if a key release should fire an ability now (key-driven only). */
    ProtoInd.matchesAbilitySlot = function (slot) {
        return ProtoInd.active && ProtoInd.active.kind === 'ability'
            && ProtoInd.active.slot === slot && !ProtoInd.active.byHover;
    };

    /** Get the current target/ground position to use when committing. */
    ProtoInd.commitContext = function () {
        const session = ProtoInd.active;
        if (!session) return null;
        const cursor = ProtoInput.groundPos;
        if (session.kind === 'attackMove') {
            const ent = ProtoInput.hoverEntity;
            if (ent && ent.isHostile) return { type: 'attackTarget', entity: ent };
            return { type: 'attackMove', position: { x: cursor.x, z: cursor.z } };
        }
        const def = session.def;
        if (def.targetType === 'enemy') {
            const player = Proto.player;
            const target = pickCursorEnemy(player, cursor, def.range || 8);
            if (!target) return { type: 'noTarget', slot: session.slot };
            return { type: 'castTarget', slot: session.slot, entity: target };
        }
        if (def.targetType === 'ally') {
            return { type: 'castTarget', slot: session.slot, entity: Proto.player };
        }
        if (def.targetType === 'directional') {
            // Cursor controls direction only — fire from player toward cursor.
            const player = Proto.player;
            const dx = cursor.x - player.position.x;
            const dz = cursor.z - player.position.z;
            const len = Math.hypot(dx, dz) || 1;
            return {
                type: 'castDirectional', slot: session.slot,
                direction: { dx: dx / len, dz: dz / len },
            };
        }
        if (def.targetType === 'aoe_ground' || def.targetType === 'ground') {
            // No clamp — pass the actual cursor position through. Player walks
            // into range and casts at the original spot. New actions cancel.
            return { type: 'castGround', slot: session.slot, position: { x: cursor.x, z: cursor.z } };
        }
        return null;
    };

    /* ---------- Per-frame update ---------- */
    ProtoInd.tick = function () {
        const session = ProtoInd.active;
        if (!session) {
            ProtoInd.rangeRing.visible = false;
            ProtoInd.previewRing.visible = false;
            ProtoInd.previewFill.visible = false;
            ProtoInd.targetHighlight.visible = false;
            return;
        }
        const player = Proto.player;
        if (!player || player.dead) { ProtoInd.cancel(); return; }
        const cursor = ProtoInput.groundPos;

        if (session.kind === 'attackMove') {
            const r = player.basicAttackRange;
            placeRing(ProtoInd.rangeRing, player.position.x, player.position.z, r, 0xfff2a0, 0.6);
            // Highlight a hostile under cursor if any
            const ent = ProtoInput.hoverEntity;
            if (ent && ent.isHostile) {
                placeRing(ProtoInd.targetHighlight, ent.position.x, ent.position.z, 0.95, 0xff5050, 0.95);
                ProtoInd.targetHighlight.visible = true;
            } else {
                ProtoInd.targetHighlight.visible = false;
            }
            ProtoInd.previewRing.visible = false;
            ProtoInd.previewFill.visible = false;
            return;
        }

        const def = session.def;
        const range = def.range || 6;
        const color = colorForAbility(def);
        placeRing(ProtoInd.rangeRing, player.position.x, player.position.z, range, color, 0.55);

        if (def.targetType === 'enemy') {
            const want = pickCursorEnemy(player, cursor, range);
            if (want) {
                placeRing(ProtoInd.targetHighlight, want.position.x, want.position.z, 1.0, color, 0.95);
                ProtoInd.targetHighlight.visible = true;
                // Connector line from cursor to target so the snap is visible
                drawConnector(cursor.x, cursor.z, want.position.x, want.position.z, color);
            } else {
                ProtoInd.targetHighlight.visible = false;
                ProtoInd.connector.visible = false;
            }
            ProtoInd.previewRing.visible = false;
            ProtoInd.previewFill.visible = false;
            return;
        }
        if (def.targetType === 'ally') {
            placeRing(ProtoInd.targetHighlight, player.position.x, player.position.z, 1.0, color, 0.95);
            ProtoInd.targetHighlight.visible = true;
            ProtoInd.connector.visible = false;
            ProtoInd.previewRing.visible = false;
            ProtoInd.previewFill.visible = false;
            return;
        }
        if (def.targetType === 'directional') {
            // Cursor controls direction only — show a line from player out to
            // the projectile's max reach in that direction.
            const dx = cursor.x - player.position.x;
            const dz = cursor.z - player.position.z;
            const len = Math.hypot(dx, dz) || 1;
            const nx = dx / len, nz = dz / len;
            const reach = range; // projectile travel max
            const endX = player.position.x + nx * reach;
            const endZ = player.position.z + nz * reach;
            drawConnector(player.position.x, player.position.z, endX, endZ, color);
            placeRing(ProtoInd.targetHighlight, endX, endZ, 0.40, color, 0.95);
            ProtoInd.targetHighlight.visible = true;
            ProtoInd.previewRing.visible = false;
            ProtoInd.previewFill.visible = false;
            return;
        }
        if (def.targetType === 'aoe_ground' || def.targetType === 'ground') {
            // Always show AoE at real cursor position. If out of range, dim it
            // and add a connector so the player sees they'll walk first.
            const dx = cursor.x - player.position.x;
            const dz = cursor.z - player.position.z;
            const d = Math.hypot(dx, dz);
            const aoeR = def.aoeRadius || 5;
            const outOfRange = d > range;
            const ringOpacity = outOfRange ? 0.55 : 0.95;
            const fillOpacity = outOfRange ? 0.10 : 0.22;
            placeRing(ProtoInd.previewRing, cursor.x, cursor.z, aoeR, color, ringOpacity);
            placeFill(ProtoInd.previewFill, cursor.x, cursor.z, aoeR, color, fillOpacity);
            ProtoInd.previewRing.visible = true;
            ProtoInd.previewFill.visible = true;
            ProtoInd.targetHighlight.visible = false;
            if (outOfRange) {
                drawConnector(player.position.x, player.position.z, cursor.x, cursor.z, color);
            } else {
                ProtoInd.connector.visible = false;
            }
        }
    };

    /** Draw the thin line from cursor to target (so the snap is visible). */
    function drawConnector(fromX, fromZ, toX, toZ, colorHex) {
        const dx = toX - fromX, dz = toZ - fromZ;
        const len = Math.hypot(dx, dz);
        if (len < 0.05) { ProtoInd.connector.visible = false; return; }
        const m = ProtoInd.connector;
        m.position.set((fromX + toX) / 2, m.position.y, (fromZ + toZ) / 2);
        m.scale.set(len, 1, 1);
        // Orient: PlaneGeometry is in XY by default; we already rotated -PI/2 so it's flat on XZ.
        // After rotation.x = -PI/2, world rotation around Y is exposed as rotation.z on the local mesh.
        m.rotation.set(-Math.PI / 2, 0, -Math.atan2(dz, dx));
        m.material.color.setHex(colorHex);
        m.visible = true;
    }

    function placeRing(mesh, x, z, radius, colorHex, opacity) {
        // We use scale to grow a unit ring; the geometry is built around r=0.94..1.0.
        mesh.position.set(x, mesh.position.y, z);
        mesh.scale.set(radius, radius, radius);
        if (mesh.material) {
            mesh.material.color.setHex(colorHex);
            mesh.material.opacity = opacity;
        }
        mesh.visible = true;
    }
    function placeFill(mesh, x, z, radius, colorHex, opacity) {
        mesh.position.set(x, mesh.position.y, z);
        mesh.scale.set(radius, radius, radius);
        if (mesh.material) {
            mesh.material.color.setHex(colorHex);
            mesh.material.opacity = opacity;
        }
        mesh.visible = true;
    }

    function colorForAbility(def) {
        switch (def.id) {
            case 'cleave': return 0xff8855;
            case 'bolt':   return 0x88aaff;
            case 'mend':   return 0x6ef58e;
            case 'storm':  return 0xc599ff;
            default:       return 0xfff2a0;
        }
    }

    window.ProtoInd = ProtoInd;
})();

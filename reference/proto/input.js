/* proto/input.js
 * Mouse + keyboard. Diablo-style controls:
 *   - LEFT click on ground: move (issues an intent each click; held continues)
 *   - LEFT click on enemy: walk into basic-attack range and attack
 *   - RIGHT click on enemy: same as left
 *   - RIGHT click on ground: same as left
 *   - A + LEFT click: attack-move (red marker)
 *   - S: stop
 *   - HOLD SHIFT: stand-still (queued attacks fire from current position)
 *   - Q W E R: cast ability (with auto-pathing into range)
 *
 * Intents are flushed each player tick; only the most recent matters.
 */
(function () {
    'use strict';

    const ProtoInput = {
        raycaster: new THREE.Raycaster(),
        ndc: new THREE.Vector2(),
        mouse: { x: 0, y: 0 },
        groundPos: { x: 0, z: 0 },
        hoverEntity: null,
        attackMovePending: false,
        pendingAbilitySlot: null,
        keys: new Set(),
        leftHeld: false,
        rightHeld: false,
        intent: null,
    };

    ProtoInput.init = function () {
        const canvas = ProtoRenderer.canvas;
        // Listen at window level for mousemove so we keep groundPos fresh even
        // while the cursor is over HUD elements. Press/release stay on canvas.
        window.addEventListener('mousemove', onMove);
        canvas.addEventListener('mousedown', onDown);
        canvas.addEventListener('mouseup', onUp);
        canvas.addEventListener('contextmenu', e => e.preventDefault());
        window.addEventListener('keydown', onKey);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', () => {
            ProtoInput.keys.clear();
            ProtoInput.leftHeld = false; ProtoInput.rightHeld = false;
            if (window.ProtoInd) ProtoInd.cancel();
        });
    };

    ProtoInput.consumeIntent = function () {
        const i = ProtoInput.intent; ProtoInput.intent = null; return i;
    };
    function setIntent(i) { ProtoInput.intent = i; }

    function onMove(e) {
        ProtoInput.mouse.x = e.clientX;
        ProtoInput.mouse.y = e.clientY;
        updatePick();
        // OS cursor: crosshair while aiming, pointer over interactables, else default.
        if (ProtoRenderer.canvas) {
            let cur = 'default';
            const aiming = window.ProtoInd && ProtoInd.isActive();
            if (aiming) cur = 'crosshair';
            else if (ProtoInput.hoverEntity && ProtoInput.hoverEntity.isHostile) cur = 'crosshair';
            else if (ProtoInput.hoverEntity && (ProtoInput.hoverEntity.isNpc || ProtoInput.hoverEntity.isLoot)) cur = 'pointer';
            ProtoRenderer.canvas.style.cursor = cur;
        }
        // Continuous move only on RIGHT button held (left = select).
        // Don't issue while indicator is up; don't overwrite a pending non-move intent.
        const aimingNow = window.ProtoInd && ProtoInd.isActive();
        if (ProtoInput.rightHeld && !aimingNow) {
            const pending = ProtoInput.intent;
            const isNonMovePending = pending && pending.type !== 'move';
            if (!isNonMovePending) issueClickIntent(false, 'right');
        }
    }

    function updatePick() {
        ProtoInput.ndc.x = (ProtoInput.mouse.x / window.innerWidth) * 2 - 1;
        ProtoInput.ndc.y = -(ProtoInput.mouse.y / window.innerHeight) * 2 + 1;
        ProtoInput.raycaster.setFromCamera(ProtoInput.ndc, ProtoCamera.camera);

        // Pick entity (recurse into sub-meshes)
        ProtoInput.hoverEntity = null;
        if (ProtoScene.entityRoot) {
            const roots = [];
            for (const child of ProtoScene.entityRoot.children) {
                const ent = child.userData && child.userData.entity;
                if (!ent || ent.dead || ent.isPlayer) continue;
                roots.push(child);
            }
            const hits = ProtoInput.raycaster.intersectObjects(roots, true);
            if (hits.length) {
                let m = hits[0].object;
                while (m && !(m.userData && m.userData.entity)) m = m.parent;
                if (m) ProtoInput.hoverEntity = m.userData.entity;
            }
        }
        // Ground point
        if (ProtoScene.groundMesh) {
            const hit = ProtoInput.raycaster.intersectObject(ProtoScene.groundMesh, false)[0];
            if (hit) {
                ProtoInput.groundPos.x = hit.point.x;
                ProtoInput.groundPos.z = hit.point.z;
            }
        } else {
            // Fall back to y=0 plane
            const r = ProtoInput.raycaster.ray;
            if (r.direction.y !== 0) {
                const t = -r.origin.y / r.direction.y;
                if (t > 0) {
                    ProtoInput.groundPos.x = r.origin.x + r.direction.x * t;
                    ProtoInput.groundPos.z = r.origin.z + r.direction.z * t;
                }
            }
        }
    }

    function onDown(e) {
        if (e.button === 0) ProtoInput.leftHeld = true;
        if (e.button === 2) ProtoInput.rightHeld = true;
        ProtoInput.mouse.x = e.clientX; ProtoInput.mouse.y = e.clientY;
        updatePick();

        const isLeft = e.button === 0, isRight = e.button === 2;
        const shift = e.shiftKey;

        // Right click cancels any active indicator (LoL convention).
        if (isRight && window.ProtoInd && ProtoInd.isActive()) {
            ProtoInd.cancel();
            return;
        }
        // Indicator up + left click = commit (still useful as alternative to release).
        if (isLeft && window.ProtoInd && ProtoInd.isActive()) {
            commitIndicator();
            return;
        }

        if (isLeft) {
            // Left click = select hovered mob (or deselect if empty/non-hostile).
            const ent = ProtoInput.hoverEntity;
            if (ent && ent.isHostile) {
                Proto.selectedEnemy = ent;
            } else if (ent && (ent.isNpc || ent.isLoot)) {
                // Interact still on left click for NPCs/loot
                ProtoEffects.spawnClickRing(ent.position.x, ent.position.z, '#fff2a0');
                setIntent({ type: 'interact', entity: ent });
            } else {
                Proto.selectedEnemy = null;
            }
            return;
        }
        if (isRight) {
            // Shift + right = pure move; ignore hovered enemies.
            if (shift) {
                ProtoEffects.spawnClickRing(ProtoInput.groundPos.x, ProtoInput.groundPos.z);
                setIntent({ type: 'move', position: { x: ProtoInput.groundPos.x, z: ProtoInput.groundPos.z } });
            } else {
                issueClickIntent(true, 'right');
            }
        }
    }

    /** Commit whatever indicator is active to an intent. */
    function commitIndicator() {
        const ctx = ProtoInd.commitContext();
        ProtoInd.cancel();
        if (!ctx) return;
        // Spawn a feedback ring at the right place
        if (ctx.type === 'attackTarget' && ctx.entity)        ProtoEffects.spawnAttackRing(ctx.entity.position.x, ctx.entity.position.z);
        else if (ctx.type === 'attackMove')                   ProtoEffects.spawnAttackRing(ctx.position.x, ctx.position.z);
        else if (ctx.type === 'castTarget' && ctx.entity)     ProtoEffects.spawnClickRing(ctx.entity.position.x, ctx.entity.position.z, '#c599ff');
        else if (ctx.type === 'castGround')                   ProtoEffects.spawnClickRing(ctx.position.x, ctx.position.z, '#c599ff');
        setIntent(ctx);
    }

    function onUp(e) {
        if (e.button === 0) ProtoInput.leftHeld = false;
        if (e.button === 2) ProtoInput.rightHeld = false;
    }

    /** Resolve a click into intent. Left = always move toward the click point.
     *  Right = attack a hovered enemy if any, else move. NPC/loot interact
     *  works on either button. */
    function issueClickIntent(showRing, button) {
        const ent = ProtoInput.hoverEntity;
        // NPC/loot interact: either button
        if (ent && (ent.isNpc || ent.isLoot)) {
            if (showRing) ProtoEffects.spawnClickRing(ent.position.x, ent.position.z, '#fff2a0');
            setIntent({ type: 'interact', entity: ent });
            return;
        }
        // Right click on hostile = attack
        if (button === 'right' && ent && ent.isHostile) {
            if (showRing) ProtoEffects.spawnAttackRing(ent.position.x, ent.position.z);
            setIntent({ type: 'attackTarget', entity: ent });
            return;
        }
        // Default: move (left always; right on ground)
        if (showRing) ProtoEffects.spawnClickRing(ProtoInput.groundPos.x, ProtoInput.groundPos.z);
        setIntent({ type: 'move', position: { x: ProtoInput.groundPos.x, z: ProtoInput.groundPos.z } });
    }

    function onKey(e) {
        if (ProtoInput.keys.has(e.code)) return;
        const ae = document.activeElement;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
        ProtoInput.keys.add(e.code);

        if (e.code === 'Escape') {
            if (window.ProtoInd && ProtoInd.isActive()) ProtoInd.cancel();
            return;
        }
        if (e.code === 'KeyC') { if (window.ProtoCharSheet) ProtoCharSheet.toggle(); return; }
        if (e.code === 'KeyS') {
            setIntent({ type: 'stop' });
            if (window.ProtoInd) ProtoInd.cancel();
            // Also clear the held-mouse latch so continuous-move stops too.
            ProtoInput.leftHeld = false; ProtoInput.rightHeld = false;
            return;
        }
        if (e.code === 'KeyA') {
            if (window.ProtoInd) ProtoInd.startAttackMove();
            return;
        }

        const slot = abilityCodeToSlot(e.code);
        if (slot != null) { tryStartAbility(slot); return; }
    }

    function onKeyUp(e) {
        ProtoInput.keys.delete(e.code);
        // Commit indicator on key release for the matching ability/A
        if (e.code === 'KeyA' && window.ProtoInd && ProtoInd.active && ProtoInd.active.kind === 'attackMove') {
            commitIndicator();
            return;
        }
        const slot = abilityCodeToSlot(e.code);
        if (slot != null && window.ProtoInd && ProtoInd.matchesAbilitySlot(slot)) {
            commitIndicator();
        }
    }

    function abilityCodeToSlot(code) {
        switch (code) {
            case 'KeyQ': return 0;
            case 'KeyW': return 1;
            case 'KeyE': return 2;
            case 'KeyR': return 3;
            default: return null;
        }
    }

    /** Start an indicator for the ability (or fire instantly if self-cast). */
    function tryStartAbility(slot) {
        const p = window.Proto && Proto.player;
        if (!p) return;
        const def = p.abilities[slot];
        if (!def) return;
        // Self-cast: fire immediately. Don't touch a different ability's indicator.
        if (def.targetType === 'self') {
            setIntent({ type: 'castSelf', slot });
            return;
        }
        // Show indicator; pressing another ability key swaps it.
        if (window.ProtoInd) {
            if (ProtoInd.isActive()) ProtoInd.cancel();
            ProtoInd.startAbility(slot, def);
        }
    }

    window.ProtoInput = ProtoInput;
})();

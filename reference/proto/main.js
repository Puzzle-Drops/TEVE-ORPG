/* proto/main.js
 * Bootstrap, game loop, top-level glue.
 */
(function () {
    'use strict';

    const Proto = {
        player: null,
        entities: [],
        gold: 0,
        running: false,
        respawnTimer: 0,
        deathOverlayEl: null,
        selectedEnemy: null,    // currently selected mob (left-click)

        async boot() {
            try {
                setLoad(0.10, 'Building scene…');
                ProtoScene.create();
                ProtoCamera.create();
                ProtoRenderer.create();
                ProtoInput.init();
                ProtoInd.init();
                ProtoHud.init();
                if (window.ProtoTooltip) ProtoTooltip.init();

                setLoad(0.20, 'Loading models…');
                if (window.ProtoModels) {
                    try { await ProtoModels.preload(); }
                    catch (e) { console.warn('[boot] Model preload failed (will fall back to procedural):', e); }
                }

                setLoad(0.30, 'Sculpting world…');
                ProtoWorld.build();

                setLoad(0.55, 'Awakening hero…');
                Proto.player = new ProtoPlayer({ name: 'Hero', x: 0, z: 0 });
                Proto.entities.unshift(Proto.player);
                ProtoCamera.followTarget(Proto.player);

                setLoad(0.75, 'Joining the world…');
                await ProtoNet.connect();

                // Restore save (lightweight — level/exp/gold/position)
                const saved = ProtoSave.load();
                if (saved) {
                    Proto.player.level = saved.level || 5;
                    Proto.player.exp = saved.exp || 0;
                    Proto.player._refreshStats();
                    Proto.player.currentHp = Proto.player.maxHp;
                    Proto.player.currentMp = Proto.player.maxMp;
                    if (saved.position) {
                        Proto.player.position.x = saved.position.x;
                        Proto.player.position.z = saved.position.z;
                    }
                    Proto.gold = saved.gold || 0;
                }

                setLoad(1.0, 'Ready');
                document.getElementById('proto-loading').style.display = 'none';
                document.getElementById('proto-root').style.display = 'block';

                Proto.running = true;
                ProtoRenderer.start();

                ProtoHud.log('Welcome to the proving grounds, ' + Proto.player.name + '.');
            } catch (err) {
                console.error('Boot failed', err);
                const el = document.getElementById('proto-loading');
                if (el) el.innerHTML = '<div style="color:#ec5050">Boot failed: ' + err.message + '</div>';
            }
        },

        tick(dt, realDt) {
            if (!Proto.running) return;

            // Tick all entities (use real-dt for some non-pause-affected things later if needed)
            for (let i = Proto.entities.length - 1; i >= 0; i--) {
                const e = Proto.entities[i];
                if (!e) { Proto.entities.splice(i, 1); continue; }
                if (e.dead && !e.isPlayer) {
                    if (!e._removeAt) e._removeAt = performance.now() + 1800;
                    if (performance.now() > e._removeAt) {
                        if (e.mesh && e.mesh.parent) e.mesh.parent.remove(e.mesh);
                        Proto.entities.splice(i, 1);
                        continue;
                    }
                }
                if (typeof e.tick === 'function') e.tick(dt);
            }

            // Overlap resolution (simple O(n²))
            resolveOverlaps(Proto.entities);

            // World tick (decor anim, mob respawns)
            ProtoWorld.tick(dt);
            ProtoWorld.tickDecor();

            // Projectiles
            ProtoProj.tick(dt);

            // Effects
            ProtoEffects.tick(realDt);

            // Player death/respawn
            if (Proto.player.dead) {
                Proto.respawnTimer -= realDt;
                if (Proto.respawnTimer <= 0) Proto.respawnPlayer();
            }

            // Auto-clear selection if the selected mob died
            if (Proto.selectedEnemy && Proto.selectedEnemy.dead) Proto.selectedEnemy = null;

            // Camera + indicators + HUD
            ProtoCamera.update(dt, false);
            if (window.ProtoInd) ProtoInd.tick();
            ProtoHud.tick();
            if (window.ProtoCharSheet && ProtoCharSheet.isOpen) ProtoCharSheet.refresh();

            // Auto-save every 30s
            Proto._saveAccum = (Proto._saveAccum || 0) + realDt;
            if (Proto._saveAccum >= 30) { Proto._saveAccum = 0; ProtoSave.save(); }
        },

        handlePlayerDeath(player) {
            Proto.respawnTimer = 4.5;
            ProtoHud.log('You died. Respawning in 4.5s…');
            ProtoCamera.shake(0.6);
            // Death overlay
            if (Proto.deathOverlayEl) Proto.deathOverlayEl.remove();
            const ov = document.createElement('div');
            ov.className = 'death-overlay';
            ov.innerHTML = `<div class="death-title">YOU DIED</div><div class="death-sub">Respawning…</div>`;
            document.getElementById('proto-overlay').appendChild(ov);
            Proto.deathOverlayEl = ov;
        },

        respawnPlayer() {
            const p = Proto.player;
            p.respawnReset();
            p.position.set(0, 0, 0);
            ProtoCamera.snap();
            if (Proto.deathOverlayEl) { Proto.deathOverlayEl.remove(); Proto.deathOverlayEl = null; }
            ProtoHud.log('You return to the plaza.');
        },

        onEnemyKilled(enemy, killer) {
            // Dead players don't earn XP or gold (e.g., projectile in flight after death)
            if (!killer || killer.dead) return;
            const xp = (enemy.template && enemy.template.xpReward) || 10;
            const gold = Math.floor(xp * 0.4);
            killer.gainExp(xp);
            Proto.gold += gold;
            ProtoEffects.spawnFloatText(killer.position, `+${xp} XP  +${gold} G`, '#fbbf24', 13);
        },
    };

    function resolveOverlaps(entities) {
        const RAD = 0.55;
        for (let i = 0; i < entities.length; i++) {
            const a = entities[i];
            if (!a || a.dead || a.isProjectile) continue;
            for (let j = i + 1; j < entities.length; j++) {
                const b = entities[j];
                if (!b || b.dead || b.isProjectile) continue;
                const dx = b.position.x - a.position.x;
                const dz = b.position.z - a.position.z;
                const d = Math.hypot(dx, dz);
                const minD = (a.collisionRadius || RAD) + (b.collisionRadius || RAD);
                if (d >= minD || d <= 0.0001) continue;
                const overlap = (minD - d) * 0.5;
                const nx = dx / d, nz = dz / d;
                a.position.x -= nx * overlap; a.position.z -= nz * overlap;
                b.position.x += nx * overlap; b.position.z += nz * overlap;
            }
        }
    }

    function setLoad(pct, label) {
        const fill = document.querySelector('#proto-loading .loading-fill');
        if (fill) fill.style.width = (pct * 100) + '%';
        const el = document.querySelector('#proto-loading .loading-title');
        if (el && label) el.textContent = label;
    }

    window.Proto = Proto;
})();

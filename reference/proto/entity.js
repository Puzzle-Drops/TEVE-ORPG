/* proto/entity.js
 * Base Entity. Holds transform, hp/mp, buffs/debuffs, cooldowns, character model.
 */
(function () {
    'use strict';

    let nextId = 1;

    class Entity {
        constructor(opts = {}) {
            this.id = opts.id || ('e' + (nextId++));
            this.name = opts.name || 'Entity';
            this.position = new THREE.Vector3(opts.x || 0, 0, opts.z || 0);
            this.facing = 0;
            this.collisionRadius = opts.collisionRadius || 0.55;

            this.dead = false;
            this.isPlayer = false;
            this.isHostile = false;
            this.isNpc = false;
            this.isLoot = false;
            this.isProjectile = false;

            this.maxHp = opts.maxHp || 0;
            this.currentHp = this.maxHp;
            this.maxMp = opts.maxMp || 0;
            this.currentMp = this.maxMp;
            this.buffs = [];
            this.debuffs = [];
            this.cooldowns = {};
            this.basicAttackCooldown = 0;
            this.basicAttackCooldownTotal = 1.0;
            this.castInProgress = null;

            this.character = null;   // ProtoChar instance
            this.mesh = null;
            this.healthBar = null;
            this.source = null;

            this._statusFxAccum = 0;
        }

        get isAlive() { return !this.dead && this.currentHp > 0; }

        addToScene() {
            if (this.mesh) {
                this.mesh.position.copy(this.position);
                this.mesh.userData.entity = this;
                ProtoScene.entityRoot.add(this.mesh);
            }
        }
        removeFromScene() {
            if (this.mesh && this.mesh.parent) this.mesh.parent.remove(this.mesh);
        }

        faceDirection(dx, dz) {
            if (Math.abs(dx) < 1e-3 && Math.abs(dz) < 1e-3) return;
            this.facing = Math.atan2(dx, dz);
            if (this.character) this.character.setFacing(dx, dz);
        }

        tick(dt) {
            if (this.mesh) {
                this.mesh.position.x = this.position.x;
                this.mesh.position.z = this.position.z;
            }
            // Cooldown decrement
            for (const k in this.cooldowns) {
                if (this.cooldowns[k] > 0) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
            }
            if (this.basicAttackCooldown > 0) this.basicAttackCooldown = Math.max(0, this.basicAttackCooldown - dt);

            // 1Hz status fx tick (durations, DoT)
            this._statusFxAccum += dt;
            if (this._statusFxAccum >= 1.0) {
                this._statusFxAccum -= 1.0;
                tickStatusFx(this, 1.0);
            }

            // Health bar — one sprite, single canvas-rendered texture. Redraw
            // only when the HP fraction actually changes.
            if (this.healthBar && this.maxHp > 0) {
                const pct = Math.max(0, Math.min(1, this.currentHp / this.maxHp));
                if (Math.abs(pct - this.healthBar.pct) > 0.001) {
                    drawHealthBar(this.healthBar.ctx, pct);
                    this.healthBar.tex.needsUpdate = true;
                    this.healthBar.pct = pct;
                }
            }
        }

        isCooldown(slot) { return (this.cooldowns[slot] || 0) > 0; }
        startCooldown(slot, sec) { this.cooldowns[slot] = sec; }

        die() {
            if (this.dead) return;
            this.dead = true;
            this.currentHp = 0;
            if (this.character) this.character.playDeath();
            ProtoEffects.spawnDeathPuff(this.position);
            this.onDeath();
        }
        onDeath() { /* subclass hook */ }

        /** HP bar as a single billboarded sprite backed by a per-entity canvas
         *  texture. The plate, gold border, and red gradient fill are all drawn
         *  into one canvas; on HP change we redraw and flag the texture. This
         *  avoids the prior two-sprite design where the fill's local-x offset
         *  drifted out of alignment with the bg whenever a parent group rotated. */
        addHealthBar(width = 1.4, yOffset = 2.4) {
            const canvas = document.createElement('canvas');
            canvas.width = 160; canvas.height = 26;
            const ctx = canvas.getContext('2d');
            const tex = new THREE.CanvasTexture(canvas);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.minFilter = THREE.LinearFilter;
            const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
            const sprite = new THREE.Sprite(mat);
            sprite.scale.set(width, width * (canvas.height / canvas.width), 1);
            sprite.position.y = yOffset;
            sprite.renderOrder = 9000;
            if (this.mesh) this.mesh.add(sprite);
            drawHealthBar(ctx, 1.0);
            this.healthBar = { sprite, tex, ctx, pct: 1.0 };
        }
    }

    /** Paint the bar into `ctx` with `pct` of the inner area filled. */
    function drawHealthBar(ctx, pct) {
        const w = ctx.canvas.width, h = ctx.canvas.height;
        ctx.clearRect(0, 0, w, h);

        // Dark recessed plate
        const bg = ctx.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, '#08080f');
        bg.addColorStop(1, '#1a1626');
        ctx.fillStyle = bg;
        ctx.fillRect(2, 2, w - 4, h - 4);

        // Red gradient fill, anchored to the left, scaled to pct
        const fillX = 4, fillY = 4;
        const fillW = w - 8, fillH = h - 8;
        if (pct > 0) {
            const fw = Math.max(1, Math.round(fillW * pct));
            const grd = ctx.createLinearGradient(0, fillY, 0, fillY + fillH);
            grd.addColorStop(0,    '#ff7066');
            grd.addColorStop(0.35, '#d83838');
            grd.addColorStop(0.7,  '#8a1a1a');
            grd.addColorStop(1,    '#4a0808');
            ctx.fillStyle = grd;
            ctx.fillRect(fillX, fillY, fw, fillH);

            // Glossy highlight along the top of the fill
            const gloss = ctx.createLinearGradient(0, fillY, 0, fillY + fillH * 0.5);
            gloss.addColorStop(0, 'rgba(255,255,255,0.35)');
            gloss.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = gloss;
            ctx.fillRect(fillX, fillY, fw, fillH * 0.5);
        }

        // Gold border
        ctx.strokeStyle = '#c8a050';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, w - 2, h - 2);

        // Inner dark stroke for depth
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(3, 3, w - 6, h - 6);
    }

    function tickStatusFx(unit, dt) {
        if (!unit || unit.dead) return;
        for (const d of unit.debuffs) {
            if (d.name === 'Bleed' && unit.maxHp > 0) {
                const tick = Math.max(1, Math.floor(unit.maxHp * 0.05 * dt));
                if (tick > 0 && window.ProtoCombat) ProtoCombat.dealDamage({ name: 'Bleed' }, unit, tick, 'pure');
            }
        }
        for (let i = unit.buffs.length - 1; i >= 0; i--) {
            const b = unit.buffs[i];
            if (b.duration === -1) continue;
            b.duration -= dt;
            if (b.duration <= 0) unit.buffs.splice(i, 1);
        }
        for (let i = unit.debuffs.length - 1; i >= 0; i--) {
            const d = unit.debuffs[i];
            if (d.duration === -1) continue;
            d.duration -= dt;
            if (d.duration <= 0) unit.debuffs.splice(i, 1);
        }
    }


    window.ProtoEntity = Entity;
})();

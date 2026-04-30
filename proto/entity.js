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
            this.selectionRing = null;  // WC3-style faction ring under unit

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

            // Selection ring pulse
            this.tickSelectionRing(dt);

            // Health bar — sprites auto-face camera; we just rescale fill from
            // the left edge so it shrinks toward the right as HP drops.
            if (this.healthBar && this.maxHp > 0) {
                const pct = Math.max(0, this.currentHp / this.maxHp);
                const w = this.healthBar.width;
                this.healthBar.fill.scale.x = Math.max(0.001, w * pct);
                this.healthBar.fill.position.x = -((1 - pct) * w * 0.5);
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

        /** WC3-style faction ring under the unit. Always visible; pulses brighter
         *  when hovered or targeted by the player. */
        addSelectionRing(colorHex, radius = 0.85) {
            const mat = new THREE.MeshBasicMaterial({
                color: colorHex, transparent: true, opacity: 0.85,
                side: THREE.DoubleSide,
                depthTest: false, depthWrite: false,
            });
            mat.userData.baseOpacity = 0.85;
            mat.userData.baseColor = colorHex;
            const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.93, radius, 48), mat);
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = 0.03;
            ring.renderOrder = 7000;
            if (this.mesh) this.mesh.add(ring);
            this.selectionRing = ring;
            this.selectionRingRadius = radius;
        }

        /** Per-frame: brighter when hovered/targeted, gold when selected. */
        tickSelectionRing(dt) {
            if (!this.selectionRing) return;
            const isHovered  = window.ProtoInput && ProtoInput.hoverEntity === this;
            const isTargeted = window.Proto && Proto.player && Proto.player.goal && Proto.player.goal.entity === this;
            const isSelected = window.Proto && Proto.selectedEnemy === this;
            const mat = this.selectionRing.material;
            const baseOpacity = mat.userData.baseOpacity || 0.6;
            const baseColor = mat.userData.baseColor || mat.color.getHex();

            // Color: selected = gold, otherwise base (red for hostile, green for player)
            const targetHex = isSelected ? 0xfbbf24 : baseColor;
            mat.color.lerpColors(mat.color, new THREE.Color(targetHex), Math.min(1, 12 * dt));

            // Opacity: brighter on hover/target/select
            const wantOpacity = (isSelected) ? 1.0 : (isHovered || isTargeted ? 1.0 : baseOpacity);
            mat.opacity += (wantOpacity - mat.opacity) * Math.min(1, 12 * dt);

            // Pulse: targeted by player, OR selected
            if (isTargeted || isSelected) {
                const t = performance.now() / 250;
                this.selectionRing.scale.setScalar(1 + Math.sin(t) * 0.07);
            } else {
                this.selectionRing.scale.setScalar(1);
            }
        }

        /** Ornate sprite-based HP bar with gold trim, gradient fill, and dark
         *  recessed background — reads cleanly even at distance. */
        addHealthBar(width = 1.4, yOffset = 2.4) {
            // BG sprite: dark recessed plate with gold border (canvas-drawn)
            const bgTex = makeBarBgTexture(160, 26);
            const bgMat = new THREE.SpriteMaterial({ map: bgTex, transparent: true, depthTest: false });
            const bg = new THREE.Sprite(bgMat);
            bg.scale.set(width, width * (26 / 160), 1);
            bg.renderOrder = 9000;
            // Fill sprite: red gradient, scales x with HP%
            const fillTex = makeBarFillTexture(160, 18, '#ff7066', '#d83838', '#8a1a1a', '#4a0808');
            const fillMat = new THREE.SpriteMaterial({ map: fillTex, transparent: true, depthTest: false });
            const fill = new THREE.Sprite(fillMat);
            fill.scale.set(width * 0.92, width * 0.92 * (18 / 160), 1);
            fill.renderOrder = 9001;
            const grp = new THREE.Group();
            grp.add(bg); grp.add(fill);
            grp.position.y = yOffset;
            if (this.mesh) this.mesh.add(grp);
            this.healthBar = { group: grp, fill, bg, width: width * 0.92 };
        }
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

    /** Cached canvas → THREE.CanvasTexture for the HP bar background. */
    let _bgTexCache = null;
    function makeBarBgTexture(w, h) {
        if (_bgTexCache) return _bgTexCache;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        // Dark recessed plate
        const grd = ctx.createLinearGradient(0, 0, 0, h);
        grd.addColorStop(0, '#08080f');
        grd.addColorStop(1, '#1a1626');
        ctx.fillStyle = grd;
        ctx.fillRect(2, 2, w - 4, h - 4);
        // Gold border
        ctx.strokeStyle = '#c8a050';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, w - 2, h - 2);
        // Inner dark stroke for depth
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(3, 3, w - 6, h - 6);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        _bgTexCache = tex;
        return tex;
    }

    /** Cached red-gradient fill texture for HP bar. */
    let _fillTexCache = null;
    function makeBarFillTexture(w, h, c1, c2, c3, c4) {
        if (_fillTexCache) return _fillTexCache;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        const grd = ctx.createLinearGradient(0, 0, 0, h);
        grd.addColorStop(0,    c1);
        grd.addColorStop(0.35, c2);
        grd.addColorStop(0.7,  c3);
        grd.addColorStop(1,    c4);
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
        // Glossy highlight along top
        const gloss = ctx.createLinearGradient(0, 0, 0, h * 0.5);
        gloss.addColorStop(0, 'rgba(255,255,255,0.35)');
        gloss.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gloss;
        ctx.fillRect(0, 0, w, h * 0.5);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        _fillTexCache = tex;
        return tex;
    }

    window.ProtoEntity = Entity;
})();

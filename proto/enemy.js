/* proto/enemy.js
 * Generic prototype enemy. 3D character with simple AI:
 *   - Idle until a player enters aggro radius
 *   - Chase toward player at moveSpeed
 *   - When in melee range, basic-attack on cooldown
 *
 * For the prototype, all enemies use the 'beast' character preset with
 * stats scaled by their template's tier.
 */
(function () {
    'use strict';

    const TEMPLATES = {
        grunt: {
            name: 'Satyr Youth', tier: 1,
            preset: 'beast', scale: 1.0, tint: 0x6a4030,
            spriteId: 'satyr_youth',
            stats: { str: 8, agi: 6, int: 2 },
            hp: 80, attack: 8, armor: 4, resist: 2,
            actionBarSpeed: 220, moveSpeed: 4.2,
            aggroRadius: 13, xpReward: 18,
        },
        brute: {
            name: 'Satyr Instigator', tier: 3,
            preset: 'beast', scale: 1.4, tint: 0x8a3030,
            spriteId: 'satyr_instigator',
            stats: { str: 18, agi: 4, int: 2 },
            hp: 220, attack: 14, armor: 8, resist: 4,
            actionBarSpeed: 180, moveSpeed: 3.6,
            aggroRadius: 13, xpReward: 60,
        },
        stalker: {
            name: 'Aggressive Satyr', tier: 2,
            preset: 'beast', scale: 0.85, tint: 0x55304a,
            spriteId: 'aggressive_satyr',
            stats: { str: 6, agi: 12, int: 8 },
            hp: 60, attack: 10, armor: 2, resist: 8,
            actionBarSpeed: 280, moveSpeed: 5.2,
            aggroRadius: 13, xpReward: 24,
        },
    };

    class Enemy extends ProtoEntity {
        constructor(templateId, opts = {}) {
            super({ name: TEMPLATES[templateId].name, x: opts.x || 0, z: opts.z || 0, collisionRadius: 0.55 });
            this.isHostile = true;
            this.templateId = templateId;
            const t = TEMPLATES[templateId];
            this.template = t;
            this.maxHp = t.hp;
            this.currentHp = this.maxHp;
            this.attack = t.attack;
            this.armor = t.armor;
            this.resist = t.resist;
            this.actionBarSpeed = t.actionBarSpeed;
            this.moveSpeed = t.moveSpeed;
            this.aggroRadius = t.aggroRadius;
            this.basicAttackRange = 2.2;
            this.xpReward = t.xpReward;
            this.spawn = { x: opts.x || 0, z: opts.z || 0 };

            // Build character
            this.character = ProtoChar.create(t.preset, { bodyColor: t.tint, scale: t.scale });
            this.mesh = this.character.group;
            this.addToScene();
            this.addHealthBar(1.0 + 0.5 * t.scale, 1.6 + 1.4 * t.scale);
            // WC3-style red hostile ring; size scales with model
            this.addSelectionRing(0xdd4444, 0.85 * t.scale);

            // AI state
            this._target = null;
            this._retarget = 0;
            this.velX = 0; this.velZ = 0;
            this.stats = t.stats || { str: 5, agi: 5, int: 1 };
            this.tier = t.tier || 1;
        }

        tick(dt) {
            super.tick(dt);
            if (this.dead) return;

            // Anchor leash: if we've strayed past 2× aggroRadius from spawn,
            // drop aggro and walk back home.
            const anchorMax = (this.aggroRadius || 18) * 2;
            const dxAnchor = this.position.x - this.spawn.x;
            const dzAnchor = this.position.z - this.spawn.z;
            const distFromSpawn = Math.hypot(dxAnchor, dzAnchor);
            if (distFromSpawn > anchorMax) {
                this._target = null;
                this._returningHome = true;
            }
            if (this._returningHome && distFromSpawn < 0.5) {
                this._returningHome = false;
            }

            // Re-target periodically (skip while returning home)
            this._retarget -= dt;
            if (!this._returningHome && (!this._target || this._target.dead || this._retarget <= 0)) {
                this._target = ProtoCombat.findNearestHostile(this, this.aggroRadius);
                this._retarget = 0.5;
            }

            // Stunned: cannot act
            if (ProtoCombat.hasDebuff(this, 'Stun')) {
                this.character.tick(dt, { moving: false });
                return;
            }

            const target = this._target;
            if (!target) {
                // Drift back to spawn — faster if leash-tripped, slow otherwise.
                const dx = this.spawn.x - this.position.x;
                const dz = this.spawn.z - this.position.z;
                const d = Math.hypot(dx, dz);
                const speedMul = this._returningHome ? 1.0 : 0.5;
                if (d > 0.5) this._stepToward(this.spawn, dt, this.moveSpeed * speedMul);
                else { this.velX *= 0.9; this.velZ *= 0.9; }
                this.character.tick(dt, { moving: d > 0.5 });
                return;
            }

            const d = Math.hypot(target.position.x - this.position.x, target.position.z - this.position.z);
            if (d > this.basicAttackRange) {
                this._stepToward(target.position, dt, this.moveSpeed);
                this.character.tick(dt, { moving: true });
            } else {
                // In range: stop, face, swing on CD
                this.velX *= 0.5; this.velZ *= 0.5;
                this.faceDirection(target.position.x - this.position.x, target.position.z - this.position.z);
                if (this.basicAttackCooldown <= 0) {
                    const intervalSec = 2.0 * 200 / Math.max(50, this.actionBarSpeed);
                    const cd = Math.max(0.5, intervalSec);
                    this.basicAttackCooldown = cd;
                    this.basicAttackCooldownTotal = cd;
                    this.character.playSwing(1);
                    ProtoEffects.spawnSwingArc(this.position, target.position, '#ec5050');
                    ProtoCombat.dealDamage(this, target, this.attack, 'physical');
                }
                this.character.tick(dt, { moving: false });
            }
        }

        _stepToward(target, dt, speed) {
            const dx = target.x - this.position.x;
            const dz = target.z - this.position.z;
            const d = Math.hypot(dx, dz);
            if (d < 0.05) return;
            const desiredVx = (dx / d) * speed;
            const desiredVz = (dz / d) * speed;
            const ax = desiredVx - this.velX;
            const az = desiredVz - this.velZ;
            const k = Math.min(1, 20 * dt / Math.max(0.001, Math.hypot(ax, az)));
            this.velX += ax * k;
            this.velZ += az * k;
            this.position.x += this.velX * dt;
            this.position.z += this.velZ * dt;
            this.faceDirection(this.velX, this.velZ);
        }

        onDeath() {
            // Notify world to schedule respawn
            if (window.ProtoWorld) ProtoWorld.notifyEnemyDied(this);
        }
    }

    window.ProtoEnemy = Enemy;
    window.ProtoEnemyTemplates = TEMPLATES;
})();

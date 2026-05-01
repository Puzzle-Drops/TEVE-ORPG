/* proto/player.js
 * The player character. Wraps a stat block with TEVE-style formulas plus a
 * mana resource. Smooth movement with acceleration/deceleration, click-to-move,
 * attack-target auto-pursuit, ability casting with auto-walk-into-range.
 */
(function () {
    'use strict';

    /** Stat block — TEVE formulas, plus mana. Single character for the prototype.
     *  All numbers tuned so a fresh L5 can survive 2-3 satyrs at once. */
    function buildStats(level = 5) {
        const initial = { str: 12, agi: 10, int: 8, hp: 60, mp: 40, hpRegen: 1.0, mpRegen: 4.0, attack: 6, attackSpeed: 130, armor: 8, resist: 6 };
        const mods    = { str: 1.5, agi: 1.2, int: 1.0, hp: 5.0, mp: 3.0, attack: 0.6, armor: 0.18, resist: 0.12 };
        const mainstat = 'str';
        const str = Math.floor(initial.str + level * mods.str);
        const agi = Math.floor(initial.agi + level * mods.agi);
        const int = Math.floor(initial.int + level * mods.int);
        const main = mainstat === 'str' ? str : mainstat === 'agi' ? agi : int;
        const hp = Math.floor(initial.hp + str * mods.hp);
        const mp = Math.floor(initial.mp + int * mods.mp);
        const attack = Math.floor(initial.attack + main * mods.attack);
        const armor = Math.floor(initial.armor + level * mods.armor + str * 0.05 + agi * 0.01);
        const resist = Math.floor(initial.resist + level * mods.resist + int * 0.05);
        const attackSpeed = Math.floor(initial.attackSpeed + 100 * (agi / (agi + 1000)));
        const hpRegen = initial.hpRegen + str * 0.01;
        const mpRegen = initial.mpRegen + int * 0.10;
        return {
            str, agi, int, mainstat,
            hp, mp, attack, armor, resist,
            actionBarSpeed: attackSpeed * 2,
            hpRegen, mpRegen,
        };
    }

    function expToNext(level) {
        if (level >= 200) return 0;
        return Math.floor(100 + level * 80 + Math.pow(level, 1.6) * 6);
    }

    class Player extends ProtoEntity {
        constructor(opts = {}) {
            super({ name: opts.name || 'Hero', x: opts.x || 0, z: opts.z || 0, collisionRadius: 0.55 });
            this.isPlayer = true;
            this.classFamily = 'Warrior';
            this.level = opts.level || 5;
            this.exp = 0;
            this.expToNext = expToNext(this.level);
            this._refreshStats();
            this.currentHp = this.maxHp;
            this.currentMp = this.maxMp;

            // 3D character
            this.character = ProtoChar.create('warrior');
            this.mesh = this.character.group;
            this.addToScene();

            // Movement state
            this.moveTarget = null;
            this.moveSpeed = 7.0;        // base speed
            this.velX = 0; this.velZ = 0;
            this.accel = 32;             // units/s² for snap acceleration

            // Combat state — ranged auto-attack (~4× the previous melee reach)
            this.basicAttackRange = 10.5;
            this.basicAttackCooldown = 0;
            this.goal = null;            // current high-level intent
            this.isRanged = true;
            this.aggroRadius = 11;       // auto-retaliate range when truly idle (≈ basic attack range)
            this.holdPosition = false;   // S key sets this; suppresses auto-retaliate

            // Abilities
            this.abilities = ProtoAb.list;
            this.passive = ProtoAb.passive;

            // Cooldown table init
            for (let i = 0; i < this.abilities.length; i++) this.cooldowns[i] = 0;
        }

        _refreshStats() {
            const s = buildStats(this.level);
            this.stats = { str: s.str, agi: s.agi, int: s.int };
            this.maxHp = s.hp;
            this.maxMp = s.mp;
            this.attack = s.attack;
            this.armor = s.armor;
            this.resist = s.resist;
            this.actionBarSpeed = s.actionBarSpeed;
            this.hpRegen = s.hpRegen;
            this.mpRegen = s.mpRegen;
            this.mainstat = s.mainstat;
        }

        get effectiveMoveSpeed() {
            let s = this.moveSpeed;
            if (ProtoCombat.hasBuff(this, 'Increase Speed')) s *= 1.33;
            if (ProtoCombat.hasDebuff(this, 'Reduce Speed')) s *= 0.67;
            if (ProtoCombat.hasDebuff(this, 'Stun')) s = 0;
            return s;
        }

        gainExp(n) {
            const before = this.level;
            this.exp += n;
            while (this.exp >= this.expToNext && this.level < 200) {
                this.exp -= this.expToNext;
                this.level += 1;
                this.expToNext = expToNext(this.level);
            }
            if (this.level > before) {
                const oldHp = this.maxHp, oldMp = this.maxMp;
                this._refreshStats();
                // Heal up the gain on level-up
                this.currentHp = Math.min(this.maxHp, this.currentHp + (this.maxHp - oldHp));
                this.currentMp = Math.min(this.maxMp, this.currentMp + (this.maxMp - oldMp));
                ProtoEffects.spawnFloatText(this.position, 'LEVEL UP', '#fbbf24', 22);
                ProtoEffects.spawnCastBurst(this.position.x, this.position.z, '#fbbf24');
                ProtoCamera.shake(0.3);
            }
        }

        tick(dt) {
            super.tick(dt);
            // Dead: no spells, no auto-attacks, no movement, no intents. Death
            // animation continues via character.tick.
            if (this.dead) {
                if (this.character) this.character.tick(dt, { moving: false });
                // Drop any queued intents so they don't fire on respawn.
                ProtoInput.consumeIntent();
                this.basicAttackCooldown = 0;
                this.castInProgress = null;
                this.goal = null;
                this.moveTarget = null;
                this.velX = 0; this.velZ = 0;
                return;
            }

            // Regens (alive only)
            if (this.currentHp < this.maxHp) this.currentHp = Math.min(this.maxHp, this.currentHp + this.hpRegen * dt);
            if (this.currentMp < this.maxMp) this.currentMp = Math.min(this.maxMp, this.currentMp + this.mpRegen * dt);

            // Cast in progress?
            if (this.castInProgress) ProtoAb.tickCastInProgress(this, dt);

            // Consume new intent
            const intent = ProtoInput.consumeIntent();
            if (intent) {
                if (intent.type === 'stop') {
                    this.goal = null;
                    this.moveTarget = null;
                    this.velX = 0; this.velZ = 0;
                    if (this.castInProgress) this.castInProgress = null;
                    this.holdPosition = true;   // suppress auto-retaliate until next command
                } else {
                    this.goal = intent;
                    this.holdPosition = false;  // explicit command clears hold
                }
            }

            // Resolve current goal
            const goal = this.goal;
            if (goal) {
                switch (goal.type) {
                    case 'move': this._followMoveGoal(dt, goal.position); break;
                    case 'attackMove': this._tickAttackMove(dt, goal.position); break;
                    case 'attackTarget': this._tickAttackTarget(dt, goal.entity); break;
                    case 'castTarget': this._tickCastTarget(dt, goal); break;
                    case 'castGround': this._tickCastGround(dt, goal); break;
                    case 'castSelf': this._tickCastSelf(dt, goal); break;
                    case 'castDirectional': this._tickCastDirectional(dt, goal); break;
                    case 'interact': this._tickInteract(dt, goal.entity); break;
                    case 'noTarget':
                        ProtoEffects.spawnFloatText(this.position, 'No Target', '#ffaa55', 14);
                        this.goal = null;
                        break;
                }
            }

            // Auto-retaliate when truly idle (no goal, no cast, no movement,
            // not held by 'stop'). Stops when an enemy walks into aggroRadius.
            if (!this.goal && !this.castInProgress && !this.moveTarget && !this.holdPosition) {
                const nearest = ProtoCombat.findNearestHostile(this, this.aggroRadius);
                if (nearest) this.goal = { type: 'attackTarget', entity: nearest };
            }

            // Apply velocity to position (smooth movement with friction)
            this._stepMovement(dt);

            // Drive character animation
            const moving = Math.hypot(this.velX, this.velZ) > 0.4;
            this.character.tick(dt, { moving });

            // Footstep dust puffs
            if (moving) {
                this._stepDust = (this._stepDust || 0) - dt;
                if (this._stepDust <= 0) {
                    this._stepDust = 0.22;
                    spawnFootstepDust(this.position.x, this.position.z);
                }
            } else {
                this._stepDust = 0;
            }
        }

        _followMoveGoal(dt, target) {
            const dx = target.x - this.position.x;
            const dz = target.z - this.position.z;
            const d = Math.hypot(dx, dz);
            if (d < 0.15) { this.goal = null; this.moveTarget = null; return; }
            this.moveTarget = target;
        }

        _stepMovement(dt) {
            if (!this.moveTarget) {
                // Decelerate
                this.velX *= Math.pow(0.001, dt);
                this.velZ *= Math.pow(0.001, dt);
                return;
            }
            const speed = this.effectiveMoveSpeed;
            const dx = this.moveTarget.x - this.position.x;
            const dz = this.moveTarget.z - this.position.z;
            const d = Math.hypot(dx, dz);
            if (d < 0.05) { this.moveTarget = null; return; }
            const desiredVx = (dx / d) * speed;
            const desiredVz = (dz / d) * speed;
            // Accelerate toward desired
            const ax = desiredVx - this.velX;
            const az = desiredVz - this.velZ;
            const k = Math.min(1, this.accel * dt / Math.max(0.001, Math.hypot(ax, az)));
            this.velX += ax * k;
            this.velZ += az * k;
            // Step
            const stepX = this.velX * dt;
            const stepZ = this.velZ * dt;
            const stepLen = Math.hypot(stepX, stepZ);
            if (stepLen > d) {
                this.position.x = this.moveTarget.x;
                this.position.z = this.moveTarget.z;
                this.moveTarget = null;
                this.velX *= 0.5; this.velZ *= 0.5;
            } else {
                this.position.x += stepX;
                this.position.z += stepZ;
            }
            this.faceDirection(this.velX, this.velZ);
        }

        _tickAttackTarget(dt, target) {
            if (!target || target.dead) { this.goal = null; this.moveTarget = null; return; }
            const d = distXZ(this.position, target.position);
            if (d > this.basicAttackRange) {
                this.moveTarget = { x: target.position.x, z: target.position.z };
                return;
            }
            // In range — stop, face, swing
            this.moveTarget = null;
            this.faceDirection(target.position.x - this.position.x, target.position.z - this.position.z);
            if (this.basicAttackCooldown <= 0 && !this.castInProgress) {
                this._fireBasicAttack(target);
            }
        }

        _tickAttackMove(dt, point) {
            const nearest = ProtoCombat.findNearestHostile(this, this.basicAttackRange + 1);
            if (nearest) {
                this.moveTarget = null;
                this.faceDirection(nearest.position.x - this.position.x, nearest.position.z - this.position.z);
                if (this.basicAttackCooldown <= 0 && !this.castInProgress) this._fireBasicAttack(nearest);
                return;
            }
            // Walk toward point
            this.moveTarget = point;
            const d = distXZ(this.position, point);
            if (d < 0.15) { this.goal = null; }
        }

        _tickCastTarget(dt, goal) {
            const def = this.abilities[goal.slot];
            if (!def) { this.goal = null; return; }
            const target = goal.entity;
            if (!target || target.dead) { this.goal = null; return; }
            const range = ProtoAb.castRange(this, def);
            const d = distXZ(this.position, target.position);
            if (d > range) {
                this.moveTarget = { x: target.position.x, z: target.position.z };
                return;
            }
            this.moveTarget = null;
            this.faceDirection(target.position.x - this.position.x, target.position.z - this.position.z);
            ProtoAb.tryCast(this, goal.slot, { target });
            // After casting on a target, automatically continue auto-attacking
            // them (LoL-style "champion stays engaged"). User can override with
            // any other command. If we cast on an ally, just go idle.
            if (target.isHostile && !target.dead) {
                this.goal = { type: 'attackTarget', entity: target };
            } else {
                this.goal = null;
            }
        }

        _tickCastGround(dt, goal) {
            const def = this.abilities[goal.slot];
            if (!def) { this.goal = null; return; }
            const range = ProtoAb.castRange(this, def);
            const d = distXZ(this.position, goal.position);
            if (d > range) {
                // Walk straight toward the cast spot. Any new intent will overwrite
                // this goal and effectively cancel the queued cast.
                this.moveTarget = { x: goal.position.x, z: goal.position.z };
                return;
            }
            // In range — stop, face, fire at the ORIGINAL cast position.
            this.moveTarget = null;
            this.faceDirection(goal.position.x - this.position.x, goal.position.z - this.position.z);
            ProtoAb.tryCast(this, goal.slot, { groundPos: goal.position });
            this.goal = null;
        }

        _tickCastSelf(dt, goal) {
            const def = this.abilities[goal.slot];
            if (!def) { this.goal = null; return; }
            ProtoAb.tryCast(this, goal.slot, { target: this });
            this.goal = null;
        }

        /** Directional skillshot — instant fire from player toward cursor direction. */
        _tickCastDirectional(dt, goal) {
            const def = this.abilities[goal.slot];
            if (!def || !goal.direction) { this.goal = null; return; }
            // Face the cast direction so the swing/cast animation reads naturally
            this.faceDirection(goal.direction.dx, goal.direction.dz);
            ProtoAb.tryCast(this, goal.slot, { direction: goal.direction });
            this.goal = null;
        }

        _tickInteract(dt, ent) {
            if (!ent || ent.dead) { this.goal = null; return; }
            const r = ent.interactRadius || 1.6;
            const d = distXZ(this.position, ent.position);
            if (d > r) { this.moveTarget = { x: ent.position.x, z: ent.position.z }; return; }
            this.moveTarget = null;
            if (ent.onInteract) ent.onInteract(this);
            this.goal = null;
        }

        _fireBasicAttack(target) {
            // 2.0s base @ 200 actionBarSpeed; floor 0.5s.
            const intervalSec = 2.0 * 200 / Math.max(50, this.actionBarSpeed);
            const cd = Math.max(0.5, intervalSec);
            this.basicAttackCooldown = cd;
            this.basicAttackCooldownTotal = cd;
            const dmg = this.attack;
            this.character.playSwing(1);
            if (this.isRanged) {
                ProtoProj.spawn({
                    from: this, to: target,
                    speed: 30, damage: dmg, damageType: 'physical',
                    color: 0xffd388, scale: 1.0,
                });
            } else {
                ProtoEffects.spawnSwingArc(this.position, target.position, '#ffd388');
                ProtoCombat.dealDamage(this, target, dmg, 'physical');
            }
        }

        onDeath() {
            // Player handled by Proto loop (timer + respawn)
        }

        respawnReset() {
            this.dead = false;
            this.currentHp = this.maxHp;
            this.currentMp = this.maxMp;
            this.buffs.length = 0;
            this.debuffs.length = 0;
            this.basicAttackCooldown = 0;
            this.castInProgress = null;
            this.goal = null;
            this.moveTarget = null;
            this.velX = 0; this.velZ = 0;
            for (const k in this.cooldowns) this.cooldowns[k] = 0;
            if (this.character) this.character.reset();
        }
    }

    function distXZ(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

    function spawnFootstepDust(x, z) {
        for (let i = 0; i < 2; i++) {
            const mat = new THREE.MeshBasicMaterial({ color: 0xa0937a, transparent: true, opacity: 0.55, depthWrite: false });
            const m = new THREE.Mesh(new THREE.SphereGeometry(0.10, 6, 4), mat);
            m.position.set(x + (Math.random() - 0.5) * 0.4, 0.10, z + (Math.random() - 0.5) * 0.4);
            ProtoScene.effectsRoot.add(m);
            ProtoEffects.anim3d.push({
                mesh: m, ttl: 0.45, age: 0,
                opts: { vy: 0.3 + Math.random() * 0.4 },
                fn(self, dt) {
                    self.mesh.position.y += self.opts.vy * dt;
                    self.opts.vy *= 0.92;
                    const t = self.age / self.ttl;
                    self.mesh.scale.setScalar(1 + t * 1.5);
                    self.mesh.material.opacity = (1 - t) * 0.55;
                },
            });
        }
    }

    window.ProtoPlayer = Player;
})();

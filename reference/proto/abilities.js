/* proto/abilities.js
 * Generic Q/W/E/R + passive built directly into the prototype. Exists to
 * exercise every system (single-target, projectile, AoE, self-heal, passive,
 * mana cost, cooldown, cast wind-up). Future: replace with TEVE spell adapters.
 *
 * Each ability descriptor:
 *   {
 *     id, name, key, glyph,
 *     manaCost, cooldown,    // numbers
 *     castTime,              // optional wind-up seconds
 *     range,                 // melee 2.5 / mid 8 / ranged 14
 *     targetType,            // 'enemy' | 'self' | 'aoe_ground'
 *     aoeRadius,             // for ground AoE
 *     description,           // tooltip
 *     execute(caster, ctx)   // fires when cast resolves
 *   }
 */
(function () {
    'use strict';

    const ProtoAb = {};

    ProtoAb.list = [
        {
            id: 'cleave', name: 'Cleave', key: 'Q', glyph: 'Q',
            iconPath: 'img/spells/fury_strike.png',
            manaCost: 5, cooldown: 1.5, castTime: 0,
            range: 2.8, targetType: 'enemy',
            description: 'Strike a target for [1.4 × ATK] physical. Hits up to 2 nearby enemies for 60% damage.',
            execute(caster, ctx) {
                const target = ctx.target;
                if (!target || target.dead) return;
                const dmg = Math.floor(caster.attack * 1.4 + caster.stats.str * 0.5);
                ProtoCombat.dealDamage(caster, target, dmg, 'physical');
                ProtoEffects.spawnSwingArc(caster.position, target.position, '#ff8855');
                if (caster.character) caster.character.playSwing(1);
                ProtoCamera.shake(0.15);
                // Splash to nearby
                let splashed = 0;
                for (const e of ProtoCombat.allHostilesOf(caster)) {
                    if (e === target || splashed >= 2) continue;
                    const d = Math.hypot(e.position.x - target.position.x, e.position.z - target.position.z);
                    if (d <= 3.0) {
                        ProtoCombat.dealDamage(caster, e, Math.floor(dmg * 0.6), 'physical');
                        splashed++;
                    }
                }
            },
        },
        {
            id: 'bolt', name: 'Bolt', key: 'W', glyph: 'W',
            iconPath: 'img/spells/frost_bolt.png',
            manaCost: 18, cooldown: 4.0, castTime: 0,
            range: 18, targetType: 'directional',
            projectileRadius: 0.55,
            description: 'Fire an arcane bolt in the cursor direction. Hits the first enemy in its path for [1.8 × ATK + 1.2 × INT] magical and Slows.',
            execute(caster, ctx) {
                const dir = ctx.direction || { dx: Math.sin(caster.character ? caster.character.state.facing : 0), dz: Math.cos(caster.character ? caster.character.state.facing : 0) };
                const dmg = Math.floor(caster.attack * 1.8 + caster.stats.int * 1.2);
                ProtoProj.spawn({
                    from: caster,
                    direction: dir,                  // normalized {dx,dz}
                    speed: 32,
                    maxRange: this.range || 18,
                    damage: dmg,
                    damageType: 'magical',
                    color: 0x88aaff, scale: 1.2,
                    onHit(target) {
                        ProtoCombat.applyDebuff(target, 'Reduce Speed', 3);
                    },
                });
            },
        },
        {
            id: 'mend', name: 'Mend', key: 'E', glyph: 'E',
            iconPath: 'img/spells/barkskin.png',
            manaCost: 25, cooldown: 8.0, castTime: 0.25,
            range: 0, targetType: 'self',
            description: 'Restore 30% max HP and gain Increase Defense for 4s.',
            execute(caster) {
                const heal = Math.floor(caster.maxHp * 0.30);
                ProtoCombat.healUnit(caster, heal);
                ProtoCombat.applyBuff(caster, 'Increase Defense', 4);
                ProtoEffects.spawnCastBurst(caster.position.x, caster.position.z, '#6ef58e');
            },
        },
        {
            id: 'storm', name: 'Storm', key: 'R', glyph: 'R',
            iconPath: 'img/spells/eye_of_the_storm.png',
            manaCost: 60, cooldown: 30, castTime: 0.5,
            range: 12, targetType: 'aoe_ground', aoeRadius: 6,
            description: 'Call a storm at the target location. Hits all enemies in radius for [3.0 × ATK + 2.0 × MAINSTAT] magical.',
            execute(caster, ctx) {
                const c = ctx.groundPos || caster.position;
                const dmg = Math.floor(caster.attack * 3.0 + getMain(caster) * 2.0);
                // Lingering AoE visual
                ProtoEffects.spawnAoeTelegraph(c.x, c.z, 6, 0.9, '#c599ff');
                // 5 lightning strikes around the AoE (random scatter)
                for (let i = 0; i < 5; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const r = Math.random() * 6;
                    const sx = c.x + Math.cos(a) * r;
                    const sz = c.z + Math.sin(a) * r;
                    setTimeout(() => ProtoEffects.spawnLightningStrike(sx, sz, '#c599ff', 14), i * 50);
                }
                for (const e of ProtoCombat.allHostilesOf(caster)) {
                    const d = Math.hypot(e.position.x - c.x, e.position.z - c.z);
                    if (d <= 6) {
                        ProtoCombat.dealDamage(caster, e, dmg, 'magical');
                        ProtoEffects.spawnLightningStrike(e.position.x, e.position.z, '#c599ff', 12);
                    }
                }
                ProtoCamera.shake(0.6);
                ProtoRenderer.hitPause(0.07, 0.05);
            },
        },
    ];

    ProtoAb.passive = {
        id: 'vampire', name: 'Vampire', key: 'P', glyph: 'V',
        iconPath: 'img/spells/drain_life.png',
        description: '5% of damage you deal is restored as HP.',
    };
    ProtoAb.basicAttack = {
        id: 'autoattack', name: 'Basic Attack', key: 'A',
        iconPath: 'img/spells/arrow_volley.png',
        description: 'Right-click an enemy or A + click. Auto-attacks any target in range.',
    };

    function getMain(caster) {
        const ms = caster.mainstat || 'str';
        return caster.stats[ms] || 0;
    }

    /** Cooldown computed via TEVE-style: base × (200 / actionBarSpeed). */
    ProtoAb.cooldownFor = function (caster, def) {
        if (!def || def.cooldown <= 0) return 0;
        const speed = caster.actionBarSpeed || 200;
        return Math.max(0.5, def.cooldown * 200 / Math.max(50, speed));
    };

    /** Try to begin a cast — checks mana, cooldown, range, status. */
    ProtoAb.tryCast = function (caster, slot, ctx) {
        const def = caster.abilities[slot];
        if (!def) return { ok: false, why: 'no ability' };
        if (caster.isCooldown(slot)) return { ok: false, why: 'cd' };
        if (caster.currentMp < def.manaCost) {
            ProtoEffects.spawnFloatText(caster.position, 'No Mana', '#58a4ff');
            return { ok: false, why: 'mana' };
        }
        if (ProtoCombat.hasDebuff(caster, 'Stun') || ProtoCombat.hasDebuff(caster, 'Silence')) {
            return { ok: false, why: 'silenced' };
        }
        // Pay mana up front so the player gets feedback even on cast-time abilities
        caster.currentMp -= def.manaCost;
        // Cast wind-up
        if (def.castTime > 0) {
            caster.castInProgress = { slot, def, ctx, t: def.castTime, total: def.castTime };
            if (caster.character) caster.character.playCast(def.castTime);
            ProtoEffects.spawnCastBurst(caster.position.x, caster.position.z, '#c599ff');
        } else {
            ProtoAb._fire(caster, slot, def, ctx);
        }
        return { ok: true };
    };

    /** Fire ability now, set cooldown. Called either inline or after cast time. */
    ProtoAb._fire = function (caster, slot, def, ctx) {
        try { def.execute(caster, ctx); } catch (err) { console.error('[ability]', def.id, err); }
        caster.startCooldown(slot, ProtoAb.cooldownFor(caster, def));
        if (def.castTime > 0 && caster.character) caster.character.playSwing(1);
    };

    /** Resolve range for an ability. Self has range 0; AoE has its travel range. */
    ProtoAb.castRange = function (caster, def) {
        if (def.targetType === 'self') return 0;
        return def.range || 8;
    };

    /** Tick the in-progress cast, fire when wind-up elapses. */
    ProtoAb.tickCastInProgress = function (caster, dt) {
        const c = caster.castInProgress;
        if (!c) return;
        if (ProtoCombat.hasDebuff(caster, 'Stun')) {
            // Cast interrupted; refund mana
            caster.currentMp = Math.min(caster.maxMp, caster.currentMp + c.def.manaCost);
            ProtoEffects.spawnFloatText(caster.position, 'Interrupted', '#aaa');
            caster.castInProgress = null;
            return;
        }
        c.t -= dt;
        if (c.t <= 0) {
            const def = c.def, ctx = c.ctx, slot = c.slot;
            caster.castInProgress = null;
            ProtoAb._fire(caster, slot, def, ctx);
        }
    };

    window.ProtoAb = ProtoAb;
})();

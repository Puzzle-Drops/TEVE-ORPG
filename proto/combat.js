/* proto/combat.js
 * Damage / heal / mana / buff/debuff with TEVE math + ARPG-friendly feedback.
 *
 * dealDamage applies attacker buffs, target debuffs, armor/resist reduction,
 * shield absorption, hit-pause + camera shake on big hits, and on-kill hooks.
 */
(function () {
    'use strict';

    const ProtoCombat = {};

    const BUFF_CONFIGS = {
        'Increase Attack':  { damageMultiplier: 1.5, glyph: '⚔', color: '#ec5050' },
        'Increase Defense': { defenseBuff: 0.25, glyph: '🛡', color: '#58a4ff' },
        'Increase Speed':   { speedMultiplier: 1.33, glyph: '⚡', color: '#fbbf24' },
        'Frost Armor':      { defenseBuff: 0.25, glyph: '❄', color: '#88e0ff' },
        'Immune':           { immunity: true, glyph: '✦', color: '#fff' },
        'Shield':           { glyph: '◈', color: '#88ccff' },
    };
    const DEBUFF_CONFIGS = {
        'Bleed':            { glyph: '✱', color: '#ec5050' },
        'Blight':           { noHeal: true, glyph: '☠', color: '#88dd66' },
        'Stun':             { stunned: true, glyph: '✦', color: '#fbbf24' },
        'Reduce Attack':    { attackMultiplier: 0.5, glyph: '⚔', color: '#aaa' },
        'Reduce Defense':   { defenseReduction: 0.25, glyph: '🛡', color: '#aaa' },
        'Reduce Speed':     { speedMultiplier: 0.67, glyph: '⏬', color: '#aaa' },
        'Silence':          { silenced: true, glyph: '✕', color: '#aaa' },
        'Mark':             { marked: true, dodgePrevented: true, glyph: '◎', color: '#ec5050' },
        'Taunt':            { glyph: '!', color: '#fbbf24' },
    };

    /* ---- Entity queries ---- */
    function allCombatEntities() {
        return (window.Proto && Proto.entities) ? Proto.entities.filter(e => e && (e.isPlayer || e.isHostile)) : [];
    }
    ProtoCombat.allHostilesOf = function (unit) {
        const isP = !!unit.isPlayer;
        return allCombatEntities().filter(e => e !== unit && e.isAlive && (isP ? e.isHostile : e.isPlayer));
    };
    ProtoCombat.allFriendliesOf = function (unit) {
        const isP = !!unit.isPlayer;
        return allCombatEntities().filter(e => e.isAlive && (isP ? e.isPlayer : e.isHostile));
    };
    ProtoCombat.findNearestHostile = function (unit, maxDist) {
        let best = null, bestD = Infinity;
        for (const e of ProtoCombat.allHostilesOf(unit)) {
            const dx = unit.position.x - e.position.x;
            const dz = unit.position.z - e.position.z;
            const d = Math.hypot(dx, dz);
            if (d <= maxDist && d < bestD) { best = e; bestD = d; }
        }
        return best;
    };

    /* ---- Buff/debuff inspection ---- */
    ProtoCombat.hasBuff   = (u, n) => !!(u.buffs && u.buffs.find(b => b.name === n));
    ProtoCombat.hasDebuff = (u, n) => !!(u.debuffs && u.debuffs.find(d => d.name === n));
    ProtoCombat.getBuff   = (u, n) => u.buffs && u.buffs.find(b => b.name === n);

    /* ---- Damage ---- */
    ProtoCombat.dealDamage = function (attacker, target, raw, type = 'physical', opts = {}) {
        if (!target || target.dead || raw <= 0) return 0;
        let amount = raw;

        // Crit roll: 5% base
        const isCrit = !opts.noCrit && Math.random() < 0.05;
        if (isCrit) amount *= 2;

        if (ProtoCombat.hasBuff(attacker, 'Increase Attack')) amount *= 1.5;
        if (ProtoCombat.hasDebuff(attacker, 'Reduce Attack')) amount *= 0.5;
        if (ProtoCombat.hasDebuff(target, 'Reduce Defense')) amount *= 1.25;
        if (ProtoCombat.hasDebuff(target, 'Mark')) amount *= 1.25;
        if (ProtoCombat.hasBuff(target, 'Increase Defense')) amount *= 0.75;
        if (ProtoCombat.hasBuff(target, 'Frost Armor')) amount *= 0.75;

        if (type === 'physical') {
            const a = stat(target, 'armor');
            const dr = (0.9 * a) / (a + 500);
            amount *= (1 - dr);
        } else if (type === 'magical') {
            const r = stat(target, 'resist');
            const dr = (0.3 * r) / (r + 1000);
            amount *= (1 - dr);
        }
        amount = Math.max(1, Math.floor(amount));

        // Shield absorption
        const shield = ProtoCombat.getBuff(target, 'Shield');
        if (shield && shield.shieldAmount > 0) {
            const absorb = Math.min(shield.shieldAmount, amount);
            shield.shieldAmount -= absorb;
            amount -= absorb;
            if (shield.shieldAmount <= 0) {
                const i = target.buffs.indexOf(shield);
                if (i >= 0) target.buffs.splice(i, 1);
            }
        }

        if (amount <= 0) return 0;
        target.currentHp -= amount;
        ProtoEffects.spawnDamageNumber(target.position, amount, type, isCrit);
        if (!opts.skipFlash) {
            const flash = type === 'magical' ? '#88aaff' : type === 'pure' ? '#c599ff' : '#ffe0a0';
            ProtoEffects.spawnHitFlash(target.position, flash);
        }
        if (target.character && !target.dead) target.character.playHurt();

        // Player-take-damage screen flash
        if (target.isPlayer && !target.dead) {
            const v = document.getElementById('proto-vignette');
            if (v) {
                v.classList.add('hit');
                clearTimeout(v._hitTo);
                v._hitTo = setTimeout(() => v.classList.remove('hit'), 220);
            }
        }

        // Hit pause + shake on bigger hits
        if (isCrit) { ProtoRenderer.hitPause(0.06, 0.05); ProtoCamera.shake(0.35); }
        else if (amount > target.maxHp * 0.10) { ProtoRenderer.hitPause(0.04, 0.15); ProtoCamera.shake(0.18); }

        // Vampire passive (player only, generic example)
        if (attacker && attacker.isPlayer && attacker.passive && attacker.passive.id === 'vampire') {
            const heal = Math.max(1, Math.floor(amount * 0.05));
            ProtoCombat.healUnit(attacker, heal);
        }

        // Player retaliation — counter-attack when idle and hit. Held-stop
        // (S key) suppresses retaliation until the next user command.
        if (target.isPlayer && attacker && attacker.isHostile && !attacker.dead && !target.dead) {
            const idle = !target.goal && !target.castInProgress && !target.holdPosition;
            if (idle) {
                target.goal = { type: 'attackTarget', entity: attacker };
            }
        }

        // Chain-aggro: a hostile that takes damage aggros the source, and any
        // other hostile within 5 units of the victim also aggros the same
        // source. Overrides existing targets — getting shot makes you turn to
        // face the shooter. One-hop only (doesn't propagate further).
        if (attacker && !attacker.isHostile && !attacker.dead && target.isHostile && !target.dead) {
            const CHAIN_RADIUS = 5;
            // 1) Damaged mob retargets the attacker
            target._target = attacker;
            target._retarget = 0.5;
            target._returningHome = false;
            // 2) Nearby allies also retarget the attacker
            for (const e of ProtoCombat.allHostilesOf(attacker)) {
                if (e === target || e.dead) continue;
                const dx = e.position.x - target.position.x;
                const dz = e.position.z - target.position.z;
                if ((dx * dx + dz * dz) <= CHAIN_RADIUS * CHAIN_RADIUS) {
                    e._target = attacker;
                    e._retarget = 0.5;
                    e._returningHome = false;
                }
            }
        }

        if (target.currentHp <= 0) {
            target.currentHp = 0;
            ProtoCombat.handleDeath(target, attacker);
        }
        return amount;
    };

    function stat(unit, key) {
        if (unit[key] != null) return unit[key];
        if (unit.source && unit.source[key] != null) return unit.source[key];
        return 0;
    }

    /* ---- Heal / Mana ---- */
    ProtoCombat.healUnit = function (target, amount) {
        if (!target || target.dead || amount <= 0) return 0;
        if (ProtoCombat.hasDebuff(target, 'Blight')) return 0;
        const before = target.currentHp;
        target.currentHp = Math.min(target.maxHp, before + amount);
        const actual = target.currentHp - before;
        if (actual > 0) ProtoEffects.spawnDamageNumber(target.position, actual, 'heal');
        return actual;
    };
    ProtoCombat.spendMana = function (target, amount) {
        if (target.currentMp < amount) return false;
        target.currentMp -= amount;
        return true;
    };
    ProtoCombat.restoreMana = function (target, amount) {
        const before = target.currentMp;
        target.currentMp = Math.min(target.maxMp, before + amount);
        const a = target.currentMp - before;
        if (a > 0) ProtoEffects.spawnDamageNumber(target.position, a, 'mana');
        return a;
    };

    /* ---- Buff / Debuff application ---- */
    ProtoCombat.applyBuff = function (target, name, duration, effects) {
        if (!target || target.dead) return false;
        const cfg = BUFF_CONFIGS[name] || {};
        const merged = Object.assign({}, cfg, effects || {});
        const existing = ProtoCombat.getBuff(target, name);
        if (name === 'Shield') {
            const newAmt = (effects && effects.shieldAmount) || merged.shieldAmount || 0;
            if (existing) {
                existing.shieldAmount = Math.max(existing.shieldAmount || 0, newAmt);
                existing.duration = duration;
            } else {
                target.buffs.push(Object.assign({ name, duration, shieldAmount: newAmt }, merged));
            }
            return true;
        }
        if (existing) {
            existing.duration = duration === -1 ? -1 : Math.max(existing.duration, duration);
            Object.assign(existing, merged);
        } else {
            target.buffs.push(Object.assign({ name, duration }, merged));
        }
        ProtoEffects.spawnFloatText(target.position, '+' + name, merged.color || '#88ccff', 13);
        return true;
    };
    ProtoCombat.applyDebuff = function (target, name, duration, effects) {
        if (!target || target.dead) return false;
        if (ProtoCombat.hasBuff(target, 'Immune')) return false;
        const cfg = DEBUFF_CONFIGS[name] || {};
        const merged = Object.assign({}, cfg, effects || {});
        const existing = target.debuffs.find(d => d.name === name);
        if (existing) {
            if (name === 'Bleed') existing.duration += duration;
            else existing.duration = Math.max(existing.duration, duration);
            Object.assign(existing, merged);
        } else {
            target.debuffs.push(Object.assign({ name, duration }, merged));
        }
        ProtoEffects.spawnFloatText(target.position, '-' + name, merged.color || '#ff7777', 13);
        return true;
    };

    /* ---- Death ---- */
    ProtoCombat.handleDeath = function (target, killer) {
        if (target.dead) return;
        target.die();
        if (target.isPlayer) {
            if (window.Proto && Proto.handlePlayerDeath) Proto.handlePlayerDeath(target);
        } else if (target.isHostile && killer && killer.isPlayer && Proto.onEnemyKilled) {
            Proto.onEnemyKilled(target, killer);
        }
    };

    /* ---- Buff config exposed for HUD glyph rendering ---- */
    ProtoCombat.BUFF_CONFIGS = BUFF_CONFIGS;
    ProtoCombat.DEBUFF_CONFIGS = DEBUFF_CONFIGS;

    window.ProtoCombat = ProtoCombat;
})();

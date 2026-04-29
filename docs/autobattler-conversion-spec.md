# TEVE Autobattler Conversion — Implementation Spec

## Overview

Convert TEVE's turn-based battle system into a real-time autobattler. Units move freely on the battlefield, path toward enemies, and attack when in range. The existing turn-based `Battle` class in `battle.js` is **replaced** by a new `BattleRealtime` class in a new file `battleRealtime.js`. The existing `BattleAI` class in `battleAI.js` is **replaced** by a new `RealtimeAI` class in a new file `realtimeAI.js`. The existing `BattleAnimations` class in `battleAnimations.js` is **updated** to support real-time positioning and continuous animation. All other game systems (heroes, enemies, items, dungeons, progression, saves, UI outside of battle) remain **unchanged**.

**Core Principle:** Everything outside of battle stays the same. The battle itself goes from "fill action bar → take turn → pick ability" to "all units act simultaneously in real-time with movement, range checks, and cooldown-based attacks."

---

## Architecture Summary

### Files to CREATE (new)
- `battleRealtime.js` — New real-time battle loop, damage pipeline, buff/debuff system
- `realtimeAI.js` — Per-unit-per-tick AI: target selection, movement, ability usage

### Files to MODIFY
- `battleAnimations.js` — Update to work with free-positioned DOM elements instead of fixed slots
- `battleUnit.js` — Add position (x, y), moveSpeed, atkRange, facing, animation state
- `uiManager.js` — Update `showBattleScreen()` to create a free-position battlefield; update battle UI rendering
- `styles.css` — Add real-time battle CSS (unit positioning, walk/attack/idle animations, projectiles, particles)
- `loadingManager.js` — Add `battleRealtime.js` and `realtimeAI.js` to the script load order (load after `battleAI.js`, before `battle.js` — or replace those entries)
- `game.js` — Update `startBattle()` to instantiate `BattleRealtime` instead of `Battle`
- `index.html` — Update the `#battleScene` HTML structure for free-position layout

### Files that stay UNTOUCHED
- `hero.js`, `enemy.js`, `item.js`, `autosell.js`, `arena.js`, `tutorial.js`
- `saveManager.js`, `devConsole.js`, `scalingSystem.js`
- All JSON data files (`heroes.json`, `enemies.json`, `spells.json`, `dungeons.json`, `items.json`, `arena.json`)
- `spellLogic.js` — Spell functions stay the same; the new battle class provides the same interface (`dealDamage`, `applyBuff`, `applyDebuff`, `healUnit`, `getParty`, `getEnemies`, `log`, etc.) so spell logic functions don't need changes. Duration values that currently mean "turns" now mean "seconds" — see Duration Conversion section.

---

## Detailed Implementation

### 1. BattleUnit Changes (`battleUnit.js`)

Add these new properties to the `BattleUnit` constructor:

```javascript
// Real-time positioning
this.x = 0;           // Pixel X on battlefield
this.y = 0;           // Pixel Y on battlefield
this.moveSpeed = 0;   // Pixels per second (derived from AGI)
this.baseAtkRange = 0; // Attack range in pixels

// Animation state
this.animState = 'idle'; // 'idle' | 'walking' | 'attacking' | 'casting' | 'dying' | 'dead'
this.facing = 1;         // 1 = facing right, -1 = facing left
this.stateTimer = 0;     // Time remaining in current animation lock

// Combat cooldowns (real-time)
this.globalCooldown = 0;    // GCD in seconds remaining
this.abilityCooldowns = {}; // { abilityIndex: secondsRemaining }
this.currentTarget = null;  // Reference to target BattleUnit

// DOM element reference (the free-positioned unit element)
this.el = null;
```

Add a new getter for computed move speed:

```javascript
get realtimeMoveSpeed() {
    // Base: 80px/s, scales with AGI up to ~160px/s
    let speed = 80 + 80 * (this.stats.agi / (this.stats.agi + 500));
    
    // Apply Increase Speed buff: +33%
    this.buffs.forEach(buff => {
        if (buff.name === 'Increase Speed') speed *= 1.33;
    });
    
    // Apply Reduce Speed debuff: -33%
    this.debuffs.forEach(debuff => {
        if (debuff.name === 'Reduce Speed') speed *= 0.67;
    });
    
    return speed;
}

get realtimeAtkRange() {
    // Melee units: 60px, Ranged units: 200px
    // Determine from spell data: if first ability has target 'enemy' and doesn't have 'ranged' tag, it's melee
    // This can also be read from enemy/hero data if a 'range' property exists
    // Fallback: 60px (melee default)
    return this.baseAtkRange || 60;
}

get attackSpeed() {
    // Attacks per second. Derived from AGI.
    // Base: 0.8 atk/s, scaling with AGI up to ~1.5 atk/s
    let speed = 0.8 + 0.7 * (this.stats.agi / (this.stats.agi + 800));
    
    this.buffs.forEach(buff => {
        if (buff.name === 'Increase Speed') speed *= 1.33;
    });
    this.debuffs.forEach(debuff => {
        if (debuff.name === 'Reduce Speed') speed *= 0.67;
    });
    
    return speed;
}
```

**Attack range classification** — determine at spawn time:
- Check the unit's first non-passive ability in `spells.json`. If any of its effects include `'ranged'` or its description mentions ranged/projectile, OR if the unit's class family is Archer or the hero class contains "archer"/"ranger"/"mage"/"wizard"/"witch"/"cleric"/"druid"/"sage"/"prophet": `baseAtkRange = 200`.
- Otherwise: `baseAtkRange = 60` (melee).
- Healers get `baseAtkRange = 180` for healing allies.

### 2. Duration Conversion (Turns → Seconds)

The existing system uses turn-based durations for buffs, debuffs, and cooldowns. In real-time:

**Rule: 1 turn = 2 seconds.**

All duration values in `spells.json` remain unchanged — the conversion happens at the battle system level:
- When `applyBuff()` or `applyDebuff()` is called with a `duration`, store it as `duration * 2` seconds internally.
- When `reduceCooldowns()` is called, it's replaced by delta-time subtraction each tick.
- Cooldowns from `spells.json` (e.g., cooldown: 3) become `3 * 2 = 6 seconds`.
- Permanent buffs (duration === -1) stay permanent.
- Bleed DOT (5% max HP per turn) becomes 2.5% max HP per second.

### 3. BattleRealtime Class (`battleRealtime.js`)

This is the main file. It replaces `Battle` and must provide the **exact same public interface** so that `spellLogic.js` functions work without changes. Every method that `spellLogic.js` calls must exist with the same signature.

#### Required Public Interface (must match `Battle` class):

```
dealDamage(attacker, target, amount, damageType, options)  → number
healUnit(target, amount)                                    → number
applyBuff(target, buffName, duration, effects)              → void
applyDebuff(target, debuffName, duration, effects)          → void
removeBuffs(target)                                         → void
removeDebuffs(target)                                       → void
applyShield(target, amount)                                 → void
getParty(unit)                                              → BattleUnit[]
getEnemies(unit)                                            → BattleUnit[]
log(message)                                                → void
trackBattleStat(unitName, stat, value)                      → void
```

The `this.party`, `this.enemies`, `this.allUnits`, `this.battleStats`, `this.animations`, `this.currentUnit` properties must all exist.

#### Constructor

Same signature as `Battle`: `constructor(game, party, enemyWaves, mode = 'dungeon')`

Does the same setup: creates BattleUnits for party and first wave enemies, initializes battle stats, applies initial passives, creates battle UI. But additionally:
- Assigns starting X/Y positions (see Positioning section).
- Sets `baseAtkRange` and `moveSpeed` per unit.
- Creates DOM elements for each unit in the battlefield (free-positioned).

#### Game Loop

```javascript
start() {
    this.running = true;
    this.lastTimestamp = performance.now();
    this.animFrameId = requestAnimationFrame((t) => this.gameLoop(t));
}

gameLoop(timestamp) {
    if (!this.running) return;
    
    const rawDt = (timestamp - this.lastTimestamp) / 1000;
    const dt = Math.min(rawDt, 0.1) * this.gameSpeed; // Cap delta, apply speed multiplier
    this.lastTimestamp = timestamp;
    
    // 1. Update all living units
    for (const unit of this.allUnits) {
        if (!unit.isAlive) continue;
        this.updateUnit(unit, dt);
    }
    
    // 2. Update projectiles
    this.updateProjectiles(dt);
    
    // 3. Process buff/debuff tick-downs
    this.tickBuffsDebuffs(dt);
    
    // 4. Process DOT effects
    this.tickDOTs(dt);
    
    // 5. Render all unit positions to DOM
    this.renderUnits();
    
    // 6. Check win/loss
    if (this.checkBattleEnd()) return;
    
    this.animFrameId = requestAnimationFrame((t) => this.gameLoop(t));
}
```

#### Unit Update (per tick)

```javascript
updateUnit(unit, dt) {
    // Reduce state timer
    unit.stateTimer = Math.max(0, unit.stateTimer - dt);
    
    // Reduce global cooldown
    unit.globalCooldown = Math.max(0, unit.globalCooldown - dt);
    
    // Reduce ability cooldowns
    for (const key in unit.abilityCooldowns) {
        unit.abilityCooldowns[key] = Math.max(0, unit.abilityCooldowns[key] - dt);
    }
    
    // If stunned, skip all logic
    if (unit.debuffs.some(d => d.name === 'Stun' || d.stunned)) {
        unit.animState = 'idle';
        return;
    }
    
    // If in an animation lock (attacking/casting), wait it out
    if (unit.stateTimer > 0 && (unit.animState === 'attacking' || unit.animState === 'casting')) {
        return;
    }
    
    // AI decides what to do
    this.ai.updateUnit(unit, dt);
}
```

#### Buff/Debuff Tick

```javascript
tickBuffsDebuffs(dt) {
    for (const unit of this.allUnits) {
        if (!unit.isAlive) continue;
        
        // Tick buff durations
        unit.buffs = unit.buffs.filter(buff => {
            if (buff.duration === -1) return true; // Permanent
            buff.duration -= dt;
            return buff.duration > 0;
        });
        
        // Tick debuff durations  
        const wasStunned = unit.debuffs.some(d => d.name === 'Stun' || d.stunned);
        unit.debuffs = unit.debuffs.filter(debuff => {
            if (debuff.duration === -1) return true;
            debuff.duration -= dt;
            return debuff.duration > 0;
        });
        const isStunned = unit.debuffs.some(d => d.name === 'Stun' || d.stunned);
        if (wasStunned !== isStunned) {
            this.animations.updateStunVisuals(unit);
        }
    }
}
```

#### DOT Tick

```javascript
tickDOTs(dt) {
    // Accumulate fractional ticks per unit
    for (const unit of this.allUnits) {
        if (!unit.isAlive) continue;
        
        unit._dotAccumulator = (unit._dotAccumulator || 0) + dt;
        
        // Tick DOT every 1 second
        if (unit._dotAccumulator >= 1.0) {
            unit._dotAccumulator -= 1.0;
            
            // Bleed: 2.5% max HP per second (5% per 2s "turn")
            if (unit.debuffs.some(d => d.name === 'Bleed')) {
                const damage = Math.ceil(unit.maxHp * 0.025);
                unit.currentHp = Math.max(0, unit.currentHp - damage);
                this.log(`${unit.name} bleeds for ${damage} damage!`);
                if (unit.currentHp <= 0) this.handleUnitDeath(unit);
            }
            
            // Custom DOT debuffs with dotDamage property
            unit.debuffs.forEach(debuff => {
                if (debuff.dotDamage && unit.isAlive) {
                    const damage = Math.floor(debuff.dotDamage * 0.5); // Half per second (was per turn)
                    unit.currentHp = Math.max(0, unit.currentHp - damage);
                    this.log(`${unit.name} takes ${damage} from ${debuff.name}!`);
                    if (unit.currentHp <= 0) this.handleUnitDeath(unit);
                }
            });
            
            // HP Regen (if not blighted)
            if (!unit.debuffs.some(d => d.name === 'Blight')) {
                const regen = Math.floor(unit.isEnemy ? 
                    unit.stats.str * 0.025 : // Half of 0.05 per second
                    unit.source.hpRegen * 0.5);
                if (regen > 0) {
                    const actual = Math.min(regen, unit.maxHp - unit.currentHp);
                    if (actual > 0) unit.currentHp += actual;
                }
            }
        }
    }
}
```

#### Damage Pipeline

**Copy the entire `dealDamage()` method from `battle.js` verbatim.** It must have the exact same damage pipeline (caster modifiers → DR → shields → on-hit effects → death check). The only change: `this.currentUnit` references may need to be replaced with the `attacker` parameter where applicable, since there's no longer a single "current unit" taking a turn.

Same for `healUnit()`, `applyBuff()`, `applyDebuff()`, `removeBuffs()`, `removeDebuffs()`, `handleUnitDeath()`, `getParty()`, `getEnemies()`.

**Critical:** When porting `applyBuff` and `applyDebuff`, multiply the incoming `duration` by 2 to convert turns to seconds. Add this at the top of both methods:

```javascript
// Convert turn-based duration to seconds (1 turn = 2 seconds)
if (duration > 0) {
    duration = duration * 2;
}
```

**Critical:** Port the `applyBuff`/`applyDebuff` self-targeting +1 duration logic. In the old system, if a unit buffs itself during its own turn, duration gets +1 to account for the immediate tick-down. In real-time, this is unnecessary. **Remove the `adjustedDuration` logic** that adds +1 when `target === this.currentUnit`.

#### Wave Transitions

Same as current: when all enemies die, calculate wave exp, load next wave, spawn new enemy BattleUnits with positions. If final wave cleared, end battle with victory.

#### Passives

Port the passive application logic from `processTurn()` and `endTurn()` in `battle.js`. These passives currently trigger "on turn start" or "on turn end." In real-time, convert them to periodic triggers:

- **Turn-start passives** (Burning Fury, Eternal Tide, Tribal Leader, Sovereign's Presence, Mirror of Truth, Twilight's End): Trigger every 2 seconds per unit. Each unit gets a `_passiveTimer` that counts up; when it hits 2.0, reset and fire passives.
- **Turn-end passives** (Shield Regen, HP Regen, Lord's Presence, Regenerative Roots): Also trigger on the same 2-second tick, after the turn-start passives.
- **On-hit / on-damage-taken / on-kill passives**: These remain event-driven and fire from `dealDamage()` and `handleUnitDeath()` exactly as they do now.

#### Player Manual Mode

When `autoMode` is false and it's a party member's turn to pick an ability:
- In real-time, the unit simply auto-plays using AI at all times. The player can still toggle `autoMode` off to **pause** the battle and manually select abilities/targets, similar to how mobile autobattlers work.
- When paused, show the ability panel for the selected unit. Player picks ability + target, then unpauses.
- Alternatively, units always autoplay but the player can tap a unit to override its next ability. This is simpler.

**Recommended approach:** Default to full auto. Keep the auto/manual toggle. In manual mode, the battle still runs in real-time but the game pauses (sets `this.gameSpeed = 0`) when a player unit's ability comes off cooldown. The player selects the ability and target, then the game resumes. This preserves the existing manual play feel while being real-time.

### 4. RealtimeAI Class (`realtimeAI.js`)

Per-unit-per-tick decision making. Much simpler than the turn-based AI since decisions happen continuously.

```javascript
class RealtimeAI {
    constructor(battle) {
        this.battle = battle;
    }
    
    updateUnit(unit, dt) {
        // Healer logic: prioritize healing wounded allies
        if (this.isHealer(unit)) {
            this.updateHealer(unit, dt);
            return;
        }
        
        // Combat logic: find target, move to range, attack
        this.updateCombatant(unit, dt);
    }
    
    updateCombatant(unit, dt) {
        const enemies = this.battle.getEnemies(unit).filter(e => e.isAlive);
        if (enemies.length === 0) return;
        
        // Check taunt
        const tauntDebuff = unit.debuffs.find(d => d.name === 'Taunt' && d.tauntTarget);
        if (tauntDebuff && tauntDebuff.tauntTarget && tauntDebuff.tauntTarget.isAlive) {
            unit.currentTarget = tauntDebuff.tauntTarget;
        }
        
        // Target selection: retarget if current target is dead or null
        if (!unit.currentTarget || !unit.currentTarget.isAlive) {
            unit.currentTarget = this.selectTarget(unit, enemies);
        }
        
        if (!unit.currentTarget) return;
        
        const dx = unit.currentTarget.x - unit.x;
        const dy = unit.currentTarget.y - unit.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Face target
        unit.facing = dx > 0 ? 1 : -1;
        
        // Check if in attack range
        if (dist <= unit.realtimeAtkRange) {
            // In range — try to use an ability
            if (unit.globalCooldown <= 0) {
                this.useAbility(unit);
            } else {
                unit.animState = 'idle';
            }
        } else {
            // Out of range — move toward target
            this.moveToward(unit, unit.currentTarget, dt);
        }
    }
    
    updateHealer(unit, dt) {
        const allies = this.battle.getParty(unit).filter(a => a.isAlive);
        const wounded = allies.filter(a => a.currentHp < a.maxHp * 0.8);
        
        if (wounded.length > 0) {
            // Heal lowest HP ally
            wounded.sort((a, b) => (a.currentHp / a.maxHp) - (b.currentHp / b.maxHp));
            unit.currentTarget = wounded[0];
            
            const dx = unit.currentTarget.x - unit.x;
            const dy = unit.currentTarget.y - unit.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            unit.facing = dx > 0 ? 1 : -1;
            
            if (dist <= unit.realtimeAtkRange && unit.globalCooldown <= 0) {
                this.useHealAbility(unit);
            } else if (dist > unit.realtimeAtkRange) {
                this.moveToward(unit, unit.currentTarget, dt);
            } else {
                unit.animState = 'idle';
            }
        } else {
            // No wounded allies — attack enemies
            this.updateCombatant(unit, dt);
        }
    }
    
    selectTarget(unit, enemies) {
        // Primary: nearest enemy
        let nearest = null, nearestDist = Infinity;
        for (const e of enemies) {
            const dx = e.x - unit.x;
            const dy = e.y - unit.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < nearestDist) { nearestDist = d; nearest = e; }
        }
        return nearest;
    }
    
    moveToward(unit, target, dt) {
        const dx = target.x - unit.x;
        const dy = target.y - unit.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) return;
        
        // Separation from nearby allied units to prevent stacking
        let sepX = 0, sepY = 0;
        const allies = this.battle.getParty(unit);
        for (const other of allies) {
            if (other === unit || !other.isAlive) continue;
            const ox = unit.x - other.x, oy = unit.y - other.y;
            const od = Math.sqrt(ox * ox + oy * oy);
            if (od < 40 && od > 0) {
                sepX += (ox / od) * 3;
                sepY += (oy / od) * 3;
            }
        }
        
        const nx = dx / dist + sepX * 0.3;
        const ny = dy / dist + sepY * 0.3;
        const nl = Math.sqrt(nx * nx + ny * ny) || 1;
        
        unit.x += (nx / nl) * unit.realtimeMoveSpeed * dt;
        unit.y += (ny / nl) * unit.realtimeMoveSpeed * dt;
        
        // Clamp to battlefield bounds
        // (bounds will be defined based on the battlefield element dimensions)
        
        unit.animState = 'walking';
    }
    
    useAbility(unit) {
        const battle = this.battle;
        const abilities = unit.abilities;
        const enemies = battle.getEnemies(unit).filter(e => e.isAlive);
        
        // Check silence: force skill 1
        if (unit.debuffs.some(d => d.name === 'Silence')) {
            const firstAbility = abilities.find((a, i) => !a.passive && (unit.abilityCooldowns[i] || 0) <= 0);
            if (firstAbility) {
                const idx = abilities.indexOf(firstAbility);
                battle.executeAbility(unit, idx, unit.currentTarget);
                unit.globalCooldown = 1 / unit.attackSpeed;
                unit.abilityCooldowns[idx] = (firstAbility.cooldown || 0) * 2; // turns to seconds
                unit.animState = 'attacking';
                unit.stateTimer = 0.4; // Animation lock
            }
            return;
        }
        
        // Try to use best available ability (highest index that's off cooldown and not passive)
        // Priority: higher-index abilities first (they're usually stronger)
        for (let i = abilities.length - 1; i >= 0; i--) {
            const ability = abilities[i];
            if (!ability || ability.passive) continue;
            if ((unit.abilityCooldowns[i] || 0) > 0) continue;
            
            const spell = spellManager.getSpell(ability.id);
            if (!spell) continue;
            
            // Determine target
            let target;
            if (spell.target === 'enemy') target = unit.currentTarget;
            else if (spell.target === 'all_enemies' || spell.target === 'all') target = 'all';
            else if (spell.target === 'ally') target = this.selectAllyTarget(unit, spell);
            else if (spell.target === 'all_allies') target = 'all';
            else if (spell.target === 'self') target = unit;
            else target = unit.currentTarget;
            
            if (!target) continue;
            
            battle.executeAbility(unit, i, target);
            unit.globalCooldown = 1 / unit.attackSpeed;
            unit.abilityCooldowns[i] = (ability.cooldown || 0) * 2;
            unit.animState = 'attacking';
            unit.stateTimer = 0.4;
            return;
        }
    }
}
```

### 5. Battlefield Layout & Positioning

The battlefield is the existing `#battleScene` area (1920x1080 in game coordinates). Units are placed using absolute positioning within the battlefield.

#### Starting Positions

Party (left side), Enemies (right side). Spread vertically.

```
Party spawns:                    Enemy spawns:
X range: 150 - 350              X range: 1570 - 1770
Y range: 350 - 850              Y range: 350 - 850
(spread evenly based on count)  (spread evenly based on count)
```

Heroes face right (`facing = 1`), enemies face left (`facing = -1`).

#### Unit DOM Structure

Each unit is an absolutely-positioned div inside the battlefield:

```html
<div class="rt-unit" data-unit-id="party-0" style="left: 200px; top: 500px;">
    <div class="rt-unit-inner">
        <div class="rt-name ally-name">Knight Lv.50</div>
        <div class="rt-bars">
            <div class="rt-hp-bg"><div class="rt-hp-fill ally" style="width:100%"></div></div>
            <div class="rt-mana-bg"><div class="rt-mana-fill" style="width:0%"></div></div>
        </div>
        <div class="rt-buffs"></div>
        <div class="rt-sprite-container">
            <div class="rt-sprite">
                <img src="https://puzzle-drops.github.io/TEVE/img/sprites/heroes/knight_male_battle.png"
                     style="image-rendering: pixelated; transform: scaleX(1);">
            </div>
            <div class="rt-shadow"></div>
        </div>
    </div>
</div>
```

#### Sprite Flipping

- Heroes (party) face right by default. `scaleX(1)`.
- Enemies face left by default. `scaleX(-1)`.
- When a unit's `facing` changes during combat (chasing a target behind them), flip the sprite: `transform: scaleX(unit.facing)`.
- The existing sprites at `heroes/{className}_battle.png` and `enemies/{enemyId}.png` are already used. Keep the same image sources and `image-rendering: pixelated`.

#### Depth Sorting

Units further down the screen (higher Y) should render on top. Set `z-index` equal to `Math.floor(unit.y)` each frame during `renderUnits()`.

### 6. Visual Animations

#### Unit States and CSS

```css
/* Idle bob */
.rt-unit.idle .rt-sprite img {
    animation: rtIdleBob 1.8s ease-in-out infinite;
}
@keyframes rtIdleBob {
    0%, 100% { transform: scaleX(var(--face)) translateY(0); }
    25% { transform: scaleX(var(--face)) translateY(-3px) scaleY(0.96); }
    50% { transform: scaleX(var(--face)) translateY(0) scaleY(1.04); }
    75% { transform: scaleX(var(--face)) translateY(-2px); }
}

/* Walk cycle */
.rt-unit.walking .rt-sprite img {
    animation: rtWalk 0.35s ease-in-out infinite;
}
@keyframes rtWalk {
    0%, 100% { transform: scaleX(var(--face)) translateY(0); }
    25% { transform: scaleX(var(--face)) translateY(-5px) rotate(-3deg); }
    50% { transform: scaleX(var(--face)) translateY(0); }
    75% { transform: scaleX(var(--face)) translateY(-4px) rotate(3deg); }
}

/* Attack lunge */
.rt-unit.attacking .rt-sprite img {
    animation: rtAttack 0.4s ease-out;
}
@keyframes rtAttack {
    0% { transform: scaleX(var(--face)) translateX(0); }
    30% { transform: scaleX(var(--face)) translateX(calc(18px * var(--face))) scaleY(1.1) rotate(calc(-6deg * var(--face))); }
    60% { transform: scaleX(var(--face)) translateX(calc(-5px * var(--face))); }
    100% { transform: scaleX(var(--face)) translateX(0); }
}

/* Hit flash */
.rt-unit.hit .rt-unit-inner {
    animation: rtHitFlash 0.25s;
}
@keyframes rtHitFlash {
    0%, 100% { filter: brightness(1); }
    40% { filter: brightness(3) saturate(0); }
}

/* Death crumple */
.rt-unit.dying {
    transition: all 0.5s ease-in;
    opacity: 0;
    transform: scale(0.2) rotate(25deg) translateY(20px);
}
```

Set `--face` CSS variable on each unit element: `el.style.setProperty('--face', unit.facing)`.

#### Spell Name Text

Keep the existing `showSpellAnimation()` from `battleAnimations.js`. It creates a floating spell name text above the casting unit. In the new system, this text is appended to the unit's `.rt-unit` element instead of the fixed slot element. Update the method to use `unit.el` (the DOM element reference) instead of `document.getElementById(...)`.

#### Damage Numbers

Same as current `showDamageAnimation()` but position the damage number at the unit's current screen position. Append to the battlefield container with absolute position at `unit.x, unit.y - offset`.

#### Projectiles

For ranged attacks, create a projectile element (a small sprite or particle) that travels from attacker to target over ~0.3 seconds. On arrival, apply damage. Use the existing spell icon or a generic projectile image.

```javascript
spawnProjectile(source, target, callback) {
    const el = document.createElement('div');
    el.className = 'rt-projectile';
    el.innerHTML = '<img src="..." style="width:20px;height:20px">';
    this.battlefieldEl.appendChild(el);
    
    this.projectiles.push({
        el, x: source.x, y: source.y - 30,
        targetUnit: target, speed: 400,
        onHit: callback
    });
}
```

#### Buff/Debuff Icons

Keep the buff/debuff icon strip on each unit's status bar (`.rt-buffs`). Same icons as current system. Update each frame like the existing `updateUI()` does.

### 7. UI Changes

#### Battle Screen HTML

Replace the fixed party1-5 / enemy1-5 slot layout with a single battlefield container:

```html
<div id="battleScene" style="display:none;">
    <div class="battleField" id="realtimeBattlefield">
        <!-- Units are dynamically added here as absolutely-positioned elements -->
        <!-- Projectiles, damage numbers, and effects also go here -->
    </div>
    
    <!-- Keep existing UI overlays -->
    <div id="battleLog"></div>
    <div id="abilityPanel"></div>
    <div id="waveCounter"></div>
    <!-- ... other HUD elements stay the same -->
</div>
```

The `showBattleScreen()` method in `uiManager.js` needs to be updated to set up this layout instead of the fixed-slot layout. The existing battle background (whatever CSS/image is on `.battleField`) stays the same.

#### Speed Controls

Keep the existing game speed button. Map to `battle.gameSpeed` multiplier (1x, 2x, 3x, 4x). The delta time in the game loop is multiplied by this.

#### Battle Log

Keep exactly as-is. The `log()` method appends to `#battleLog` the same way.

#### Ability Panel (Manual Mode)

When the player wants to manually control (auto toggle off), clicking a party unit pauses the game and shows the ability panel for that unit (same icons, same tooltips). Player picks ability + clicks target unit on the field. Then game resumes.

### 8. Integration Points

#### `game.js` — `startBattle()`

Find where `new Battle(...)` is instantiated. Replace with `new BattleRealtime(...)`:

```javascript
// OLD:
this.currentBattle = new Battle(this, party, enemyWaves, mode);

// NEW:
this.currentBattle = new BattleRealtime(this, party, enemyWaves, mode);
```

#### `loadingManager.js` — Script Load Order

Add the new files to the load sequence. They should load after `battleAI.js` and before or alongside `battle.js`:

```javascript
// In the script loading array, add:
'battleRealtime.js',
'realtimeAI.js',
```

Keep the old `battle.js` and `battleAI.js` in the codebase (don't delete them) but they won't be instantiated anymore since `game.js` now creates `BattleRealtime`.

#### `spellLogic.js` — No Changes Needed

All spell logic functions call `battle.dealDamage(...)`, `battle.applyBuff(...)`, etc. Since `BattleRealtime` provides the exact same interface, spells work without modification. The `battle` variable in spell functions references whatever battle object is active.

**One thing to verify:** Some spells reference `battle.currentUnit` (the unit currently taking its turn). In real-time, `currentUnit` should be set to the casting unit before `executeAbility()` is called, and cleared after. This matches how the existing code works.

### 9. `executeAbility()` Method

Port this method from `battle.js` almost verbatim. It calls `spellLogic[spell.logicKey](this, caster, target, spell, spellLevel)`. Before calling, set `this.currentUnit = caster`. After the spell executes, clear it.

Port all the post-ability triggers (Grand Templar stun chance, Fire Dance AOE, Whirling Step double attack, Alpha's Call, Blade Mastery, etc.) exactly as they are.

### 10. Handling `endTurn()` Logic

In the turn-based system, `endTurn()` processes a lot of per-turn effects (shield regen, HP regen, DOTs, buff tick-down, passive triggers, cooldown reduction). In real-time, these are split:

| Old Location | New Location |
|---|---|
| `endTurn()` → buff/debuff duration tick | `tickBuffsDebuffs(dt)` in game loop |
| `endTurn()` → `reduceCooldowns()` | Ability cooldowns tick down in `updateUnit()` |
| `endTurn()` → `applyDotEffects()` | `tickDOTs(dt)` in game loop |
| `endTurn()` → HP regen | `tickDOTs(dt)` (regen section) |
| `endTurn()` → shield regen passives | 2-second passive timer per unit |
| `endTurn()` → Lord's Presence, Tribal Leader, etc. | 2-second passive timer per unit |
| `endTurn()` → Hydra's Command | 2-second passive timer: trigger random ally basic attack |

### 11. Arena Mode

The arena (`arena.js`) also uses the `Battle` class. Update it to use `BattleRealtime` as well, or keep it turn-based if preferred. The arena creates opponent teams from `arena.json` and feeds them through the same battle flow, so if `game.js` creates `BattleRealtime`, arena battles will also be real-time automatically.

### 12. Testing Checklist

After implementation, verify:

- [ ] Units spawn on correct sides, face correct directions
- [ ] Units path toward enemies and stop at attack range
- [ ] Melee units get close, ranged units stop at range
- [ ] Attacks deal correct damage (compare with old system on same matchup)
- [ ] Buffs/debuffs apply correctly and expire after correct time
- [ ] Bleed DOT ticks properly
- [ ] Healing works, Blight prevents healing
- [ ] Stun freezes the unit for the duration
- [ ] Silence forces basic attack
- [ ] Taunt forces attacking specific target
- [ ] Mark prevents buff application
- [ ] Shields absorb damage before HP
- [ ] Death animation plays, unit is removed
- [ ] Wave transitions work (enemies cleared → next wave spawns)
- [ ] Victory/defeat triggers correctly, shows results screen
- [ ] Battle results (exp, items, gold) are calculated and applied correctly
- [ ] Auto-replay works
- [ ] Speed controls (1x-4x) work
- [ ] Battle timer counts correctly
- [ ] Manual mode pause + ability selection works
- [ ] Battle log shows all events
- [ ] Spell name text floats above caster
- [ ] Damage numbers appear and float up
- [ ] All existing passives trigger correctly (check a few: Burning Fury, Eternal Tide, Shield Regen)
- [ ] Existing spell logic functions work without modification
- [ ] Arena mode works

### 13. Implementation Order

1. **`battleUnit.js` modifications** — Add position/speed/range/state properties
2. **`battleRealtime.js`** — Core game loop, unit spawning, positioning, rendering, damage pipeline (port from `battle.js`)
3. **`realtimeAI.js`** — Target selection, movement, ability usage
4. **`battleAnimations.js` updates** — Adapt to use unit DOM elements instead of fixed slots
5. **`styles.css` additions** — Real-time unit CSS, animations, projectiles
6. **`uiManager.js` updates** — Battle screen layout changes
7. **`index.html` updates** — Battle scene HTML structure
8. **`game.js` integration** — Swap `Battle` → `BattleRealtime`
9. **`loadingManager.js`** — Add new scripts to load order
10. **Testing & tuning** — Balance move speeds, attack ranges, cooldown timings

---

## Summary of What Stays the Same

- All hero/enemy/spell/item/dungeon JSON data
- All spell logic functions in `spellLogic.js`
- Hero management, gear, promotion, leveling
- Dungeon selection, party select, world map
- Stash system, autosell
- Save/load system
- Tutorial system
- Dev console
- Collection system
- All UI screens except battle
- Battle results screen (victory/defeat popup, exp/item display)

## Summary of What Changes

- Battle is now real-time with continuous movement
- Units have free 2D positions instead of fixed slots
- Sprites flip horizontally based on facing direction
- Attack/walk/idle animations play continuously
- Cooldowns and durations are time-based (seconds) not turn-based
- AI runs per-tick instead of per-turn
- Damage numbers and spell text appear at unit world positions
- Speed multiplier controls the simulation rate

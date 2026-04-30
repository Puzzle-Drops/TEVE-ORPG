# Turn-Based → Real-Time Conversion Spec

This is the precise rule book for translating turn-based mechanics into real-time. Anyone porting a class, spell, or system should consult this doc.

## Time base

- 1 turn = 1 second baseline
- Action bar 0→10000 = 2 seconds (per user spec)
- Therefore base action-bar fill = 5000 per second
- Old `actionBarSpeed` units stay the same numbers; the unit reinterpretation is automatic when we plug them into the formulas below

## Cooldowns (abilities)

```
effectiveCooldownSeconds = baseCooldownTurns * 200 / actionBarSpeed
```

- `baseCooldownTurns` = `spell.cooldown[spellLevel - 1]` from `spells.json`
- `actionBarSpeed` = the unit's current `actionBarSpeed` getter (from hero.js / battleUnit.js)
- A unit with `actionBarSpeed = 200` (zero-AGI baseline) gets cooldown unchanged
- A unit with `actionBarSpeed = 400` (max-AGI cap from formula) gets cooldown halved → "speed = CDR" as user requested
- Hard cap: minimum cooldown = 0.5s for any ability with baseCooldownTurns > 0 (prevents divide-by-zero / 100% CDR oversights)

## Basic attack interval

```
basicAttackIntervalSeconds = 2.0 * 200 / actionBarSpeed
```

- A unit at 200 actionBarSpeed attacks every 2.0s
- A unit at 400 actionBarSpeed attacks every 1.0s
- Hard min 0.4s

## Buff/debuff durations

- All `duration` numbers in `spells.json` and in calls to `applyBuff(target, name, dur, fx)` are now seconds, not turns
- `duration = -1` is still permanent
- Tick interval: 1 second (DoT damage like Bleed deals its tick once per second; durations decrement once per second)
- Why 1 Hz tick instead of every frame: matches the original turn-based intent (Bleed "5% maxHP per turn" stays "5% per second"), and avoids fractional damage rounding errors

## Movement

- Base move speed: 6.0 units/sec
- Each class has a `moveSpeed` field in the ARPG class registry (default 6.0); ranged classes a touch faster
- AGI does NOT affect movement (it already affects basic-attack interval and CDR via `actionBarSpeed`); keeping move speed flat avoids stacking feel-issues
- "Reduce Speed" debuff: -33% move speed (in addition to its effect on cooldowns)
- "Increase Speed" buff: +33% move speed (in addition to its effect on cooldowns)

## Damage formulas (unchanged)

All from existing `battle.dealDamage`:
- Physical DR: `0.9 * armor / (armor + 500)`
- Magic DR: `0.3 * resist / (resist + 1000)`
- Increase Defense: -25% damage
- Reduce Defense: +25% damage
- Mark: +25% damage and disables dodge
- Frost Armor: -25% damage and slows attackers
- Increase Attack: +50% damage
- Reduce Attack: -50% damage
- Crit: 200% damage (existing rules)
- Shield: absorbs incoming damage before HP

These all port directly because they don't involve time.

## Spell targeting in real-time

Old `spell.target`:
- `'enemy'`: client picks an enemy under cursor; if none, snap to nearest enemy in 12-unit cone in front
- `'ally'`: client picks an ally under cursor; if none, target self by default
- `'self'`: target = caster, no input needed
- `'all_enemies'`: AoE, ground reticle at cursor position, radius defined per spell (default 5 units)
- `'all_allies'`: AoE friendly, radius default 8 units
- `'all'`: hits everyone in radius (rare; resolved by spell logic)

AoE radius derivation (since `spells.json` doesn't define one):
- If spell has `effects.includes('aoe')`: default 5 units
- Specific overrides in `arpg/combat/abilities.js`'s `AOE_RADIUS_OVERRIDES` map (e.g., Rain of Arrows = 10, Mass Heal = 12)

## Cast time

- Spells are instant by default (no cast time)
- Add `castTime` in seconds in `arpg/combat/abilities.js`'s `CAST_TIME_OVERRIDES` map for spells that should have a wind-up
- During cast: caster cannot move, cast is interrupted if caster is stunned
- Telegraph (AoE ring) appears during cast time

## Channel time

- Not used in v1 (no spells need it from the original game)
- Reserved field in ability descriptor for future use

## Action bar replacement summary

The ARPG **does not have** an action bar. The "ready to act" check is replaced by:
- For player abilities: cooldown elapsed AND not stunned/silenced AND not casting another spell
- For enemy AI: cooldown elapsed AND not stunned/silenced; AI re-evaluates targets every 0.5s

## Speed stat (final word)

The `actionBarSpeed` getter from hero.js stays untouched. Its number now means three things in real-time:
1. Inverse cooldown multiplier (CDR): `1 - 200/actionBarSpeed`
2. Inverse basic-attack interval: `intervalSec = 2 * 200 / actionBarSpeed`
3. Buff/debuff `Increase Speed` / `Reduce Speed` apply ±33% to **both** of the above (matches old behavior)

Movement speed is intentionally separate (see Movement section).

## Heal/buff timing

- Heals are instantaneous on cast resolution
- Buffs apply on cast resolution; their duration starts ticking immediately
- The `buff_immune` etc. effect overrides remain identical (existing `applyBuff` does this)
- Prophet Male overheal spillover continues to work (it's in `battle.healUnit` which we port)

## Death

- HP reaches 0 → entity flagged dead
- Death animation plays (capsule falls over, fades to 50% opacity)
- For players: 5-second respawn timer, respawn at nearest town fountain
- For enemies: 2-second despawn fade, then removed from scene
- For overworld mob respawns: a slain mob respawns at its spawn point after 60s if no player is within 30 units

## Action selection (passives)

- The 4th ability (passive, only present on awakened classes) is **never** bound to QWER
- It is applied automatically on entity tick if its trigger condition fires
- Existing passive logic in `spellLogic.js` is mostly **on-event** (e.g., `divineRetributionChance` on heal, `executioner` on damage). These already integrate via the dealDamage/applyBuff hooks — no change needed
- A small subset of passives are **stat-modifier passives** (e.g., +15% damage permanent). For these the ARPG applies them as a permanent self-buff on entity spawn

## Friendly fire and ally detection

- `combat.getEnemies(unit)` returns hostile entities
- `combat.getParty(unit)` returns friendly entities (player + co-op players)
- AoE damage spells use `forEachAliveEnemy(within radius)` semantics
- AoE buff spells use `forEachAliveAlly(within radius)`
- Self-buff spells skip ally detection entirely

## What does NOT port

These existing behaviors are intentionally dropped or deferred for v1:
- `autoBattle` / `autoReplay` — N/A in real-time
- `Arena` — deferred (could come back as a separate PvP mode later)
- The 5-character party — solo only now
- The `Action Bar 5000+ extra turn` mechanic — replaced by raw cooldowns
- Whirling Step "double attack" / Fire Dance modifiers in `executeAbility` — these need re-implementation in `arpg/combat/abilities.js` as ability-specific hooks (TODO list)

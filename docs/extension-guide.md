# TEVE Extension Guide

How to add new content to TEVE. Follow these patterns to stay consistent with the existing codebase.

---

## Adding a New Dungeon

### Files to modify:
1. `dungeons.json` — wave configurations
2. `enemies.json` — new enemy templates
3. `spells.json` — new enemy abilities
4. `spellLogic.js` — spell implementations

### Step 1: Design (before code)
- Decide: tier, level, theme, boss name, 5 waves
- Waves 1-2: 3 enemies each
- Wave 3: 5 enemies + 1 boss (dungeon level, boss gets +1 tier stats)
- Wave 4: 5 enemies
- Wave 5: 5 enemies + final boss (dungeon level, +1-2 tier)
- Non-boss units scale between `dungeonLevel - 20` and `dungeonLevel`
- 1-2 passives per dungeon max
- Each enemy: 2-3 spells. Bosses: 3 spells + 1 passive.
- First spell: cooldown 0, deals damage, never passive

### Step 2: Create enemies in `enemies.json`
```json
"your_enemy_id": {
    "id": "your_enemy_id",
    "name": "Enemy Name",
    "isBoss": false,
    "initial": {
        "hp": 120, "hpRegen": 2, "attack": 6, "attackSpeed": 100,
        "str": 5, "agi": 5, "int": 6, "armor": 6, "resist": 8
    },
    "modifiers": {
        "str": 1.5, "agi": 1.25, "int": 2.0,
        "modHP": 3.0, "modAttack": 0.14, "modArmor": 0.06, "modResist": 0.03
    },
    "abilities": ["enemy_spell_1", "enemy_spell_2"],
    "image": "img/enemies/your_enemy.png"
}
```

**Stat Rules** (follow strictly):

Initial stats point pool by tier:
| Tier | Points | Min/Stat |
|------|--------|----------|
| 0 | 12 | 3 |
| 1 | 16 | 4 |
| 2 | 24 | 5 |
| 3 | 36 | 6 |
| 4 | 48 | 8 |
| 5+ | 48 + tier×2 | tier+3 |

- **Attribute pool** (STR/AGI/INT): 1 point = 1 stat
- **Non-attribute pool** (separate, same point budget): 1pt = 10 HP | 0.67 Regen | 1 Attack | 0.67 Speed | 1.33 Armor | 2 Resist. Max 50% in any one stat.

Modifier attribute totals by tier:
| Tier | Total | Min/Stat |
|------|-------|----------|
| 0 | 3.0 | 1.0 |
| 1 | 4.0 | 1.25 |
| 2 | 6.0 | 1.5 |
| 3 | 9.0 | 2.0 |
| 4 | 12.0 | 2.5 |
| 5+ | 12.0 + tier/2 | tier/2 |

Modifier non-attribute baselines (all get):
- modHP: 2.5, modAttack: 0.1, modArmor: 0.01, modResist: 0.005

Bonus points by tier: 20/24/28/32/36 (5+: 36 + tier/2):
- 1pt = 0.1 modHP | 0.02 modAttack | 0.05 modArmor | 0.025 modResist

Enemy tier = dungeon tier + 1 (bosses = dungeon tier + 2).

### Step 3: Create spells in `spells.json`
```json
"enemy_spell_1": {
    "id": "enemy_spell_1",
    "name": "Spell Name",
    "description": ["Lv1: Deals damage", "Lv2: Deals more damage", ...],
    "target": "enemy",
    "cooldown": [0, 0, 0, 0, 0],
    "passive": false,
    "damageType": "physical",
    "scaling": {
        "base": [40, 55, 70, 85, 100],
        "attack": [1.0, 1.0, 1.0, 1.0, 1.0],
        "str": [0.4, 0.5, 0.6, 0.7, 0.8]
    },
    "icon": "img/spells/enemy_spell_1.png"
}
```

**Rules**:
- Every damage spell needs: `base`, `attack` (typically 1.0), and one of `str`/`agi`/`int`
- `target` options: `"enemy"`, `"all_enemies"`, `"ally"`, `"all_allies"`, `"self"`
- `cooldown` array: per level, `0` = no cooldown (use for spell 1)
- `passive: true` for passive abilities (no cooldown needed)
- `description` array: 5 entries, one per spell level

### Step 4: Implement spell logic in `spellLogic.js`

**Simple damage spell** (use helpers):
```javascript
SpellLogic.enemy_spell_1 = function(battle, caster, target, spell, spellLevel) {
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: { attack: true, str: true },
        damageType: 'physical'
    });
};
```

**Damage + debuff**:
```javascript
SpellLogic.enemy_spell_2 = function(battle, caster, target, spell, spellLevel) {
    const levelIndex = spellLevel - 1;
    spellHelpers.basicDamageSpell(battle, caster, target, spell, spellLevel, {
        scalingTypes: { attack: true, int: true },
        damageType: 'magical',
        afterDamage: function(battle, caster, target, spell, levelIndex) {
            battle.applyDebuff(target, 'Reduce Speed', 2, caster);
        }
    });
};
```

**AoE spell**:
```javascript
SpellLogic.enemy_aoe_spell = function(battle, caster, target, spell, spellLevel) {
    spellHelpers.aoeDamageSpell(battle, caster, spell, spellLevel, {
        scalingTypes: { attack: true, int: true },
        damageType: 'magical',
        perEnemyEffect: function(battle, caster, enemy, spell, levelIndex) {
            battle.applyDebuff(enemy, 'Bleed', 2, caster);
        }
    });
};
```

**Heal spell**:
```javascript
SpellLogic.enemy_heal = function(battle, caster, target, spell, spellLevel) {
    const levelIndex = spellLevel - 1;
    const baseHeal = spellHelpers.getParam(spell, 'scaling.base', levelIndex, 0);
    const intScale = spellHelpers.getParam(spell, 'scaling.int', levelIndex, 0);
    const healAmount = baseHeal + (caster.stats.int * intScale);
    battle.healUnit(caster, target, healAmount);
};
```

**Passive spell**:
```javascript
SpellLogic.enemy_passive = function(battle, caster, target, spell, spellLevel) {
    // Passives are called during applyInitialPassives() at battle start
    // and may hook into battle events
    const levelIndex = spellLevel - 1;
    // Example: apply a permanent buff
    battle.applyBuff(caster, 'Increase Defense', 999, caster);
};
```

### Step 5: Add dungeon to `dungeons.json`
```json
"your_dungeon_id": {
    "tier": "TierName",
    "name": "Dungeon Name",
    "boss": "Final Boss Name",
    "subtitle": "Flavor text",
    "level": 200,
    "waves": [
        { "enemies": [
            {"id": "enemy_1", "level": 180},
            {"id": "enemy_2", "level": 185},
            {"id": "enemy_3", "level": 185}
        ]},
        { "enemies": [
            {"id": "enemy_3", "level": 185},
            {"id": "enemy_1", "level": 190},
            {"id": "enemy_2", "level": 190}
        ]},
        { "enemies": [
            {"id": "enemy_1", "level": 195},
            {"id": "enemy_2", "level": 195},
            {"id": "wave3_boss", "level": 200},
            {"id": "enemy_3", "level": 195},
            {"id": "enemy_1", "level": 195}
        ]},
        { "enemies": [
            {"id": "enemy_2", "level": 195},
            {"id": "enemy_3", "level": 195},
            {"id": "enemy_1", "level": 200},
            {"id": "enemy_2", "level": 200},
            {"id": "enemy_3", "level": 200}
        ]},
        { "enemies": [
            {"id": "enemy_1", "level": 200},
            {"id": "enemy_2", "level": 200},
            {"id": "final_boss", "level": 200},
            {"id": "enemy_3", "level": 200},
            {"id": "enemy_1", "level": 200}
        ]}
    ]
}
```

### Step 6: Add images
- Enemy sprites: `img/enemies/your_enemy.png`
- Spell icons: `img/spells/spell_name.png`
- Battle backdrop: `img/fields/dungeon_name.png`

---

## Adding a New Spell (for existing hero/enemy)

### Files to modify:
1. `spells.json` — spell data entry
2. `spellLogic.js` — spell implementation
3. `heroes.json` or `enemies.json` — add spell ID to abilities array

### Spell data pattern:
- ID convention: `classname_spellname` or `enemyname_spellname`
- Must have 5-element arrays for level scaling
- Damage spells: always include `base`, `attack`, and one stat scaling

### Spell logic pattern:
- Function name = spell ID
- Signature: `(battle, caster, target, spell, spellLevel)`
- Use `spellHelpers` for standard patterns
- Use `buffDebuffHelpers` for checking/manipulating buffs
- Access level index: `const levelIndex = spellLevel - 1;`

---

## Adding a New Hero Class

### Files to modify:
1. `heroes.json` — class definition
2. `spells.json` — class abilities
3. `spellLogic.js` — ability implementations

### In `heroes.json`:
```json
"newclass_male": {
    "name": "New Class",
    "tier": 3,
    "gender": "male",
    "family": "Swordsman",
    "promotesFrom": "knight_male",
    "promotesTo": ["finalclass_male"],
    "image": "img/heroes/newclass_male.png",
    "initial": { "hp": 180, "hpRegen": 4, "attack": 8, ... },
    "modifiers": { "str": 3.0, "agi": 2.5, ... },
    "abilities": ["swordsman_blade_strike", "swordsman_shield_bash", "newclass_unique_spell"]
}
```

**Key rules**:
- Name format: `classname_male` / `classname_female`
- `promotesFrom` must reference valid tier N-1 class
- `promotesTo` must reference valid tier N+1 class(es)
- Abilities: inherit previous tier's spells + add new ones at current tier
- Tier 3: gets 3rd ability. Tier 4: all at level 4. Awakened: +passive, all level 5.
- Stats must follow the point pool rules for the class tier

---

## Adding a New Item

### File to modify: `items.json`

```json
"new_item_id": {
    "id": "new_item_id",
    "name": "Item Name",
    "slot": "weapon",
    "level": 100,
    "roll1": "attack",
    "value1": 25,
    "roll2": "str",
    "value2": 15,
    "roll3": "agi",
    "value3": 10,
    "roll4": "hp",
    "value4": 50,
    "sellcost": 500
}
```

**Roll stat options**: str, agi, int, hp, armor, resist, hpRegen, attack, attackSpeed, allstats, cdr
**Slot options**: head, chest, legs, weapon, offhand, trinket

Items are tied to dungeons via the dungeon's available item list. Add the item ID to the dungeon's item pool.

---

## Adding a New Buff or Debuff Type

This is rare and requires deeper changes:

1. `battle.js` — add to buff/debuff application logic, tooltip descriptions, and processing
2. `battleAI.js` — add scoring for the new buff/debuff
3. `uiManager.js` — add icon rendering
4. `img/buffs/` — add icon image

Existing types cover most use cases. Prefer combining existing buffs/debuffs before creating new ones.

---

## Adding Arena Teams

### File to modify: `arena.json`

```json
"team_N": {
    "name": "Team Name",
    "requiredDungeon": "dungeon_id",
    "heroes": [
        {
            "className": "champion_male",
            "level": 300,
            "awakened": false,
            "gear": { ... }
        },
        ...up to 5 heroes
    ]
}
```

---

## Common Patterns Reference

### Accessing spell level:
```javascript
const levelIndex = spellLevel - 1;
const value = spellHelpers.getParam(spell, 'scaling.base', levelIndex, 0);
```

### Dealing damage:
```javascript
battle.dealDamage(caster, target, amount, 'physical'); // or 'magical' or 'pure'
```

### Applying buffs/debuffs:
```javascript
battle.applyBuff(target, 'Shield', duration, caster, { shieldAmount: 500 });
battle.applyDebuff(target, 'Stun', 1, caster);
```

### Checking conditions:
```javascript
if (buffDebuffHelpers.hasDebuff(target, 'Bleed')) { ... }
if (target.currentHp / target.maxHp < 0.3) { ... } // below 30% HP
```

### Healing:
```javascript
battle.healUnit(caster, target, healAmount);
```

### Action bar manipulation:
```javascript
target.actionBar += target.maxActionBar * 0.25; // +25% action bar
target.actionBar -= target.maxActionBar * 0.10; // -10% action bar
```

---

## Workflow for New Dungeons (from notes.txt)

The project has an established 3-prompt workflow:

1. **Prompt 1 (Design)**: Theory-craft dungeon themes, unit concepts, spell designs. No code. Analyze existing patterns and scaling. Get creative with themes and buff/debuff usage.

2. **Prompt 2 (Implementation)**: Write all JSON entries (dungeons.json, enemies.json, spells.json) and spellLogic.js functions. Follow stat rules strictly. Show exact placement with surrounding context.

3. **Prompt 3 (Verification)**: Walk through each spell step-by-step, verify it works in the battle system, ensure helpers are used where possible, check scaling consistency, offer balancing feedback.

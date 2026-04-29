# TEVE Systems Reference

## 1. Hero System (`hero.js`)

### Class: `Hero`

**Constructor**: `new Hero(className?)` — if no className, creates a random-gender villager.

**Key Properties**:
- `className` — e.g., `"champion_male"`, `"villager_female"`
- `gender` — `"male"` or `"female"`
- `name` — randomly generated from name lists
- `level` — 1-500
- `exp` / `expToNext` / `pendingExp`
- `gear` — `{head, chest, legs, weapon, offhand, trinket}` (null or Item)
- `gearStats` — aggregated stats from all equipped gear
- `initial` — base stats at level 1 (from JSON class data)
- `abilities` — array of spell IDs for this class
- `awakened` — boolean

**Key Methods**:
- `get classData()` — returns `unitData.classes[this.className]`
- `get classTier()` — class tier (0-4) from classData
- `get classFamily()` — e.g., `"Swordsman"` for champion
- `getClassAbilities()` — resolves spell IDs from class data
- `calculateExpToNext()` — exponential curve, Lv 450→500 = same exp as 1→450
- `gainExp(amount)` — handles leveling up
- `promote(targetClass)` — changes className, updates abilities
- `awaken()` — sets awakened=true, upgrades to tier 5 abilities
- Computed stats: `get hp()`, `get attack()`, `get armor()`, `get resist()`, `get str()`, `get agi()`, `get int()`, etc.

**Stat Computation Chain**:
```
classData.initial.str + (level × classData.modifiers.str) + gearStats.str = final STR
classData.initial.hp + (STR × classData.modifiers.modHP) + gearStats.hp = final HP
```

---

## 2. Enemy System (`enemy.js`)

### Class: `Enemy`

**Constructor**: `new Enemy(templateId, level, isBoss?)`

- Reads template from `unitData.enemies[templateId]`
- Scales stats by tier (derived from level)
- Boss flag adds Boss buff and extra stats
- Arena mode: can be created from hero class data with gear

**Key Properties**:
- `id`, `name`, `level`, `isBoss`
- `stats` — computed stats (hp, attack, armor, resist, str, agi, int, etc.)
- `abilities` — spell IDs from enemy template
- `gear` — only for arena hero-like enemies

---

## 3. Battle System (`battle.js`)

### Class: `Battle`

**Constructor**: `new Battle(game, party[], enemyWaves[], mode)`
- `mode`: `'dungeon'` or `'arena'`

**Key Properties**:
- `party` — `BattleUnit[]` (player heroes)
- `enemies` — `BattleUnit[]` (current wave)
- `allUnits` — combined party + enemies
- `currentWave` / `enemyWaves` — wave management
- `turn` — turn counter
- `currentUnit` — unit currently acting
- `waitingForPlayer` — true when manual mode awaits input
- `autoMode` — auto-play toggle
- `gameSpeed` — 1x/2x/3x speed
- `battleLog` — array of log entries
- `battleStats` — per-unit damage/healing/kills tracking

**Key Methods**:
- `tick()` — main loop: increment action bars, find next actor, execute turn
- `executeAbility(caster, target, spellId, spellLevel)` — resolve spell via spellLogic
- `dealDamage(caster, target, amount, type, options)` — full damage pipeline with DR
- `applyBuff(target, buffType, duration, caster, options)` — add buff with stacking
- `applyDebuff(target, debuffType, duration, caster, options)` — add debuff (blocked by Immune)
- `removeBuff(target, buffType)` / `removeDebuff(target, debuffType)`
- `processBuffTicks(unit)` — decrement durations, apply bleed, etc.
- `loadWave(waveIndex)` — load next enemy wave
- `checkWaveEnd()` — all enemies dead → next wave or battle end
- `endBattle(victory)` — handle rewards, exp, item drops

**Battle Access Patterns** (used by spellLogic):
- `battle.getParty(unit)` — returns allies of the unit
- `battle.getEnemies(unit)` — returns opponents of the unit
- `battle.dealDamage(caster, target, amount, 'physical'|'magical'|'pure')`
- `battle.applyBuff(target, 'Increase Attack', duration, caster)`
- `battle.applyDebuff(target, 'Stun', duration, caster)`

---

## 4. BattleUnit System (`battleUnit.js`)

### Class: `BattleUnit`

Wraps `Hero` or `Enemy` for combat. Provides uniform interface.

**Key Properties**:
- `source` — the underlying Hero or Enemy
- `isEnemy` — boolean
- `position` — 0-4 slot index
- `currentHp` / `maxHp`
- `actionBar` — 0 to 10,000+
- `actionSpeed` — per-tick gain
- `buffs` — array of `{type, duration, caster, ...}`
- `debuffs` — array of `{type, duration, caster, ...}`
- `isAlive` / `isDead`
- `stats` — computed stats (str, agi, int from source)
- `battle` — reference to parent Battle

---

## 5. Battle AI (`battleAI.js`)

### Class: `BattleAI`

**Method**: `decide(battle, unit)` → returns `{spellId, target, spellLevel}`

**Scoring Logic**:
1. Iterate all abilities not on cooldown and not passive
2. For each ability, iterate all valid targets
3. Score based on: damage potential, healing value, buff/debuff utility, target priority
4. If all scores negative → force skill 1 (basic attack) on random enemy
5. Taunt handling: if taunted, must use skill 1 on taunter

---

## 6. Spell System (`spellLogic.js` + `spells.json`)

### Data: `spells.json`
Each spell entry:
```json
{
  "id": "spell_id",
  "name": "Spell Name",
  "description": ["Lv1 desc", "Lv2 desc", ...],
  "target": "enemy" | "all_enemies" | "ally" | "all_allies" | "self",
  "cooldown": [0, 0, 0, 0, 0],
  "passive": false,
  "damageType": "physical" | "magical" | "pure",
  "scaling": {
    "base": [50, 75, 100, 125, 150],
    "attack": [1.0, 1.0, 1.0, 1.0, 1.0],
    "str": [0.5, 0.6, 0.7, 0.8, 0.9]
  },
  "icon": "img/spells/spell_icon.png"
}
```
- Arrays are indexed by spell level (level 1 = index 0)
- Scaling: `base` + `attack × caster.attack` + `stat × caster.stat`

### Logic: `spellLogic.js`
- `SpellLogic` object maps spell IDs to functions
- Each function signature: `(battle, caster, target, spell, spellLevel)`
- Uses `spellHelpers` for common patterns

### Key Helpers (`spellHelpers`):
- `getParam(spell, 'scaling.base', levelIndex, default)` — safe array access
- `calculateDamage(spell, levelIndex, caster, scalingTypes)` — compute raw damage
- `basicDamageSpell(battle, caster, target, spell, spellLevel, options)` — single-target damage template
- `aoeDamageSpell(battle, caster, spell, spellLevel, options)` — AoE damage template
- `getLowestHpAlly(battle, caster)` — find lowest HP ally
- `forEachAliveEnemy(battle, caster, callback)` — iterate live enemies
- `forEachAliveAlly(battle, caster, callback)` — iterate live allies

### Buff/Debuff Helpers (`buffDebuffHelpers`):
- `getBuffs(unit)` / `getDebuffs(unit)` — safe accessors
- `hasBuff(unit, type)` / `hasDebuff(unit, type)` — check presence
- `countBuffs(unit)` / `countDebuffs(unit)` — count stacks
- `removeBuff(unit, type)` / `removeDebuff(unit, type)`

### Buffs (6 types):
| Type | Effect |
|------|--------|
| Increase Attack | +50% attack damage |
| Increase Speed | +33% action bar progress |
| Increase Defense | +25% DR, -25% damage taken |
| Immune | Cannot gain debuffs |
| Shield | Absorbs X damage before HP |
| Frost Armor | +25% DR, attackers get Reduce Speed |

### Debuffs (9 types):
| Type | Effect |
|------|--------|
| Reduce Attack | -50% attack damage |
| Reduce Speed | -33% action bar progress |
| Reduce Defense | -25% DR, +25% damage taken |
| Blight | No regen, cannot be healed |
| Bleed | 5% max HP damage per turn |
| Stun | Skip next turn |
| Taunt | Must use skill 1 on taunter |
| Silence | Must use skill 1 on random enemy |
| Mark | +25% damage taken, no buffs, no evasion |

---

## 7. Item System (`item.js` + `items.json`)

### Class: `Item`

**Generation**:
1. Pick template from `itemData` matching dungeon's available items
2. Roll guaranteed stat 1: quality 1-5 (20-100% of base value)
3. Roll stats 2-4: 35% chance each to appear, quality 1-5 each
4. Calculate: total quality %, star count (each 5/5 roll = 1 star), rarity color

**Rarity Colors** (based on number of rolls):
- 1 roll: Green (common)
- 2 rolls: Blue (uncommon)
- 3 rolls: Purple (rare)
- 4 rolls: Red/Gold (epic/legendary)
- 4 stars (all perfect): red stars

**Refinement** (once per item):
- Cost: `(itemLevel + (itemLevel × quality%)) × 500`
- If < 4 rolls: adds a new roll at quality 1-5
- If 4 rolls: upgrades lowest quality roll to 5/5

**Gear Slots**: head, chest, legs, weapon, offhand, trinket

**Item Stats**: str, agi, int, hp, armor, resist, hpRegen, attack, attackSpeed, allstats, cdr

---

## 8. Dungeon System (`dungeons.json`)

### Structure:
```json
{
  "tiers": {
    "Easy": { "tier": 0, "itemRequirement": "none", ... },
    "Medium": { "tier": 1, ... },
    ...
  },
  "dungeons": {
    "satyrs_glade": {
      "tier": "Easy",
      "name": "Satyrs Glade",
      "boss": "Satyr Instigator",
      "level": 0,
      "waves": [
        { "enemies": [{"id": "satyr", "level": 0}, ...] },
        ...5 waves
      ]
    }
  }
}
```

### Wave Structure:
- Waves 1-2: 3 units each
- Wave 3: 5 units + boss (dungeon level, +1 tier)
- Wave 4: 5 units
- Wave 5: 5 units + final boss (dungeon level, +1-2 tier)

### 12 Tiers:
| Tier | Name | Level Range | Notes |
|------|------|------------|-------|
| 0 | Easy | 0-50 | 3 dungeons, unlocks stash + arena |
| 1 | Medium | 75-125 | 3 dungeons |
| 2 | Hard | 150-200 | 3 dungeons |
| 3 | Forsaken | 225-275 | 3 dungeons |
| 4 | Nightmare | 300-350 | 3 dungeons |
| 5 | Hell | 375-425 | 3 dungeons |
| 6 | Impossible | 450-500 | 3 dungeons |
| 7 | Mythical | 500 | 3 dungeons |
| 8 | Divine | 500 | 3 dungeons |
| 9 | Ascended | 500 | 3 dungeons |
| 10 | Transcendent | 1000 | All dungeons in a row |
| 11 | Twilight | — | Endgame |

### Progression Unlocks:
- Each unique dungeon completion: +1 max party size (starts at 3)
- Easy 1 complete: unlocks Stash
- Easy 2 complete: unlocks Arena
- Tier completion: unlocks next tier

---

## 9. Arena System (`arena.js` + `arena.json`)

### Class: `Arena`

- Spar mode: fight pre-made teams defined in `arena.json`
- Teams are composed of hero-class enemies with gear
- Gated by progression (must complete certain dungeons)
- Uses same Battle system in `'arena'` mode
- Tracks completions, best time, lowest deaths per team

---

## 10. Save System (`saveManager.js`)

### Class: `SaveManager`

**3 Save Slots** + default slot preference.

**Save Data Includes**:
- All heroes (class, level, exp, gear, name, awakened status)
- All stashes (gold + items per family)
- Progression (completed dungeons, unlocked features/tiers)
- Settings (sort order, auto-battle, auto-sell rules)
- Game version (for migration)

**Methods**:
- `saveToSlot(slot, silent?)` — serialize + encrypt + store
- `loadFromSlot(slot)` — read + validate + decrypt + migrate + restore
- `loadDefaultSlot()` — loads preferred slot on game start
- `deleteSave(slot)` — remove save data
- `exportSave(slot)` / `importSave(data)` — share saves

**Auto-save**: every 60 seconds to current slot.

---

## 11. UI System (`uiManager.js`)

### Class: `UIManager`

The largest file in the project. Handles all DOM rendering.

**Key State**:
- `selectedHero` — index of currently viewed hero
- `currentGearFilter` / `currentStashFilter` — slot filters
- `tooltipVisible` — item/ability tooltip state

**Major Screen Methods**:
- `showMainMenu()` → Heroes / Dungeons / Stash / Arena buttons
- `showHeroesScreen()` → portrait row + hero detail panel
- `showHeroOverview(hero)` → tabbed panel (Info, Skills, Promote, Gear, Log)
- `showDungeonMap()` → canvas-drawn world map with tier orbs
- `showPartySelect(dungeonId)` → hero grid for party formation
- `showBattleScreen()` → battle field with units, action bars, abilities
- `showStashScreen()` → class family grid → individual stash
- `showArenaScreen()` → opponent team selection

**Tooltip System**:
- `showItemTooltip(item, element)` — positioned near element
- `showAbilityTooltip(spell, level, element)` — spell details
- `hideItemTooltip()` / `hideAbilityTooltip()`

---

## 12. Tutorial System (`tutorial.js`)

### Class: `Tutorial`

- NPC dialogue system with Arnold character
- Step-by-step new game tutorial
- Q&A style interactions
- Triggered on first load if no save data

---

## 13. Auto-Sell System (`autosell.js`)

### Class: `AutoSell`

- Rule-based automatic item selling
- Configurable per slot, rarity, quality threshold
- Runs after each dungeon loot roll
- Settings persisted in save data

---

## 14. Scaling System (`scalingSystem.js`)

- Fixed 1920x1080 game resolution
- CSS transform scaling to fit browser window
- `viewportToGame(clientX, clientY)` — converts mouse/touch to game coords
- Updates on window resize

---

## 15. Dev Console (`devConsole.js`)

- Toggle with backtick key (`` ` ``)
- Commands for: setting levels, adding items, gold, completing dungeons, etc.
- **Disable on release** (noted in notes.txt)

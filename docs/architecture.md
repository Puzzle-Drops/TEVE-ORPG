# TEVE Architecture

## System Dependency Graph

```
                    index.html
                        │
                  loadingManager.js
                   │           │
            [JS Scripts]   [JSON Data]
                   │           │
                   ▼           ▼
    ┌─────────────────────────────────────┐
    │            game.js (Game)           │
    │  Central state, init, progression   │
    └──────┬──────┬──────┬──────┬────────┘
           │      │      │      │
     ┌─────┘  ┌───┘  ┌───┘  ┌──┘
     ▼        ▼      ▼      ▼
  battle.js  hero.js  uiManager.js  saveManager.js
     │          │         │              │
     ├── battleUnit.js    │              │
     ├── battleAI.js      │              │
     ├── battleAnimations.js             │
     │          │         │              │
     └──── spellLogic.js ─┘              │
                │                        │
           [JSON Data]              [localStorage]
```

## Data Flow

### Loading Phase
```
index.html
  └→ scalingSystem.js (inline, sets up viewport)
  └→ loadingManager.js (inline, orchestrates loading)
       └→ JS files loaded sequentially (order matters for class dependencies)
       └→ JSON files loaded sequentially:
            spells.json → spellManager (SpellManager instance)
            heroes.json → unitData.classes, unitData.classFamilies, unitData.promotionRequirements
            enemies.json → unitData.enemies
            dungeons.json → dungeonData (tiers + dungeon wave configs)
            items.json → itemData (gear templates)
            arena.json → arenaData (preset opponent teams)
       └→ index.html inline: `game = new Game()` then `saveManager.loadDefaultSlot()`
```

### Battle Phase
```
User clicks "Enter Dungeon" → game.startBattle()
  │
  ├→ Creates Enemy[] from dungeonData waves + enemies.json templates
  ├→ Creates Battle(game, party[], enemyWaves[])
  │     ├→ Wraps each Hero in BattleUnit (party)
  │     ├→ Wraps each Enemy in BattleUnit (enemies)
  │     ├→ Applies initial passives
  │     └→ Starts battle loop
  │
  ├→ Battle Loop (tick-based):
  │     ├→ All units gain action bar based on speed
  │     ├→ Unit reaches 10,000 → eligible to act
  │     ├→ If enemy: BattleAI.decide() → scores all abilities → picks best
  │     ├→ If player hero (manual): pause, show ability buttons, wait for input
  │     ├→ If player hero (auto): BattleAI.decide() same as enemy
  │     ├→ Execute ability:
  │     │     ├→ spellLogic[spellId](battle, caster, target, spell, spellLevel)
  │     │     ├→ battle.dealDamage() → calculates DR, applies damage
  │     │     ├→ battle.applyBuff/applyDebuff() → adds status effects
  │     │     └→ battleAnimations → visual feedback
  │     ├→ Subtract 10,000 from actor's action bar
  │     ├→ Process buffs/debuffs (tick durations, bleed damage, etc.)
  │     └→ Check win/loss conditions
  │
  ├→ Wave Transition (all enemies dead):
  │     ├→ Calculate exp for surviving heroes
  │     ├→ Load next wave of enemies
  │     ├→ Reset action bars to 0
  │     └→ Continue battle loop
  │
  └→ Battle End:
        ├→ Victory: roll items, award exp, mark dungeon complete
        ├→ Defeat: revive party, retry or drop down one dungeon
        └→ Auto-replay: restart same dungeon if enabled
```

### Item Flow
```
Dungeon Victory
  └→ Item.generate(dungeonLevel, dungeonId)
       ├→ Pick random template from itemData matching dungeon
       ├→ Roll 1 guaranteed stat (quality 1-5 → 20-100% of base value)
       ├→ Roll 3 optional stats (35% chance each, quality 1-5 each)
       ├→ Calculate overall quality %, star count, rarity color
       └→ Add to class family stash
            └→ Can be: equipped on hero, sold for gold, refined (once)
```

### Save Flow
```
saveManager.saveToSlot(slotNumber, silent)
  ├→ Serialize: game.heroes[], game.stashes{}, game.progression{}
  ├→ Encrypt data (simple encryption)
  ├→ Add checksum for validation
  └→ Store in localStorage key: `teve_save_${slot}`

saveManager.loadFromSlot(slotNumber)
  ├→ Read from localStorage
  ├→ Validate checksum
  ├→ Decrypt data
  ├→ Run data migration if version mismatch
  └→ Restore: heroes, stashes, progression, settings
```

## Battle Lifecycle Detail

### Action Bar System
- Each unit starts at 0
- Every tick: `unit.actionBar += unit.actionSpeed`
- `actionSpeed = initial + (100 + 100 × (AGI / (AGI + 1000)))`
- Buffs modify: Increase Speed = +33%, Reduce Speed = -33%
- When `actionBar >= 10,000`: unit can act
- After acting: `actionBar -= 10,000` (excess carries over)
- If still >= 10,000 and highest: acts again before next tick

### Damage Pipeline
```
spellLogic calculates raw damage
  → battle.dealDamage(caster, target, rawDamage, damageType, options)
       ├→ Apply caster damage modifiers (Increase Attack: +50%, Reduce Attack: -50%)
       ├→ Apply target damage reduction:
       │     ├→ Physical: DR = 0.9 × Armor / (Armor + 500)
       │     ├→ Magical: DR = 0.3 × Resist / (Resist + 1000)
       │     ├→ Pure: no DR
       │     ├→ Increase Defense: -25% damage taken
       │     ├→ Reduce Defense: +25% damage taken
       │     ├→ Frost Armor: -25% damage taken
       │     └→ Mark: +25% damage taken
       ├→ Apply to Shield first (if present)
       ├→ Remaining damage to HP
       ├→ Check death
       └→ Trigger on-hit effects (Frost Armor → slow attacker, passives, etc.)
```

### Buff/Debuff System
- Duration in turns (decremented when unit acts)
- Stacking: multiple instances of same type tracked separately
- Boss buff: 50% stun resistance, 25% damage reduction
- Key interactions:
  - Immune prevents all debuff application
  - Blight prevents healing
  - Mark prevents buff application and evasion
  - Silence/Taunt force skill 1 usage
  - Stun skips entire turn

## Screen Flow
```
Loading Screen → Splash Screen → Main Menu
                                    ├→ Heroes (overview, skills, promote, gear, log tabs)
                                    ├→ Dungeons → World Map → Tier Select → Dungeon Select → Party Select → Battle
                                    ├→ Stash (per class family)
                                    └→ Arena → Spar (opponent select → party select → battle)
```

## UI Architecture (uiManager.js)

UIManager is the largest file. It handles ALL DOM manipulation:
- `showMainMenu()` — main navigation
- `showHeroesScreen()` / `showHeroOverview()` — hero panel with tabs
- `showInfoTab()` / `showSkillsTab()` / `showPromoteTab()` / `showGearTab()` / `showLogTab()`
- `showDungeonMap()` / `showDungeonTierSelect()` / `showDungeonSelect()`
- `showPartySelect()` — pick heroes for battle
- `showBattleScreen()` — battle UI with action bars, abilities, log
- `showStashScreen()` / `showIndividualStash()` — item management
- `showArenaScreen()` — arena opponent selection
- Item tooltips, ability tooltips, buff/debuff icons
- Collection log UI

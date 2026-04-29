# TEVE - Twilight's Forever

Turn-based strategy RPG / idle game hybrid. Browser-based, vanilla JS, 1920x1080 fixed resolution.
Summoners War PvE-inspired. Party of up to 5 heroes vs waves of enemies. Progression-driven with item farming, class promotions, and dungeon grinding.

## Quick Reference

- **Entry point**: `index.html` → `loadingManager.js` (loads all scripts sequentially, then JSON data)
- **No build system** — raw browser JS with ES6 classes, no bundler
- **Hosting**: GitHub Pages (images at `puzzle-drops.github.io/TEVE`)
- **Save system**: LocalStorage with encryption, 3 slots, auto-save every 60s

## Global Variables

| Variable | Set By | Contains |
|----------|--------|----------|
| `game` | `index.html` inline script | `Game` singleton — central state |
| `unitData` | `loadingManager.js` | Hero classes, class families, promotion data, enemy templates |
| `spellManager` | `loadingManager.js` | `SpellManager` instance with all spell definitions |
| `itemData` | `loadingManager.js` | Item templates from `items.json` |
| `dungeonData` | `loadingManager.js` | Dungeon tiers + wave configs from `dungeons.json` |
| `arenaData` | `loadingManager.js` | Pre-made arena teams from `arena.json` |
| `saveManager` | `saveManager.js` | `SaveManager` singleton |
| `window.scalingSystem` | `scalingSystem.js` | Viewport scaling for 1920x1080 |
| `spellHelpers` | `spellLogic.js` | Shared spell calculation utilities |
| `buffDebuffHelpers` | `spellLogic.js` | Buff/debuff manipulation utilities |

## Script Load Order (Sequential)

1. `scalingSystem.js` (loaded in HTML head)
2. `loadingManager.js` (loaded in HTML head)
3. Then via `loadGameData()`:
   - `spellLogic.js` → `battleUnit.js` → `battleAI.js` → `battleAnimations.js` → `battle.js`
   - `devConsole.js` → `item.js` → `autosell.js` → `uiManager.js`
   - `hero.js` → `enemy.js` → `arena.js` → `tutorial.js` → `saveManager.js` → `game.js`
4. JSON data: spells → heroes → enemies → dungeons → items → arena

## File Roles

| File | Class/Role | Key Responsibilities |
|------|-----------|---------------------|
| `game.js` | `Game` | Central state, init, progression, stashes, dungeon management |
| `battle.js` | `Battle` | Combat loop, action bar, turn order, damage dealing, wave transitions |
| `battleUnit.js` | `BattleUnit` | Combat wrapper around Hero/Enemy, tracks HP/buffs/debuffs/action bar |
| `battleAI.js` | `BattleAI` | Scoring-based AI decision making for auto-play and enemies |
| `battleAnimations.js` | `BattleAnimations` | Visual effects (damage numbers, death, buffs) |
| `hero.js` | `Hero` | Player character — stats, leveling, promotion, gear, exp |
| `enemy.js` | `Enemy` | Enemy creation from templates, stat scaling by tier |
| `item.js` | `Item` | Gear generation with random rolls, refinement, quality calc |
| `spellLogic.js` | `SpellLogic` + helpers | All ability implementations, spell helpers, buff/debuff helpers |
| `arena.js` | `Arena` | PvP-style spar mode with pre-made hero teams |
| `autosell.js` | `AutoSell` | Automatic item selling rules |
| `devConsole.js` | `DevConsole` | Debug commands (disable `` ` `` on release) |
| `saveManager.js` | `SaveManager` | Encrypted localStorage saves, migration, 3 slots |
| `loadingManager.js` | `LoadingManager` | Asset loading, progress bar, script/JSON loading |
| `uiManager.js` | `UIManager` | All DOM rendering — hero panels, battle UI, stash, dungeons, tooltips |
| `scalingSystem.js` | `ScalingSystem` | Fixed 1920x1080 viewport scaling |
| `tutorial.js` | `Tutorial` | New game tutorial + NPC dialogue |

## Key Architecture Patterns

- **Data-Driven**: Content defined in JSON, logic in JS. Adding content = JSON entry + spellLogic function.
- **BattleUnit Wrapping**: `BattleUnit` wraps either `Hero` or `Enemy` as `.source` for uniform combat interface.
- **Spell System**: `spells.json` defines spell data/scaling → `spellLogic.js` has a function per spell ID → `battle.js` calls spellLogic during combat.
- **Shared Stashes**: Items stored per class family (e.g., all Swordsman-tree classes share one stash).
- **Action Bar**: 0→10,000 units. Speed determines gain per cycle. Highest bar acts first.

## Stat System Summary

- 4 separate point pools: initial attributes, initial non-attributes, modifier attributes, modifier non-attributes
- Tiers 0-4 have fixed point budgets with minimums per stat
- Final formulas: `STR = initial + (level × modifier)`, `HP = initial + (STR × modHP)`, etc.
- DR formulas: `Physical DR = 0.9 × Armor / (Armor + 500)`, `Magic DR = 0.3 × Resist / (Resist + 1000)`

## Class Promotion System

- Tier 0: Villager (2 abilities) → promote at Lv 50
- Tier 1: Base class, 2 new abilities → promote at Lv 100
- Tier 2: Same abilities at Lv 2 → promote at Lv 200
- Tier 3: Branch split, +1 ability at Lv 3 → promote at Lv 300
- Tier 4: All abilities at Lv 4 → awaken at Lv 400
- Awakened: +passive (4th ability), all abilities Lv 5

## 8 Class Families

Acolyte (healer), Archer (ranged DPS), Druid (hybrid tank/support), Initiate (magic DPS), Swordsman (physical tank), Templar (hybrid DPS/support), Thief (assassin), Witch Hunter (anti-magic)

## Conventions

- Hero class names use format: `classname_male` / `classname_female` (e.g., `champion_male`)
- Enemy IDs in `enemies.json` are snake_case (e.g., `satyr_instigator`)
- Spell IDs match pattern: `classname_spellname` or `enemyname_spellname`
- Spell level 1-5, accessed via `levelIndex = spellLevel - 1` into scaling arrays
- First spell always has cooldown 0, is never passive, usually deals damage
- Passives are rare (1-2 per dungeon for enemies, 1 per awakened hero)
- Buffs/debuffs: 6 buff types, 9 debuff types — all pre-existing, no new types needed typically
- Use `spellHelpers.basicDamageSpell()` and `spellHelpers.aoeDamageSpell()` where possible
- Every damage spell needs: base scaling, 1.0 attack ratio, and a stat ratio (str/agi/int)

## Detailed Documentation

See `docs/` folder:
- `docs/architecture.md` — System dependency graph, data flow, battle lifecycle
- `docs/systems.md` — Per-system deep reference
- `docs/extension-guide.md` — How to add new content (dungeons, enemies, spells, heroes, items)

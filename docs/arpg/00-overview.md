# TEVE-ORPG: Open World Conversion Overview

## What changed

Original TEVE was a turn-based party-vs-waves combat game. The conversion target is a Diablo/PoE-style open-world ARPG: you control **one** hero (instead of a party of 3-5), in a real-time 3D environment, with click-to-move + QWER abilities + basic attack.

Everything below the gameplay layer stays:
- The 8 class families and their full promotion trees (~80+ classes)
- All spells (~100+) — same effects, same scaling, same buff/debuff types
- All items, all enemies, all dungeons (`items.json`, `enemies.json`, `dungeons.json` reused as-is)
- Stat formulas, item generation, refinement, autosell rules

## What stayed the same

| System | Status |
|---|---|
| Class data (`heroes.json`) | Reused unchanged |
| Spell data (`spells.json`) | Reused unchanged |
| Spell logic (`spellLogic.js`) | Reused unchanged via real-time adapters |
| Item templates (`items.json`) | Reused unchanged |
| Item generation/refinement (`item.js`) | Reused unchanged |
| Enemy templates (`enemies.json`) | Reused unchanged |
| Enemy stat scaling (`enemy.js`) | Reused unchanged |
| Dungeon data (`dungeons.json`) | Reused — waves become rooms |
| Hero stat formulas (`hero.js` baseStats getter) | Reused unchanged |
| Class promotion mechanics | Reused — UI changes only |
| Buff/debuff types (6 buffs, 9 debuffs) | Reused identically |
| Save format (per-character) | Mostly reused — adds `position`, `currentZone` |

## What changed

| Old | New |
|---|---|
| Turn-based action bar (0→10000) | Real-time cooldown timers |
| Party of up to 5 heroes | Solo hero + co-op friends in lobby |
| Wave-based combat in instanced battles | Open world + linear instanced dungeons |
| Auto-AI controls everyone | Player controls hero directly; mob AI is real-time |
| Action bar speed = turn frequency | Speed stat = cooldown reduction |
| Click an enemy / autobattle | Right-click to move + attack, A+click attack-move, QWER for abilities |
| 2D HTML UI for battle | 3D Three.js scene + DOM HUD overlay |
| 3 save slots, single character at a time | 10 character slots; can swap mid-game (kills current) |
| Single player only | Co-op lobbies up to 6 players |

## Player loop

1. Pick villager_male or villager_female on new save
2. Spawn in a town (3 scattered towns in the overworld)
3. Walk into the overworld; mob level scales with distance from nearest town
4. Kill overworld mobs for **gold + XP only** (no items)
5. Find a dungeon entrance; enter (instanced)
6. Push through linear corridor (rooms = old waves), kill bosses scattered along the path
7. Reach loot room — one item is rolled and dropped on the ground
8. Pick it up (or skip), exit dungeon back to overworld
9. Hit promotion level → return to town → choose promotion class
10. Repeat across all 12 dungeon tiers, awakening at the end

## Multiplayer model

- Lobbies up to 6 players
- Host carries authoritative dungeon state
- Friendly fire OFF; ally buffs/heals affect all party members
- Joining: load any of your 10 characters; swapping mid-game kills your active character (anti-cheese)
- Death respawns you in nearest town with no penalty (this build)

## Document index

| Doc | Purpose |
|---|---|
| `00-overview.md` | (This file) Top-level summary |
| `01-game-design.md` | Player-facing design: controls, world, dungeons, progression |
| `02-architecture.md` | Code layout, module map, runtime dependencies |
| `03-networking.md` | Multiplayer protocol, authority model, lobby flow |
| `04-conversion-spec.md` | Exact turn → real-time mappings, formulas, adapter rules |
| `05-content-port-plan.md` | Which classes/spells/dungeons ship in v1, follow-up work |
| `06-roadmap.md` | Phased delivery plan and known gaps |

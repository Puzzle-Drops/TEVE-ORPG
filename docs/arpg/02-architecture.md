# Architecture

## Top-level layout

```
TEVE-ORPG/
├── arpg.html                  ← NEW entry point for the ARPG build
├── arpg/                      ← All new ARPG code
│   ├── main.js                ← Bootstrap: loads data, builds engine, starts game loop
│   ├── data.js                ← Loads JSON data + exposes ArpgData global
│   ├── engine/
│   │   ├── scene.js           ← Three.js scene, lights, terrain
│   │   ├── camera.js          ← Top-down camera follow + zoom
│   │   ├── renderer.js        ← WebGL renderer setup, render loop
│   │   ├── input.js           ← Mouse/keyboard event handling, A-attack-move state
│   │   ├── pathing.js         ← Simple obstacle-aware steering
│   │   └── effects.js         ← Damage numbers, AoE telegraphs, particle helpers
│   ├── world/
│   │   ├── world.js           ← Overworld terrain + zone manager
│   │   ├── town.js            ← Town hub spawning (NPCs, fountain, portal)
│   │   ├── dungeon.js         ← Dungeon layout generator + instance state
│   │   └── spawner.js         ← Mob spawning by distance
│   ├── entities/
│   │   ├── entity.js          ← Base Entity (transform + 3D mesh)
│   │   ├── player.js          ← Player-controlled hero entity
│   │   ├── enemy.js           ← Enemy entity wrapping existing Enemy class
│   │   ├── npc.js             ← Static town NPCs
│   │   ├── projectile.js      ← Projectile entity for ranged attacks
│   │   └── lootDrop.js        ← Item-on-ground entity
│   ├── combat/
│   │   ├── combat.js          ← Real-time damage / HP / death (replaces battle.js)
│   │   ├── battleAdapter.js   ← Compatibility shim so spellLogic.js works unchanged
│   │   ├── abilities.js       ← Ability registry: queues casts, manages cooldowns
│   │   ├── statusFx.js        ← Buff/debuff ticking on real time
│   │   └── ai.js              ← Real-time enemy AI (chase, attack, ability use)
│   ├── ui/
│   │   ├── hud.js             ← Bottom HUD: HP, ability bar with cooldowns
│   │   ├── inventory.js       ← Inventory panel + drag-drop
│   │   ├── stash.js           ← Stash panel (reuses class-family logic)
│   │   ├── characterSelect.js ← 10-slot character selection screen
│   │   ├── menu.js            ← ESC menu, settings
│   │   ├── lobby.js           ← Multiplayer lobby UI
│   │   └── tooltips.js        ← Item / ability hover tooltips
│   ├── net/
│   │   ├── network.js         ← NetworkManager interface
│   │   ├── localTransport.js  ← Stub: single-player, no network
│   │   ├── colyseusTransport.js ← Real Colyseus client (for when backend exists)
│   │   └── protocol.js        ← Message types and shapes
│   ├── save/
│   │   └── saveArpg.js        ← Per-character ARPG save (extends existing save format)
│   └── data/
│       └── (no .js — JSON loaded from project root)
├── docs/arpg/                 ← Planning and design docs (this folder)
├── (existing files untouched: index.html, game.js, hero.js, spellLogic.js, etc.)
```

## What we keep from the existing codebase

The existing files stay on disk. The ARPG build does not modify them. Specifically reused:

| Existing file | Used by ARPG how |
|---|---|
| `heroes.json`, `spells.json`, `enemies.json`, `dungeons.json`, `items.json` | Loaded as data |
| `spellLogic.js` | Required at runtime; ARPG calls `spellLogic[logicKey](...)` via `battleAdapter` |
| `hero.js` | `Hero` class instantiated for each player character (stat formulas reused) |
| `enemy.js` | `Enemy` class instantiated for mobs (stat scaling reused) |
| `item.js` | `Item` class instantiated for drops |
| `loadingManager.js` | Pattern reused; `arpg/data.js` loads similarly |
| `scalingSystem.js` | Reused for HUD layout |

The original `battle.js`, `battleUnit.js`, `battleAI.js`, `battleAnimations.js`, `uiManager.js`, `arena.js`, `tutorial.js` are **not** loaded by the ARPG build. The ARPG provides its own real-time replacements.

## Module dependency graph

```
arpg.html
  └─ scalingSystem.js
  └─ arpg/data.js          (loads JSON + spellLogic.js + hero.js + enemy.js + item.js)
  └─ arpg/main.js
       ├─ engine/* (scene, camera, renderer, input)
       ├─ world/* (world, town, dungeon, spawner)
       ├─ entities/* (player, enemy, npc, projectile, lootDrop)
       ├─ combat/* (combat, battleAdapter [needs spellLogic.js], abilities, ai)
       ├─ ui/* (hud, inventory, stash, characterSelect, menu, lobby)
       ├─ net/* (network, localTransport)
       └─ save/saveArpg.js
```

Load order (sequential): `scalingSystem.js → THREE (CDN) → existing libs (heroes.json, spells.json, ...) → spellLogic.js → hero.js → enemy.js → item.js → arpg/data.js → arpg/* (engine before world before entities before combat before ui before net before save) → main.js`

## Runtime singletons

| Global | Set by | Contains |
|---|---|---|
| `THREE` | CDN | Three.js module |
| `ArpgData` | `arpg/data.js` | All loaded JSON: `classes, spells, enemies, dungeons, items` |
| `spellManager` | `arpg/data.js` (re-uses existing pattern) | SpellManager instance |
| `Arpg` | `arpg/main.js` | The root game object: `{engine, world, player, hud, net, save}` |

`Arpg` is the equivalent of the old `game` global, but slimmed for ARPG.

## Game loop

```
requestAnimationFrame → Arpg.tick(dt)
  ├─ net.poll()                 (process incoming network messages)
  ├─ input.update()             (compute current intent: move / attack / cast)
  ├─ player.tick(dt)            (apply intent, advance pathing, basic-attack)
  ├─ world.tick(dt)             (advance NPC dialogue, portal triggers, ambient)
  ├─ entities.forEach(e => e.tick(dt))   (enemies AI, projectiles, lootDrops)
  ├─ combat.tick(dt)            (apply pending damage events, expire buffs/debuffs by dt)
  ├─ effects.tick(dt)           (advance damage numbers, telegraphs, particles)
  ├─ camera.tick(dt)            (smooth-follow player)
  ├─ renderer.render()
  └─ hud.render()
```

Target frame rate: 60Hz. All time-based systems use `dt` in seconds (not turns).

## Combat sub-architecture

The existing `battle.js` mixed turn loop, damage math, and effect application. The ARPG splits these:

| Old `battle.js` responsibility | New owner |
|---|---|
| Action bar / turn loop | DELETED (real-time now) |
| `dealDamage(attacker, target, dmg, type)` | `combat/combat.js` (ported with same formulas) |
| `applyBuff(target, name, dur, fx)` | `combat/combat.js` |
| `applyDebuff(target, name, dur, fx)` | `combat/combat.js` |
| `healUnit(target, amt)` | `combat/combat.js` |
| Buff/debuff tick (per turn) | `combat/statusFx.js` (per-second ticking) |
| Spell execution dispatch | `combat/abilities.js` |
| Logging (battle.log) | `combat/combat.js` (writes to combat-log HUD widget) |
| `getParty(unit)` / `getEnemies(unit)` | `combat/combat.js` |
| AI scoring | `combat/ai.js` (much simpler than old `battleAI.js`) |

`battleAdapter` exposes a fake `battle` object with the **same method signatures** as the old `battle`, so all 100+ functions in `spellLogic.js` work unchanged. They call `battle.dealDamage`, `battle.applyBuff`, etc., and the adapter routes those to `combat/combat.js`.

## Buff/debuff time conversion

- Old: `duration = 3` meant "lasts 3 turns"
- New: `duration = 3` is interpreted as "lasts 3 seconds" (1 turn = 1 second baseline)
- Bleed DoT: old ticked once per turn; new ticks every 1 second
- Permanent buffs (`duration == -1`) stay permanent
- Per-second tick handles: HP regen, bleed, blight removal, all duration decrements

## Cooldown time conversion

- Old: spell `cooldown = 4` at level 1 meant "wait 4 turns"
- New: 4 seconds at base, modified by speed → CDR
- See `04-conversion-spec.md` for the formula

## Save authority

- Per-character data lives on the player's localStorage (mirrors existing format)
- A character save also includes: `position {x,y,z}`, `currentZone` (town id, overworld, or dungeon id), `inventory []` (items not in stash, on the character), `gold` (per-character pocket gold for now)
- Stashes remain shared per class family (matches existing behavior)
- In multiplayer, the host validates joiners' save checksums and tracks dungeon clears server-side

## Why this layout

- `engine/` is engine-agnostic infrastructure that works for any 3D game
- `world/` is content-driven: zones, mob spawning, dungeon layout
- `entities/` are game objects with physics + visuals
- `combat/` is the rules layer — pure logic, no rendering
- `ui/` is DOM, pure presentation, listens to combat/world events
- `net/` is fully swappable transport
- `save/` is pure data shape, no rendering or networking knowledge

This makes it easy to swap the renderer (Three.js → Babylon), the transport (local → Colyseus → WebRTC), or the save backend (localStorage → server) without touching gameplay rules.

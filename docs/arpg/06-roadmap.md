# Roadmap

Phased delivery in this session. Each phase ends with a triple-review pass: build → review → fix → review → polish → review → next.

## Phase 0: Discovery + Planning Docs ✅
- Map existing codebase (3 parallel Explore agents)
- Write all 7 planning docs in `docs/arpg/`

## Phase 1: Engine Bootstrap
- `arpg.html` entry point
- `arpg/data.js` data loader
- `arpg/engine/scene.js` Three.js scene with terrain, sky, lighting
- `arpg/engine/camera.js` top-down follow camera
- `arpg/engine/renderer.js` render loop @ 60fps
- `arpg/engine/input.js` mouse + keyboard handling
- `arpg/engine/pathing.js` simple obstacle steering
- `arpg/entities/entity.js` base Entity class
- `arpg/entities/player.js` player with click-to-move
- Click-to-move works on flat ground; camera follows; capsule mesh visible
- **Acceptance**: Open `arpg.html`, see a ground plane, click anywhere, capsule walks there

## Phase 2: Combat System
- `arpg/combat/combat.js` (replaces battle.js for damage/heal/buff/debuff)
- `arpg/combat/battleAdapter.js` (compatibility shim for spellLogic.js)
- `arpg/combat/abilities.js` (cooldown manager, ability dispatch)
- `arpg/combat/statusFx.js` (real-time buff/debuff ticking)
- `arpg/combat/ai.js` (simple chase + attack + ability use AI)
- Basic attack: scales with hero's `attack` stat, fires at `actionBarSpeed`-derived interval
- One ability (test: `punch`) wired through QWER
- **Acceptance**: Spawn a dummy enemy; click it; player walks up, basic-attacks; hit Q to use the punch spell; damage numbers float up; enemy dies; corpse despawns

## Phase 3: Overworld + Towns + Mob Spawning
- `arpg/world/world.js` — overworld zone manager
- `arpg/world/town.js` — 3 town hubs with NPCs
- `arpg/world/spawner.js` — distance-based mob spawning
- `arpg/entities/npc.js` — fountain, stash NPC, vendor, class trainer, dungeon portal
- `arpg/engine/effects.js` — AoE telegraphs, damage popups
- **Acceptance**: Spawn in town_center; walk out; encounter satyr groups that scale with distance; defeat them for gold + XP; return to town; stash open works

## Phase 4: Dungeon System
- `arpg/world/dungeon.js` — instanced linear dungeon
- Portal in overworld → click to enter → load dungeon scene
- Linear corridor with rooms; clearing a room opens the next door
- Boss room → loot room → item drop on ground
- `arpg/entities/lootDrop.js` — pickupable item entity
- **Acceptance**: Click satyrs_glade portal → instanced dungeon loads → push through 3 rooms → kill boss → enter loot room → pick up item → exit returns to overworld

## Phase 5: Class Porting (10 classes)
- `arpg/data/classRegistry.js` — per-class visual + ARPG-specific config
- All abilities for villager_male, villager_female, and 8 base tier-1 male classes wired through battleAdapter
- Verify each spell triggers correct effects via existing spellLogic.js
- **Acceptance**: Dev console can spawn each of the 10 classes; QWER fires each ability successfully; promotion dialog at lvl 50 lets villager pick any of 8 classes

## Phase 6: UI
- `arpg/ui/hud.js` — HP bar, ability bar with cooldowns, XP bar
- `arpg/ui/inventory.js` — drag-drop equipment + items
- `arpg/ui/stash.js` — class-family-shared stash UI
- `arpg/ui/characterSelect.js` — 10-slot character picker
- `arpg/ui/menu.js` — ESC menu, save/load
- `arpg/ui/tooltips.js` — item + ability hover tooltips
- **Acceptance**: All UI panels open/close, items can be moved between bag/equipment/stash, character creation works

## Phase 7: Multiplayer Scaffolding
- `arpg/net/network.js` — NetworkManager interface
- `arpg/net/protocol.js` — message types
- `arpg/net/localTransport.js` — single-player transport (default)
- `arpg/net/colyseusTransport.js` — stubbed Colyseus client (interface only)
- `arpg/ui/lobby.js` — lobby UI (host/join, room codes, character picker)
- **Acceptance**: Lobby UI works in single-player mode; "Host" creates a 1-player session; entire game still playable with `localTransport`

## Phase 8: Triple Review Pass
- **Pass 1: Logic walkthrough** — trace the full gameplay loop (start save → walk → fight → dungeon → loot → promote). Find broken assumptions.
- **Pass 2: Integration** — verify ported classes/spells/items match original behavior. Check formulas. Spot-check 5 spells against their `spellLogic.js` originals.
- **Pass 3: Polish** — visuals, juice, edge cases. Add missing telegraphs, ensure no JS errors in console, smooth out camera, fix UI overlap.

## Out of scope this session

- Real Colyseus server deployment + multiplayer testing across machines
- Real character art (sticking to capsule placeholders)
- All dungeons except `satyrs_glade`
- All classes except 10 (villager_m/f + 8 base male)
- Vendor inventory and potions
- Voice chat
- Hardcore mode
- Achievements / collection log polish
- Mobile/touch support

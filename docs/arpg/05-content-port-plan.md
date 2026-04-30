# Content Port Plan

## Scope

Porting all 80+ class entries × 4-5 spells each + all 100+ enemies + all 12 dungeon tiers in a single session is not feasible. This doc defines what ships in v1 and how to add the rest in follow-up sessions.

## V1 ships with

### Classes (10 total)
- `villager_male` (starting)
- `villager_female` (starting)
- One tier-1 base class per family (8 total):
  - `acolyte_male`
  - `archer_male`
  - `druid_male`
  - `initiate_male`
  - `swordsman_male`
  - `templar_male`
  - `thief_male`
  - `witch_hunter_male`

These give the full promotion preview (villager → 8 family choices) and prove the ability adapter works across all archetypes (heal, ranged, hybrid, magic, melee, support, assassin, anti-magic).

### Spells (covered by v1 classes — ~16-18 unique)
- punch, fury, throw_rock (villager)
- holy_smite, divine_light (acolyte_male)
- aimed_shot, hunters_mark (archer_male)
- natures_blessing, barkskin (druid_male)
- arcane_missiles, frost_armor (initiate_male)
- blade_strike, shield_bash (swordsman_male)
- psi_strike, psychic_mark (templar_male)
- cheap_shot, cripple (thief_male)
- purge_slash, nullblade_cleave (witch_hunter_male)

(Exact lists depend on what each class's `spells` array references in `heroes.json`.)

### Dungeon (1 fully playable)
- `satyrs_glade` (Easy 1, the first dungeon)
- All 3 waves converted to 3 enemy rooms in a linear corridor
- Final boss room with `satyr_instigator`
- Loot room with one drop from `rewards.items`
- All other dungeons: dungeon entrance portals exist in overworld but are gated behind a "Coming Soon" message

### Enemies (covered by satyrs_glade)
- `satyr_youth`
- `aggressive_satyr`
- `satyr_instigator`

### Items (covered by satyrs_glade rewards)
- All items in `satyrs_glade.rewards.items` work as drops (existing Item class handles them all)
- All other items still load fine; they just won't appear as drops until their dungeons are wired

### Towns (3, all functional)
- `town_north`, `town_center`, `town_south` — all have fountain, stash NPC, vendor stub, class trainer, dungeon-select pad

### Overworld
- Full terrain
- 3 town safe zones
- Mob groups around `satyrs_glade` entrance using satyr enemies
- Mob groups around other dungeons use **placeholder mobs** = same satyrs at higher levels (since other dungeons aren't enemy-wired yet) — clearly marked TODO

### UI
- Character select (10 slots)
- HUD (HP, ability bar, minimap stub)
- Inventory + stash
- Promotion dialog
- ESC menu

### Multiplayer
- Lobby UI built and functional
- Local transport works (single-player playable)
- Colyseus transport stubbed (non-functional, ready to be wired)

## Post-v1 work (clearly listed for follow-up sessions)

### Class porting checklist (~70 remaining classes)
For each remaining class:
1. Verify gender-pair entry in `heroes.json`
2. Add to `arpg/data/classRegistry.js` with: model color, basic attack range (melee/ranged), move speed
3. Verify each ability's `logicKey` exists in `spellLogic.js` and works through battleAdapter
4. Add AoE radius / cast time overrides if needed in `arpg/combat/abilities.js`
5. Quick smoke test in dev console (spawn the class, fire each ability)

Estimated time: ~10 minutes per class once the pipeline is established. Follow-up session(s) can batch this with a class-porting agent.

### Dungeon porting checklist (~57 remaining dungeons)
For each remaining dungeon:
1. Read its entry from `dungeons.json`
2. Build a corridor layout: `entrance → N enemy rooms → boss room → loot room` where N = waves count - 1
3. Spawn waves' enemies in matching rooms
4. Verify boss spawns correctly with isBoss flag
5. Verify rewards (items, gold, exp) trigger on boss kill

Estimated time: ~5 minutes per dungeon (mostly wiring data; layout is templated).

### Enemy porting (~all enemies)
- All enemies in `enemies.json` already work via the existing `Enemy` class
- For the ARPG, the only addition needed is a `model` descriptor (capsule color/size)
- Default: derive from `boss` flag (red if boss, dark gray otherwise) and from level (size scales `1.0 + 0.001 * level`)
- Per-enemy overrides can be added in `arpg/data/enemyRegistry.js` for visual distinction (e.g., satyrs are green, undead are pale)

### Spell ability-specific behaviors
A handful of spells have idiosyncrasies in the original `executeAbility` that need ARPG re-implementation:
- **Fire Dance**: in old battle.js, the spell is cast, then a second auto-attack is granted to the caster. New: hook into `abilities.js` post-cast event for fire_dance to trigger basic attack.
- **Whirling Step**: doubles the next basic attack. New: same hook approach.
- **Multi-target chains** (e.g., chain lightning, if any): need a chain-pathing routine.

These are listed as `TODO_ABILITY_SPECIFICS` in the codebase.

### Vendor / merchant
- Stub in v1 (sells nothing, just shows the autosell value of clicked items)
- Future: full merchant inventory + buy potions

### Promotion UI
- Functional in v1: shows promotion options, gold cost, takes gold, swaps class
- Cosmetic polish (animations, fanfare) is post-v1

### Visual polish
- Stand-in capsule models in v1
- Future: replace with actual rigged models per class
- Future: ability-specific VFX (lightning, fire, healing aura) instead of generic AoE rings

### Awakening
- Same as promotion, just at level 400 with no class swap (existing behavior)
- Awakening unlocks the 4th passive ability (existing logic)
- ARPG hook: add the passive's effect when `hero.awakened === true` is set (handled by stat re-roll on entity spawn)

## Why v1 is structured this way

- **One class per family** proves the entire promotion tree visually exists, lets the player see "I can become any of 8 things at level 50"
- **Male villagers only at v1** is *not* the case — both genders ship as starting picks. But for the 8 promotions, picking just male reduces ports from 16 → 8 with no design loss (the female variants use identical mechanics, just sometimes different spell IDs; the female promotion path will be added in the next port pass)
- **One full dungeon** end-to-end proves the full loop: enter portal, fight waves, kill boss, get loot, leave. Once it works, copying the pattern for 57 more is mostly data work
- **Multiplayer scaffolded but stubbed** keeps the gameplay loop testable without requiring a deployed server. The interface is real; just the transport plug is local

## Estimated post-v1 timeline

| Task | Estimate (next session) |
|---|---|
| Port remaining 70 classes (with batch agent) | ~3-4 hours |
| Port remaining 57 dungeons (with batch agent) | ~5-6 hours |
| Wire actual Colyseus transport + deploy server | ~2-3 hours |
| Vendor/merchant + potion system | ~1-2 hours |
| Replace placeholder visuals (per-class models, real VFX) | ~10+ hours (asset work) |

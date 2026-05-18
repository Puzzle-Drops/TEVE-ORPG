# TEVE — Twilight's Forever

3D multiplayer ORPG built in **Godot 4.6 (mono/.NET build)**. Up to 8-player co-op dungeons in a server-lobby model. Targeting **Steam release**.

## Status

Asset-ready, code-empty milestone. All raw assets organized locally under `assets/` (gitignored). Folder skeleton in place. **`project.godot` not yet created** — open this folder in Godot to initialize.

## Engine & platform

- **Godot 4.6**, mono build at `~/Godot_v4.6.2-stable_mono_win64/`
- Default to **GDScript**; C# available if a system genuinely needs it
- **Steam target**, Windows primary
- **Networking**: 8-player co-op instanced dungeons. Lobby/account server (cheap, always-on, validates progression) + peer-hosted dungeon instances likely. Avoids dedicated-server costs since there's no PvP. Decide before the networking spike.

## Folder structure

```
TEVE-ORPG/
├── assets/                          # GITIGNORED. ~24 GB raw asset library, local only.
│   ├── audio/
│   │   ├── ambient/audio_rpg/       # long environment loops (~370 MB)
│   │   └── sfx/                     # functional categories: combat, ui, crafting, doors,
│   │                                # dungeon, magic, movement, lootbox, notifications, misc
│   │                                # Each has vendor subfolders (audio_rpg, leohpaz, etc.)
│   ├── icons/
│   │   ├── crafting/                # 250 PNGs (Bone_01.png, Cloth_silk.png, ...)
│   │   ├── equipment/               # 2,338 PNGs across 14 slots
│   │   │   ├── belt/ boots/ bracers/ cape/ chest/ gloves/ helm/
│   │   │   ├── pants/ robe/ shoulder/ tabard/ weapons/
│   │   │   ├── book/ neck/ ring/ misc/      # secondary slots
│   │   ├── spells/nhance/           # 293 PNGs flat: arcane1..26, blood_combat1..23,
│   │   │                            # cosmic, elements, energy, fel, fire, frost,
│   │   │                            # gold, nature, shadow, tech, unholy
│   │   ├── soda/                    # 4,877 32x32 pixel-art bank — DIFFERENT STYLE,
│   │   │                            # use as fallback/reference only, do not mix with
│   │   │                            # the high-res nhance icons in the same UI
│   │   ├── items/  ui/              # empty placeholders
│   ├── models/
│   │   ├── creatures/               # 70 enemies, each in own folder w/ textures/
│   │   │                            # Some have weapons/ subfolder (skeleton_warrior etc.)
│   │   ├── environment/             # SummerEnvironmentPack: bushes/ cattails/ leaves/
│   │   │                            # lilly_pads/ moss/ mushrooms/ rocks/ trees/ vines/
│   │   │                            # + shared textures/{props,tilesets}/
│   │   └── players/                 # Human male/female only for v1
│   │       ├── races/human/{female,male}/{base,customization}/
│   │       ├── equipment/           # Human variants across 14 slots
│   │       ├── weapons/             # race-neutral, 11 types
│   │       └── animations/{characters,weapons}/
│   ├── portraits/                   # 971 character/creature portraits (Transparent variant)
│   ├── studio/                      # Puzzle Drop Studio branding (2 PNGs)
│   └── textures/
│       ├── effects/                 # fog_texture.tif, cloud.png (from Fog Shader pack)
│       └── terrain/
│           ├── lowpoly/             # 53 PNGs, biome-themed (Cave, Desert, Summer, Winter)
│           └── stylized/            # 50 biomes × 5 PBR maps each (Albedo, Normal,
│                                    # Height, AlbedoSmoothness, MetallicSmoothness)
│
├── autoload/                        # Godot singletons (GameState, Network, etc.) — TBD
├── data/                            # Resource definitions (.tres or .json) — TBD
│   ├── dungeons/ enemies/ items/ spells/
├── scenes/                          # Godot .tscn files — TBD
│   ├── dungeons/ enemies/ player/ ui/ world/
├── reference/                       # TRACKED. Read-only design references.
│   ├── proto/                       # Three.js single-player 3D ARPG sandbox
│   │                                # → see reference/proto/CLAUDE.md
│   └── stylized_character_scripts/  # 40 Unity .cs files: modular character spec
│                                    # → porting reference, not runnable code
└── .gitignore                       # assets/, .godot/, Godot mono artifacts
```

## Reference materials (tracked in git)

**`reference/proto/`** — frozen Three.js single-player ARPG sandbox. Captures the minute-to-minute feel target: top-down camera, click-to-move, QWER ability slots, swarm enemies with aggro/chase/leash. Tuning values (aggro radius, movement speed, ability cooldowns, hit feedback) are the actual artifact — use these as starting points when configuring Godot scenes.

**`reference/stylized_character_scripts/`** — 40 Unity .cs files describing the modular character system. The `enums/` folder is the data model spec (BoneType, ItemTypeEnum, Gender, TextureType, ItemCategory, etc.). `NHAvatar.cs` shows character composition; `NHItem.cs` shows item attachment; `wrappers/MaterialMapper.cs` shows variant logic. Use as porting reference when building the Godot equivalent.

## Player character architecture (target)

Based on the reference scripts:

- One shared `Skeleton3D` per race/gender (Human male, Human female for v1)
- Body parts (`base/chest.fbx`, `base/head.fbx`, ...) as `MeshInstance3D` children, all skinned to the shared skeleton
- **Equipment pieces** (`equipment/chest/*.fbx`) are **drop-in mesh replacements** for body parts — same skeleton, same skinning, different mesh
- **Weapons** (`weapons/sword/*.fbx`) attach to named bones (right_hand, left_hand, back) via `BoneAttachment3D`
- Material/color variants driven by `surface_material_override` at runtime (parallel to Unity's `MaterialMapper`)
- Animations live in `hu_m_base_pack.fbx` / `hu_f_base_pack.fbx` (full clip libraries — idle/run/attack/etc.). Import once, reuse across both genders via animation retargeting if skeletons match.

## Mob architecture (target)

One `Enemy` scene that:
1. Reads `data/enemies/<creature>.tres` (stats, behavior, variant)
2. Loads `assets/models/creatures/<creature>/<creature>.fbx`
3. Applies the chosen texture variant via `surface_material_override`
4. Attaches behavior tree / state machine for AI (aggro, chase, attack, leash, death)

Some creatures (`skeleton_warrior`, `hellguard`, `skeleton_archer`, `skeleton_wizard`, `zombie`) have a `weapons/` subfolder — bone-attached weapons matching their animation stance (1H, 2H, dual-wield, etc.).

## Stat system (TBD)

**Old turn-based version** (deleted from working tree, still in git history):
- **HP**
- **STR / AGI / INT** — three attack stats; each spell scales off ONE of them
- **Armor** — physical DR via `0.9 × Armor / (Armor + 500)`
- **Resist** — magic DR via `0.3 × Resist / (Resist + 1000)`
- **Speed** — action-bar progression (turn-based specific; not relevant in real-time)
- **No mana** — spells used cooldowns only

**Candidate v1 stats for 3D real-time:**
- HP (health pool)
- Mana (real-time resource for spell casting — replaces pure cooldown model)
- STR / AGI / INT (keep — more flexible than unified "physical/magic attack")
- Armor (physical mitigation)
- Resist (magic mitigation)

**Future consideration (DEFERRED):** A triangle damage-type system (physical / dark / magic, where each beats one and loses to one) plus a third resource — **Spirit** — that lets the player "ground" themselves against one damage type to halve its effectiveness. Spirit fills as you deal damage, drains when taking damage in the wrong stance. Adds a tactical layer for boss fights where damage types are telegraphed. Decide once v1 combat is playable — don't build this in upfront.

## Naming conventions

- **Folders**: `snake_case`, lowercase
- **`.gd` files**: `snake_case.gd` (Godot convention)
- **C# files** (when used): `PascalCase.cs` (C# convention)
- **Scene files**: `snake_case.tscn`
- **Asset filenames**: source names preserved with vendor prefixes stripped:
  - `T_Inv_Belt_Bandit_A_01.png` → `Belt_Bandit_A_01.png`
  - `T_Nhance_Bone_01.png` → `Bone_01.png`
  - `T_Pt_Abomination_A_01.png` → `Abomination_A_01.png`
- **Spell icons (nhance pack)**: `<theme><index>.png` — `arcane1.png` through `unholy26.png`, flat in one folder

## Git / asset policy

- `assets/` is gitignored entirely. Treat it as a local-only library. If you need teammates to have the same assets, share a separate archive — don't try to commit 24 GB.
- `reference/` IS tracked. The proto and Unity scripts are small text and worth preserving in repo history.
- Folder skeleton is preserved via `.gitkeep` files (autoload/, data/*/, scenes/*/).
- Two commits already on `main` representing the reset: "Pivot to Godot 3D multiplayer ORPG; reset project scaffolding" + "Remove old turn-based JS codebase".

## What's done

- Folder structure scaffolded for Godot 4
- All asset packs organized: 70 creatures, 85 environment props, Human male/female + equipment + weapons + animations, terrain biomes, 8,500+ icons across crafting/equipment/spells/portraits, audio sfx + ambient
- Filename prefixes cleaned across the board
- Reference proto + Unity character scripts preserved
- Git milestone committed + pushed

## What's next

1. **Open this folder in Godot** to create `project.godot`. Choose **Forward+** renderer for desktop quality, **Mobile** if planning lower-spec.
2. **Configure project settings**: rendering, input map (mouse buttons + QWER + 1234), default window size, physics layers.
3. **Player scene first** — single Human Male/Female with the modular composition pattern. One body part swap test (e.g., chest mesh → equipment chest mesh) to validate the architecture before scaling.
4. **Networking spike** very early — `multiplayer.peer = ENetMultiplayerPeer.new()` with two local clients moving around. Get it working before any content depends on single-player assumptions.
5. **One enemy** spawned and killable, with one ability hitting it. This is the "vertical slice" that proves the loop.
6. Then dungeon, then progression, then everything else.

## For Claude / future iterations

- This is a fresh codebase — no patterns yet. As they emerge, document them here.
- **Never commit to `assets/`** — gitignored. Commit code, scenes, data resources, references only.
- When stat/combat math gets specified, add `STATS.md` and link from here.
- When networking architecture gets decided, add `NETWORKING.md` and link from here.
- Default to GDScript. Only reach for C# if there's a real performance or library reason.
- Reference the proto (`reference/proto/CLAUDE.md`) for tuning numbers — the feel was already dialed in there.

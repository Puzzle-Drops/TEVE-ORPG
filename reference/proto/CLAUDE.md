# TEVE ARPG Prototype

Single-player 3D top-down ARPG sandbox built in vanilla JS + Three.js. **Frozen** — kept as a feel/loop reference for a future Unity multiplayer build, not as a target for further iteration.

The original turn-based TEVE game (`index.html`, `*.js` at repo root) is unrelated to this folder and untouched.

## What it proves

- The minute-to-minute loop: top-down view, click-to-move, melee + projectile + AoE abilities on Q/W/E/R, swarm of enemies that aggro, chase, attack, die.
- 3D characters are mostly procedural primitives (player, fallback enemies) but enemies can be swapped in as full skinned GLB models with skeletal animation (the three satyr archetypes are the worked example).
- HUD/tooltip/charsheet flow lifted from the parent game, simplified.

What it is **not**: networked, persistent, content-complete, or production-quality.

## Running it

No build step. Needs a local HTTP server (some assets are loaded via `fetch`/`GLTFLoader`, both blocked on `file://`):

```
python -m http.server 8765
```

Open <http://localhost:8765/proto.html>.

## Entry & load order

`proto.html` chains `<script>` tags sequentially after Three.js is ready:

1. `textures.js` — procedural canvas textures (ground, paths)
2. `scene.js` — Three.js scene, lights, world/entity/effects roots
3. `camera.js`, `renderer.js`, `input.js`
4. `effects.js`, `indicators.js`
5. `models.js` — GLB asset preloader (satyr T1/T2/T3)
6. `character.js` — procedural character builder + GLB-backed satyr path
7. `entity.js`, `projectile.js`, `combat.js`, `abilities.js`
8. `player.js`, `enemy.js`, `world.js`
9. `hud.js`, `tooltip.js`, `charsheet.js`
10. `save.js`, `net.js`
11. `main.js` — `Proto.boot()` runs after all above load

Async preload of GLBs (`ProtoModels.preload()`) happens during boot before world build.

## Globals

Everything is exposed on `window` via IIFEs (no module system, no bundler).

| Global | Owner | Purpose |
|---|---|---|
| `Proto` | `main.js` | Top-level state: player, entities, gold, running flag, selected enemy |
| `ProtoScene` | `scene.js` | THREE.Scene + worldRoot/entityRoot/effectsRoot groups |
| `ProtoCamera`, `ProtoRenderer`, `ProtoInput` | self-named | |
| `ProtoChar` | `character.js` | `create(presetKey, opts)` returns a character API object |
| `ProtoModels` | `models.js` | GLB preloader; `satyrT1/T2/T3` cached templates |
| `ProtoEntity`, `ProtoPlayer`, `ProtoEnemy` | classes | |
| `ProtoCombat`, `ProtoAb`, `ProtoProj`, `ProtoEffects` | systems | |
| `ProtoWorld` | `world.js` | Arena build, mob clusters, respawn |
| `ProtoHud`, `ProtoTooltip`, `ProtoCharSheet`, `ProtoInd` | UI | |
| `ProtoSave`, `ProtoNet` | `save.js`, `net.js` | LocalStorage / stub |

## Key systems

### Characters

`ProtoChar.create(presetKey, opts)` returns an object with `{ group, tick, setFacing, playSwing, playCast, playHurt, playDeath, reset, ... }`. Two backing implementations:

- **Procedural** (`warrior`, `ranger`, `mage`, `beast` presets): primitives composed in code, animated by lerping rotations of named sub-groups (hip, arms, legs).
- **GLB-backed** (`satyr_1h`, `satyr_dual`, `satyr_2h`): clones a preloaded glTF scene via `THREE.SkeletonUtils.clone`, drives a `THREE.AnimationMixer` per instance.

Both expose the same API surface so `entity.js` doesn't care which is in use. The GLB path is gated on `ProtoModels.loaded` — if preload fails, callers fall back to procedural.

### Satyr variants

`SATYR_VARIANTS` in `character.js` maps each preset to a model + scale + four explicit clip names:

```
satyr_1h   → satyrT1 (1H axe right hand),   scale 1.0, *_1H_WepR
satyr_dual → satyrT2 (dual-wield axes),     scale 1.1, *_1H_DualWield
satyr_2h   → satyrT3 (2H axe),              scale 1.2, *_2H
```

All three GLBs ship the same 80-clip animation library — the difference is which weapon mesh is baked into the body. Pick clips by suffix to keep the visible weapon in sync with the swing.

### Combat & abilities

`ProtoCombat.dealDamage(attacker, target, amount, type)` is the single funnel for damage application; it computes mitigation against the target's armor/resist, applies the hit, spawns a damage number, triggers `playHurt` on the character, and routes to `Proto.onEnemyKilled` if it kills.

`ProtoAb.list` is a hard-coded array of 5 abilities (Q cleave, W bolt, E shockwave, R battle shout, passive thorns) — built to exercise every codepath (melee, projectile, AoE, self-buff, passive). Designed to be replaced by a TEVE-spell-adapter layer; not actually wired to the parent game's `spells.json`.

### World

`ProtoWorld.build()` lays a 600×600 ground plane, a plaza at origin, decor (trees/rocks/campfire), and 6 mob clusters at ~22-26 units from origin: 8 grunts, 6 stalkers, 4 brutes. Respawn timer 8 s per slot.

### HP bar

Single billboarded sprite per entity, backed by a per-entity `<canvas>`. `entity.tick` redraws the canvas only when `pct` changes by more than 0.001. No more two-sprite drift bug from earlier iterations.

## Asset pipeline

The `tools/` folder has the GLB workflow we settled on:

| Tool | Purpose |
|---|---|
| `tools/fbx_to_glb.py` | Blender CLI: FBX → GLB with bones, skin, animations |
| `tools/convert_fbx_anims.py` | Variant for FBXs that pack multiple takes on one timeline (Stylized Creatures Bundle satyr) |
| `tools/inspect_glb.py` | Dump animation names + frame ranges from a GLB |
| `tools/glb_editor.py` | Light edit operations on GLBs |

The three live satyr GLBs in `assets/models/satyr/` (`Satyr_t1_*`, `Satyr_t2_*`, `Satyr_t3_*`) were converted via a web tool, not the local Blender scripts. The Blender scripts still work for new content but had two pitfalls we discovered: (a) bone-orientation auto-correction breaks UE-style rigs, set `automatic_bone_orientation=False`; (b) NLA-strip placement at the action's source frame range produces a clip whose duration is the entire timeline — shift strips to start at frame 1 to get a clip with the actual length.

## What's stubbed

- `net.js` — interface stub; `Proto.connect()` resolves immediately with no transport.
- `save.js` — minimal localStorage save (level, exp, gold, position). No character slots, no encryption.
- Vendor / inventory / promotion UI — not wired in this proto.
- Sound — none.

## Carrying over to Unity

The proto is throwaway in the sense that the JavaScript code doesn't port — but the **design choices** are the actual artifact:

- Camera framing, click-to-move feel, ability slot count, cooldown timings
- Mob aggro radius, leash distance, retarget cadence, movement speeds
- Damage formulas (`ProtoCombat.dealDamage`) and the hit/death feedback loop (camera shake, hit pause, damage numbers, death puff)
- Satyr archetype mapping (1H grunt → dual-wield stalker → 2H brute) and the SATYR_VARIANTS config shape
- HP bar as a billboarded canvas instead of separate fill/bg sprites — the same trick should apply to whatever bar/nameplate system Unity uses

For the Unity build, the existing `docs/arpg/` planning notes (00-overview through 06-roadmap) describe the larger ARPG conversion ambition; treat them as design reference rather than spec.

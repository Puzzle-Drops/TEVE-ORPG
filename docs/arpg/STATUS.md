# ARPG v1 Status

> **Superseded.** The `arpg/` folder and `arpg.html` described in this document were never built. The actual prototype lives in `proto/` (entry: `proto.html`) and is a much smaller scope — a single-player 3D combat sandbox, no character slots, no dungeons, no real networking. See `proto/CLAUDE.md` for the prototype's true architecture and final feature set. The notes below remain only as a snapshot of the original ambition for the upcoming Unity multiplayer build to mine for design intent.

---

## Original planned state (NOT what was built)

**Runtime-clean for the first 5+ minutes of play** as verified by two independent code reviews after the build pass.

Open `arpg.html` in a browser served via http(s) (the existing project is hosted on GitHub Pages — fetch() of the JSON files won't work over `file://`). On load you should see:

1. Loading bar fills to 100%
2. Character select with 10 empty slots
3. Pick "New Character" → name + gender → enters Crossroads town
4. Walk around (right-click), explore three towns, attack overworld satyrs
5. Walk to the satyrs_glade portal → enter dungeon → push through 3 rooms → boss → loot
6. Auto-exit returns you to Crossroads

## What's built

- Three.js scene, top-down camera, click-to-move, A-attack-move, basic attack, QWER abilities
- Real-time port of `battle.js` damage/heal/buff/debuff logic via `battleAdapter`
- All 100+ existing spells run unchanged via the adapter
- 3 town hubs + open overworld with mob clusters around dungeon entrances
- Mob level scales with distance from nearest town
- Linear instanced dungeon (`satyrs_glade` is the v1 fully-wired dungeon)
- Loot room with item drop, gold/exp award, auto-exit
- HUD: HP bar, XP bar, ability bar with cooldowns, name/class/level
- Inventory + class-family-shared stash
- 10 character slots, save/load, autosave every 60s
- ESC menu, lobby UI (single-player works; multiplayer stub)
- Network layer interface ready for a Colyseus transport

## What's stubbed / deferred

- All dungeons except `satyrs_glade` show "Coming Soon" on portal click
- Class porting: any class works automatically (the player wraps any Hero), but only villager_male and villager_female are exposed in the New Character flow. Promotion at level 50 lets you choose any of the 8 base classes; further tiers need their gender-pair entries verified
- Multiplayer transport: `localTransport` (single-player) is the default; `colyseusTransport` exists as a typed stub. Wire to a real server in a follow-up session
- Vendor NPC opens inventory; doesn't sell yet
- No real character art — capsules colored by class family
- No ability-specific VFX yet — generic AoE rings + hit flashes
- 4th-slot passive only fires for Hero properties the spell logic touches (most existing passives use the dealDamage/applyBuff hooks already)

## Known polish gaps

- AoE telegraph color is uniform red; could differentiate damage vs buff vs heal
- Damage number colors limited to physical/magical/heal/crit
- Promotion UI uses a `prompt()` dialog (functional, not pretty)
- Combat log floats at bottom-left; could use scrollable overlay improvements
- No minimap yet

## Adding more content

### Add a class
1. Verify it exists in `heroes.json`
2. The player automatically gets the right abilities through `Player` constructor — no code change needed for ability dispatch
3. Optionally tune basic-attack range and move speed in the FAMILY_COLORS / RANGED_FAMILIES maps in `arpg/entities/player.js`

### Add a dungeon
1. Verify the dungeon is in `dungeons.json` (it should already be — every dungeon there was preserved)
2. Add the portal in `arpg/world/world.js` `dungeonPortals` array
3. The dungeon loads automatically using its waves config

### Wire a real Colyseus server
1. Stand up a Colyseus instance with a single Room type
2. Edit `arpg/net/colyseusTransport.js` — replace the stub with the real client
3. In `arpg/main.js` `boot()`, switch to `ArpgNet.useTransport(ArpgColyseusTransport)`
4. Implement room-side handling per the message types in `arpg/net/protocol.js`

## Files

- 7 planning docs in `docs/arpg/`
- 34 ARPG JS files in `arpg/` (~3300 lines)
- 1 entry HTML (`arpg.html`)
- 1 stylesheet (`arpg/styles.css`)
- 0 modifications to the original turn-based game files (everything reused intact)

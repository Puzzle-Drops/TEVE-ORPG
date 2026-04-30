# Networking

## Authority model

**Host-authoritative** with a thin client-side prediction layer.

- One player creates the lobby; their client is the **host**
- Host owns: enemy AI, enemy HP, dungeon state, loot generation, mob spawning, player respawns
- Each client owns: their own position, basic-attack timing, ability cast intent
- All damage events are **resolved on the host** to prevent cheating
- Clients predict their own movement and basic attacks for snappy feel; corrections are smoothed

This avoids the complexity of a true dedicated server while keeping anti-cheat reasonable for friends-only co-op. Hardcore PvP would need an authoritative dedicated server — out of scope for v1.

## Transport

`arpg/net/network.js` defines a `NetworkManager` interface that swaps transport behind a clean API:

```
NetworkManager:
  connect(roomCode?: string) -> Promise<{role: 'host' | 'client', sessionId}>
  send(msgType: string, payload: object) -> void
  onMessage(handler: (msg) => void) -> () => void  // returns unsubscribe
  disconnect() -> void
```

### Transport implementations

1. **`localTransport.js`** (default in v1)
   - No actual network. Plays single-player only.
   - `send` is a no-op except for echo (used in tests)
   - `connect` returns `{role: 'host'}` immediately
   - This lets the entire game work offline; networking is a feature flag

2. **`colyseusTransport.js`** (stub interface in v1, to be wired to a real Colyseus server later)
   - Connects to `wss://your-colyseus-host/`
   - Joins or creates room with code
   - All `send`/`onMessage` map to Colyseus state sync

3. **WebRTC P2P** (future option)
   - Could swap in if hosting a Colyseus server is undesirable
   - Not implemented v1

## Message protocol

All messages are JSON `{type, ...payload}`. Versioned via top-level `v: 1`.

### Client → Host messages

| Type | Payload | Purpose |
|---|---|---|
| `move` | `{x, z}` | Request move to position (client predicts; host validates) |
| `attackTarget` | `{entityId}` | Request basic-attack target |
| `castAbility` | `{slot, targetEntityId?, targetX?, targetZ?}` | Request ability cast |
| `interactItem` | `{lootDropId}` | Request item pickup |
| `interactNpc` | `{npcId, action}` | Open stash, promote, etc. |
| `enterDungeon` | `{dungeonId}` | Request portal entry |
| `chat` | `{text}` | Lobby chat message |
| `swapCharacter` | `{slotId}` | Switch to a different character (kills current) |

### Host → Client messages

| Type | Payload | Purpose |
|---|---|---|
| `worldSnapshot` | `{tick, entities: [{id, type, x, z, rotY, hp, maxHp, buffs, debuffs}]}` | Periodic world state |
| `entitySpawn` | `{id, type, ...stats}` | New entity entered scene |
| `entityDespawn` | `{id, reason}` | Entity removed |
| `entityMove` | `{id, x, z, rotY}` | Authoritative move (overrides client prediction if drift > 1 unit) |
| `damageEvent` | `{srcId, dstId, amount, type, isCrit}` | Damage was dealt — clients render numbers + animations |
| `healEvent` | `{srcId, dstId, amount}` | Heal applied |
| `buffApplied` | `{entityId, name, duration, effects}` | Buff applied — clients update icons |
| `debuffApplied` | `{entityId, name, duration, effects}` | Debuff applied |
| `buffRemoved` | `{entityId, name}` | Buff/debuff expired |
| `castStart` | `{entityId, abilityId, castTime, targetX?, targetZ?}` | Cast began (for animation lead-in) |
| `cooldownStart` | `{entityId, slot, duration}` | Cooldown started |
| `lootDropSpawn` | `{lootDropId, itemData, x, z}` | Loot appeared on ground |
| `lootDropRemoved` | `{lootDropId}` | Item picked up by someone |
| `dungeonStateChange` | `{phase, room, ...}` | Dungeon room cleared, boss spawned, etc. |
| `playerJoin` | `{playerId, name, characterData}` | Someone joined the lobby |
| `playerLeave` | `{playerId}` | Someone left |
| `chat` | `{playerId, text}` | Chat from another player |
| `respawn` | `{x, z}` | Server respawned this player |
| `error` | `{code, message}` | Validation failure |

## Tick rate

- Host runs game logic at 60Hz (same as render)
- `worldSnapshot` sent at **20Hz** (every 50ms) to all clients
- Per-event messages (`damageEvent`, `castStart`, etc.) are sent immediately
- Client-side interpolation buffers ~100ms behind server time for smooth other-player rendering

## Anti-cheat (v1, minimal)

- Save validation: when a client joins, host requests a checksum of their character save (level + class + gear summary). Server-side spec doesn't deeply verify, but sanity checks (level ≤ 500, class valid, gear items real) catch trivial editing
- All damage applied by host: a client claiming "I dealt 10M damage" doesn't get to apply it; host computes from the spell formula
- Item drops: host generates the item via `Item.rollItem()`. Client cannot inject item data
- Position validation: if a client jumps further than `maxMoveSpeed * dt + tolerance` between snapshots, host snaps them back

## Lobby flow

1. Player chooses **Host Game** or **Join Game** in main menu
2. **Host**: gets a 6-char room code, lobby panel opens, character select required first
3. **Join**: enter code, character select required first
4. Lobby panel shows: list of joined players (name, character class+level), chat, "Ready" button per player, "Start" button (host only)
5. When all players ready and host clicks Start: all clients enter `town_center` together
6. From then on, players can leave/join the running session; new joiners spawn at the host's current location

## Single-player path

When `localTransport` is the active transport, the entire networking layer is a passthrough:
- `send` calls happen but messages are dropped
- The game loop just runs locally
- Save/load works on local file
- Player is effectively the "host" of a 1-player lobby

This means **single-player and multiplayer use the exact same code paths** — no parallel implementations.

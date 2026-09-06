# Server operations

Room coordination lives in the `GameRoom` Durable Object. This is the recovery and capacity contract, not a claim of competitive anti-cheat.

## Capacity

| Limit | Value | Behavior |
|---|---|---|
| Joined players | `MAX_PLAYERS` = 24 | Extra joins receive `{ type:'error', message:'This room is full' }` and keep their socket until they disconnect. |
| Open sockets | `MAX_CONNECTIONS` = 32 | Further WebSocket upgrades return HTTP 503 `{ error:'This room is full' }` before `acceptWebSocket`. |
| Inbound client message | `MAX_MESSAGE_BYTES` = 8192 | Larger packets are invalid. |
| Server snapshot | `MAX_SERVER_MESSAGE_BYTES` = 65536 | A 24-player welcome is expected to fit; `parseServerMessage` uses this cap. |

Rate windows (defensive, matched to current send cadence; not cheat detection):

| Message | Limit |
|---|---|
| `updateMovement` | 30 / s |
| `shoot` / `hit` | 12 / s |
| `ping` | 4 / s |
| `join` | 3 / 10 s per connection |

Shot `direction` must be finite with magnitude in `0.05..8` (unit-ish). That bound is only a sanity check.

## Position envelope

Local physics is unbounded. A rat walking at speed 18 reaches 400 units in about 22 seconds, so the server must not drop ordinary continued motion.

The room stores and broadcasts a far envelope of `|x|,|z| <= 2000` and `y` in `[-8, 250]`. That is about 111 seconds of straight-line walking, well beyond the 12x12 city (`~360` units across). There are no invisible walls in the simulation.

If a finite update crosses the envelope, the room **clamps** the stored pose and broadcasts `{ type:'playerCorrected', player }` to **every** socket, including the mover. Clients should apply that pose. Updates inside the envelope remain `{ type:'playerMoved' }` and still skip the mover. Non-finite vectors are rejected at parse time.

## Persistence and hibernation

| State | Durability |
|---|---|
| Scores, HP, deaths, round phase, `respawnAt` / `resetAt`, `WorldSpec` | Written immediately. |
| Position / rotation | Memory always; SQL checkpoint every `CHECKPOINT_MS` = 2500 ms, and immediately on join, hit, death, respawn, reset, and envelope correction. |
| Liveness | `last_active_at` is independent of movement. Ping and any game message refresh it. |
| Pending respawn/reset | SQLite `pending_events` plus one Durable Object alarm. |

Hibernation recovery: `getWebSockets()` attachments are the source of truth for who is still connected. Hydration must **not** delete a player whose socket is attached even if `last_active_at` is older than `STALE_PLAYER_MS` (2 minutes). Background tabs can stop sending movement. Unattached records older than two minutes are pruned. After eviction, the next request reconstructs players from the latest checkpoint plus attached sockets.

On a winning hit, queued respawn events are deleted and every dead player's `respawnAt` is pinned to `gameWon.resetAt`. Nobody returns during the victory screen; `gameReset` respawns everyone together.

## Broadcast cost

Each outbound event is serialized once and the same string is sent to every recipient. The actual WebSocket-handler regression workload uses four joined players, one moving at 25 Hz for six seconds: 150 accepted movement messages, 150 measured `playerMoved` JSON serializations and 450 observed recipient deliveries. SQL checkpoint timestamps changed exactly twice (2.52 s and 5.04 s). Each saved pose matches the movement message at that checkpoint. A later heartbeat checkpoints the latest in-memory pose; eviction and a late join recover it. See `docs/verification/server-traffic.json`.

The original per-event policy would perform 150 player-row writes and 450 serializations for that same workload. Critical combat/lifecycle writes are excluded from this comparison and remain immediate. With N simultaneously moving players at 25 Hz, the modeled room-wide rate is 25N movement broadcasts and 25N(N−1) recipient deliveries per second; batching recipient serialization does not reduce the deliveries themselves.

Liveness updates checkpoint the full current player record when due. They must never advance the shared checkpoint clock after writing only `last_active_at`: doing that before movement starves position persistence. Movement applies its pose before touching activity. The server uses the same clock for rate limits and checkpoint timing.

## Legacy schema

Existing rooms may have `players(id, data, updated_at)` without `last_active_at`, and `room_state.gameInProgress` instead of a round JSON blob. `migrate()` adds `last_active_at` (default 0) and `_sql_schema_migrations`. Hydration treats `last_active_at = 0` as `updated_at`, and `gameInProgress=false` as `{ phase:'won' }` until a reset lands. Missing `world` rows receive a new `createWorldSpec()` persisted for the room lifetime.

## Metrics

Join and leave log structured `room metrics`: `connections`, `players`, `pendingEvents`, `messagesIn`, `broadcasts`, `lastSnapshotAt`, `reconnects`, `roundPhase`. The legacy `reconnects` field counts attached players restored during hydration; it is not a count of new browser socket reconnection attempts (those receive fresh identities). `/health` only proves Worker routing, not a live room.

## Physics benchmark counts

Recorded in `docs/verification/physics-benchmark.json` (CPU microbenchmark, not game FPS): 144 static buildings + ground + 8 compound rats = **153 bodies**, 900 ticks. Naive median **0.085 ms** / p95 **0.095 ms**; SAP median **0.067 ms** / p95 **0.074 ms**; max position difference **0**. Keep the current broadphase until a browser collision/frame-time comparison says otherwise.

Source scenery counts from the gameplay baseline, unchanged by this room work: 1008 road dashes, 144 buildings, 24 roads, about 432 lamp parts before roofs and players.

# Rat Detective architecture and code audit


> **Historical record — 08e8005 architecture audit.** Classified on 2026-09-08. Statements below describe that pass, including its then-current code, deployment, authorization and test counts. They are not present-day instructions or a current feature inventory. Use [the current reference](current-state.md) before acting. Preserve the measurements; do not restore obsolete behavior from this report.

Reviewed local `main` at `08e8005`. Source review only; application code is unchanged. Existing checks rerun: 19 tests pass, TypeScript passes, npm audit reports zero vulnerabilities. No new GPU/frame-time or multiplayer load benchmarks were run. Performance recommendations below are candidates supported by source structure, not measured speedups.

## Architectural assessment at the audited revision

The Three.js + Cannon + Worker/Durable Object stack fits this game. Keep it. The main weaknesses are ownership of state, inconsistent representations of the same action/world, and missing session recovery. A framework or ECS rewrite would add risk without fixing those problems by itself.

Current flow: `main.ts` creates rendering, physics, city, audio and DOM listeners; then wires NetworkManager callbacks directly to entities and HUD. NetworkManager also creates/removes entities, interpolates physics bodies and fires weapons. RatEntity owns health, physics, visuals, outlines, death animation, audio and appearance allocation. GameRoom handles connections, persistence, rules, broadcasts and alarms. Pure `gameState.ts`, shared message types, and resource disposal helpers are useful existing boundaries.

Suggested responsibilities:

| Piece | Responsibility after incremental extraction |
|---|---|
| Bootstrap / GameSession | Create dependencies; own connecting/playing/disconnected states; start and dispose the session |
| WorldSpec | Seed, generator version, dimensions and collision layout shared by every client; safe spawn queries |
| InputController / simulation loop | Input lifecycle and explicit simulation phases, preserving established tuning |
| Weapon logic | Resolve a shot once; emit its origin/direction; simulate projectiles separately from network transport |
| Rat state and presentation | Central damage/death/respawn transitions; model, glow and billboard derived from those transitions |
| Network transport | Decode messages, connection recovery, send scheduling; no direct weapon or rendering ownership |
| HUD / audio | Display session state and consume gameplay events; explicit resource cleanup |
| GameRoom / rules / storage | Room coordination, pure rule transitions, persistence policy and connection reconciliation |

Extract these around actual changes. Do not create every proposed class in a single refactor.

## Highest-priority findings

### 1. Players do not share the same collision world

[CityGenerator.ts:42](/home/tyler/Projects/rat-detective/src/world/CityGenerator.ts:42) independently randomizes each building's width, depth and height. [main.ts:178](/home/tyler/Projects/rat-detective/src/main.ts:178) generates the city before joining. The handshake has no world seed or layout version.

Building centers match, but walls and roofs can differ between players. Local collision and projectile results therefore need not agree across clients. Introduce a room-owned, versioned seed and a pure layout generator consumed by both rendering and collision construction. Use independent random streams for layout and decoration: window generation currently consumes randomness between buildings, so even a cosmetic edit could otherwise change collision geometry.

Preserve dimensions, materials, lighting and procedural style. This is a correctness change requiring two-client comparison, not a cosmetic cleanup.

### 2. Spawns can overlap buildings

[gameState.ts:10](/home/tyler/Projects/rat-detective/src/worker/gameState.ts:10) samples any x/z in a 100-by-100 square without consulting buildings. That region contains building footprints, including one centered at the origin.

Choose spawn positions against the shared layout with clearance for the rat's collider. Test joining, respawning and round resets across many seeds. Avoid simply changing the collision solver to push badly placed players out.

### 3. Player names are inserted as HTML

[main.ts:262](/home/tyler/Projects/rat-detective/src/main.ts:262) interpolates names into scoreboard `innerHTML`. Server-side name trimming and length limits do not make text safe for HTML insertion. This is an unsafe rendering boundary for player-controlled content.

Build scoreboard elements with DOM APIs and assign names through `textContent`, as the kill feed already does. This preserves appearance and is a small, high-priority fix. Review other UI sinks while extracting HUD code.

### 4. Joining and disconnecting have no recovery path

[main.ts:216](/home/tyler/Projects/rat-detective/src/main.ts:216) disables entry and hides the title before a server welcome. [NetworkManager.ts:96](/home/tyler/Projects/rat-detective/src/network/NetworkManager.ts:96) only logs connection failure/closure. A failed join strands the UI; a dropped connection leaves a locally running game that silently stops sending.

Use explicit connection states, a join timeout, visible retry status, and reconnect with a fresh authoritative snapshot. Reconcile identity and entity ownership on reconnect; merely calling `connect()` again is insufficient because the welcome callback currently refuses to recreate an existing rat.

### 5. Initial snapshots ignore existing health and death state

[NetworkManager.ts:253](/home/tyler/Projects/rat-detective/src/network/NetworkManager.ts:253) constructs every remote rat with default full health/alive state even though `PlayerData` includes HP. A late joiner can see an injured or dead player as healthy until a later event corrects it. The join response also omits the round's current victory phase.

Apply snapshot state through the same state transition boundary used for live events. Include round phase, relevant deadlines and winner data. Snapshot application should not replay historical hit/death sounds.

### 6. Death fades the outline permanently

[RatEntity.ts:362](/home/tyler/Projects/rat-detective/src/entities/RatEntity.ts:362) fades glow opacity to zero. [RatEntity.ts:485](/home/tyler/Projects/rat-detective/src/entities/RatEntity.ts:485) restores body state and transforms on respawn but never restores glow opacity. The alignment fix does not address this separate lifecycle bug.

Restore all alive presentation state in one place. Add a complete death-to-respawn check for opacity as well as geometry/transforms; current tests verify transforms and physics but miss this property.

### 7. Networked shots differ from actual local shots

[CheeseGun.ts:95](/home/tyler/Projects/rat-detective/src/weapons/CheeseGun.ts:95) resolves camera-ray convergence and nudges the projectile origin forward. [main.ts:375](/home/tyler/Projects/rat-detective/src/main.ts:375) sends the fallback distant target and a separately constructed origin instead. [NetworkManager.ts:151](/home/tyler/Projects/rat-detective/src/network/NetworkManager.ts:151) ignores the received origin and reconstructs the shot from the interpolated remote rat.

Resolve the shot once and return a descriptor containing the actual origin and direction. Replay that descriptor remotely, preserving local shot calculations. Add a two-client trajectory equivalence test. Separately, the remote-projectile pass-through branch at [CheeseGun.ts:191](/home/tyler/Projects/rat-detective/src/weapons/CheeseGun.ts:191) skips mesh synchronization for that update.

## Gameplay and simulation findings

**Aim selection includes visual-only geometry.** [CheeseGun.ts:99](/home/tyler/Projects/rat-detective/src/weapons/CheeseGun.ts:99) traverses the whole scene and only excludes descendants of the owner's main mesh. Its glow is a separate sibling; lamp cones and rooftop decoration are also selectable despite having no matching physics collider. These objects can influence aim convergence. Give aim targets an explicit layer/registry and preserve intended physical targets. Verify the visual result and aiming behavior before changing this filtering.

**Movement smoothing depends on render rate.** [RatController.ts:95](/home/tyler/Projects/rat-detective/src/player/RatController.ts:95) applies constant acceleration/deceleration factors once per rendered frame, and rotation does the same at line 115. Physics uses a fixed timestep, but controls do not. For the acceleration recurrence alone, reaching 90% of target speed takes about 0.234 seconds at 30 FPS versus 0.049 seconds at 144 FPS, excluding physics damping/collisions. Treat this as a gameplay-sensitive change: capture the preferred baseline first, then normalize smoothing or move controls into fixed simulation ticks.

**Grounded input has incomplete lifecycle handling.** `canJump` becomes true on ground contact and is only cleared when jumping, so walking off an edge retains jump permission. [main.ts:193](/home/tyler/Projects/rat-detective/src/main.ts:193) stores key states without clearing them on blur or pointer-lock loss. Missing a keyup can leave movement active. Clear input on focus/session transitions and make any intended coyote-time policy explicit rather than changing the feel accidentally.

**Update ordering mixes simulation and presentation.** [main.ts:402](/home/tyler/Projects/rat-detective/src/main.ts:402) steps physics before applying local controls, then updates projectiles before moving remote colliders to this frame's interpolated positions. Projectile queries therefore use the previous remote placement. Document the intended phase order, synchronize collision state before queries, and keep visual interpolation distinct where necessary. Preserve existing collision constants and headshot shapes while testing changes.

**Round UI uses an independent clock.** [main.ts:325](/home/tyler/Projects/rat-detective/src/main.ts:325) hides the respawn overlay after a local five-second interval instead of on confirmed respawn. Delayed events or a round-ending death can make that disagree with the server. Derive countdowns from server deadlines and use authoritative transitions to show/hide overlays.

## Server, networking and persistence

**Movement freshness is incorrectly treated as connection liveness.** [GameRoom.ts:135](/home/tyler/Projects/rat-detective/src/worker/GameRoom.ts:135) and line 174 delete players whose persisted timestamp is older than two minutes, without checking whether their socket is still attached. Background suspension can stop animation-driven movement updates. A later join or room hydration can then remove a still-connected player, and the client has no recovery path. Reconcile connection attachments and player records; separate last activity from session validity.

**Every movement event performs a database write and room-wide broadcast.** [GameRoom.ts:185](/home/tyler/Projects/rat-detective/src/worker/GameRoom.ts:185) persists full player JSON and forwards movement immediately. At the configured target ceiling of 25 updates/second, N players imply roughly 25N SQL writes and 25N(N−1) recipient deliveries per second, excluding other events. Actual send rate depends on rendering cadence. Broadcast serialization is also repeated per recipient at line 381.

First serialize once per broadcast and instrument actual traffic. Then consider coalesced movement snapshots, unchanged-state suppression with separate liveness, and a documented position-checkpoint policy. Keep critical score/death/round state durable. Any reduction in position persistence must explicitly handle room reconstruction; replacing durable data with memory alone would introduce recovery bugs.

**The server owns scores but trusts client combat and movement.** [GameRoom.ts:239](/home/tyler/Projects/rat-detective/src/worker/GameRoom.ts:239) accepts hit claims through bounded damage rules, without authoritative trajectory validation. [validation.ts](/home/tyler/Projects/rat-detective/src/worker/validation.ts) has useful size/type/finite-number checks, but malformed vector components are converted to defaults, and the server lacks application-level room/message-rate limits. Define the public multiplayer trust model and add defensive bounds/admission controls. Full server-authoritative simulation is a larger project requiring prediction and latency evaluation, not a quick cleanup.

**Protocol types do not validate received JSON.** [NetworkManager.ts:114](/home/tyler/Projects/rat-detective/src/network/NetworkManager.ts:114) casts parsed data to `ServerMessage`. Add a protocol version and boundary validation suitable for stale clients or malformed messages. Reject invalid state instead of partially applying it. Keep message parsing separate from scene mutation.

## Rendering, assets and resource ownership

**Repeated scenery is the clearest optimization candidate.** The current 12-by-12 layout creates exactly 1,008 individual road-dash meshes, 144 buildings, 24 road strips, and an expected 432 lamp-part meshes before roofs and players. These are source-derived scene counts, not measured visible draw calls. [CityGenerator.ts:261](/home/tyler/Projects/rat-detective/src/world/CityGenerator.ts:261) creates fresh geometry for every dash; lamps similarly recreate matching geometry/materials.

Instance or merge repeated road dashes and opaque lamp parts, preserving dimensions/materials/shadows. Use spatial batches where appropriate so batching does not destroy useful culling. Treat transparent cones separately because transparency ordering can affect appearance. Keep unique building windows initially; a texture atlas is a later, more invasive option. Measure renderer calls, frame-time percentiles and GPU memory before/after using the same seed/camera.

**Aim queries and physics broadphase merit profiling next.** Whole-scene aim raycasts traverse decoration, while [main.ts:155](/home/tyler/Projects/rat-detective/src/main.ts:155) uses NaiveBroadphase. Explicit target lists are useful for correctness and may reduce work. Benchmark a spatial broadphase before adopting it; do not claim an FPS gain from class replacement alone.

**Resource cleanup is good locally but lacks a session owner.** RatEntity, RatBillboard and CheeseGun now dispose owned resources carefully. CityGenerator has no disposal path, and bootstrap never tears down the renderer, city, listeners, music, timers and animation loop together. This is mainly a reconnect/restart prerequisite, not evidence of a new per-frame leak. Introduce one session teardown path and test repeated start/stop cycles.

**Audio lifetime and concurrency deserve a small dedicated module.** Shared entity audio state is module-global; asset loaders lack failure/retry handling. CheeseGun reuses a single sound and stops it before each shot, so local and remote shots interrupt each other. Preserve the current volume/assets; decide deliberately whether overlapping playback is desired. Avoid adding positional audio as an unrequested feel change.

**Model/HUD cleanup should stay modest.** RatModel is a readable procedural asset builder. Deduplicate shared material entries when caching hit-flash state in RatEntity. Centralize repeated health/countdown constants. Move HUD behavior out of bootstrap and static CSS out of the large HTML file when touching those areas. None of these justify redesigning the rat or visuals.

## Tests, development and deployment

Existing tests protect projectile constants, head/body damage, resource disposal, outline geometry, respawn physics and pure score rules. Keep them. However, seven worker tests cover pure rules and two HTTP routes; they do not exercise complete Durable Object WebSocket/alarm recovery. Client tests mock DOM/audio and cannot establish rendered visual parity.

Add meaningful coverage for: shared-world equality and safe spawns; injured/dead late joins; failed connection/reconnect; complete death/respawn visuals; actual transmitted shot descriptors; focus loss and selected frame-rate parity; room hydration and pending respawn/reset events; scoreboard text rendering. Add fixed-seed screenshot baselines for hats, turning, death and respawn.

[CI](/home/tyler/Projects/rat-detective/.github/workflows/ci.yml) runs tests/build/dependency audit but does not run the existing smoke scripts. Promote a local isolated-room integration smoke to CI. The WebSocket smoke checks message flow, not actual camera aiming/collision; browser smoke checks startup and captures a screenshot without comparing it to a baseline. Both are useful, but neither proves gameplay equivalence.

[package.json](/home/tyler/Projects/rat-detective/package.json) still exposes `vite preview`, which does not serve the game's Worker WebSocket backend. `npm run dev` builds once before Wrangler, so client edits require a rebuild; smoke defaults also target 8787 while normal dev uses 5173. Unify documented commands and server URLs, and add a full-stack watch workflow. Type-check test sources explicitly as well as application sources.

[wrangler.jsonc](/home/tyler/Projects/rat-detective/wrangler.jsonc) points the deployment command at the live custom domain despite a preview-like Worker name. Add a clearly separate staging environment and release verification. Existing observability logs errors, but useful room metrics—connections, message volume, snapshot age, pending events and reconnects—are absent. `/health` confirms routing/runtime response, not an end-to-end game session.

## Recommended implementation order

1. **Small correctness fixes:** safe scoreboard rendering; restore respawn glow; apply full snapshot health/death state; clear stuck input; make respawn HUD follow confirmed events; repair preview/dev documentation. Add focused regression coverage alongside each fix.
2. **Shared multiplayer truth:** versioned deterministic world and safe spawns; resolve/send identical shots; complete room snapshot; connection recovery and liveness reconciliation. Verify with two clients on the same room and seed.
3. **Incremental ownership cleanup:** extract GameSession, HUD, transport boundaries and explicit entity transitions while keeping tuning intact. Add one complete teardown path.
4. **Measured performance work:** establish a fixed scenario, then batch repeated scenery, reduce repeated serialization, evaluate movement persistence/broadcast cadence and profile collision queries. Report measurements rather than assumed speedups.
5. **Gameplay-sensitive consistency:** normalize frame-rate dependence and simulation ordering behind recorded behavior comparisons. Evaluate stronger server authority separately. Retain the shooting speed, gravity, bounce, hit shapes, camera behavior and visual palette unless a specifically reviewed correctness change requires otherwise.

Each stage should be independently reviewable and reversible. The immediate priority is correctness and consistent shared state; architecture extraction should make those fixes easier to maintain.

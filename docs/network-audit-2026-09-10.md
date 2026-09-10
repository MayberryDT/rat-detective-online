# Rat Detective networking and scaling audit — September 10, 2026

Historical audit: subsequent implementation and verification are in [the network-fixes receipt](verification/network-fixes-2026-09-10.md). Findings and measurements below describe the pre-fix source; current source is protocol 6 and has not been deployed.

There are worthwhile optimizations available without changing the game. The first work should address incomplete congestion protection, connection cleanup, avoidable persistence/serialization, and differences between the tested preview and ordinary application configuration. Increasing the player limit is not the first fix.

This is an audit, not an implementation or release. Application source, gameplay tuning, assets, services and deployments are unchanged. The audit started from a clean checkout at `49dd64a1b4ac3f04900e2d1cd6d82e25471b84fe`. The report and its documentation-map entry are the only tracked changes. Audit probes and results are under `output/network-audit-2026-09-10/`.

**Coverage and evidence**

The review traced the full multiplayer path: Worker routing, matchmaking and admission; WebSocket negotiation, ingress validation and rate limits; authoritative room updates, bots and physics; player and assignment persistence, alarms and recovery; movement batching, snapshot encoding, acknowledgement and fan-out; client decoding, reconciliation, interpolation, UI application and reconnects; preview relays, diagnostics and capacity tooling. Adjacent simulation and rendering costs were inspected where they can cause or resemble network stalls. This is not a claim that every game branch has been formally verified, or that a new human-player capacity has been measured.

Evidence labels below distinguish reproduced behavior from source-based optimization candidates. Mocked socket/storage probes execute the existing GameRoom methods with a minimal DurableObject constructor shim; they do not emulate Cloudflare scheduling, output gates or transport memory. Codec measurements execute the existing codec in Node. No live load, browser input automation, production requests or deployments were performed.

The existing foundation is worth preserving:

- One authoritative GameRoom per match, with automatic room allocation already present in the current source.
- Fixed 60 Hz simulation, approximately 30 Hz chaos snapshots, bounded catch-up, shared bot navigation, static collision/ray shortlisting and bounded object counts.
- Negotiated compact-v2, shared preparation, per-connection sent baselines, complete shot membership, periodic keyframes and validation before decoder baseline commit.
- Stationary-pose suppression, timestamped movement batches, bounded human and AI interpolation histories and explicit lifecycle resets.
- Atomic assignment/result recovery, immediate critical persistence, bounded ordinary checkpoints and server-owned public AI.

Current source admission and historical production are different: the automatic match path can replace backfill bots as humans join, up to the 24-player ceiling. Fixed persistent-roster rooms retain eleven reserved bot slots. This audit does not change either policy or assert that the current source is the public deployment.

**Prioritized findings**

P1 means address before a larger-player release or capacity claim. P2 means a concrete improvement or bounded edge case to handle in the optimization pass. Priority is about scaling/reliability, not a claim of an observed production outage.

| ID | Priority | Finding | Evidence | Gameplay-preserving direction |
| --- | --- | --- | --- | --- |
| N1 | P1 | Congestion protection covers chaos snapshots only | Reproduced | Bound replaceable movement and reliable event backlog per connection |
| N2 | P1 | One socket send failure can interrupt a room broadcast | Reproduced with injected failure | Isolate transport errors from simulation and other recipients |
| N3 | P2 | Connection rate-limit buckets survive disconnect | Reproduced | Clear connection and player namespaces on every close/error path |
| N4 | P1 | Invalid ingress has no aggregate rejection budget | Reproduced | Cheap envelope guard, bounded ingress and repeated-invalid handling |
| N5 | P1 | Four-frame source window differs from eight-frame previews | Source plus timing reproduction | Make delivery configuration explicit and validate the exact release setting |
| N6 | P2 | Compact encoding still repeats significant work per recipient | Measured locally | Reuse immutable encoding work and byte counts while preserving baselines |
| N7 | P2 | Combat fragments movement batches; pose format remains verbose | Source plus representation measurement | Reduce redundant batch work with exact event ordering and lossless encoding |
| N8 | P2 | Unchanged room setup performs repeated writes and alarm scheduling | Reproduced | Make setup/rebalance idempotent and eliminate identical writes |
| N9 | P2 | Valid busy legacy state exceeds the client envelope | Reproduced | Enforce a compatible, bounded wire contract without dropping game objects |
| N10 | P2 | Reconnects have deterministic backoff and reset too early | Source | Add bounded jitter and reset failure history after stable play |
| N11 | P2 | Matchmaking serializes join work across each pool | Source | Bound admission work and optimize directory queries/setup |
| N12 | P1 | Existing evidence does not certify many human connections | Source and historical receipts | Test full-feed humans, exact configuration and the entire network-to-frame path |

**N1 — Extend congestion protection beyond chaos**

Locations: [ChaosDelivery](../src/worker/ChaosDelivery.ts), lines 4–36; [GameRoom](../src/worker/GameRoom.ts), lines 1129–1186; [NetworkManager](../src/network/NetworkManager.ts), lines 214–231.

The four-frame window stops additional compact chaos frames while acknowledgements are outstanding. `playersMoved`, `playerShot`, damage, rosters and other messages still call `ws.send` through the independent broadcast path. Movement coalescing exists only until a room flush; it does not coalesce movement already enqueued for a slow socket. Legacy chaos has no application acknowledgement window.

The isolated reproduction stopped chaos at four frames, then delivered **40 movement batches and 40 shot events** to that same unacknowledging socket. This proves a bypass of application flow control; it does not measure an unlimited physical socket queue. The five-second chaos timeout eventually closes a non-acknowledging compact client, but partially progressing and legacy clients still need bounded treatment.

Use per-connection delivery budgets that cover both state and reliable events. Keep latest unsent movement by actor, with explicit ordering barriers for shots, corrections, deaths and roster changes. Preserve authoritative events; an exceeded reliable-event budget should resynchronize the affected connection rather than silently lose damage or launches. Do not simply pause all movement behind the current chaos window, which would add visible latency. On the browser, also bound continued non-movement sends during a clogged uplink; currently only movement checks `bufferedAmount`.

Verification: withhold and delay acknowledgements while sending movement/combat, prove bounded application queues and isolation of a healthy observer, then verify exact lifecycle/event order and recovery. Use the supported Worker API and application acknowledgements; do not assume the Worker exposes the browser's `bufferedAmount` property.

**N2 — Keep socket exceptions out of game logic**

Locations: [GameRoom](../src/worker/GameRoom.ts), lines 737–790 and 1146–1186.

`sendChaos` catches errors, but `send` and `broadcastSerialized` do not. An injected `send()` failure on the first recipient propagated to the caller and prevented a later healthy recipient from receiving the broadcast. A ready-state check does not substitute for exception isolation.

There is also a lifecycle consequence to guard: `handleHit` broadcasts damage before it inserts the eventual respawn event. A transport exception can interrupt that method between game-state mutation and its remaining work. This is a source-derived failure path, not a reproduced Cloudflare incident.

Centralize a safe send operation, isolate the failed connection, and continue serving other recipients. Make durable lifecycle bookkeeping independent of successful delivery, while keeping the existing externally visible event order. Defer cleanup if necessary to avoid recursively broadcasting a departure from inside a failing broadcast loop.

Verification: inject failures during damage, death, respawn, victory and roster broadcasts; assert the healthy client sees the correct sequence and pending events remain complete and idempotent.

**N3 — Clean up connection-scoped rate-limit records**

Locations: [GameRoom](../src/worker/GameRoom.ts), lines 387–400 and 886–914; [RateLimiter](../src/worker/validation.ts), lines 26–46.

Join and ping buckets use `connectionId`; disconnect cleanup clears only `playerId`. A socket that never joins does not even reach player cleanup. The limiter replaces an expired bucket only when that same key is used again; it has no sweep of old connection IDs.

The reproduction closed **1,000 unjoined mock sockets and retained 2,000 join/ping buckets**. This accumulates for the lifetime of the room instance. It also makes the current prefix-scanning `clear()` progressively more expensive.

Clear the connection namespace on close and error regardless of join state. Retain player cleanup, including repeat joins. A direct bucket-per-connection structure or bounded expiry cleanup can avoid scanning unrelated historical entries.

Verification: repeated joined/unjoined connect-close-error cycles leave only live connections' buckets; legitimate rate limits remain unchanged.

**N4 — Reject abusive or broken ingress cheaply**

Locations: [messageValidation](../src/shared/messageValidation.ts), lines 231–238 and 282–286; [GameRoom](../src/worker/GameRoom.ts), lines 378–445.

Every invalid message produces an error response without an aggregate connection budget or repeated-invalid cutoff. Per-type limits run after parsing, and malformed or pre-join game messages avoid most of them. The reproduction sent **100 invalid messages at one timestamp and received 100 errors**, with the socket remaining open.

The byte guard also UTF-8 encodes the entire incoming string before applying the cheap character-length rejection in `parseRaw`. A **1 MiB** invalid string caused a **1 MiB encoding allocation** before rejection. This is preventable work inside the room's event loop.

Reject obviously oversized strings before encoding, keep the exact UTF-8 check for shorter strings, and introduce an aggregate ingress/invalid-message budget. Allow the current legitimate movement, shot and acknowledgement rates, including normal delivery bursts. Repeated malformed traffic should not cause unlimited error replies. Preserve all existing field, finite-number and authority checks.

Verification: malformed bursts and oversized input stay bounded; normal gameplay, acknowledgement bursts, join retries and diagnostic limits still work. This is resource protection, not a proposal to change movement authority or introduce a new competitive anti-cheat system.

**N5 — Reconcile the tested snapshot window with source**

Locations: [ChaosDelivery](../src/worker/ChaosDelivery.ts), line 3; [capacity fixture](../scripts/lib/capacity-fixture.mjs), lines 12–38; [preview instructions](tooling.md); [current preview record](current-state.md).

Main source uses `MAX_CHAOS_IN_FLIGHT=4`; the accepted private preview instructions use `--window=8`, which patches the copied Worker. Passing that preview does not establish identical network behavior for an ordinary build from main.

With the real four-frame delivery class and simulated acknowledgement delay, the probe produced:

| Send-to-ack delay | Delivered snapshots/sec from a 30 Hz offer schedule |
| --- | ---: |
| 50 ms | 30.0 |
| 100 ms | 30.0 |
| 150 ms | 24.0 |
| 200 ms | 19.9 |
| 300 ms | 13.2 |

This is a deterministic flow-control ceiling, not a real network measurement. Acknowledgement delay includes transport plus client decode/application time. Four slots can sustain 30 Hz only while the effective round trip is roughly below 133 ms, before scheduling effects.

Make the intended release configuration explicit and test it. A bounded, byte-aware window informed by acknowledgement latency is a candidate; copying eight everywhere without queue measurements is not a complete congestion fix. Preserve simulation rate and the accepted interpolation settings.

Verification: compare windows under representative RTT, jitter, stalled consumers, maximum packets and receiver work. Confirm queue bounds, snapshot cadence, age, memory and current client reconstruction.

**N6 — Reduce per-recipient codec work**

Locations: [chaosWire](../src/shared/chaosWire.ts), lines 22–69 and 81–127; [GameRoom](../src/worker/GameRoom.ts), lines 984–998 and 1129–1142.

`prepareChaos` already runs once per room tick. Each accepting connection still walks all shots, allocates motion-delta arrays/strings and membership structures, serializes pressure/impacts, constructs the payload and UTF-8 encodes it for the size guard. `sendChaos` then UTF-8 encodes the same payload again just to count bytes.

Local Node 26.8.1 measurements, 256 changing synthetic shots, 30 warmup ticks and 150 measured ticks per row:

| Full-feed connections | Median preparation + delivery encoding per tick | p95 |
| --- | ---: | ---: |
| 1 | 0.161 ms | 0.379 ms |
| 13 | 1.087 ms | 1.881 ms |
| 24 | 1.988 ms | 2.643 ms |
| 50 | 4.083 ms | 4.449 ms |

These measurements include immediate synthetic ACK handling and byte counting, exclude network/physics/storage, and are not Cloudflare CPU estimates or improvement claims. The final run followed completion of this audit's test processes; an initial sample is retained separately.

First return the validated byte length with the encoded frame and reuse a TextEncoder. Share immutable pressure/cosmetic encoding when recipients' queued events match. Then evaluate reusable delta scratch storage and shared encodings for recipients with identical delivered baselines. Preserve independent baselines when ACK windows diverge, reconnects occur or queued cues differ. Do not replace all encoders with one shared stateful encoder.

Client decode measured 0.192 ms median / 0.364 ms p95 in a separate 270-frame local sample. Its validation and detached baseline are valuable; reduce allocation only with tests proving malformed data cannot advance a baseline and consumers cannot mutate future decoded state.

**N7 — Reduce movement overhead while keeping causal order**

Locations: [GameRoom](../src/worker/GameRoom.ts), lines 1152–1184; [ServerBotController](../src/worker/ServerBotController.ts), lines 204–218; [GameSession](../src/session/GameSession.ts), lines 390–398; [NetworkManager](../src/network/NetworkManager.ts), lines 219–225.

Every non-movement broadcast flushes all pending poses. A bot sends its pose before firing, so busy combat can turn nominal tick batching into many small event-triggered batches. Every movement also enumerates sockets repeatedly to discover batch/legacy audiences. Full-field JSON repeats actor IDs, field names and both quaternions.

Cache audience membership/capabilities with correct connection and hydration invalidation. Review which event barriers require which pending poses; any change must retain movement-before-shot and lifecycle order. A negotiated tuple/dictionary movement codec can preserve the exact numeric values. One representative synthetic sample was **233 bytes as the current object versus 144 bytes as a proposed tuple** (38% smaller); this is an example, not measured total traffic savings.

The local sender also stringifies movement to detect changes, then NetworkManager stringifies it again to send. After 50 ms stationary time, unchanged attempts can repeat each display frame until the one-second heartbeat. Numeric change tracking or a validated pre-serialized send path can remove this work while keeping the same send schedule, stop behavior and heartbeat.

Verification: identical decoded poses and timestamps, mixed clients, stop/start, local correction, launch, death/reset and shot order. Avoid lossy coordinate quantization, lower update rates or new interpolation delay as incidental optimizations.

**N8 — Remove no-op writes and repeated lifecycle work**

Locations: [GameRoom](../src/worker/GameRoom.ts), lines 192–201, 225–274, 592–637, 979–983 and 1069–1075; [Worker status route](../src/worker/index.ts), lines 49–52.

For an unchanged active match room, `enableMatchmaking()` calls `ensurePersistentBots()`, which rebalances, then rebalances again. Both passes write the same refill and roster values. The isolated method reproduction counted **four room-state writes and two alarm-scheduling calls** for one unchanged setup. Matchmaking attempts and `/status` call this setup path.

Make initialization and rebalance idempotent: write roster/refill state only on a transition and avoid the duplicate pass. Keep the refill deadline and durable bot roster correct through eviction. The status read should not repeatedly perform unchanged setup work.

Additional small opportunities: `handleJoin` sends the roster in both `welcome` and `currentPlayers`, while the current GameSession ignores `currentPlayers`; batch intermediate scoreboard rebuilds during bot roster replacement if no consumer needs those intermediate tables. Both need compatibility/order tests.

Do not trade away the one-second assignment/chaos checkpoint or immediate critical persistence. Cloudflare automatically coordinates pending writes and outgoing work with output gates; redundant JavaScript/SQL work is worth removing, but counting SQL statements is not a measurement of physical disk commits. Earlier private sparse-checkpoint trials did not isolate a universal stall cause. See [Cloudflare's gate guidance](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/#understand-how-input-and-output-gates-work) and the [dated capacity receipt](verification/ai-delivery-and-rigid-batching-2026-09-08.md).

**N9 — Make packet budgets agree for every supported transport**

Locations: [serializeServerMessage](../src/worker/serializeServerMessage.ts); [GameRoom](../src/worker/GameRoom.ts), lines 992 and 1137–1139; [messageValidation](../src/shared/messageValidation.ts), lines 379–383.

The compact encoder enforces the 65,536-byte limit before sending. The legacy serializer does not. A schema-valid synthetic state with **256 shots, 16 corpses and 64 impacts** serialized to **71,010 legacy bytes**, which the client rejected. The same state's compact keyframe was **49,275 bytes** and decoded successfully. This is a legal state composition test, not a recorded match or a claim that typical packets are oversized.

For context, the simpler 256-shot fixture was 56,372 legacy bytes, 34,638 compact-keyframe bytes and 6,695 compact steady-state bytes. Compact support is already doing substantial work.

Establish and test the maximum envelope for every supported protocol mode. A compatible solution can negotiate the bounded codec before joining or introduce bounded reconstructable legacy chunks; merely dropping live projectiles, corpses or objective state to fit is unacceptable. Add server-side size enforcement for welcome, movement and other messages too. Closing a client after discovering an oversize frame is a safety fallback, not a gameplay-preserving delivery solution.

Before any 75/100-rat experiment, audit coupled limits: possession validation currently allows only 64 entries, launch events are capped at 24, and the batch/score formats cap at 100. Raising `MAX_PLAYERS` alone is not sufficient. These are future-capacity constraints, not a defect at the current 24-player ceiling.

**N10 — Avoid synchronized reconnect load**

Location: [NetworkManager](../src/network/NetworkManager.ts), lines 155–165 and 202–211.

Retry delays are the same deterministic 500/1000/2000/4000/8000 ms ladder for every client. A shared interruption can synchronize their reconnects through the same matchmaking queue. Every welcome immediately resets retries, so a connection that repeatedly welcomes then fails can remain on the first retry delay.

Add bounded jitter and clear failure history after a stable playing interval. Preserve immediate manual retry, atomic welcome reconciliation, the current new-identity contract and cleanup of obsolete connection generations. Do not silently promise score-preserving reconnect identities; that would be a separate behavior change.

Verification: simulated many-client reconnects distribute attempts, short-lived welcome/failure loops back off, and manual retry/dispose cancels every old timer and callback.

**N11 — Scale admission separately from active matches**

Location: [Matchmaker](../src/worker/Matchmaker.ts), lines 12–20 and 41–70.

Active matches already have independent GameRoom instances. Within one matchmaking pool, all joins wait behind a promise queue, and each attempt may sequentially probe up to 16 candidates, plus a preferred room. Every probe performs setup RPC and room fetch. One slow attempt can delay unrelated joins in that pool. `LIMIT 16` bounds returned candidates, not the database scan/sort: the table has only its primary-key index, while selection filters by `checked` and orders by `slots` and `rowid`.

Start with N8, then measure join queue time and room RPC time, inspect SQLite query plans and add suitable availability indexing. Bound queued admission work and use deadlines/leases that cannot leave late successful reservations orphaned. Keep GameRoom as the final admission authority; do not remove serialization without a replacement for safe slot reservation. Pool partitioning is a later option if measured demand warrants it, not a necessary game rewrite.

Across-room growth fits the existing architecture. Enlarging one match multiplies pose fan-out and cannot be made equivalent to distributing the same population across independent rooms. Cloudflare describes each Durable Object as a single-threaded coordination unit and recommends choosing that unit deliberately. See [Cloudflare's architecture guidance](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/#model-your-durable-objects-around-your-atom-of-coordination).

**N12 — Measure the exact workload and the entire delivery path**

Locations: [RoomDiagnostics](../src/worker/RoomDiagnostics.ts); [NetworkManager](../src/network/NetworkManager.ts), lines 129–183; [GameSession](../src/session/GameSession.ts), lines 310–319 and 407–443; [hosted runner](../scripts/benchmark-hosted.mjs), lines 19–20; [capacity clients](../scripts/lib/capacity-clients.mjs), lines 126–159.

The historical 50-rat pass was **49 server bots plus one receiving observer**, not 50 human sockets. Bots cost server AI/physics; human clients add uplink movement, acknowledgements, separate encoders, fan-out and their own decode/render budgets. The human and AI interpolation algorithms also differ. Earlier lower-count failures and shared delivery pauses remain relevant. See the [full dated receipt](verification/ai-delivery-and-rigid-batching-2026-09-08.md).

At the intended healthy cadence, a continuously moving human can generate approximately **20 movement + 30 ACK messages/sec**, before shots and heartbeat. Twenty-four such clients are approximately 1,200 incoming application messages/sec. This is arithmetic from source schedules, not a service limit or measured sustainable throughput. ACK piggybacking/cumulative batching may eventually help, but delaying ACKs can worsen N5 and must be evaluated together.

Server byte telemetry currently counts chaos payloads, not complete movement/control traffic. Coalescing/window occupancy is primarily exposed through a patched private fixture. Client `parseMs` stops before `onMessage` applies state, yet ACKs occur after that work. Applying chaos can create corpse/case geometry, update effects/audio and redraw an open scoreboard on the message callback. Those costs are not attributed by the parser metric or the next animation frame's phase timers.

Add bounded counters for bytes/messages by type, ACK latency and occupancy, coalesced state, queue ages, reconnect/close reasons, join latency, callback application time and rendered state age. Keep source-clock, receiver-clock and CPU measurements explicitly separate. The hosted runner defaults to `quality=arrival`; release acceptance should explicitly require `--quality=both` plus complete rosters, stable protocol and lifecycle recovery.

**Additional candidates after the immediate fixes**

These are source-based opportunities, not measured bottlenecks or authorized gameplay changes:

- [SpatialRayQuery.refresh](../src/shared/SpatialRayQuery.ts) scans static bodies and rebuilds traversal ranks in both physics worlds each simulation step. Investigate immutable scenery metadata and event-driven invalidation while preserving exact eligible-hit ordering and edited-fixture support.
- [ChaosSimulation.placeCaseAtSpawn](../src/shared/ChaosSimulation.ts), lines 119–151, repeatedly validates static floor/wall clearance for the same spawn sites, including each extra case. Cache only the world-dependent clear-site set; apply live case separation and player exclusion freshly, keeping selection order and randomness identical.
- [ServerBotController](../src/worker/ServerBotController.ts), lines 171–179, scans the contact list per bot to find grounding. A per-step grounded-body set can reuse the same contact-normal predicate without changing movement or recovery.
- [GameRoom.replaceRoundBots](../src/worker/GameRoom.ts), lines 335–347, disposes and rebuilds the bot world/navigation for unchanged city geometry. Profile round-transition initialization before considering reuse; fresh names, reset brains, collision cleanup and the accepted round pause remain mandatory.
- [MatchScoreboard](../src/ui/MatchScoreboard.ts), lines 91–150, sorts and builds a display signature for every chaos update while open, and recreates all rows whenever one displayed value changes. Keyed rows and dirty display fields can preserve the exact table and scroll behavior with less message-callback work. It already skips rendering while closed.
- [ChaosView.apply](../src/prototype/ChaosView.ts), lines 135–164, creates new corpse and extra-case visuals synchronously. Profile pooling/prewarming and batched DOM/effect preparation before changing it. Preserve immediate ownership, launch, impact/audio and death transitions; do not simply discard intermediate received frames.

Physics optimizations require identical seeded state, collision and attribution comparisons. They must retain ball speed 175, gravity −25, lifetime 5, restitution 0.9, all 256 shot slots, eight Tampering cases and the existing 60 Hz simulation. Visual improvements must retain lighting, silhouettes, camera, muzzle/case anchors and the current local responsiveness.

**Recommended implementation order**

1. Fix N2–N4 and the repeated work in N8; add focused failure/churn tests and bounded observability from N12. Reuse codec byte counts and remove duplicate movement serialization as small independent changes.
2. Resolve N1 and N5 together using the intended release configuration. Verify ordinary and adverse connections before tuning any larger window.
3. Implement measured N6/N7 improvements with round-trip equality and causal event-order tests. Address the legacy budget and reconnect behavior in the same transport verification matrix.
4. Run a staged private full-feed human workload at 2, 8, 12 and 24 connections. Include actual firing cadence, all incident families, maximum live objects, deaths, respawns, assignment wins/resets, joins/leaves, reconnects and a long churn/soak phase. Add paired observers and asymmetric slow consumers with controlled latency/jitter. Keep AI-load and client-render measurements separate.
5. Verify multiple simultaneous rooms and burst admissions. Consider larger single-room experiments only after the current ceiling passes repeatedly and the coupled wire/event limits have been addressed. Human playtesting remains the owner's final check of unchanged feel.

No bandwidth saving should come from fewer visible cases/balls, altered projectile trajectories, slower simulation, reduced combat frequency, distant-object omission, a new camera or additional interpolation delay. Lossless representation, redundant-work removal and bounded transport recovery are the appropriate first tools.

**Checks completed**

- Entire Worker suite: **107 tests passed**, 18 files, including admission, persistence, assignments, mixed transports and ordering.
- Focused client networking, human/AI interpolation, chaos presentation, remotes and session/reconnect cleanup: **73 tests passed**, eight files.
- All script tests: **24 passed**, including benchmark bookkeeping, delay ordering and preview relay bounds.
- Application and test typecheck passed.
- Audit reproductions passed, including decoder equality and state-envelope checks. **204 distinct existing tests** passed; the earlier 47-test Worker subset is included in the later full Worker count.
- No application build was needed for this audit; no new build, browser gameplay test, live capacity run, commit or deployment was performed.

Reproduce the local audit probes with `node output/network-audit-2026-09-10/reproduce.mjs`. The script bundles the current source into an ignored audit artifact and records relevant source hashes. [Results](../output/network-audit-2026-09-10/results.json), [probe source](../output/network-audit-2026-09-10/reproduce.mjs), [Worker log](../output/network-audit-2026-09-10/worker-tests.log), [client log](../output/network-audit-2026-09-10/client-tests.log), [script log](../output/network-audit-2026-09-10/script-tests.log) and [typecheck log](../output/network-audit-2026-09-10/typecheck.log) are local artifacts, not required repository dependencies.

Prior context was retrieved from GBrain, including `brain:sessions/2026/09/rat-detective-network-smoothness-pass`. Its historical service details are superseded by current repository documentation. Other evidence used here is linked directly to current source or dated verification reports; prior successful probes are not treated as present-day capacity certification.

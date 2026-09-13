# Multiplayer authority and recovery

Updated **2026-09-10** for private authoritative muzzle delivery. The old proposal to add server collision authority has already been implemented for the production version-2 world. Do not restore the old client-hit path there. New local behavior is distinct from the dated production release.

## Authority by system

| System | Current owner |
| --- | --- |
| Membership, HP, combat statistics, spawns, death/respawn and rounds | GameRoom / shared game rules |
| Assignment selection, progress, case-kill credit and final result | GameRoom rotation plus ChaosSimulation / AssignmentRules |
| Version-2 projectiles, collision hits, cases, corpse missiles, incidents and launch events | Server ChaosSimulation |
| Public AI movement and firing decisions | ServerBotController plus shared brain/navigation |
| Human movement | Local Cannon physics, sent to server; server-time displacement and world bounds, not full server movement simulation |
| Immediate local shot/animation feedback | Client; resolved origin/direction sent to server |
| Remote poses and chaos rendering | Client interpolation of authoritative snapshots |
| Legacy version-1 hits | Client reports still accepted through bounded rules |

GameRoom rejects external `hit` reports in version 2. Its simulation's `onHit` callback invokes the authoritative scoring path. Human poses must remain inside finite world bounds and a server-time displacement envelope; invalid poses retain the previous authoritative position and receive `playerCorrected`. Authored city collision remains in the human and hosted-bot Cannon controllers. A September 13 production correction removed the network layer's redundant static path ray after it caused valid motion snap-backs and movement-linked room cost, especially at Hot Pursuit speed. The remaining checks close direct teleports without claiming wall-crossing prevention or full server-side character simulation. Shot origin/direction plausibility, duplicate shot IDs, capacity and rate checks remain important, but do not prove every client movement was legitimate. There is no full competitive anti-cheat guarantee or implemented historical rewind/lag-compensation system.

## Shared truth and attribution

Every participant uses the room's WorldSpec and the same versioned collision layout. Render decoration must not silently alter collision or aim targets. The muzzle descriptor is resolved once; do not reconstruct remote shots from an interpolated rat or camera.

Private protocol 8 includes the actual ball IDs and resolved velocities in accepted `playerShot` events sent only to the firing player, using the simulation clock. Observers keep production shot packets. The [responsive-shooting follow-up](verification/responsive-shooting-2026-09-10.md) starts the owner's single real-ID ball immediately after input is sent, using the same UUID-seeded volley function as the server. Authority chooses the active incident, validates the shot and resolves damage, physical interactions, lifecycle and final removal. Local collision sweeps are presentation only. Client-side hit prediction never sends damage or speculative impact cues. Authoritative samples reconcile the existing ball, including incident boundary changes, with bounded replay and no second mesh or muzzle rewind. Prior shared playback and confirmation-only fallback: [physics playback receipt](verification/physics-playback-2026-09-10.md).

Balls retain owners, death bursts inherit killer credit, and redirecting physical missiles can transfer credit through their own simulation rules. Assignment rooms count actual kills and end only on objective completion; the old 2× carrier score applies only to the retained legacy path. There is no self-damage. Teams are not currently implemented. Extra case expiry clears ownership, physics and visuals together.

Excessive Force case-kill credit is awarded at attributed kill resolution only when the living killer holds the legitimate primary case. Each kill awards exactly one objective point, independent of the old multiplier. Personal points survive death/disarm and are transmitted and persisted independently from total kills. Retired Misfiled delivery cannot win. Once closed, the result cannot change. Chain requires a living carrier inside the entire current landmark volume. Each carried visit awards one personal delivery point. First to three wins. All six eligible landmarks are shuffled and used once per cycle, then reshuffled without repeating the last immediately if the match continues. The carrier keeps the case after each delivery. Closing Time counts 120 seconds of cumulative simulated living held time, divided at briefing and Evidence Tampering boundaries. Clients display received progress; they do not award wins or run a winning timer. Stale reset deadlines cannot interrupt an active assignment.

## Recovery contract

Attached sockets and persistent bots are distinct liveness sources. Reconnection applies an atomic welcome snapshot, clears old entities/projectiles, and uses the new authoritative identity. Unattached human records can be pruned; bots remain alive without sockets. Active roster count/names survive eviction and change only at round creation/reset.

Position checkpoints may lag in-memory motion by up to the checkpoint interval. HP, scores and lifecycle changes are persisted immediately. Pending respawn/reset events and the bot heartbeat share the Durable Object alarm. A victory clears old respawn deadlines so rats do not return during the winner screen.

The assignment, physical chaos state, round and remaining shuffle bag share a synchronous SQLite checkpoint, normally each second and on objective/contact lifecycle changes. The final result and one reset event are written atomically before broadcasting the winner. Eviction restores current personal scores and landmark order without rerolling or crediting elapsed offline possession. Storage-only migration restarts an obsolete shared-stamp Chain; other compatible progress remains. Timer/position recovery is bounded by the latest checkpoint, not a guarantee of retaining every uncheckpointed millisecond. Ordinary and compact snapshots, welcome, gameWon and gameReset carry validated assignment state. Production wire protocol **7** and private follow-up protocol **8** each require a matching client and Worker; these are separate from world version 2 and the existing compact-v1/compact-v2 codec names.

## Verification boundaries

Shared simulation and protocol tests protect collision, attribution, lifecycle and recovery invariants. They are not a measurement of human latency or hit feel. If authority, interpolation or rewind changes, test identical seeded scenarios and report confirmation delay, duplicate damage prevention, snapshot convergence and CPU cost separately. Preserve immediate controls and ordinary ball physics. See [operations](server-operations.md), [diagnostics](playtest-diagnostics.md) and [current state](current-state.md).

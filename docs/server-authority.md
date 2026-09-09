# Multiplayer authority and recovery

Current as of **2026-09-08**. The old proposal to add server collision authority has already been implemented for the production version-2 world. Do not restore the old client-hit path there.

## Authority by system

| System | Current owner |
| --- | --- |
| Membership, HP, scoring, kill bonus, spawns, death/respawn and rounds | GameRoom / shared game rules |
| Version-2 projectiles, collision hits, cases, corpse missiles, incidents and launch events | Server ChaosSimulation |
| Public AI movement and firing decisions | ServerBotController plus shared brain/navigation |
| Human movement | Local physics, sent to server; finite envelope/clamp checks, not full server movement simulation |
| Immediate local shot/animation feedback | Client; resolved origin/direction sent to server |
| Remote poses and chaos rendering | Client interpolation of authoritative snapshots |
| Legacy version-1 hits | Client reports still accepted through bounded rules |

GameRoom rejects external `hit` reports in version 2. Its simulation's `onHit` callback invokes the authoritative scoring path. Shot origin/direction plausibility, duplicate shot IDs, capacity and rate checks remain important, but do not prove a human's client movement was legitimate. There is no full competitive anti-cheat guarantee or implemented historical rewind/lag-compensation system.

## Shared truth and attribution

Every participant uses the room's WorldSpec and the same versioned collision layout. Render decoration must not silently alter collision or aim targets. The muzzle descriptor is resolved once; do not reconstruct remote shots from an interpolated rat or camera.

Balls retain owners, death bursts inherit killer credit, and redirecting physical missiles can transfer credit through their own simulation rules. A case holder gets two credited kills per kill; damage is unchanged. There is no self-damage. Teams are not currently implemented. Extra case expiry must clear ownership, physics, visuals and bonuses together.

## Recovery contract

Attached sockets and persistent bots are distinct liveness sources. Reconnection applies an atomic welcome snapshot, clears old entities/projectiles, and uses the new authoritative identity. Unattached human records can be pruned; bots remain alive without sockets. Active roster count/names survive eviction and change only at round creation/reset.

Position checkpoints may lag in-memory motion by up to the checkpoint interval. HP, scores and lifecycle changes are persisted immediately. Pending respawn/reset events and the bot heartbeat share the Durable Object alarm. A victory clears old respawn deadlines so rats do not return during the winner screen.

## Verification boundaries

Shared simulation and protocol tests protect collision, attribution, lifecycle and recovery invariants. They are not a measurement of human latency or hit feel. If authority, interpolation or rewind changes, test identical seeded scenarios and report confirmation delay, duplicate damage prevention, snapshot convergence and CPU cost separately. Preserve immediate controls and ordinary ball physics. See [operations](server-operations.md), [diagnostics](playtest-diagnostics.md) and [current state](current-state.md).

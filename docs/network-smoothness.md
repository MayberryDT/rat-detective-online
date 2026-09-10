# Network and movement smoothness

Current guidance, **2026-09-10**. The [September 7 investigation](verification/network-history-2026-09-07.md) contains dated measurements and a local mitigation that subsequently failed.

September 10 source follow-up: protocol 6 bounds the entire joined connection, shares immutable snapshot encoding work, uses lossless movement tuples and applies a shot's pending pose from the same packet before displaying the shot. Cumulative delivery ACKs piggyback on input with a 33 ms fallback; source defaults to eight outstanding chaos snapshots. Large logical snapshots use bounded atomic fragmentation. Interpolation, animation, physics and gameplay cadence remain unchanged. [Implementation and local measurements](verification/network-fixes-2026-09-10.md) include 24 full-feed clients and all ten incidents; no hosted/rendering capacity increase is certified. Existing frozen previews remain on their recorded builds.

## Local implementation follow-up (not deployed)

On September 8, the returned multiplayer review was checked against the actual code. Real-mesh regressions reproduced held display frames at 120 Hz and reduced body bob at 30 Hz (about 49% of the 60 Hz value at AI speed, 47% at human speed). This demonstrates a scheduling defect; it does not establish the sole cause of the player's observation.

The working tree now samples alive remote roots once per display frame, synchronizes their kinematic colliders before local physics, and animates the visible/glow rigs once after physics, before carried-case updates. Legacy deaths remain fixed-step. Motion inference uses actual presentation elapsed time; animation smoothing remains bounded. History resets and presentation gaps over 250 ms rebase locomotion without clearing active recoil/hit cues. Existing buffer delay, no-extrapolation policy and timestamp rejection remain unchanged.

Initial and periodic chaos messages now share the existing three-decimal wire serializer. Simulation and persistence keep full precision; protocol limits and gameplay caps are unchanged. This fixes the inconsistent encoding path, not a proof that every possible legal state fits the envelope.

Validation and remaining work: [presentation timing receipt](verification/remote-presentation-2026-09-08.md). These changes have not been deployed; the following baseline describes the previously shipped behavior.

## Current presentation and server behavior

The private September 8 playback candidate uses timestamped SnapshotBuffer history with 100–350 ms adaptive delay, a gently adjusted playback clock and no extrapolation through walls. See [the playback receipt](verification/remote-playback-2026-09-08.md); production retains its release baseline. Server timestamps preserve spacing within delayed batches. Respawns, teleports and long gaps reset history. Bot movement now publishes at 20 Hz plus before firing, from simulation timestamps; this does not increase bot speed.

Balls, cases and corpses use ChaosPresentation: approximately 75 ms interpolation, bounded sample history and limited extrapolation. New balls appear immediately and acquire delay gradually; removals and ownership/HUD changes remain immediate. Bounces/charged-state transitions must not interpolate through incompatible paths. These are rendering policies, not projectile-physics changes.

Server simulation is 60 Hz with roughly 30 Hz snapshots. Accepted stationary poses are suppressed after the initial stop update except for a half-second heartbeat; activity/checkpoints continue. Snapshots are encoded once for observers, with no wire encoding when nobody is watching.

## Two different regressions

1. **Local runtime starvation:** a human playtest recorded a 46,541 ms tick gap while rendering remained smooth and swap was zero. Memory protection and a short successful probe did not solve it. Main local playtesting now uses the private hosted relay. The underlying local runtime cause remains unconfirmed; see [freeze evidence](verification/local-freeze-followup.md).
2. **Slow/scattered public bots:** nine of eleven bots in a captured scenario abandoned unfinished per-start searches. Recovery scattered some despite movement. Shared destination flow fields, checked local steps, preserved routes and actual-progress recovery addressed that demonstrated cause. Do not diagnose it as a domain issue solely from migration timing. A later live observation still had one locally slowed bot.

## Diagnose the right layer

Compare actual bot displacement, objective progress, grounded/airborne state and shots with server tick/snapshot timing. Movement packet volume alone can conceal motionless rats. Compare local frame timing and phase costs with incoming snapshot age; a smooth renderer cannot conceal a frozen server.

For invisible balls: attempted/sent shot → server acceptance/rejection → received shot/state → rendered ball count. A full burst pool must not starve ordinary shots. Preserve shared ball ownership, caps, TTL and gameplay tuning while measuring bottlenecks.

Use [playtest diagnostics](playtest-diagnostics.md). `scripts/probe-network.mjs` is a bounded synthetic transport workload, not actual AI decision-making or capacity proof. Its eleven welcome-only clients differ from the production server roster. Do not run stress tests or browser input merely to complete a documentation or visual change.

## Evidence limits

The historical hosted five-minute probe had 7,148 accepted test shots, a peak of 256 balls and no multi-second gap, but it was not a 24-hour soak or 100-player test. The navigation replay improved 106→348 shots and 6→0 unnecessary rescues over 40 simulated seconds. These are different workloads and must not be combined into a universal performance claim. Current admission and simulation bounds are in [server operations](server-operations.md).

## Fifty-rat follow-up (private testing)

The current working tree negotiates `movement=batch-v1` independently of compact chaos. The room coalesces pending poses by rat and sends a bounded batch each chaos tick, flushing before critical control events to preserve ordering. Each pose retains its authoritative timestamp. Older clients continue receiving individual movement messages. The browser transport expands batches into the same presentation events.

Remote playback also fits bounded source-clock rate over longer observation windows, separating sustained clock drift from individual late packets. History and cursor move together when the mapping changes. This remains under capacity evaluation; see [the ongoing fifty-rat receipt](verification/fifty-rats-2026-09-08.md).

The later private 50-rat candidate preserves that human-player buffer and adds a receiver-timed AI buffer with a 250–350 ms reserve, bounded pending-pose reflow and stationary-heartbeat handling. It also adds rigid remote rendering batches and negotiated lossless projectile motion deltas. See [the current capacity receipt](verification/ai-delivery-and-rigid-batching-2026-09-08.md) for measured results and limitations.

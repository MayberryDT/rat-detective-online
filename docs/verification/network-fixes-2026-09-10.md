# Network audit fixes — September 10, 2026

Implemented the concrete defects and redundant work identified in the [September 10 audit](../network-audit-2026-09-10.md). Changes are in the local working tree based on `49dd64a1b4ac3f04900e2d1cd6d82e25471b84fe`. **No deployment, preview refresh, service restart or commit was performed.** The frozen mobile preview still uses protocol 5; current source uses **protocol 6** and must ship as a matching client/Worker pair. Old clients receive a reload instruction.

Physics, weapon cadence, ball speed/gravity/bounce/lifetime, projectile and corpse caps, all eight Tampering cases, assignments, AI decisions, controls, camera, lighting and interpolation settings remain unchanged. Public admission stays at 24 total rats with its existing AI reservations. This work does not establish support for 50–100 humans.

## Implemented fixes

| Audit | Change | Regression evidence |
| --- | --- | --- |
| N1 | `ConnectionDelivery` bounds all joined-client traffic, including movement, scores, shots and legacy snapshots. Consecutive replaceable movement batches merge by actor; reliable events remain ordering barriers. | Saturated receiver, healthy peer isolation, exact actor membership, event order, queue overflow and ACK timeout tests. |
| N2 | Socket errors close only the affected connection. Roster cleanup is deferred beyond the broadcast; lethal state and pending respawn/reset are saved before notification. | Injected `send` failure preserves healthy recipients' damage/death/scoreboard messages and the victim's durable respawn. |
| N3 | Rate limiter indexes connection/player namespaces and clears them on close/error, including clients that never join. | 2,000-namespace churn plus malformed/unjoined socket cleanup. |
| N4 | Cheap character guard precedes UTF-8 sizing and parsing. Aggregate ingress is capped at 240 messages/second; repeated invalid messages and failed joins have a bounded rejection/reply budget. | Oversize/multibyte payloads, invalid ACKs, malformed bursts and incompatible-join floods. |
| N5 | Source and fixture defaults now allow eight unacknowledged chaos snapshots. Every transport also obeys the whole-connection budget. | Exact default sustains 30 Hz with 200 ms ACK latency plus 33 ms ACK batching in the protocol fixture. |
| N6 | Immutable per-tick projectile deltas, impact/pressure encodings and UTF-8 byte counts are shared where recipient baselines agree. Baselines remain independent. | Codec equality tests and the measured comparison below. |
| N7 | Lossless movement tuples remove repeated keys. A shot carries its pending shooter pose in the same packet; clients apply the pose before the shot. ACKs piggyback on outgoing input, with a 33 ms standalone fallback. | Exact pose/timestamp/order tests and the corrected 24-client load below. No added shot delay or movement quantization. |
| N8 | Room setup avoids identical roster/refill writes and duplicate alarm scheduling. Welcome is the atomic initial roster. Bot removals batch scoreboard updates. | Setup write/alarm spies, matchmaking, durable lifecycle and reconnect tests. |
| N9 | Large legal snapshots/welcomes use bounded ordered fragments, validated and exposed atomically after reassembly. | Legacy and compact states containing 256 balls, 16 corpses and 64 impacts survive the same decoder, with every wire frame ≤64 KiB. |
| N10 | Reconnect backoff has bounded jitter; failure history resets only after 30 seconds of stable play. Timers/ACK state are cleared on reset/disposal. | Backoff, unstable reconnects, disposal and bounded uplink tests. |
| N11 | Matchmaking has a 64-request queue bound, five-second admission deadline, indexed room selection and cleanup of late accepted sockets. | Queue saturation, expired work, query-plan and admission/roster regressions. |
| N12 | Local and hosted tools use full-feed validation, held-fire cadence, all-incident rotation, roster checks and separate arrival/playback verdicts. Diagnostics include bytes/messages by type, close reasons, queued/in-flight traffic, ACK age and client application timing. | Local full-feed tests below. Hosted WAN, rendered browser/GPU, many-room load and long-duration certification remain outstanding. |

Additional safe work removes per-frame movement JSON comparison, repeats bot grounding contact scans once per simulation step, and reuses unchanged scoreboard rows. Speculative static-world cache and visual-pooling candidates from the audit were not treated as proven defects or used to change gameplay.

## Delivery contract

Protocol 6 gives each connection a stream ID and cumulative sequence ACK. The client acknowledges applied messages; intermediate fragments acknowledge bounded receipt without exposing partial state. Durable Object recovery sends a fresh atomic welcome while preserving the attached player identity. Recovery also handles interruption midway through a fragmented message.

Limits: **512 KiB / 256 frames in flight**, **256 KiB / 512 pending entries**, **64 KiB per wire frame**, **256 KiB per reassembled logical message**, and **five seconds without delivery progress**. Overflow resynchronizes the affected connection. Chaos delivery retains bounded transient cues while blocked; the existing newest-impact policy and launch-overflow recovery remain. A measured room-wide event-loop pause grants 250 ms for already queued ACKs to drain, with byte/frame/backlog bounds continuously enforced. It does not hide or solve the underlying server pause.

## Validation

The full suite passed **739 tests**: 122 Worker, 593 client and 24 script tests. Final review added two regressions; focused reruns passed **33 Worker and 22 client tests**, bringing the distinct passing test inventory to **741**. All **24 script tests** passed again after verifying that idle human-only phases correctly mark playback as not applicable while retaining arrival/error checks. Typecheck, production build and visual build passed again after the final application edits. Vite retains its large-chunk advisory. Logs are under `output/network-fixes-2026-09-10/`. No automated browser/input test was performed.

Focused coverage also includes eviction, complete snapshot membership, malformed/out-of-order delivery, independent compact baselines, mixed transports, incident cues, assignment rules, AI persistence, scoreboard identity and reconnect cleanup. The two final edge-case patches affect failed-join rejection and interrupted-message recovery; the measured load below preceded those patches. No normal transport/load path changed afterward.

## Measured encoding cost

`node scripts/benchmark-codec.mjs` compares HEAD against the working codec with 256 moving projectiles, 60 warm-up ticks and 180 measured ticks. It measures preparation, recipient encoding/ACK bookkeeping and byte sizing in Node on this machine; it excludes simulation, outer delivery framing, persistence, WAN and rendering.

| Recipients | Before median ms/tick | After median ms/tick |
| --- | ---: | ---: |
| 1 | 0.166 | 0.195 |
| 13 | 1.171 | 0.566 |
| 24 | 2.157 | 0.953 |
| 50 | 4.437 | 1.868 |

At 24 recipients, median encoding cost fell about **56%**, with p95 falling from 2.499 to 1.240 ms. Encoded bytes were identical. The one-recipient case has a small overhead increase. Fifty recipients here is a codec microbenchmark, not a supported player count. [Raw comparison](../../output/network-fixes-2026-09-10/codec-comparison.json).

## Full-feed local load

All clients decode their own complete state and ACK applied messages. Workloads use 20 Hz movement and the real 85 ms held-fire interval while alive. Fresh loopback Workers use the release **24-player / 32-socket / eight-snapshot** limits; copied test controls activate normal 25-second incidents. Managed AI and browser rendering are absent.

The corrected 24-client test passed movement, combat, incident and reconnect-churn phases, 20 seconds each:

| Phase | Snapshot gap p95 / p99 / max (ms) | Arrival, sampled playback and roster |
| --- | --- | --- |
| Movement | 40 / 43 / 46 | Pass |
| Combat | 51 / 62 / 79 | Pass |
| Incident | 48 / 61 / 71 | Pass |
| Churn | 42 / 49 / 67 | Pass |

It reached 256 projectiles, with zero invalid packets, errors, unexpected disconnects or skipped sends. Combat observed deaths and respawns. Earlier 2/8/12-client phases also passed; the larger corrected run is the current transport result. [24-client receipt](../../output/local-capacity-2026-09-10T17-30-25-744Z-combined-fire/results.json).

The subsequent **260-second** clustered test covered all ten incidents with an ordered **75–100 ms application delay in each direction**. It passed both timing/playback gates and roster checks: snapshot gaps **57 / 63 / 110 ms**, measured RTT p95 **201 ms**, peak **256 balls**, and zero invalid packets, errors, disconnects or skipped sends. Across **15,048 Tampering snapshot observations**, none omitted any of the eight cases. There were 42,120 death and 41,568 respawn recipient observations; these are not unique event counts, and some deaths were still awaiting respawn at cutoff. [All-incident receipt](../../output/local-capacity-2026-09-10T17-34-42-996Z-all-incidents-latency/results.json).

Playback probes sample actual movement buffers on one socket per generator, excluding stationary/dead tracks and the first second after reset. Frequent deaths substantially reduce eligible samples in the clustered soak; it is not a browser frame-rate or complete animation test. The impairment preserves message order and does not emulate TCP loss. Aggregate application traffic remained about **83.7 Mbps** in the long incident run; complete-state fan-out still has a substantial bandwidth cost.

## Failed iterations and remaining limits

The initial disk-backed run reproduced local multi-second stalls. A paired eight-client movement test failed on disk (p99 411 ms, worst 1,051 ms), then passed with disposable tmpfs storage (p99 39 ms, worst 40 ms). This suggests a local storage contribution without proving the root cause. All passing 24-client results above used **tmpfs**. They cannot establish that disk-backed local workerd or hosted Cloudflare has the same behavior.

An earlier tmpfs 24-client combat run still failed before pose/shot combination and ACK piggybacking: the 256-frame delivery budget filled and snapshot gaps reached 2,859 ms. This was a real transport bottleneck; the corrected runs above validate the repair. Earlier failed artifacts remain at `output/local-capacity-2026-09-10T17-12-11-541Z-network-fixes/`, `output/local-capacity-2026-09-10T17-16-03-800Z-stall-check/` and `output/local-capacity-2026-09-10T17-18-54-940Z-full-feed-release/`.

No hosted benchmark/deployment, cross-region or many-room test, real-phone/GPU measurement, human gameplay test, or hours-long soak was performed. The current cap remains appropriate pending those checks. Historical failures and production release records have not been rewritten.

Prior context: `brain:sessions/2026/09/rat-detective-network-scaling-audit-2026-09-10` and the dated repository audit. Current tooling instructions are in [local capacity testing](../local-capacity-testing.md) and [hosted capacity testing](../hosted-capacity-baseline.md).

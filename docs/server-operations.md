# Server operations

Current contract, reviewed **2026-09-14**. Source constants take precedence if changed later. Production topology and version receipts are in [live service](live-service.md). The always-alive canonical city is live on Worker `0965112e-c50d-4075-86f7-decd93738f19`; see [the production receipt](verification/canonical-city-2026-09-14.md).

## Capacity and boundaries

| Limit | Current value |
| --- | --- |
| Player ceiling | 10 total rats per current production room, with automatic overflow rooms |
| Public bots | Occupied rooms fill to eight total rats; yield to humans; refill after ten seconds. `public-live-v2` keeps eight named bots with zero humans. Overflow rooms still sleep when empty. |
| Open connections | 24 per GameRoom including pending joins; excess upgrades receive HTTP 503 |
| Inbound client message | 8192 bytes |
| Server message envelope | 65536 bytes; validators and snapshot budgets must agree |
| Logical message / joined delivery | Protocol 7; atomic reassembly ≤256 KiB, in-flight ≤512 KiB / 256 frames, pending ≤256 KiB / 512 entries; eight outstanding chaos snapshots |
| Matchmaking admission | 64 queued attempts, five-second deadline, sixteen candidate probes; clients retry temporary rejection |
| Active chaos shots | 256 globally; fresh trigger pulls preferentially evict burst balls when necessary |
| Corpses | 16, bounded lifetime; each Improper Disposal death requests up to 120 burst balls within shared capacity |

Admission uses a Cloudflare Rate Limiting binding at a generous 120 upgrade attempts per minute per available connecting address. Connection-local limits from `src/worker/validation.ts`: movement 30/sec, shoot and legacy hit 12/sec, ping 4/sec, join 3 per 10 seconds per connection. A valid finite direction must have magnitude 0.05–8 and the shot origin must be within 12 units of the stored player pose. These are plausibility/resource checks, not anti-cheat proof.

The transport envelope is x/z ±2000 and y −8 to 250. Movement is also checked against elapsed server time and the static city collision world. A rejected input keeps the last authoritative position, consumes its sequence number and emits `playerCorrected`; out-of-envelope finite inputs are bounded before that decision. The version-2 map separately has physical boundaries (`CITY_BOUNDS` −196 to 166), launch containment and bot recovery. Do not confuse the network envelope with playable map dimensions or claim the map has no walls.

## Cadence and cost

Server simulation advances at 60 Hz, snapshots at roughly 30 Hz, and bot movement at 20 Hz plus before shots. Human movement is immediate subject to input/rate policy. Repeated stationary poses are suppressed after the initial stop update, with a half-second heartbeat. Source simulation timestamps preserve pose spacing when packets arrive in batches.

Outbound events share serialization work; negotiated lossless movement tuples include a shot's pending pose. Delivery ACKs and per-connection budgets bound slow observers, with atomic fragmentation for large logical snapshots. Empty overflow rooms checkpoint and stop bots/physics. The canonical city keeps running with six to nine bots and zero humans. A failed canonical persistent alarm tries a bounded future wake and then rethrows; overflow and private rooms stay unchanged. If storage or `setAlarm` is unavailable, there is no absolute outage guarantee. The 65536-byte wire envelope still constrains each frame. Preserve bounded physics substeps, ray queries, shared flow-field work and projectile capacity; a larger cap is not automatically safe.

Workers clocks may remain frozen during synchronous callbacks. Navigation therefore enforces both 2 ms and 96-expansion bounds. A reported zero-duration tick does not imply zero CPU work: production `tickCostAvgMs` reads 0. Room diagnostics therefore also report deterministic `work` counts per window (`navExpansions`, `navEdgeProbes`, `botRays`, `chaosRays`, `physicsSubsteps`); use them, or Cloudflare's per-object `durableObjectsPeriodicGroups.cpuTime`, for CPU comparisons. `StaticCityBroadphase` and `SpatialRayQuery` replace the early scene-wide hot paths for the authoritative city; the old small-city Naive/SAP benchmark is historical, not the current architecture. The static walk graph is shared per world spec across bot-controller replacements, and an unchanged ray index skips its full static rescan; both are exact. See [server CPU receipt](verification/server-cpu-2026-09-27.md).

## Persistence

| State | Recovery source |
| --- | --- |
| World / round / scores / HP / lifecycle transitions | SQLite, critical changes persisted immediately |
| Human/bot position and rotation | Memory plus 2500 ms routine player checkpoints; immediate on lifecycle/correction/damage/join/reconnect. While the room ticks, due routine poses are written in the next 1 Hz chaos checkpoint transaction (at most about 3.5 s old), not in their own movement event |
| Human liveness | Attached sockets and last activity, independent of movement |
| AI roster | `persistent-bots-v1` and `persistent-bot-roster-v1` room-state keys |
| Chaos world | `chaos-v1` snapshots about once a second, or immediately on an important signature change (case owner/return, Dispatch serial/phase, assignment revision). A signature change is written before that tick's frames are sent; a routine one-second checkpoint is written after them |
| Respawn/reset deadlines | `pending_events` plus the shared Durable Object alarm |
| Occupied-room AI recovery | 15-second heartbeat integrated with earlier event deadlines; overflow rooms sleep empty. The canonical city keeps the same 15-second alarm and recovers with six to nine bots when no humans are present. The constructor keeps an existing earlier or due alarm; empty overflow deletes an unneeded one |

Hydration preserves attached players even if their checkpoints are old. Unattached stale humans are pruned after two minutes; active managed bots are exempt. Disabled bot IDs and their pending events are removed when restoring an authoritative active roster. Legacy roster migration keeps the running eleven-bot cast until its next reset.

Every Durable Object storage write holds that object's outgoing messages until it settles (the output gate). A September 27 private measurement found writes in 13.4% of snapshot ticks, which delayed those frames by about 50 ms at the median. After folding routine poses into the chaos checkpoint and sending before routine writes, the figure was 2.2%. Do not add new routine writes to a running room's tick or movement path; fold them into `checkpointGame`. See [the checkpoint receipt](verification/server-cpu-2026-09-27.md#delivery-gating-step-3).

Version-2 Dispatch Assignments decide the winner; kills remain actual secondary statistics. Legacy version 1 retains kill-limit rules. Victory clears queued respawns and pins dead-player deadlines to the six-second victory interval; ordinary respawns take three seconds. Reset replaces bots, sends ordered leave/join events for fresh nameplates, and preserves human identity/appearance while resetting round stats and positions. Avoid a second independent alarm that overwrites these deadlines.

## Diagnostics and incidents

`/health` proves routing; `/status` reports canonical-room humans **and managed bots**, names/K-D, round timing and `bots` count, without positions. Reading `/status` enables public matchmaking policy and is the one-time activation of the canonical city; it is not a global inventory of every room. Directory `GET /api/companion/v1/status` does not wake a GameRoom. Empty overflow 0/0 is healthy. For `public-live-v2`, the live contract is eight named bots and zero humans.

Room metrics track membership, pending events and traffic. Room diagnostics track accepted/rejected shots, simulation gaps, callback silence, checkpoint settlement and snapshot traffic. Public Worker logs and local client journals are different sources. Read [playtest diagnostics](playtest-diagnostics.md) before claiming a freeze or invisible-shot cause.

Known failures: local workerd suffered multi-second starvation even without swap; the hosted relay contains that issue. Separately, independent per-start path queues plus incorrect recovery made bots slow and scattered. Shared fields, checked local steering and progress-based recovery fixed the demonstrated navigation regression, with some local obstruction still possible. Do not modify weapon tuning to hide either failure.

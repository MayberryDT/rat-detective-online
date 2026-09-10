# Server operations

Current code contract, reviewed **2026-09-10**. Source constants take precedence if changed later. Production topology and version receipts are in [live service](live-service.md).

## Capacity and boundaries

| Limit | Current value |
| --- | --- |
| Player ceiling | 16 total per room; up to sixteen humans, with automatic overflow rooms |
| Public bots | Fill occupied rooms to eight total rats; yield to humans, refill after ten seconds, remove/sleep when empty |
| Open connections | 24 per GameRoom including pending joins; excess upgrades receive HTTP 503 |
| Inbound client message | 8192 bytes |
| Server message envelope | 65536 bytes; validators and snapshot budgets must agree |
| Logical message / joined delivery | Protocol 7; atomic reassembly ≤256 KiB, in-flight ≤512 KiB / 256 frames, pending ≤256 KiB / 512 entries; eight outstanding chaos snapshots |
| Matchmaking admission | 64 queued attempts, five-second deadline, sixteen candidate probes; clients retry temporary rejection |
| Active chaos shots | 256 globally; fresh trigger pulls preferentially evict burst balls when necessary |
| Corpses | 16, bounded lifetime; each Improper Disposal death requests up to 120 burst balls within shared capacity |

Rate limits from `src/worker/validation.ts`: movement 30/sec, shoot and legacy hit 12/sec, ping 4/sec, join 3 per 10 seconds per connection. A valid finite direction must have magnitude 0.05–8 and the shot origin must be within 12 units of the stored player pose. These are plausibility/resource checks, not anti-cheat proof.

The transport envelope is x/z ±2000 and y −8 to 250. Out-of-envelope finite movement is clamped and `playerCorrected` is echoed to the mover as well as observers. The version-2 map separately has physical boundaries (`CITY_BOUNDS` −196 to 166), launch containment and bot recovery. Do not confuse the network envelope with playable map dimensions or claim the map has no walls.

## Cadence and cost

Server simulation advances at 60 Hz, snapshots at roughly 30 Hz, and bot movement at 20 Hz plus before shots. Human movement is immediate subject to input/rate policy. Repeated stationary poses are suppressed after the initial stop update, with a half-second heartbeat. Source simulation timestamps preserve pose spacing when packets arrive in batches.

Outbound events share serialization work; negotiated lossless movement tuples include a shot's pending pose. Delivery ACKs and per-connection budgets bound slow observers, with atomic fragmentation for large logical snapshots. Without humans, automatic public rooms checkpoint and stop bots/physics. The 65536-byte wire envelope still constrains each frame. Preserve bounded physics substeps, ray queries, shared flow-field work and projectile capacity; a larger cap is not automatically safe.

Workers clocks may remain frozen during synchronous callbacks. Navigation therefore enforces both 2 ms and 96-expansion bounds. A reported zero-duration tick does not imply zero CPU work. `StaticCityBroadphase` and `SpatialRayQuery` replace the early scene-wide hot paths for the authoritative city; the old small-city Naive/SAP benchmark is historical, not the current architecture.

## Persistence

| State | Recovery source |
| --- | --- |
| World / round / scores / HP / lifecycle transitions | SQLite, critical changes persisted immediately |
| Human/bot position and rotation | Memory plus 2500 ms player checkpoints; immediate on lifecycle/correction |
| Human liveness | Attached sockets and last activity, independent of movement |
| AI roster | `persistent-bots-v1` and `persistent-bot-roster-v1` room-state keys |
| Chaos world | `chaos-v1` snapshots, approximately each second or important signature change |
| Respawn/reset deadlines | `pending_events` plus the shared Durable Object alarm |
| Occupied-room AI recovery | 15-second heartbeat integrated with earlier event deadlines; automatic rooms sleep empty |

Hydration preserves attached players even if their checkpoints are old. Unattached stale humans are pruned after two minutes; active managed bots are exempt. Disabled bot IDs and their pending events are removed when restoring an authoritative active roster. Legacy roster migration keeps the running eleven-bot cast until its next reset.

Version-2 Dispatch Assignments decide the winner; kills remain actual secondary statistics. Legacy version 1 retains kill-limit rules. Victory clears queued respawns and pins dead-player deadlines to the six-second victory interval; ordinary respawns take three seconds. Reset replaces bots, sends ordered leave/join events for fresh nameplates, and preserves human identity/appearance while resetting round stats and positions. Avoid a second independent alarm that overwrites these deadlines.

## Diagnostics and incidents

`/health` proves routing; `/status` reports canonical-room humans **and managed bots**, names/K-D, round timing and `bots` count, without positions. Reading status enables public matchmaking policy; it is not a global inventory of every room. Zero players/bots is expected for an empty automatic room.

Room metrics track membership, pending events and traffic. Room diagnostics track accepted/rejected shots, simulation gaps, callback silence, checkpoint settlement and snapshot traffic. Public Worker logs and local client journals are different sources. Read [playtest diagnostics](playtest-diagnostics.md) before claiming a freeze or invisible-shot cause.

Known failures: local workerd suffered multi-second starvation even without swap; the hosted relay contains that issue. Separately, independent per-start path queues plus incorrect recovery made bots slow and scattered. Shared fields, checked local steering and progress-based recovery fixed the demonstrated navigation regression, with some local obstruction still possible. Do not modify weapon tuning to hide either failure.

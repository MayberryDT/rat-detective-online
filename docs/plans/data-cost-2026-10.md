# Data cost plan (October 2026)

**Status, 2026-10-06: P1, P2's daily pruning and P3's lossless part are built and verified on branch `data-cost-20261006` (Halla), with a rollback mode that keeps every count readable by older releases. They are not deployed, and no production data or schema has been touched. Deploying needs Tyler's approval of the live migration ([section 4](#4-implementation-6-october-not-deployed)).** Goal: keep every piece of data Rat Detective records (heat map and city aggregates, the R2 city archive, highlight markers, telemetry facts, Jev measures, room state) while cutting Cloudflare spend.

Every number below is labelled:

- **[MEASURED]** comes from Cloudflare's GraphQL Analytics API for account `e0f9e827…` (datasets `durableObjectsPeriodicGroups`, `durableObjectsInvocationsAdaptiveGroups`, `durableObjectsSqlStorageGroups`, `workersInvocationsAdaptive`, `r2OperationsAdaptiveGroups`, `r2StorageAdaptiveGroups`), queried 2026-10-06 03:40–04:10 UTC, or from a local workerd probe (method at the end).
- **[ESTIMATE]** is computed from code or from measured rates, with the assumption stated.
- **[NOT MEASURED]** means the data was not reachable. The wrangler OAuth token gets `Authentication error` from the billing and Workers Logs APIs.

Prices are Cloudflare's published Workers Paid rates ([Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), updated 30 Sep 2026). SQLite rows written: 50 M a month included, then $1.00 per million. Rows read: 25 B included, then $0.001 per million. DO duration: 400k GB-s included, then $12.50 per million GB-s. DO requests: 1 M included, then $0.15 per million, with incoming WebSocket messages counted 20:1. SQL storage: 5 GB-month included, then $0.20 per GB-month. Billable usage is rounded **up** to the next whole unit (1 M rows, 1 M GB-s). The included allowances are monthly and shared by every Worker on the account. A day is the monthly amount divided by 30. The $5 a month Workers Paid minimum is on top.

## Headline

1. **The ~16 USD a day was SQLite rows written by the always-on city.** [MEASURED] From 29 Sep to 5 Oct, production `GameRoom` wrote 7.85 M rows a day and staging `GameRoom` 7.48 M, each awake 24 h a day with 0 humans most of the time. That is 462 M rows a month, or about **$13.70 a day**. Rows read added **$1.67 a day**, a full-table scan that grows every day (item 3). Duration added **$0.42 a day**. Requests, R2 and Worker requests together came to under $0.05 a day. Total: **about $15.80 a day**, which matches Tyler's figure.
2. **The idle-room release (`bd2e668`) already removed it.** [MEASURED] Production `GameRoom` stopped at about 03:33 UTC and staging at about 03:28. From 03:45 to 04:08 UTC both recorded no active time, no rows read and no rows written. From now on, cost scales only with **room-hours that have a human in them**.
3. **At today's traffic the remaining usage fits inside the included allowance.** [MEASURED] The city digest for 30 Sep–6 Oct counts 6.6 human rat-hours in 7 days, so at most about 1 human room-hour a day. [ESTIMATE] One room-hour writes about 342k rows (the measured production rate), so the 50 M included rows cover about **146 room-hours a month (about 4.9 a day)** across production and staging. Expected Cloudflare usage charges are **≈ $0 a day** above the $5 a month minimum. None of the proposals below saves money at today's traffic. They set how fast cost grows when play grows: today **$0.34 per room-hour** beyond the allowance, about 85% of it heat-map cell upserts.
4. **One structural problem.** Each heat-map cell is its own SQLite row, upserted every 60 s, and Cloudflare bills by row, not by byte. Packing each flush into a few rows (P1) keeps every count and removes about 85% of all rows written.

## 1. Inventory of data paths

Cadence and row counts per occurrence come from the source. Measured row counts come from the probe: one room, its rolled bots, one seated human, 620 s ([method](#method)).

| Data | Where | Trigger and cadence | Rows / ops per occurrence | Cost driver | Source |
| --- | --- | --- | --- | --- | --- |
| Heat cells (`humans`, `bots`, `shots`, `hits`, `deaths`, `pickups`, `spawns`, `anomalies`… on a 4-unit grid) | `GameRoom` SQLite `city_cells` (WITHOUT ROWID, key `day, build, layout, mode, layer, cell`), kept forever | Sampled every 200 ms (`SAMPLE_MS`) in memory; one upsert per distinct key every 60 s (`FLUSH_MS`), at room stop, and before any city API read | **[MEASURED] ~3,400 upserts per flush, 1 row each** (37,122 in 620 s) | Rows written | `CityRecorder.ts:34,682,1026`; `CityStore.ts:62-65` |
| Place measures (use, danger, deaths by place) | `city_places`, kept forever | Same 60 s flush | [MEASURED] ~250 per flush | Rows written | `CityRecorder.ts:1027` |
| Flows (place to place, humans/bots) | `city_flows`, kept forever | Same 60 s flush | [MEASURED] ~75 per flush | Rows written | `CityRecorder.ts:1028` |
| Jev and code mind measures | `city_minds`, kept forever | Same 60 s flush | 0 in the probe (no Jev key in tests) | Rows written | `CityRecorder.ts:1029` |
| Discrete facts (29 types: shot, death, pickup, highlight, exhibit, round, admin…) | `city_events` (`seq INTEGER PRIMARY KEY AUTOINCREMENT` plus indexes `(type,t)` and `(round,t)`), 30 days | Buffered and inserted at each 60 s flush | **[MEASURED] 4 rows written per insert**: the table, 2 indexes and `sqlite_sequence` (747 inserts → 2,988 rows) | Rows written | `CityStore.ts:44-46,79-81` |
| Event pruning | `DELETE FROM city_events WHERE day < ?` | Every flush (every 60 s) | **[MEASURED] reads the whole table every time.** No index on `day`; the probe's 11 calls read 4,371 rows. [ESTIMATE] Production scanned about 1.05 M rows a minute on 6 Oct (15.7 M rows read per 15 minutes), so production `city_events` holds about 1 M rows | Rows read, growing with the table | `CityStore.ts:82-84`; `CityRecorder.ts:1032` |
| Raw fact stream (every fact, plus 1 Hz `frame`, 5 Hz fight `window` and bot `decision`) | R2 `rat-detective-city` / `-staging`, `city/raw/v1/<room>/YYYY/MM/DD/…jsonl.gz`, gzip, kept forever | Every 5 min (`ARCHIVE_FLUSH_MS`), at 2 MB uncompressed, and at room stop | 1 Class A put of [MEASURED] ~245 KB average (505 MB / 2,066 objects) | R2 Class A, R2 storage | `CityArchive.ts:6-7,33-47` |
| Archive reads | R2 list and get | `scripts/city-mirror.mjs` and the authenticated `/api/city/v1/archive*` | 1 Class A or Class B op per call | R2 ops | `cityApi.ts`; `scripts/city-mirror.mjs:114` |
| Room checkpoint: `round-v1`, `chaos-v1`, `assignment-rotation-v1` | `room_state` | Every 1 s, and immediately on a case, Dispatch or assignment change | 3 rows ([MEASURED] 1,962 in 620 s ≈ 3.2 a second) | Rows written | `GameRoom.ts:1689-1716,1806-1817` |
| Player records (pose, stats) | `players` | Each rat at most every 2.5 s (`CHECKPOINT_MS`), batched into the 1 s checkpoint; forced on join, hit or continue | 1 row each ([MEASURED] 1,459 in 620 s ≈ 2.4 a second) | Rows written | `GameRoom.ts:145,1724-1752` |
| Respawn and round-reset timers | `pending_events` (+ index on `due_at`) | Each death and each round win | [MEASURED] 3 rows per insert, 1 per delete | Rows written | `GameRoom.ts:1387,1433` |
| Alarms | `setAlarm` | Next due event or bot heartbeat | 1 row written each ([MEASURED] 129 in 620 s) | Rows written | `GameRoom.ts:1515` |
| Reconnect sessions | `reconnect_sessions` | Join, disconnect, leave | 1 row | Rows written | `GameRoom.ts:1554,1562` |
| Companion summaries (Omarchy widget) | `Matchmaker` SQLite `companion_summaries` (+ 1 index) | RPC from the room at most every 500 ms when something changes, otherwise every 20 s | 2 rows. [MEASURED] about 3k rows an hour while a room ran | Rows written, DO requests | `Matchmaker.ts:133-151`; `companionStatus.ts` |
| Jev spend ledger | `Matchmaker` (`jev-budget`) `jev_spend` | RPC every 30 s while Jev is on | 1 upsert | Rows written, DO requests | `jevBudget.ts`; `Matchmaker.ts:108-123` |
| Jev decisions | TypeSafe API (outside Cloudflare) | Per bot decision, ≤ 9.5 a second per room, only with a human present | 1 subrequest; cost billed by TypeSafe, capped at `JEV_DAILY_BUDGET_USD` = 25 | External, **[NOT MEASURED]** | `jevClient.ts`; `jevMind.ts` |
| Highlight replays | Built in the browser from the client's own buffers; the server stores only the marker and `exhibit` facts (rows above and in R2) | Per highlight | None beyond the facts | None | `HighlightDetector.ts` |
| Simulation | `GameRoom` in memory, `setInterval` at 30 Hz | While a human holds a seat; the object cannot hibernate meanwhile | [MEASURED] ~460 GB-s per room-hour (128 MB × 3,600 s) | DO duration | `GameRoom.ts:1651-1721` |
| Client input | Incoming WebSocket messages | 20 Hz while moving, 1 Hz idle, shots ≤ 12–22 Hz | 1/20 request each | DO requests | `GameSession.ts:711-728` |
| Logs | Workers Logs, `head_sampling_rate: 1` | Every invocation, `room diagnostics` every 5 s, `jev` every 60 s | 1 event each | Logs events (20 M a month included) | `wrangler.jsonc`; `RoomDiagnostics.ts` |

Not used anywhere: KV, D1, Analytics Engine, Queues.

### Measured usage per day (production and staging, before the idle release)

| Dimension | Production | Staging | Monthly at this rate | Billed $/day | Label |
| --- | --- | --- | --- | --- | --- |
| `GameRoom` rows written | 7.85 M/day (29 Sep–5 Oct avg; 8.2 M on 5 Oct) | 7.48 M/day | 462 M (incl. ~0.07 M/day from other Workers) | **13.70** | MEASURED usage, list price |
| `GameRoom` rows read | 1.37 B on 5 Oct, **+0.19 B every day** | 1.13 B on 5 Oct, +0.19 B/day | 75 B on 5 Oct and climbing | **1.67** | MEASURED |
| `GameRoom` + `Matchmaker` duration | 11.05k + 0.5k GB-s/day | 11.03k + 0.4k GB-s/day | 693k GB-s → rounded up to 1 M billable | **0.42** | MEASURED |
| DO requests | 19k–353k (`GameRoom`) + 39k–61k (`Matchmaker`) | 12k–105k + 37k | ≤ 10 M | ≤ 0.05 | MEASURED |
| `Matchmaker` rows written | 74k/day | 73k/day | in the total above | — | MEASURED |
| Worker requests | 4k–9.5k/day | < 1.6k/day | inside 10 M included | 0 | MEASURED |
| R2 Class A (puts) | 290–325/day | 289–308/day | ~18k (1 M included) | 0 | MEASURED |
| R2 Class B (gets) | 0–827/day | 0–1,185/day | 10 M included | 0 | MEASURED |
| R2 stored | 505 MB, 2,066 objects | 467 MB, 2,044 objects | 10 GB included | 0 | MEASURED |
| DO SQL stored | 868 MB (`GameRoom`), 0.1 MB (`Matchmaker`) | 880 MB | 5 GB-month included | 0 | MEASURED |
| Workers Logs events | — | — | [ESTIMATE] ≤ 1.5 M a month (invocations plus 17k diagnostics lines a day per awake room) against 20 M included | 0 | ESTIMATE |
| **Total** | | | | **≈ 15.80** | |

### After the idle release

[MEASURED] From 03:45 to 04:08 UTC on 6 Oct, production and staging `GameRoom` show no active time, no rows read and no rows written. Both `Matchmaker` objects wrote 0 rows from 03:45. One unexplained item: production `GameRoom` read 14.6 M rows in the 03:30–03:45 slot while active for only about 3 minutes. That is about 14 times one prune scan; a full-range `/map` or heat read during the deploy would explain it [INFERENCE].

From here, cost = f(**H**, human room-hours a day across both environments). The per-room-hour rates, from the 5 Oct production hours with bots only:

| Per room-hour | Usage | $ beyond allowance | Label |
| --- | --- | --- | --- |
| Rows written | 342k | $0.342 | MEASURED rate |
| Rows read (prune scan of a ~1 M-row `city_events`) | ~60 M, growing with the table | $0.060 | MEASURED rate |
| Duration | 460 GB-s | $0.006 | MEASURED rate |
| Requests (3 humans at 20 Hz, ÷20) | ~11k billed | $0.002 | ESTIMATE |
| **Total** | | **≈ $0.41** | |

[ESTIMATE] Scenarios, with the measured rates, the included allowance applied monthly and rounding up:

| H (room-hours/day) | Rows written/month | Today's code, $/day | After P1 | After P1+P2+P3 |
| --- | --- | --- | --- | --- |
| **1 (current, from the digest)** | 10 M | **0.00** | 0.00 | 0.00 |
| 5 | 51 M | 0.07 | 0.00 | 0.00 |
| 24 (one room always occupied) | 246 M | 7.20 | 0.65 (prune reads remain) | 0.04 |
| 100 | 1,026 M | 38.20 | 9.20 (prune reads remain) | 1.60 |

Columns include rows written, rows read, duration and requests (3 humans a room). "After P1" alone still pays P2's prune scan. "After P1+P2+P3" assumes ~27k rows written per room-hour: the probe's 22k remaining rows scaled to the production rate.

The $5 a month plan minimum (~$0.17 a day) applies in every row.

## 2. Where one room-hour's writes go

[MEASURED] From the probe's 620 s run (one room, its bots, one seated human), scaled to an hour. The probe writes 276k rows an hour; production wrote 342k (more bots and real fights). Shares are what matter:

| Path | Rows/hour (probe) | Share |
| --- | --- | --- |
| `city_cells` upserts | 215.5k | **78.0%** |
| `city_events` inserts (4 rows each) | 17.3k | 6.3% |
| `city_places` upserts | 16.0k | 5.8% |
| `room_state` checkpoint | 11.4k | 4.1% |
| `players` checkpoint | 8.5k | 3.1% |
| `city_flows` upserts | 4.8k | 1.7% |
| `pending_events` | 1.6k | 0.6% |
| `setAlarm` | 0.75k | 0.3% |

[MEASURED] Aggregate rows (cells, places and flows) the same 620 s would cost under other flush plans:

| Flush plan | Aggregate rows in 620 s | vs today |
| --- | --- | --- |
| One row per key every 60 s (today) | 40,706 | — |
| One row per key every 120 s | 35,771 | −12% |
| One row per key every 300 s | 29,112 | −28% |
| One row per key every 600 s | 23,225 | −43% |
| **One packed row per (table, day, build, layout, mode, layer) every 60 s** | **175** | **−99.6%** |

Bots spread over the whole city, so the set of distinct cells barely shrinks as the window grows. Packing is the lever; longer windows are not.

## 3. Proposals, ranked by savings against effort

Savings are per room-hour beyond the allowance (production rate, $1 per million rows written). At today's traffic every proposal saves **$0.00 a day**; the scenario table shows when each starts to pay.

### P1. Pack city aggregates into one row per bucket per flush (lossless). Saves ≈ $0.29 per room-hour (−85% of rows written). Effort: medium.

- **Change:** at each flush, `CityStore` writes one row per `(table, day, build, layout, mode[, layer])` bucket into an append-only delta table, its value a compact encoding of every `key → n` in the bucket (JSON or a packed string). About 175 rows per 10 minutes replace ~40,700. Reads decode and sum the deltas in JS. A compaction step merges a finished day's deltas into one row per bucket and deletes them, so storage and read cost stay bounded. It runs at the first flush of a new UTC day or when the room stops. Existing `city_cells/places/flows/minds` rows are migrated once into the packed form, or stay readable as legacy history.
- **Kept:** every count, unchanged: same keys, same sums, same `/api/heat/v1`, `/map`, places, flows and digest output. Check with `scripts/benchmark-server-tick.mjs --city`'s aggregate hash and a before/after diff of the API responses over the same synthetic facts.
- **Before → after (production rate):** ~342k → ~51k rows per room-hour. [ESTIMATE] Aggregate writes fall from ~236k/h (probe) to ~1.1k/h. Storage also shrinks, because the day, build, mode and layer strings are no longer repeated in every cell row [INFERENCE].
- **Risk:** none to the data if the hash and API diff match. Code risk: the migration and the read path. `cells()` today is one SQL `GROUP BY`; afterwards it decodes N rows. N ≈ buckets × days after compaction, so small.

### P2. Event table: prune once a day and drop `AUTOINCREMENT`. Saves ≈ $0.06 per room-hour in reads (growing) and ≈ $0.005 in writes. Effort: small.

- **Change:** run `pruneEvents` at most once per UTC day per room (remember the last prune day in memory or `room_state`) instead of every 60 s. That removes a full scan of `city_events` each minute, which today reads ~1 M rows per minute in production. Rebuild `city_events` with `seq INTEGER PRIMARY KEY` (no `AUTOINCREMENT`). The `sqlite_sequence` write goes, so each insert writes 3 rows, not 4. Pruning removes the oldest rows, so `seq` stays increasing.
- **Kept:** all events. Retention stays 30 days; a day's old rows may live up to a day longer.
- **Before → after:** ~60 M → ~1 M rows read per room-hour (one scan a day instead of 60 an hour); 17.3k → 13.0k event rows written per hour (probe).
- **Risk:** none to the data. The one-time table rebuild must keep `seq` values; copy with `INSERT … SELECT seq, …`.

### P3. Checkpoint less often what is not a game event. Saves ≈ $0.02 per room-hour (−6%). Effort: small.

- **Change:** write `assignment-rotation-v1` only when it changes (once a round), not every second. Routine `round-v1` and `chaos-v1` checkpoints every 5 s instead of 1 s. Changes to the case, Dispatch or the assignment still write at once, before clients see them (`GameRoom.ts:1689-1696`). Routine player poses every 10 s instead of 2.5 s (`CHECKPOINT_MS`). Joins, hits and continues still write at once.
- **Kept:** all recorded data. Telemetry does not come from these rows.
- **Before → after:** room_state + players ~19.9k → ~5.6k rows/hour (probe). [ESTIMATE] Critical writes measured at about 1.7k/h are kept.
- **Risk to the game, not the data:** a room restored after a crash or a deploy resumes from state up to 5 s old (poses up to 10 s) instead of 1 s (2.5 s). Scores, case owner and assignment progress are critical writes and stay exact.

### P4. Longer aggregate flush (fallback if P1 is deferred). Saves ≈ $0.13 per room-hour (−37%). Effort: trivial.

- **Change:** `FLUSH_MS` 60 s → 600 s. Stopping the room and every city API read still flush first.
- **Before → after:** aggregate rows −43% (measured above).
- **Data risk:** a crash or a deploy mid-session loses up to 10 minutes of aggregates instead of 1. The R2 archive has the same facts, but it buffers up to 5 minutes, so the overlap is partial. Superseded by P1, which removes the need for it.

### Not recommended

| Idea | Why not |
| --- | --- |
| R2 lifecycle rules or expiry | Deletes data. R2 is free at this size (0.97 GB of 10 GB included; ~600 puts a day at most). |
| R2 Infrequent Access | Minimum storage period and retrieval fees cost more than free Standard storage at < 10 GB. |
| Sampling facts or heat | Lossy, and P1 is lossless with a larger saving. |
| Lower `head_sampling_rate` | [ESTIMATE] Logs stay far inside the 20 M events a month included; sampling would only lose diagnostics. |
| Hibernate between ticks during play | The 30 Hz authoritative simulation needs the object awake. Duration costs $0.006 per room-hour. |
| Slower companion publishing | ~3k rows/h (1%); the Omarchy widget's freshness depends on it. |
| Staging-specific cuts | Staging now sleeps like production and shares the allowance; it costs only while someone holds a seat. |

## 4. Implementation (6 October, not deployed)

Receipt: [data cost verification](../verification/data-cost-2026-10-06.md). Code is on branch `data-cost-20261006` in `/home/halla/workspaces/rat-detective-data-cost-20261006`, based on `4041deb`.

| Proposal | Status | As built |
| --- | --- | --- |
| P1 packed aggregates | **Built** | Each flush writes one JSON row per bucket into `city_packs`. A bucket's small packs merge in one transaction once 16 pile up, so there is no day-end compaction. Rows are at most 256 KB. The per-key tables keep their history in place and are read beside the packs; nothing is migrated or deleted. The flush stays at 60 s, so the loss window is unchanged. Events and packs commit in one transaction, and a failed flush is retried whole. |
| P2 daily pruning | **Built** | The prune runs at an instance's first flush and whenever the cut-off day moves. Retention is never shorter than 30 days. |
| P2 drop `AUTOINCREMENT` | **Deferred (Tyler's call)** | It needs a rebuild or rename of `city_events`. Older builds would then read a different table, and recorded history would move between tables. The saving is a quarter of the event rows: about 5k of the ~38k rows per room-hour that remain (measured). |
| P3 skip unchanged room state | **Built (lossless)** | `room_state` upserts carry `WHERE room_state.value IS NOT excluded.value`. Measured: 62% of room-state calls now write nothing (8,629 calls, 3,243 rows in 45 minutes). |
| P3 slower checkpoints | **Not done** | It would widen the restore window, which the approval does not allow. Player and round checkpoints keep their 2.5 s and 1 s cadence. |
| P4 longer flush | **Not done** | It would widen the loss window, and P1 makes it unnecessary. |
| Rollback mode (new) | **Built** | `CITY_AGGREGATES=rows`, `POST /api/city/v1/unpack[?id=]` and `scripts/unpack-city-aggregates.mjs` drain every GameRoom's packs into its per-key tables before a rollback. Runbook: [live service](../live-service.md#rolling-back-past-packed-aggregates). |

**Observed (local workerd, comparable runs on Halla; rows written as the cursor counters Cloudflare bills, alarms included):**

| Pair | Base `4041deb` | Branch | Change |
| --- | --- | --- | --- |
| 45 min, merges included | 246,454 rows (9 rats) = 329k per room-hour | 28,415 rows (8 rats) = 38k per room-hour | **−88.5%** (per rat-hour −87%) |
| 10 min, 1 | 68,967 (9 rats) | 5,636 (8 rats) | −91.8% |
| 10 min, 2 | 65,376 (10 rats) | 6,022 (7 rats) | −90.8% |

Rows read in the 45 minutes fell from 109,670 to 27,863: the per-minute prune scan is gone. The bot roll differs between sides (6–9 bots), so the per rat-hour figure is the fairer comparison. What remains on the branch: events 54% (unchanged per event), player checkpoints 25%, room state 11%, packs 4%, respawn timers 4%, alarms 2%.

**Projected for production [ESTIMATE].** The measured production rate (342k rows per room-hour, 5 Oct) times the observed 45-minute ratio (0.115) gives **about 39k rows per room-hour**. Not measured on Cloudflare: nothing is deployed.

| H (room-hours/day) | Before, $/day (measured rates) | After, $/day (projected) |
| --- | --- | --- |
| 1 (current traffic) | 0.00 | 0.00 |
| 24 | 7.20 | 0.04 |
| 100 | 38.20 | 2.80 |

The rows written included each month then cover about 1,280 room-hours instead of 146. At today's traffic the saving is **$0.00 a day**: both stay inside the allowance, above the $5 a month minimum.

**Rollout prerequisites:**
1. Tyler approves the live migration. On the first start after the deploy, every GameRoom (16 production and 8 staging objects with storage) creates the empty `city_packs` table, and from then on new aggregates go to packs. The DDL is additive; no row moves or is deleted.
2. Deploy staging first with `npm run deploy:staging` from a clean, committed tree. Play a seat, then check `/api/heat/v1` and `/api/city/v1/places` against the values before the deploy. Then deploy production.
3. Treat the [rollback procedure](../live-service.md#rolling-back-past-packed-aggregates) as part of the release. A plain rollback past this build hides the counts recorded since, until rolling forward. Instead, deploy with `CITY_AGGREGATES=rows` (an ordinary full deploy), run `scripts/unpack-city-aggregates.mjs --env <env>` until it reports `drained: true`, then roll back. The local E2E proves this sequence. The drain has not run against Cloudflare; its read-only `--list` lists 16 production and 8 staging objects.
4. Afterwards, compare a day of `durableObjectsPeriodicGroups` `rowsWritten` per active hour against 342k, to replace the projection with a measurement.

## 5. Decisions for Tyler

1. **Approve the live migration and deploy?** Staging, then production, with the rollback procedure above. Nothing has been deployed.
2. **Drop `AUTOINCREMENT` from `city_events`?** It would save about 5k of the ~38k rows per room-hour that remain. It needs a table rebuild or rename: a schema migration with its own rollback and read-path work. Recommendation: not now.
3. **Slower checkpoints (P3 cadence)?** Player poses every 10 s instead of 2.5 s, and the round every 5 s instead of 1 s, would save about 7k rows per room-hour. A room restored after a crash or deploy would then resume from older state. Not built, because it widens the restore window.
4. **Jev:** the TypeSafe cap (`JEV_DAILY_BUDGET_USD` = 25) is now the largest possible daily spend, and it is outside Cloudflare. Actual spend was **not measured** (the token cannot read Workers Logs; the `jev` log line every 60 s and the `jev-budget` ledger in `Matchmaker` hold it). Is the cap still right?

## Method

- **Cloudflare usage:** GraphQL Analytics API with the wrangler OAuth token. DO namespaces were mapped to script and class through `GET /accounts/{id}/workers/durable_objects/namespaces`. Production `GameRoom` is namespace `70ceefe8…`; staging is `d8468295…`. Daily data covers 26 Sep–6 Oct; 15-minute data covers the idle release.
- **Per-statement rows:** a throwaway Vitest probe on `@cloudflare/vitest-pool-workers` (workerd, with the `wrangler.jsonc` bindings). It seated one human with `seatHuman`, wrapped `ctx.storage.sql.exec` to keep each cursor's `rowsWritten`/`rowsRead` (the counters Cloudflare bills) and counted `setAlarm` calls, then let the room run on its own 30 Hz loop for 130 s and 620 s. The counters went out through the JSON reporter (`task.meta`). Results: 130 s, 15,347 rows written; 620 s, 47,391 rows written plus 129 alarms. The probe and its JSON output were deleted after measuring. No Jev key in tests, so `city_minds` and Jev traffic are absent from the probe.
- **Human traffic:** `https://ratdetective.online/api/city/v1/digest`, 30 Sep–6 Oct: 6.6 human rat-hours, 1,043 bot rat-hours.

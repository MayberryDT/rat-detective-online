# Server CPU, work diagnostics and delivery gating — 27 September 2026

**Status:** see [Release](#release). Protocol 18 is unchanged; there is no client change.

## Why

Production `public-live-v2` (0 humans, 7 bots) used **26–34 s of Durable Object CPU per minute** throughout 08:25–09:28 UTC, measured with Cloudflare `durableObjectsPeriodicGroups.cpuTime`. That is roughly half a core, continuously. Its room diagnostics report `tickCostAvgMs: 0` because Workers freeze clocks during synchronous work, so the existing cost metric could not show this.

## What changed

All changes produce the same results as before. None changes simulation results, bot decisions, tuning, the protocol or persistence.

| File | Change |
| --- | --- |
| `src/shared/BotNavigation.ts` | The static walk graph (solid buckets, surface columns, walk edges, launch links) is cached per `WorldSpec` object. Before, each round that replaced bots created a new controller, which re-probed the whole city. Flow fields stay per controller. `GameRoom` always gives `this.world` a new object and never edits it in place, so the cache cannot be stale. |
| `src/shared/SpatialRayQuery.ts` | `refresh()` first compares the stored static poses in a flat array. If nothing moved, changed type or was added/removed, it skips the full `Map` rescan and BVH rebuild. SAP ranks are rewritten only for bodies whose axis order changed. The existing tests cover moved statics, type changes, add/remove and a full 120-ball real-map burst against Cannon's own raycast. |
| `ChaosSimulation`, `ServerBotController`, `RoomDiagnostics`, `GameRoom` | Every 5-second room diagnostic window now includes `work`: `navExpansions`, `navEdgeProbes`, `botRays`, `chaosRays`, `physicsSubsteps`. |

Considered and not done:

- **20 Hz staggered bot decisions.** Measured locally, decisions plus line-of-sight rays are about 0.27 of 3.6 ms per step. Staggering would save about 5% and change bot timing.
- **Duplicate checkpoint snapshot.** There isn't one: the tick passes its already-built state to `checkpointGame(state)`.

## Local evidence

`output/server-cpu-2026-09-27/bench.mjs` (ignored directory) mirrors the room tick: two 60 Hz steps, snapshot, compact encoding and a 1 Hz checkpoint. It uses 9 bots, 1,800 ticks, a bot-controller replacement at tick 900, fixed randomness, and a Workers-like frozen `performance.now`. The baseline is built from `git show HEAD:`.

| Ticks | Baseline ms/tick | Candidate ms/tick |
| --- | ---: | ---: |
| 0–300 (cold) | 6.84 | 5.62 |
| 300–900 | 3.27 | 2.56 |
| 900–1200 (after replacement) | 5.70 | 1.96 |
| 1200–1800 | 3.11 | 2.40 |

The trajectory hash (every bot pose at every tick plus the ball count) is identical: `30306548d8cbf182`. The absolute numbers are single-machine timings.

## Hosted evidence

Private `rat-detective-capacity-test` fixture, full lobby, cap 10, seed 341283204. Baseline versions `63b876ec…` and `d1633607…`; candidate versions `89bcc3bf…` and `5f3e49a4…`. The driver was one idle `receive=welcome-only` participant; there was no gameplay input. CPU comes from Cloudflare per-object analytics. Fresh rooms with identical code varied from 14 to 31 s/min, so the comparison uses rooms that kept running while versions switched. Minutes that contain a deploy are excluded.

| Room | Baseline s/min | Candidate s/min | Change |
| --- | --- | --- | ---: |
| `d96709…` | 25.4, 24.4, 25.6, 28.5, 27.3, 24.7, 24.2 (avg 25.7) | 20.8, 19.2, 19.9, 19.8, 19.7, 19.8, 18.4 (avg 19.7) | −23% |
| `cd7f04…` | 18.2, 16.4, 15.3, 15.8 (avg 16.4) | 11.4, 12.2, 12.0 (avg 11.9) | −27% |

Other observations from the candidate `work` counters:

- `navExpansions` was 28,896 in every window: the 96-per-step limit, reached on every step. Flow fields never finish because goals keep moving. This is now the largest measurable steady cost. The limit is accepted bot tuning ("bounded search work") and was left unchanged.
- The worst checkpoint settlement was 899 ms in a baseline window and 174 ms in the candidate capture. These were different incident mixes, so this does not show a change.
- `tickGapMaxMs` stayed at 33 and `droppedSimulationMs` at 0.

The raw captures are `analytics*.json` and `tail-*.json` in the same output directory. `wrangler tail` sampled under load (the driver room shows 9 of about 34 windows), so tail CPU totals are not used.

## Checks

- `npm run typecheck`: pass.
- Client suite 1,182/1,182, script suite 123/123, Worker suite 173/174.
- The one Worker failure, `matchmaking.test.ts` › "does not let an unreserved title connection steal a promised admission slot", also fails on the unmodified tree (2 of 5 runs). It's a flaky test that comes from the random 6–9 bot count; this change didn't cause it.
- `npm run build`: pass (the existing large-chunk warning remains).

## Limits

- No human playtest. Bot behaviour is exact in the local deterministic bench, but live rooms are random. No per-client frame arrival was measured in production.
- Checkpoint gating was measured with one full-feed client from Veelox. Round-trip time differed between runs, so only the write-tick share and comparisons within each run are firm.
- Private fixtures expire by themselves; their rooms stop through the fixture's `alarm` and tick patches.

## Release

Tyler asked for the change to be committed and deployed to production.

- **Commit and version:** commit `dd5aabb`, Worker `360dbcdd-231f-4d83-aaec-6247022a1a46`, deployed with `npm run deploy:production` at about 10:02 UTC. Predecessor `ed58154d-d1ee-49be-8a49-7bb00729c72f`. Client `index-paIXtQs8.js` / `createGame-DlDEvPeh.js`, protocol 18. Not pushed to GitHub.
- **Pre-deploy checks:** typecheck and build pass, `npm audit` finds 0 vulnerabilities. Client 1,182/1,182, scripts 123/123, Worker 174/175. The one failure is the known flaky title-slot test.
- **Live service:** `/health` ok. `/status` showed `public-live-v2` playing, 0 humans / 6 named bots, and world version 2 with seed 341283204. The root HTML and all 58 hashed assets matched `dist` byte for byte. (`/index.html` redirects to `/`, which matches `dist/index.html`.) The old host returned 301 to `https://ratdetective.online/x?y=1`, preserving path and query.
- **Live diagnostics** (tail, 10:03:47–10:03:57): the canonical room reported `tickGapMaxMs` 33, no dropped simulation, checkpoint settlement at most 94 ms, and `work` counters. Edge probes fell from 6,176 to 139 per window as the walk graph warmed.
- **Production CPU** (`durableObjectsPeriodicGroups.cpuTime`, room `b93877…`): 09:30–10:01 before, mean 28.9 s/min (range 25.8–31.1); 10:04–10:10 after, mean 21.3 s/min (range 19.7–22.6), **−26%**. The minutes containing the deploy are excluded. The roster was 6 bots right after deploy, restored from the persisted roster. The earlier window was flat, but its bot count wasn't observed directly.

## Delivery gating (step 3)

Any Durable Object storage write holds that object's outgoing messages until the write settles (the output gate).

To attribute delays frame by frame, a private diagnostic fixture stamped every chaos frame with two values: the storage writes issued in its tick, and the time since the latest write. That stamp existed only in `output/checkpoint-gate-2026-09-27/deploy-gate-fixture.mjs`, never in application source. The test used a full lobby, cap 10, one full-feed legacy client and a 240-second hold with a 30-second warm-up. "Delay" means arrival minus source time, measured against the lowest value within ±500 ms. That removes both the Worker's wandering frozen clock and the network floor.

| Build | Ticks that wrote | Frames from write ticks: delay p50 / mean | Frames with no write in 200 ms: p50 / mean |
| --- | ---: | --- | --- |
| Before | 13.4% | 64 / 76 ms | 16 / 25 ms |
| Routine poses folded into the 1 Hz checkpoint | 5.2% | 35 / 45 ms | 13 / 19 ms |
| Plus: send first, then write routine checkpoints | 2.2% | 60 / 75 ms (critical and forced writes only) | 17 / 22 ms |

In the last build, frames whose tick wrote its routine checkpoint after sending arrived with p50 17.6 ms and mean 22.7 ms, the same as clean frames. The following frame was held partly: p50 27 ms. Round-trip time varied between runs (p95 106, 34 and 32 ms), so only comparisons within a run and the write-tick shares are firm. Before this, per-rat 2.5-second checkpoint phases scattered bot pose writes across separate ticks.

What changed in `GameRoom`:

- Non-forced `persistPlayer` calls that are due add the player to `dueCheckpoints` while the room ticks.
- `checkpointGame` writes those players inside its existing transaction. It skips and clears any player already removed.
- Forced writes stay immediate (lifecycle, damage, respawn, join, reconnect, correction), and so does any write when no tick loop is running.
- Signature-change checkpoints (case owner/return, Dispatch serial/phase, assignment revision) are still written before that tick's frames are sent. Routine one-second checkpoints are written after the frames.
- Other ticks already send state that hasn't been saved, so a client never depends on a routine checkpoint. Each stop path of the tick loop calls `checkpointGame`, which flushes pending poses.

The regression test `gameRoom.test.ts` › "defers routine poses to the running room checkpoint without resurrecting removed rats" covers three things: no write in the movement event, the latest pose and true activity time at the next checkpoint, and no re-insertion of a removed rat.

The matchmaking test "keeps bots when humans join…" also fails occasionally: 3 of 8 runs on unmodified HEAD, 2 of 8 with this change. So does the title-slot test noted above.

# Smooth play, first pass: entry, replays and a server stall (8 October 2026)

Work under [the smooth-play plan](../plans/smooth-play-2026-10.md), approved by Tyler on 8 October ("do it"). Branch `perf/smooth-play-202610`, staging only. Production is unchanged.

**Staging now:** Worker `c486188f-919a-4506-814f-ae20142a0004`, build `staging-2026-10-08-6537a3d`, client `index-DbIC0R2D.js`, **protocol 39**, layout 7, `mindVersion` 16.

All measurements below come from Halla: a headless Chrome on a shared machine, muted, with `agent=1`. Timings on Tyler's laptop in Brave are still to be taken.

## Entry (E1–E3)

`scripts/verify-entry.mjs`, staging, two runs per case. Artifact: `/home/halla/build/rat-detective/smooth-play-202610/entry/entry-6537a3d.json`.

| Case | Baseline `23fa1e1` | `be36a9d` (morning) | `6537a3d` |
|---|---|---|---|
| Cold room, click after load: click to play | 5.2 s | 7.0–8.7 s | **2.8–3.1 s** |
| Warm room, click after load: click to play | 2.5 s | 1.5–1.6 s | 1.5–1.6 s |
| After 45 s on the title: click to play | 5.1 s | 6.5 s | **2.4 s** |
| Held seat, then the real join: join to welcome | none | none in the check (4.9 s on a prepare socket) | **0.3 s** |
| Cold, click at once: welcome after the client is ready | — | 0.35–0.54 s | 0.19–0.21 s |

All nine checks (EN1–EN9) pass. The early-click case still takes about 14 s in total, because the headless Halla client needs 12.8 s to load. That is the client-load part (E4), which must be measured on the laptop.

`node scripts/verify-idle-room.mjs` passes on `6537a3d`: no bots, ticks or storage writes before the first human or after the last one leaves. Artifact: `idle-room-6537a3d.json` in the same folder.

### What was slow, and the fixes

A probe sends a ping every 250 ms through a cold join. Inside a Durable Object the clock stands still while code runs, so pongs stamped with the same server time show the room was blocked. Probes on staging found these causes:

1. **Every wake read every stored event.** `CityStore.pruneEvents` ran `DELETE FROM city_events WHERE day < ?`. There is no index on `day`, so the first flush after each wake read the whole table: **891,152 rows** on staging, none deleted. That synchronous block ran at the first human's join, and the welcome, made on time, arrived 3.8–5.8 s later. Events are inserted in time order, so the prune now walks from the oldest row to the first one it keeps and deletes by key range. It reads 2 rows now (`8d2a895`). The last-pack lookup scanned 3,284 packs; `city_packs.id` now has an index (`f14d0e1`). Both scans report their rows in the room diagnostics log as `cityScans`.
2. **A held seat did not play.** The tick returned early until a human had joined, so a held join woke the room but simulated nothing. The first ticks' work (bots' first routes and decisions) then landed on the join, about 1 s. A held seat is a human admitted and joining, which the human-only rule already allows (`humanSlots`), so it now ticks; its 20 s lease still ends an abandoned hold (`6537a3d`). The costly second now falls during the hold, about 1.7 s after Enter, while the browser loads.
3. **The real join after a hold** sent the companion listing before the welcome; the listing now follows it. The city recorder is built at the hold (`e368aea`).

Not found in the Node harness or local workerd: both had little stored data, and the harness does not freeze clocks. A harness given staging-sized data (900k events, 3.3k packs) joins in 33 ms with the fixes.

## Replays (R1–R4)

`scripts/verify-replay.mjs` plays about 150 s of scripted play on staging, then plays each kept clip fullscreen and in a loop. It records the camera of every frame the replay drew. Artifacts: `replay-<label>.json`, `-raw.json`, `.webm` and `.cpuprofile` under `/home/halla/build/rat-detective/smooth-play-202610/replay/`.

| Measure | Before (`62aaff5`) | Now |
|---|---|---|
| Camera off the rat's recorded look (over 5°) | 100% of frames | 0 of 966 (RP1) |
| Death against the victim's last pose | rats froze before falling | 17 ms (RP4) |
| Clip speed | 0.71× (slow motion) | 0.94–1.01 (RP6) |
| Clips whose rats never moved | 6 of 18 (in 3 of 6 runs) | 0 of 19 since `37edd29` |
| A loop's restart | 230–330 ms (rebuilt everything) | **5–21 ms** |
| A clip's first start | 290–430 ms | 290–350 ms |
| Going fullscreen or saving the clip on screen | a full rebuild (~300 ms) | a restart in place |

Fixes:

- **Clips without movement** (`37edd29`). The client set its server clock once, from the welcome. A welcome handled late, behind loading work, left the clock seconds behind for the session. The recorder stamps roster keyframes and your poses with that clock but server events with their own time. So a clip's starting keyframe sat after the window's events, and the cut kept none of them: the rats stood still. The same error delayed respawn countdowns, weapon and buff expiry and the next round's time in live play. Each chaos state now raises the offset when it shows a larger one; a state is never stamped after it is sent.
- **Loops rebuild nothing** (`d5b4633`, `5f943e3`). Supply props stay and forget their claim and restock history. Rats stay too, and take their keyframe state through `applySnapshot`, the path live play uses on every respawn.
- **Supply props share their merged geometry per kind** (`6e85cdf`). This also helps the welcome in live play, which builds all 33 sites.
- **Dispatch sounds are synthesised once per audio context** (`d5b4633`). A pillar hit spent 21–23 ms building its squawk on every replay play.

**Still failing: RP5** (no frame over 100 ms). Two causes remain:

1. A clip's first start, 290–350 ms. About half of it is building that clip's props and rats.
2. Runs of 110–160 ms frames in sent-flying clips, always at the same spot in a clip. CPU work in those frames is at most 52 ms (source-mapped profile), so they wait on the GPU. This needs a GPU trace on the laptop; Halla's headless GPU cannot settle it.

## Freezes (F1)

The F1 stall reports (frames over 1 s, long animation frames, heap and program counts, connection state) have shipped in every staging build since `e368aea`. They have not been verified end to end: reading them needs the admin key, and no human session has run on these builds. This waits for Tyler's staging session.

The stall found at the join (item 1 under Entry) also blocked every socket in the room for its duration. It ran only once per wake. Steady ticks on staging hold 33 ms gaps.

## Bots and tests

- `mindVersion` 16 (`421114d`): a bot keeps going for a loose case it saw in the last 10 s. Under 13–15 it dropped the case the moment it went out of sight. See [the bot overhaul plan](../bot-overhaul.md).
- **The P4 receipts' test counts were incomplete.** "288 of 288" counted only the worker suite. The client suite had about 86 failures from P4: the case-papers design changed what bots know, and some test fixtures were stale. They are fixed (`7dddc07`, `ef32b1e`). Now: client 1546 passed and 1 skipped, worker 288, scripts 46, typecheck clean.
- Skipped: `aiLiveDiagnostic`, which pursued a carrier known only from the removed ping. Driven through a real simulation, its runs vary (6–8 of 11 bots arrive in 100 s, 1–3 need the room's rescue). One stall spot, in the sewer under the carrier, is older than P4. Both spots are logged in the bot plan.

## Still to do

- E4: profile the client load in Brave on the laptop while Tyler isn't using it.
- R4: build a clip before it plays; take a GPU trace of the sent-flying frames on the laptop.
- F1: Tyler's staging session, then read its stall reports. F2/F3 are guided by those reports.

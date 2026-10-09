# Chaos leaves evidence: build receipt (8 October 2026)

**What:** the batch in [the plan](../plans/chaos-evidence-2026-10.md): chalk outlines, dead rats talk (tips), sewer muck, the lull and the Evening Edition. Protocol 40, `mindVersion` 17.
**Where:** branch `juice/chaos-evidence`, commits `ccb262d`, `9525578` and this receipt's commit; staging Worker `6d0af4c8-e53f-4eae-b80e-8f670d852f77`, build `staging-2026-10-09-9525578`, client `index-B5CbJ2-m.js`. **Not in production.**
**Artifacts (Halla):** `/home/halla/build/rat-detective/chaos-evidence-202610/` (`marks/visual/proof/` stills and `capture.json`; `front-page/` results and round-start stills; `staging/marks-probe.json`). Benchmark JSON: `test-results/server-tick/ab-main.json`, `ab-worktree.json` in the Halla worktree.

## What was checked

| Check | Result |
| --- | --- |
| `npm run typecheck`, `npm run build` | Pass |
| `npm test` | Worker suite 33 files pass. Client suite: 171 of 173 files pass, 1 skipped; `sewerNorthBranches` timed out at 5 s while a benchmark ran beside it and passes alone (8/8). The four client files that first failed did so because their stand-ins lacked the new `setLull` / `frontPage` hooks; with those added they pass (31/31). `node --test test/scripts/*.test.mjs` run on its own: 46/46 pass |
| Headless room, 10 bots, 3 min (`benchmark-server-tick --room --bots=10 --recipients=4 --ticks=5400`, every chaos frame decoded) | 37 chalk outlines, 8 tips, 8 muck runs laid; every frame decoded. The marks cost about 6 bytes a tick on the wire (chalk 5, muck 1, tips under 1) |
| Same run, `main` vs branch | Median tick 5.49 → 5.84 ms, p95 35.5 → 35.9 ms, p99 61.5 → 59.6 ms; client 148.7 → 153 KB/s. The trajectory hash changes (`d4f65969…` → `49ab2fd4…`): expected, since bots now read tips and the room diverges, so the two runs are different games |
| Staging probe (`scripts/probe-city-marks.mjs`, one `agent=1` rat in `public-live-v2`, 180 s) | Welcome on protocol 40, 7 bots, 23 deaths, 5 carriers, 0 errors. 17 chalk outlines and 4 tips arrived; tip arrows ran 24–64 m, the witness had seen the carrier 50–367 ms before dying. **No muck in that window** (the headless room shows muck forms; bots rarely came up from the sewer here) |
| Chalk, tip and muck stills (`VIEWS=chalk,tip,muck node scripts/capture-case-clues.mjs`, Halla GPU, real city materials) | Looked at: the outline reads as a police outline with the fedora by the head; the tip's arrow is clear from the shoulder camera; the note's writing is not readable at that distance; muck reads as olive prints after one fix (first pass was invisible dark brown, and the first outline looked like an insect: both redrawn) |
| Results board (`ui-preview.html`, results action) | Looked at: THE EVENING RAT between rules, dateline `CITY FINAL · CASE #3427 · THE LONG GOODBYE · EXCESSIVE FORCE`, headline `SKY HIGH: WHISKERS LAUNCHED IN THE EAST END`, CASE CLOSED BY, deck; the stats strip and boards still lay out below it at 1440×900 |
| Round start (`ui-preview.html`, briefing action) | Looked at: `CASE #8419 · THE MISSING MOZZARELLA` typed under NEW CASE ASSIGNED |

## Not checked

- **Sound.** The lull (boogie at half, rain up to +80%, the neon hum) was never heard: no audio check was possible here. Its numbers are first guesses for Tyler to judge.
- **Human play.** Whether tips change where players go is for Tyler's play.
- The Strudel draft was not played; its syntax follows Strudel's documented functions but was not run.
- Phones and the small-screen results layout were not captured.

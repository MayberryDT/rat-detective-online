# Automatic highlights pipeline repair — 20 September 2026

Local helper/client repair after the closed 132.57-second session that ended
with an accepted heartbeat, zero catalog markers, and zero clips. Production
Worker **`9dc57656-314d-4f86-88d2-86a5af809b7c`** was deployed 21 September 2026
with matching client `index-DVgbazfd.js` / `createGame-CvRNTVU1.js`. No GitHub
publish. Native GSR clip playback from a human match remains the acceptance gate.

The incident still does **not** have a same-session correlated marker trace, so
this is not a proven root-cause claim for that match. Catalog `markers` rows
remain publication records. The repair makes accepted-but-unsaved markers
visible and keeps control traffic off the save path.

## Current-tree findings versus the handoff

| ID | Status in this tree | Evidence |
| --- | --- | --- |
| F01 publication-only markers | **Fixed.** Journal + save_jobs record received/scheduled/saving/saved/failed. Heartbeats no longer erase last marker failure. | `test/scripts/highlightsPipeline.test.mjs` F01 |
| F02 round-id contract | **Fixed.** Detector uses game UUID when valid, otherwise `capture:{epoch\|id}`. Tests no longer use `r1` as a live envelope. | `src/highlights/protocol.ts`; client + pipeline A01/A02 |
| F03 silent save / tick | **Fixed.** Due work runs from `tick()`; saves run on one media worker; failed/missed jobs stay in the journal. | pipeline D01, D03 |
| F04 eligibility vs heartbeat | **Changed.** Session/heartbeats can accept while capture is off; marker rejection names the failed predicate. Region geometry stays labeled region. | pipeline C01 |
| F05 bridge early-drop / own-message | **Fixed** in source. Own `{channel,payload}` posts ignored; one in-flight start; early markers replay after acceptance; stale session clears live latch. | `test/client/highlights.test.ts` |
| F06 detector rules | **Unchanged** (already correct). Spaced kills do not emit; primed local win does. | client spacing test |
| F07 sequence inheritance | **Fixed.** New document starts at the incoming sequence; heartbeat sequence 2 is accepted after a floor of 100. | pipeline B04 |
| F08 region honesty / auto-rearm | **Changed.** Matching geometry is `region`, not relabeled `window`. Explicit disable/lock sets `arm_held`; tick will not rearm until enable/resume. | `capture.py`, `service.py` |
| F09 sidecar header | **Fixed.** Parser skips non-numeric header rows. | pipeline C04 |
| F10 tiny-file probe | **Fixed** for non-fake/require_real_media. Tiny fake files still skip probe only in fake tests. | pipeline C04 |

## What was not the proven 132-second cause

An accepted heartbeat plus zero catalog markers is compatible with an accepted
marker whose save later failed, a rejected marker whose last error was
overwritten, or no detector emission. This repair closes the silent-failure
paths. It does not reconstruct that session’s live round/winner/save command.

## Checks run

- `node --test test/scripts/highlightsPipeline.test.mjs test/scripts/highlightsService.test.mjs test/scripts/highlightsRepair.test.mjs test/scripts/highlightsProtocol.test.mjs` — pass
- `npx vitest run --config vitest.client.config.ts test/client/highlights.test.ts` — 16 pass
- `npx tsc --noEmit` and `npx tsc --noEmit -p test/tsconfig.json` — pass
- `python3 -m py_compile` on changed helper modules — pass
- `node --test test/scripts/highlightsMedia.test.mjs` — pass
- Installed helper restarted on Veelox; settings still `"enabled": true`;
  snapshot now exposes `lastMarker`, `lastMarkerFailure`, and `captureFacts`.
  No game window was open; capture was not armed.

Production deploy 21 September 2026: `npm run deploy:production` uploaded
Worker `9dc57656-314d-4f86-88d2-86a5af809b7c` (predecessor
`c2cebcf0-0d78-491e-83ac-e0ac072caa4c`). Live `createGame-CvRNTVU1.js` byte-matches
the local dist hash and contains `rat-detective-highlights`, `capture:`, and
stale-session handling. `/status` showed `public-live-v2`, world seed
341283204 / version 2, **0 humans / 7 named bots**, phase playing. Old-host
root redirects to `https://ratdetective.online/`. Local helper remains enabled
and waiting for the game.

Not run: real GSR replay save, full native messaging path, human match
playback.

## 21 September playtest — GSR integer seconds

Tyler’s ~370-second session `0d276fcc-5742-40bd-a135-99d04824613e` produced a
dropdown session, 15 journal markers (double-kill, round-win, and others),
eligibility `ok`, and 13 save jobs. Every save failed with:

`gsr-cli save-replay` requires an integer > 0; the helper sent decimals such as
`18.34`. Installed `gsr-cli` examples use `save-replay 30`. The helper now
ceils to a whole second in `1..45`. Local helper restarted with Automatic
highlights still on. No production deploy: this is helper-only. The discarded
replay buffer from that match cannot be recovered.

## Native remainder

1. Close any already-open game window and Enter City again so the new hashed
   client loads.
2. After a clustered local kill or local win, `lastMarker` / `marker_journal`
   should show `saved` or an explicit `failed`/`missed`/`rejected` reason.
3. Play the clip from Highlights. That remains the human acceptance gate.

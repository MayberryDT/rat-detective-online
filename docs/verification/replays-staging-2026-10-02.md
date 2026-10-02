# Replays on staging, 2 October 2026

Exhibits (X1 to X5 of the [replay plan](../replay-plan.md)) are built and running on staging. Production waits for Tyler's OK.

| Item | Value |
| --- | --- |
| Branch | `replays` (not merged to `main`), head `f6d2d90` |
| Staging | Worker `db5ce731-24c3-4e7b-84db-cb8ee0571cd2`, build `staging-2026-10-02-f6d2d90`, `INCIDENTS=crossfire` |
| Protocol | 30 (the `highlight` marker and the client `exhibit` message); layout unchanged (7) |

## What was checked

- Typechecks clean. Worker 281 of 281, client 1,554 of 1,554, scripts 46 of 46. Build passes. `test/client/aiLiveDiagnostic.test.ts` failed once under full-suite load and passed alone 3 times on both `main` and the branch: a timing flake, not this change.
- End-to-end on staging with a muted agent browser (`scripts/exhibits-check.mjs`), the run named `e2e-final2`: 90 seconds of bot play, then an admin end of round. Every check passed:
  - the results board showed 3 exhibits: Exhibit A sent flying ("Sergeant Mousley files Inspector Rind under airmail"), Exhibit B a multi-kill, Exhibit C a long shot
  - the standings stayed readable beside them, and the frame played (the tape clock moved)
  - SAVE downloaded `rat-detective-sent-flying-2026-10-02-1529.webm`: 1.9 MB, VP9 and Opus, 1600×813, 7.7 seconds with its duration written in. It decodes cleanly, and its sound is real (mean −18 dB, peak −0.5 dB). The overlay, caption and site mark are in the picture
  - no page errors; the client kept 7 clips (about 8.6 MB by its estimate)
- Artifacts stay local (`output/` is not in Git): `output/replay/e2e-final2/` on Veelox has the screenshots, `exhibits.json`, the saved clip and a contact sheet.
- Independent review: 5 findings (2 major, 3 minor), all fixed in `38a084b`. Replay dust and supply cues no longer reach the live pools, replay zaps play on the replay bus, the overlay uploads only when repainted, loops rewind instead of rebuilding, and recording your rat allocates nothing on skipped frames.

## Found and fixed along the way

- Admin end of round broke every client. Clients rejected a `gameWon` (and every later `welcome`) whose result fell below the mode's target, which is what `scripts/admin.mjs end-round` produces. The connection then failed with "The server sent an incompatible game update." `parseAssignment` now accepts an admin result below the target. Production (protocol 29) still has this bug until this release ships.
- Chrome 153's MP4 recording of the canvas decoded as corrupt after a second or two. Saves now use WebM (VP9 and Opus), with the duration added by `fix-webm-duration`.
- The clip shelf's size estimate counted overlapping clips twice and kept only 3. Shared entries now count once, and the budget is a 16 MB estimate.

## Detection on staging (Crossfire only, bots)

From the digest (`/api/city/v1/digest?days=1`) after about 1.5 hours: 116 moments.

| Kind | Count |
| --- | --- |
| sent flying | 59 |
| steal and score | 15 |
| carrier down | 12 |
| multi-kill | 11 |
| round winner | 5 |
| bank shot | 4 |
| splashdown, delivery | 3 each |
| pileup, body blow, laser ricochet, long shot | 1 each |

These never fired: squashed, snapped and shot, airborne kill, so close, last meal, fresh spawn, and from beyond. Big Cheese and backfire cannot fire on a Crossfire-only staging. Sent flying is half of all moments; X6 tunes this with live data.

## Not checked

- No human has watched or heard an exhibit yet, and nobody has played on a phone.
- Frame time on the board with an exhibit playing was not measured on a weak laptop.
- Saving was checked only in headless Chrome 153, not in Firefox or Safari.

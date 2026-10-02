# Exhibits release, 2 October 2026

Tyler: "love it. send it live."

| Item | Value |
| --- | --- |
| Worker | `583fa765-d3e6-44c7-bb23-4f71cb40e17f` (previous: the `f6fc4a3` admin-key-link build) |
| Build | `production-2026-10-02-c7c67bb` |
| Client | `index-D_zzqqmF.js` |
| Commit | `c7c67bb` (merge of `replays` into `main`) |
| Protocol | 30; layout 7; `mindVersion` 12 |
| Era | `exhibits` in `design/data/eras.json` |

## What shipped

- Highlight detection on the server: 21 kinds, `highlight` markers to every player, `highlight` and `exhibit` city facts, and counts in the digest ([detection](../replay/detection.md)).
- Each client keeps clips of the round's moments and replays them through an isolated copy of the game's view, with a director camera, slow motion and the game's sounds ([playback](../replay/playback.md)).
- The results board takes the screen: the standings on the left, and a right column with the exhibit screen and its 3 cards above a Case File whose awards stay at full size ([exhibits](../replay/exhibits.md)). FULLSCREEN and SAVE work; SAVE downloads WebM with its duration.
- Admin end of round: clients no longer reject a result below the mode's target or awarded to a dead leader. Under protocol 29 either one made every client fail with "incompatible game update".

## Checked

- The staging evidence is in [the staging receipt](replays-staging-2026-10-02.md). The last staging run (1920×1080) passed every end-to-end check; its board screenshot is `~/Pictures/rat-detective-results-board.png` on Veelox.
- After the deploy, `/health` reports the build above. `scripts/admin.mjs status` shows `public-live-v2` alive with 9 bots and every incident. The production digest for this build already counts moments: sent flying 1, carrier down 1, steal and score 1 within the first minute.
- After the board rearrangement, only the typecheck was run before release (Tyler: no more testing). The full suites last passed at `38a084b`.

## Not checked

- A human playing an exhibit on production, phones, Firefox and Safari saving, and frame time on a weak laptop.

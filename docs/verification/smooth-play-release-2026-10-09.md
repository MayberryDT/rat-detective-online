# Case papers and smooth-play release — 9 October 2026 (UTC)

**LIVE and verified.** Tyler, 8 October: "Alright, that feels really nice. Let's commit everything, merge everything, clean it all up, and deploy it live."

| Environment | Worker version | Build | Predecessor |
| --- | --- | --- | --- |
| Production | `e92c8831-e6e3-4f7e-a8cc-c2e23ba6880b` | `production-2026-10-09-648ff6e` | `9d2c12a6-a89f-485c-9ca8-87d76b02e661`, `production-2026-10-06-2822d1a` (protocol 33) |
| Staging | `c486188f-919a-4506-814f-ae20142a0004` | `staging-2026-10-08-6537a3d` | the same source except the docs-only commit `648ff6e` |

Client `index-DbIC0R2D.js`, **protocol 39**, layout 7, `mindVersion` 16, era `case-papers` in `design/data/eras.json`. Source `648ff6e` on `main` (GitHub `master`), deployed with `npm run deploy:production` from a clean worktree; the command finished at 00:40:35 UTC. The production build `2822d1a` is in its ancestry, and so is the packed-storage build `2476135`.

## What went live

Everything on `main` since the 6 October release (53 commits):

- **The P4 case papers and paw prints** ([plan](../plans/noir-physical-clues.md); receipts [P4](physical-clues-2026-10-07.md), [repair](noir-papers-v2-2026-10-08.md), [paw prints](paw-prints-2026-10-08.md)).
  - What's gone: the case ping (the carrier's through-walls flash every 4 s), the case beacons and the screen locator.
  - What replaces them: persistent noir papers lie at corners and long stretches along the way to the case, with paw prints across the gaps between groups. A gust catches the eye.
  - Bots know a loose case or a carrier only from their own sight and the papers (`mindVersion` 13–15). Since 16, a bot keeps going for a loose case it saw in the last 10 s.
- **Smooth play** ([plan](../plans/smooth-play-2026-10.md), [receipt](smooth-play-2026-10-08.md)):
  - Enter City holds a seat and wakes the room at the click (protocol 38). The room ticks during the hold.
  - City events are pruned by key range, so a wake no longer reads every stored event at the first join. `city_packs.id` has an index.
  - The client's server clock follows the chaos stream.
  - Each rat's look travels in movement (protocol 39). Replays play through the recorded look at real speed, and loops rebuild nothing.
  - Frames over 1 s are reported in `perf` facts (F1).

## Verification

- **Before the deploy, on `648ff6e`:** typecheck clean; client 1546 passed with 1 skipped (`aiLiveDiagnostic`, see the bot plan); worker 288; scripts 46.
- **Staging, same source:**
  - `verify-entry` passes EN1–EN9. A cold room clicked after load plays in 2.8–3.1 s, against 5.2 s at the baseline.
  - `verify-idle-room` passes.
  - `verify-replay` passes RP1, RP2, RP4 and RP6. It fails RP5 (frames over 100 ms at a clip's first start, and GPU-bound frames in sent-flying clips; see the smooth-play receipt).
- **Production, after the deploy:**
  - `/health` reports `production-2026-10-09-648ff6e`. `/status` shows `public-live-v2` at 0 humans and 0 bots, world seed 341283204, version 7.
  - The root page serves `index-DbIC0R2D.js`, with the Open Graph tags and `/share-action-v2.png` (200, image/png). The old host redirects with path and query preserved (301).
  - One `agent=1` seat (held join, then the real join, as the browser does) got its welcome 154 ms after the join on protocol 39. The room showed 6 bots. Chaos, movement and shots streamed. The room returned to 0 humans and 0 bots after the reconnect grace.
  - Aggregates: `check-hosted-aggregates` took a snapshot, played 60 s with an agent seat (9 bots), took a second snapshot and compared them. Result: **0 missing, 0 lower**, 38 keys added and 9,502 grown, over 204,161 keys. The snapshot was taken on the new build, after the deploy. It shows the new store (key-range prune, pack index) keeps every count and keeps counting. It does not compare against the predecessor's last state.
  - Artifacts: `/home/halla/build/rat-detective/smooth-play-202610/release/` (snapshots and comparison) and `deploy-production-648ff6e.log`.

## Not shown

- Protocol-33 tabs must reload. The ordinary join and welcome check rejects them with "Reload to continue" (not re-tested in this release).
- **Rolling back to `9d2c12a6` is not qualified.** Room checkpoints written by this build carry the case papers and prints. Protocol-33 code was never run against them. The new index and the key-range prune are compatible with older code. Prefer a forward fix. The packed-aggregate rollback steps still apply to anything older than `2476135`.
- Not measured on a human's machine yet: the client load in Brave on Tyler's laptop (plan E4), the replay GPU frames, and the F1 stall reports from a human session.
- No human has played this build in production yet. Feel is Tyler's call.

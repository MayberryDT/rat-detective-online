# Protocol 32 release: random supplies, 3 October 2026

Tyler: "The Tommy gun feels way better, but now I want to change all the pickups except for the heel. I want them to be random … can we just make that rule and deploy it live? … whatever pickup that spawns is always random."

| Item | Value |
| --- | --- |
| Worker | `02bf9e68-9699-4138-a586-ddc93de49847`, deployed 2026-10-03T15:54:27Z (previous: `f2fc905a`, [protocol 31](protocol-31-release-2026-10-03.md)) |
| Build | `production-2026-10-03-6b47caf` |
| Client | `index-93gja5OR.js` |
| Commit | `6b47caf` on `main` and GitHub `master` |
| Protocol | 32; layout 7; `mindVersion` 12 |
| Era | `random-supplies` in `design/data/eras.json` |
| Staging | `f055f4ee-2f71-4ac1-bcac-a5b27b9cb6d5`, the same commit, every incident |

## What shipped

- Every supply site but a Quick Fix one holds a random pickup of the other six (Ironclad, Hot Pursuit, Stakeout, Tommy Gun, Laser, Mousetrap; `RANDOM_SITE_KINDS` and `randomSiteKind` in `src/shared/pickups.ts`). The site rolls when the room starts, at every round reset and at every claim, so the restock dial shows the next pickup. The 14 Quick Fix sites stay Quick Fix.
- A room restored from storage keeps each site's saved kind (heal sites only take heal kinds). The live room came from protocol 31, so its sites keep their authored kinds until each is first claimed or the round resets.
- The client rebuilds a site's prop when its kind changes, after the claim pop has played. The claim card flies from the nearest just-emptied site.
- Bots need no change: they read each site's kind from the snapshot. Armor trips go to whichever sites hold Ironclad. No non-heal site lies inside a Jurisdiction zone (checked on both seeds), so holding a zone still never hands out Ironclad.
- Protocol 32: open protocol 31 tabs reload.

## Checked

- Both typechecks (the test project's only error is the old missing `three-gpu-pathtracer` module). Worker 282/282 twice; client 1,542/1,542 twice, plus a third run where two tests that draw their own random numbers (`dispatchPillars` "grants the caller exactly one supply", a Mousetrap reward's lockout field; `harbour` case return) failed and then passed alone; neither reads site kinds. Scripts 46/46.
- Tests that needed a particular kind now stock it (`test/client/stockSite.ts`); a new test checks a claim and a reset roll a non-heal site and keep Quick Fix sites.
- Production after deploy: `/health` reports the build; the page serves `index-93gja5OR.js`; `scripts/admin.mjs status` shows `public-live-v2` in Jurisdiction with 6 bots; `scripts/reconnect-check.mjs` 5/5 (33 supply sites before and after).

## Not checked

- No human has seen a site change props in play.

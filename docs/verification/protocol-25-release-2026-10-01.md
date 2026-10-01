# Protocol 25 and the lighter Jev: 1 October 2026 (production)

Tyler's OK: "send it live".

## What is live

| Item | Value |
| --- | --- |
| Worker | `rat-detective-preview`, env `production`, version `88171c4c-a93a-40a3-bc5c-3d0769c59c3d` (deployed 02:03:25 UTC) |
| Build | `production-2026-10-01-6356f81`, stamped on every city fact and aggregate |
| Client | `index-Bw2kUX-i.js` |
| Commit | `6356f81` on `bots/overhaul`, fast-forwarded to `main` and GitHub `master` |
| Protocol | 25; open protocol-24 tabs are asked to reload |
| World | layout 5, seed 341283204 kept |
| Bots | `mindVersion` 6, the lighter Jev ([L4](../bot-learning-plan.md)), with about 1 round in 5 code-only. `$25` a day cap and Jev vars unchanged |
| Incidents | all 13; production ignores `INCIDENTS` |
| Previous | `7888521b-9c3c-4baf-bbf8-6781a13d4dce`, [release A](release-a-2026-09-30.md) (protocol 24, `mindVersion` 5) |
| Staging | `bfa820ef-1a07-40e0-a946-7b7f19367296`, build `staging-2026-10-01-7636575`. It still rolls only Blackout and Big Cheese for Tyler's playtest |

This is era `lighter-jev` in `design/data/eras.json`; `release-a` closes at the deploy.

## What changed since release A

- **Closing Time removed:** three assignments remain.
- **Blackout:** the city goes pitch black and every rat carries a hard flashlight beam.
- **Heavy Big Cheese:** one shot a second, damage 2 plus 1 per size step, and a sphere-swept prediction so big balls no longer clip walls.
- **The lighter Jev:** bots decide only at decision moments, with a stance, and some rounds are code-only.
- **Supply claims:** claim juice for every supply, with Stakeout the strongest. The red stamp now sits on the card's bottom edge, and every Ironclad sound is a heavy plate.
- **Reconnect fixes:** supply sites are no longer doubled, a restored rat turns with the camera and keeps its view, and a running buff no longer replays its claim. See [the reconnect receipt](reconnect-2026-10-01.md).

## Checks

On a clean worktree at `7636575` on Halla, the code is identical to `6356f81`, which adds only docs:

- both typechecks passed;
- the client suite passed (1,535 of 1,535);
- the script tests passed (133 of 133);
- the build passed;
- the worker suite passed 244 of 246. The two failures were in `cityRoom.test.ts`, which passes 12 of 12 when run alone; it fails only under full-suite load and has failed that way before this change.

On production after the deploy:

- `/health` gave `production-2026-10-01-6356f81`;
- the page serves `index-Bw2kUX-i.js`;
- `/status` showed layout 5 with 8 bots playing;
- `scripts/reconnect-check.mjs` passed all five checks with no page errors;
- the digest answers for the new build, recording agent time apart from human time.

## Limits and risks

- Rolling back to `7888521b` returns protocol 24, four modes and `mindVersion` 5. Aggregates are keyed by build, so writes continue.
- Of the incidents, only Blackout and Big Cheese ran live on protocol 25 before this release. The other 11 were covered by tests only.
- Big Cheese and Blackout change shots and sight within this era: compare their rounds apart, as the era notes say.
- On the big pistol, the bots' muzzle point sits slightly below the barrel. This is cosmetic.

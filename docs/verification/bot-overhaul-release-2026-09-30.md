# Bot overhaul release: 30 September 2026

Tyler: "Send it live… make sure you're recording everything… Don't ship it without input recording."

## What went live

| Item | Value |
| --- | --- |
| Worker | `aecb77d2-8d51-4792-a5fb-af077c036c3d` (the deploy `16dcf333-cbd3-43f8-bb1c-1f49f3905121` plus the `TYPESAFE_API_KEY` secret) |
| Client | `index-D5qko-pp.js` |
| Commit | `c878e52` on `main`, pushed to GitHub `master` |
| Protocol | 23 (unchanged; the new controls fields are optional) |
| Layout | 3 (unchanged) |
| Previous version | `d5c52eb9-ab32-471e-a439-8ec405e83899` (city overhaul, old bots) |
| Deployed | 2026-09-30 06:46 UTC |

Contents: the bot overhaul (`mindVersion` 3): the code mind for the empty city, the Jev mind while a human is playing, the $25 a day budget ledger (`JEV_DAILY_BUDGET_USD=25`, `JEV_MODEL=jev-1.13.0` in the production vars), bots driving the shared rat body with `RatControls`, and controls recording for every rat.

## Checks before release

Run on Halla from a clean worktree of `c878e52`:

- both typechecks passed;
- worker suite: 227 of 230 passed; the three failures (matchmaking roster packing, persistentBots Evidence Tampering and the ten-rat join) are known load flakes and passed when rerun alone (21 of 21);
- client suite: 1,491 of 1,492 passed; `aiLiveDiagnostic` passed when rerun alone;
- script tests: 125 of 125 passed;
- build passed.

## Checks after release

- `/health` 200; `/map` 200; `/api/city/v1/digest` 200.
- `/status`: `public-live-v2`, seed 341283204, world version 3, 9 bots, playing.
- The root serves `index-D5qko-pp.js`. Its `createGame` chunk sends `controls:{f,r,j,fx,rx}` with movement.

## First session with humans (06:46–07:39 UTC)

Tyler and a friend played several rounds. The production archive was mirrored to Halla (`scripts/city-mirror.mjs`) and read with `scripts/motor-compare.mjs --mind=3 --since=2026-09-30T06:46:00Z`. The accuracy figures come from a scratch script (`output/polish/accuracy.py`, not committed).

Recording: 27.6 human and 95.3 bot fight-minutes; human controls cover 27.3 minutes, so input recording works for humans and bots. Jev answered 18,172 requests with no failures, costing $0.80 in total ($1.11 an hour while on); 81% of decisions were Jev's.

### Accuracy by distance

Hits are every non-explosive rat-on-rat hit (`damage` facts), grouped by distance at impact. Shots are grouped by the distance to the rat nearest the aim line when fired; bot shots are 1-in-10 samples weighted by 10.

| Distance (units) | Human hit rate | Bot hit rate |
| --- | --- | --- |
| 0–5 | 25% | 48% |
| 5–10 | 9% | 30% |
| 10–15 | 10% | 17% |
| 15–20 | 8% | 11% |
| 20–30 | 10% | 10% |
| 30–45 | 10% | 9% |
| 45–70 | 10% | 7% |
| over 70 | 5% | 3% |

- Round ledgers (every shot): humans hit 5% of shots, bots 3%.
- With a rat in sight, bots hit 12% of shots and humans 9%. Bots fire 75% of their shots with no rat in sight; humans 40%.
- Kills: humans killed bots 165 times; bots killed humans 51 times.
- Humans aim a steady 0.25 seconds behind a crossing rat at every distance. This matches the client showing remote rats in the past (interpolation plus ping), which the server's 250 ms lag compensation allows for. Human aim error measured on the server is therefore inflated; hit rate is the fair comparison.

### Inputs (human against bot)

| Measure | Humans | Bots |
| --- | --- | --- |
| Strafe key held (median) | 314 ms | 116 ms |
| Strafe flips a minute | 22 | 54 |
| Trigger pulls a fight-minute | 261 | 111 |
| Aim held still | 44% | 28% |
| Flicks a fight-minute | 6.2 | 11.2 |
| Pulls while strafe-jumping, a minute | 27.5 | 6.5 |
| Pulls within 150 ms of a jump | 10% | 4.5% |
| Jump presses a minute | 20 | 12.7 |
| Controls released | 4.9% | 9.3% |
| Forward held | 56% | 43% |
| Flick to pull (median) | 225 ms | 231 ms |
| Pulls while strafing | 58% | 60% |

Gaps: overall 0.28; inputs 0.39 (alone 0.34, pairs 0.25, all 0.60).

## Limits

- Two humans over about 50 minutes; per-band human samples under 250 shots (under 10 units) are small.
- Actor numbers change between rounds, so the data does not say which human was Tyler.
- Rollback to `d5c52eb9` brings back the old bots; the vars stay in `wrangler.jsonc` but the old Worker ignores them.

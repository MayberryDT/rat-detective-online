# Protocol 26: case grip, bot archetypes and the case batch, 1 October 2026 (production)

Tyler's OK: "We can go ahead, commit everything, and merge the branch."

## What is live

| Item | Value |
| --- | --- |
| Worker | `rat-detective-preview`, env `production`, version `a3b3d924-925f-47ac-a30e-5e5a93d46d33` (deployed about 17:53 UTC) |
| Build | `production-2026-10-01-6570125`, stamped on every city fact and aggregate |
| Client | `index-CnzpYiB8.js` |
| Commit | `6570125`: `bots/overhaul` fast-forwarded to `main` and GitHub `master` |
| Protocol | 26; open protocol-25 tabs are asked to reload |
| World | layout 5, seed 341283204 kept |
| Bots | `mindVersion` 7: five archetypes dealt evenly per room, chest-height pre-aim. Jev vars and the `$25` daily cap unchanged |
| Incidents | all 13 |
| Previous | `4ec0fd2e-ae80-4124-a445-14311df7e11b`, [A1 air acting](air-acting-release-2026-10-01.md) (protocol 25, `mindVersion` 6) |
| Staging | `1cd4cba4-fbca-4e4a-8145-28200ca1405f`, build `staging-2026-10-01-5c649fe`: the same code |

This is era `case-grip` in `design/data/eras.json`; `lighter-jev` closes at the deploy.

## What changed since protocol 25

- **Case grip:** a carried case comes loose after 3 enemy balls, each within 2 s of the last. Killing the carrier still drops it.
- **Bots:**
  - They pre-aim at chest height, not head height.
  - They play as five archetypes (sniper, hose, camper, joyrider, gremlin), dealt evenly per room. None is sharper than base.
- **Paper Chase:** first to five deliveries.
- **Jurisdiction:**
  - A zone holds 20 points. They drain to the carrier only while the case is held in it, and then the zone moves.
  - There is no zone clock.
  - Only the active zone is ever shown, to players, the companion feed and bots.
- **The case:**
  - A shot case flies 20% slower.
  - Taking the case brings a random supply, at most once per 20 s per rat.
  - It is rebuilt: a new model, a carry swing, a pickup stamp, and new sounds.
- **Results board:** the round's big numbers, results standings, a race chart and the Case File awards, from a bounded `gameWon.report`.
- **Recording:**
  - Case loose spells and drop causes.
  - `reward` facts.
  - Ping in perf reports.
- **Removed:** the coffee ring by the score card.

## Checks

On Halla at `5c649fe` (code identical to `6570125`, which adds only docs):

- both typechecks passed;
- the worker suite passed 247 of 247;
- the client suite passed 1,541 of 1,541;
- the script tests passed 133 of 133;
- the build passed.

On production after the deploy:

- `/health` gave `production-2026-10-01-6570125`;
- the page serves `index-CnzpYiB8.js`;
- `/status` showed `public-live-v2` playing with 7 bots;
- the old host redirects with its path and query;
- `scripts/reconnect-check.mjs` passed all five checks.

Tyler playtested Jurisdiction and Paper Chase on staging before the release.

## Limits and risks

- **Rollback:** going back to `4ec0fd2e` returns protocol 25, Paper Chase to three and the timed Jurisdiction zones.
- **Not yet seen in a real round:** Excessive Force under the grip with a human, and the results board at the end of a real round.
- **Round length:** Excessive Force still ran 23–31 minutes in bot-only staging rounds, against Tyler's 15–20 target.

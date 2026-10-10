# Bot learning plan

Status (30 September 2026): release A (L1 and L2) is live in production (build `production-2026-09-30-76701ab`, [receipt](verification/release-a-2026-09-30.md)). L4 is built and on staging (build `staging-2026-09-30-8a86be3`) and goes to production on Tyler's OK. There is no wait for baseline human hours: Tyler asked to keep it simple, so eras are compared with whatever play each one gets. This file owns the order, status and acceptance for teaching the bots to decide like Jev, and then like humans. How the data is organised is in [the data plan](data-plan.md). The bot design this builds on is [the bot overhaul plan](bot-overhaul.md).

## Softer combat — 9 October 2026

Tyler approved the first softer-bot pass: increase reaction and tracking delays by 20%, keeping the human behavior and archetypes. Live as mindVersion 21, build `production-2026-10-10-8aafdad` (Worker `652e3479-4485-4c42-9b3c-f8f809f00ea5`).

- Base reaction: 240–480 ms → 288–576 ms.
- Gremlin reaction override: 260–500 ms → 312–600 ms.
- Tracking lag for every archetype: 130–210 ms → 156–252 ms.
- Burst pauses and attention changes wait for the next playtest.

The target is roughly 20% less damage against humans per encounter, not a claim that 20% longer delays directly produce that result. Compare build/mindVersion 20 against 21, excluding agents and admin-touched rounds, with human play and player feedback. The existing recorder continues to capture controls, aim and shot targets. Private seeded full-game simulation checks traversal and combat; it cannot establish human difficulty.

Verification: [softer-bot receipt](verification/bot-softening-2026-10-09.md).

## Goal

Bots that decide like human try-hards, in deterministic code that costs nothing to run. We get there in 2 stages:

1. Copy Jev's decisions into the code mind, so Jev can be switched off.
2. Tune that code against human play as human hours build up.

Jev comes first because it gives thousands of decisions a day. Human hours come slowly.

## Decisions (Tyler, 30 September)

- Humans decide rarely. Jev is asked when something happens, and at most every 10 seconds otherwise, not once a second.
- The decision tree stays small, because the game revolves around the case. A bot chooses a goal, then decides whether to fight or ignore the rats in its way.
- Humans never run past a usable pickup. The only exception is a Quick Fix at full health. This replaces the 13 September rule that limited pickups on the way to an objective.
- Copy Jev first, tune to humans second.
- No data freeze (Tyler, 2 October: "I'm not worried about the JEV data freeze anymore. We can drop that"). Jev keeps running on live builds; eras keep each build's data apart. This replaces the 30 September plan for a month on a frozen build.
- Every change gets a before-and-after comparison, using eras from the data plan.

## How a bot will decide

Reflexes run in code every frame and never go to Jev:

- take any stocked supply it can see within 12 units on its floor, whatever its goal, except a Quick Fix at full health (a supply it already holds refreshes)
- shoot back when shot
- fire whenever it has a shot (unchanged)
- aim and move (unchanged)

Decisions go to Jev while a human is playing, and to the code mind otherwise. There are 2 decisions:

- the goal: take the case, chase or cut off the carrier, keep the case, heal, and the other goals in the overhaul plan
- the stance for the goal: fight rats in the way, or ignore them unless they block the route or shoot

A bot makes a decision only at these moments:

- it spawns
- its goal is reached or fails
- the case is taken, dropped, delivered or respawns
- 10 seconds have passed since the last decision

At least 3 seconds separate 2 requests to Jev. Between decisions, the bot keeps its goal and applies its stance to any rat that appears.

## Order of work

| Step | What it gives | Status |
| --- | --- | --- |
| L1 | Data foundation: build stamp, agent traffic flag, aggregates by build, decision inputs, pickups passed | Built (`13a7a6e`, `2271371`) |
| L2 | Pickup reflex | Built (`6d08299`, `10fc4b6`) |
| L3 | Release A: the baseline era, with Jev as it is today | Was live: production `7888521b`, build `production-2026-09-30-76701ab`, until 1 October |
| L4 | Lighter Jev: event-driven decisions, stance, goals held, code-only rounds | Live: production `88171c4c`, build `production-2026-10-01-6356f81`, with protocol 25 (1 October) |
| L5 | Tyler's further changes (the freeze was dropped on 2 October) | Queued from Tyler's list: an incident engagement audit and a larger pickup system; first the case batch (protocol 26) and the round-end results board finish on staging |
| L6 | Copy Jev into the code mind | When enough Jev decisions exist, era by era |
| L7 | Switch Jev off, then tune to humans | After L6 passes |

### L1. Data foundation (built)

Build on staging, on top of the current staging batch:

- every fact carries `build`, a release name set at deploy time
- agent browsers join with `&agent=1`, and their rats and performance reports are recorded as `agent`, never `human`
- the aggregates are keyed by build as well as day, layout and mode, so the digest and `/map` can compare eras
- every `decision` fact records its inputs: run time to the case and to the carrier, whether the bot is closer to the case than the nearest rival, its health, the nearest rival's health, the rats in view and the stance (from L4)
- a new `pickup-passed` fact: a stocked, usable supply was in view within 12 units and the rat did not claim it

Done when a staging session shows all 5 in the mirror, and the digest leaves agent rats out of every human measure. A local Worker session with an agent browser showed all 5 (`13a7a6e`). Agent browsers also never switch Jev on (`2271371`).

Rolling back to a build before L1 breaks aggregate writes: L1 rebuilds the aggregate tables with a build key, and older code writes the old key. Facts and the archive are unaffected.

### L2. Pickup reflex (built)

Before any decision, a bot checks for a stocked supply in sight within 12 units on its floor. It goes for it whatever its goal, carrying the case too, except a Quick Fix at full health; a held buff refreshes. A loose case nearer than the supply comes first. A carrier scoring in a Jurisdiction zone only takes supplies inside the zone. A supply not reached within 2.5 seconds is left alone for 30 seconds. Supplies 12 to 24 units away (heal or arm up, when no live objective needs the bot) and the Ironclad trip remain goals. `mindVersion` 5.

The same change stopped a bot pacing between 2 or 3 spots from counting as progress, and gave each alarm pillar its own 12-second give-up timer. Stuck-bot rescues are unchanged.

Bot-only simulation, 24 rooms of 4 minutes per seed set, before and after:

| Seeds | Pickups per bot-hour | Passed per bot-hour | Rescues per bot-hour | Case takes per room-hour |
| --- | --- | --- | --- | --- |
| 1 to 6 | 31.9 to 51.0 | 40.4 to 6.2 | 0.83 to 1.04 | 285 to 269 |
| 7 to 12 | 29.4 to 52.6 | 46.3 to 6.1 | 1.39 to 1.18 | 261 to 258 |

Case takes fell 3% because carriers survive longer; the case lies loose for the same share of time.

### L3. Release A: the baseline era

The current staging batch, L1 and L2 go to production as one release, on Tyler's OK. Jev stays as it is today, asked once a second. This era is the "before" for L4.

No minimum of human play is required before L4 ships (Tyler, 30 September: "let's simplify it"). Jev's cost and call rate need little play; comparisons that need human hours fill in during the freeze.

### L4. Lighter Jev (built, on staging)

The decision moments, the stance and goal holding described above, as `mindVersion` 6, with code-only rounds. It ships on its own, so the comparison with release A measures this change alone. As built:

- `RatBot` decides only at a moment. Between moments it keeps its goal and code refreshes the plan every 180 to 300 ms, because a followed rat moves and a case lands.
- The moments are:
  - spawning
  - the held goal ending or failing
  - the case changing hands
  - a case goal becoming possible: the case free to take, a carrier within reach again, a zone to hold
  - the assignment moving on
  - Jev coming on because a human started playing
  - 10 seconds (`DECIDE.holdMs`) since the last decision
- At a moment, Jev gets up to 1.5 seconds to answer while the held goal lasts. If the held goal is over, the code mind's pick runs meanwhile and is not recorded. An answer is used once. Requests for one rat are at least 3 seconds apart, and a moment inside that gap goes to the code mind.
- Every answer also carries a stance. With `fight`, a rival close by takes over the rat's movement, whatever its goal. With `focus`, the rival takes over only where the plan itself fights, or for 2 seconds after the rat is hit. The pickup reflex is never taken over, and firing never depends on the stance. The code mind's stance is `focus` for every rat keeping or holding the case, and for a sniper or camper taking the case, healing, arming up or fleeing; `fight` otherwise (hoses, joyriders and gremlins fight on the way).
- A hit is no longer a Jev moment, because shooting back is the motor's reflex.
- Every moment is recorded as a `decision` fact with its `stance`.
- About 1 round in 5 is code-only (`codeOnlyRound`). Its facts carry `codeOnly: true`, and Jev stays off in that round even with humans playing.

The era report compares A with this era, on Jev rounds only. The predictions are:

- Jev requests fall from about 48 per bot per minute to under 12
- dollars per Jev-hour fall at least 5 times
- the share of take-the-case goals replaced before they end falls well below 89%
- the bots are no less human-like on the scorecard

Checks before shipping (30 September, commits `f5cf0b9` and `8a86be3`):

- The full suites passed on a clean tree: worker 246 of 246, client 1,544 of 1,544, scripts 133 of 133. The build passed.
- A bot decides 4 times in 32 steady seconds: at spawn, then as each 10 seconds runs out. It decides at once when the case changes hands.
- Jev asks only at moments and never twice within 3 seconds. A late answer is dropped. Code-only rounds keep Jev off with a human playing. An agent browser never switches Jev on.
- Bot-only simulation, before (release A) and after, 24 rooms of 4 minutes for each of 2 seed sets:
  - the overall gap to humans moved from 0.175 and 0.178 to 0.181 and 0.172, which is within noise
  - rescues per bot-hour went from 1.04 and 1.18 to 0.69 and 1.04
  - case changes per room-hour fell about 9% on both sets, from 269 and 258 to 244 and 234
  - completions per room-hour went from 3.75 and 3.75 to 3.75 and 3.13
  - Paper Chase deliveries per room-hour went from 49 and 33 to 35 and 55; the sets moved in opposite directions, which is noise
- On staging with bots only, the code mind decided about 6.6 times a bot-minute. On production, `mindVersion` 3 recorded 16.7 decisions a bot-minute. Jev's request rate needs a human session.

### L5. Tyler's further changes

Tyler's further changes go in first. Queued, not started (Tyler, 1 October: "don't do this yet, just add it to the plan"):

- **Incident engagement audit.** How engaging is each incident? Read every incident's facts (what players and bots do during it, kills, case movement, pickups, deaths to it, how often it is noticed) and Tyler's playtest notes, then rank them and propose cuts, changes and new ones.
- **Expand the pickup system.** More kinds of supply and more ways to get them, built on the four supplies, the 27 sites and the reward draw (`rewardSupply`: kill streak titles, Dispatch calls and, since protocol 26, taking the case).

There is no freeze afterwards (Tyler, 2 October). Jev data is gathered on live builds and compared within eras.

Agreed by Tyler (30 September): code-only rounds. In 1 round in 5 with humans present, the bots use the code mind instead of Jev. These rounds are the only fair test of whether Jev is worth its cost. Without them, the code mind is only seen in the empty city, where it plays bots alone. They ship with L4, so the comparison starts early; the L4 era report compares Jev rounds only with release A.

### L6. Copy Jev into the code mind

Fit the code mind's goal and stance scores, per archetype, to Jev's decisions, within eras whose rules match the code mind being fitted. Check the fit on rounds held back from the fitting.

Done when:

- the code mind picks Jev's goal in at least 80% of decisions, and Jev's stance in at least 80%, for each archetype
- in code-only rounds, the fitted bots score within noise of Jev bots on the scorecard

### L7. Switch Jev off and tune to humans

Turn Jev off. It can come back for a short while after a large rule change, to gather fresh examples.

Then tune the code mind towards humans. Humans' goals are inferred from what they do in the next few seconds, the method tested in B0 of the overhaul plan. Progress is measured on the scorecard, in human hours.

## Risks

- Without a freeze, frequent rule changes split Jev's data into small eras. Fit on the eras with the most decisions.
- Human hours may stay thin. More playtest sessions help more than any code.
- Jev's choices may not be human-like. The code-only rounds and the scorecard show this. If Jev is no closer to humans than the code mind, we stop paying for it.
- Deterministic bots can become predictable. Seeded randomness and the five archetypes (sniper, hose, camper, joyrider, gremlin; 1 October) stay.

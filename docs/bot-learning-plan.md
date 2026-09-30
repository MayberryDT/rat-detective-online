# Bot learning plan

Status (30 September 2026): release A (L1 and L2) is live in production (build `production-2026-09-30-76701ab`, [receipt](verification/release-a-2026-09-30.md)) and is gathering its baseline human hours; L4 is being built on staging. This file owns the order, status and acceptance for teaching the bots to decide like Jev, and then like humans. How the data is organised is in [the data plan](data-plan.md). The bot design this builds on is [the bot overhaul plan](bot-overhaul.md).

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
- Jev keeps running for about a month on a frozen build, to gather data. The build freezes before these changes reach production. Tyler has more changes to add before the freeze.
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
| L3 | Release A: the baseline era, with Jev as it is today | Live: production `7888521b`, build `production-2026-09-30-76701ab`; gathering human hours |
| L4 | Lighter Jev: event-driven decisions, stance, goals held, code-only rounds | Next, on staging |
| L5 | Tyler's further changes, then the frozen build and a month of data | Waits for Tyler's list |
| L6 | Copy Jev into the code mind | After a fortnight of frozen data |
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

Enough data is about 3 hours of human play over several sessions. Cost and call counts need far less.

If Tyler prefers that nothing reaches production before the freeze, the baseline comes from staging playtests. That gives far fewer hours.

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
- Every answer also carries a stance. With `fight`, a rival close by takes over the rat's movement, whatever its goal. With `focus`, the rival takes over only where the plan itself fights, or for 2 seconds after the rat is hit. The pickup reflex is never taken over, and firing never depends on the stance. The code mind's stance is `focus` for a tryhard taking, keeping or holding the case, healing, arming up or fleeing, and `fight` otherwise.
- A hit is no longer a Jev moment, because shooting back is the motor's reflex.
- Every moment is recorded as a `decision` fact with its `stance`.
- About 1 round in 5 is code-only (`codeOnlyRound`). Its facts carry `codeOnly: true`, and Jev stays off in that round even with humans playing.

The era report compares A with this era, on Jev rounds only. The predictions are:

- Jev requests fall from about 48 per bot per minute to under 12
- dollars per Jev-hour fall at least 5 times
- the share of take-the-case goals replaced before they end falls well below 89%
- the bots are no less human-like on the scorecard

### L5. The frozen build

Tyler's further changes go in first. Then one build freezes for about a month:

- the rules, layout, supplies, incidents, bot mind and Jev model (`jev-1.13.0`) stay fixed
- performance, crash and recording fixes are allowed, because players cannot see them
- a weekly note reports human hours, Jev spend and anything readable

Agreed by Tyler (30 September): code-only rounds. In 1 round in 5 with humans present, the bots use the code mind instead of Jev. These rounds are the only fair test of whether Jev is worth its cost. Without them, the code mind is only seen in the empty city, where it plays bots alone. They ship with L4, so the comparison starts early; the L4 era report compares Jev rounds only with release A.

### L6. Copy Jev into the code mind

Fit the code mind's goal and stance scores, per personality, to Jev's decisions from the frozen build. Check the fit on rounds held back from the fitting.

Done when:

- the code mind picks Jev's goal in at least 80% of decisions, and Jev's stance in at least 80%, for each personality
- in code-only rounds, the fitted bots score within noise of Jev bots on the scorecard

### L7. Switch Jev off and tune to humans

Turn Jev off. It can come back for a short while after a large rule change, to gather fresh examples.

Then tune the code mind towards humans. Humans' goals are inferred from what they do in the next few seconds, the method tested in B0 of the overhaul plan. Progress is measured on the scorecard, in human hours.

## Risks

- Rule changes during the freeze would split the data into small piles. Only changes players cannot see are allowed.
- Human hours may stay thin. More playtest sessions help more than any code.
- Jev's choices may not be human-like. The code-only rounds and the scorecard show this. If Jev is no closer to humans than the code mind, we stop paying for it.
- Deterministic bots can become predictable. Seeded randomness and the 3 personalities stay.

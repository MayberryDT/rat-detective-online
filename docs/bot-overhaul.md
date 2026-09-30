# Bot overhaul plan

Status (2026-09-29): **approved; starting.** Tyler agreed the design and answered every open decision. This file owns the scope, order, decisions and acceptance of the bot overhaul. The visual version of the design, with diagrams, is [design/bots/overhaul-plan.html](../design/bots/overhaul-plan.html). Measurement uses [the city map](city-map.md).

## The idea

Every bot gets three parts:

- **Perception** (code, once a second and on events): what the rat can honestly see and hear, written in words the city map already uses (place names, floors, who is in view, what was heard).
- **Mind** (once a second and on events): chooses a goal, a target and a place.
  - **Jev mind:** [TypeSafe's Jev](https://docs.typesafe.ai/concepts/system-one.md), a model that answers typed questions with probabilities. It runs only in rooms with a human in them.
  - **Code mind:** free and instant. It runs the empty city and takes over whenever Jev is slow, down or over budget.
- **Motor** (code, every tick): moves, aims, dodges, fires and banks shots. It never waits for the mind; a rat always acts on its last goal.

Jev judges; code knows. Jev picks from candidates that code lists and never invents a target or place. Aim, distances, routes and bank angles stay in code.

## Decisions (Tyler, 2026-09-29)

- **Jev is the intent layer, not the hands.** A decision takes about 180 ms, so it can't steer a rat directly. It sets the plan, and the code carries it out.
- **The cast is 80 / 10 / 10:**
  - **Tryhards** (80%) play hard to win the assignment;
  - **Mavericks** (10%) win in their own way: bank shots, launcher ambushes, counterfeit traps;
  - **Gremlins** (10%) cause chaos.

  A personality is a set of weights applied in code to the same Jev answers, so it costs no extra calls. Each roster name keeps its personality across rounds. **Personalities are hidden from players**; the names are internal.
- **Skill is separate from personality.** Skill lives in the motor: reaction delay, aim error and fire cap. **Base bots never outplay Tyler.** Measured on `/map`, the bots' hit rate and kills per death stay below the median human's. There is one tier; a harder "nightmare" tier would be a later dial.
- **The living city stays.** With no human present, the code mind runs six to nine bots around the clock at no cost. Jev switches on when a human joins and off when the last one leaves.
- **Clean cutover, with a gate.** The new code mind replaces today's brain (`ObjectiveBotBrain` and its layers). Before production, it must match today's bots on the baseline (see "Acceptance").
- **Budget:** a **$25 a day** cap on Jev in production. When it is reached, rooms fall back to the code mind until the next day (UTC).
- **TypeSafe account:** the Rat Detective key is on **its own account**, so all 1,200 requests a minute belong to this game.
- **Release timing:** production **whenever the bots are ready**, on Tyler's OK after he has played the private preview. There is no need to wait for the layout-tuning week to finish: every fact carries both `layoutVersion` and `mindVersion`, so the data can be split.
- **Verification runs:** short private bot-only runs of the *new* bots are allowed (about 10 minutes on a hosted fixture; Jev capped at about $1 a run). Today's bots are still not soaked or tuned.
- **They keep getting better.** Every decision is recorded with its outcome. Changes are replayed against recorded moments before they ship, and each version changes one thing. Jev's own weights are not trained on our data; tuning happens in the questions, the situation text, the weights and the code.
- **"Better" means more fun and more humanlike, not stronger.**

## Authority and boundaries

- Work on branch `bots/overhaul`. `main` stays releasable.
- Staging and private preview fixtures are allowed. **Production needs Tyler's explicit OK.**
- Previews use a frozen matching client and the hosted Worker with production server bots (6–9 bots rolled per round, humans on top, ten-rat cap). Agent browser checks stay muted (`&mute=1`); Tyler's playtests stay audible.
- The key never reaches a browser:
  - it is the Worker secret `TYPESAFE_API_KEY` (staging first);
  - the local copy is `~/.config/rat-detective/typesafe-key` on Veelox and Halla.

  Browser-hosted bots (`NormalGameBots`, `PracticeBots`) use the code mind only.
- Chosen player names never reach Jev; rats are sent as `r1`…`r9`.
- Pin the model version (`jev-1.13.0`), not `jev-latest`. Moving to a new release is a deliberate change, replayed first.
- Preserve everything in `AGENTS.md` that this plan does not change, in particular:
  - the ten-rat cap, 6–9 bots, persistent names, cap-only kicks;
  - the always-alive `public-live-v2`;
  - the 30 s and 90 s stuck rescues and loose-case recovery;
  - server authority over damage, scores and pickups;
  - imperfect aim;
  - Ironclad avoidance;
  - "the game always moves forward".

## Architecture (fixed)

```mermaid
flowchart TB
  W[GameRoom world state] --> P[Perception: RatView]
  P --> JM[Jev mind] & CM[Code mind]
  JM & CM --> CAST[Cast weights + hysteresis]
  CAST -- Intent --> M[Motor: executor per goal, BotNavigation, aim]
  M -- move / shoot --> W
  W -. events .-> JM & CM
  CAST -- decision facts --> REC[(City recorder)]
```

- **Intent:** the one type both minds return. It holds a movement goal, an optional target rat, an optional place and a stance. The goals form a closed list, and code offers only the goals that are valid in the current assignment and situation. The list:
  - take the case;
  - chase the carrier;
  - keep the case (and deliver it in Paper Chase);
  - hold the zone (Jurisdiction);
  - hunt (close in on a rat);
  - flee;
  - heal;
  - arm up;
  - ambush;
  - mischief;
  - roam.
- **Firing is not a goal.** Humans fire in 75% of recorded moments, whatever else they are doing (B0). The motor fires whenever it has a shot or a useful bank, within the skill dials, whatever the goal. Goals are only about where to go and what to do there.
- **What Jev is asked, per rat, in one request:**
  - one Score per offered goal: how much sense it makes right now (five levels, from "makes no sense" to "clearly the best"). Code combines the scores with the cast weights and hysteresis. A single "which goal wins?" Choice is not used: in B0 it chose the objective every time and couldn't tell situations apart;
  - the target (Choice over visible rats, or none);
  - one place question per open-ended goal (Choice over candidate places);
  - danger (Score);
  - whether a bank shot is the way to reach the target (Noul).

  Questions in one request can't see each other's answers, so a goal that implies a place (the case, the carrier, a medkit, the zone, the delivery) takes that place from code.
- **The situation is written in words, not numbers.** Jev reads numbers badly: in B0, the case score rose as the case got *further* away when distances were given in units. Perception writes distances as run times or plain bands ("next to me", "a short run", "across the city"). It also states where the zone and the pickups are relative to the rat, and what lies between (open street, a fight).
- **Freshness:** each request carries a situation serial. An answer older than 1.5 s, or one that names a rat that is dead or out of view, is dropped. If Jev hasn't answered within 600 ms of a new situation, the code mind answers.
- **Hysteresis:** a rat switches goal only when the new goal wins by a clear margin or an event fired (hit, case change, target lost, arrived).
- **Backoff:** a 429 or an error backs off exponentially, and the code mind covers in the meantime.
- **When Jev runs:**
  - public rooms: at least one connected human;
  - private fixtures: a human or an observer, so Tyler can watch Jev bots in observe mode;
  - never over the daily cap.
- **Cadence:** one decision a second per rat, plus events. At about 1,700 tokens a decision, one room of nine rats costs about $2.30 an hour and uses 540 of the 1,200 requests a minute.

## What happens to the code

- **Kept:**
  - `BotNavigation.ts` and `BotLaunchRoutes.ts` (flow fields, routes, launcher routes);
  - `ServerBotController.ts` (physics body, movement, rescues), which now drives executors;
  - `botRoster.ts`, which also rolls each rat's personality;
  - `BotTargeting.ts` and the imperfect aim in `BotCombat.ts`.
- **Reused:**
  - `src/worker/city/CityRecorder.ts` and `src/shared/city/places.ts` supply perception's vocabulary;
  - the recorder gains `decision` facts.
- **New, under `src/shared/bots/`:**
  - `intent.ts`, the shared contract: goals, personalities, `Plan`, `MindAnswer`, `Decision`, skill dials;
  - perception (B3);
  - `goals.ts`: which goals are offered, and the plan code makes for each one;
  - the code mind;
  - the cast (weights, hysteresis, sampling, skill dials);
  - the motor, with a bank-shot solver.

  The Jev mind (client, freshness, backoff, budget) lives in the Worker.
- **Split, then deleted:** `ObjectiveBotBrain.ts` is two things in one file, and both survive in new homes:
  - its deciding half (the priority ladder: case, intercept, carrier, zone, delivery, evade, combat, explore, with pickup, armour and alarm-pillar detours) becomes `goals.ts` plus the code mind's scores;
  - its moving half becomes the motor: routes, launches and flights, local steps, case approaches, obstacle jumps, zone holding, strafing, Ironclad caution, aim, fire, speculative corner fire, the turn rate and trap avoidance.
- **Moved into the motor, unchanged in behaviour:** `BotManeuver`, `BotAttention`, `BotPurposefulHolding` (zone holding), `BotOpportunisticFire` (corner fire) and `zoneStepSafe`. They are motor behaviour worth keeping, not patch layers. The experiment switch goes: `BotExperiments`, the unused non-default `BotZoneHolding` class, and the capacity-fixture modes that only switch between them.
- **Tests:** 26 test files name the old brain or its layers. They drive the new composed bot (the tryhard code mind plus the motor), with the same step signature, so their behaviour still has to hold. Tests of experiment switching are deleted.

## Order of work

Each step lists what it delivers and how it is proven.

### B0. Offline test on real moments (done, 29 September)
- Built situation text from 326 recorded human moments in `output/city/city.db` (10 rounds, layouts 2 and 3; mostly one or two players). Asked Jev the draft questions, and compared its answers with what the human actually did in the next 6 seconds.
- Measured response time from inside a Cloudflare Worker.
- Result: the design holds, with three changes, now in "Architecture":
  - firing moves to the motor;
  - goals are scored one by one;
  - situations are written in words.

  Details under "Evidence so far".

### B1. Baseline (tool done, 29 September)
- `scripts/bot-gate.mjs` computes the gate numbers from `output/city/city.db` for any room, layout, time window or `mindVersion`:
  - time and deaths per place (spread);
  - fire and hit rates, kills and deaths per bot-hour;
  - the banked-hit share (null while bot balls aren't recorded one by one);
  - rescues per bot-hour (an estimate from teleports in the frames for today's bots, which recorded no `rescue` fact);
  - case takes, deliveries and respawns per room-hour;
  - the median human's hit rate and kills per death.
- The first 9.4 bot-hours on layout 3 give:
  - about 1.6 rescues per bot-hour;
  - 205 places visited, with the top 10 holding 38% of bot time;
  - deaths in 103 places, with the top 5 holding 28%;
  - 80 shots a bot-minute at a 4% hit rate, and 0.92 kills per death;
  - 216 case takes and 10.5 deliveries per room-hour.

  The median human hit 7.1% (only 5 human rats). The final baseline window is re-run at the gate, covering every hour of today's bots on layout 3.

### B2. Intent, motor and code mind (the cutover)
- The Intent type, one executor per goal, the bank-shot solver, the code mind, the cast and the skill dials.
- The old brain and its layers are deleted, and the browser-hosted bots move to the code mind.
- Proof:
  - behaviour tests for each executor, written failure-first;
  - a short hosted bot-only run;
  - the code-mind gate (see "Acceptance").

### B3. Perception
- `RatView` from the room:
  - place and floor;
  - HP and buffs;
  - the case;
  - visible rats (same sight rules as humans: 150 units, the Hunch at full HP);
  - sounds heard (shots, alarms, launcher throws);
  - candidate places.
- Proof: rendered views for recorded moments read correctly, and nothing a human couldn't know is included.

### B4. Jev mind
- The Worker-side client with the question set, freshness, hysteresis, backoff, the $25 daily cap and on/off by human presence.
- Proof:
  - on staging, decisions flow, and the fallback takes over when the key is removed or requests fail;
  - cost and latency are logged per decision.

### B5. Recorder and `/map`
- `decision` facts record:
  - the mind (Jev or code);
  - `mindVersion`;
  - the goal and its top probabilities;
  - confidence, latency and tokens;
  - whether the answer was dropped as stale;
  - the outcome (goal reached, died, scored, killed).
- A Minds layer on `/map`, and digest lines for the goal mix per personality, fallback share and dollars per hour.

### B6. Private preview
- A hosted fixture with the Jev mind, which Tyler plays and watches in observe mode. Tune, then repeat.

### B7. Production
- The Worker secret, then the deploy, on Tyler's OK. Afterwards, one change per `mindVersion`, measured on `/map`.

## Acceptance

- **Code-mind gate (living city), measured against the B1 baseline on a hosted run:**
  - stuck anomalies and rescues per bot-hour are no higher;
  - deaths reach at least as many places;
  - the case changes hands and rounds finish at least as often;
  - nothing stalls the assignment.
- **Skill bar:** over human sessions on `/map`, the bots' hit rate and kills per death stay below the median human's.
- **Jev mind:**
  - a decision's p90 latency, measured from the Worker, stays under 600 ms;
  - with the key removed or the API failing, bots keep playing on the code mind with no visible stall;
  - the daily cap holds;
  - no chosen player name appears in any request.
- **Cost:** the digest shows dollars per human-hour, and the daily total never passes $25.
- **Repeatable artifact:** a receipt in `docs/verification/` with:
  - the baseline and new digests;
  - decision stats (goal mix per personality, latency p50 and p90, fallback share, dollars per hour);
  - side-by-side maps.
- **Checks:** `npm run typecheck`, the worker, client and script suites, and `npm run build`, run on Halla.

## Evidence so far

- **29 September probe** (`output/jev-probe/probe.mjs`, from Halla, `jev-1.13.0`):
  - a full five-question decision took about 180 ms (103–260 ms), and nine in parallel took 223 ms;
  - it used about 1,100 input tokens, and nine rats cost $1.47 an hour at one decision a second;
  - it made the right call in every hand-written test situation (loose case, dying, Ironclad, bank shot), and a player name written as an instruction didn't sway the goal;
  - in parallel questions, the place ignored the goal. Per-goal place questions fixed that (1.00 for the case's spot).
- **B0, real moments** (`output/jev-probe/real-moments.mjs` and `scores.mjs`; the moments are saved on Halla in `output/jev-probe/`):
  - **From Cloudflare:** a five-question decision took 65 ms at p50 and about 80 ms at p90 (36 calls, no errors). Nine in parallel took 130–296 ms. From Halla, it took about 200 ms.
  - **One "which goal?" Choice doesn't work.** It picked the objective whenever one was offered (case goals 122 of 122, the zone 63 of 63). Humans went for the case about 60% of the time and never stood in a zone in these rounds. Its confidence was the same when it matched the human (0.87) as when it didn't (0.85).
  - **Firing is constant.** Humans fired 3 or more shots in 75% of 6-second windows, so "fight" measures firing, not intent.
  - **Scoring goals one by one follows the situation where the text holds the evidence:**
    - heal separated medkit trips from the rest (AUC 0.89), scoring 2.00 at 1–2 HP and 0.03 at 5 HP;
    - flee scored 2.49 at 1–2 HP and 0.52 at 5 HP.
  - **Weak where the evidence was missing or numeric:**
    - arm up (AUC 0.59): pickups weren't described;
    - the zone (0.54): only "outside it";
    - the case (0.61): the score *rose* with distance given in units.
  - **Danger from text alone** separated rats who died in the next 6 seconds from those who lived: AUC 0.75, mean 1.30 against 0.66.
  - **Size:** 640–850 input tokens a request.
  - **Limit:** the human sample is small and mostly Tyler, so "humanlike" can't be measured well until more people play.

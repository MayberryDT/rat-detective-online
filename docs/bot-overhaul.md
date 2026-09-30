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
- **Freshness:** each request carries a situation serial. An answer older than 1.5 s, or one that names a rat that is dead or out of view, is dropped. The code decides every 180–300 ms, as before. On each decision, the Jev mind returns its latest fresh answer, and it sends a new request once a second or on an event. Offered goals the answer didn't score take the code mind's score. With no fresh answer, the code mind decides.
- **Hysteresis:** a rat switches goal only when the new goal wins by a clear margin or an event fired (hit, case change, target lost, arrived).
- **Backoff:** a 429 or an error backs off exponentially, and the code mind covers in the meantime.
- **When Jev runs:**
  - at least one human playing in the room (connected, with real input in the last minute; staging included);
  - the key is set;
  - the day's spend is under the cap.
- **Daily cap:** each room adds up its own spend and reports it every 30 s or so to one `Matchmaker` Durable Object instance named `jev-budget`, the budget ledger. The Matchmaker class already exists in every environment, so nothing new needs migrating. The total per UTC day across rooms is checked against the `JEV_DAILY_BUDGET_USD` Worker variable ($25). A room that finds the day spent falls back to the code mind until the next UTC day.
- **Rate:** each room keeps under 600 requests a minute, half the account's limit, so a second busy room still fits.
- **Cadence:** one decision a second per rat, plus events. At about 1,700 tokens a decision, one room of nine rats costs about $2.30 an hour and uses 540 of the 1,200 requests a minute.
- **`mindVersion`:** a constant in code, stamped on every city fact next to `layoutVersion`, and raised by each change to the minds, questions, weights or dials.

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
  - rescues per bot-hour (from the `rescue` fact, recorded since B2b; for the baseline's bots, which had no such fact, an estimate from teleports in the frames);
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
- **Built (B2b):**
  - **Cast** (`src/shared/bots/cast.ts`): personality weights multiply a mind's scores, so a boost never makes a senseless (0) goal sensible:
    - mavericks: ambush ×1.6, hunt ×1.15;
    - gremlins: mischief ×1.8, roam ×1.25, hunt ×1.1, keep the case ×0.85.

    A tryhard on the code mind takes the top score, exactly as before. A Jev tryhard keeps its goal until another leads by one level of five, or an event fires. Mavericks and gremlins sample (softmax, temperature 0.75, their own seeded stream) and hold a sample for 2.5 s between beats. Offered goals an answer left out take the code mind's score; an answer that scored none of them gives way to the code mind.
  - **Personality** (`botPersonality` in `botRoster.ts`): a fixed FNV-1a hash of the roster name, 846 / 106 / 104 over the 1,056-name pool. The server derives it where the bot is driven; it is never sent.
  - **Skill dials** (`BASE_SKILL` in `intent.ts`): reaction 200–450 ms, aim error 2.8–5.6°, burst gaps 200–240 ms, 200 ms between motor shots: today's numbers, exactly.
  - **Bank shots** (`src/shared/bots/motor/bankShot.ts`): at a rat last seen at most 2.5 s ago within 35 units, now behind cover: six wall probes, then the shortest mirror bounce whose two legs check clear; at most 12 rays an attempt, one attempt every 600 ms, fired within 400 ms with the dials' aim error. Mavericks always; any rat whose answer's `bank` is at least 0.6.
  - **Gremlin fire:** a visible counterfeit with another rat within 5 units, from more than 10 units away; a launch trigger with another rat on its pad while the machine is not cooling; targets within 50 units. Gremlins also look for alarm pillars up to 90 units away (others 45).
  - **Parity:** with every bot a tryhard on the code mind, B2a and B2b match frame by frame (all four assignments, 6 and 10 rats, 60 s, seeded).

### B3. Perception
- `RatView` from the room:
  - place and floor;
  - HP and buffs;
  - the case;
  - visible rats (same sight rules as humans: 150 units, the Hunch at full HP);
  - sounds heard (shots, alarms, launcher throws);
  - candidate places.
- Proof: rendered views for recorded moments read correctly, and nothing a human couldn't know is included.
- **Built** (`src/worker/bots/perception.ts`, Worker-only, so the city's place names stay out of the client bundle):
  - a `Situation` object in words: the assignment's rule, standing and time pressure, me (place, level, HP as "3 of 5", buffs, carrying, hit a moment ago and by whom), the case, the zone, the drop-off, stocked pickups in sight, rats in view, a rat just gone behind cover, sounds heard, the Hunch and the Dispatch incident;
  - distances are run times at sprint speed ("right here", "a few steps", "a short run", "a long run", "across the city") with a compass direction and above/below; places are named without their coordinates (street, pier and quay names carry them, so they become "a north–south street in the west" and the like); no number reaches Jev except HP;
  - rats in view are the motor's own (80 units and a clear ray, the rays that aim), not the recorder's 150; the Hunch (within 40 at full HP) and sounds (gunfire within 60, alarm pillars, launchers within 100) have fields of their own, and an unseen shooter gets no alias;
  - rats are `r1`… for one request only, nearest in view first; a chosen name is never read.

### B4. Jev mind
- The Worker-side client with the question set, freshness, hysteresis, backoff, the $25 daily cap and on/off by human presence.
- Proof:
  - behaviour tests with a fake API (stale answers dropped, fallback on timeout, 429 and errors, the cap holds, no chosen name in any request, off without humans);
  - on staging, decisions flow;
  - cost and latency are logged per decision.
- **Built** (`src/worker/bots/`: `jevClient.ts`, `jevMind.ts`, `jevBudget.ts`; the ledger in `Matchmaker`):
  - **Questions**, one request per rat: a Score per offered goal ("How much sense does it make for `me` to pursue `goal` right now?", five levels, read straight onto the 0–4 scale); the target (Choice over rats in view and none, only when one is in view); a place Choice per open-ended goal with two or more options; danger (Score, four levels); the bank shot (Noul, only about a rat shot at in sight within the last 2.5 s, within 35 units, now behind cover). Every rat now remembers that quarry; only `tactics.bank` shoots at it.
  - **Freshness:** an answer plays for 1.5 s from when its situation was sent, while every rat it names is in view and no event (a case changing hands, a goal failing, the assignment moving on, a landing, a hit) has come since; otherwise the code mind decides.
  - **Cadence:** a rat asks at most once a second, at once after an event, never twice at once; the room holds to 9.5 requests a second with a burst of 10 (at most 580 a minute). Requests are fire-and-forget through `ctx.waitUntil`, with a 1.5 s timeout.
  - **Backoff:** any failure (429, 5xx, timeout, network, malformed reply) waits 1, 2, 4 … 60 s for the whole room, or longer if `retry-after` says so; the mind answers nothing meanwhile. The wait steps up once per outage: a failure of a request sent before the current wait began adds no step (only its `retry-after`), and only a success of a request sent since then ends the outage (review fix, 29 September).
  - **When:** only for server bots, while a human is playing, `TYPESAFE_API_KEY` is set and the day's budget is open. Playing means connected (not in reconnect grace) and real input in the last 60 s: joining, moving or turning (a pose that changed by more than .05 units or a rotation), firing, a hit claim or a pickup. An idle or background tab, which resends the same pose or only pings, turns Jev off after a minute (review fix). Switching resets no bot or route.
  - **Budget:** rooms report their spend ($0.042 per million input tokens) about every 30 s and when Jev switches off, to `Matchmaker` `jev-budget` (`jevSpend`, `jevBudget`), which sums rooms per UTC day, prunes earlier days and compares with `JEV_DAILY_BUDGET_USD` (unset means no Jev). A room stops as soon as its own unreported spend would pass the cap, and asks the ledger again on a new UTC day. It fails closed (review fixes): a failed ledger call forgets the day's total, so the room stops spending until a read 30 s later succeeds; a total not heard for 60 s (two report intervals) is not trusted, and one 30 s old is asked for again while it still holds. Each reply's cost goes to the budget as it lands (`JevMindOptions.spend`), so replies that land after Jev switched off, or after the bots were disposed, are reported at once; a report asked for while a ledger call is out runs when that call ends.
  - **Records for B5:** each Jev answer carries latency, tokens and send time (`MindAnswer.jev`); the mind counts decisions taken while on, requests, answers, failures, stale drops, fallbacks, throttled asks, tokens and dollars. Every minute while Jev is on, and when it switches off, the room logs that window's counts with latency p50/p90 and records them as a `minds` fact (B5). `MIND_VERSION` (1) is in `intent.ts`.
  - **Real check** (Halla, three situations): accepted, answers mapped to goals, place ids and rat ids; 196–394 ms, 1,464–1,892 input tokens a request.
  - **Config:** `JEV_DAILY_BUDGET_USD` and `JEV_MODEL` are Worker vars for the default and staging environments; production gets them with the secret at B7.

### B5. Recorder and `/map`
- `decision` facts are recorded for every Jev answer that is applied, and for every goal change on the code mind (a decision every 180–300 ms is too many to record each one). They hold:
  - the mind (Jev or code) and `mindVersion`;
  - the personality;
  - the goal and its top scores, raw and weighted;
  - latency and tokens;
  - whether the answer was dropped as stale;
  - the trigger.
- `goal-end` facts record the outcome when a goal ends: reached, died, replaced or failed, and how long it ran.
- A Minds layer on `/map`, and digest lines for the goal mix per personality, fallback share, latency and dollars per hour.
- **Built** (facts, aggregates, digest and page in [the city map](city-map.md); vocabulary in `src/shared/city/minds.ts`):
  - **`mindVersion`** is stamped on every city fact (`FactContext.mindVersion`), next to `layout`; the bot gate's `--mind=` filters on it.
  - **`decision`** (`CityRecorder.decision`, fed by `ServerBotCallbacks.decide` with each new `Decision`): recorded when a bot takes up a goal, or applies a Jev answer not yet recorded (one fact per answer, however many decisions reuse it). A code-mind decision under the same goal records nothing, so combat target churn and the 180–300 ms beat stay out. It holds the actor, point and place, mind, personality, goal, motor mode, trigger, the top three `[goal, raw, weighted]`, danger, whether a target was named, whether the motor had given up the previous plan (`Decision.failed`, from `BotMotor.failures`), Jev's latency and tokens, and, for a code decision while Jev was on, how Jev fared (`stale`, `fallback`).
  - **`goal-end`**: `reached` (per goal, as the city map defines it), `died`, `replaced` or `failed`, with the goal, mind, personality, motor mode, duration, where it was taken up and where it ended.
  - **`minds`**: the Jev mind's counts for each minute it is on (and the part-minute when it switches off), with latency p50/p90 and a 20 ms latency histogram so windows pool exactly.
  - **Aggregates:** `decide:<mind>:<personality>:<goal>` per place, `goal:<mind>:<personality>:<goal>:<outcome>` per place taken up, and `city_minds` for the Jev windows. Digest: a **Minds** section. Page: Observe's **Minds** layer. Gate: a `minds` section.
  - **Volume** (measured in a worker room, 9 bots, 45 s runs; the fake Jev scored goals at random every second, the worst case for churn): the code mind records 680–1,120 decisions and 520–970 goal ends per bot-hour (four runs); with Jev on, about 3,300 Jev decisions (at most one per answer, one answer a second), 290–440 code decisions and about 1,300 goal ends per bot-hour. A decision is about 460 bytes of JSON and a goal end about 420; gzipped in the archive, about 26 and 29 bytes. The bot-only city therefore archives about 10 MB a day more compressed (about 17 MB a day in all). Decisions and goal ends stay out of the 30-day SQL events (only the archive and the per-place counts keep them); the `minds` fact, one a minute, is kept there.

### B6. Preview on staging
- The gate run and Tyler's preview both use staging, not a capacity fixture:
  - staging runs `public-live-v2` with production-style bots and a matching client;
  - it records to its own archive (`rat-detective-city-staging`);
  - it has the Jev key.

  The fixture has no city archive, so it couldn't feed the gate.
- **Gate run:**
  1. deploy to staging;
  2. let the empty city run on the code mind for at least 10 minutes;
  3. mirror staging;
  4. run `bot-gate.mjs` against the production baseline.
- **Jev check:** a scripted protocol-23 client holds a connection so the room counts a human (about 10 minutes, roughly $0.40).
- Then Tyler plays staging (audible). Tune, then repeat.

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

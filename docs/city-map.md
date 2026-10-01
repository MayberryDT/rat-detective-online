# The city map

Status (2026-09-29): **steps 1–3 are live** on production, Worker `00e3129e-6a33-40e0-acb8-f5810a251f60` (Tyler: "go ahead and deploy it to the live game"), then the recorder fixes in `a57db85b-bad7-483d-9dbf-51368235a768`, with the same client and protocol 22. See [the receipt](verification/heat-map-release-2026-09-28.md). **Steps 4–6 (the `/map` page's Observe, Analyse and Design modes) shipped with the city overhaul** in Worker `d5c52eb9-ab32-471e-a439-8ec405e83899`. **First answer (Tyler's 12-minute Excessive Force session, 2026-09-29):** humans fire 176 shots per minute alive and hit 6%; bots fire 108 and hit 3%. Tyler clicks every shot (there is no hold-to-fire) and won 36/9/9. The session also exposed two recorder bugs, since fixed in source: every death was filed as `missile`, and sight stopped at 60 units.

**Layout 3 (2026-09-29):** live in production since Worker `d5c52eb9-ab32-471e-a439-8ec405e83899` (protocol 23), so the recorder now writes layout-3 facts, and `proposal:overhaul-v3` is judged as human play builds up on both layouts. Staging runs the same build and records to `rat-detective-city-staging`. See [the release receipt](verification/city-overhaul-release-2026-09-29.md).

**Layout 4 (built 30 September 2026, not deployed):** the supply sites only; no geometry and no place IDs change. Tyler: "we need to rethink pickup locations and add more health packs." Every upstairs supply moves down to a ground floor, and the medkits double from 7 to 14. The reasons, the static check and the predictions are in `proposal:supplies-v4` (see [The design loop](#the-design-loop)). A room stored on layout 2 or 3 upgrades on load, as `public-live-v2` did from 2 to 3.

**Layout 5 (built 30 September 2026, not deployed):** adds four sites for the fourth pickup, Stakeout (12 s of the Hunch city-wide), one on a four-way crossroads in each corner of the city; nothing else changes. See `proposal:supplies-v5`. A room stored on layout 2, 3 or 4 upgrades on load.

The city map is the single document for everything about the city: where things are, what happens there, how often, how dangerous, and what should change. People read it as the page at [/map](https://ratdetective.online/map) (the old `/heatmap` address redirects there). Agents read it as text, through this file and the live endpoints below. Both renderings come from the same data, so they can never disagree.

Tyler's brief (2026-09-28): track everything (pickups and their kinds, routes, cheese balls, when and where things go off), measure all of it, connect all of it, and make it readable at high fidelity. The aim is a deep, statistical understanding of how the game plays, so we can design the best map ever and keep it good for years.

## How to read the city: start here

1. **Ask the digest first:** `GET /api/city/v1/digest?days=7` returns a short Markdown reading of the map. It covers:
   - the exposure behind the numbers (human rat-hours and bot rat-hours);
   - dead zones and hot zones;
   - the most dangerous places and the spawns that kill;
   - pickups nobody takes;
   - where rats get stuck;
   - what changed since the last layout version, with confidence.

   Every line carries an **evidence handle** (for example `place:roof:records · measure:danger · days:7`) that the other endpoints answer exactly.
2. **Drill down by handle:** use `places`, `flows`, `timeline`, `events` and `cells` (see [Agent surfaces](#agent-surfaces)).
3. **Deep questions:** pull the raw archive into a local SQLite mirror (`output/city/city.db`) and query it. The `read` tool queries SQLite directly (`city.db?q=SELECT …`), so new questions need no new code.
4. **Change the city:** write a proposal (a layout diff), check it against the static analyses, ship it under a new layout version, and let the map judge it (see [The design loop](#the-design-loop)).

## The tower

Each layer is built only from the layer below and links back to it by ID. A finding points to measures, a measure to events, an event to a place, and a place to layout entities. Nothing floats free.

```mermaid
flowchart TB
  L6["6 Verdicts: did the change work? (by layout version)"] --> L5
  L5["5 Proposals: layout diffs with predicted effects"] --> L4
  L4["4 Findings: the digest, ranked, each with an evidence handle"] --> L3
  L3["3 Measures: rates per exposure, with uncertainty"] --> L2
  L2["2 Facts: typed events, append-only, schema-versioned"] --> L1
  L1["1 Places: named regions, portals, cells"] --> L0
  L0["0 Layout: every gameplay entity with a stable ID"]
```

| Layer | Question it answers | Source of truth | ID shape |
| --- | --- | --- | --- |
| 0 Layout | What is where? | The shared layout modules, gathered behind one `cityModel()` | `pickup:alibi-records-upper`, `launcher:fan`, `pillar:gate`, `case-spawn:07`, `zone:sewer-junction`, `dest:sluice`, `entry:gate`, `lamp:31` |
| 1 Places | Which part of the city is this? | The place graph, derived from layout: streets split at junctions, alleys, block roofs, landmark floors and roofs, sewer halls, forecourts and yards | `street:seventy-ave:3`, `alley:central-w`, `roof:records`, `floor:needleworks:8`, `sewer:hall-east`, `district:north` |
| 2 Facts | What happened? | Events emitted by the room at the moment they happen | `event:<round>:<seq>` |
| 3 Measures | How much, how fast, how risky? | Deterministic projections of facts over places, versioned (`measureVersion`) | `measure:danger` |
| 4 Findings | What does it mean? | The digest's ranked statements | `finding:<hash>` |
| 5 Proposals | What should change? | Layout diffs in `design/city/proposals/` | `proposal:docks-v1` |
| 6 Verdicts | Did it work? | Before/after measures between layout versions | `verdict:docks-v1` |

**Key rule:** raw facts are kept forever, and measures are recomputed from them. A better metric invented next year can be answered for every past day. This is what makes the map build up value over time: nothing learned is ever thrown away, and nothing has to be re-collected.

## Frames and identity

- **Axes:** x runs east, z runs south, so **north is −z** and is drawn at the top.
  - Today the code disagrees with itself. The landmark wall named `north` faces +z, while `pursuit-north-avenue` sits at z −150.
  - The place graph fixes this: compass words come only from the frame, never from hand-written labels. The landmark wall names get renamed or mapped.
- **Floors** by height y:
  - `sewer` below −2;
  - `street` −2 to 5;
  - `upper` 5 to 45 (landmark floors at 8 and 16, roofs up to about 37);
  - `air` 45 and above (launch flights).
- **Cells:** 4 × 4 units, keyed `floor:ix:iz` where `ix = floor(x/4)`. Every cell belongs to exactly one place per floor.
- **Versions** stamped on every fact:
  - `layoutVersion`: the world version (`GRAYBOX_VERSION`: 5 from the Stakeout sites of 30 September once deployed, 4 from that day's supplies redesign; 3 since 29 September; 2 before), bumped by any layout change;
  - `mindVersion`: the bots' `MIND_VERSION` (`src/shared/bots/intent.ts`: 1 from B5 of [the bot overhaul](bot-overhaul.md), 3 in the 30 September production release, 4 for motor iterations 3 to 5, 5 from the pickup reflex of [the bot learning plan](bot-learning-plan.md), 6 from its lighter Jev: decision moments, the stance and code-only rounds), raised by any change to the minds, questions, weights or dials;
  - `build`: the release, `<env>-<YYYY-MM-DD>-<git short sha>`, with `-dirty` when the tree had uncommitted changes (for example `staging-2026-09-30-119015e`). `node scripts/deploy.mjs` sets it as the Worker var `BUILD` for staging and production; it reads `dev` when unset (local runs, tests) and `unknown` on aggregates from before builds were recorded. `GET /health` answers with it;
  - `protocol`;
  - `schemaVersion`.
  - Measures carry a `measureVersion`.
- **Time:** UTC milliseconds, plus `roundMs` (time since the round went live). Days are UTC.
- **Actors:** an anonymous per-round actor number, marked `human`, `bot` or `agent`. Never names, player IDs or tokens. A human keeps the same actor number through reconnects within the round, so their route stays one track.
  - **Agents** are agents' headless browsers and scripted joins: a page opened with `?agent=1` (next to `mute=1`) forwards the flag on its socket (`agent=1`), and the room keeps it with the rat's seat, through reconnects and evictions. Their facts say `human: false, agent: true`. They count under their own label everywhere (`agents` cells, `agent-s`, `still-agent-s`, `deaths-agent`, `kills-agent`, `shots-agent`, `hits-agent`, `bank-hits-agent`, flows `who: agent`), so no human measure, the digest's included, ever holds them. `scripts/profile-client.mjs`, `scripts/smoke-browser.mjs` and the `verify-companion`, `verify-matchmaking` and `verify-persistent-bots` scripts add the flag; anything else an agent opens needs `?agent=1&mute=1`.
- **Context** on every fact:
  - the assignment (`excessive-force`, `chain-of-custody`, `jurisdiction`; `closing-time` in facts from before protocol 25);
  - the active incident, if any;
  - the round phase;
  - the number of humans, bots and agents present.

## Layer 0: what is on the map today

Counted from source on 2026-09-28, layout version 2; the job rows (pickup sites, pillars, case spawns, zones, destinations) recounted on 2026-09-29 after W6 of [the city overhaul](city-overhaul.md) spliced in the docks' and precinct's slots; the pickup row recounted on 2026-09-30 for layout 4:

| Entity | Count | Notes |
| --- | --- | --- |
| Landmarks | 5 | Records Hall (floors 0/8/16), Icebox (0/8), Needleworks (0/8/16), Pumping Station (0/8), Gate bridge |
| Street rectangles | 16 | City bounds −196 to 166 on both axes (362 units) |
| Buildings (collision boxes marked building) | 94 | Of 1,411 collision boxes |
| Landmark furnishings | 32 | Desks, crates, shelves |
| Sewer halls / entrances | 10 / 4 + manhole | Entrances: Gate, Icebox, Alley, Needleworks; manhole at (72, 0) |
| Pickup sites | 27 | All on the ground (layouts 4 and 5). 5 Ironclad: the Records forecourt street, the ground floors of the Icebox (west aisle), the Pumping Station (east aisle) and Needleworks (inside the east door), and the Panopticon's north gallery. 4 Hot Pursuit: the Gate and Icebox tunnel mouths, Quay Road west, the south avenue west. 14 Quick Fix, just off the fights with walls on two sides: the two crossroads alleys, the south-central alley, the Icebox forecourt alley, the Records–Gate lane, the container yard, the alley south of the Gate, beside Pier 9's south door, against the Pumping Station's north wall and the block across the avenue from Needleworks, the precinct hall, and the south-west corners of Records Hall, Needleworks and the Icebox. 4 Stakeout (layout 5), on four-way crossroads: the x −60 and x 70 avenues at the −102 street, the x 90 street at the 40 street, the x −60 avenue at the 145 street. Layout 3 had 16: Ironclad upstairs in Records, on the Icebox catwalk, on the Pump roof and in the precinct armoury, and a Quick Fix in the Panopticon infirmary |
| Launchers | 6 | pressure, dumpster, freight, geyser, mousetrap, fan |
| Dispatch pillars | 12 | One in the sewer, one upstairs in the precinct radio room |
| Case spawns | 30 | Includes the home at (−16, −28) |
| Jurisdiction zones | 11 | 7 outdoor, 4 enclosed; at least one in each of the nine districts |
| Paper Chase destinations | 8 | Icebox, maintenance, pump, Needleworks, West Sluice, Records, Harbour Master, Precinct Front Desk |
| Street lamps | 76 | |
| Player spawn points | about 820 | Generated street points with clearance |

**Known layout facts from the first map (2026-09-28):**
- The north strip (z < −102), about a quarter of the map, holds one Hot Pursuit and nothing else.
- The north-west holds one Quick Fix, one case spawn and one pillar.
- Rats clip through roofs at launcher landings and roof pickups.
- Bot routes are poor.

## Layer 2: every fact recorded

The schema is `src/shared/city/facts.ts` (`CITY_SCHEMA_VERSION` 1). Every fact carries `t` (UTC ms), `rm` (ms since the round went live), `room`, `round`, `layout`, `schema`, `build` (since the data foundation, L1 of [the bot learning plan](bot-learning-plan.md); older facts lack it), `mindVersion` (since B5; older facts lack it), `mode` (the assignment), `incident`, and `codeOnly: true` in a code-only round (since `mindVersion` 6: about 1 round in 5, picked from the round id by `codeOnlyRound`, where the bots keep the code mind even with humans playing). Positions are rounded to 0.1 units. Actors are per-round numbers; no names or IDs are stored. Facts with a `human` flag (`shot`, `session`, `perf`, `round` standings and the situations) say `human: false, agent: true` for an agent.

| Fact | Emitted when | Key fields | Kept |
| --- | --- | --- | --- |
| `frame` | Every second while a human is connected; every 5 s in the bot-only city | the world's situation plus every connected rat's situation (see below) | archive |
| `window` | 3 s before to 2 s after any damage, merged while a fight continues | per actor, 5 samples a second of `[ms, x, y, z, yaw, hp]`; `aim`: per actor, 20 samples a second of `[ms, yaw, pitch]`: a human's camera look (sent with movement since 30 September; pitch `null` from older clients), a bot's look (sent with its pose since iteration 2 of the motor rewrite; before, its facing with pitch `null`); `controls`: per actor, the same 20 Hz slots of `[ms, f, r, jumps, fx, rx]`, one format for humans and bots (`ControlTally` in `src/shared/rat/controlTally.ts`): the move axes held at the slot's end (`RatControls.moveForward` and `moveRight`, −1 to 1), then, within the slot, jump presses (released to held) and key changes on the forward/back and on the left/right axis (a tap is two, so a tap shorter than a slot or a send still counts; an analogue push reads as the nearest of the eight key directions). A human's client tallies its controls every physics step and sends them with each movement (sent within 50 ms of any change, even standing still); a bot's motor hands the recorder its controls every step (`ServerBotCallbacks.controls`). A rat without fresh controls (an older client, over 1.5 s) has no entry. Trigger pulls are the `shot` facts (every human pull; one bot shot in ten, `sample: 10`). Recorded only: authority never reads controls, and a malformed one is dropped without its movement | archive |
| `spawn` | A rat enters play | point, place, nearest rival | archive, SQL, counts |
| `shot` | A human's or agent's trigger pull is accepted; one bot shot in ten (`sample: 10`, archive only) | origin, place, aim `dir` (to 0.001), gap since their last shot, `targets`: up to 3 rats in sight nearest the aim line, each with distance `d`, angle off their chest `e` and head `eh` (radians, from the shooter's eye), speed across the line of sight `lat`, and `lead` (the aim error along that motion; positive means aimed ahead) | archive, SQL (humans' and agents' shots). **Bots' other shots are counts only**, because they fire about 100 times a minute each |
| `ball` | A human's cheese ball hits a rat, a case, a bell, a trigger, a counterfeit, a coat, or runs out of time | outcome, point, place, victim | archive, SQL; **every ball of every rat**, bounces included, is counted in cells by outcome |
| `damage` | A hit lands | attacker and victim, positions, damage, headshot, explosive, missile, distance, health after | archive, SQL |
| `death` | A rat dies | killer and victim positions and places, distance, cause (`shot`, `headshot`, `explosion`, `missile`, `city`), time alive, assists | archive, SQL, counts |
| `pickup` / `restock` / `heal` / `buff-end` | A site is claimed or returns; health is restored; a buff runs out | site, kind, place, health before, time the site sat full; heal cause | archive, SQL, counts |
| `pickup-passed` | Any rat, human, bot or agent, passes a supply it could use: the supply was stocked, within 12 units horizontally and 3 up or down, in clear sight, and not a Quick Fix at full health; the rat then went more than 16 units away, 6 up or down, or died, while the supply stayed stocked and the rat never claimed it. One per approach; checked 5 times a second, with a sight line only when a supply first comes in reach | the rat, `site`, `kind`; `dist`, `p`, `place` and `hp`: the nearest the rat came (horizontal distance), where, and its health there | archive, SQL, counts (`passed:<kind>`) |
| `case` | `take`, `drop`, `steal`, `deliver`, `respawn` | who, from whom, point, place, carry time | archive, SQL, counts |
| `launch` / `landing` | A machine throws; the rider comes down | machine, overpressure, landing place, airtime, apex, **landed inside geometry** | archive, SQL, counts |
| `dispatch` | Dispatch changes phase or incident | phase, incident, caller, pillar rung, Most Wanted | archive, SQL |
| `zone` | A Jurisdiction zone activates or changes scorer | zone, scorer | archive, SQL |
| `round` | A round starts or ends | humans, bots, agents; winner, method, duration, every rat's final standing and K/D/A | archive, SQL |
| `session` | A human or agent joins or leaves | actor, `human`, `agent` | archive, SQL |
| `anomaly` | `inside-geometry`, `fell-through`, `out-of-bounds` (at most once per 10 s per rat) | point, place | archive, SQL, counts |
| `rescue` | A stuck bot is moved to a spawn point (`GameRoom.recoverManagedBot`), from B2b of [the bot overhaul](bot-overhaul.md) | the bot, the point and place where it was stuck | archive, SQL, counts. The bot gate counts rescues per bot-hour |
| `decision` | Since `mindVersion` 6 (L4 of [the bot learning plan](bot-learning-plan.md)), every decision moment of a server bot, whether it keeps its goal or not: an event (spawn, its goal ending or failing, the case changing hands or a case goal becoming possible, the assignment moving on, Jev coming on for a human) or 10 s since its last decision; in between the bot holds its goal. Before: when a bot took up a goal (its open goal ended, or this decision replaced it) or applied a Jev answer not yet recorded, while the code mind decided every 180–300 ms | the bot, point and place; `mind` (`jev` or `code`), `personality`, `goal`, `motor` (the plan's motor mode), `trigger` (`beat`: the 10 s ran out; `event`), `top` (the best three offered goals as `[goal, raw score, weighted score]`), `danger`, `target` (the answer named a rat), `failed` (the motor gave up the previous plan); `stance` (since L4: `fight`, a rival close by takes over the rat's movement whatever its goal, or `focus`, only where the plan fights or when a rival has just hit it; from Jev's answer, otherwise the code mind's rule for the chosen goal); for Jev, `latencyMs` and `tokens`; for a code decision while Jev was on, `jev` (`stale`, `fallback`, or `answered` when Jev scored none of the offered goals); `in`, what the bot faced, from the world of the room's latest tick (since L1): `case` (horizontal units to the case, or to whoever carries it), `carrier` (to the carrier, when another rat carries it), `rival` (to the nearest living rival), `closer` (nearer the case than every living rival), `hp`, `rivalHp` (the nearest rival's), `seen` (rats in line of sight within 150 units), `carrying`; distances to 0.1 | archive, counts (`decide:*`); not SQL events (see volume below) |
| `goal-end` | A bot's goal ends: `reached`, `died`, `replaced` (a decision changed the goal) or `failed` (the motor gave it up). Reached means: took the case (`take-case`); took the case from the chased carrier or killed them (`chase-carrier`); killed the hunted rat itself (`hunt`); claimed the pickup it went for (`heal`, `arm-up`); delivered, or started scoring in the zone (`keep-case`); rang the pillar (`mischief`); came within 3 units of its place (`roam`, `flee`, `ambush`, `mischief`, and, before protocol 25, an evading Closing Time carrier). A goal open when the round changes ends unrecorded | the bot, `goal`, `motor`, `mind` and `personality` of the decision that took it up, `outcome`, `durationMs`, `from` (the place it was taken up), and the point and place where it ended | archive, counts (`goal:*`); not SQL events |
| `minds` | Every minute while Jev is on, and when it switches off | that window's `ms` and the Jev mind's counts: `decisions` taken while on, `requests`, `answers`, `failures`, `staleDrops`, `fallbacks`, `throttled`, `tokens`, `dollars`; reply latency `p50` and `p90`, and `hist` (every reply's latency, counted per 20 ms bucket keyed by its lower bound) | archive, SQL, `city_minds` |
| `perf` | A player's client reports its frame performance: every 30 s of play and when the page closes (from 5 s of play), at most 3 a minute per player (`PERF_RATE`); bad fields are dropped one by one, a report without its frame counts is dropped whole, the socket stays. Not from bots; an agent's says `human: false, agent: true`, so machine-class reports can leave agents out | the window's play `ms` and `frames`; `fps` (frames a second) and `fps50` (at the median frame); frame times `p50`, `p95`, `p99`, `worst` (ms, rAF to rAF); `over33` (frames over 33.4 ms, under 30 fps) and `over100` (hitches); `cpu50`/`cpu95` (main-thread work inside the frame: a slow frame with little CPU work is GPU-bound); `heapMb` (Chromium only); drawing buffer `w`×`h`, device `dpr` and render `pr` pixel ratios; `gpu` and `gpuVendor` (WebGL unmasked renderer and vendor: ANGLE's Direct3D 11 backend and the GPU model on Windows); `os`, `browser`, `browserMajor`, `cores`, `memGb` (`deviceMemory`); `quality` and `scale` once graphics quality adapts. Schema `src/shared/perfReport.ts`; client `src/session/perfReporter.ts`. Read it with `node scripts/perf-report.mjs` after mirroring | archive, SQL |

### The situation: what every rat faces, every second

Defined once in `src/shared/city/facts.ts` (`RatSituation`, `WorldSituation`), with K/D/A and standings in `src/shared/city/ledger.ts`. The future AI is meant to learn from exactly this view. The bots will be redone from scratch; they can read the same definition, or the definition can change with them under a new schema version.

- **The rat:** position, floor, place, velocity, yaw, aim pitch (a human's camera pitch while their client sends it; otherwise 0), health, alive, respawn countdown, time alive.
- **Pickups on it:** Ironclad and Hot Pursuit time left; its last pickup and how long ago.
- **Case:** carrying it and for how long; distance to the case; distance to the current objective (Paper Chase destination, Jurisdiction zone, or the case).
- **Standing:** `progress` (its fraction of the win: deliveries out of 3, zone time out of 60 s, case kills out of 10; before protocol 25, Closing Time case time as a share of the best), `rank` (ties broken by kills), `lead` (against the nearest rival; negative when behind), `raw`.
- **K/D/A this round:** kills, deaths, assists, streak, damage dealt and taken, headshots, shots, hits. **An assist** is damage dealt to a victim in the 10 s before someone else (or the city) killed it.
- **Shooting:** trigger pulls in the last 10 s and time since the last one.
- **Danger:** rivals in line of sight within 60 units, the nearest rival's distance, when it was last hit and by whom, and whether it is Most Wanted.
- **The world:** the case (holder, loose, returning, place, time since it changed hands, decoys), Dispatch (phase, incident, time left, caller, Most Wanted), every pickup site's restock countdown, every machine's pressure, the Jurisdiction zone (time left, who is inside, scorer), and how many humans, bots, agents (when any), corpses and balls are in play.

**Episodes:** a round is an episode and each life (spawn to death) a smaller one. Outcomes attach to situations by time: died within N s, got the kill, took the pickup, won the round.

**Aggregates the room keeps live**, in SQLite, per UTC day, build, layout version and assignment, and kept forever. The first release with builds rebuilds the four tables once with the build in their key, on the room's first start; rows from before then read as build `unknown`. An older release cannot write to the rebuilt tables, so rolling back past it breaks the aggregates (the facts and the archive are unaffected):
- `city_cells`: cells per layer. The layers are `humans`, `bots` and `agents` (seconds), `deaths`, `kills`, `spawns`, `pickups`, `landings`, `anomalies`, `shots-human`, `shots-bot`, `shots-agent`, and `ball-<outcome>` for every ball of every rat.
- `city_places`: per place, `human-s`, `bot-s`, `agent-s`, `still-human-s`, `still-bot-s`, `still-agent-s`, `deaths`, `deaths-human`, `deaths-bot`, `deaths-agent`, `kills`, `kills-human`, `kills-bot`, `kills-agent`, `kill-dist-dm`, `shots-human`, `shots-bot`, `shots-agent`, `hits-human`, `hits-bot`, `hits-agent`, `bank-hits-human`, `bank-hits-bot`, `bank-hits-agent` (hits that came off a wall first), `spawns`, `spawn-deaths-5s`, `pickup:<kind>`, `passed:<kind>` (supplies passed, filed where the rat came nearest), `launches`, `landings`, `landing-clips`, `case-take`, `case-drop`, `case-steal`, `deliveries`, `anomaly:<what>`, `rescues` (stuck bots moved away from here); and the minds (`src/shared/city/minds.ts`): `decide:<mind>:<personality>:<goal>` for each `decision` fact made here, and `goal:<mind>:<personality>:<goal>:<outcome>` for each goal taken up here when it ended. Counts without a `-human`, `-bot` or `-agent` label (deaths, kills, spawns, pickups and the rest) are every rat's.
- `city_flows`: place-to-place transitions, by humans, by bots and by agents (`who`).
- `city_minds`: the Jev mind's room-wide measures, summed from `minds` facts: `on-ms` (time Jev was on), `decisions`, `requests`, `answers`, `failures`, `stale`, `fallbacks`, `throttled`, `tokens`, `microdollars`, and `latency:<ms>` (replies per 20 ms bucket; `latency:2000` holds 2 s and over). Aggregates are not split by `mindVersion`, but a new mind ships in a new build; within one build compare minds versions from the facts (`scripts/bot-gate.mjs --mind=`).

Discrete facts also sit in `city_events` for 30 days, except `decision` and `goal-end` (hundreds per bot-hour), which only the archive and the aggregates keep. Heat v1's tables were folded into `city_cells` by the migration.

**The raw archive:** R2 bucket `rat-detective-city` (staging `rat-detective-city-staging`), keys `city/raw/v1/<room>/YYYY/MM/DD/HH-mm-ss-<id>.jsonl.gz`. It is flushed every 5 minutes, at 2 MB, and when the city stops, and kept forever. An eviction loses at most the buffer.

**Measured cost** (`node scripts/benchmark-server-tick.mjs --city`, 9 bots, 2 minutes):
- the recorder costs 0.01–0.02 ms a tick, 1–2% of the benchmark's tick, over the 1% aim;
- the trajectory hash is unchanged, so recording does not alter the game;
- the bot-only city archives about 6.5 MB a day compressed, about 2.4 GB a year;
- human play adds 1 Hz frames and every human shot while it lasts;
- the bots' minds (B5) add `decision` and `goal-end` facts: about 680–1,120 decisions and 520–970 goal ends per bot-hour on the code mind, and about 3,300 decisions per bot-hour with Jev on (one per answer; measured in a worker room with 9 bots, see [the bot overhaul](bot-overhaul.md), B5). Gzipped they take about 26 and 29 bytes each, about 10 MB a day more for the bot-only city (about 17 MB a day in all). They are archived and counted per place, never kept in the SQL events.
- the data foundation (L1) adds decision inputs and `pickup-passed` at no measurable cost: the recorder's share of the tick was 3.1% against 3.15% before (`--city --human`, 3,600 ticks, 30 September 2026). In that run bots passed about 10 usable supplies per bot-hour, about 280 bytes raw each.

## Layer 3: measures

Every rate is divided by its exposure and shown with its uncertainty. **Humans are the primary signal** and bots are reported separately, because bots are known to play badly until the bot overhaul.

| Measure | Definition | Reads as |
| --- | --- | --- |
| Use | place share of human rat-time ÷ place share of walkable area | Below 0.3 is a dead zone; above 3 is a magnet |
| Danger | deaths in place ÷ rat-minutes in place (human, bot and agent time) | How lethal it is to stand here |
| Lethality balance | kills made from place ÷ deaths suffered in place | Above 1 is a strong position (sniper roost); below 1 is a trap |
| Engagement | shots fired from place ÷ rat-minutes | How much fighting it produces |
| Accuracy by place | body and head hits ÷ shots, by shooter place and victim place | Cover quality and sightlines |
| Ball ends | ball ends by outcome per cell | Where cheese piles up, where it bounces, where it expires unused |
| Kill distance | distribution of killer-to-victim distance per place pair | Sightline length in practice |
| Flow | transitions per rat-hour between adjacent places | Routes actually used |
| Transit time | median seconds between two places, by route | How far things really are |
| Objective reach | median time from spawn to case, to each destination, to each zone | Whether objectives are fairly placed |
| Spawn safety | share of spawns that die within 5 s, or are damaged within 3 s | Bad spawn places |
| Pickup value | claims per hour, time from restock to claim, detour distance, holder's kills while buffed | Pickups nobody takes, or everyone camps |
| Launcher use | launches per hour per machine, landing spread, deaths within 5 s of landing, landing clips | Whether launchers are fun or broken |
| Case dynamics | loose time, carry distance, steal places, delivery route times | How the objective moves through the city |
| Zone contest | distinct rats inside per minute, scoring share | Whether a zone is a real fight |
| Dispatch | calls per pillar, deaths during each incident against baseline | Which pillars matter; which incidents bite |
| Stuck rate | anomaly counts per rat-hour per place | Collision bugs, including roof clipping |
| Bot divergence | Jensen–Shannon distance between the human and bot place-occupancy distributions (0 = same, 1 = unrelated) | The bot overhaul's scorecard |
| Minds (B5 of [the bot overhaul](bot-overhaul.md); `tallyMinds`, `jevSummary` in `src/shared/city/minds.ts`) | recorded decisions by mind and Jev's share of them; the goal mix per personality (decisions per goal); goal success (`reached` ÷ ended, per goal, with the died, replaced and failed shares); Jev reply latency p50 and p90 (pooled 20 ms buckets, read at the bucket's middle); dollars per hour Jev was on and per human rat-hour; fallback share (code-mind decisions ÷ decisions while Jev was on) and stale share (stale drops ÷ replies) | What the minds choose, where, whether it works, and what Jev costs |

**Statistical rules:**
- No finding from under 10 human rat-minutes in a place, or under 20 events.
- Rates carry Wilson intervals; counts carry Poisson intervals.
- Comparisons stay within one assignment, or weight assignments by their exposure.
- "Changed" means the intervals of the two layout versions do not overlap.
- Every measure states its exposure next to it.

## Static analyses: what the layout implies before anyone plays

These are computed from layers 0–1 alone. They are the priors, and telemetry tests them. Built in `src/shared/city/analysis.ts` on a 1-unit street grid from the collision boxes (`StreetGrid`: solids above a rat's hop height stop a walk, solids across eye height stop sight, solids across mid-body are cover, cell bars stop a walk but neither sight nor cheese, tilted ramps and stairs are walkable, the harbour is water except under decks), sampled on the map's 4-unit cells:

- **Exposure raster** (`sightlines`): for each street cell, the open ground in view and the longest clear line, 32 directions at eye height up to 180 units. Long open lanes show up before anyone dies in them.
- **Cover density** (`coverDensity`): the share of ground within 6 units that shields a body.
- **Travel-time field** (`travelSeconds`, `travelField`): running seconds (18 units a second, no corner cutting) from every street cell to the nearest objective (case spawn, supply, pillar, zone, Paper Chase stop; upstairs ones from the street below, sewer ones left out), and **spawn-to-objective** medians per district (`spawnReach`).
- **Cut-off ground** (`islands`): street cells that cannot be walked to from the main network.
- **Chokepoints** (`chokepoints`): the betweenness of each street place on the graph of places that touch.
- **Every place has a job** (`jobs`): case spawns, supplies, pillars, zones, stops and spawn points per district; a district with no objective is stamped NO JOB.
- Not built yet: routes through stairs, the sewer and launch arcs, and the vertical-access table (how each roof and upper floor is reached, and how long it takes).

## Agent surfaces

All ranges take `days=1–3650`, `days=all`, or `from` and `to` (UTC days); aggregates also take `mode=`, `layout=` and `build=` (a release name, or `unknown` for counts from before builds). Built in `src/worker/city/cityApi.ts`.

| Surface | Returns | Status |
| --- | --- | --- |
| `GET /api/heat/v1` | Every cell layer | Live |
| `GET /api/city/v1/digest` | The Markdown reading, with evidence handles. Its exposure line gives human and bot rat-hours, and agent browsers' rat-hours when any, which no other line counts. With `build=`, its heading names the build. Its **Minds** section (when anything was decided) gives decisions per mind and Jev's share, the goal mix per personality, success per goal, and while Jev ran: latency p50/p90, dollars per hour on and per human rat-hour, fallback and stale shares, failures and throttled requests; handles `minds:decide`, `minds:decide:<personality>`, `minds:goal:<goal>`, `minds:jev`, each answered by `places` (its `decide:*`/`goal:*` measures and `minds`) | Built |
| `GET /api/city/v1/model` | Layers 0–1: every layout entity and every place (262 in layout 3; 196 in layout 2) with IDs, kinds, names, areas and centres | Built |
| `GET /api/city/v1/places` | Summed place counts, human time by assignment, `minds` (the `city_minds` measures) and `builds` (every build recorded over the range, whatever the filter, with its `human-s`, `bot-s` and `agent-s`) | Built; rates come from `src/shared/city/measures.ts` |
| `GET /api/city/v1/flows` | Place-to-place transitions by humans, bots and agents | Built |
| `GET /api/city/v1/events?type=&round=&since=&limit=` | Discrete facts from the last 30 days (a round's timeline is `round=`) | Built; bearer `CITY_TOKEN` |
| `GET /api/city/v1/archive?prefix=&cursor=`, `/archive/<key>` | The raw archive listing and objects | Built; bearer `CITY_TOKEN` |
| `node scripts/city-mirror.mjs [--base=…]` | Mirrors the model, aggregates and every archived fact into `output/city/city.db`: tables `facts`, `situations` (one row per rat per frame), `place_counts`, `flows`, `cells`, `places`, `entities`. `facts` and `situations` carry `build` (null before build stamps), `agent` (1 for an agent browser's rat, shot, session or perf report) and `code_only` (1 in a code-only round, where the bots keep the code mind with humans playing); an older `city.db` gains the columns in place. `city_minds` is not mirrored; its facts (`minds`) are | Built; agents only. The token is in `~/.config/rat-detective/city-token` on Veelox and Halla |
| `node scripts/bot-gate.mjs [--mind=<mindVersion>] [--build=<build>\|unknown] [--rounds=ordinary\|code-only] …` | The bot gate's numbers from the mirror, with a `minds` section: decisions per bot-hour by mind, Jev's share, success per goal, Jev latency p50/p90 (every reply, from the `minds` facts' `hist`), dollars per hour on and per human-hour, fallback and stale shares. Agent rats count as neither humans nor bots; `--build=unknown` selects facts from before build stamps; `--rounds=ordinary` leaves out code-only rounds (so Jev's cost per human-hour counts only hours Jev could be asked). `scripts/motor-compare.mjs` takes the same `--build=` and leaves agents out too | Built; agents only |
| `design/data/eras.json`, `node scripts/era-report.mjs <before> <after>` | The era registry ([the data plan](data-plan.md)): each era's environment, window or `build` (one build, or a list when a later deploy changed only presentation), layout, `mindVersion`, commits, one-line change and predictions (a scorecard measure, `up`/`down`/`not-up`/`not-down`, and optionally a bound `below`/`above` or a `factor`). The report reads each era's facts from the mirror (`--db=`, `--staging-db=`) and writes a one-page change report to `docs/reports/`: data per era, each prediction's verdict (met, missed, too close to call, waiting for data; called only when the 95% intervals part and both sides clear this page's minimums, 30 human minutes to judge), the scorecard (Jev cadence and cost; decisions per bot-minute, their triggers and stances, goal holds and endings; pickups passed; hit rate by distance and blind-shot share for humans and bots; humans' frame rate by OS and GPU; kills between humans and bots) and Jev's cost. Jev, decision and human-likeness measures and the verdicts read ordinary rounds only; a section compares code-only rounds with ordinary ones in the same era (human-likeness, and kills between humans and bots). Agents are left out of every human and bot figure | Built; agents only. Selection, scorecard and verdicts in `scripts/lib/eras.mjs` |
| `node scripts/round-report.mjs <round-id> [--db=…] [--out=…]` | One round's case file as a self-contained HTML page (template `scripts/round-report.html`), from the mirror; the round must have ended in it. Tab one, the round: standings, the race to the win, case holders and incidents over time, kills per minute, carries, lives, causes, who killed whom, a death map, supplies, the air, incidents, Jev and frame rate. Tab two, shooting: shots and rate per rat, time between human shots and bursts, range and accuracy by distance, aim error, lead on crossing rats, human ball contacts, banks, headshots, time to kill, accuracy over time and by incident, a human hit map and who hit whom. Bots' sampled shot facts count ten each; per-rat totals come from the final standings. Writes `output/reports/round-<id8>.html` | Built; agents only |
| `/map` (alias `/heatmap`, a 301 that keeps the query) | The page below: the same public endpoints, drawn | Live |
| `design/city/proposals/*.json`, `design/city/layouts/*.json` | Proposals (goals, predictions as measures) and layout snapshots for diffs: `layout-2.json`; `layout-3.json` and `layout-4.json` add each footprint's and collider's yaw, the bars cheese passes, the harbour water and the supply sites (`[id, kind, x, y, z]`) | Built; parsed by `parseProposal`, judged by `judge` in `src/shared/city/verdict.ts` |

Query the mirror with `read output/city/city.db?q=SELECT …`.

## The page

**`/map`** (`map.html`, `src/map/`), with `/heatmap` kept as an alias: the Worker answers `/heatmap` and `/heatmap.html` with a 301 to `/map`, query intact (`run_worker_first` lists `/heatmap`). The city is drawn from the shared layout modules (graybox and kit colliders, `CITY_STREETS`, `kitCity().water`, piers, sewer halls, the jobs registries), so layout 3 shows as built. Every choice lives in the URL, so a refresh keeps the view; the open mode reloads its data every minute. `?api=https://ratdetective.online` points a local build at production's public endpoints. Three modes over one canvas:

- **Observe** (`observe.ts`): any recorded layer (human and bot time, deaths, killer spots, shots, cheese bounces, hits and run-outs, pickups, landings, spawns, faults) as 4-unit cells or shaded per place, by floor, date range, layout, assignment and build (`?build=`; the list holds the builds recorded over the range, with their human time). Upper floors, rooms, roofs, lookouts and the chutes are chips at their building (8, 16, R, L, C). Flow arrows between places and the overlays (sewer, supplies, case spawns, launchers, pillars, zones, stops). Hover for a place card with its counts. Counts under retired layout-2 IDs fold into the place that now holds that ground (`PLACES.successor`).
  - **Minds** (`minds.ts`, places only): where the bots take up each goal (the `decide:*` counts), filtered by mind (both, Jev, code), personality and goal (`?layer=minds&mind=&persona=&goal=`). With every goal shown, each place takes the colour of its most chosen goal, brighter where more is decided per area (the legend lists the goal colours); with one goal, the usual ramp. The place card adds the decisions there by mind, the goal mix, and how the goals taken up there ended; the totals add decisions and Jev's share, hours Jev was on, its latency p50/p90 and dollars per hour on.
- **Analyse** (`analyse.ts`): the static analyses above as layers (continuous ones shaded by rank, so a city of long streets still shows its most exposed cells), and the measures per place: use, danger to humans, danger for all rats, lethality, human and bot fire rates, banked-hit share for humans and bots, spawn traps and bot divergence (per place, and the Jensen–Shannon distance for the whole city). Each shows its 95% interval and exposure; a place under the minimums (10 human rat-minutes, or 20 events for counted measures) is drawn faint and left out of the table. The digest is shown as written.
- **Design** (`design.ts`): every proposal in `design/city/proposals/`, each prediction's reading on the layout before and the layout after (`/api/city/v1/places?layout=`), stamped *waiting for play*, *met*, *missed* or *too close to call*; the footprint diff against the proposal's baseline snapshot (added, removed, kept; Before and After views), and the supply-site diff where the baseline snapshot has supplies (added, removed or moved, kept, drawn as dots); and the static analyses of both layouts side by side (walkable ground, the north third's share, cut-off ground, median sightline and cover). A proposal whose layout after is older than today's reads that side from `design/city/layouts/layout-<n>.json`, so `proposal:overhaul-v3` still compares layouts 2 and 3.
- Not built: scrubbing a round's timeline. Round facts are behind the token (`events?round=`), and the page uses only public endpoints.

`proposal:overhaul-v3` is the first proposal: the layout-3 overhaul, with five predictions (north share of human time up, banked-hit share up, the west third's share of deaths up, the case's Needleworks-upstairs share down, Ironclad claims per rat-hour up). A prediction is judged only when both layouts have 30 human rat-minutes (`VERDICT_HUMAN_SECONDS`) and enough events, and called only when the 95% intervals part; play time counts in minutes, not seconds, so an hour is not 3,600 trials.

`proposal:supplies-v4` (layout 3 → 4, baseline `design/city/layouts/layout-3.json`) moves the supplies from layout 3's play (87 human minutes, 68.5 bot hours). Four of the five Ironclad sites were upstairs or on a roof and almost never claimed (0, 0, 0 and 2 claims, against 189 at the Records forecourt street site), and the infirmary Quick Fix was never claimed. Static check on the street grid (18 units a second) from layout 3's recorded deaths and hits, before → after: the worst of the 25 deadliest street places 6.7 → 3.4 s from a medkit (median; 90th percentile 7.8 → 4.1 s); street deaths within 6 s 85% → 100%; human hits within 6 s 80% → 99%; street ground within 6 s in the south-west 17% → 92%, north-east 33% → 98%, south-east 47% → 100%, north-west 51% → 98%. A headless bot run of the same build (24 rooms, 3.2 room-hours) claimed every one of the 23 sites; the one site with rescues nearby is the unchanged Gate tunnel mouth, as before. Four predictions: Quick Fix and Ironclad claims per rat-hour up, the landmark ground floors' share of Ironclad claims up, human deaths per human rat-hour down.

`proposal:supplies-v5` (layout 4 → 5, baseline `design/city/layouts/layout-4.json`) adds the four Stakeout sites. Each stands on a four-way crossroads with open street 25 units each way, at least 38 units from every other supply, 8 from case spawns and pillars, 10 from launcher pads and outside every Jurisdiction zone; each is supported and clear at its authored point, and a server bot reaches and claims each. One prediction: human kills per human rat-hour up.

The brainstorm sketch (`output/city-map/city-map.html`: the docks, the Panopticon precinct, north sewer branches, the Gate–precinct route, cut junction corners, landmark bank walls, the Needleworks chute and Ironclad moves; agreed 2026-09-29, see [the juice plan](juice-plan.md)) became that proposal. The overhaul itself is built in one run from [the city overhaul plan](city-overhaul.md); afterwards the layout is tuned from data for at least a week, one `layoutVersion` per adjustment.

## The design loop

1. **Read:** the digest names the problem, with evidence handles.
2. **Propose:** a layout diff with a stated goal and a predicted measure change. For example, "north district Use from 0.1 to above 0.6; Records forecourt Danger down 20%".
3. **Pre-check:** the static analyses on the proposal, plus a headless bot run (`scripts/benchmark-server-tick.mjs`) for smoke. Bot results count as evidence only once bot divergence is low.
4. **Ship:** under a new `layoutVersion`, with Tyler's OK.
5. **Judge:** a verdict compares the versions on the predicted measures and on everything else (no new dead zones or spawn traps). It is recorded under `design/city/verdicts/` and in Chartroom.

## Rules that keep the map true

- **A gameplay feature is not done until it emits its facts.** New pickup, machine, incident or zone means new or extended events, and a line in the table above.
- **Any layout change bumps `layoutVersion`.** Place IDs stay stable, or the change ships an old-to-new mapping.
- **Measures are pure functions of facts and places**, versioned, and recomputed rather than patched.
- **Recording stays cheap:**
  - at most 1% of room tick time, checked with `benchmark-server-tick.mjs --city` (today 1–2%; the next saving is building frames less often);
  - bounded memory between flushes;
  - no work at all per cheese-ball bounce beyond the existing events.
- **Public surfaces carry counts only.** The raw archive is private.

## Build order

1. **Places and frames (built).** `src/shared/city/frame.ts`, `places.ts` (196 places: 60 street stretches, 28 junctions, 32 lots, 45 rooftop groups, 10 landmark floors and roofs, 2 Gate places, 10 sewer places, 9 air districts), `model.ts`. The landmark wall names are left as they are; the frame defines compass words. Originally: `cityModel()` gathers layer 0. Build the place graph and the cell-to-place index. `GET /api/city/v1/model` and `output/city/model.json`. Fix the compass naming. *Acceptance:* every walkable cell on every floor maps to exactly one place; place areas sum to the walkable area.
   - **Layout 3** (W9 of [the city overhaul](city-overhaul.md)) names the new north: `quay:0`–`quay:2` (the quay edge, split where streets meet it), `pier:m20`, `pier:20`, `pier:70`, `pier:breakwater`, `boat:deck` and `boat:bridge`, `water:harbour` (anything below quay level over the harbour), `yard:containers` and `yard:containers:top`, `floor:pier9:0`, `floor:pier9:5` (catwalk) and `roof:pier9`, `floor:precinct:0/8/16` and `roof:precinct`, `floor:cellblock:0/8/16` and `roof:cellblock`, `yard:cellblock`, `grounds:precinct`, `landmark:cellblock-tower`, `lookout:tower`, `lookout:cranes`, `exit:precinct-sewer`, `exit:docks-sewer`, `street:gate-lane:*`, `street:quay-road:*`, `chute:needleworks:8` and `:16`, and one `room:<id>` per kit room in the north (`kitCity().rooms`: the precinct's lobby, lockup, radio room, armoury and the rest, the harbour master, the Marlowe's cabin and bridge). 262 places.
   - **IDs stay stable.** Layout-2 streets, junctions, landmarks and sewer halls keep their IDs (their stretches are still counted at layout-2 crossings). Lots and rooftops are numbered by size, so each keeps its ID while its group still holds its layout-2 anchor cell and half its old cells (`src/shared/city/legacyPlaces.ts`, generated from layout 2); a retired one maps to the place that now holds that anchor (`successor`), and the page and verdicts fold old counts through it. Layout 3 retires 17 of layout 2's 196 IDs, all lots or rooftops that the docks, the precinct and Gate Lane were built over. A place spanning districts is filed where its centre lies.
2. **Facts (built).** `src/worker/city/CityRecorder.ts`, `CityStore.ts`, `CityArchive.ts`, hooked into `GameRoom`. Originally: record all events in the table, with context and versions. Add the live aggregates, the anomaly detectors and the R2 archive.
   - *Acceptance:* failure-mode tests (bot versus human, corpses, disconnects, victory time, eviction, midnight, caps, schema version), plus measured tick cost under 1%.
   - Human play then builds up a baseline on today's city.
3. **Agent surfaces (built).** Originally: digest, places, flows, timeline, events, and the mirror script. *Acceptance:* every digest line resolves through its handle; the mirror answers a query via `read`.
4. **The page, Observe mode (built on `city/overhaul`).** Places, flows and cards; round timelines are left to agents (`events?round=`, token).
5. **Static analyses and Analyse mode (built on `city/overhaul`).** Vertical access and routes through stairs, sewer and launchers are still to come.
6. **Design mode (built on `city/overhaul`).** Proposals and verdicts; `proposal:overhaul-v3` is the first. Then the city overhaul proper: layout decisions from evidence, the kit of reusable parts, the load-time lessons.
   - The bot overhaul uses the same places, navigation graph and bot divergence as its scorecard.

## Decisions (Tyler, 2026-09-28)

- **R2 archive:** yes. The buckets `rat-detective-city` and `rat-detective-city-staging` were created on 2026-09-29.
- **Assists:** damage in the 10 s before someone else's kill.
- **Sampling:** once a second, plus 5-a-second windows around every fight. The bot-only city records every 5 s.
- **Bots:** they will be redone entirely ("in a way you can't even imagine"). The situation stays a shared definition they may use, not a constraint on them.
- **Shooting:** measure how often humans and bots shoot (Tyler, 2026-09-29). This covers the counts and cells by who, fire rate in every situation, shots in K/D/A, and the digest's shots per minute.
- **Shooting is always good** (Tyler, 2026-09-29): there is no downside to firing except that rivals hear it. Cheese banks off walls, so firing with nobody in view is round-corner fire at where a rat might be, not waste; the Hunch (seeing through walls at full health) makes those bank shots aimed. The recorder counts banked hits (`bank-hits-*`, `bounces` on a human's ball facts). The chaos and the volume of cheese are wanted; 5 HP exists so a rat can stay in the fight and take hits. Do not treat blind fire or low hit rates as problems to reduce.
- **The bot overhaul will surprise us (Tyler, 2026-09-29):** "we're going to redo bots in a way you can't even imagine, and it's gonna completely change the way you're thinking." Design the city for the game's rules and for human play, not around today's bots or guesses about tomorrow's.
- **Bot skill ceiling:** bots must not outplay Tyler (a former collegiate League of Legends player) in the base game; their current level is about right. A separate "nightmare" difficulty could be fun later. The overhaul is about moving and playing more like humans, not about being stronger.
- **Needleworks in the first session was an anomaly:** the case got stuck on its second floor and rats died there repeatedly retrieving it. Do not read that round's Needleworks heat as normal.
- **Public detail:** aggregates and the page are public; events and the archive need the token.

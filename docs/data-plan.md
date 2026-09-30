# Data plan: from recordings to answers for Tyler

**Status:** proposed 30 September 2026. Nothing below is built yet unless it says so.

The city recorder already captures almost everything that happens in a round (see [the city map](city-map.md)). This plan is about making that data easy to answer questions with. Tyler should be able to ask "did that change work?" and get a plain answer backed by numbers, with the amount of data behind it.

## The questions Tyler asks

1. **Did this change do what we wanted?** Compare before and after, on the measures the change was meant to move, and check that it didn't break anything else.
2. **How close are the bots to humans?** Movement, aim, where they go, what they choose to do.
3. **What does Jev cost, and what does it buy?** Money per hour, and whether Jev bots play more like humans than the free code mind.
4. **Does the game run well on players' machines?** Frame rate by operating system and graphics chip.
5. **Where in the city does play happen?** Already answered by `/map` and the digest.

Every piece of structure below exists to answer one of these.

## What we have today

- **Raw facts, kept forever.** Every fact goes to the R2 archive with its room, round, `layout`, `mindVersion`, `schema` and assignment `mode`. `node scripts/city-mirror.mjs` copies them to `output/city/city.db` for analysis. Anything recorded can be split by layout and mind version after the fact.
- **Aggregates for the map and digest.** Counts are kept per day, layout and assignment only. The mind version is not part of the key, so the digest's Minds section mixes bot versions over its date range.
- **Jev's own counts.** Once a minute while Jev runs, a `minds` fact records its requests, answers, stale and failed replies, fallbacks, tokens, dollars and reply times. This is enough to compare how often Jev is called and what it costs.

## Gaps

1. **No build identity.** Layout and mind version cover only two kinds of change. Rule changes such as the 30-second round end, streak rewards or a new pickup are separated only by dates.
2. **Agent traffic counts as human.** Agents' headless browsers join as ordinary players. This is why staging has fake "Windows" performance rows. Any human measure taken on staging is polluted.
3. **Aggregates can't be split by version.** The digest and map can only compare date ranges.
4. **Expectations aren't written down, except for layouts.** Layout proposals state goals and predictions that the map judges (`design/city/proposals/`). Nothing does this for bot, Jev or rule changes.
5. **Jev's decisions lack their inputs.** A `decision` fact records the goal chosen and the code mind's top three options. It doesn't record distance to the case or the carrier, who is closer, or both rats' health. These can only be approximated by joining the 1-per-second `situations`.

## The structure

### 1. Eras

An **era** is a period in which nothing that affects play changed, in one environment.

- **Build stamp.** Every fact carries a `build` field: a readable release name set at deploy time (for example `2026-10-02-jev-light`), next to `layout` and `mindVersion`.
- **Era registry.** `design/data/eras.json` lists each era:
  - build, environment (production or staging), start and end time, commits;
  - what changed, in one line;
  - the questions it should answer, as predictions in the existing proposal format so `judge` can mark them *met*, *missed* or *too close to call*.
- **Back-filling.** Past eras are filled in from release receipts and dates: layout 3 on 29 September, the bot overhaul on 30 September, and the staging builds.

### 2. Who is playing

Every rat is marked as a **human**, a **bot** or an **agent**.

- Agent browsers join with an explicit flag, and their rats and performance reports are recorded under `agent`.
- Human measures never include agents.
- Tyler's own playtests stay `human`.

### 3. Aggregates by era

Add the build to the aggregate key: day, build, layout, mode. The digest and map can then show "this era against that one" directly, without mirroring the archive.

### 4. One scorecard, same definitions every era

Each measure has a fixed definition, a sample size and a 95% interval. The city map's minimums apply: no finding from under 10 human rat-minutes in a place, or under 20 events.

| Question | Measures |
| --- | --- |
| Jev cost and cadence | Requests per bot-minute; answers; stale and fallback shares; dollars per hour Jev is on; dollars per human rat-hour |
| Bot decisions | Median time a goal is held; share of goals replaced, reached, failed or ended by death, per goal; pickups passed but not taken (new: a usable supply within reach that the bot didn't claim) |
| Human-likeness | The motor gap from `bot-sim`; place divergence (Jensen–Shannon distance); hit rate by distance; blind-shot share; strafe and aim-turn statistics |
| Game health | Frame rate at the median and slowest frames, by operating system and graphics chip, humans only |
| Players | Human hours and sessions; kills and deaths, human against bot |

### 5. Reports for Tyler

- **Change report.** `scripts/era-report.mjs <before> <after>` reads the mirror and writes a one-page report in plain English. It covers what changed, how much data each era has, a before-and-after table for the era's predictions and the scorecard, a verdict per prediction, and the cost. Reports are saved under `docs/reports/`, and the agent summarises them in chat.
- **Weekly note.** Human hours, Jev spend, performance by machine class, and any prediction that has become readable.

## First use: the lighter Jev

Tyler agreed on 30 September that Jev should be asked only when something happens:

- the rat spawns;
- its goal ends;
- the case changes state.

It should also be asked at most every 10 seconds otherwise, and never within 3 seconds of the last request. Each answer also sets a fight-or-ignore stance. This is the era comparison to set up before that change ships.

- **Before:** production, `mindVersion` 3. Jev has run for about 44 minutes, all in one human session on 30 September, 06:49–07:32 UTC, costing $0.80.
  - That's plenty for the mechanical measures: requests per bot-minute, cost per hour and stale share.
  - It's thin for behaviour measures such as goal success and human-likeness. More human play on the current build before the switch would strengthen those.
- **After:** the lighter Jev, as a new `mindVersion` and build.
- **Predictions:**
  - requests per bot-minute fall from about 48 to under 12;
  - dollars per Jev-hour fall at least fivefold;
  - the share of "take the case" goals replaced before they end falls from 89%;
  - human-likeness gets no worse.

## Order of work

1. Build stamp, the agent flag and aggregates keyed by build. These must ship before the Jev change so the "after" era is clean.
2. The era registry, back-filled.
3. The lighter-Jev proposal with the predictions above.
4. `scripts/era-report.mjs` and the new scorecard measures, including pickups passed but not taken.
5. The Jev change itself, recording each decision's inputs for later fitting.

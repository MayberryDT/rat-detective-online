# Change report: production-2026-09-29-city-overhaul → production-2026-09-30-bot-overhaul

Generated 2026-09-30 19:52 UTC from output/city/city.db. ‡ marks a reading below the city map's minimums (10 human rat-minutes, 20 events; 30 human minutes to judge a prediction). Intervals are 95%. Agent browsers are left out of every human and bot figure.

## What changed

- **After** (production, 2026-09-30 06:46 to now (last fact 2026-09-30 19:50) UTC): Bot overhaul (mindVersion 3): the code mind for the empty city, the Jev mind (jev-1.13.0, asked about once a second) while a human plays, a $25 a day budget, bots on the shared rat body; controls recorded for every rat. Commits `c878e52`.
- **Before** (production, 2026-09-29 22:41 to 2026-09-30 06:40 UTC): City overhaul, layout 3: the docks, the Panopticon precinct, cut corners, bank walls, Gate Lane, the Needleworks chutes, north sewer branches; old bots.
- **Also changed in between:** production-2026-09-30-bot-overhaul-no-jev (The bot overhaul deployed before the Jev key was set (then redeployed as 16dcf333)).

## Data per era

|  | production-2026-09-29-city-overhaul | production-2026-09-30-bot-overhaul |
| --- | --- | --- |
| Human rat-hours (joins) | 0.39 (3) | 1.11 (4) |
| Bot rat-hours | 56.8 | 89.5 |
| Agent rat-hours (left out) | 0 | 0 |
| Jev hours on | 0 | 0.73 |
| Decisions (Jev / code) | 0 / 0 | 18,308 / 78,070 |
| Goals ended | 0 | 80,356 |
| Rounds; facts | 30; 28,054 | 60; 301,864 |
| Recorded | none of the newer fields | shot targets |

## Predictions

| Prediction | Before | After | Verdict |
| --- | --- | --- | --- |
| A Jev decision's reply latency at the 90th percentile stays under 600 ms. | no data | 130 ms (n 18,172) | **met** |
| The bots hit a smaller share of their shots than the humans do (the skill bar; the acceptance names the median human, this pools every human shot). | 4% (3.9%–4.1%, n 342,055) ‡ against 7.4% (6.6%–8.3%, n 3,664) ‡ | 3.8% (3.8%–3.9%, n 642,689) against 5.4% (5%–5.8%, n 12,718) | **met** |

## Scorecard

**Jev cost and cadence** (from the one-minute `minds` windows):

| Measure | Before | After |
| --- | --- | --- |
| Requests per bot-minute | Jev off | 56.1 (54.8–57.4, n 44) |
| Requests answered | Jev off | 100% (100%–100%, n 18,172) |
| Stale answers (dropped) | Jev off | 28% (27%–28%, n 18,172) |
| Fallbacks to the code mind | Jev off | 8.7% (8.5%–8.9%, n 73,745) |
| Reply latency, 90th percentile | Jev off | 130 ms (n 18,172) |
| Dollars per hour Jev is on | Jev off | $1.11 ($1.07–$1.15, n 44) |
| Dollars per human rat-hour | Jev off | $0.73 |

**Bot decisions** (goal ends, all minds; shares of each goal's ends):

| Goal | Before | After |
| --- | --- | --- |
| Any goal: median hold | no goal facts | 2.2 s (2.2 s–2.3 s, n 80,356) |
| chase-carrier | none | reached 5%, replaced 70%, failed 15%, died 10%; median hold 5.1 s (n 29,380) |
| take-case | none | reached 1.8%, replaced 89%, failed 2.6%, died 6.6%; median hold 2.3 s (n 23,553) |
| roam | none | reached 36%, replaced 62%, failed 0.5%, died 1%; median hold 1.3 s (n 12,738) |
| keep-case | none | reached 12%, replaced 56%, failed 4.9%, died 28%; median hold 1.8 s (n 5,580) |
| arm-up | none | reached 27%, replaced 70%, failed 0%, died 3.5%; median hold 0.9 s (n 3,582) |
| hunt | none | reached 6.7%, replaced 83%, failed 0%, died 10%; median hold 0.8 s (n 2,113) |

**Pickups passed** (a usable supply within 12 units in sight, left unclaimed; per alive rat-hour):

| Who | Before | After |
| --- | --- | --- |
| Humans | not recorded | not recorded |
| Bots | not recorded | not recorded |

**Human-likeness** (hit rate from the round ledgers; the rest from `shot` facts with targets, bot shots sampled 1 in 10):

| Measure | Before | After |
| --- | --- | --- |
| Hit rate, humans | 7.4% (6.6%–8.3%, n 3,664) ‡ | 5.4% (5%–5.8%, n 12,718) |
| Hit rate, bots | 4% (3.9%–4.1%, n 342,055) ‡ | 3.8% (3.8%–3.9%, n 642,689) |
| Shots with no rat in sight, humans | not recorded | 40% (40%–41%, n 12,731) |
| Shots with no rat in sight, bots | not recorded | 74% (74%–75%, n 67,741) |
| Gap in no-rat-in-sight share (bot − human) | not recorded | 34% (33%–35%, n 12,731) |
| Mean gap in hit rate across distance bands | not recorded | 7.5% (5.5%–9.5%, n 8) |

| Distance (units) | Humans before | Bots before | Humans after | Bots after |
| --- | --- | --- | --- | --- |
| 0–5 | – | – | 25% of 59 | 53% of 12,470 |
| 5–10 | – | – | 8.8% of 226 | 25% of 17,160 |
| 10–15 | – | – | 10% of 524 | 17% of 31,690 |
| 15–20 | – | – | 8.5% of 543 | 12% of 19,960 |
| 20–30 | – | – | 10% of 1,236 | 10% of 29,960 |
| 30–45 | – | – | 10% of 1,513 | 8.5% of 25,010 |
| 45–70 | – | – | 10% of 1,689 | 8.2% of 12,930 |
| over 70 | – | – | 5.4% of 1,791 | 3.3% of 24,250 |

**Game health** (humans' perf reports; frames a second at the median frame and at the slowest 5%):

|  | production-2026-09-29-city-overhaul | production-2026-09-30-bot-overhaul |
| --- | --- | --- |
| Machines | no reports | no reports |
| Agent reports left out | 0 | 0 |

**Players:**

|  | Before | After |
| --- | --- | --- |
| Human rat-hours | 0.39 | 1.11 |
| Humans killed bots / bots killed humans | 58 / 16 | 165 / 52 |
| Humans killed humans; the city killed humans | 0; 2 | 7; 4 |
| Human kills per human rat-hour | 150.3 (114.1–194.3, n 58) ‡ | 155.7 (133.3–180.7, n 172) |
| Human deaths per human rat-hour | 46.7 (27.6–73.7, n 18) ‡ | 57 (43.8–72.9, n 63) |

## Cost

- production-2026-09-29-city-overhaul: no Jev spend recorded.
- production-2026-09-30-bot-overhaul: Jev cost $0.80 for 18,172 requests and 19.2 M tokens over 0.73 hours on ($1.11 an hour on, $0.73 per human rat-hour).

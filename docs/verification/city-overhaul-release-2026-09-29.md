# City overhaul (layout 3) on staging, 29 Sep 2026

**Status:** the `city/overhaul` branch runs on **staging only**. Production is untouched: it still runs layout 2 on Worker `a57db85b-bad7-483d-9dbf-51368235a768`. Production needs Tyler's explicit OK after he has played the preview.

**Tyler's preview (D8):** https://rat-detective-staging.mayberrydt.workers.dev/ — the real hosted game on staging, with its own always-on canonical room (6–9 server bots, humans on top, ten-rat cap). The city map is at https://rat-detective-staging.mayberrydt.workers.dev/map. Open them normally; this build is audible for humans.

Baseline for comparison: [W0 baseline](city-overhaul-baseline-2026-09-29.md). Plan and as-built notes: [the city overhaul plan](../city-overhaul.md).

## What changed

The whole city was rebuilt on a kit of parts (W1–W9 in the plan): the docks on the north edge (quay, three piers, the freighter *Marlowe*, two climbable cranes, the container yard, the Pier 9 warehouse, water that drowns), the Panopticon precinct in the north-west (house, three-tier ring cellblock with bars, tower, yard, lineup room), cut corners, one angled bank wall in each landmark, Gate Lane, the Needleworks chutes, sewer branches north, jobs in every district, the roof-landing clip fix, the load-time work and the `/map` page modes. Layout 3, protocol 23.

One code change came out of this release pass: a fix for bots parked on a crane stair (see "Bug found and fixed").

## Versions

| Step | Worker version | Client bundle | Notes |
| --- | --- | --- | --- |
| Before this pass | `e236330f-7426-4d81-ab15-89a7aff5823f` | – | an earlier branch build used for W8 measurements |
| First deploy (branch HEAD `b9323c1`) | `c1df21f6-7048-43be-b80c-4d6de7245f9e` | `index-DRDAMpeJ.js` | soak 1 |
| Second deploy (HEAD plus the first, over-eager parked-bot fix) | `50e7cd63-90f1-4ad6-b560-4d4331a1810c` | `index-ftnkjpon.js` | soak 2 |
| Third deploy (adds the rescue position to the log) | `125dc4b0-ddfb-403f-b7c8-89549bd0fa1b` | `index-ftnkjpon.js` | 21-minute rescue audit |
| Final deploy (the final fix below) | `5aeb800a-dc54-467a-9825-b61408ace89f` | built from the same tree | **current staging**; not soaked (see below) |

Every deploy ran `npm run deploy:staging` on Halla (build plus `wrangler deploy --env staging`). Protocol 23, `GRAYBOX_VERSION` 3; staging `/status` reports world version 3, seed 2383011301. `/map` answers 200 and `/heatmap?x=1` answers 301 to `/map?x=1`.

## Before and after

All on Halla (headless Chrome, ANGLE gl-egl, Radeon iGPU), the same tools as W0. Differences within about ±15% are noise on this shared machine.

| Measure | W0 (layout 2) | After (layout 3) | Method |
| --- | --- | --- | --- |
| Server tick, idle, warm | 1.06 ms | **0.65 ms** (0.64 after the fix) | `benchmark-server-tick.mjs --scenario=idle --ticks=5400`, 3,600–5,400 |
| Server tick, idle, first 10 s | 5.62 ms | 4.92 ms | same run, 0–300 |
| Server tick, 120-ball burst, warm | 1.18 ms (peak 151 balls) | **0.66 ms** (peak 132 balls) | `--scenario=burst` |
| Recorder share of the tick (bot-only) | – (recorder shipped after W0; W8: 2.7–2.9% before its work) | **1.64%** (0.012 ms/tick) | `--city` |
| Fixture, 9 rats: fps / GPU median / draws / triangles | 47.8–48.8 / 11.5 ms / 898 / 1.55 M | **50.1–50.5 / 10.0 ms / 727 / 1.47 M** | `profile-client.mjs` on `capacity-render.html`, 2 runs |
| Fixture, +256 balls | 43.3–47.0 / 12.0 ms / 901 / 1.91 M | **48.9–49.2 / 10.6 ms / 728 / 1.84 M** | same |
| Fixture, +16 corpses | 31.1–34.1 / 12.6 ms / 1,042 / 1.97 M | **38.9–39.2 / 10.7 ms / 824 / 1.75 M** | same |
| Render CPU p95 (rats / balls / corpses) | 18.6 / 19.0–20.3 / 24.4–26.7 ms | 17.4–17.5 / 17.8–18.2 / 20.9–21.0 ms | same |
| Programs linked for a whole load | 153–154 | **188** (all before Enter; 0 after Enter) | W8, `linkProgram` hook |
| Warm load: Enter-ready / first frame | 3.06–3.17 s / 4.26–4.38 s | 3.28–3.53 s / 4.60–5.07 s | W8 (hosted staging Worker, 3 runs) |
| Cold load from the title: Enter-ready | 6.8–7.4 s | about 9.1–10.3 s (34.2–35.4 s from navigation, title at 25.1 s) | W8 |
| Collision boxes | 1,411 | **2,648** (674 yawed, 234 ball-passing bars, 8 slick chute boxes) | `grayboxBoxes` in Node |
| Nav graph build, first | 22.5–25.2 ms | 35.4–38.7 ms | `new BotNavigation`, 3 processes |
| City view, overview draws | 760 | 756–758 | `city-view.html` (W7 and this pass) |

The fixture numbers are faster than W0 mainly because of the D5 shadow work (static moon map, contact shadows). The load numbers are W8's, measured on a build equal to this one except the test-only commit and the bot fix.

## Soak

Staging's canonical room `public-live-v2`, bot-only (0 humans throughout, checked every 15 s), 6–9 server bots. Data: staging's own recorder (R2 `rat-detective-city-staging`, mirrored with `scripts/city-mirror.mjs --base=<staging>`), `/status` and the companion status every 15 s, and `wrangler tail --env staging` for the whole time.

- **Soak 1**, Worker `c1df21f6…`: 19:43:41–20:37:48 UTC, **54 minutes**. Rounds: Jurisdiction 22.2 min (zone held), Excessive Force 14.7 min (kills), Paper Chase 7.4 min (carried), then Jurisdiction (cut by the second deploy). Production's layout-2 medians over the last 14 hours were 15.9, 27.3 and 7.3 minutes for these three.
- **Soak 2**, Worker `50e7cd63…`: 20:38:06–21:09:44 UTC, **32 minutes**, 3.8 bot rat-hours. Rounds: Jurisdiction ended at 18.7 min (zone held), then Excessive Force. 245 deaths; landing clips 0 of 8; anomalies 0; **1 drowning** (`water:harbour`, cause `city`, **no killer credited**); 17 "stranded bot recovered" rescues (1 in soak 1); tick gap max 33 ms, dropped simulation 0, checkpoint failures 0; GameRoom CPU 10.2 s per minute; 1 alarm logged "Network connection lost." and ended `ok`; 5 alarms ended `canceled` with no gap in the room's ticks.
- **Assignments:** Jurisdiction, Excessive Force and Paper Chase each ran to a finish. **Closing Time never came up** in 86 minutes (the shuffled cycle had not reached it), so it was not soaked on this build.

### Findings (soak 1, 6.6 bot rat-hours)

| Check | Result |
| --- | --- |
| Deaths | 413. By district: centre 104, east 79, west 58, north-east 49, south 43, north-west 34, south-west 19, south-east 18, north 9. **Every district has deaths.** Docks 49 (docks sewer branch 27, Pier 9 floor 9, docks exit 8), precinct 33 (cellblock ground 21, yard 8, grounds 3), Gate Lane 5. |
| Before (production layout 2, 13.8 h, 108 bot rat-hours) | north 1.1% of deaths, north-east 2.2%, north-west 0.5%. After: north 2.2%, north-east 11.9%, north-west 8.2%. The north now gets fought over. |
| Bot time by area | docks 13.7%, precinct 9.9%, Gate Lane 0.7%. 183 of 262 places visited. |
| New places never visited by a bot | the *Marlowe* (deck, bridge, cabin), piers 70/−20 and the breakwater, the tower and lookout, precinct floors 8 and 16 and both roofs, Pier 9's roof, the harbour master's office, both chutes, the water. Bots do not choose these; humans can. |
| Landing clips | 12 launches, 12 landings, **0 inside geometry**. |
| Anomaly facts | **0** (inside-geometry, fell-through, out-of-bounds). Production baseline: 0 too. |
| Drownings | **0** in soak 1. Soak 2 had **1**, with no killer credited (see above). |
| Jobs | Case taken in every district; deliveries at Gate, sewer maintenance, the precinct lobby and a street; all 11 Jurisdiction zones activated and scored, including the quay, Pier 9, the precinct yard and Gate Lane; pickups at 9 sites. |
| Stuck bots (alive, within 1.5 units for 60 s or more) | 5 spans. Two are the crane bug below (the same bot, one 15-minute life). Three are 60–85 s in the precinct hall, the observation room and an east lot. Production baseline: 8 spans in 108 bot rat-hours, the longest 36 minutes in a sewer pipe. |
| Worker | 3,296 tail events. 1 exception: a GameRoom alarm at the round change (20:27:57) logged "Network connection lost." and still ended `ok`; the room kept ticking. 2 GameRoom alarms ended `canceled` (19:51:49, 20:01:50); the next windows show no gap. No error logs; checkpoint failures 0. |
| Server tick | Room diagnostics every 5 s (629 windows): tick gap max 33 ms, dropped simulation 0 ms, checkpoint settlement median 33 ms, max 1,259 ms once. GameRoom CPU 11.5 s per minute (production on 27 Sep: 21.3 s per minute, older code). |

### Bug found and fixed: bots parked on a crane stair

- **What:** a bot could spend a whole life (15 minutes in soak 1; up to 25 minutes in earlier staging rounds) on the first landing of crane No. 2's stair tower at (112, 6.2, −159), hopping up the next flight and back. It was never rescued.
- **Why:** from the docks corner, a far goal's flow field takes 8–10 s to reach the bot (measured: one field alone, 96 expansions a tick), longer than the brain's 6 s route wait, so every goal is dropped before its route arrives. On a railed landing no local step leads anywhere. The controller's 30 s rescue measured progress against an anchor that moved every 1.5 units, so escape hops and pacing on the landing kept restarting the clock. The walk graph itself is fine (foot to deck: 31 waypoints).
- **First fix (rejected):** the rescue clock restarted only on real progress (a brain `progressMark`, or walking 6 units from the anchor, 24 once escape began). Soak 2 (32 minutes) had 0 stuck spans and 0 frames on the crane landing, but 17 rescues against 1 in soak 1. A 21-minute audit with the rescue position logged found 10 rescues, 9 of them of bots still moving 14–91 units in the 30 s before (Gate Lane, the west lots, the geyser street). That scatters progressing rats, the regression AGENTS.md warns about.
- **Final fix** (`src/worker/ServerBotController.ts`, `src/shared/ObjectiveBotBrain.ts`): the original 30 s / 1.5-unit rescue rule is restored unchanged. A backstop is added: a bot with no waypoint reached, no goal reached or held, no launch pad worked and no visible fight (the brain's `progressMark`) that stays within 24 units of one spot for **90 s** is rescued. A bot briefly circling a street has three times longer before any move. `src/worker/GameRoom.ts` now logs the rescue position (`from`). Planner budgets and the route wait are unchanged.
- **Tests:** `test/client/botStrandedRecovery.test.ts` (new): the soak's parked-bot room, seeded on a frame clock, fails on HEAD (not rescued in 100 s) and passes with the fix; a bot walking across the city for 60 s is never rescued. Bot tests 83/83 on Halla.
- **Not soaked:** Tyler stopped further soaks on 29 September because the bots are about to be overhauled. The final fix is covered by the tests above only; its rescue rate in live play is unmeasured.

## Screenshots

Muted: headless Chrome with `--mute-audio`, on Halla. All in `/home/tyler/.cache/rd-shots/release/`; contact sheet `contact-sheet.png` (39 shots, labelled).

- **Static art inspection** (`test/visual/city-view.html`: the real city and noir layer, no network, no rats; not gameplay): `overview`, `north`, the docks (`docks`, `quay`, `piers`, `boat`, `cranes`, `yard`, `pier9-inside`, `pier9-mezzanine`, `harbour-master`), the Panopticon (`precinct`, `precinct-front`, `precinct-aerial`, `cellblock`, `precinct-yard`, `precinct-gallery`, `precinct-cell`, `precinct-lookout`, `precinct-lineup`), the north sewers (`precinct-sewer`, `precinct-branch`, `precinct-ramp`, `docks-sewer`, `docks-branch`, `docks-ramp`), `cut-corner`, the bank walls (`bank-records`, `bank-icebox`, `bank-needleworks`, `bank-pump`), the chute (`chute-street`, `needleworks`), `gate-lane`. The harness has no room state, so rain falls indoors in these shots; the game hides rain indoors.
- **Staging `/map`** (live staging data): `map-observe-bots`, `map-observe-deaths`, `map-observe-places` (with flows), `map-analyse`, `map-design`.
- **Gameplay on staging:** none. Joining the canonical room as a human would have ended the bot-only soak, and the second soak ran to the end of this pass.

The observation fixture exists only on the private network-test Worker, not staging, so no area was shot from live play.

## Not done, or uncertain

- **Programs:** 188 linked per load against 153–154 before. None link after Enter, but the cold load before Enter is up to 0.5 s slower than HEAD before W8.
- **Recorder:** 1.64% of the tick bot-only, above the 1% aim.
- **Paper Chase:** no destination in the north or south districts (neither has an enterable room).
- **Windows / Direct3D 11:** every GPU and load number here is Linux ANGLE on OpenGL ES. Tyler's Windows Chrome uses ANGLE on Direct3D 11, where each shader link costs more; the 188 programs and the warm-up have not been measured there.
- **Lineup in the precinct room, live:** not seen live. The round end on staging was not captured (see Screenshots); the static `precinct-lineup` shot shows the stage and height chart, and `test/client/panopticon.test.ts` covers `PRECINCT_LINEUP`. Drowning with no credit was seen live once (soak 2).
- **Closing Time** was not soaked (see Soak).
- **Rescue rate of the final fix:** not measured in live play (see the parked-bot fix).
- **Bots ignore parts of the north:** the *Marlowe*, the far piers, the tower and the upper precinct were never visited by bots. That is a bot-choice question for the bot overhaul, not reachability (W6 tests walk to every job slot).
- **Starved routes remain:** the backstop rescues a parked bot after 90 s; it does not make far routes from the docks corner arrive sooner. That is for the bot overhaul.
- **Canceled alarms:** 2 in soak 1 and 5 in soak 2, with no gap in ticks and no error logs; not explained. One alarm per soak logged "Network connection lost." and still ended `ok`.
- **Soak length:** soak 1 (54 minutes, before the fix) and soak 2 (32 minutes, after) give 86 minutes on layout 3, but no single build ran 60 minutes.

## What a production release needs

1. Tyler plays the staging preview and says yes.
2. Commit the fix (integration owner), then `npm run typecheck`, `npm test`, `npm run build` on the committed tree.
3. `npm run deploy:production` (protocol 23: every open tab must reload; layout 3 replaces the city in `public-live-v2`, keeping the room, namespace and migrations; the stored Jurisdiction bag and route are reset by the protocol change, as W6 notes).
4. Check `/health`, `/status` (0 humans, 6–9 bots, world version 3), the root and assets, `/map` and the `/heatmap` 301, the old-host redirect, and a passive observation of a few rounds.
5. Record the new version and its predecessor `a57db85b…` in `live-service.md`. Rollback to protocol 22 means layout 2 again; old recorder data stays keyed by layout.

# Current Rat Detective state

Baseline checked against committed source and the latest release receipt on **9 October 2026**. This page is a short orientation, not a release journal. For live identity during operations, verify `/health` and follow [live service](live-service.md).

## Shipped baseline

- Latest recorded production: `production-2026-10-10-21177b7`, Worker `e5c0c7a1-f332-48ee-ad44-1b406189292c`, client `index-DRHzezLz.js`. The build date is UTC; release was 9 October locally. [Softer-bot receipt](verification/bot-softening-2026-10-09.md).
- Protocol **43**, layout **7**, mindVersion **21**, era `softer-bots`. Public room `public-live-v3` is in Chicago (ORD); v2 is the sleeping Seattle backup. [Room operations](live-service.md#the-public-room).
- Rooms play only with a human seat. Each round rolls **6–9 bots**, humans join on top, **10 rats total**; at capacity a human replaces a bot. No human means no tick, bots, alarm or continuing writes.
- Three assignments: PAPER CHASE (5 deliveries), Jurisdiction (100 points from held zones of 20), Excessive Force (10 kills with the case). No round time limits. The carrier deals double damage and heals fully on a kill.
- Case papers, paw prints and sight replace the old through-wall case locator. Chaos leaves physical evidence; the latest incident changes are recorded in [the chaos-evidence receipt](verification/chaos-evidence-release-2026-10-09.md).
- Random supplies except the 14 fixed Quick Fix sites; shared human/bot movement and firing; server authority for damage, claims and score. Exhibits play only on the results board, through the gameplay shoulder camera, with save controls.

See [game rules](game-rules.md) before changing behavior and [the code map](code-map.md) to locate implementations.

## Work owners and next boundaries

| Area | Owning document | Current boundary |
| --- | --- | --- |
| Bots, Jev and learning | [Bot learning plan](bot-learning-plan.md), then [data plan](data-plan.md) | Softer reaction/tracking shipped. Human playtest and era comparison remain; burst pauses and attention changes are deferred. |
| Feel, sound, animation and noir | [Juice plan](juice-plan.md) | Follow its latest status and playtest decisions; older batches are evidence. |
| City layout and architecture | [City overhaul](city-overhaul.md), then [city map](city-map.md) | Overhaul is shipped; layout tuning uses recorded facts and bumps layoutVersion. |
| Telemetry and analysis | [Data plan](data-plan.md), [city map](city-map.md) | No data freeze. Separate builds/eras, agents and admin-touched rounds. |
| Results and highlight replays | [Replay plan](replay-plan.md), [playback](replay/playback.md) | Shipped exhibits; later camera decisions supersede the original slow-motion/camera proposal. |
| Physical case clues | [Noir clues plan](plans/noir-physical-clues.md) | P4 shipped; obsolete ping/beacon code is not a design instruction. |
| Entry, clocks and smooth play | [Smooth-play plan](plans/smooth-play-2026-10.md) | Shipped; preserve held admission and recorded look. |

An owning plan contains proposals as well as accepted decisions. Read its latest status and release receipts before treating an unchecked item as an instruction to implement it.

## Verification limits

The softer-bot receipt records one existing aiming-bound test failure with the approved slower tracking; do not claim the full suite is green or weaken the test casually. Its bot simulation is not human difficulty evidence. Human acceptance of the softer bots remains pending. No real-phone performance guarantee or large-room capacity claim follows from short fixtures.

Dated behavior, release identities and previous investigations are preserved in [release history](release-history.md), [the historical reference index](reference-history.md) and `verification/`. Their old “current” labels refer to their dates. Do not revive a closed plan or restore a superseded mechanic from them.

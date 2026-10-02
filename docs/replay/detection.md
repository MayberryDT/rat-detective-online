# Replay detection (X1, X6)

Part of the [replay plan](../replay-plan.md), which owns status and order.

The server decides what is worth replaying. It knows true death causes, kill credit and every rat, so every player gets the same moments. The old client detector only saw the local player and mostly counted kills.

## The marker

When a moment happens, the server broadcasts one small message to every player (about 150 bytes):

```ts
{ type: 'highlight', id, kind, at, actors: string[], p: Vec3Data, score, leadMs, trailMs }
```

- `at` is the simulation step time of the moment, not `Date.now()`. Several moments in one burst of steps keep their own times.
- `actors` lists the rats involved, main actor first. The client takes names from its roster.
- `leadMs` and `trailMs` set the clip window. The default is 4 seconds before and 2 seconds after. A pileup or a long flight can ask for more, up to 6 seconds before.
- Events already flush movement before they broadcast (`GameRoom.broadcast` calls `flushMovement('event')`). So every player has the positions up to the moment when the marker arrives.

Add it to `ServerMessage` in `src/shared/networkProtocol.ts` and to `parseServerMessage` in `src/shared/messageValidation.ts`. Bump `PROTOCOL_VERSION` to 30.

## Moment catalogue

The detector is one module in `src/shared/` or `src/worker/`, called from the places where the events already happen. Each kind has a base score. Funny and chaotic kinds score highest.

Chaos and comedy:

- sent flying: a dead rat's body travels far or high (corpse velocity in `ChaosSimulation` death handling, measured over the next 2 seconds)
- splashdown: a rat drowns at the docks (`drowned` in `GameRoom`)
- pileup: 3 or more deaths within 18 units and 4 seconds (a short list of recent deaths in `GameRoom`)
- squashed: a launched rat lands on another rat (the squash hit in `stepFlights`)
- snapped and shot: a rat dies while a mousetrap holds it (`trappedUntil` in `PlayerBuffs`)
- body blow: a flying corpse hits or kills a living rat (corpse-hit damage in `stepBodies`)
- Big Cheese wreck: a kill by a grown Big Cheese ball, scored by its size
- Code Violation backfire: a dud supply goes wrong on the rat who grabbed it

Irony:

- so close: the carrier dies within 12 units of the PAPER CHASE drop-off, or in the active Jurisdiction zone near its target
- last meal: a rat dies within 3 seconds of taking a Quick Fix
- fresh off the boat: a rat dies within 3 seconds of spawning
- from beyond: the kill lands after the shooter has died (`shooter.hp <= 0` in `applyHit`)

Trick shots:

- bank shot: a Crossfire kill with 2 or more bounces (`bounces` on the hit)
- laser ricochet: a laser kill off one or more walls
- long shot: a headshot from more than 40 units
- airborne kill: the shooter or victim is in a launcher flight

Big plays:

- multi-kill: 2, 3 or more kills by one rat within 6 seconds
- carrier down: the case carrier is killed
- steal and score: a rat takes the case from another rat and scores within 15 seconds
- delivery: a PAPER CHASE delivery
- round winner: the play that wins the round

## Scoring

A moment's score is:

- its kind's base score
- plus a spectacle bonus from measured size: body travel, bounces, distance, rats involved, ball size
- times 1.5 when a human is involved, so human plays rank higher but bot comedy still counts
- times a rarity factor, so a kind seen often this round scores less

The selection on the board takes the best moment of each kind, so the 3 exhibits are different kinds ([exhibits](exhibits.md)). Detection itself sends every moment over a low floor, so the client can always find one that involves you.

Start the weights from the order above and tune them in X6. Keep them in one tuning object (`HIGHLIGHT_TUNING`), like `CHAOS_TUNING`.

### As built (X1)

The detector is `src/worker/HighlightDetector.ts`; the shapes and weights are in `src/shared/highlights.ts`. `GameRoom` feeds it every applied hit (`handleHit`, with the hit's simulation step time and the `ChaosHit` details: `squashAirMs`, `corpse`, `reflections`, `ballRadius`), Quick Fixes, Code Violation duds, each tick's case holder and assignment, and the round's win.

- One kill is one moment. A kill waits 2 seconds while its body is measured, then sends its highest-scoring kind; every other kind it also qualified for adds a quarter of its base score. So a carrier headshot from 45 units is one long shot, not a long shot and a carrier down.
- A squash or a flying body that only hurts is sent at once.
- A multi-kill counts kills by one rat each within 6 seconds of the one before. A pileup counts deaths within 18 units of the first death and within 4 seconds after it. Both are sent once 2 seconds pass with no new kill or death joining them. If one grows after that, it is sent again with the same `id` and a higher score; the later marker replaces the earlier. Each is recorded once, as a city fact, when its window closes.
- A steal is the case taken within 5 seconds of another rat losing it. It scores on a PAPER CHASE delivery, an Excessive Force case kill or a Jurisdiction carrier starting to score.
- So close measures from the carrier to the active drop-off building's bounds. In Jurisdiction it needs the carrier in the active zone with 15 seconds or less of its hold left.
- The round winner folds in the winner's kill from the last second, or a steal it scored. Every open moment is sent before `gameWon`, and nothing more is detected until the next round.

## Facts

Every marker is also a city fact, so we can see what fires and how often ([city map](../city-map.md): a feature is not done until it emits its facts):

- add `{ type: 'highlight', kind, a, victim?, p, place, score }` to `CityFact` in `src/shared/city/facts.ts`
- emit it from `CityRecorder` with the usual context (`build`, `layout`, `mode`, `incident`); actors are the anonymous per-round numbers, never names
- count highlights per kind in `/api/city/v1/digest`
- X5 adds the watched and saved facts from clients ([exhibits](exhibits.md#facts))

## Remove the old path

Delete `src/highlights/HighlightBridge.ts` (nothing listens to it since the desktop recorder went) and `src/highlights/HighlightDetector.ts`, with `test/client/highlights.test.ts`. Move any useful types from `src/highlights/protocol.ts` into the protocol, then delete it.

## Checks

- Focused tests for the detector: each kind fires on a constructed event and does not fire just outside its threshold (a kill 13 units from the drop-off is not "so close").
- Staging bot-only room for 30 minutes: counts per kind in the digest. Expect every common kind (sent flying, multi-kill, carrier down, delivery) to appear. Rare kinds may not.
- Tyler reads the rates before X2 starts.

## Tuning (X6)

After a week of live facts, compare how often each kind fires with how often players watch and save it. Raise kinds that people save. Lower kinds that fire often and are skipped. Each tuning change is a new era in `design/data/eras.json` ([data plan](../data-plan.md)).

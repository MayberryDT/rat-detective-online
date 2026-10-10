# Repository ergonomics implementation — 9 October 2026

Implemented on `agent-ergonomics`, based on `47047fcd7c26714f41b5c0b6ed2d1f19f79322c6`. Unreleased; no deployment or production era change.

## Completed changes

- Short repository entrance, task-to-symbol code map, local subsystem guides, protected game rules and preserved dated history. Documentation/import checks cover 19 guides and 348 links.
- Shipped presentation moved out of `prototype`; rat model, animation and weapon art now live in `src/rat` instead of general utilities.
- Supply presentation and interaction anticipation own their respective lifecycles. ResultsCoordinator owns reading, CONTINUE, lineup and frozen exhibits. Welcome disposal has an explicit operation.
- Warm constructors have a named home; warm/live shots and evidence share their actual factories. Existing GPU fence sequence and stand-in lifetime remain intact.
- Seeded city generation and street spill calculations are independent leaves. Static relative-import analysis of 353 source files finds no cycles.
- Bot sight policy, remembered loose-case sightings and situation description have explicit owners. Shared launch and sensing constants no longer come from presentation tuning.
- Removed unused live carrier-ping construction. Corrected obsolete pickup, replay and smoke-test guidance. Repaired the WebSocket smoke route and added a repeatable real-browser boundary fixture with JSON and PNG receipts.

## Intentional behavior correction

Pea Souper now caps directly visible loose cases at FOG_REACH (24 units) consistently across bot goal selection and motor perception. The old goal route incorrectly admitted a case at 40 units. Ordinary and Blackout ranges remain as authored; remembered sightings retain their bounded lifetime. This increments mindVersion from 21 to 22 on this branch. A production era comparison remains a shipping task.

## Verification

All artifacts are under `/home/halla/build/rat-detective/agent-ergonomics/`.

- Typecheck, production build, visual build and repository navigation check passed.
- Worker suite: 288 tests passed on the final serial recheck. Script suite: 46 passed.
- Browser boundary fixture: 21 checks passed, including competing supply claims, full-health heal eligibility, authoritative restock, reconnect disposal, frozen exhibits across reset and CONTINUE. Receipt and screenshot: `browser-boundaries/browser-boundaries.json` and `.png`.
- Local WebSocket smoke, idle-room lifecycle and connection recovery passed: `deep-ws.json`, `deep-idle-room.json`, `deep-connection-recovery.json`.
- Original/current city geometry, seeded spawns and street spill outputs have identical fingerprints across eight layout scenarios and 2,145 spill samples: `geometry-equivalence.json`.
- Four bot sight diagnostic cases passed: ordinary 40-unit sight, fog rejection at 40, fog acceptance at 10 and wall rejection. See `bot-sight-after.json`.
- Six alternating same-host Blackout simulations (three original, three current; 1,800 ticks / 60 simulated seconds each) have identical trajectories and wire-size distributions. Median tick costs were 3.253–3.310 ms before and 3.241–3.338 ms after, within observed run variation. See `server-tick-comparison.json`; this is not a capacity or human playtest.

## Remaining qualification limits

The client suite is not fully green: the botIronclad aiming-bound assertion also fails in the frozen original checkout (3.0135 versus expected less than 2). It was not weakened. Five other client files timed out during concurrent verification; all 64 tests passed when rerun serially. An initial Worker pickup fixture failure cleared on the complete 288-test recheck. Original/current logs are retained.

No matching hosted cold-entry check, human playtest, production deployment or production era comparison was performed. Builds and extracted warm constructor review do not substitute for hosted GPU qualification.

## Repeatable checks

Run in the Halla worktree:

```sh
npm run check:repository
npm run typecheck
npm run build
npm run visual:build
node scripts/verify-repository-boundaries.mjs --out=/home/halla/build/rat-detective/agent-ergonomics/browser-boundaries
node scripts/with-local-worker.mjs -- node scripts/smoke-ws.mjs --out=/home/halla/build/rat-detective/agent-ergonomics/deep-ws.json
node scripts/verify-idle-room.mjs --output=/home/halla/build/rat-detective/agent-ergonomics/deep-idle-room.json
node scripts/with-local-worker.mjs -- node scripts/verify-connection-recovery.mjs --out=/home/halla/build/rat-detective/agent-ergonomics/deep-connection-recovery.json
npx vitest run --maxWorkers=1
npx vitest run --config vitest.client.config.ts --maxWorkers=1
node --test test/scripts/*.test.mjs
```

The client command currently retains the documented baseline aiming failure. Benchmark and original-source comparison receipts record bounded equivalence evidence; they do not claim all gameplay is unchanged.

## Follow-up game safety check

The complete client suite was rerun serially: **1,519 passed, one skipped, one failed**, with only the same frozen-baseline botIronclad aiming-bound failure. No new client failures or timeouts remained.

The actual production bundle passed the existing real-input browser check against an isolated CI local Worker: cold title preparation and Enter City, received welcome, current HUD/scoreboard construction, real pointer lock, movement (3.715 units), jump (0.849 units) and a finite normalized shot. No blocking browser console or network errors were reported. Receipt: `game-safety-browser.json`; screenshot: `game-safety-browser.png`. Software-rendered startup is functional evidence, not a hosted load-time target or human acceptance.

The browser harness needed repairs before it could test the game: Chrome created the requested tab at about:blank, the fixed seven-second wait expired during cold shader preparation, and its scoreboard selector referenced removed UI. It now navigates explicitly after attaching diagnostics, waits for actual joined state with a bounded timeout, and checks the current HUD and scoreboard. A cold entry can expire its initial pointer-lock activation; the check exercises the supported fresh canvas click before asserting pointer lock. Welcome capture now records message kinds only, keeping private resume credentials out of failure artifacts.

Repeat the functional browser check on Halla:

```sh
CHROME_EXTRA_ARGS="--enable-unsafe-swiftshader --use-angle=swiftshader --mute-audio" SMOKE_GAMEPLAY=1 node scripts/with-local-worker.mjs -- node scripts/smoke-browser.mjs
```

Existing supply/results browser, idle-room and transport recovery receipts complement this check. Production was not changed; matching hosted cold-entry qualification and human acceptance remain separate.

Shipped after Tyler authorized merge/deploy: [production release receipt](repository-ergonomics-release-2026-10-09.md). Earlier unreleased/qualification limits above describe their recorded phase.

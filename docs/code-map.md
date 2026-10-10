# Code map

Find the behavior first, then follow its producer and consumer. Read [current state](current-state.md) and [game rules](game-rules.md) before changing gameplay. Paths below are real entry points, not a complete file inventory.

## Everyday task routes

| Task | Start here | Follow through | Guidance / existing verification |
| --- | --- | --- | --- |
| Change a pickup or restock | [shared/pickups.ts](../src/shared/pickups.ts) | [ChaosSimulation](../src/shared/ChaosSimulation.ts) claims/buffs → [SupplyPresentation](../src/presentation/SupplyPresentation.ts) / [InteractionPresentation](../src/presentation/InteractionPresentation.ts) → [PickupVisual](../src/presentation/PickupVisual.ts), [PickupRespawnVisual](../src/presentation/PickupRespawnVisual.ts) → [createGame](../src/session/createGame.ts) | [Presentation guide](../src/presentation/README.md); reconnect check catches duplicated props |
| Change bot sight or case knowledge | [ServerBotController](../src/worker/ServerBotController.ts) | [sight policy](../src/shared/bots/sight.ts), [loose-case memory](../src/shared/bots/looseCaseSight.ts), [CarrierSight](../src/shared/bots/motor/carriers.ts) / [motor](../src/shared/bots/motor.ts) → [situation description](../src/worker/bots/describeSituation.ts) for Jev descriptions | [Bot guide](../src/shared/bots/README.md), [bot learning](bot-learning-plan.md); bot-sim, case-clue checks |
| Change bot choice or difficulty | [RatBot](../src/shared/bots/ratBot.ts), [intent](../src/shared/bots/intent.ts) | goals → codeMind / worker Jev → cast → motor controls → shared ratBody | Bot learning/data plans; bot-sim emits a report, human play accepts difficulty |
| Fix movement, jump or firing input | [ratBody](../src/shared/rat/ratBody.ts), [RatController](../src/player/RatController.ts) | [InputState](../src/session/InputState.ts), [TouchInput](../src/session/TouchInput.ts) → [GameRoom](../src/worker/GameRoom.ts) → shared simulation | [Shared guide](../src/shared/README.md), [mobile controls](mobile-controls.md); connection-recovery transport, human playtest |
| Fix a hit, muzzle or weapon | [ChaosSimulation](../src/shared/ChaosSimulation.ts), [shotBallistics](../src/shared/shotBallistics.ts) | [CheeseGun](../src/weapons/CheeseGun.ts), [LocalShotPresentation](../src/shared/LocalShotPresentation.ts), [laser](../src/shared/laser.ts), [trapThrow](../src/shared/trapThrow.ts) | [Juice plan](juice-plan.md), [hitbox practice](hitbox-practice.md); matching hosted playtest |
| Change mode score or case delivery | [AssignmentRules](../src/shared/AssignmentRules.ts), [assignments](../src/shared/assignments.ts) | ChaosSimulation → [RoundAwards](../src/worker/RoundAwards.ts) → [GameHud](../src/ui/GameHud.ts) | [Dispatch assignments](dispatch-assignments.md); shared rule checks plus human playtest |
| Fix join, reconnect or idle cost | [GameRoom](../src/worker/GameRoom.ts) | [NetworkManager](../src/network/NetworkManager.ts) → [GameSession](../src/session/GameSession.ts); overflow [Matchmaker](../src/worker/Matchmaker.ts) | [Worker guide](../src/worker/README.md), [smooth play](plans/smooth-play-2026-10.md); idle-room / entry / reconnect checks |
| Add an incident or evidence prop | [incidentCatalog](../src/shared/incidentCatalog.ts), [chaosState](../src/shared/chaosState.ts) | ChaosSimulation / [cityMarks](../src/shared/cityMarks.ts) → [ChaosView](../src/presentation/ChaosView.ts), [CityMarksView](../src/presentation/CityMarksView.ts) | [Chaos evidence](plans/chaos-evidence-2026-10.md), [juice plan](juice-plan.md); recorder facts plus hosted play |
| Change the city or collision | [city/kit](../src/shared/city/kit/kit.ts), [grayboxLayout](../src/shared/grayboxLayout.ts) | [sharedLayout](../src/shared/sharedLayout.ts) → [worldSpec](../src/shared/worldSpec.ts) → server broadphase / [Neighborhood](../src/presentation/Neighborhood.ts) | [City guide](../src/shared/city/README.md), [city map](city-map.md); bump layoutVersion, inspect static city fixtures |
| Change HUD, feel, sound or rat art | [GameHud](../src/ui/GameHud.ts), [FeelDirector](../src/feel/FeelDirector.ts) | [Headlines](../src/ui/Headlines.ts), [feelTuning](../src/feel/feelTuning.ts), [audio](../src/audio/README.md), [RatModel](../src/rat/RatModel.ts) | [Juice plan](juice-plan.md), [client guide](../src/session/README.md); visual build / authored fixtures |
| Fix highlight detection or save | [HighlightDetector](../src/worker/HighlightDetector.ts) | [ReplayDirector](../src/replay/ReplayDirector.ts) → [Exhibits](../src/ui/Exhibits.ts) → [saveClip](../src/replay/saveClip.ts) | [Replay guide](../src/replay/README.md); exhibits / replay checks |
| Find telemetry or analyze a change | [CityRecorder](../src/worker/city/CityRecorder.ts) | [facts](../src/shared/city/facts.ts) → [CityStore](../src/worker/city/CityStore.ts), archive → [map/main](../src/map/main.ts) | [City map](city-map.md), [data plan](data-plan.md); era-report / round-report |
| Deploy or operate | [scripts/deploy](../scripts/deploy.mjs), [worker/index](../src/worker/index.ts) | [admin script](../scripts/admin.mjs), [adminApi](../src/worker/adminApi.ts), storage operations | [Live service](live-service.md); exact health/status/build receipts |

## Runtime flow and ownership

```text
browser main → title / prepareGame → createGame → GameSession
  human controls → NetworkManager → Worker index → GameRoom
  bot mind → RatBot → motor → RatControls ──────────┘
  shared ratBody + ChaosSimulation + AssignmentRules
    → authoritative snapshots/events → client presentation / HUD / feel / audio
    → CityRecorder → SQL aggregates + archive → city API → /map
    → HighlightDetector → ReplayRecorder → ResultsCoordinator / Exhibits → ReplayStage / POV ReplayDirector → saved clip
```

[Worker](../src/worker/README.md) owns room lifecycle, persistence and external services. [Shared](../src/shared/README.md) owns simulation, layouts, protocol and reusable control logic. [Session](../src/session/README.md) assembles browser systems and cleans them up. [Presentation](../src/presentation/README.md) displays the simulation, never authorizes a hit or claim.

## Naming that can mislead

- `src/presentation/` was `src/prototype/` before this navigation pass. It contains shipped production rendering as well as fixture helpers. Older receipts retain the old path; resolve it to the new directory.
- `graybox*` is historical naming for production city modules. It does not mean disposable prototype geometry.
- `src/enemies/` is currently empty; the production bots are in `shared/bots/` and `worker/ServerBotController.ts`.
- `NormalGameBots` and `PracticeBots` support private/local fixtures; they are not the production authority.
- [Rat art](../src/rat/README.md) lives in `src/rat/`; `shared/rat/` owns the physical body and shared tuning. `utils/` contains general rendering helpers.
- A `test/client/` name means a client-configured isolated test, not proof of browser or human play. `test/visual/` pages are explicit fixtures.

## Verification routes

[Scripts guide](../scripts/README.md) gives commands and artifacts. Use the existing check appropriate to the change; do not invent a new test suite for a move. Source moves need typecheck, production and visual builds. A layout/feel change also needs the relevant visual or human acceptance; a protocol change needs matching client/Worker checks. Keep all output under `/home/halla/build/rat-detective/`.

Maintain this map when ownership or entry paths change. Keep local explanations at subsystem boundaries and link them here; avoid mirroring every filename or constant.

## Concrete troubleshooting entry points

- A supply is not collected: `GameSession.checkInteractions` → `InteractionPresentation.interaction` → `GameRoom.handlePickupIntent` → `ChaosSimulation.claimInteraction` / `collectPickup`. Automatic proximity claims converge on the same collection method.
- A supply card or prop is wrong: `SupplyPresentation.syncPickups`, `noteLocalBuffs`, `updateCards`; accepted epoch/tick/generation guards stay with the prop. `InteractionPresentation` owns pending intent rollback and case anticipation.
- Results or CONTINUE is wrong: [ResultsCoordinator](../src/session/ResultsCoordinator.ts) owns `win`, `reset`, `presentVictory`, `presentResults`, and `continueFromResults`. `GameSession` still orders those calls among live frame work.
- A reconnect duplicates something: `GameSession.clearWelcomeViews` and `welcome`, then each view's `dispose`. A replacement view treats its first buffs as a baseline.
- A new effect stalls on first use: [warmStandIns](../src/session/warmStandIns.ts) lists live constructors and variants; [shotDraws](../src/presentation/shotDraws.ts) and [evidence wiring](../src/presentation/evidencePresentation.ts) serve both warm and live paths. Keep GPU issue/drain order in `createGame` / `warmPrograms`.
- Outer-city generation: [seededCity](../src/shared/seededCity.ts) is the leaf; `worldSpec` dispatches by version. Light spill: [streetSpill](../src/presentation/streetSpill.ts) is below both atlas and beams.

The [browser boundary check](../scripts/verify-repository-boundaries.mjs) qualifies supply/results cleanup and produces JSON plus a screenshot. It is a controlled integration fixture, not hosted gameplay acceptance.

Implementation and qualification: [repository ergonomics receipt](verification/repository-ergonomics-2026-10-09.md).

# Browser assembly and lifecycle

[Code map](../../docs/code-map.md) · [Tooling](../../docs/tooling.md)

[main.ts](../main.ts) starts the title and deferred engine. [prepareGame.ts](prepareGame.ts) prepares the city; [createGame.ts](createGame.ts) assembles its systems; [createStage.ts](createStage.ts) builds the scene/physics stage. [GameSession.ts](GameSession.ts) connects controls, network state, rendering, feel/audio; [ResultsCoordinator](ResultsCoordinator.ts) owns results viewing and replay shelf lifetime.

- Input: [InputState.ts](InputState.ts), [TouchInput.ts](TouchInput.ts), [HeldFire.ts](HeldFire.ts), pointer-lock/menu helpers → player RatController → NetworkManager.
- Remote state: [RemotePlayers.ts](RemotePlayers.ts), [SimulationClock.ts](SimulationClock.ts), shared SnapshotBuffer and protocol.
- Loading/performance: [warmStandIns.ts](warmStandIns.ts) lists warm constructors/variants; [warmPrograms.ts](warmPrograms.ts), graphicsQuality, shadows, GPU timing and perf reporting.
- Display behavior: [presentation guide](../presentation/README.md), [GameHud](../ui/GameHud.ts), [FeelDirector](../feel/FeelDirector.ts), [audio guide](../audio/README.md).

Every welcome rebuilds the local rat and chaos view; cleanup must dispose scene-root props and listeners. Preserve restored yaw, first-state claim suppression, held-seat loading and clock behavior. Warm stand-ins for anything welcome creates and wait for `gpuDrained` before querying WebGL programs. Keep current camera and muzzle composition.

`NormalGameBots` is a fixture/local consumer, not public bot authority. Ordinary gameplay previews use a matching hosted Worker. Source moves need both production and visual builds because fixtures have separate entry pages.

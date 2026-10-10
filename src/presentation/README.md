# Production scene presentation

This directory was called `src/prototype/` before the 9 October navigation pass. It contains shipped rendering, not an alternative game. Older receipts retain the original paths. [Code map](../../docs/code-map.md) · [Juice plan](../../docs/juice-plan.md)

[ChaosView.ts](ChaosView.ts) consumes authoritative chaos state/events and coordinates effects. [SupplyPresentation](SupplyPresentation.ts) owns supply props/cards/weapon display and disposal; [InteractionPresentation](InteractionPresentation.ts) owns swept claims and anticipation/reconciliation. [createGame](../session/createGame.ts) assembles these views and their warm stand-ins. Presentation never decides eligibility, damage or score; shared ChaosSimulation and the Worker do.

| Change | Entry |
| --- | --- |
| Supply appearance/restock | [PickupVisual.ts](PickupVisual.ts), [PickupRespawnVisual.ts](PickupRespawnVisual.ts), [pickupArtwork.ts](pickupArtwork.ts) |
| Case and physical clues | [CaseModel.ts](CaseModel.ts), [CaseFiles.ts](CaseFiles.ts), [PawPrints.ts](PawPrints.ts), [HotCaseLook.ts](HotCaseLook.ts), [CaseGrip.ts](CaseGrip.ts) |
| City/lighting | [Neighborhood.ts](Neighborhood.ts), [KitArchitecture.ts](KitArchitecture.ts), [FixedLighting.ts](FixedLighting.ts), [StreetLightPool.ts](StreetLightPool.ts), [CityBakeCache.ts](CityBakeCache.ts) |
| Machines/modes | [PressureMachine.ts](PressureMachine.ts), [DispatchPillars.ts](DispatchPillars.ts), [JurisdictionZones.ts](JurisdictionZones.ts), [AssignmentDestinations.ts](AssignmentDestinations.ts) |
| Incidents/weapons/evidence | [CityMarksView.ts](CityMarksView.ts), [CrossfireVisual.ts](CrossfireVisual.ts), [LaserBeamVisual.ts](LaserBeamVisual.ts), [TrapVisual.ts](TrapVisual.ts), [SafeVisual.ts](SafeVisual.ts) |

Root-level props must be disposed when the view is replaced. First state must not replay a claim; a changed site kind rebuilds its prop after the claim pop. Preserve fixed light/shadow budgets and shader warming. Do not revive obsolete ping/locator modules merely because they remain for older fixtures. `PracticeBots` supports fixtures, not production authority.

Related effects live in `feel/`, UI in `ui/`, sound in `audio/`, rat art in [rat](../rat/README.md) and entities in `entities/`. Use the task route before moving behavior across those boundaries.

[streetSpill.ts](streetSpill.ts) owns pure spill sampling below the atlas and facade beams. [shotDraws.ts](shotDraws.ts) and [evidencePresentation.ts](evidencePresentation.ts) are shared warm/live construction and wiring. `CarrierPingFlash` remains compatibility/fixture code; live ChaosView does not construct it.

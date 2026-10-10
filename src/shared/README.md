# Shared game truth

[Task routes](../../docs/code-map.md) · [Protected rules](../../docs/game-rules.md)

These modules are consumed by the Worker, browser prediction and fixtures. They own reusable behavior; the Worker still authorizes outcomes. Avoid browser APIs and external-service dependencies here.

| Responsibility | Entry |
| --- | --- |
| Rat movement and controls, human and bot | [rat/ratBody.ts](rat/ratBody.ts) |
| Case, shots, pickups, incidents and traps | [ChaosSimulation.ts](ChaosSimulation.ts); state/tuning in [chaosState.ts](chaosState.ts) |
| Supply definitions and weapon tuning | [pickups.ts](pickups.ts) |
| Assignment transitions and score rules | [AssignmentRules.ts](AssignmentRules.ts), [assignments.ts](assignments.ts) |
| Transport shapes and compatibility | [networkProtocol.ts](networkProtocol.ts), [messageValidation.ts](messageValidation.ts), movement/chaos wire modules |
| Shared city collision and layout | [worldSpec.ts](worldSpec.ts), [sharedLayout.ts](sharedLayout.ts), [city guide](city/README.md) |
| Bot decisions and controls | [bots guide](bots/README.md) |

Follow a simulation change into its server admission path and browser consumer. Never fix a presentation symptom by changing authority without investigating both. Constants stay with their owning behavior; do not duplicate them for bots or fixtures. Protocol changes require matching client and Worker. Layout compatibility lives in [layoutVersion.ts](layoutVersion.ts).

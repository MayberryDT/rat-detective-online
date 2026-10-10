# Bot decisions and controls

[Task routes](../../../docs/code-map.md) · [Bot learning plan](../../../docs/bot-learning-plan.md) · [Data plan](../../../docs/data-plan.md)

```text
ServerBotController supplies world observations
  → RatBot → goals → codeMind or Jev → cast → held Plan
  → motor → RatControls → shared ratBody / server shoot admission
```

- [ratBot.ts](ratBot.ts) owns decision timing, goal commitment and pickup reflex coordination.
- [goals.ts](goals.ts) offers possible goals; [codeMind.ts](codeMind.ts) scores them; [cast.ts](cast.ts) applies personality choice. [intent.ts](intent.ts) owns types, skill dials and mindVersion.
- [motor.ts](motor.ts) drives the plan; `motor/` holds aiming, fights, steering and carrier knowledge. [motor/carriers.ts](motor/carriers.ts) owns remembered carrier sightings/clues. Do not grant hidden live case coordinates.
- [ServerBotController](../../worker/ServerBotController.ts) owns authoritative observations, collision queries and execution. [Worker bot guide](../../worker/bots/README.md) describes Jev and its textual perception.
- Older navigation helpers sit one level up: [BotNavigation.ts](../BotNavigation.ts), [BotTargeting.ts](../BotTargeting.ts), [BotLaunchRoutes.ts](../BotLaunchRoutes.ts). They support the motor; their names do not indicate separate production minds.

A perception task may span controller filtering, motor memory and Jev descriptions. A difficulty task normally starts with skill dials, not copied movement rules. Bots have the same body and abilities as humans. Preserve recorded controls, aim and shot targets; stamp behavioral changes and compare eras.

Use [bot-sim](../../../scripts/bot-sim.mjs) for bounded full-game seeded simulation and JSON artifacts. It has no humans, network or Jev and cannot accept human difficulty. Follow with the plan’s human playtest where behavior changed.

Direct sight ranges have one owner: [sight.ts](sight.ts). [looseCaseSight.ts](looseCaseSight.ts) remembers only directly seen points for ten seconds; goals consume those observations. Fog restricts fresh observations without moving remembered coordinates. Physical clues and carrier evidence remain separate owners.

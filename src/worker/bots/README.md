# Jev service and textual perception

[Shared bot guide](../../shared/bots/README.md) · [Bot learning plan](../../../docs/bot-learning-plan.md)

[jevMind.ts](jevMind.ts) adapts the external mind to shared goal selection. [jevClient.ts](jevClient.ts) owns TypeSafe requests; [jevBudget.ts](jevBudget.ts) owns budget tracking. [describeSituation.ts](describeSituation.ts) turns the already-filtered goal context into Jev’s description and memory. It is not the entire sight system: start in [ServerBotController](../ServerBotController.ts) and the shared motor for what a bot can actually see or remember.

Retain event-based decisions and the held goal/stance; do not add per-frame model calls. Preserve code fallback, budgets and input/decision recording. Agent seats never count as human play or enable Jev. Never copy API credentials into reports. Compare behavioral changes using build-stamped eras; no frozen data build is required.

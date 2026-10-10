# Documentation map

Start with [current state](current-state.md), then use [the code map](code-map.md) for the task you were given. You do not need to read the release history to start working.

| Need | Read | Role |
| --- | --- | --- |
| Working instructions | [Root AGENTS](../AGENTS.md) | Host, authorization, verification and maintenance rules |
| Current release and work owners | [Current state](current-state.md) | Short dated baseline; links to the owning plans |
| Find source or a check | [Code map](code-map.md) | Task routes and runtime flow |
| Protected behavior | [Game rules](game-rules.md) | Accepted constraints across subsystems |
| Run or inspect the game | [Tooling](tooling.md), [diagnostics](playtest-diagnostics.md) | Environments, preview distinctions and investigation |
| Deploy, recover or administer | [Live service](live-service.md), [server operations](server-operations.md) | Operational procedures; packed-storage rollback rules |
| Authority and networking | [Server authority](server-authority.md), [network smoothness](network-smoothness.md), [security](../SECURITY.md) | Authority boundary and synchronization |
| Gameplay modes | [Dispatch assignments](dispatch-assignments.md) | Mode behavior; later accepted updates supersede initial designs |
| Bots | [Bot learning plan](bot-learning-plan.md), [bot overhaul](bot-overhaul.md) | Current work order, then architecture |
| Feel and art | [Juice plan](juice-plan.md), [model follow-ups](model-playtest-followups.md) | Accepted feel work and model reference |
| City and measures | [City map](city-map.md), [city overhaul](city-overhaul.md), [data plan](data-plan.md) | Layout frame, facts, design loop and eras |
| Results/replays | [Replay plan](replay-plan.md), [playback](replay/playback.md) | Ownership and current camera/playback decisions |
| Mobile | [Mobile controls](mobile-controls.md) | Input behavior and limits |
| Companion | [Omarchy](omarchy.md), [plugin README](../omarchy/plugin/README.md) | Optional desktop companion |
| Older evidence | [Release history](release-history.md), [historical index](reference-history.md), [old agent guidance](agent-guidance-history.md) | Preserved dated context; never a competing current instruction |

## How to interpret documents

Source owns implemented constants and behavior. Tyler’s accepted constraints govern changes. An owning plan records work order and decisions; a dated verification receipt proves only the checks and environment it describes. Resolve disagreements using the latest accepted decision and corresponding source/receipt, rather than a document’s filename or an old “current” heading.

Keep existing receipt paths stable so links and provenance remain usable. Add current status to the owning plan and this short entrance when needed; add evidence to `verification/`. Research under `research/`, old proposals and archived indexes do not authorize implementation.

When a source entry point moves, update [the code map](code-map.md), its local README and live links. Run `npm run check:repository` to catch broken entrance routes. The historical indexes intentionally retain their original source paths and claims.

# Rat Detective: start here

Rat Detective is a shipped multiplayer game. Preserve its behavior unless Tyler asks to change it.

1. Read [current state](docs/current-state.md) for the release and active owners.
2. Use [the code map](docs/code-map.md) to find your task, its source and verification.
3. Read [game rules](docs/game-rules.md) and the owning plan before changing that subsystem.

## Working rules

- Work on Halla. Existing checkout: `/home/halla/Projects/rat-detective`; new isolated worktrees belong under `/home/halla/workspaces/`. Build output and verification artifacts belong under `/home/halla/build/rat-detective/`. Do not build on Veelox.
- Inspect `git status` first; preserve unrelated edits. A worktree contains committed source only. Do not reset or clean another checkout or assume HEAD exactly describes a dirty deployed build.
- Keep changes simple. Do not write unit tests after implementation or tautological tests. Prefer existing E2E checks with repeatable artifacts; if isolation is necessary, write the failure modes before the code.
- Answer questions before implementing. Use the main agent unless delegation is explicitly requested.
- Do not deploy, restart services or publish without task authorization. Read [tooling](docs/tooling.md) before running a preview and [live service](docs/live-service.md) before release work.
- Gameplay previews use a matching frozen client and hosted Worker with server bots. Local Worker checks are bounded protocol/lifecycle fixtures, not human gameplay acceptance. Automated pointer-lock/input playtests require a request; human playtests remain the gameplay acceptance route.
- Agent browsers use `agent=1` and are muted (`mute=1` or browser mute); human playtests remain audible. Never count agent or admin-touched rounds as ordinary human evidence.
- Retrieve prior decisions through shared Chartroom when needed. Record meaningful work with verification and limits; never save credentials, raw journals or browser state.

## Keeping this repository navigable

[The code map](docs/code-map.md) owns task routes; subsystem READMEs explain local boundaries. Update them when moving an entry point or changing ownership. [The documentation map](docs/README.md) owns document roles. Keep current rules separate from dated receipts; update an owning plan rather than creating competing status pages.

Run `npm run check:repository -- --output /home/halla/build/rat-detective/repository-navigation.json` after navigation changes. For source moves, also run typecheck and production/visual builds; choose existing E2E checks from the code map. Report what actually passed and its limits.

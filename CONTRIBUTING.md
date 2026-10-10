# Contributing

Start with [AGENTS.md](AGENTS.md), [current state](docs/current-state.md), [code map](docs/code-map.md), and [tooling](docs/tooling.md). Rat Detective is a live game built around physical comedy, not a competitive-balance exercise or a blank-slate rewrite.

## Setup and checks

```sh
npm ci
npm run typecheck
npm test
npm run build
```

Prefer existing E2E checks with repeatable artifacts from [the scripts guide](scripts/README.md). Do not add post-implementation unit tests or tautological tests; document failure modes first if an isolated check is necessary. Use existing focused checks for the changed system before broader checks. `npm test` includes Worker, client and Node relay tests. Dependency audit is available as `npm run audit` and runs in CI. For docs-only changes, verify facts and links rather than running gameplay or load tests.

The configured local gameplay preview uses the hosted relay on port 5174. Legacy `npm run dev` / `npm run preview` run local workerd on 5173 and are not the preferred long-running playtest setup. Read the tooling guide before starting or restarting a service.

## Change expectations

Preserve tuned ordinary ball physics, shared map collision truth, case kill credit, recovery and resource cleanup. Cosmetic changes should retain the established rat and noir identity. Describe what changed and why, distinguish code/protocol tests from browser or multiplayer playtests, and state remaining uncertainty. Browser-input automation is currently left to the user's playtests unless requested; CI's browser checks are a separate existing workflow.

Inspect the working tree and preserve uncommitted work. A deployed release may contain source not in HEAD. Do not clean or reset it as setup. Commit, publish and restart services only within the task's authorization. Update current documentation with behavior changes and keep dated evidence historical.

See [SECURITY.md](SECURITY.md) for the authority boundary and private reporting policy.

## Navigation maintenance

When moving source, update the task route in [the code map](docs/code-map.md) and the subsystem README. Keep current guidance concise and historical receipts dated. Run `npm run check:repository`; use `-- --output /home/halla/build/rat-detective/repository-navigation.json` for a saved report.

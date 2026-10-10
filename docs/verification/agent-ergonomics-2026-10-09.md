# Repository navigation pass — 9 October 2026

Tyler requested agent ergonomics for the codebase. Quick grill agreed: fresh agents doing everyday tasks; short entrance with clear routes and local detail; documentation plus useful code moves, preserving runtime behavior. Implementation was authorized on a new branch. No separate spec.

Branch `agent-ergonomics`, based on `47047fcd7c26714f41b5c0b6ed2d1f19f79322c6`, isolated Halla worktree `/home/halla/workspaces/rat-detective-agent-ergonomics`. Unrelated dirty work in `/home/halla/Projects/rat-detective` was left untouched. No commit, push, deploy, service restart or human/browser input playtest was performed.

## Result

- Root AGENTS reduced from 121 to 24 lines; current state from 1033 to 34; documentation map from 193 to 29. Complete old payloads retained in release-history, reference-history and agent-guidance-history at the same documentation depth; archived root links adjusted for their new depth.
- Task-oriented [code map](../code-map.md), consolidated [protected rules](../game-rules.md), nine local subsystem guides and a [scripts guide](../../scripts/README.md). Source remains authoritative; later accepted decisions supersede dated proposals.
- `src/prototype/` renamed to `src/presentation/`: 54 shipped presentation files. Runtime, test, fixture and design-tool references updated. Owning plans follow the new paths; dated receipts and research retain the old paths with the mapping explained in the code map.
- Public README corrected: human-only room activity, 6–9 bots, ten total rats, carrier damage/heal. Current state now points at the latest softer-bot release and its unresolved human acceptance.
- `npm run check:repository` verifies maintained entrance links/headings and rejects imports from the old directory. Added to CI. Maintenance responsibility is documented alongside contribution guidance.

## Checks and repeatable artifacts

All artifacts are under `/home/halla/build/rat-detective/agent-ergonomics/`, not in the repository. Dependencies reused from the existing softer-bot build only after matching package-lock files. Client/visual outputs use build-directory symlinks.

| Check | Result | Artifact |
| --- | --- | --- |
| Maintained navigation | PASS: 17 guides, 317 links | `navigation.json` |
| Broken-route E2E | PASS: missing target, missing heading, missing guide and old import each rejected; restored entrance passes | `navigation-negative.json`, `navigation-guards.json`, `verify-navigation-guards.py` |
| Existing source equivalence | PASS: 747 files, 54 moves; all changes limited to path substitutions | `source-equivalence.json`, `verify-source-move.py` |
| Historical payload retention | PASS: complete previous three pages retained | `history-preservation.json` |
| Typecheck | PASS | `typecheck.log` |
| Production build | PASS; existing large-chunk warning | `build.log`, `client/` |
| Visual fixture build | PASS; existing large-chunk warning | `visual-build.log`, `visual/` |
| Idle-room E2E | PASS: empty, active, reconnect grace and idle phases; no idle ticks, bots, writes or alarm | `idle-room.json`, `idle-room.log` |
| Connection-recovery E2E | PASS: peer drop, retained resume, bounded stalled ACK and teardown | `connection-recovery.json`, `connection-recovery.log` |
| Existing legacy WS smoke | FAIL: unauthorized private room returns 404; source also expects obsolete three HP/client hit reports | `ws-smoke.log` |
| Diff whitespace | PASS | `git diff --check` |

Repeat from the worktree:

```sh
npm run check:repository -- --output /home/halla/build/rat-detective/agent-ergonomics/navigation.json
python3 /home/halla/build/rat-detective/agent-ergonomics/verify-navigation-guards.py
python3 /home/halla/build/rat-detective/agent-ergonomics/verify-source-move.py
npm run typecheck
npm run build
npm run visual:build
node scripts/verify-idle-room.mjs --output /home/halla/build/rat-detective/agent-ergonomics/idle-room.json
node scripts/with-local-worker.mjs -- node scripts/verify-connection-recovery.mjs --out=/home/halla/build/rat-detective/agent-ergonomics/connection-recovery.json
```

## Limits

Source equivalence covers existing application, test, script and design-tool source, not a claim about gameplay acceptance. Builds and local E2E establish imports, transport and lifecycle; no new human/phone/performance or production claim. Full isolated test suites were not rerun: the latest release already documents one aiming-bound failure with the approved softer tracking. Legacy smoke remains an existing CI issue; this pass corrects its navigation status but does not repair unrelated harness behavior. Older documents can still contain dated “current” claims; the maintained entrance separates them from present guidance rather than rewriting their evidence.

# Verification and operations scripts

[Task routes](../docs/code-map.md) · [Tooling/environment rules](../docs/tooling.md)

Run from the checkout on Halla. Write builds and receipts under `/home/halla/build/rat-detective/`; use an isolated worktree when the main checkout is dirty. Existing scripts cover distinct boundaries, not interchangeable gameplay acceptance.

| Need | Command / entry | Artifact and limit |
| --- | --- | --- |
| Entrance links/task routes | `npm run check:repository -- --output /home/halla/build/rat-detective/repository-navigation.json` | JSON link report; checks maintained guides, not all historical evidence |
| Source move/type compatibility | `npm run typecheck` | Compiler log; no runtime acceptance |
| Client builds, including fixtures | `npm run build`; `npm run visual:build` | Production/visual bundles; large-chunk warnings may remain |
| Connection/reconnect transport | `node scripts/with-local-worker.mjs -- node scripts/verify-connection-recovery.mjs --out=/home/halla/build/rat-detective/connection-recovery.json` | JSON peer-drop, resume and stalled-ACK receipt; local bounded fixture, not hosted gameplay |
| Empty-room lifecycle | `node scripts/verify-idle-room.mjs --output /home/halla/build/rat-detective/idle-room.json` | JSON empty/play/grace/idle phases and storage hashes; starts/stops its own local Worker |
| Bot traversal/combat/objectives | `node scripts/bot-sim.mjs --seeds=2 --minutes=2 --jobs=3 --json` | Redirect JSON to a build artifact; no humans, network or Jev |
| Hosted entry | [verify-entry.mjs](verify-entry.mjs) `--url=<matching hosted game> --out=<build directory>` | Entry JSON; use `--skip-browser` for socket-only checks; browser mode needs requested automation |
| Hosted reconnect | [reconnect-check.mjs](reconnect-check.mjs) `--url=<matching hosted game> --out=<build directory>` | Reconnect JSON and screenshots; browser input automation needs a request |
| Replay detection/playback | [exhibits-check.mjs](exhibits-check.mjs), [verify-replay.mjs](verify-replay.mjs) | See each script’s header for required URL/output flags and boundary |
| Physical clues | [verify-case-clues.mjs](verify-case-clues.mjs), [verify-case-clues-ws.mjs](verify-case-clues-ws.mjs), [verify-case-trails.mjs](verify-case-trails.mjs) | See headers; distinguish socket, static fixture and browser checks |
| Tick/client performance | [benchmark-server-tick.mjs](benchmark-server-tick.mjs), [profile-client.mjs](profile-client.mjs) | Measured report; use matching recipient/rat settings and record view delay |
| Era/round analysis | [era-report.mjs](era-report.mjs), [round-report.mjs](round-report.mjs) | Data report; exclude agents/admin-touched rounds per data plan |
| Deploy/admin/storage | [deploy.mjs](deploy.mjs), [admin.mjs](admin.mjs), [unpack-city-aggregates.mjs](unpack-city-aggregates.mjs) | Authorized operations only; read live-service runbooks first |

Do not run every script as a checklist. Pick the boundary affected, retain its receipt, and report what it cannot prove. Browser-input playtests require explicit authorization; ordinary human playtests stay audible. Static visual fixtures are different from hosted gameplay previews. `lib/` contains reusable harness helpers; `fixtures/` contains bounded comparison implementations, not production alternatives.

After source moves, verify imports and both builds. When maintaining task routes, update the local guide and code map alongside the move. Historical source paths remain historical, with old `src/prototype/` resolved to `src/presentation/`.

## Supply/results browser boundary qualification

Build visual fixtures, then run `node scripts/verify-repository-boundaries.mjs --out=/home/halla/build/rat-detective/agent-ergonomics/browser-boundaries`. Set `CHROME_BIN` if needed. The production simulation, presentation, HUD, results coordinator and recorder run in a muted real browser without gameplay input. The output contains `browser-boundaries.json` and `browser-boundaries.png`; these qualify the controlled boundary, not network or human play.

`smoke-ws.mjs` now uses current public admission with `agent=1` and checks joins, sequenced movement, accepted shot broadcast, implausible-shot rejection and invalid-supply rejection. Pass `--out=/absolute/path/receipt.json`. Damage/death/scoring are covered by authoritative simulation and gameplay checks, not client-reported hit claims.

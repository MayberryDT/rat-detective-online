# Production release — 2026-09-06


> **Historical record — September 6 production deployment.** Classified on 2026-09-08. Statements below describe that pass, including its then-current code, deployment, authorization and test counts. They are not present-day instructions or a current feature inventory. Use [the current reference](../live-service.md) before acting. Preserve the measurements; do not restore obsolete behavior from this report.

User explicitly authorized publishing the verified staging build. Source release: `be09014749f221176176c39b26b97e6235630b61` on main; application code is unchanged from the tested staging release.

- URL: https://rat-detective.animasai.co
- Worker: `rat-detective-preview`
- Activated: `2026-09-06T16:37:06.393785Z`
- Deployment: `0ee121bd-16f9-4591-b995-dc48db08c7cb`
- Version: `9b1bbd36-d989-4fa5-a338-d5c4d64fb792`, 100% traffic
- Previous version / rollback reference: `e10228e8-3bcb-4b5c-8380-c22b0f6a7fcc`
- Existing GAME_ROOM namespace retained: `70ceefe8318a4177ae08f5d0b6f3f00d`
- Existing domain retained; workers.dev and preview URLs remain disabled.
- Compatibility date/flag retained: `2026-07-08`, `nodejs_compat`; migration tag remains `v1`. No namespace creation or destructive migration requested.

Production dry-run passed. Authenticated Cloudflare API uploaded the same nine static assets and bundled Worker as staging. The upload returned HTTP 200; deployment readback confirmed the new version at 100%. Temporary upload credentials were removed after success. The staging-only helper was used for local manifest hashing and asset-bucket upload; its staging-only Worker packaging was not used for production. Production metadata explicitly retained the existing namespace and omitted namespace-creation migrations.

## Live verification

- `/health`: HTTP 200, expected service/runtime response.
- JavaScript `/assets/index-CZgtWzYx.js` and CSS `/assets/index-DqzIn-gE.css`: HTTP 200 and byte-identical to local tested dist.
- Isolated two-client WebSocket smoke: join v1, movement, identical shot descriptor, damage, death, scoring, timed respawn and leave passed.
- Real-input browser smoke: title dismissed, scoreboard/canvas visible, pointer lock acquired, W movement 6.39 units, Space jump rise 2.63 units, resolved mouse-click shot with direction length 1. Both smoke commands exited 0. Distances are timing-dependent smoke observations, not tuning constants.

No application source changes or git push were needed for this deployment. The prior staging report's statement that production was untouched describes the earlier implementation pass; this separately authorized release supersedes that deployment status.

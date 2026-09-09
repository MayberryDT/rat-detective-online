# Documentation reconciliation — 2026-09-08

This was a documentation-only task. It did not change gameplay, deploy, restart a service, force a round, commit or reset the working tree.

## Reviewed

- All 26 pre-existing project Markdown files: root guides, docs/runbooks, verification reports, visual fixture guides, Omarchy guides and concept prompt provenance.
- Source for world/version/routing, room lifecycle, roster/capacity, authoritative combat, incident catalog, projectile limits, navigation/recovery, client diagnostics, preview scripts and CI.
- Latest deployment receipt: `e3a70ae3-246f-4712-94dc-a692495ac045`; last application suite: 409 passing tests, typecheck and build. Those tests were not rerun for prose changes.
- Public `/health` and `/status`: healthy, `public-live-v2`, playing, eight managed bots with generated names and active scores. This is a status observation, not an interactive gameplay or stress test.
- Local service states: main and secondary hosted relay active; retired stable local workerd inactive. Availability must be checked again before future operations.

## Result

Added [agent guidance](../../AGENTS.md), a [documentation index](../README.md) and [current-state handoff](../current-state.md). Rewrote current authority, operations, gameplay, live-service and tooling references. Corrected diagnostics/public-versus-private distinctions and companion population language. Preserved early audit/plan/verification/concept records with explicit historical notices; kept old gameplay constants and network measurements in dated reference documents.

Local Markdown file links were checked and resolved. Current facts were checked against source; historical outcomes were left intact and explicitly separated. Further agents should follow current references and user instructions, not execute old research prompts or restore pre-launch behavior.

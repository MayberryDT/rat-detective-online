# Repository ergonomics production release — 9 October 2026

Tyler authorized: “merge and send it live.” Merged `agent-ergonomics` (`451a80a`) into GitHub `master` with merge commit `6bf21bd`, then deployed the matching client and Worker through `npm run deploy:production` from the clean Halla worktree.

- Build `production-2026-10-10-6bf21bd`; Worker `1659ab83-9e7e-4b4e-a57f-cad9e44cc575`.
- Previous Worker `e5c0c7a1-f332-48ee-ad44-1b406189292c`, build `production-2026-10-10-21177b7`.
- Protocol 43, layout 7, mindVersion 22, era `repository-ergonomics`.
- Client entry `index-DLrZK7Yd.js`; the larger game module remains lazy-loaded.
- Public room remains `public-live-v3`, ORD, world seed 1960118781/version 7. No namespace, migration, room identity, secret or storage-format change.
- Observed deploy completion `2026-10-10T01:54:12.478405+00:00` (UTC); 9 October locally.

## Change and preflight

See [implementation qualification](repository-ergonomics-2026-10-09.md). This ships the entrance and subsystem routes, source/art homes, supply/interaction/results owners, warm/live factories and independent layout/spill leaves. The intentional play correction makes fog loose-case goal visibility respect the existing 24-unit sight cap; softer reaction/tracking is preserved. Existing bounded sightings remain.

Typecheck and build passed. Worker suite288, client1519 and script46 tests passed; client retains the one aiming-bound failure reproduced on the original build (one skipped). Browser supply/results fixture21 checks and local real-input movement/jump/shooting check passed, alongside idle-room and transport recovery. Geometry/spill outputs and Blackout trajectory/wire fingerprints matched original source. Final runtime dependency audit found zero vulnerabilities; full audit reports six high-severity advisories in unchanged development dependencies. No dependency upgrade or test weakening was included.

## Live verification

`/health` and provider version inspection confirm the exact build/version. Root HTML and all three referenced assets returned200; sharing metadata/image and old-host root/path/query redirects passed. Before entry the public room read0players/0bots, ORD, retaining its world identity. Artifact `production-http.json` records these checks.

A bounded passive production agent seat held a connection for 20 seconds, received 587 chaos updates, and saw no errors or unplanned closes. Its welcome confirmed protocol 43 and the unchanged world. The harness then explicitly closed its seat; see `production-passive.json`. The matching live browser entry check passed: cold title preparation, Enter City, welcome, current HUD/scoreboard and rendered canvas. Receipt/screenshot: `production-browser.json` and `production-browser.png`. The optional Cloudflare Web Analytics beacon failed; it is recorded separately, while game assets, runtime errors and other network failures remain fatal. Browser timing/reconnection during this headless run is not a human performance or stable-browser-session claim. Departure status is recorded below. Agent browsers are muted and use `agent=1`; they do not count as human gameplay evidence. No human acceptance or human era comparison is claimed.

Artifacts: `/home/halla/build/rat-detective/agent-ergonomics/`: `production-deploy.log`, `production-provider.json`, `production-http.json`, release typecheck/audit logs and existing qualification receipts. Provider creation and observed completion are separate timestamps.

## Verification harness updates

Hosted checks use public admission instead of inventing an unauthorized private room. An explicit ANGLE setting now controls GPU configuration instead of being contradicted by `--disable-gpu`. Failed requests retain their URL. Only the exact injected Cloudflare analytics beacon is treated as optional and reported separately. Initial abandoned diagnostics used a rejected throwaway room and software rendering; those runs are not passes. These follow-up changes affect the verification script, not the deployed game.

After all test seats departed, `/status` returned **0 players / 0 bots**, `public-live-v3`, ORD, the original seed/version. See `production-departure.json`.

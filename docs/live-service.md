# Live service runbook

Last release receipt: **2026-09-08**. Confirm live state before future operations; version IDs below are dated records.

| Item | Value |
| --- | --- |
| Canonical URL | https://ratdetective.online/ |
| Redirect | https://rat-detective.animasai.co → canonical host, preserving path/query |
| Production Worker | `rat-detective-preview`, environment `production` |
| Last deployed version | `e3a70ae3-246f-4712-94dc-a692495ac045` — sharing and per-round AI cast |
| Previous version | `db9890c3-2e7d-4606-b590-71993812f4c4` — bot navigation fix |
| Public Durable Object room | `public-live-v2`; the former `public` room is separate |
| Shared world | Version 2; seed persisted for the room (recorded public seed: 341283204) |
| Admission | 8–11 server bots per round, eleven reserved slots, thirteen humans maximum |

## Continuous operation

`GET /status` and default `/ws` idempotently enable the public roster. Arbitrary named rooms do not automatically acquire hosted AI. ServerBotController and ChaosSimulation run in the Durable Object without any browser, laptop, local service or Codex task staying open. No audience means no snapshot wire broadcast, but simulation and checkpoints continue.

The `persistent-bots-v1` enabled flag, `persistent-bot-roster-v1` active roster, player records, world, round, chaos snapshot and pending deadlines persist in SQLite. Each round rolls 8–11 bots and fresh distinct names. Status, reconnect and eviction preserve the current cast; legacy fixed-eleven rooms preserve it until their next round. Reset cleans old bot records/events and emits leave/join events so client nameplates update.

A 15-second Durable Object alarm restores the simulation after eviction and shares its schedule with earlier respawn/reset deadlines. This provides recovery, not a guarantee against platform outages. See [server operations](server-operations.md) for timing and storage details.

## Build and deploy

Inspect the working tree first: recent releases were deployed with substantial uncommitted source. A Git commit or HEAD checkout is not necessarily the live build.

```sh
npm run typecheck
npm test
npm run build
npm run deploy:production
```

The deploy script also builds. If a reviewed build is already complete, `npx wrangler deploy --env production` deploys it with the current Worker source. Do not use a bare default deploy. Staging is `npm run deploy:staging`, a separate Worker and namespace. Preserve room identity, namespace, migration compatibility, domains and `assets.run_worker_first: true` in production; that routing makes the old-host redirect cover assets too.

A documentation update alone does not require deployment. Never include private test credentials in assets or commands printed to the user.

## Verify the actual release

- `/health` checks routing/runtime only. `/status` should show `public-live-v2`, 8–11 bots, current human count and plausible round state.
- Fetch the root and referenced assets; check the old host redirects both root and a path/query.
- Confirm the deployed version from the deployment receipt and record its predecessor. Do not infer deployed source from Git alone.
- For sharing, root HTML must contain static Open Graph / Twitter metadata and an accessible `image/png` asset at `/share-title-v1.png`. The image is an actual 1200×630 title-screen screenshot. Use a new versioned image URL when replacing it; third-party previews may remain cached.
- `node scripts/verify-persistent-bots.mjs https://ratdetective.online --seconds=20` opens one observer, disconnects and observes again. Its empty-room assertions require no actual humans. Do not run it during someone else's playtest. It is not a stress test or proof of smooth movement; observe displacement and goal progress when diagnosing AI.

## Recovery and rollback

Read status, logs and the appropriate diagnostics before changing services or state. Do not rename the public room, delete its data or recreate its namespace as a restart mechanism. Individual bot/primary-case watchdogs already handle some stuck situations without resetting the match; see [current state](current-state.md).

A rollback changes code/assets, not arbitrary stored state. Review the prior version's compatibility with roster persistence, extra cases, incident IDs and protocol validators. Rolling back to pre-launch code also loses persistent hosted bots and the application redirect. Prefer a narrowly scoped forward fix when feasible.

The private `rat-detective-network-test` Worker is separate. Its last recorded restoration was `b959490c-28cc-4915-8765-64098bef4393`; verify before use. Stored persistent-bot flags may survive a rollback, so deploying modern code there can reactivate a second continuous room. Do not assume the private backend automatically matches production.

## Verification history and limits

| Release | Evidence |
| --- | --- |
| Initial persistent launch, `9d4c98e5-5225-49eb-825b-1c8777a0879b` | 352 tests; bounded no-human operation and live transport check |
| Recovery / incidents, `b112bdc2-28e1-467b-8d63-d7ad5468968d` | 388 tests covered; extra cases and incident migration |
| Navigation fix, `db9890c3-2e7d-4606-b590-71993812f4c4` | 401 tests; captured 40-second replay improved from 106 to 348 shots and 6 to 0 unnecessary rescues |
| Sharing / random cast, `e3a70ae3-246f-4712-94dc-a692495ac045` | 409 tests (70 Worker, 336 client, 3 relay), typecheck/build; live HTML/image 200 and old-host 301 |

The navigation release's 20-second public observation showed ten bots traveling 84–143 units and one traveling 24; occasional local obstruction remained. The cast release tested reset/name/count/persistence in Durable Object integration tests; it did not force a live round reset or run browser input. None of these checks certifies 50–100 players, a 24-hour soak, or perfect subjective play feel. Historical reports remain under [verification](verification/).

During the 2026-09-08 documentation review, a read-only public health/status check returned healthy and an active eight-bot round with generated names and nonzero scores. No round was forced, service restarted or deployment performed for that check.

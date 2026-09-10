# Live service runbook

Last release receipt: **2026-09-10**. Confirm live state before future operations; version IDs below are dated records. [Entry/sewer follow-up verification](verification/mobile-entry-sewer-2026-09-10.md); [preceding full release](verification/production-release-2026-09-10.md).

| Item | Value |
| --- | --- |
| Canonical URL | https://ratdetective.online/ |
| Redirect | https://rat-detective.animasai.co → canonical host, preserving path/query |
| Production Worker | `rat-detective-preview`, environment `production` |
| Last deployed version | `ebe0f20e-3f68-46a9-b175-1929faf2c436` — application commit `c438104`, protocol 7, prepared city entry and sewer lighting |
| Previous version | `e28b2d9c-0b7d-46a9-8195-24f1ce860939` — September 10 full accepted game |
| Public Durable Object room | `public-live-v2`; the former `public` room is separate |
| Shared world | Version 2; seed persisted for the room (recorded public seed: 341283204) |
| Admission | 16 total rats per room; occupied rooms fill to eight with AI, yielding to humans; automatic overflow rooms |

## Continuous operation

`GET /status` enables the canonical room's matchmaking policy and includes its persisted world seed/version so titles can prepare matching geometry without joining or reserving a slot; default `/ws` uses the persistent Matchmaker admission directory. Live sockets and simulation remain in individual GameRooms. Occupied rooms fill to eight total participants with server-owned AI (`max(0, 8 - humans)`), with a ten-second refill grace after departures. Humans can fill all sixteen slots. Arbitrary named rooms do not automatically acquire hosted AI. Hosting needs no local service or Codex task.

The `persistent-bots-v1` enabled flag, `persistent-bot-roster-v1` active roster, matchmaking identity, player records, world, round, chaos snapshot and deadlines persist in SQLite. Names refresh with each round; unchanged setup preserves surviving bots. Reset cleans old bot records/events and emits leave/join events so client nameplates update. The former production policy of reserving eleven AI slots is historical.

When the last human leaves, bots are removed and the simulation sleeps. Empty overflow rooms retire from the admission directory; the canonical room/world identity remains. Consequently **zero players and zero bots on `/status` is healthy when nobody is playing**. `/status` describes the canonical room, not a total across overflow rooms.

A 15-second Durable Object alarm restores occupied-room simulation after eviction and shares its schedule with earlier respawn/reset deadlines. This provides recovery, not a guarantee against platform outages. See [server operations](server-operations.md) for timing and storage details.

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

- `/health` checks routing/runtime only. `/status` should show `public-live-v2` and plausible round state. An empty room has zero rats; one human normally brings seven bots. Count must stay within sixteen.
- Fetch the root and referenced assets; check the old host redirects both root and a path/query.
- Confirm the deployed version from the deployment receipt and record its predecessor. Do not infer deployed source from Git alone.
- For sharing, root HTML must contain static Open Graph / Twitter metadata and an accessible `image/png` asset at `/share-title-v1.png`. The image is an actual 1200×630 title-screen screenshot. Use a new versioned image URL when replacing it; third-party previews may remain cached.
- `scripts/verify-persistent-bots.mjs` retains historical 8–11-bot/continuous-empty-room assertions and must not be used as the current production acceptance check. Use a bounded passive observer with the current delivery decoder/ACKs to inspect default matchmaking, world identity, assignment snapshots and departure cleanup. Use a separate named room for combat protocol smoke; do not force public round resets or stress the public room.

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
| Full accepted game, `e28b2d9c-0b7d-46a9-8195-24f1ce860939` | 762 tests, typecheck, both builds, clean audit; 45 exact live assets, original world seed, 208 valid snapshots, combat smoke and redirects |
| Entry/sewer follow-up, `ebe0f20e-3f68-46a9-b175-1929faf2c436` | 769 tests, typecheck, both builds, clean audit; eight fixed phone-size renders, 45 exact live assets, matching preparation/welcome world, 228 valid snapshots, combat smoke and redirects |

The navigation release's 20-second public observation showed ten bots traveling 84–143 units and one traveling 24; occasional local obstruction remained. The cast release tested reset/name/count/persistence in Durable Object integration tests; it did not force a live round reset or run browser input. None of these checks certifies 50–100 players, a 24-hour soak, or perfect subjective play feel. Historical reports remain under [verification](verification/).

During the 2026-09-08 documentation review, a read-only public health/status check returned healthy and an active eight-bot round with generated names and nonzero scores. No round was forced, service restarted or deployment performed for that check.

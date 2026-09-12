# Live service runbook

Last release receipt: **2026-09-12**. [Accepted model and protocol15 integration](verification/model-netplay-integration-2026-09-12.md). [Accepted pickup/reconnect refinement release](verification/pickup-reconnect-production-2026-09-11.md). Confirm live state before future operations; version IDs below are dated records. [Steady fixture lighting release](verification/steady-lighting-production-2026-09-10.md); [grounded exterior lighting verification](verification/exterior-lighting-2026-09-10.md); [fast title/input/lighting verification](verification/title-fast-tap-lighting-2026-09-10.md); [entry/sewer follow-up](verification/mobile-entry-sewer-2026-09-10.md); [preceding full release](verification/production-release-2026-09-10.md).

| Item | Value |
| --- | --- |
| Canonical URL | https://ratdetective.online/ |
| Redirect | https://rat-detective.animasai.co → canonical host, preserving path/query |
| Production Worker | `rat-detective-preview`, environment `production` |
| Last deployed version | `21f6b8c1-4770-4691-92fa-71b5096f8a7b` — application commit `3a6a1d2`, protocol 15, accepted detective model and netplay improvements |
| Previous version | `3398a69c-146b-4d99-aa47-e3734664c086` — previous protocol-14 release; rollback requires its matching client |
| Public Durable Object room | `public-live-v2`; the former `public` room is separate |
| Shared world | Version 2; seed persisted for the room (recorded public seed: 341283204) |
| Admission | 16 total rats per room; occupied rooms fill to eight with AI, yielding to humans; automatic overflow rooms |

Protocol 15 requires matching client and Worker. Existing older game tabs should
reload to get the new version. The intermediate protocol-9 version
`024dc635-2fbe-4b51-aaf8-2d43cdef789b` omitted compact pickup fields and is not a
rollback candidate.

## Continuous operation

`GET /status` enables the canonical room's matchmaking policy and includes its persisted world seed/version so titles can prepare matching geometry without joining or reserving a slot; default `/ws` uses the persistent Matchmaker admission directory. Public `prepare=1` sockets bypass reservation/overflow allocation and remain silent until joining. They are bounded to sixteen per canonical room and a 30-second server lease (25 seconds on the client); a full-room join retries through normal matchmaking and cannot steal existing reservations. They do not start bots or simulation. Live sockets and simulation remain in individual GameRooms. Occupied rooms fill to eight total participants with server-owned AI (`max(0, 8 - humans)`), with a ten-second refill grace after departures; disconnected rats now retain
their existing slots for 30 seconds before removal. Humans can fill all sixteen slots. Arbitrary named rooms do not automatically acquire hosted AI. Hosting needs no local service or Codex task.

The `persistent-bots-v1` enabled flag, `persistent-bot-roster-v1` active roster, matchmaking identity, player records, world, round, chaos snapshot and deadlines persist in SQLite. Names refresh with each round; unchanged setup preserves surviving bots. Reset cleans old bot records/events and emits leave/join events so client nameplates update. The former production policy of reserving eleven AI slots is historical.

Disconnected humans retain their identity, stats, objective state and slot for
30 seconds. Their rats remain vulnerable and the match continues. Private reconnect
credentials/deadlines persist separately in `reconnect_sessions`; same-tab reloads
can resume through sessionStorage, and a bounded unreserved socket can recover an
existing slot even in a full room. Tokens never appear in public player data or URLs.
After the last reservation expires, bots are removed and the simulation sleeps. Empty overflow rooms retire from the admission directory; the canonical room/world identity remains. Consequently **zero players and zero bots on `/status` is healthy when nobody is playing**. `/status` describes the canonical room, not a total across overflow rooms. It counts
attached humans; temporarily disconnected reserved rats remain on the authoritative
scoreboard even though they are omitted from that status population count.

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
| Accepted pickup/reconnect refinements, `3398a69c-146b-4d99-aa47-e3734664c086` | 935 tests, clean typecheck/build/audit, human r8 acceptance; exact live assets and passive production reconnect checks in the current receipt |
| Pickups/Planted Evidence, `d6d1b1e3-9406-4df6-a3f5-04132652e3c1` | 883 tests, typecheck/build, clean audit; 51 exact assets, 50 valid compact snapshots, eight rats, six sites, original world and redirects; human pickup feel remains unverified |
| Initial persistent launch, `9d4c98e5-5225-49eb-825b-1c8777a0879b` | 352 tests; bounded no-human operation and live transport check |
| Recovery / incidents, `b112bdc2-28e1-467b-8d63-d7ad5468968d` | 388 tests covered; extra cases and incident migration |
| Navigation fix, `db9890c3-2e7d-4606-b590-71993812f4c4` | 401 tests; captured 40-second replay improved from 106 to 348 shots and 6 to 0 unnecessary rescues |
| Sharing / random cast, `e3a70ae3-246f-4712-94dc-a692495ac045` | 409 tests (70 Worker, 336 client, 3 relay), typecheck/build; live HTML/image 200 and old-host 301 |
| Full accepted game, `e28b2d9c-0b7d-46a9-8195-24f1ce860939` | 762 tests, typecheck, both builds, clean audit; 45 exact live assets, original world seed, 208 valid snapshots, combat smoke and redirects |
| Entry/sewer follow-up, `ebe0f20e-3f68-46a9-b175-1929faf2c436` | 769 tests, typecheck, both builds, clean audit; eight fixed phone-size renders, 45 exact live assets, matching preparation/welcome world, 228 valid snapshots, combat smoke and redirects |
| Fast title/input/lighting, `ae032bb2-01f2-4baa-b09f-e9033b41141e` | 781 tests, typecheck, both builds, clean production audit; five static views, 51 exact assets, prepared welcome 142 ms, 240 valid snapshots, combat smoke and redirects |
| Grounded exterior lights, `d5fc60bf-78a8-44e2-821b-f7c794233e68` | 784 tests, typecheck, both builds; seven final static views, 51 exact assets, health/original world and redirects. No new phone or network timing claim |
| Steady fixture lights, `8cacdb60-2ee0-4f63-b8bb-9f02de321719` | 797 tests, typecheck/build and clean audit; 51 exact live/approved-preview assets, health/original world and redirects. Human acceptance; target practice stays separate |

The navigation release's 20-second public observation showed ten bots traveling 84–143 units and one traveling 24; occasional local obstruction remained. The cast release tested reset/name/count/persistence in Durable Object integration tests; it did not force a live round reset or run browser input. None of these checks certifies 50–100 players, a 24-hour soak, or perfect subjective play feel. Historical reports remain under [verification](verification/).

During the 2026-09-08 documentation review, a read-only public health/status check returned healthy and an active eight-bot round with generated names and nonzero scores. No round was forced, service restarted or deployment performed for that check.

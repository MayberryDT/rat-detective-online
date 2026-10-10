# Live service runbook

Last release receipt: **2026-10-06**. [Accepted shooting / protocol 33](verification/task74-release-2026-10-06.md). [Rooms play only with a human](verification/idle-room-release-2026-10-06.md). [Protocol 32, random supplies](verification/random-supplies-release-2026-10-03.md). [Protocol 31, the three-human playtest batch](verification/protocol-31-release-2026-10-03.md). [Protocol 30, exhibits](verification/exhibits-release-2026-10-02.md). [Protocol 28](verification/protocol-28-release-2026-10-02.md). [Protocol 27](verification/protocol-27-release-2026-10-01.md). [Protocol 26](verification/protocol-26-release-2026-10-01.md). [Release A](verification/release-a-2026-09-30.md). [Bot overhaul and controls recording](verification/bot-overhaul-release-2026-09-30.md). [City overhaul, layout 3](verification/city-overhaul-release-2026-09-29.md). [Heat map](verification/heat-map-release-2026-09-28.md). [Juice release, protocol 19](verification/juice-release-2026-09-27.md). [Server CPU and delivery gating](verification/server-cpu-2026-09-27.md). [Committed source and branding removal](verification/full-source-release-2026-09-22.md). [Social sharing image](verification/social-share-2026-09-22.md). [Fullscreen and capture bounds](verification/window-resize-capture-2026-09-21.md). [Launchable cases](verification/case-launchers-2026-09-17.md). [6-9 roster and 1.5s balls](verification/roster-cap-kick-production-2026-09-17.md). [Always-alive canonical city](verification/canonical-city-2026-09-14.md). [Combined bots, navigation fixes and cameos](verification/combined-production-2026-09-14.md). [Accepted maneuvers, settings and ten-rat cap](verification/maneuvers-production-2026-09-14.md). [Omarchy Dispatch companion](verification/omarchy-dispatch-2026-09-14.md). [Paper Chase sewer-guidance fix](verification/paper-chase-sewer-guidance-2026-09-13.md). [Jurisdiction, Paper Chase, bot and HUD release](verification/jurisdiction-production-2026-09-13.md). [Batched movement and permanent score card](verification/movement-batching-score-card-2026-09-13.md). [Movement and Hot Pursuit lag correction](verification/movement-hot-pursuit-lag-2026-09-13.md). [Destination and restock visuals](verification/destination-restock-2026-09-13.md). [Bot vertical traversal](verification/bot-vertical-traversal-2026-09-12.md). [Case lifecycle and kill confirmation](verification/case-kill-feedback-2026-09-12.md). [Accepted animations, explosion and case fixes](verification/animation-production-2026-09-12.md). [Accepted model and protocol15 integration](verification/model-netplay-integration-2026-09-12.md). [Accepted pickup/reconnect refinement release](verification/pickup-reconnect-production-2026-09-11.md). Confirm live state before future operations; version IDs below are dated records. [Steady fixture lighting release](verification/steady-lighting-production-2026-09-10.md); [grounded exterior lighting verification](verification/exterior-lighting-2026-09-10.md); [fast title/input/lighting verification](verification/title-fast-tap-lighting-2026-09-10.md); [entry/sewer follow-up](verification/mobile-entry-sewer-2026-09-10.md); [preceding full release](verification/production-release-2026-09-10.md).

| Item | Value |
| --- | --- |
| Canonical URL | https://ratdetective.online/ |
| Redirect | https://rat-detective.animasai.co → canonical host, preserving path/query |
| Production Worker | `rat-detective-preview`, environment `production` |
| Last deployed version | `1659ab83-9e7e-4b4e-a57f-cad9e44cc575` — build `production-2026-10-10-6bf21bd`, merge source `6bf21bd`, protocol 43, layout 7 / mindVersion 22, era `repository-ergonomics`, room `public-live-v3` (Chicago). [Receipt](verification/repository-ergonomics-release-2026-10-09.md). |
| Previous softer-bot version | `e5c0c7a1-f332-48ee-ad44-1b406189292c` — build `production-2026-10-10-21177b7`, source `21177b7`, protocol 43, layout 7 / mindVersion 21, era `softer-bots`, room `public-live-v3` (Chicago). [Receipt](verification/bot-softening-2026-10-09.md). |
| Previous bot version | `20f9db44-7857-42da-b88c-ccf1bb2eb1f7` (9 October, 07:30 UTC) — build `production-2026-10-09-45dcd91`, source `45dcd91`, **protocol 43**, layout 7 / mindVersion 20, era `chaos-evidence`, room **`public-live-v3`** (Chicago). Chaos leaves evidence, the Pea Souper, the penthouse safes, the room move and direct joins ([receipt](verification/chaos-evidence-release-2026-10-09.md)). |
| Previous version | `e92c8831-e6e3-4f7e-a8cc-c2e23ba6880b` (9 October, 00:40 UTC) — build `production-2026-10-09-648ff6e`, source `648ff6e`, **protocol 39**, client `index-DbIC0R2D.js`, layout 7 / mindVersion 16, era `case-papers`. The P4 case papers and paw prints (no case ping) and the smooth-play entry, server and replay fixes ([receipt](verification/smooth-play-release-2026-10-09.md)); packed aggregates and human-seat lifecycle preserved. Rollback to protocol 33 is not qualified. |
| Older version | `9d2c12a6-a89f-485c-9ca8-87d76b02e661` — build `production-2026-10-06-2822d1a`, protocol 33: accepted shooting and authoritative short front trap throw ([receipt](verification/task74-release-2026-10-06.md)). |
| Older version | `1bdd31df-e7f3-47bb-bf23-fa1c537828ae`, build `production-2026-10-06-748340a`, protocol 32: accepted composed-camera aiming correction. Packed-storage `2476135` remains in ancestry. Protocol-32 rollback after new trap checkpoints is not qualified. |
| Older version | `a3b3d924-925f-47ac-a30e-5e5a93d46d33` (1 October, 17:53 UTC) — protocol 26: case grip, bot archetypes dealt evenly (`mindVersion` 7), Paper Chase to five, held-only Jurisdiction zone points with one zone shown, the slower shot case, supply on taking the case, the rebuilt case and the results board. Build `production-2026-10-01-6570125`, client `index-CnzpYiB8.js`, commit `6570125`. [Receipt](verification/protocol-26-release-2026-10-01.md) |
| Older version | `4ec0fd2e-ae80-4124-a445-14311df7e11b` (1 October, 04:26 UTC) — A1 air acting ([juice plan](juice-plan.md#air-acting-tyler-2026-10-01)), build `production-2026-10-01-4d9e649`, client `index-Fm0zLxiU.js`, commit `4d9e649`, protocol 25. [Receipt](verification/air-acting-release-2026-10-01.md) |
| Older version | `88171c4c-a93a-40a3-bc5c-3d0769c59c3d` (1 October, 02:03 UTC) — protocol 25 with the lighter Jev (L4 of [the bot learning plan](bot-learning-plan.md), `mindVersion` 6), build `production-2026-10-01-6356f81`. Changes: Closing Time removed, Blackout beams, heavy Big Cheese, supply claim juice and the reconnect fixes; all 13 incidents. Client `index-Bw2kUX-i.js`, **protocol 25**, commit `6356f81`. Secret and Jev vars unchanged. [Receipt](verification/protocol-25-release-2026-10-01.md) |
| Public Durable Object room | `public-live-v3` (Chicago, ORD) since 9 October, with `public-live-v2`'s history copied in; `public-live-v2` (Seattle) sleeps as the backup; the former `public` room is separate ([the public room](#the-public-room)) |
| Shared world | Version 7 / layout 7 unchanged; `public-live-v3` seed 1960118781 (v2's was 341283204; layout 7 does not depend on the seed). |
| Admission | 10 total rats per room; each round rolls 6–9 bots and humans join on top until the cap, kicking a bot only when the room is already full; automatic overflow rooms. Every room, `public-live-v2` included, sleeps without a human (below; live on both Workers since 6 October) |
| Staging | https://rat-detective-staging.mayberrydt.workers.dev/ — Worker `e0076c44-934f-49fc-9d7f-fe2614bc1b28`, built from `daa2b10` on `juice/chaos-evidence`: the same game code as production's `45dcd91` (the later commits are docs and scripts), **protocol 43**, mindVersion 20, room `public-live-v3` (Dallas), deployed with `DIAG_LOCATION_ROOMS=1` (`/status?colo=<room>` and `?colo=matchmaker:<pool>`). `main` now holds this release, so a plain `npm run deploy:staging` from `main` keeps it. |

Protocol 24 requires matching client and Worker; open protocol-23 tabs must reload. Before any rollback to protocol 15,
review stored Jurisdiction rounds: the old validator does not understand that mode. Existing older game tabs should
reload to get the new version. The intermediate protocol-9 version
`024dc635-2fbe-4b51-aaf8-2d43cdef789b` omitted compact pickup fields and is not a
rollback candidate.

Protocol 33 requires matching client and Worker through existing join/welcome reload gates. New trap flight/land/held state and weapon metadata survive transport/restore; old stationary traps remain valid. Prefer a protocol-33 forward correction: rollback to protocol 32 after new trap checkpoints needs explicit compatible trap-state handling, in addition to the packed-aggregate runbook below. The earlier aiming receipt describes HeavyCheese as private **at that release**; the Task74 release supersedes that presentation status.

## Room lifecycle: human seats only

Live since 6 October on production `4fbb94c7` and staging `c15dccc8` (Tyler, 3 October: the always-on city cost about 16 USD a day): **a room plays only while a human holds a seat**: joined, within the 30 s reconnect grace, or admitted and joining (`GameRoom.humanSlots()`). This holds on every deploy and for `public-live-v2`. The first human brings that round's 6–9 bots, the tick and the companion feed. When the last seat goes, the room removes its bots, stops the tick, checkpoints once, leaves the companion feed (overflow rooms also retire from the admission directory) and sets no alarm, so the object hibernates with no storage writes. There is no flag to restore the always-on city. Check with `node scripts/verify-idle-room.mjs` ([change](verification/idle-room-2026-10-03.md), [release](verification/idle-room-release-2026-10-06.md)). Hosted, an empty Worker reads 0 humans / 0 bots on `/status`, and `npx wrangler tail <worker> --format json` shows no alarm (`scheduledTime`) and no `room diagnostics` line for longer than the 15 s heartbeat.

`GET /api/companion/v1/status` reads cached authoritative summaries across active
public rooms, with bounded cursor pagination. It does not fan out to GameRooms or
wake gameplay. Summary generations, revisions, expiry and retirement tombstones
prevent older publications from reviving a retired room. The companion API has its
own schema version, separate from the gameplay protocol. An empty public city publishes nothing, so the feed lists no room.

`GET /status` enables the canonical room's matchmaking policy and includes its persisted world seed/version so titles can prepare matching geometry without joining or reserving a slot; default `/ws` uses the persistent Matchmaker admission directory. Public `prepare=1` sockets bypass reservation/overflow allocation and remain silent until joining. They are bounded to sixteen per canonical room and a 30-second server lease (25 seconds on the client); a full-room join retries through normal matchmaking and cannot steal existing reservations. Title prepare does not reserve a participant or create overflow. Neither `GET /status` nor prepare starts a match; an empty city reads 0 humans and 0 bots.
Live sockets and simulation remain in individual GameRooms. Occupied rooms keep that round’s 6–9 bots and add humans on top until ten, kicking a bot only when already full; disconnected rats now retain
their existing slots for 30 seconds before removal. Humans can fill all ten slots. Arbitrary named rooms do not automatically acquire hosted AI. Hosting needs no local service or Codex task.

The `persistent-bots-v1` enabled flag, `persistent-bot-roster-v1` active roster, matchmaking identity, player records, world, round, chaos snapshot and deadlines persist in SQLite. Names refresh with each round; unchanged setup preserves surviving bots. Reset cleans old bot records/events and emits leave/join events so client nameplates update. The former production policy of reserving eleven AI slots is historical.

Disconnected humans retain their identity, stats, objective state and slot for
30 seconds. Their rats remain vulnerable and the match continues. Private reconnect
credentials/deadlines persist separately in `reconnect_sessions`; same-tab reloads
can resume through sessionStorage, and a bounded unreserved socket can recover an
existing slot even in a full room. Tokens never appear in public player data or URLs.
After the last reservation expires, the room removes its bots and sleeps; overflow
rooms also retire from the admission directory. The canonical room/world identity
remains. Empty rooms read 0/0. `/status` describes the
canonical room, not a total across overflow rooms. It counts
attached humans; temporarily disconnected reserved rats remain on the authoritative
scoreboard even though they are omitted from that status population count.

A 15-second Durable Object alarm restores occupied-room simulation after eviction and shares its schedule with earlier respawn/reset deadlines. It is set only while a human holds a seat; a failed alarm then tries a bounded future wake. This provides recovery, not a guarantee against platform outages. See [server operations](server-operations.md) for timing and storage details.

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

- `/health` checks routing/runtime only. `/status` should show the public room (`public-live-v3` after the move), its `colo` and plausible round state. An empty city reads 0 humans / 0 bots; a human's join brings 6–9 named bots. Empty overflow 0/0 remains healthy. Count must stay within ten. (Before 6 October, the live city listed 6–9 named rats with zero humans.)
- Fetch the root and referenced assets; check the old host redirects both root and a path/query.
- Confirm the deployed version from the deployment receipt and record its predecessor. Do not infer deployed source from Git alone.
- For sharing, root HTML must contain static Open Graph / Twitter metadata and an accessible `image/png` asset at `/share-action-v2.png`. The image is the approved 1731×909 generated promotional illustration, not a gameplay screenshot. Use a new versioned image URL when replacing it; third-party previews may remain cached.
- `node scripts/verify-idle-room.mjs` is the room-lifecycle check: it runs a local `wrangler dev` and proves an empty canonical room stays idle, a human brings bots and the tick, and the room stops and writes nothing after the last human leaves. For production, use a bounded passive observer with the current delivery decoder/ACKs to inspect default matchmaking, world identity, assignment snapshots and departure cleanup. Use a separate named room for combat protocol smoke; do not force public round resets or stress the public room.

## The public room

**Moved to `public-live-v3`: staging and production on 9 October** (production by the steps below: Chicago, 4,416,262 rows copied and compared identical; [release receipt](verification/chaos-evidence-release-2026-10-09.md)) (Tyler, 9 October: "figure out why the ping is so bad… fix it here, and then next time we deploy it'll be fixed"; he chose to move the room and copy its history). `public-live-v2` runs in Seattle (`/status` names the colo), and its Matchmaker is there too, while players enter Cloudflare in Kansas City (MCI). From Kansas City the Seattle room measured 56 ms minimum, 83 ms median, 225 ms p95 and 1.7 s p99, with about 140 late chaos frames in two minutes, all of them network delay rather than the server. Two causes:

- **Where the room lives.** A Durable Object stays where it was first reached; a location hint applies only at creation, so an existing room cannot move. Rooms first reached from Kansas City are created in Chicago (ORD) or Dallas (DFW); the `enam` hint also gave Atlanta, Miami and Newark, so the room takes no hint and is first reached from Kansas City.
- **The Matchmaker in the socket's path.** A WebSocket returned through a Durable Object keeps flowing through it. With the directory in Chicago and the room in Dallas, every frame went Kansas City → Chicago → Dallas and back. The Worker now joins the public room directly (`joinPublicCity` in `src/worker/index.ts`); the room reserves its own seats, as it always has. Only a full room (overflow, which needs ten humans since bots are kicked for humans) or a way back into an overflow room still asks the Matchmaker.

Staging after both (Dallas, direct): 17–27 ms minimum, 25–37 ms median, about 100 ms p95, under 200 ms p99, and 48–70 late frames in 90 s, all of them network delay. A bot-free Chicago room showed the same p95 from the same home connection, so the rest of the tail is that connection. Measure with `node scripts/probe-city-marks.mjs <base> --room=public-live-v3`.

**The release steps** (as followed for production on 9 October; reuse them for any future move):

1. Before deploying, snapshot the old room's history: `/api/heat/v1?days=all`, `/api/city/v1/places?days=all`, `/api/city/v1/flows?days=all`, and `/api/city/v1/events?limit=10000&since=0` (bearer `CITY_TOKEN`).
2. Deploy, then **reach the new room first from Kansas City** (Veelox or Halla): `curl https://ratdetective.online/status`. Its `colo` must be central (ORD or DFW). If someone else reached it first and it is far away, the name is spent: choose `public-live-v4` and deploy again.
3. Copy the history: `node scripts/copy-city.mjs https://ratdetective.online` (bearer `CITY_TOKEN`; resumable; staging copied 5.45 million rows in about 9 minutes, roughly 5 USD of SQLite writes). It copies the four per-key aggregate tables, the packs (with fresh ids) and the events (in their old order, below the new room's own).
4. Compare the snapshots with the same four reads on the new room: every aggregate read must be identical, and so must the first 10,000 events.

`public-live-v2` keeps its history and sleeps as a backup. Rolling back to code from before the move returns players to it, without the play recorded in v3. The R2 archive starts a `city/raw/v1/public-live-v3/` prefix; `scripts/city-mirror.mjs` reads every prefix, and `scripts/bot-gate.mjs` reads both rooms by default. Staging's diagnosis `/status?colo=<room>` and `/status?colo=matchmaker:<pool>` (deploy with `DIAG_LOCATION_ROOMS=1`) say where any room or directory runs.

## Recovery and rollback

Read status, logs and the appropriate diagnostics before changing services or state. Do not rename the public room, delete its data or recreate its namespace as a restart mechanism (the v3 move was for placement, with the history copied in; see [the public room](#the-public-room)). Individual bot/primary-case watchdogs already handle some stuck situations without resetting the match; see [current state](current-state.md).

A rollback changes code/assets, not arbitrary stored state. Review the prior version's compatibility with roster persistence, extra cases, incident IDs and protocol validators. Rolling back to pre-launch code also loses persistent hosted bots and the application redirect. Prefer a narrowly scoped forward fix when feasible.

The private `rat-detective-network-test` Worker is separate. Its last recorded restoration was `b959490c-28cc-4915-8765-64098bef4393`; verify before use. Stored persistent-bot flags may survive a rollback; code from before 3 October would then run its canonical room continuously again. Do not assume the private backend automatically matches production.

### Rolling back past packed aggregates

**Live since 6 October 15:19 UTC** (production `e99a51a7`, staging `993e377f`; [receipt](verification/data-cost-release-2026-10-06.md), [plan](plans/data-cost-2026-10.md)). Since then the city aggregates are written as packed rows in `city_packs` ([city map](city-map.md)). Releases from before it read only the per-key tables, so a plain rollback would hide every count recorded since the upgrade. Nothing would be deleted, and the counts would show again on rolling forward. On staging, the steps below were run against Cloudflare: rows mode, the every-room drain, a rollback to `c15dccc8` that read every count, and the roll forward. To roll back without hiding anything:

1. `CITY_AGGREGATES=rows npm run deploy:<env>` from the same commit, as an ordinary full deploy (never a gradual one, which leaves some rooms packing). The rooms restart and write per key again, and nothing new is packed.
2. Drain every room: `node scripts/unpack-city-aggregates.mjs --base <origin> --env <env> --output <receipt.json>`. Every GameRoom keeps its own aggregates, including overflow and private rooms and rooms the matchmaker has forgotten. The script lists every GameRoom object with storage through the Cloudflare API. For each one it calls `POST /api/city/v1/unpack?id=<object id>` (bearer `CITY_TOKEN`) until `left` is 0, then sweeps them all once more. Each call moves about 1 MB of packs into the per-key tables in one transaction, so a count is never in both places or in neither and the totals do not change. A 409 means the deploy is still in packs mode. The script exits non-zero if any room still holds a pack.
3. Roll back to the older version. It now reads every count.

`node scripts/verify-aggregate-rollback.mjs --old <checkout of the older release>` proves the sequence on one persisted local state, with two rooms (the canonical one and a private one) and both checkouts built. It runs: the old release plays; upgrade; play; rows mode, play, drain every room; the old release reads; roll forward. The canonical room's public aggregates and every room's stored totals must match at every step.

## Admin controls

Tyler's controls for the canonical room (protocol 29, clarity batch): end the round now with the current leader winning (the normal round end, results and lineup; the leader is counted dead or alive, mode progress then kills), choose the next round's mode, roll an incident now (a chosen one or the ordinary draw; no caller, so nobody gets the Dispatch supply) or end the one rolling or under way (Dispatch then cools down as usual), and send the case back to a fresh spot through the ordinary recovery. The admin's own rat gains nothing. Every command but `status` is recorded as an `admin` city fact ([city map](city-map.md)) and logged as `admin command` (command, source, outcome; never the key).

- **The key** is the Worker secret `ADMIN_TOKEN`, not in `wrangler.jsonc` or any committed file. Unset, every admin request is refused. Set it per environment with a long random value (agents do not set it):

  ```sh
  openssl rand -hex 32                                   # the key
  npx wrangler secret put ADMIN_TOKEN --env staging      # paste it when asked
  npx wrangler secret put ADMIN_TOKEN --env production
  ```

  Keep the same value in `~/.config/rat-detective/admin-token` (mode 600) for the CLI. Locally, `npx wrangler dev --var ADMIN_TOKEN:<key>`.
- **CLI:** `node scripts/admin.mjs [--base=https://ratdetective.online] status | end-round | next-mode <chain-of-custody|excessive-force|jurisdiction> | incident [<id>|end] | reset-case`. The key comes from `ADMIN_TOKEN` or the file above. Exit 0 when the command took effect, 1 when it did not (for example, no round in play) or the key was refused.
- **HTTP:** `GET /api/admin/v1/status`, `POST /api/admin/v1/{end-round,next-mode,incident,end-incident,reset-case}` with `Authorization: Bearer <key>` and a small JSON body (`{"mode":…}`, `{"incident":…}`); answers `{ok, message, status}` (409 when nothing changed, 401 without the right key). Always the canonical room (`public-live-v2`), never an overflow room. `src/worker/adminApi.ts`.
- **One-time browser setup without pasting:** open `https://ratdetective.online/#admin-key=<key>` once in the browser (on Veelox: `xdg-open "https://ratdetective.online/#admin-key=$(cat ~/.config/rat-detective/admin-token)"`). The fragment never reaches the server; the page saves the key and strips it from the address bar and history (`claimAdminKeyFromLink`). Tyler's Brave Origin on Veelox has the production key (2 October).
- **In game:** open `/?admin=1`, Settings → ADMIN, paste the key once and press Save key or Enter (pasting saves it too) (stored in that browser's `localStorage` as `rat-detective-admin-key`, never in the bundle). In a match, **F10** or **`** (backquote, for keyboards or browsers that take F10), or Settings → ADMIN → OPEN ADMIN PANEL, opens a small panel (Esc or F10 closes; it frees the mouse without the pause menu). The socket sends the key with its `admin` messages until the room answers with a status, then the room marks that socket admin; the key is never echoed. Ending the round takes a second press within 3 s. Socket commands act on the room that socket is in. At most 6 admin messages per 10 s per rat. Once a key is saved, the ADMIN section shows in Settings without `?admin=1`. The key is per site: paste it once on production and once on staging.

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

**6 October accepted aiming release:** production `1bdd31df-e7f3-47bb-bf23-fa1c537828ae`, build `production-2026-10-06-748340a`, client `index-OLrhffSa.js`; protocol 32 unchanged. Real GameSession shots use the composed rendered camera. Data-cost `2476135` and packed-aggregate rollback retained. HeavyCheese remains private-range-only. [Receipt](verification/aim-release-2026-10-06.md).

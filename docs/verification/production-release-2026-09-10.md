# Full production release — September 10, 2026

Tyler accepted the alley lighting and explicitly requested committing everything and publishing the complete game to the live domain. All existing Git-eligible work was committed; the thirteen preceding local commits were also pushed to the established `origin/master` upstream. Generated builds, private preview credentials and raw captures remain ignored.

## Release identity

| Item | Verified value |
| --- | --- |
| Live game | https://ratdetective.online/ |
| Application commit | `5c7d5d8576903303ee40a6cf0b0c40a4856e3329` |
| Worker / environment | `rat-detective-preview` / `production` |
| Deployed version | `e28b2d9c-0b7d-46a9-8195-24f1ce860939` |
| Previous production version | `e3a70ae3-246f-4712-94dc-a692495ac045` |
| Deployment | September 10, approximately 20:05 UTC; `npx wrangler deploy --env production` after the reviewed build |
| Protocol | 7 |
| Canonical room / world | `public-live-v2`, version 2, original seed `341283204` |
| Client JS | `index-DrJGrWDb.js`, 999,888 bytes |
| JS SHA-256 | `62ba5cb348d66c485dd2a99ff304a06ad526db3f9af0c5af2540051625e43c90` |
| Client CSS | `index-B0b65IPY.css` |

The GameRoom namespace and canonical room were preserved. The configured Matchmaker binding and migration provide admission to additional rooms. No public state was deleted or round forcibly reset. Reload an old open tab to obtain the protocol-7 client; the previous protocol is deliberately rejected.

## Included behavior

- Bounded whole-connection delivery, snapshot ACKs, shared encoding, lossless movement tuples, cleanup and bounded matchmaking from the network audit.
- Sixteen rats per stage. Occupied public rooms fill to eight total participants with server-owned AI; humans replace bots, vacancies refill after ten seconds, and empty rooms sleep. Overflow uses separate GameRooms. The private all-bot fixture remains distinct from public backfill policy.
- Dispatch Assignments, three personal Chain deliveries, revised incidents, eight ricocheting Tampering cases, no player credit for case-caused deaths, named paperwork jokes, three-second respawns, current cheese colors and held-Tab statistics.
- Accepted spatial sound fade and subsequent 50% gain lift, thirteen integrated foley cues, landscape mobile controls/HUD, title music with browser autoplay fallback, and creator/music credits with captured-cursor guards.
- Accepted dark street/interior pools and fixed window/door/sign spill with subtle ground and obstacle clarity. The final client is byte-identical to the lighting preview Tyler accepted; the release patches changed only development dependencies.

## Validation

After patching the development dependencies, typecheck, all **762 tests** (127 Worker, 610 client, 25 script), production build, visual build and dependency audit passed. Audit reports **zero vulnerabilities**. The existing roughly 1 MB JavaScript chunk advisory remains; it does not indicate a failed build.

The audit required Vitest **4.1.11** and a narrowly scoped Miniflare override to sharp **0.35.4**. These address the published [Vitest mocker advisory](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) and [sharp/libheif advisory](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c). The Cloudflare test harness and application runtime packages retain their versions.

GitHub's slower runner exposed two test-harness timing assumptions: the 44-concurrent-client placement test required every initial admission to finish within the intentional five-second deadline, and exhaustive launcher trajectories inherited Vitest's five-second CPU deadline. The placement helper now retries only recognized temporary admission responses, twice at most; queue and capacity assertions remain. The trajectory test retains every geometric assertion with a 30-second deadline. Focused checks pass. A clean checkout also exposed the hosted fixture tests' dependency on `dist`; CI now builds before testing so the fixtures copy real production assets. These changes do not modify deployed application code.

[CI run 34536094707](https://github.com/MayberryDT/rat-detective-online/actions/runs/34536094707) on tooling/test commit `3e53a3b` passed install, typecheck, production build, all tests, audit and isolated Worker WebSocket smoke. The existing browser-input smoke then failed with `fetch failed` while awaiting Chrome's local debugging endpoint, before the script opened the game tab; later visual CI steps were skipped. This browser-startup failure remains unresolved. The successful local visual build and earlier static-camera review are separate evidence, not a claim that this CI job passed. No additional local automated browser input was run.

Live verification at **22:04 UTC** checked:

- `/health` healthy; all **45 production files** exactly match local build bytes, including HTML, JS, CSS, music and foley.
- Both credit URLs and static Open Graph/Twitter metadata are present; the shared title image remains 1200×630. Old-host root and asset-with-query requests return the expected canonical **301** redirect.
- A default `/ws` observer used compact snapshots, movement tuples and current delivery ACKs. It joined the original room/world, saw **eight rats (seven bots and the observer)**, **208 valid snapshots**, **200 movement packets**, up to **171 balls**, an active **Chain of Custody** assignment, and **zero invalid packets/errors** over eight seconds. No movement or firing was sent by the public observer.
- After departure, the canonical room returned to **zero players / zero bots**, as expected for the new empty-room policy.
- A separate unique `smoke-*` room passed protocol-7 join, movement, shot, damage, death, score, three-second respawn and leave checks. It did not alter the public match.

Detailed local logs and the complete asset-hash receipt are under ignored `output/production-release-2026-09-10/`. These checks establish build/deployment/protocol readiness, not many-room capacity, phone performance or a long soak. No new local automated browser gameplay/input test was performed; human playtesting remains authoritative for feel.

## Recovery and history

Review protocol, assignment persistence and matchmaking compatibility before rolling back to the September 8 release. Code rollback does not undo arbitrary persisted state; prefer a narrow forward fix. Preserve `public-live-v2`, its world seed and existing namespaces.

Prior production identity was cross-checked against Wrangler deployment history and GBrain `brain:sessions/2026/09/rat-detective-sharing-round-rosters`. The existing local-main → origin/master convention is recorded in `brain:sessions/2026/09/rat-detective-art-release-2026-09-07`. Dated implementation receipts retain their original private/undeployed scope; this receipt records their subsequent full release.

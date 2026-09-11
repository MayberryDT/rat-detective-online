# Accepted steady lighting production release — September 10, 2026

Tyler accepted the full-game lighting preview and the stationary target practice, requested no further changes, and authorized publishing everything live.

The game is live at **https://ratdetective.online/** with steady streetlamp emission and scenery illumination, window beams aligned to actual lit panes and aimed downward, correctly mounted door transoms, pavement-only spill, and corrected sewer-light activation around grounded feet. Existing gameplay, physics, networking, light budgets and public-room identity are preserved. Implementation evidence is in the [dated lighting receipt](steady-fixture-lighting-2026-09-10.md).

| Release item | Value |
| --- | --- |
| Application commit | `420bee25e00fa2296903e54d9bbf15a890b52c7f` |
| Production Worker / environment | `rat-detective-preview` / `production` |
| New Worker version | `8cacdb60-2ee0-4f63-b8bb-9f02de321719` |
| Previous Worker version | `d5fc60bf-78a8-44e2-821b-f7c794233e68` |
| Protocol / capacity | 7 / 16 total rats per room |
| Canonical room / world | `public-live-v2` / version 2, seed 341283204 |
| Live verification | September 11, 00:57 UTC / September 10, 5:57 PM Pacific |

The source commit also includes the accepted [stationary target range](../hitbox-practice.md), tests and documentation. That page stays in the separate visual build at **http://127.0.0.1:5193/hitbox-practice.html**, rather than replacing or joining the public match. Its frozen local service and the full-game private relay were preserved.

## Checks

- Fresh typecheck, production build and **797 tests** pass: 129 Worker, 643 client and 25 scripts. Dependency audit reports **zero vulnerabilities**. Existing bundle-size advisories remain. The visual build and static views were verified during implementation; publication adds no visual-code changes.
- All **51 production files** match the approved full-game preview before deployment, and the live files match that same build afterward. This includes HTML, JS, CSS, sounds and sharing assets.
- `/health` is healthy. `/status` preserves `public-live-v2`, world 2 / seed 341283204, with zero players/bots while the room is empty. No round reset or public-room join was performed.
- Canonical sharing metadata, both creator/music credit links and the 1200×630 title image pass. The old hostname redirects root and asset path/query requests with HTTP 301 to the canonical hostname.
- No new automated gameplay/input, network load test or real-phone performance measurement was run. The user's acceptance supplies the manual appearance/playtest result; local test success does not certify hosted latency or capacity beyond the existing limits.

Entry asset: `index-ClzQcK4D.js` (8,569 bytes, SHA256 `0b3a95517f7d354e9b81f8d326cbcf966c7ff0d4881d487f8459238dc3790303`). Deferred game: `createGame-Ci5pt2sL.js` (953,473 bytes, SHA256 `8b5708bc2d153fc55e850213161b85486da9fce440348178326b00e8d7e1bbc8`). Detailed deployment and exact-asset verification records are under ignored `output/steady-lighting-production-2026-09-10/`.

Source follows the existing local `main` → `origin/master` convention. Prior production identity and release workflow were checked against GBrain `brain:sessions/2026/09/rat-detective-grounded-exterior-lighting-2026-09-10`. Preserve namespace migrations and persisted world identity during any rollback; the predecessor version is listed above.

# Heat map release — 28 September 2026 (29 September UTC)

Tyler authorized the deploy ("go ahead and put the heat map live"). It is a Worker-only change: protocol 22 and the client `index-BBYLGu_G.js` are unchanged.

| Item | Value |
| --- | --- |
| Worker | `rat-detective-preview`, environment `production` |
| Version | `7e1cfa2c-2f60-4d11-852c-8b150525457c` |
| Predecessor | `d05432f7-17b9-47f5-9d9b-973548da9e01` (same protocol and client; a safe rollback) |
| Commits | `260485c` heat map; `3e8dc95` bot refill fix |

## What changed

- **Heat map.** Every room counts where living, connected humans and bots spend each second during play, where rats die and where the killer stood. The counts go into 4-unit cells split by floor (sewer, street, upper, air). There is one row per UTC day, 30 days are kept, and no names or IDs are stored. `GET /api/heat/v1?days=1–30` serves the canonical city. `node scripts/heat-pull.mjs [days]` feeds the planning map at `output/city-map/city-map.html`. See [server operations](../server-operations.md).
- **Bot refill fix.** When a human left, the room refilled its bots from a fresh random roll, which could leave it short of the round's rolled count. It now fills from free roster slots up to the rolled count.

## Checks

- Tests written from failure modes before the code, covering:
  - bots counted as humans;
  - corpses and reserved disconnects piling up on one spot;
  - the victory display counted as play;
  - deaths and kills recorded at the wrong spot;
  - data lost or counted twice after the room is evicted;
  - UTC day rollover and pruning;
  - the storage cap;
  - tampered stored rows;
  - junk endpoint input.
- The cap test found that the limit counted grid squares, not stored entries, so storage could grow to up to four times the limit. Fixed before release.
- On Halla, all suites passed: worker 193, client 1237 and scripts 123. Typecheck was clean.
- Local `wrangler dev` end-to-end run: 7 bots for about 71 s gave 8.3 bot-minutes, 8 deaths and 8 kills, drawn correctly on the map.
- Production after the deploy:
  - `/status` showed the canonical city playing with 8 bots;
  - the site served `index-BBYLGu_G.js`;
  - `days=0` returned 400 and a non-GET request returned 405, both with `access-control-allow-origin: *`;
  - about 70 s after the deploy, `heat-pull` returned 8.9 bot-minutes, 9 deaths and 9 kills for 2026-09-29.

## Limits

- Up to one minute of unflushed samples is lost if a room is evicted between flushes.
- Heat only reflects play after this deploy; no earlier position data exists.
- A `HEAD` request returns 405, because only `GET` is served.

## Follow-up: permanent heat map and round-end layout (Worker `14d903be-b6d7-4f43-9e2b-959ad6854019`)

Tyler wanted the heat map permanent, with no script to run, and the end-of-round cards fixed ("not spaced out well or naturally", with the Case File running off the bottom of the screen). Deployed on his instruction. The protocol stays 22; the client is now `index-BqZFQ1Ko.js`.

- **Kept forever.** Counts now live in one SQL row per day, layer and cell (`heat_cells`), and new counts are added about once a minute. Nothing is pruned. The first release's per-day JSON rows are folded in once and their table dropped. On production, the rows recorded since the first deploy survived the migration: 3.7 bot-hours, 2 human-minutes, 247 deaths and 246 kills on 2026-09-29.
- **Any range.** `GET /api/heat/v1` accepts `days=1–3650` (default 7), `days=all`, or `from` and `to` (UTC days, inclusive). It returns the summed heat, the days in range and every recorded day.
- **Heat map page:** <https://ratdetective.online/heatmap>. It shows human players, bots, deaths or killer spots on any floor over the current city, drawn from the same layout code as the game. You can pick today, 7 days, 30 days, all time or exact dates. It shows totals, hover counts and switchable map layers, and refreshes every minute. `scripts/heat-pull.mjs` is removed. The brainstorm map (`output/city-map/city-map.html`) reads the live heat directly.
- **Round end.** The standings and the Case File are now one centred pair just under the winner banner, with equal heights, equal gaps and some breathing room below.
  - Cause of the old layout: the build's CSS minifier dropped `rotate:none` from the results rule, so the banner kept `rotate:0deg`. That made the banner the Case File's containing block, so the Case File was placed and sized against an 1100 px banner instead of the screen. The Case File now moves into the overlay for the results.
  - The award list fits the space: two columns for long lists, then smaller type, then three columns. It never runs off the screen.

Checks:
- New failure-mode tests for ranges, keeping data forever and migrating without loss or double counting. Halla: worker 196, client 1237, scripts 123, typecheck clean.
- A local `wrangler dev` run drew the page with about a minute of bot heat.
- Round-end captures with all 13 awards and long names at 1920×960, 1920×1080, 2560×1440, 1366×768 and 1280×720 show no overflow; the 6-award case was also checked at 1920×1080 and 1366×768.
- Production:
  - the site serves `index-BqZFQ1Ko.js`;
  - `/heatmap` returns 200 and draws the live data;
  - `days=all` returns the migrated counts;
  - a half range returns 400.

Limits:
- Screens narrower than 1100 px or shorter than 640 px keep their previous stacked results layout; phones remain Tyler's later check.
- The heat map page is public, like `/status`. It shows counts only.

## Follow-up: the city map recorder (Worker `00e3129e-6a33-40e0-acb8-f5810a251f60`, 2026-09-29)

Steps 1–3 of [the city map](../city-map.md) went live on Tyler's OK. The deploy is Worker only: the client stays `index-BqZFQ1Ko.js` and the protocol stays 22.

Staging first (`daf59c8a-1d99-4ae9-b7e9-57833bfd8786`):
- events, aggregates and the digest worked;
- an archive object was written to R2;
- `city-mirror.mjs` built `output/city/city.db`, and `read` queried it.

Production after the deploy:
- `/status` played normally with 8 bots, and `/heatmap` returned 200;
- the migration kept every earlier cell (10.0 bot-hours, 25 human-minutes, 711 deaths, 704 kills on 2026-09-29), and the new layers (`shots-bot`, `ball-*`, `spawns`) began filling within seconds;
- `/api/city/v1/events` returned 401 without the token, and with it returned round, case, Dispatch, damage, death, spawn and heal facts.

**Limit:** fire rate and place measures only count from this deploy. The earlier heat rows have presence and deaths but no shots.

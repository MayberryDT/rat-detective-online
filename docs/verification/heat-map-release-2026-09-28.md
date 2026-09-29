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

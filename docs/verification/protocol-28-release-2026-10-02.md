# Protocol 28: the playtest quick patch, 2 October 2026 (production)

Tyler, after the four-human playtest (the juice plan's [playtest section](../juice-plan.md#four-human-playtest-tyler-2026-10-01-evening)): "make that quick patch, and push it live. No need for testing."

## What is live

| Item | Value |
| --- | --- |
| Worker | `rat-detective-preview`, env `production`, version `ea258468-6c17-4831-9901-6208aaf401b6` (deployed 00:32 UTC) |
| Build | `production-2026-10-02-6668ade` |
| Client | `index-COP7Rh_L.js` |
| Commit | `6668ade`: `quick-patch` fast-forwarded to `main` and GitHub `master` |
| Protocol | 28 |
| World | **layout 7**; the room upgraded from layout 6 on load. Seed 341283204 kept |
| Bots | `mindVersion` 9 |
| Previous | `32902d92-a7c1-40f0-930a-d904573ced86`, [protocol 27](protocol-27-release-2026-10-01.md) |

This is era `playtest-patch` in `design/data/eras.json`; `arsenal` closes at the deploy.

## What changed

- **PAPER CHASE:** 5 deliveries to win.
- **Incidents:**
  - Planted Evidence and Bobbleheads removed. Stored ids map to Improper Disposal and Crossfire.
  - 40 s of quiet between incidents (was 21 s).
- **Drop-offs:** the Harbour Master (all of the Pier 9 warehouse) and the precinct house take deliveries anywhere in the building.
- **Laser:** fires like the cheese gun, does 1 damage (headshots still kill) and lasts 15 s.
- **Mousetrap:** holds a rat in place for 3 s instead of killing it. The rat can still turn and shoot. The trap still breaks after 8 balls or 3 lasers.
- **The case carrier, in every mode:** deals double damage, heals to full on any kill and fires heavier-looking balls.
- **Results screen:**
  - Each human stays until they press CONTINUE. The next round starts without them, and they join when they continue, after at most 3 minutes.
  - More stats, which scroll with the mouse and show detail on hover.
  - DOWNLOAD STATS saves the round as a file.
- **Smaller changes:**
  - a new Scattershot sound;
  - "You've been made" now adds "someone can see you through walls".

## Checks

Tyler asked for no testing. Only these were run:

- both typechecks;
- a staging smoke: `scripts/reconnect-check.mjs`.

The first staging smoke failed: stored layout 6 rooms were not on the upgrade list, so every client was told to reload. That was fixed (`PREVIOUS_GRAYBOX_VERSIONS` gains 6) and the smoke then passed all five checks.

On production after the deploy:

- `/health` gave `production-2026-10-02-6668ade`;
- the page serves `index-COP7Rh_L.js`;
- `/status` showed world version 7 with 6 bots playing;
- the old host redirects;
- the reconnect check passed all five checks (33 supply sites).

## Limits and risks

- **Full test suites not run.** Tests the agents updated have not been run either.
- **Not exercised live:** the CONTINUE flow and readers being held after a reset have not run with real players.
- **Not heard:** the new Scattershot sound.
- **Facts:** `CITY_SCHEMA_VERSION` was not bumped. The `trap` death cause is gone, and trap facts now record holds.

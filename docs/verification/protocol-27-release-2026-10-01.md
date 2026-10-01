# Protocol 27: the arsenal and the incident rework, 1 October 2026 (production)

Tyler, after playtesting staging: "This is all great. Let's push it live now. New release, baby."

## What is live

| Item | Value |
| --- | --- |
| Worker | `rat-detective-preview`, env `production`, version `32902d92-a7c1-40f0-930a-d904573ced86` (deployed about 21:46 UTC) |
| Build | `production-2026-10-01-ed43d51` |
| Client | `index-CARmV9g5.js` |
| Commit | `ed43d51`: `arsenal` fast-forwarded to `main` and GitHub `master` |
| Protocol | 27; open protocol-26 tabs are asked to reload |
| World | **layout 6** (33 supply sites), seed 341283204 kept |
| Bots | `mindVersion` 8. Jev vars and the `$25` daily cap unchanged |
| Previous | `a3b3d924-925f-47ac-a30e-5e5a93d46d33`, [protocol 26](protocol-26-release-2026-10-01.md) |
| Staging | `7c566d1f-6395-47c4-8a52-82c86da0c545`, build `staging-2026-10-01-011af0f`: the same code |

This is era `arsenal` in `design/data/eras.json`; `case-grip` closes at the deploy.

## What changed since protocol 26

- **Targets:** PAPER CHASE is 10 deliveries; Jurisdiction is 100 points, in zones of 20; Excessive Force stays at 10 case kills.
- **Excessive Force carrier:** deals double damage, heals to full on each case kill, and its balls look heavier.
- **Weapons:** one weapon is held at a time. There are six new sites, and all three weapons are in the reward draw.
  - **Tommy Gun:** hold to fire on a timer. Cheesy casings and puffs, and a sound blended from the cheese gun and a Thompson.
  - **Laser:** hitscan with two ricochets. 3 damage, and headshots kill. A gooey yellow-green cheese beam.
  - **Mousetrap:**
    - The gun goes away while you hold it.
    - For 1 s after you get it you can't shoot or set it, and a fresh press sets it.
    - A big one-shot trap that takes 8 balls or 3 lasers to break.
- **Incidents removed:** Rat Race, Delayed Reaction and Clean Bill.
- **Incidents changed:**
  - **Code Violation** replaces Malpractice:
    - it never kills;
    - supplies come out as bad versions, except Quick Fix, which is only harder to catch;
    - machines and pillars throw rats safely.
  - **Bad Ammunition:** each ball has a personality.
  - **Scattershot:** hits shove rats.
  - **Most Wanted:** follows the leader and pays a random supply.
  - **All Units:** told with a radio banner, a backup strobe and a YOU'RE BACKUP card.
- **Incidents added:** **Bobbleheads** and **Cheddar Shower** (cheese meteors).
- **Recording:**
  - New facts: `trap`, `meteor`, `malfunction` (with `what: 'faulty'` for bad versions), `shove` and `bounty`.
  - Shot, damage and death facts now record the weapon.

## Checks

On Halla at `011af0f` (code identical to `ed43d51`, which adds only docs):

- both typechecks passed;
- the worker suite passed 249 of 249;
- the client suite passed 1,573 of 1,573;
- the script tests passed 133 of 133;
- the build passed.

An independent review found five defects before the playtest; all were fixed. Tyler playtested staging and gave feedback that is in this build: the cheesy laser and Tommy, the shake trims, the bigger trap, the pickup lockout, no Code Violation deaths, and the Cheddar Shower name.

On production after the deploy:

- `/health` gave `production-2026-10-01-ed43d51`;
- the page serves `index-CARmV9g5.js`;
- `/status` showed `public-live-v2`, world version 6, 8 bots playing;
- the old host redirects with its path and query;
- `scripts/reconnect-check.mjs` passed all five checks (33 supply sites before and after).

## Limits and risks

- **Rollback:** going back to `a3b3d924` returns protocol 26 and layout 5. The room's world version stays 6, so check the layout upgrade path before any rollback.
- **Not listened to by an agent:** the new sounds.
- **Not seen in a live match:**
  - the trap SNAP on a victim;
  - the results board at a 100-point Jurisdiction.
- **Round lengths at the new targets are predictions:** see the era.

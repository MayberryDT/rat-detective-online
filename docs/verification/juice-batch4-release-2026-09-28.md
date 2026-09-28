# Fourth juice batch production release — 28 September 2026

Tyler playtested the private preview ("looks good, push it live").

## Release

- **Worker** `be7ac8ba-2529-42ba-865a-27aafe11131e` on `rat-detective-preview`, environment `production`, <https://ratdetective.online/>. Predecessor `80901b67-6900-4148-9aa3-2ed964052acd`.
- **Protocol 20** (was 19): client and Worker must match; older tabs are told to reload.
- **Client** `index-CM2YRmg7.js` / `createGame-ycSWg_UI.js`, source commit `f28053a` on `main` (also `polish/feel`), pushed to `origin/master`.

## What shipped

- **The Hunch.** At 5 HP you see rats within 40 units through walls as a boiling pencil sketch (hidden parts only) with a faint pencil tail; the first hit ends it. Your own nameplate shows a small plain eye beside gold pips while you hold it. Making someone: shutter, photo corners, `MADE: NAME`. Being made: YOU'VE BEEN MADE, violin sting, an edge eye toward the watcher.
- **Supplies.** 14 sites with reasons (5 Ironclad, one hard trip per landmark; 4 Hot Pursuit at sprint starts; 5 Quick Fix in alleys). Noir props under work lamps (iron-plated trench coat on a dummy, doctor's bag, winged wingtips on a shoeshine box); fog-free, with a far beam and an outline in the supply's colour; claim pop and restock drop with sounds; claim-card stamps.
- **Incidents** (13 in rotation). Ricochet Racket and Popcorn Panic retired (stored rooms map them to Scattershot). Bad Ammunition: 12% jams, 20% harmless duds, otherwise the 1–3 crooked balls (70/20/10, .12–.24 rad) with coughs, smoke, backfire soot and wobble. New: Blackout, Clean Bill, Malpractice, Most Wanted, Rat Race, All Units.
- **Round end is 15 s:** CASE CLOSED card, then the police lineup with a winner banner, then a results board (full standings plus a large Case File).

## Checks

- Typecheck and build pass. Client suite 1204/1205 and Worker suite 174/175; the failures are the known full-suite-only flakes (`neighborhood` spawns, `persistentBots` ten-rat cap), which pass alone. Scripts 123/123.
- An independent review found two release blockers (clients rejected the new heal causes and the Rat Race/dud launch speeds); fixed before release with a wire regression test.
- After deploy: `/health` ok; `/status` `public-live-v2` playing with 7 bots; root HTML and all 58 other files match `dist`; the old host redirects (301).
- A 6 s default-matchmaking join got a protocol-20 welcome (7 bots plus the client, Excessive Force active); the room returned to 7 bots afterwards.

## Limits

- Visuals were checked in the feel workshop and one hosted preview playtest by Tyler; phones were not checked.
- Rollback to `80901b67…` needs care: protocol 19 clients, and stored rooms may hold protocol-20 incidents (`blackout` and others) or `dispatch.wanted` that the old validator rejects.

# Seventh juice batch, title and load-time release — 28 September 2026

Tyler reviewed the private preview and said: "push it live and make note of the city improvements when we do the city overhaul".

## Release

- **Worker** `d05432f7-17b9-47f5-9d9b-973548da9e01` on `rat-detective-preview`, environment `production`, <https://ratdetective.online/>. Predecessor `a9947e28-19c3-441f-8acf-dd1695ab25b4`.
- **Protocol 22** (was 21): client and Worker must match; older tabs are told to reload.
- **Client** `index-BBYLGu_G.js` / `createGame-CTaM3s-B.js`. Branch `juice/ui-dispatch-ragdoll` fast-forwarded into `main` and pushed to `origin/master` at `8606666`, then this receipt.

## What shipped

- **Seventh batch:** ragdoll bodies (R1–R5), the nine Dispatch alarm pillars (bell from any side, 21 s LINE BUSY, caller reward, DISPATCHER award, bot detours), the UI motion kit and the Carbon scrawl HUD (U1–U9), and the faster round end (5 s card and lineup, then a 10 s results board). See [the review guide](../juice/review.md#seventh-batch-ui-dispatch-and-ragdolls-protocol-22).
- **Title:** the rendered evidence-wall office with Tyler's logo. It adds a pointer lean and a slow breathing push-in, plus rain, neon, lightning and a police car's red and blue lights. There is also a moth at the lamp, a rat's shadow crossing the wall, steam and smoke, and a desk phone that rings and answers with a squeaky rat (new `phone-answer` foley). Names are typed on the card one word per line, and the settings window has been polished.
- **Load time:** see the load-time pass under T1 in [the juice plan](../juice-plan.md). Changes:
  - no freezes during warm-up: a non-blocking GPU fence runs before any program is queried, at warm-up and after the welcome;
  - rat programs are issued before the city builds;
  - launchers, pillars and cheese are warmed before entry;
  - the cameo warm-up draws on the canvas;
  - a faster street-spill bake with identical output;
  - Outfit and Bangers are self-hosted as WOFF2, and the CSP drops Google Fonts;
  - the title effects start after the first paint;
  - fingerprinted `/assets/*` are served as immutable.

## Checks

**Before deploy**

- The typecheck and build pass.
- Client suite: 1237/1237.
- Worker suite: 177/177 in the final full run. Earlier full runs on a loaded Halla had timing failures in `matchmaking` and `persistentBots`.
- Scripts: 123/123.
- The new Worker test covers immutable caching for chunks, but not for the page, public files or the single-page fallback for a missing chunk.

**After deploy**

- `/health` returned ok.
- `/status` showed `public-live-v2` playing with 7 bots, before and after the smoke join.
- The root HTML references `index-BBYLGu_G.js` and no Google Fonts.
- Asset caching:
  - `createGame-CTaM3s-B.js` returned `cache-control: public, max-age=31536000, immutable` with brotli.
  - A missing chunk returned the HTML fallback with `max-age=0, must-revalidate`.
- The CSP shows `font-src 'self'`, and `/title/office.webp` is served as `image/webp`.
- The old host redirects (301).
- An 8 s default-matchmaking join got a protocol-22 welcome (7 bots plus the client, Excessive Force active), 234 chaos frames and ordinary play (one death, maximum HP 5).
- A muted headless screenshot of the live title shows the office, logo, name card, ENTER CITY and effects.

## Tyler's playtest (2026-09-28)

Tyler played the live release thoroughly and listened to every sound, including the pillars and the phone: "It's fine." He marked it complete. Phones are a last, low-priority check for later; nobody plays on a phone yet.

## Limits

- Load times were measured on Veelox in headless Chrome, which uses the Intel integrated GPU, through a local relay. They were not measured on production or on phones.
- Portrait layout and real phones are unchecked (deferred by Tyler, see above).
- Rollback to `a9947e28…` needs protocol 21 clients. Stored rooms may hold protocol-22 Dispatch state that the old validator rejects [INFERENCE: not tested].

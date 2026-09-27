# Juice release (feel layer, noir, third batch) — 27 September 2026

**Status:** deployed to production and pushed to GitHub on Tyler's OK ("push what we have live. This is a good checkpoint").

## What shipped

Everything on `polish/feel`, fast-forwarded into `main` at commit `efcce3e`:

- The juice feel layer (items 1–19), the noir pass (N0–N9) and the third batch (T1–T5). See the [juice plan](../juice-plan.md) and the [review guide](../juice/review.md).
- **Protocol 19.** 5 HP; body hits deal 1; a headshot always kills. A Crossfire bank shot and a fast case missile deal the full 5. `playerDied` may carry `headshot`.
- **Round end:** 10 seconds (`WIN_DISPLAY_MS`), seven new Case File awards and a server-ranked police lineup (`gameWon.lineup`).
- The server CPU commits `dd5aabb`/`3ffdd8b`, already live since the morning, were pushed with it.

## Release

- **Worker:** `rat-detective-preview`, environment `production`, version **`527eb4bd-30c9-4fef-a85e-de0944bf392d`**, deployed with `npx wrangler deploy --env production` after the build. Predecessor `360dbcdd-231f-4d83-aaec-6247022a1a46` (protocol 18).
- **Client:** `index-BnDXq6cB.js` / `createGame-C0yvREbG.js`.
- **GitHub:** `origin/master` `918ed23..efcce3e`.
- **Rollback:** the predecessor is protocol 18 with a 3 HP limit. Rats stored with 4–5 HP exceed that limit, so review stored state before rolling back. Prefer a forward fix.

## Checks

- **Before deploy** (Halla): typecheck and build pass; `npm audit --omit=dev` finds 0 vulnerabilities. Client 1,192/1,193 (the known `neighborhood.test.ts` full-suite timeout), Worker 173/175 (the known `persistentBots` "ten-rat cap" flakes, which pass alone), scripts 123/123.
- **Independent review:** 9 findings on the third batch, all fixed; re-review clean.
- **Live service:** `/health` ok. `/status` showed `public-live-v2`, world version 2, seed 341283204, playing, 7 players / 7 bots. The root HTML and all 58 other built files match `dist` byte for byte. The old host returns 301 to `https://ratdetective.online/x?y=1`.
- **Live protocol:** one scripted client joined through default matchmaking for 8 s. The welcome was protocol 19 with 7 bots plus the client (no bot kicked), Excessive Force active. It saw chaos frames, a bot death and respawns at 5 HP. After it left, `/status` returned to 7 bots.

## Limits

- Tyler's playtest: T2 accepted; T1 and T4 felt better; T3 enemy readability is still too low; the T5 lineup was not reached. He felt a performance hit, possibly from other load on his PC; an optimization overhaul is planned.
- The lineup was verified live on the private fixture, not in production.
- Open game tabs on protocol 18 must reload.

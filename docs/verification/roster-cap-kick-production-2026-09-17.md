# 6-9 roster and 1.5s cheese balls — production deploy, September 17, 2026

Tyler authorized **deploy it live**. Published the dirty working tree to
https://ratdetective.online/. No GitHub operations, commits, pushes, tags,
releases or Omarchy plugin publishing were performed. `public-live-v2` was not
renamed or recreated.

## Required contract

- Each round rolls **6–9** server bots. Overlapping bots keep names; only
  newcomers are renamed.
- Humans join on top of that roster until the ten-rat cap. A bot is kicked
  only when the room is already at ten. Kicked bots can return after a human
  leaves, targeting `min(roundBotCount, 10 - humans)`.
- Canonical `public-live-v2` stays alive with **six to nine named bots and
  zero humans**. Overflow rooms still sleep and leave the directory.
- Ordinary cheese balls last **1.5 seconds**. Speed 175, gravity −25 and
  restitution 0.9 are unchanged.
- Protocol remains **18**. Matching client and Worker are required.

## Local checks

Full suite passed before deploy: **174 Worker**, **1158 client**, **76
script** tests. Typecheck and production build passed. Existing large-chunk
advisory unchanged.

## Production deploy

| Item | Value |
| --- | --- |
| Worker | `rat-detective-preview`, environment `production` |
| Version | `25c973c4-7dd9-4c52-bc35-9eac87d1979f` |
| Predecessor | `0965112e-c50d-4075-86f7-decd93738f19` |
| Protocol | 18, combined bots |
| Client | `index-CtA1HGSO.js` |
| Room / world | `public-live-v2`, version 2, seed **341283204** |
| Authorization | User: deploy it live |

Wrangler uploaded **5** new or modified static assets (`index.html`,
`index-CtA1HGSO.js`, `createGame-cln8fxn5.js`, `NetworkManager-DLrV70Fq.js`,
`prepareGame-B-F6se5h.js`) and kept 53 already uploaded. Evidence:
`output/roster-production-2026-09-17/`.

## Live HTTP check

After deploy, `/health` was healthy. `/status` kept `public-live-v2`, world
version 2, seed 341283204, **8 players / 8 bots**, phase playing. The live
round already had eight named rats, which is inside 6–9; this deploy did not
force a round reset. Companion `GET /api/companion/v1/status` showed
**0 humans / 8 players**, assignment **PAPER CHASE**, revision
**153640 → 153665** over about 20 seconds, with changing K/D and objective
totals. Root HTML matched `dist/index.html` and referenced
`index-CtA1HGSO.js`. 57 hashed `dist` files matched live bytes; `/index.html`
returns 307 to `/`. Old host redirected root and path/query to
https://ratdetective.online/. No public-room join, forced reset, browser
gameplay input, Git commit or plugin publish.

Predecessor `0965112e-c50d-4075-86f7-decd93738f19` remains the protocol-18
rollback that restores the eight-participant yield policy and 2.5-second
balls. Prefer a scoped forward fix.

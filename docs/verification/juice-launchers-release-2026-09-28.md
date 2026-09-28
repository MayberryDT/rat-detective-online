# Fifth and sixth juice batches production release — 28 September 2026

Tyler playtested the private preview and said to push it live ("This is a good checkpoint… commit everything, and push it live").

## Release

- **Worker** `a9947e28-19c3-441f-8acf-dd1695ab25b4` on `rat-detective-preview`, environment `production`, <https://ratdetective.online/>. Predecessor `48fb6913-82c5-443c-8794-6c03c91a7800`.
- **Protocol 21** (was 20): client and Worker must match; older tabs are told to reload.
- **Client** `index-BaXSTxLx.js` / `createGame-DgyKh_2W.js`. Branches `juice/launch-ragdoll` and `juice/launch-machines` fast-forwarded into `main` and pushed to `origin/master`.

## What shipped

- **Fifth batch:** launch profiles per machine with drift and overpressure misfires, the tell, everything on a pad flies, landing shockwaves and chains, the launch moment, flight and landing juice; floppy ragdoll limbs, deaths by cause, bodies at rest; the living model (face, tail, hat wobble, flinch, personality extras). See [the review guide](../juice/review.md#fifth-batch-launchers-ragdolls-and-the-living-model-protocol-21).
- **Sixth batch:** six rebuilt launcher machines with large plain red triggers on the machines; pressure (10 s of one rat standing fills it, each counted ball adds 1 s, never leaks, 0.5 s hang, 1 s cooldown); four build-up stages; Pressure Surge (street launchers, suction, self-filling machines, finale blowout) and its look; the layered launch blast; trigger-hit juice (punch, rock, needle jump, steam, chips, pressure-pitched clank, nearby view thump). See [the review guide](../juice/review.md#sixth-batch-launcher-machines-pressure-triggers-and-pressure-surge-protocol-21).

## Checks

- Typecheck and build pass. Client suite 1223/1224 and Worker suite 175/176 in the full run on a loaded Halla; the two failures (`aiLiveDiagnostic` eleven-rat pursuit, `matchmaking` unreserved title connection) pass alone. Scripts 123/123.
- After deploy: `/health` ok; `/status` `public-live-v2` playing with 9 bots; root HTML references `index-BaXSTxLx.js`; the old host redirects (301). An 8 s default-matchmaking join got a protocol-21 welcome (9 bots plus the client, Jurisdiction active) and ordinary play (shot, died by headshot, respawned); the room returned to 9 bots afterwards.

## Limits

- Visuals were checked in the feel workshop and Tyler's hosted preview playtests; phones were not checked. The trigger-hit sound was not heard by an agent.
- Rollback to `48fb6913…` needs care: protocol 20 clients, and stored rooms may hold the new `pressure` chaos state [INFERENCE: not tested against the old validator].

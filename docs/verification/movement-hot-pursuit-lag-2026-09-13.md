# Movement and Hot Pursuit lag correction — September 13, 2026

Status: deployed to https://ratdetective.online/.
Production Worker: **`e1ecb3ed-1853-480d-89f0-81817d0c238b`**, protocol 15.
Previous Worker: **`b601b744-da80-431e-a9c0-1522029f5448`**.

## Report and finding

Tyler reported serious movement-linked lag after the security release, especially
when a rat collected Hot Pursuit. The first security implementation had already
proved that a second network collision controller could reject valid character
motion. Its narrower replacement still synchronously ray-tested every accepted
pose against the full authored city even though human and hosted-bot Cannon physics
already resolve that collision.

A bounded 20-second pre-fix production observer joined the canonical room without
gameplay input. It saw the normal eight-rat population, 2,608 movement messages,
295 shots and 294 snapshots with Hot Pursuit active. It saw no bot correction
broadcasts, ruling out a managed-bot correction storm, but confirming that all
high-frequency hosted movement still paid the duplicate path-query cost. Longer
boosted pose segments also remained more likely to disagree with the client
controller at corners and landings.

## Correction and retained authority

`GameRoom` no longer calls a static-city ray for each 20 Hz pose, and the unused
`ChaosSimulation.movementPathClear` path was removed. The change does not alter
Hot Pursuit tuning, character physics, launch steering, bot navigation, firing,
pickup ownership or the Excessive Force roulette card.

The authority still enforces:

- monotonically increasing movement sequences;
- finite world bounds of ±2,000 horizontally and -8 through 250 vertically;
- at most 35 horizontal units/second plus two units of delivery slack;
- at most 110 vertical units/second plus six units of delivery slack;
- a bounded two-second elapsed-time allowance and existing message rate limits.

The 35-unit envelope explicitly covers the shipped 18-unit walk speed multiplied
by Hot Pursuit's 1.45× boost. A malicious client inside that envelope is no longer
checked for wall crossing by a second server ray. Rat Detective is a comedy game,
not a competitive anti-cheat system; playability and one consistent collision
controller take precedence over that partial check.

## Verification

- Focused Worker movement tests pass, including full-speed Hot Pursuit displacement,
  real teleport-speed rejection and acceptance without a second collision controller.
- `npm run typecheck`: passed.
- `npm test`: 19 Worker files / 146 tests, 114 client files / 878 tests and 29
  script tests — **1,053 passing**.
- `npm run build`: passed; the existing bundle-size advisory remains non-fatal.
- Wrangler uploaded four changed assets, reused 52 and deployed the existing
  Durable Object bindings, rate limiter and custom domains.
- `/health` and `/status` returned healthy after deployment; the canonical room,
  world seed 341283204 and world version 2 remained unchanged.
- The live root and its referenced JS/CSS hashes matched the local production build.
- A bounded 15-second post-deploy observer decoded the normal eight-rat population,
  384 chaos snapshots, 1,877 movement messages and 211 shots. Hot Pursuit was
  active in 289 snapshots, with zero correction broadcasts.

No automated pointer-lock or gameplay input was used. The network and release
checks establish the deployed code and protocol behavior, not subjective human
movement feel; Tyler's playtest remains the acceptance check.

Prior navigation context was checked in
`brain:sessions/2026/09/rat-detective-bot-navigation-regression`; the correction
preserves its shared bounded planning and 20 Hz hosted movement behavior.

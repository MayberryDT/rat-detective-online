# Pickups and Planted Evidence — implementation and checks

**Date:** 2026-09-11
**Scope:** Three timed pickups (Ironclad Alibi, Hot Pursuit, Quick Fix) and replacing
the shipped Evidence Tampering incident with Planted Evidence, with the retired
missile incident kept behind an opt-in room mode.
**Status:** Release candidate verified September 11. Commit and production release
are authorized; deployment details will be recorded below. No human acceptance
of pickup feel is claimed.

> Counterfeit count: **10**, confirmed by Tyler. Fake cases are additional to the
> genuine Hot Case and never counted as objective cases.

## What shipped in source

### Pickups (new system)

`src/shared/pickups.ts` holds the kinds, tuning, copy and authored anchors.
`ChaosSimulation` resolves each anchor against the world's verified-clear street
points (`worldSpawnPoints`), so a seeded city cannot bury a pickup in a wall, and
owns spawning, atomic claiming and effect timers.

| Pickup | Effect | Release values |
| --- | --- | --- |
| Ironclad Alibi | Cheese balls reflect off the rat; the carried case stays shootable | 12 s |
| Hot Pursuit | Movement-speed burst; no trail, no extra attack | 1.45×, 10 s |
| Quick Fix | Instant heal to normal HP; waits at full health | instant |

- Six sites, two per kind, spread across the city. A claimed site returns after
  20 s, so the route choice stays meaningful instead of running out.
- Claiming is atomic inside the single authoritative loop; a contested site goes
  to exactly one rat. Effects refresh to full duration and never stack.
- Effects clear on death and on match reset. They do not persist across a room
  restart. Quick Fix never overheals, resurrects or grants immunity.
- The snapshot carries only currently-available sites (`pickups`) and only active
  effects (`buffs`), both validated in `messageValidation`.

### Ironclad reflection

A shot whose ray lands on a protected rat is reflected with the original shooter
and finite budget instead of being consumed. It is a rat contact, never a wall
bounce, so wall-only incidents keep their meaning. Local shot prediction reads the
broadcast buff and reflects on the first draw, so the visible ball matches the
authority rather than being corrected afterwards.

### Planted Evidence

`planted-evidence` is a new incident id. The shipped roster retires
`evidence-tampering`; the classic mode restores it.

| Property | Genuine case | Counterfeit |
| --- | --- | --- |
| Outline | Existing through-wall beacon | Depth-tested occluded outline only |
| Label | HOT CASE | None |
| Objective | The one objective | Never tracked, never equipped |
| Shot | Existing reflect/kick | One detonation into attributed cheese balls |
| Contact | Normal pickup | Lethal trap for the rat that steps in |

- Ten fakes per incident, placed on validated spawns at least 12 units from any
  living rat so nobody can die to a spawn-on-contact. Survivors are removed
  quietly at expiry; there is no parting mass detonation.
- The genuine case, its holder, and all three assignments stay live. The old
  objective-suspension hooks are not reachable in the new incident.
- The contact trap is a neutral world hazard: it kills the collector even through
  Ironclad Alibi, because the coat reflects cheese-ball contacts rather than
  granting blanket immunity. Emitted balls still reflect off protected rats.
- Server-owned bots exclude counterfeits from their objective list and steer
  around any trap their projected step would enter. Bots may still be caught by a
  trap they did not see, but they do not walk into one on loop.

### Classic toggle

`?incidents=classic` on a private `graybox-practice-*` room restores the retired
Evidence Tampering behavior and its objective suspension. The default roster
ships Planted Evidence. The room config is persisted and the active roster is sent
in the welcome message so the roulette strip matches.

## Validation performed

- Focused tests: `test/client/pickupSystem.test.ts` (9) and
  `test/client/plantedEvidence.test.ts` (8) cover placement, atomic claims,
  refresh/expiry/death/reset, heal-at-full, validation round-trips, Ironclad
  reflection and case independence, the 10-counterfeit batch, shot detonation
  attribution, lethal contact through Ironclad, cleanup, the classic toggle and
  bot non-targeting.
- Final full suite: **881 tests pass** (726 client, 130 Worker, 25 script),
  `npm run typecheck`, `npm run build`, and `npm run audit` pass with zero
  vulnerabilities. The existing large-chunk build warning remains.
- Two existing tests were updated rather than deleted: the Dispatch roster test is
  now mode-aware, and the client session fixtures gained the new stubs.

## Not verified

- No human playtest of pickup feel, coat readability, trap fairness, speed
  handling or the incident's in-match tempo.
- No multi-human match, real-phone run, or controlled FPS measurement. The
  separate two-client protocol probe below is synthetic, not a human playtest.
- Bot trap avoidance is a local steering nudge, not a routed hazard field; a bot
  that is surprised at close range can still touch a counterfeit.
- Pickup claim UI is an owner toast plus a persistent effect chip; there is no
  world-space floating label.

## Remaining decisions

- The counterfeits share the briefcase silhouette by design; if players cannot
  tell the real case from a rushed glance, the fake sheen may need to be stronger.
- Retain Hot Pursuit at 1.45× for 10 s and Ironclad at 12 s for this release.
  Both expire before a single site re-arms at 20 s; effects refresh rather than
  stack. These are agent-reviewed release values, not human-approved feel.


## September 11 continuation: tuning and release corrections

- **Ten traps per incident, not a refilling population.** Previously the shared
  step recreated every detonated ID immediately, and restoration recreated
  consumed traps. A batch is now seeded once per Dispatch serial; restart restores
  only surviving IDs. Restored traps remain static. Regression coverage advances
  beyond the detonation frame and restores the resulting snapshot.
- **Burst tuning:** nine balls, speed 96, spread .7; the base upward component
  falls from 1 to **.2**, retaining the .18 minimum lift. This makes a low radial
  fan instead of sending the entire burst above nearby rats. A real swept-hit
  test verifies damage to a rat three units away and the initiating shooter's
  attribution. Ordinary ball speed, gravity, bounce, lifetime and no-self-damage
  protections are unchanged. Burst balls yield pool capacity to trigger pulls.
- Browser URLs now forward `incidents` and `incident` to the Worker, preserving
  explicit transport settings. The original preview silently ignored both flags;
  the browser review reproduced Scattershot under a Planted Evidence URL.
- Hot Pursuit now scales movement in the shared bot brain, so both production and
  practice bots benefit from what they collect. Jump and attack behavior remain
  unchanged. The documented visible-only trap steering now checks line of sight.
- Tyler requested **muted agent playtests**. Loopback-only `mute=1` silences title
  music and keeps the shared gameplay AudioContext suspended through input and
  incident callbacks. Public audio defaults are unchanged. See `AGENTS.md` and
  [tooling](../tooling.md); every further browser run used this flag.

## What was actually exercised

Browser review at `http://127.0.0.1:5190` used the in-app browser and then Brave
for pointer capture. Entering a twelve-participant practice room, forward
movement, the live Dispatch HUD, a labeled genuine case being carried during
Planted Evidence, a visible unlabeled counterfeit, and the count falling from
ten to seven were observed. The classic comparison showed Evidence Tampering,
“8 CASES ARE MISSILES,” “PICKUP SUSPENDED,” and assignment progress paused.
This is bounded agent browser review, not comprehensive human acceptance of
steering, aiming, coat readability or trap fairness. Pickup duration and movement
claims rely on focused tests and the protocol probe, not a subjective play report.

The local watch runtime lost its asset manifest after incremental rebuilding;
restarting only the port-5190 preview restored it. A browser run also observed
1013 reconnects. These were not diagnosed as a production regression, and this
receipt makes no network-smoothness or FPS claim. No public room was reset.

A two-client synthetic probe used a fresh private room against the **actual local
Worker**, with the current decoder and delivery acknowledgements. It verified:

- Six available sites; Quick Fix remains available at full health, then heals
  actual shot damage back to three HP.
- Ironclad and Hot Pursuit claims with 12,000/10,000 ms authoritative deadlines.
- A shot at Dispatch activates the pinned Planted Evidence incident, creates ten
  traps and leaves the objective unsuspended.
- Contact kills a protected rat with neutral credit; nine traps remain after
  subsequent ticks. Shooting another leaves eight, without replenishment.

Probe result: `output/pickups-release-2026-09-11/live-probe.json` (local supporting
artifact, not required setup). All probe sockets closed afterward.

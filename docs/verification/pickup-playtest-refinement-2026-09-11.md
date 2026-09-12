# Pickup playtest refinement — September 11, 2026

**Later release status:** Tyler accepted r8 and authorized production release.
Application `8cd0ec2`, Worker `3398a69c-146b-4d99-aa47-e3734664c086`, protocol 14.
See the [production receipt](pickup-reconnect-production-2026-09-11.md).
The private/review-pending statements below describe the original verification pass.

The subsequent [rewards and feedback pass](pickup-rewards-feedback-2026-09-11.md)
records Tyler’s acceptance of Hot Pursuit and better case collection, plus the
requested changes that supersede this six-site layout and protocol-10 preview.

## Status and authorization

Tyler's first human playtest rejected slow entry, generic pickup primitives,
missing buff visuals, a separately styled pickup HUD, the small Planted Evidence
burst, stationary browser-preview bots and awkward genuine-case collection.
After brainstorming he approved the implementation below and provisional site
placement, with another human playtest to follow. **Working tree/private preview
only. No new commit or production release.** Do not revert the preceding release.
Production remains application `aaa8750`, Worker
`d6d1b1e3-9406-4df6-a3f5-04132652e3c1`, protocol 10.

“Power-ups” and “pickups” are interchangeable. Human playtests remain audible.
Only agent browser tests use `mute=1`; no browser/system audio setting is changed.

## Implemented behavior

- **Ironclad Alibi:** the entire rat becomes shiny metallic silver for its existing
  12 seconds. A shared static 128×64 reflection texture gives the metal readable
  highlights in dark streets, without scene captures or added lights/shadows.
  Local and rigid-batched remote materials restore their original color, emissive,
  roughness, metalness and environment settings after expiry, death or reset.
- **Hot Pursuit:** the existing 1.45× / 10-second boost has a brighter, wider red
  outline and exaggerated crossed-ribbon trail. Both depth-test against scenery;
  neither reveals a rat through walls. The trail has at most 32 samples and a
  450 ms tail, clears on discontinuities/death/reset and creates no per-frame meshes.
  This supersedes the prior “no trail” direction. No camera or attack change.
- **Quick Fix:** the medical tin heals to normal full HP, with the short green flash
  plus a 700 ms luminous wave rising from the feet over the rat. It remains
  unclaimed at full health; no overheal, immunity or resurrection.
- **World props:** plated trenchcoat, red detective shoes, medical tin with bandage
  emblem. A low pavement supply tray replaces the floating geometric ring. Shared
  materials and rigid batching keep the small authored models bounded.
- **HUD:** existing Bangers/Outfit lettering, charcoal paper, parchment ink and
  irregular slip edges replace the standalone monospace chips and framed toast.
- **Planted Evidence:** shot/contact detonation calls the actual shared Improper
  Disposal burst routine: 120 balls, identical velocities/radii/ball lifetime and
  sound. Existing 256-ball capacity, initiating ownership, finite single detonation,
  fresh trigger-pull priority and neutral lethal contact remain intact.
- **Delayed Reaction:** 0.35–0.575 seconds stuck, exactly half the prior interval.
- **Genuine case:** reach increases from 1.6 to 2.25 units; collection also tests a
  short path between consecutive player positions (at most 6 units / 150 ms).
  Both current and closest approach must have clear sight to the case. Teleports,
  stale approaches, wall grabs, dead players, weaponized cases and active return
  states do not qualify. Existing maximum pickup speed 18 and former-owner 900 ms
  disarm delay remain. Physics, projectile origins and world playback are unchanged.
- **Prediction correction:** Hot Pursuit alone no longer incorrectly places a rat
  in the client's reflective-shot set. Only an active Ironclad deadline does so.

## Provisional placement

Two sites per power-up, still 20-second respawn and atomic claims. Existing site
IDs are retained for protocol-10 compatibility despite their changed locations. These anchors
resolve to exactly the listed clear pavement in world seed 341283204/version 2.
Clearance uses the game's real body/launcher/ramp exclusion pool.

| Power-up | Position x/z | Intent |
| --- | --- | --- |
| Ironclad | -36 / -28 | Records forecourt west approach, before crossing exposure |
| Ironclad | 100 / -20 | Icebox southwest crossing |
| Hot Pursuit | -172 / 20 | Gate street junction / route back to action |
| Hot Pursuit | 92 / 124 | Pump Hall west approach |
| Quick Fix | -52 / -68 | Records west side lane, off the forecourt |
| Quick Fix | -60 / 100 | Needleworks east side lane, with onward routes |

No human acceptance of site usefulness, art or collection feel is claimed yet.

## Live-environment preview requirement and entry

Every gameplay playtest now uses a frozen matching client plus the hosted private
Cloudflare Worker, real `ServerBotController`, normal matchmaking and backfill,
compact-v2 delivery and the 16-rat cap. One human gets seven server bots; empty
rooms sleep. Never use `bots=11` browser clients or local workerd as the normal
playtest runtime. Static art checks and explicitly requested stress tests are
separate, clearly labeled tools.

The relay forwards only validated room/world metadata from authenticated private
`/status`. Title startup prepares that exact world and an unreserved socket;
matching welcomes reuse the city. Private matcher titles now follow the same
preparation/admission rules as public titles.

Early relay checks measured 1077–1440 ms from an immediate join send to welcome.
Those numbers included upstream connection setup and do not isolate server CPU
time. Source inspection also showed empty-room bot/chaos geometry being built
during join. The follow-up moves that construction to title preparation. The prepared controller has no active actors,
no simulation interval, no assignment clock and no reserved slot. It is reused on
join or disposed after 30 seconds unused. The fixture's seed override also now
covers initialization: previously only its version-switch branch was fixed, so
private matchmaking pools could silently get random seeds.

## Validation

- Full suite: **895 tests** (134 Worker, 735 client, 26 script). Typecheck and build
  pass; the existing large-chunk build warning remains. After preserving the
  original wire site IDs, all 19 focused pickup/trap tests and the final build and
  typecheck passed again.
- Tests cover silver restoration for ordinary and batched rats, transient effect
  bounds/cleanup, run-by case collection versus walls/teleports, full matching
  burst trajectories, private metadata forwarding, unreserved title preparation,
  prepared-controller reuse/expiry and Hot Pursuit not reflecting predicted shots.
- Client, authority, live-light counts, shot lifetime and production cap remain
  consistent. No phone, multi-human feel, controlled FPS or long-soak claim.

## Current human preview

[Play the audible preview](http://127.0.0.1:5193/?room=graybox-benchmark-match-pickups-r4).
No mute, browser bots, diagnostic playback or forced incident flag is present.
Private Worker **cb78bab9-f9d2-4c8e-8373-0c874277db81**, protocol **10**,
world **341283204 / version 2**. Expires **September 11, 2026 at 9:44 PM Pacific**.
The loopback relay serves the frozen matching build on 5193. The old 5190 local
workerd URL is retired as a gameplay preview and must not be used for acceptance.

Deployment receipt:
`output/hosted-capacity-deployment-2026-09-12T00-44-46-296Z/deployment.json`.
The relay keeps its credential private; no token is in the link.

Final bounded hosted check (25 seconds, isolated normal matchmaking pool):

- Pre-join ping confirmed the actual upstream prepared connection before measuring:
  **190 ms join-send to welcome**. This is transport/server timing, not a measured
  browser click-to-control or cold-start guarantee.
- HTTP metadata and welcome agreed on seed 341283204/version 2 and protocol 10.
  Before entry: zero participants/bots. Welcome: one human plus seven server bots.
  After the observer left: zero participants/bots again.
- **711 compact-v2 snapshots**, zero invalid deliveries, all six pickup sites.
  Snapshot gap p95 106 ms, max 535 ms; this short run is not a smoothness guarantee.
- Every bot made 330–419 small continuous movement steps, totaling 171.5–247.6
  horizontal units per bot. Respawn jumps were excluded from these travel totals.
- **51 client files** matched both the frozen receipt build and current local build;
  zero asset mismatches. The observer closed normally. Aggregate evidence:
  `output/pickup-refinement/final-hosted-check.json`.

One intermediate probe used the updated local decoder against the previous private
candidate after site IDs changed, so its snapshots were rejected. It was not a valid
matching-build check. Final site IDs preserve the original protocol-10 identifiers,
and the fresh matched deployment above passed.

A static art inspection used `test/visual/pickup-fixture.html?mute=1` through the
visual Vite server. It exercises the real authored props, batched silver rat,
red outline/trail and green wave. This is not multiplayer gameplay testing.

An intermediate full suite found an existing non-deterministic pursuit failure
in `aiLiveDiagnostic.test.ts` (one bot missed its 40-second distance target).
A separate captured run showed that bot reaching the carrier around 25 seconds;
the subsequent full suite passed. No AI navigation tuning was changed on that
basis. The hosted motion check is required in addition to unit results. It does
not establish that every route or obstruction recovers reliably.

Prior memory: `sessions/2026/09/rat-detective-pickups-planted-evidence` and
`decisions/rat-detective-evidence-incident-mode`. Local human feedback above
supersedes the old no-trail and browser-bot preview instructions.

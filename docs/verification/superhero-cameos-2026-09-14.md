# Superhero cameos — September 14 private integration

Tyler accepted the two model designs, all three animation types, the corrected
open Bat-rat cape, the optimized assets and the proposed locations, then requested
integration into the game.

## Placement and behavior

- Spider-rat occupies the west corner of the south Gate tower:
  feet at **(-141, 62, 25.5)**, facing the Sewer Geyser launcher at (-153, 0, 15).
  The authored roof is fixed across city seeds and leaves a broad landing area.
- Bat-rat occupies the back corner of sewer Maintenance: feet at
  **(61.5, -7, -40.4)**, facing the room's approach. It clears the workbench,
  cabinet and existing armor pickup.
- Normal model scale, no labels, markers, sound or interface changes. These are
  cosmetic environmental characters with no collision bodies, HP, player slots,
  bot targeting, damage or scoring. Camera/aim mesh rays skip them.
- Visible cameos play the accepted idle. A living rat entering within five
  horizontal units and three vertical units triggers the passerby reaction after
  a scenery visibility check. A rat hidden behind a corner can trigger on coming
  into view. A standing visitor does not repeatedly restart the greeting.
- The actual rendered cheese-ball stream drives near-miss reactions, including
  locally predicted shots and remote/ricochet playback. Swept segments catch
  between-frame passes; large correction jumps are not interpreted as flight.
  A wall check prevents reactions through scenery. An incoming shot can interrupt
  a greeting. Bounded cooldowns and per-ball deduplication prevent looping.
- The cape remains open behind Bat-rat throughout the shot reaction. Physics,
  server damage, projectile tuning, bots and protocol 18 remain unchanged.

`src/cameos/cameoLayout.ts` owns positions. `CameoView.ts` owns bounded local
reaction state. `GameSession` supplies current rat positions and consumes the
`ChaosView` presented-ball callback. `CheeseGun.sceneryClear` shares the existing
static-body query index and has no combat side effects. Welcome, round reset,
disconnect and disposal clear transient state. Legacy version-1 worlds disable
these placements; late version-2 world initialization can load them after welcome.

## Loading and rendering

The accepted packed GLBs live under `src/assets/cameos/`, 533,188 and 337,020 bytes.
The authoring exporter refreshes both game and art-viewer copies. Production uses
prebuilt assets and the shared `src/cameos/CameoAnimator.ts`, never the procedural
art model builder. Vite produces hashed asset URLs.

Requests begin alongside title city construction, with an eight-second bounded
optional load and abort cleanup. Missing assets do not reject game entry. The
normal title path compiles materials with the city, then uploads cameo geometry
to a one-pixel offscreen target before play. That pass restores scene visibility,
render target and shadow-update state, including when rendering fails. The rare
late-world fallback uses async loading without a separate title warmup.

Spider-rat sleeps beyond 100 camera units; Bat-rat beyond 40. Distance sleep skips
animation, visitor scans and shot history. Proximity scans run at most every
150 ms; projectile history is capped at 256 and stale entries expire. No extra
lights or shadow casters. Materials receive the same accepted color/emissive lift
as ordinary rats. Geometry still has 25 meshes per character; the disjoint view
ranges mean both are not drawn together in ordinary play.

## Verification

- All **1,328 tests passed**: 161 Worker, 1,102 client and 65 script tests.
- Final focused cameo/loading checks passed after the visibility and allocation
  refinements. Typecheck and production build passed. The existing large game
  chunk advisory remains.
- Tests cover actual roof bounds, Maintenance furniture clearance, inert mesh
  rays, distant sleep, walls/floor filtering, entry rearming, shot interruption,
  between-frame sweeps, correction jumps, deduplication, history caps, resets,
  asset errors/abort and offscreen-render state restoration. Prior ten asset and
  animation tests remain passing.
- Static art inspection rendered both placements in actual city geometry and
  lighting using `test/visual/cameo-placement.html?mute=1`. No browser gameplay
  input was automated. Full-game feel, real-phone performance and discovery
  routes remain for human playtesting; no frame-rate claim is made.

Logs and frozen client: `output/cameo-game-integration/`. The implementation
reference contract is
[the cameo game contract](../../.research/cameo-game-implementation-references.json)
and its online-validated receipt.

## Frozen hosted preview

[Play the cameo build](http://127.0.0.1:5197/?room=graybox-benchmark-match-bot-maneuvers-cameos-r1).
Human preview is audible. This uses normal eight-participant matchmaking, seven
server bots when playing alone, ten total rat maximum and the maneuver policy.
The existing private fixture pins Jurisdiction for this playtest.

This is a client-only integration. All **69 server/shared source hashes** matched
the existing hosted receipt before reusing Worker version
**`95371214-da4d-4771-b8c4-ceaa15979490`**, protocol 18. The independently frozen
client is `output/cameo-game-integration/frozen/dist`; its source copy and asset
manifest are adjacent. Existing bot observation on port 5198 was left running.
The backend expires **September 15 at 12:57 AM Pacific** (07:57 UTC).

All 58 served assets matched their frozen hashes, including both GLBs. A separate
disposable protocol join verified world version 2, seed 341283204, eight players,
seven server bots and the ten-rat cap. See `server-match.json` and
`hosted-check.json` in the output directory. No production deployment or commit.

## September 14 reachability correction

Tyler approved Bat-rat in game but found Spider-rat unreachable. The original
170-unit crown exceeded the ground launcher's roughly 129-unit peak. Spider-rat
now stands on the 62-unit south Gate tower beside the Sewer Geyser. Bat-rat's
placement, assets and animations are unchanged.

`cameoReachability.test.ts` uses the real player controller, normal movement speed,
all city and launcher-control colliders, gravity and ordinary launch velocity.
It injects an authority launch event at the geyser pad, rises above the tower,
steers to (-138, 23), and lands within greeting distance of Spider-rat. It passes
for seeds 341283204, 20260907 and 1. This verifies flight and landing; it does not
simulate a human shooting the launcher trigger or browser input.

All 23 focused cameo tests, typecheck and production build passed. Static city
inspection confirms the model sits inside the roof. The original 1,328-test full
suite result above predates this placement correction; it was not rerun for this
client-only relocation. Logs and the new frozen client are in
`output/cameo-gate-relocation/`; port 5197 now serves its `frozen/dist` with the same
matching hosted Worker and expiry. Port 5198 and production remain untouched.

The workspace acquired unrelated shared-map edits during this correction. To
preserve the hosted match, the new preview copies the prior frozen `src` and
changes only `src/cameos/cameoLayout.ts`. All 69 server/shared hashes match the
hosted receipt. The frozen source independently passes typecheck, all 23 focused
cameo tests and its Vite production build. All 58 served files match the new asset
manifest. Working-tree typecheck/build also pass. No map or server edits from
other ongoing work were included in this preview.

## Shared preview renewal after sewer fixes

The subsequent [sewer crossing follow-up](sewer-exits-2026-09-14.md) renewed the
shared private Worker and the port 5197 relay. That relay now serves the matching
frozen client from the new receipt, including the reachable Gate-tower placement
and sewer bot fixes. Its existing URL and maneuver-policy matchmaking remain.
The new expiry is September 15, 1:23 AM Pacific; use the linked follow-up for the
current version, full validation and asset/roster checks. Earlier isolated client
receipts above describe their original deployments.

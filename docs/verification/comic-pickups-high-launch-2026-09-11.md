# Comic pickup indicators and high launches — September 11, 2026

**Later release status:** Tyler accepted r8 and authorized production release.
Application `8cd0ec2`, Worker `3398a69c-146b-4d99-aa47-e3734664c086`, protocol 14.
See the [production receipt](pickup-reconnect-production-2026-09-11.md).
The private/review-pending statements below describe the original verification pass.

Tyler rejected the small numbered restock dial and plain active-effect text,
reported Icebox armor trapped in a shelf, and requested visible sewer-approach
speed pickups and much higher, equally strong launches. This pass supersedes the
presentation and launcher tuning in the r6 receipt. Private and uncommitted.

## Changes

- Icebox second-floor Ironclad moves to **(116, 8.7, -84)** on the open rear
  catwalk. The old ray-only placement check could miss a shelf when rays began
  inside its solid volume. Placement now checks the complete rat/prop clearance
  against static boxes before verifying floor support. This catches embedded
  pickups, including shelves larger than the test rays.
- All four Hot Pursuit sites sit **six units outside the actual portal mouth**:
  Gate **(-148, .7, 0)**, Icebox **(148, .7, 0)**, Alley **(0, .7, 148)**,
  Needleworks **(-54, .7, 76)**. There are still 18 sites; restock remains 45 s.
- Empty sites show a hand-inked **fedora-wearing cheese wedge**. It progressively
  fills with gold from bottom to top, with a moving bright edge and crumbs. No
  numbers or text. The complete symbol coincides with the item returning. Shared
  server deadlines remain authoritative. Depth testing, no additional lights and
  bounded resources remain; a static canvas texture feeds an animated shader,
  without per-frame canvas redraw/upload.
- Active effects use large illustrated dossier cards: coat/boot artwork, comic
  lettering, silver/red palettes, prominent duration tabs and thick draining
  gauges. Cards pop in and give a small final-three-second warning. Responsive
  sizing keeps both effects visible; reduced-motion disables the extra motion.
  The world restock marker has no digits; active-effect cards deliberately retain
  **large readable seconds** as well as their gauges. Quick Fix remains instant.
- Every launcher now applies **(0, 90, 0)**. The earlier per-machine vertical
  values (24–68) are gone. Flight damping is .1 for both initial and respawned rats;
  normal walking damping returns on landing. Respawn/death clears the saved state.
  Immediate steering remains available throughout flight. An unobstructed fixed-step
  arc peaks at **129.16 units after 3.03 seconds**; scenery can intercept a flight.
  Pressure Surge uses the same launcher impulses. Ordinary projectile physics,
  player jumps and bot aim/activity tuning remain as in the preceding pass.
- Protocol **13** coordinates the increased valid launch envelope (100-unit bound)
  with the client. Do not attach an older frozen client to this Worker.

## Verification

**924 tests pass**: 134 Worker, 764 client, 26 scripts. Typecheck and build pass;
the existing large-bundle warning remains. Focused tests check every exterior
portal coordinate, clearance from furniture, real physical collection of the
moved Icebox reward, all-site presence and claims, six equal flight arcs,
fresh/respawned player flight height and damping restoration, event deduplication,
full air control and compact protocol delivery.

Muted static art checks reviewed the new cards and filling symbol, the actual
Icebox catwalk with the reward clear of shelving, and the actual Alley sewer
entrance with Hot Pursuit visibly outside it. These are fixed presentation scenes,
not browser gameplay/input tests. Human feel remains for Tyler to review.

## Matching hosted preview

[Audible r7 preview](http://127.0.0.1:5193/?room=graybox-benchmark-match-pickups-r7),
private Worker **002f4a3c-f0b6-4ab2-9c78-22d2ad0b3755**, protocol **13**.
Expires **September 12 at 2:28 AM Pacific**. Frozen receipt:
`output/hosted-capacity-deployment-2026-09-12T05-28-43-883Z/deployment.json`.
Relay PID at start: **640239**. Normal hosted production matchmaking/backfill,
one human plus seven server bots, 16-rat cap and sleeping empty rooms. Replaced
only this task's old 5193 relay. Human audio remains enabled; only agent art checks
used `mute=1`. Other preview services and system/browser sound settings are untouched.

A 45-second passive hosted check confirmed protocol **13**, **8 participants**,
all **18 site coordinates** (including the moved armor and four exterior shoes),
**1,336 valid snapshots**, **0 decode errors**, and **56 matching frozen/build/served
files**. Prepared join took 140 ms. Bots fired 668 shots and collected two speed
pickups and a medkit; observed restock deadlines remained 44,983–45,000 ms.
The pool was empty before joining and after disconnecting. No launcher activation
or completed restock occurred during this short passive window; flight is covered
by the actual controller/physics tests, not claimed as observed hosted gameplay.
The unchanged bot logic still had uneven activity (44–93% moving samples, maximum
idle 1.5–6 s) in this window. No new bot-behavior improvement is claimed here.
Ignored local evidence: `output/pickup-refinement/comic-pickups-hosted-check.json`
and `verify-comic-pickups.mjs`.

No commit or production release. Preserve all dirty changes, including separate
audio startup work. Production remains application `aaa8750`, Worker
`d6d1b1e3-9406-4df6-a3f5-04132652e3c1`, protocol 10. The preceding bot audit and
remaining occasional stalls are documented in
[restock, bots and launchers](restock-bots-launchers-2026-09-11.md).
Prior GBrain: `sessions/2026/09/rat-detective-restock-bots-launchers`.

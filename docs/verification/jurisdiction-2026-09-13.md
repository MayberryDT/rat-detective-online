# Jurisdiction private implementation — September 13, 2026

Implemented the [agreed outline](../jurisdiction-implementation-outline.md) in the
existing working tree. Production remains unchanged on protocol 15. This private
candidate uses protocol 16 and requires a matching client and Worker.

## Rules and integration

Jurisdiction is the fourth Dispatch Assignment. A living rat carrying the genuine
Hot Case inside the active zone earns one personal point per second; first to 60
wins. Enemy presence does not contest progress. Kill or disarm the carrier to stop
them. Points survive death and case theft. Ordinary kills remain separate stats.

The zone relocates every 45 active seconds and reveals the next site with 10
seconds remaining. The physical case stays where it is. Three outdoor and three
enclosed zones alternate in shuffled bags; every site appears before a bag repeats.
The next bag is stored before its first zone is announced. Briefing and classic
Evidence Tampering pause scoring and relocation; ordinary incidents do not.

Authority owns progress, geometry membership, relocation and victory. Scoring
intervals split at pickup, incident and rotation boundaries. A final point wins
before a simultaneous relocation. Continuous milliseconds do not bump the
checkpoint transition revision. Existing reconnect reservations preserve the
vulnerable rat and progress; expiry removes its active score entry. Restored
three-mode playlist bags remain valid and introduce Jurisdiction at refill.

The permanent score card shows personal points, current zone and floor, relocation
time and the announced next zone. The full scoreboard has a separate zone-points
column. Location guidance uses street/sewer transitions. Compact broadcasts keep
the score card visible during roulette and briefing. Floor overlays share the
authority geometry, remain depth tested, and add no lights, shadows or colliders.

## Placement

Coordinates are x/z rectangles in the existing world. The authoritative feet band
is floor minus 0.5 through strictly less than floor plus 6, allowing ordinary jumps
while excluding upper floors and the street above the sewer. Spawns stay outside
the active footprint expanded by five units on the same layer.

| Zone | Footprint | Exclusions and approaches |
| --- | --- | --- |
| Records Forecourt | x −28…−4, z −33…−21; floor 0 | Approach from both street directions or north forecourt |
| Icebox Loading Yard | x 113…135, z −26…−12; floor 0 | Both street directions and loading-yard approach |
| Central Crossroads | Union of x 57…83, z −24…−12 and x 64…76, z −31…−5; floor 0 | Four street approaches; excludes the manhole |
| Needleworks Factory Floor | x −118…−92, z 71…93; floor 0 | Workbench cutout x −123…−113, z 89.5…94.5; three exterior doors |
| Pump Station Ground Floor | x 114…138, z 108…133; floor 0 | Three pump blocks and control booth cut out; three exterior doors |
| Sewer Junction | Central 12×12 square plus west/east arms to x ±16 and south arm to z 16; floor −7 | T-shaped: west, east and south approaches; no north arm |

Exact exclusions, supported defensive posts and approaches live in
[`jurisdictionZones.ts`](../../src/shared/jurisdictionZones.ts). This single
catalogue drives scoring, rendering, navigation goals and spawn exclusion.

Bots carry toward the active zone, hold supported posts and periodically move
between them. Some intercept alternate approaches or leave for the next zone
during its warning. Visible immediate pickups retain their existing priority.
Jurisdiction sewer travel uses intermediate mouth/foot/bend goals to keep searches
within the existing shared navigation budget. This also avoids fallback movement
toward the street directly above an underground goal. Existing launch, descent,
movement, aim and recovery systems remain in use.

## Verification

All 1,092 tests passed: 149 Worker, 913 client and 30 script checks. Typecheck,
application build and visual build passed. The existing large-chunk build advisory
remains. `git diff --check` and relative links in the six edited documentation
files passed.

Focused coverage includes living-carrier eligibility, uncontested scoring,
fractional points, floor exclusions, pause/resume, boundary wins, shuffled bags,
malformed snapshots, compact deltas without revision changes, persistence,
reconnect expiry, real disarms and all-four-mode playlist/reset behavior.

Supported defensive posts and spawn exclusion were checked against physical world
geometry for seeds 341283204 and 1. Real ServerBotController movement reaches and
scores at all six zones from their approach routes. An additional seven-bot test
starts the carrier on the central street, routes it into the sewer and earns at
least 2.5 points within 40 seconds without recovery teleportation. This test caught
and verified the intermediate tunnel routing correction.

Static, muted, no-input screenshots reviewed all six placements at 1280×720 and
the sewer warning/roulette layout at 900×500. No HUD document overflow was found.
The latest compact layout separates case announcements and incident roulette from
projected destination labels. These are art/HUD inspections, not gameplay or phone
performance measurements.

Build logs, passive hosted checks and screenshot receipts are local under
`output/jurisdiction-2026-09-13/`. The first 65-second hosted sample had valid
traffic and relocation but no score. A subsequent trace observed physical case
theft and 3.55 points; its street-to-sewer movement prompted the crowded route
regression above. Short passive samples do not establish match pacing or balance.

On the final private version, all 56 served files matched the frozen asset copy.
The 95-second trace with ordinary heartbeat traffic received 17,321 valid messages,
zero decode failures, eight rats, 1,642 distinct shots and three zones (Records,
Pump, Crossroads). It observed three case carriers but no zone points: combat
disarms and travel kept carriers outside the active footprint. Consequently the
probe's extra `score > 0` assertion did not pass. An earlier final-version probe
ended its traffic sample before relocation; its asset/protocol checks passed.
The subsequent sustained trace did not reproduce that interruption. These limits
are retained in the receipts, rather than treating a short random combat sample
as proof of scoring pace. Authoritative scoring and arrival are covered by the
deterministic tests above; the earlier hosted version also demonstrated scoring.

## Release boundary

Private Worker version: `d8109e5f-c6ac-4b75-bad3-f5d2cd053e7c`.
Frozen fixture: `81f84ff3a6cdb042bd2917da7ece172793fe15051f7ebd8beef1e51f880b632f`.
Deployment receipt:
`output/hosted-capacity-deployment-2026-09-13T22-03-06-566Z/deployment.json`.
The dedicated `rat-detective-jurisdiction-preview.service` serves this frozen copy
on port 5198. It expires September 13 at approximately 7:03 p.m. Pacific.

[Audible human playtest](http://127.0.0.1:5198/?room=graybox-benchmark-match-jurisdiction-r2).
Jurisdiction is pinned in this copied preview Worker only; source keeps the normal
four-assignment playlist. Separate test rooms leave the human playtest untouched.

No public deployment, namespace reset or Git commit was made. Existing uncommitted
movement, score-card and other work was preserved. Human combat feel, rotation
pacing and phone performance remain for playtesting. The preview uses frozen
matching assets and a hosted Worker with ordinary eight-participant backfill and
the 16-rat cap; it does not use browser bots or local workerd.

Prior design memory: `brain:sessions/2026/09/rat-detective-jurisdiction-outline-2026-09-13`.

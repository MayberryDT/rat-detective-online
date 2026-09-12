# Quick Fix junction relocation — September 12, 2026

Tyler approved replacing all existing Quick Fix sites with four exposed street
junctions. These changes include the preceding seam/card/hit-feedback follow-up.
Production remains unchanged; source remains uncommitted.

| New site | X | Y | Z |
| --- | ---: | ---: | ---: |
| Northwest of Records Hall | -60 | .7 | -102 |
| Northern avenue west of Icebox | 70 | .7 | -102 |
| Southeast of Needleworks | -60 | .7 | 130 |
| Northwest of Pump Station | 90 | .7 | 95 |

The four former medkit IDs are retired. New `fix-*-junction` IDs and explicit
street heights use authored supported positions instead of snapping to rat spawn
points. Existing room restoration seeds the new sites and ignores retired IDs;
other pickups retain their existing respawn deadlines. Four medkits and 18 total
pickups remain. Instant full normal health, full-health ineligibility, 45-second
restock, other upgrade placements and protocol 15 are unchanged.

Focused authority tests verify exact positions in production seed 341283204 and
the default city seed. Each site has eight unobstructed radial rays out to eight
units at height one, at least three clear 24-unit cardinal approaches, more than
48 horizontal units from every other upgrade and more than 125 units from the
other medkits. Tests also restore a checkpoint containing all four retired sites
and confirm that only the four new medkits remain, with other supply deadlines
preserved. Physical support/rat-volume clearance continues through the existing
placement resolver. These are geometry/protocol checks, not human combat or
real-phone visibility acceptance.

Validation: `npm run typecheck`, `npm test` and `npm run build` pass. **965 tests**
(140 Worker, 798 client, 27 script), including physical server-bot collection at
all four new sites. An existing route test still referred to the removed
`fix-sluice`; it was replaced with coverage for all four junctions. The production
build retains its existing large-chunk advisory. No browser gameplay/input test
was performed.

## Hosted preview

[Audible playtest](http://127.0.0.1:5195/?room=graybox-benchmark-match-quick-fix-junctions-r2),
expires **September 12 at 7:29 PM Pacific**. Private Worker
`78fd116a-ac51-4717-a80d-65366d89050b`, protocol 15, frozen matching client.
Transient user service `rat-detective-junction-preview.service` replaces the prior
port-5195 relay. Production matchmaking/backfill stays at eight rats when playing
alone with a 16-rat cap. Production is unchanged and human acceptance is pending.

A separate private probe pool confirmed all four new medkit IDs and exact
coordinates, two eight-rat welcomes, 1,543 decoded frames, all 56 served assets
matching the frozen client and 155 matching source hashes. No gameplay inputs.
Receipt: `output/hosted-capacity-deployment-2026-09-12T22-29-43-106Z/deployment.json`.
Verification: `output/quick-fix-junctions-2026-09-12/private-verification.json`.

## Acceptance and commit

Tyler accepted the combined junction preview as perfect and requested all work
from this task committed. This supersedes the earlier pending-acceptance and
uncommitted status. Production deployment was not requested. The separate
animation/reaction studio work is outside this commit.

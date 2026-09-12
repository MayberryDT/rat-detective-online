# Coat seam, single pickup cards and lethal-hit feedback

Implemented September 12, 2026 in the working tree after the accepted protocol-15
release. **Not committed or deployed.** The production release recorded in
[the integration receipt](model-netplay-integration-2026-09-12.md) is unchanged.

## Changes

- The coat had an upper rear seam at x=0 and a separate lower strip at x=.021.
  Replaced both with one centered, constant-width strip from hem to collar. Its
  vertices include each coat-profile bend and maintain surface clearance, avoiding
  segments disappearing into the coat as the body rocks. The existing body
  animation, outline/batching, silhouette, sleeves and palette are preserved.
- Removed the separate pickup title broadcast and its CSS. Ironclad Alibi and Hot
  Pursuit retain their illustrated bottom cards, authoritative duration tabs and
  gauges. Snapshot deadline changes own their claim sounds, so pickup results no
  longer duplicate a title/audio announcement.
- Quick Fix now uses the same bottom card layout, with a hand-drawn green-plus
  medical tin, “FIT FOR DUTY,” “HEALTH RESTORED” and a “FULL HP” tab. The
  authoritative local playerHealed event displays it for 3.2 seconds; it has no
  countdown or draining gauge because healing is instant. Repeat heals replace
  the existing card. Death, round reset and disposal clear cards; disposal removes
  the HUD container. Three simultaneous cards share one responsive row.
- Nonlethal playerDamaged events retain the X/hit sound. Lethal confirmation now
  belongs to playerDied, independent of a preceding damage packet or the remote
  mesh still being present. The preceding zero-HP damage packet does not also
  trigger feedback. Other players' kills and neutral deaths give no hit marker.
  Authority, scoring and protocol 15 are unchanged.

## Verification and limits

- Focused regression tests cover centered seam rows and raycast surface clearance
  across walking/turning/firing poses; lethal feedback with and without a preceding
  damage message; one card per effect; no title broadcast; Quick Fix artwork,
  expiry, refresh and reset/disposal cleanup.
- `npm run typecheck`, `npm test` and `npm run build` pass: **959 tests** (140
  Worker, 792 client, 27 script). Build retains the existing large-chunk advisory.
- Muted static art inspection in the existing port-5196 Vite workshop reviewed
  all three cards and the rear seam during the workshop walk animation. These
  are art fixtures, not hosted gameplay or input tests. No production traffic,
  deployment, automated gameplay input or real-phone testing was performed.
- The reported production failure to show the final X was not reproduced in a
  hosted session. The tests establish the new kill-event confirmation behavior;
  human gameplay acceptance remains outstanding.

Prior durable context: `brain:sessions/2026/09/rat-detective-model-netplay-production-2026-09-12`.

## Requested hosted gameplay preview

Tyler requested a preview after the local implementation closeout. The frozen
matching protocol-15 client and private Worker are now available at
[the audible playtest](http://127.0.0.1:5195/?room=graybox-benchmark-match-seam-pickups-r1).
Expires **September 12 at 7:18 PM Pacific**. Worker
`97ecc38e-0a35-4594-a085-3795f27d46c5`; transient user service
`rat-detective-seam-pickups-preview.service` runs the relay independently of the
agent terminal. Normal production matchmaking/backfill supplies eight rats when
playing alone, with the 16-rat cap and bots yielding to humans.

Verification: service active and relay healthy; all 56 served assets match the
frozen build, all 155 source hashes match the working tree, two eight-rat welcomes
and 1,639 decoded frames passed in a separate private probe pool. No gameplay
inputs were sent. Receipt:
`output/hosted-capacity-deployment-2026-09-12T22-18-57-121Z/deployment.json`.
Verification: `output/seam-pickups-preview-2026-09-12/private-verification.json`.
The earlier no-deployment statement records the initial local closeout; this
requested private preview supersedes it. Production remains unchanged and human
acceptance remains pending. Human playtests stay audible.

## Acceptance and commit

Tyler accepted the combined junction preview as perfect and requested all work
from this task committed. This supersedes the earlier pending-acceptance and
uncommitted status. Production deployment was not requested. The separate
animation/reaction studio work is outside this commit.

# Accepted model and netplay integration — September 12, 2026

Tyler accepted the final model gameplay preview and requested all work committed,
the parallel netplay improvements merged, and the repository cleaned of topic
branches. The accepted model and protocol-15 implementation are now combined.

## Commits and merge

- `d28eace`: accepted detective outfit, final matching sleeves, studio/reference
  tools, shared palette and accumulated art verification documentation.
- `00f81d0`: captured all pending work in the netplay worktree, including its
  inherited earlier outfit snapshot and the protocol-15 implementation.
- `3a6a1d2`: merge resolving the older art snapshot in favor of the accepted final
  model while retaining the networking changes. This is the deployed application.

The final RatModel, RatArmModel, RatAnimator, CaseGrip, RatEntity and ratAppearance
files match the accepted model commit exactly. ChaosView retains the shared carry
pose and gains reversible pickup anticipation. Reference imports remain confined
to the visual workshop. The 1,024-appearance palette, case-only sleeve, animation
and muzzle remain intact for humans and bots.

Netplay includes sequenced input/firing pose, bounded historical projectile
collision, visible-radius sphere sweeps, swept pickups, direct shot/pickup results
and bounded diagnostics. See the [netplay receipt](netplay-crispness-2026-09-12.md).

## Validation

The combined suite passed 954 tests; one additional passing integration test
brings the tested total to **955** (140 Worker, 788 client, 27 scripts). The added
check covers the new case sleeve during anticipated pickup, unchanged handle
alignment, no local ownership mutation, and complete sleeve removal on rejection
or timeout. Typecheck, app build and visual build pass; dependency audit reports
zero vulnerabilities. The existing client chunk-size advisory remains.

A frozen matching private Worker/client check confirmed protocol15, eight-rat
welcomes for two clients, selected highlights, 1,454 decoded frames and all155
source hashes. Private version `1b2885a1-5171-44ad-87bb-0bbbf846b1d3`; receipt
`output/hosted-capacity-deployment-2026-09-12T21-58-35-343Z/deployment.json`.
Private relay remains on5193 under `rat-detective-model-playtest.service`, serving
`graybox-benchmark-match-integrated-r1`, expiry September12 6:58PM Pacific.

No automated browser gameplay input, stress test, phone benchmark or new
150–250ms victim-side fairness measurement was performed. Human model acceptance
and the requested netplay merge are recorded; bounded checks do not establish
universal latency/performance guarantees.

## Production

Canonical https://ratdetective.online/, Worker `rat-detective-preview`, production
environment, version **21f6b8c1-4770-4691-92fa-71b5096f8a7b**, protocol **15**.
Application commit **3a6a1d2**. Predecessor `3398a69c-146b-4d99-aa47-e3734664c086`
(protocol14). Room `public-live-v2`, namespace and world seed341283204 remain.
Client and Worker were deployed together. Existing tabs should reload.

Production verification matched all **56 client assets** byte-for-byte against
both the local build and frozen private client. Health and canonical redirects
passed. A passive public observer received protocol15, eight participants and18
pickup sites; same-ID reconnect completed in **696ms**. **102 snapshots** decoded
with zero invalid messages. The initially empty room returned to zero players/bots
after the30-second reservation, with world seed/version unchanged. No public
movement, shot, objective manipulation or room reset was sent.

## Branch cleanup

Only local **main** and the established remote **master** remain. All model and
netplay work is committed, and main is pushed to origin/master. Merged netplay,
dispatch, incident and Cloudflare cleanup topic branches were deleted.

Older foley and optimization branches had unique historical commits. They were
preserved in annotated, pushed tags before deleting the branch names:
`archive/chaos-foley-2026-09-12` and
`archive/optimization-research-2026-09-12`. The older optimization experiment has
unmerged changes beyond the requested protocol15 work; these were preserved,
not silently introduced into this accepted release. Existing auxiliary worktrees
are clean and detached, retaining their local files and generated evidence.

Logs and sanitized verification: `output/model-netplay-integration-2026-09-12/`.

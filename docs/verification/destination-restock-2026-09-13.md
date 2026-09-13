# Destination guidance and pickup restock dials — September 13

Implemented at Tyler's request in the existing working tree. It was subsequently
included in the integrated production release on Worker
**`e1ecb3ed-1853-480d-89f0-81817d0c238b`**.

## Changes

- Removed Chain of Custody's yellow building silhouette, its mask geometry,
  render target and overlay pass. Destination name, distance, off-screen arrow,
  aim clearance and street/sewer guidance remain. Reset immediately hides the cue.
- Replaced the generic filling cheese/fedora with item-specific restock dials:
  silver coat, paired red shoes and green medical cross. Each subdued icon sits
  inside a clockwise ring beginning at twelve o'clock. Dark unfilled tracks and
  ink borders distinguish available progress. No digits, crumbs or flashing.
- Retained the authoritative 45-second deadline and ordinary available pickup
  models. The dial disappears and the item reappears at the deadline. Each site
  lazily creates and reuses one depth-tested plane; the shader only updates a
  progress uniform and camera-facing orientation. No additional lights or
  gameplay/protocol changes belong to this visual task. Active HUD cards remain.
- Removed obsolete silhouette calls from the art/capacity fixtures and replaced
  silhouette tests with cue lifecycle coverage.

## Verification

- Focused guidance and pickup suite: 28 tests pass. Covers all three kinds,
  exact deadline transitions, reuse across restocks, clamping restored deadlines,
  orientation, texture/material cleanup, delivery labels and reset/closed cues.
- `npm run typecheck`, `npm test`, `npm run build` pass. Full suite: 1,053 tests
  (146 Worker, 878 client, 29 script). Build retains its existing large-chunk
  advisory.
- Muted static art review at port 5196 checked all three dials at empty, 50% and
  94% progress, dark and warmer flat backdrops, and opaque wall occlusion. The
  existing pickup fixture showed production dials at normal scale beside rats.
  No automated gameplay inputs or real-phone testing.
- The integrated release uploaded the matching production client and Worker. The
  live root and referenced JS/CSS hashes matched the tested local build; `/health`
  and `/status` retained the canonical room and version-2 world.
- Static review source: `test/visual/restock-fixture.html` and `.ts`. The palette
  backgrounds are not city geometry; human gameplay acceptance is outstanding.

## Working tree scope

The tree already contained released bot traversal and case/kill-feedback work.
A separate task also changed movement validation while this task ran. Those edits
were preserved and are outside this task's authored visual change. Full-suite
counts reflect the combined working tree, not just the visual tests.

## Private hosted playtest

[Audible human playtest](http://127.0.0.1:5197/?room=graybox-benchmark-match-restock-dials-r1)
expires September 13 at **5:38 PM Pacific**. Frozen protocol-15 Worker
`aeca1708-5635-4e95-b7eb-b658d2b31727`; transient user service
`rat-detective-restock-preview.service`. Normal production matchmaking fills to
8 participants with server-owned bots; room cap remains 16. Human playtests are
not muted. No public production deployment or Git commit.

Verified 56 served assets against frozen `stage/dist`, 159 source hashes against
the working tree, two eight-rat welcomes and 1,731 decoded frames in a separate
private pool. No gameplay inputs. `npm run visual:build` also passes.

- Deployment receipt: `output/hosted-capacity-deployment-2026-09-13T20-38-34-936Z/deployment.json`.
- Verification: `output/destination-restock-2026-09-13/private-verification.json`.
- [Static dial comparison](http://127.0.0.1:5196/restock-fixture.html?mute=1) uses
  the existing visual studio service; it is not a gameplay preview.

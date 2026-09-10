# Deliberate foley revision — September 10, 2026

This records the 24-cue revision. A [later human-directed follow-up](foley-replacements-2026-09-10.md) removes launchers and replaces jump/grow/unstick; use that receipt for the current 18-cue preview.

## Reason and scope

Tyler rejected the first 75-cue pass because it sounded random and its sources were unclear. He requested deliberate effects that stay wacky, chaotic and cartoony. This revision is confined to `/home/tyler/Projects/rat-detective-chaos-foley`, branch `codex/chaos-foley`, and its existing private audio preview. The original active checkout, its newer game changes, other previews and production were preserved. No commit or merge occurred.

The worktree contains the captured dirty baseline, not just committed HEAD. Integration must use `output/chaos-foley-only.patch` against `output/audio-baseline/`, reviewed against any subsequent source changes. The previous implementation and its first preview remain recorded in [the historical receipt](chaos-foley-2026-09-10.md).

## Revised behavior

- Removed incidental motion, ambient/scenery sounds, ordinary/material ricochet layers, flybys, machine busy/reset sounds, extra Scattershot audio and extra assignment milestone notifications.
- Retained short physical accents for clear actions and personal feedback. **24 WAVs**, 275,856 bytes, 75–450 ms; no new loops or enclosure echo.
- New world accents require nearby camera-visible sources and unobstructed rays against authored static camera blockers. They pan left/right and fade to zero within 16–26 units.
- At most one candidate per snapshot, three visibility rays per 160 ms, three simultaneous world voices and eight total reusable voices/panners. Excess events are dropped immediately. Personal feedback stays centered.
- Shared cosmetic annotations remain protocol 4 and bounded by the original impact budget. Most ordinary annotations no longer produce a new sound. Existing gun/rat/feedback/music implementation, gameplay tuning and rules retain the captured baseline.

[Current trigger and mix notes](../chaos-foley.md) and [asset provenance](../../public/sounds/chaos/README.md) describe the retained effects. `output/chaos-foley-audition.html` was refreshed with only the revised bank. Removed files are preserved in ignored output, outside the public/build bank.

## Verification

| Check | Result |
|---|---|
| `npm run typecheck` | Passed |
| `VITEST_MAX_WORKERS=2 npm test` | **653 passed: 107 Worker, 524 client, 22 script** |
| `npm run build` | Passed; `index-Bm83PCqX.js`, 957.13 kB minified / 272.95 kB gzip |
| Event and audio checks | Incidental/distant/behind-camera/occluded/weak events stay silent; snapshot deduplication and bounded rays; one accent per snapshot; stereo orientation; bounded loading/voices and cleanup; heavy landing at 30/60/120 Hz; retained protocol/contact/HUD checks |
| Asset integrity | All 24 mono 24 kHz/16-bit clips non-silent, distinct hashes, zero-valued edges and below full scale |
| Preservation | Nine selected existing audio/gameplay files byte-identical to the captured baseline; no public ambient/scenery emitter remains |

Logs: `output/foley-deliberate-tests-final.log`, `foley-deliberate-typecheck.log`, `foley-deliberate-build.log`, `foley-deliberate-asset-qc.json`. Vite retains its existing large-chunk advisory; no frame-rate or perceived audio-quality claim is made.

The first focused run required the session mock to expose an empty scene child list. The initial full run found that updating the entire camera subtree also invoked its AudioListener prematurely; the observer now reads the camera world transform without updating children, leaving child audio updates to rendering. Resource-lifetime and observer tests then passed, followed by the complete passing suite.

## Updated private preview

[Play the revised mix](http://127.0.0.1:5186/?room=graybox-benchmark-match-deliberate-foley&diagnostics=quiet). Expires **September 10, 2026 at 3:48 AM Pacific / 10:48 UTC**. Reload an already-open audio preview to load the new client. This still uses the captured audio-worktree game baseline, not separate municipal-race or later camera work.

Private Worker: **`rat-detective-chaos-foley`**, version **`e39175b8-0e8d-45e2-aa64-0630ff6ff62e`**. The existing `rat-detective-foley-preview.service` was restarted to serve the newly frozen fixture on port 5186. Only this audio Worker and relay were refreshed. The hosted endpoint is authenticated; use the loopback play link.

The passive readiness check compared HTML, JavaScript and all **24 WAVs** byte-for-byte with the immutable fixture. In a separate private room it received protocol 4, 8 rats, **180 valid snapshots**, zero invalid packets and 604 raw server foley annotations over 6.5 seconds, then closed. Those annotations include ordinary bounces deliberately filtered out by the revised client; this check establishes delivery, not audible selection or subjective quality. No gameplay input or browser automation was performed.

Client SHA-256: `8c19b758de7afa769248f67a6788fced896cc956fd9146ff5b5cd39ef7227467`. Deployment receipt: `output/foley-preview-2026-09-10T06-48-21-213Z/deployment.json`; readiness: `output/foley-preview-readiness.json`. The relay and copied simulation expire automatically. Human listening for clarity and cartoon character remains pending for this revision.

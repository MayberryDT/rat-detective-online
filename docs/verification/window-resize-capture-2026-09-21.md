# Fullscreen and automatic clip bounds — 21 September 2026

Tyler reported gameplay remaining at its original small-window size after the
first fullscreen transition and automatic highlights showing only a narrow
part of the game. Two separate stale-dimension defects reproduced in focused
code tests. No gameplay/input automation or desktop control was used.

## Diagnosis

Ranked hypotheses and evidence:

1. The recorder retains its original rectangle: confirmed. Installed and source
   `capture.py` match. The live helper last reported `941x1030+967+38`; GSR's
   1920×1080 output limit scales that aspect to the **986×1080** found by ffprobe
   in the seven newest recordings. `tick()` previously checked window existence
   but never movement or size. The resize/move regressions retained the old
   region before the fix.
2. Game preparation loses a resize: confirmed. `createStage` sizes the renderer,
   then asynchronous city/shader preparation yields before `GameSession` installs
   its resize listener. A resize in that interval is lost. The real-stage/session
   regression reproduced a 1280×720 canvas after switching to 1920×1080; another
   resize event was previously needed to correct it.
3. The library player crops full-width media: rejected for these clips; the
   narrow aspect is already encoded in the originals. Changing the player cannot
   restore pixels outside the recorded region.
4. An output-resolution limit alone crops the image: rejected. GSR documents
   `-s` as an aspect-preserving fit; `-region` selects the actual source rectangle.

These are related in symptom and trigger, but the game renderer and recorder
have independent dimension ownership.

## Changes

The stage now owns a cheap `syncViewport()` comparison. The prepared first render
and every session frame reconcile window width, height and capped pixel ratio
before drawing. Camera aspect and drawing size update together. The idle title
redraws only when dimensions change, preserving its ordinary static backdrop.
No resize event needs to arrive at a particular point in startup.

The helper remembers the captured window address and region. Its existing timer
checks current bounds and restarts the owned recorder when that window moves,
resizes or disappears. It prefers the same window when several game windows
exist. Already dispatched media jobs finish against the original recorder;
unfinished scheduled intervals are explicitly journaled as missed. New saves
are disarmed during the transition. A successful recorder start establishes a
fresh capture epoch and coverage start, so the next clip cannot claim old-buffer
buildup. Unchanged geometry does not restart recording.

GSR 6.1.0 offers no live region-update command. Moving or resizing therefore has
a brief polling/restart gap and resets replay buildup. Saved clips stay intact.
The existing region backend captures desktop pixels inside the app rectangle;
it does not provide compositor-level window isolation. This fix retains that
backend and existing capture permissions.

## Verification and release status

Initial failing commands:

- `npx vitest run --config vitest.client.config.ts test/client/sessionResources.test.ts --testNamePattern='first fullscreen'`
- `node --test --test-name-pattern='capture follows' test/scripts/highlightsService.test.mjs`

The same commands pass after the correction. Focused coverage also verifies a
missing resize notification, return to a smaller window, device-pixel-ratio cap,
no repeated idle draws, movement without a size change, unchanged bounds, an
in-flight save, missed unfinished intervals, same-window ownership with multiple
apps and truncated buildup after restart. These tests replace OS/GPU boundaries;
they do not claim a new real recording or human fullscreen acceptance.

Typecheck and production build pass. Build assets are `index-BL9xcsnh.js` and
`createGame-BSxvfOuu.js`; protocol stays 18. Full-suite rerun passed **174 Worker**, **1,182 client** and **109 script**
tests. Two script tests failed: the existing launcher focus test returned
`pending` instead of `focused`, also reproduced in an isolated copy with the
pre-fix helper; the invitation launcher assertion saw interleaved shell log
writes and passed in that baseline run. Launcher code was not changed.
The first full run also encountered a Worker bot-roster assertion (6 versus 8);
all Worker tests passed on rerun. These failures keep the full command from
being reported as green. Python compilation, whitespace and documentation-link
checks pass. Build/test logs are in
`output/window-resize-capture-2026-09-21/`.

The initial correction did not deploy. Tyler subsequently authorized the
production release below. No Git commit, GitHub publish, shell restart or
automated live capture was performed.
Existing cropped clips cannot be repaired from their files.

References: [Three.js responsive rendering](https://threejs.org/manual/#responsive),
[pinned r182 example](https://github.com/mrdoob/three.js/blob/r182/manual/en/responsive.html),
[GSR control commands](https://git.dec05eba.com/gpu-screen-recorder/tree/gsr-cli.1).
Binding: `.research/window-resize-capture-implementation-references.json`.

## Local helper installation

Installed `highlights/service.py` in both the existing helper and plugin copies
on Veelox, after checking that the helper was idle. Both installed copies match
the tested source SHA-256 `4f48f734887e0916522123ac927ec8f32955bd6e65a025b0248825cad703631f`.
Restarted only the helper through its owned shutdown/launcher commands. Status
returned `ready`, enabled, waiting for the game, recorder off, with all **8 clips**
preserved. Backups and the filtered installation receipt are in the output
folder above. The next human session verifies native recording after resize;
the public client was subsequently released with Tyler’s approval.

## Authorized production release

Tyler replied “yes” to deploying the fullscreen fix. Deployed the already tested
build with `npx wrangler deploy --env production`. Worker **`7b3c4b2a-1a75-48b4-b36c-bda91bcb3248`**
replaces `9dc57656-314d-4f86-88d2-86a5af809b7c`; protocol remains 18.
Client assets: `index-BL9xcsnh.js` / `createGame-BSxvfOuu.js`.

All **58 files** in the built asset set match production byte-for-byte, with
`index.html` checked at its canonical `/` URL (`/index.html` redirects). Health
returned OK. The original room `public-live-v2`, world version 2 and seed
341283204 remain. Companion samples showed **0 humans / 9 named bots**, active
Jurisdiction, revision **378783 → 378865** over
**59.7 seconds**, and changing scores.
The old domain returns 301 redirects preserving both root and an asset query.
Deployment and exact verification receipts are in the output folder above.

Close and reopen the game to load the new client. Actual human fullscreen and
resized clip acceptance remain unverified; no browser input test was run.

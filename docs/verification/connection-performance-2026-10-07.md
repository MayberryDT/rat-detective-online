# Connection/performance repairs — 7 October 2026

## Scope
Tyler authorized implementation and testing after the Halla investigation: “do it all, test it all, fix it all”. All work runs on Halla, on branch `fix/connection-performance-20261007`, rooted at accepted release `6af05f2` / source `2822d1a`. No work on Veelox, no Nova workers, no production/staging deployment or shared-plan mutations. Protocol 33, layout 7, packed-history ancestry 2476135 and accepted game behavior remain intact.

## Repairs
- Auto graphics previously treated a weak first reduction as evidence against the entire resolution/extras category. Medium only thins rain; low also removes grain/haze. Similarly, one small pixel reduction can fall below the 8% gain margin even when a stronger one is worthwhile. Auto now tries the strongest remaining level once before rejecting the category, judging it against the same original baseline. Ineffective probes restore all added steps; unsuccessful deep probes wait ten minutes before another deep attempt. Manual modes and existing quality assets are unchanged. Existing upward probes still seek a finer worthwhile level.
- Perf CPU time now starts at actual frame callback entry, rather than the rAF timestamp. New schedule50/schedule95 fields report callback delay separately. Older cpu50/cpu95 values included that delay and must not be compared as pure callback cost.
- Connection lifetime diagnostics retain the latest bounded failure category, close code, last-message age/visibility at failure, retry count, recovery duration, invalid updates and send failures. The normal perf report carries these after recovery. Raw close reasons, URLs, names and resume credentials are not added to this report. Server delivery timeout/backlog closes now carry fixed categories instead of one generic reconnect message. No timeout or flow-control budget was relaxed.
- The deterministic room benchmark no longer calls removed trapArming; the capacity renderer uses GRAYBOX_VERSION rather than obsolete layout 2. The intentionally optional offline title path tracer is excluded from the normal test TypeScript project, as its README now explains.

## Evidence and limits
Regression cases for the new telemetry and quality failure were written and observed failing before their respective fixes. Focused quality tests preserve manual settings, hitch/hidden-tab handling, recovery to finer quality, noisy frame behavior, and restoring full quality on CPU-bound input. The old CPU-bound assertion sampled inside a newly bounded probe; it now allows the two-window probe assessment to finish before asserting restoration.

Process-level E2E: `scripts/verify-connection-recovery.mjs` runs the actual NetworkManager/decoder over real sockets to an isolated CI Worker. Two clients join; one socket is terminated, then that client's acknowledgements are deliberately stalled on its next connection. Both recoveries retain the same rat; the peer never drops. The stalled-ACK failure reports delivery-timeout / 1013, recovers in about 590 ms in the recorded run, and both clients have zero invalid updates and send failures. This is a transport/runtime E2E, not a human gameplay preview or a hosted-runtime equivalence claim.

Prior Halla hosted staging/production transport tests each kept two clients connected for 90 seconds without unexpected closes. Tyler's original Brave disconnect cause remains unproven; new diagnostics are intended to identify it if it recurs. A bounded successful test cannot certify indefinite stability.

### Rendering experiments rejected
No speculative city renderer change is retained. Disabling world-matrix updates on 342 static nodes produced identical frozen-pose pixels but inconsistent timings. Doubling graybox batch cells reduced whole-frame draw calls roughly609→567, but alternating baseline/candidate render medians were13.3/12.7,11.1/11.0,12.7/12.1 ms, with more GPU geometry and ordinary timing drift. That is insufficient evidence for a useful win. Existing projectile/corpse batching stays intact. The Auto repair has a reproducible controller failure model; no specific FPS gain on Veelox is claimed.

### Existing test failures repaired
The untouched release independently reproduced20 client failures in six files: incomplete DOM/scene fixtures and obsolete trap-arming/feedback expectations from before the accepted protocol33 release. Fixtures now supply the DOM/scene operations exercised by the shipped code, model an actual victim for health-decrease confirmation, and check immediate trap availability without the removed delayed-ready cue. Production gameplay was not changed to satisfy stale tests.

The unrestricted parallel Worker suite initially timed out several live bot-room cases and lost acknowledged test connections. All57 tests in those three files passed when run sequentially. The Worker test configuration now caps concurrent isolates at two to avoid mistaking test-host saturation for a delivery defect; runtime deadlines are unchanged.

## Repeat
Run on Halla in this checkout:

```sh
npm run typecheck
npm test
npm run build
node scripts/with-local-worker.mjs -- node scripts/verify-connection-recovery.mjs --out=/home/halla/build/rat-detective/connection-pass-2026-10-07/connection-recovery-e2e.json
node scripts/benchmark-server-tick.mjs --room --bots=10 --recipients=4 --ticks=1800 --label=connection-final
```

All detailed artifacts are under `/home/halla/build/rat-detective/connection-pass-2026-10-07`: before-fix-tests.log, after-fix-tests.log, quality-before.log, quality-after.log, baseline-client-failures.log, repaired-client-fixtures.log, repaired-canvas-fixtures.log, connection-recovery-e2e.json/log, controlled/batch-comparison.json and images, controlled/static-matrix-ablation.json, plus the earlier findings.md/proposed-changes.md and hosted receipts. Historical failed/excluded experiments remain labelled; they are not passes.

## Final checks
- `npm run typecheck`: passed.
- `npm test`: passed, 288 Worker + 1,547 client + 46 Node script tests = **1,881**. Worker parallelism cap passed the complete suite; no production deadline was changed.
- `npm run build`: passed. Existing bundle-size warning remains; no build error.
- Connection recovery E2E: passed, including same-rat restoration and unaffected peer after forced drop and delivery timeout.
- Final deterministic benchmark: trajectory **b1fc85281dbb2207**, identical to the released diagnostic baseline. Tick median4.413 ms, p95 25.037, p99 32.584, max43.746;158.2 KB/s/client. No simulation-speed improvement is claimed; these checks preserve gameplay, and exclude real sockets/storage.
- `git diff --check` and packed-storage ancestry check: passed.
- `quality-comparison.json` records released/candidate controller traces for threshold and CPU-bound response models. Released Auto stays High in both threshold cases; candidate reaches the useful deeper setting and still restores full quality for ineffective reductions. These are simulated response models, not device FPS measurements.

The synthetic era-report fixture now inserts its rows in one SQLite transaction, avoiding thousands of per-row fsyncs; data and assertions are unchanged. Earlier full-run logs remain available alongside the final passing run.

All owned browser/server/E2E processes exited. The original Halla release checkout is clean. Build output is under the artifact directory through local symlinks; Veelox was untouched. No deployment was performed, so these changes are not yet live. Independent external review and human device validation were not performed; this receipt records implementation and automated verification, not final human acceptance or a proven explanation of the original Brave disconnect.

# Highlights UI — selected direction 01

Tyler selected direction 01 on 2026-09-21: “go with 01”. See `concept-selection.json` for the prototype hash. No additional taste changes were requested. Do not restart concept exploration. This packet is implementation preparation, not a validated final design lock.

## Scope and ownership

Rebuild `omarchy/plugin/components/HighlightsWindow.qml` around the selected two-pane layout. Add narrowly scoped local UI components only when they materially simplify the implementation. Update `HighlightsModel.js` and focused JS/QML tests for selection and presentation helpers. Keep `Service.qml` changes limited to UI integration needs; do not change capture, detection, encoding, bridge protocol, game behavior or production deployment.

The repository contains substantial uncommitted shipped work. The worker is not alone: preserve others' edits and do not reset, clean, replace files with HEAD, commit, publish or deploy. An isolated worktree would omit the working highlight implementation. Before edits, run the required code caller/blast queries and inspect current sources.

## Selected behavior

- Native Omarchy theme/font tokens through `DispatchAppearance`; no hardcoded Nightwire-only colors in QML.
- Header with truthful capture state; All clips, Favorites and Session reels navigation; title search and themed session selector.
- Left library beside a larger player. Clear selected title, duration and status. Scroll library independently; keep transport and principal actions reachable at the minimum window size.
- Use installed `qs.Ui.Dropdown`, which accepts `{value,label}` options and emits `changed(value)`. Existing session objects use `{id,label}` and need an explicit adapter.
- Preserve selected clip by ID across polling, filtering and favorite updates. Clear or choose a valid successor after removal; never allow a shifted index to rename, trim or delete a different clip.
- Play/pause should resume position. Source changes should reset position and initialize persisted trim bounds. Seek only when the media is seekable. Stop on close and when selection changes. Represent missing/corrupt media clearly.
- Show trim controls on demand and bring them into view. Put rename, reveal and delete in the secondary menu. Offer undo after delete. Export gets a focused destination dialog and truthful queued/running/completed/error/cancel feedback.
- Native keyboard/focus behavior throughout. Escape closes the innermost menu/dialog first. Errors remain readable without color alone. Keep agent QA muted.

## Verified integration facts

Existing `Service.qml` already exposes favorite/delete/undo/reveal/rename/trim/export clip/export reel/regenerate reel/cancel job and session selection. `highlightTrim` receives normalized fractions and converts to milliseconds. Catalog clips expose `duration_ms`, `trim_in_ms`, `trim_out_ms`, `created_at`, `favorite`, `status` and a verified local file URI in `path`.

The inspected catalog does not expose a thumbnail URI. The HTML preview repeats one saved clip still as a fixture. Native implementation must provide truthful per-clip thumbnails through a bounded cache or a clearly identified media fallback; never use that repeated prototype image as production content. Evaluate the smallest safe local thumbnail path before adding a dependency or changing the capture pipeline.

## Verification

Run focused model/QML tests covering ID-stable selection, filtering and persisted trim bounds, then `omarchy/plugin/tests/run`. Existing `tests/qml/tst_highlights.qml` covers labels only, so it is not proof of window behavior. Use the project's appropriate application checks when shared files change. Native acceptance on Ibara should cover wide/narrow windows, long titles, empty/missing/corrupt clips, keyboard dropdown operation, player resume/seek, trim validation and export feedback. Use fixture data for destructive-action tests, preserving real recordings.

Update current UI documentation and record actual verification. No game deployment is needed. Installing the local plugin update must preserve settings and recordings.

## Execution policy — corrected 2026-09-21

Tyler retired the Cursor requirement and confirmed main-agent implementation by default, with native Codex agents when delegation is requested. The previous missing-bridge blocker is resolved by this policy correction. Direction 01 remains selected; no client reload or repeat concept selection is needed.

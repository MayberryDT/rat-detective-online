# Visual baselines

Reviewed 2026-09-08. These files cover the fixed visual fixture, not the full live city or latest gameplay-camera acceptance. See [visual tools](../README.md) and [current state](../../../docs/current-state.md). Preserve existing captures until a reviewed update is requested; do not bless a changed rendering simply by regenerating expectations.

Baselines are reviewed PNG captures named `seed-<seed>-<alive|turned|damaged|dead|respawn>.png`.

An empty directory is not a passing visual test. Capture with
`UPDATE_VISUAL_BASELINES=1 npm run smoke:visual` only after inspecting the
fixture at `/visual-fixture.html?seed=20260905`.

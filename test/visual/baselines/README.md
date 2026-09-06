Baselines are reviewed PNG captures named `seed-<seed>-<alive|turned|damaged|dead|respawn>.png`.

An empty directory is not a passing visual test. Capture with
`UPDATE_VISUAL_BASELINES=1 npm run smoke:visual` only after inspecting the
fixture at `/visual-fixture.html?seed=20260905`.

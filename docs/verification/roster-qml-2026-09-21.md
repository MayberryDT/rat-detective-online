# DispatchRoster QML regression repair — 21 September 2026

Follow-up to the two existing failures recorded in
[Clips audio/export verification](clips-audio-export-2026-09-21.md).

The original `bash omarchy/plugin/tests/run-qml` reproduced 35 passes and two
failures with Qt 6.11.2. The candidate causes were hidden test ancestors,
explicit single-line text constraints, and delayed layout. Changing only the
test container to `visible: true` and waiting for `windowShown` fixed the
bot/human visibility assertion; the wrapping failure remained. QtTest's
installed `TestCase.qml` defaults to invisible, so child `visible` checks were
testing an effectively hidden scene.

`DispatchRoster.qml` explicitly used `NoWrap`, a one-line maximum and right
elision, contrary to the existing wrapping test and `docs/omarchy.md` contract.
Restoring `Text.Wrap` and `Text.ElideNone` without the line cap fixed the second
failure. Existing width budgeting, text metrics, participant classification and
row sizing are preserved. The long-name fixture now includes a bot label and
asserts that the following row clears the expanded row and the label fits beside
the name without overlap. No timeout increase was needed.

Verification on the existing dirty working tree:

- `bash omarchy/plugin/tests/run-qml`: **37 passed, zero failed**.
- `bash omarchy/plugin/tests/run`: **23 passed**, shell syntax and Python AST
  checks passed.
- Omarchy plugin skill's `validate_plugin.py omarchy/plugin`: **VALID**.
- `git diff --check`: passed.

Before-edit copies and the final QML log are in the ignored local directory
`output/roster-qml-2026-09-21/`. Checks use the repository's offscreen QtTest
fixtures and import stubs; live-shell appearance and lifecycle were not tested.
No installation, restart, deployment or publication occurred. Prior audio/export
and other working-tree edits are preserved.

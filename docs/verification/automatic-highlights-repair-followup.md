# Highlights repair follow-up review

19 September 2026. Review of the response claiming the audited code is repaired and locally installed. **Verdict: partial repairs and a real local installation; the feature and several audited defects remain incomplete.** Continue the [existing repair handoff](../handoffs/automatic-highlights-repair-handoff.md).

## Verified progress

Installed manifest is now 1.3.0, the Highlights window exists, and saved capture settings have `enabled: false`. Source changes include clip media URLs, filtering/rename controls, correlated extension replies, stale-session checks, detector repairs, retention reservations and corrected GSR replay arguments. These are real improvements, not proof of end-to-end acceptance.

The installer's refusal concerned an existing locally modified DispatchRoster file. Its SHA-256 prefix is `419fcda89bf7273e` in the backup, repository and installed package; this comparison found no loss of that file. It does not establish preservation of every installed customization or a tested rollback. A copy-over after an installer refusal needs a recorded reconciliation, not a blanket claim of safe upgrade.

## P1: F1 remains broken in the actual setup path

`omarchy/plugin/scripts/rat-detective-desktop.py:885` constructs `portalEvidence` from `game_windows()`: `matchesGameWindow = bool(windows)` and `userConfirmed = True`. It labels `user-preview` as enforced without obtaining a preview response. This is the original game-window-existence assumption packaged as evidence.

`omarchy/plugin/scripts/highlights/service.py:286` gives these supplied fields precedence over `inspect_source()`. The new negative test calls `confirm_setup` without the evidence that the actual CLI always supplies, so it misses the real integration failure.

**Reproduced using the actual desktop function and service with a fake recorder:** generate the CLI request with an existing Rat Detective window, make recorder inspection explicitly return `sourceKind: monitor` and `matchesGameWindow: false`, then perform setup and session-start. Results: `sourceConfirmed: true`, session accepted, capture ready. No real recording or audio routing occurred.

Setup also stops its preview recorder, after which `service.py:387` starts another portal session and immediately confirms it as a window without inspecting that new source. A valid first selection would not validate the next picker selection.

See [the runnable reproduction](automatic-highlights-repair-followup/isolation.py) and [exact output](automatic-highlights-repair-followup/isolation-result.json). Run from the repository root with Python. It asserts the defect; successful execution is evidence of failure, not feature acceptance.

Required correction: derive source evidence from the owned active capture, reject monitor/unknown/mismatched sources regardless of CLI booleans, implement the actual transient preview/confirmation, and revalidate every replacement capture session. Follow H00's app-owned integration route if the recorder cannot expose sufficient evidence.

## P1: F8 is only partly repaired

`service.py:500` and `:513` still call FFmpeg exports synchronously from the single-client socket loop at `:592`. `export.py` is byte-identical to the version in the original audit. The live service still does not use its export queue, and `job` remains unset. Long exports therefore still block stop/status/heartbeat/lease processing.

Catching unknown operations and response-write errors is useful, but does not fix that architecture. Cleanup at the bottom of `serve` is not a `finally`; an exception escaping request handling still bypasses it. The helper entry point's `finally` only releases its file lock. Finish bounded asynchronous media work and cleanup on all exit paths, with slow-export and exception tests.

## Remaining delivery scope

The QML library now filters and offers rename, but it still has no session selector, reel preview/editing, export progress/cancel or destination chooser. `last_session_id` is held only in process memory, so the completed-session shortcut does not survive helper restart. These are missing implementation, not native-verification gaps.

Ibara unavailability reasonably blocks picker, audio-isolation and native UI evidence. This review did not independently verify the prior busy status or acquire a desktop. It does not explain omitting the asynchronous job work, remaining UI, durable session selection, packaging/rollback checks, or preparation of the matching hosted preview.

The repair receipt explicitly omits the full test/build checks because the tree is dirty. Existing uncommitted work requires preservation and careful attribution; it does not by itself prevent running checks. Record actual failures or blockers rather than treating a dirty tree as an exemption.

The guide tells Tyler to use a matching preview which the response says was never prepared. The connector remains unloaded according to that response. The production client is reported unchanged. The installed version therefore is not yet a usable route to automatic highlights.

## Next instruction to the implementation agent

Continue the current repair handoff through all independent work. Add the monitor-evidence override and replacement-session cases to normal regressions. Close F1 and F8, finish H05–H08's remaining controls/jobs/recovery, prepare the frozen matching hosted preview, and run applicable checks. Use Ibara for the real native proof when available, following its access rules. Preserve explicit blocks only for dependent steps; leave capture off on Veelox and do not deploy production or publish.

This follow-up changed only review evidence/documentation. It did not reload the shell, install software, enable recording, acquire a desktop or alter implementation code. It is a focused follow-up, not a claim to have re-audited every repaired path.

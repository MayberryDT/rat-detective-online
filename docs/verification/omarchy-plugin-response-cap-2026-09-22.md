# Rat Detective Omarchy plugin 1.3.2 response cap — 22 September 2026

## Release identity

- Plugin: `co.animasai.rat-detective`, version **1.3.2**
- Repository: <https://github.com/MayberryDT/rat-detective-omarchy>
- Commit: `0212362d8810505423622c0af3dafb414c7f128f`
- Annotated tag/release: [`v1.3.2`](https://github.com/MayberryDT/rat-detective-omarchy/releases/tag/v1.3.2)
- Package content hash: `78111f0f4b41e96ca2613cf7c2b12ea35ba9fa114adf820875a8117aad6ba65b`
- Public CI: [Validate plugin release run #15](https://github.com/MayberryDT/rat-detective-omarchy/actions/runs/35822752447), successful on this commit

## Change

Marketplace review of 1.3.1 found that `Service.qml` passed the remote Dispatch response directly to `StdioCollector`; curl's five-second deadline did not limit response bytes.

The service now invokes `scripts/bounded-dispatch-fetch.py`. The helper accepts at most 65,536 response-body bytes and a separate 256-byte HTTP status/content-type trailer. Thus the complete stdout payload reaching QML is at most 65,792 bytes. It rejects overflow without forwarding a partial response, keeps the five-second curl deadline and fallback metadata, discards child stderr, and terminates/reaps curl on cancellation.

## Verification

- `tests/run`: 24 Node checks and 10 local HTTP E2E cases passed. Fixtures cover normal and exact-limit bodies, fixed-length and chunked overflow, oversized error bodies, 404/HTML fallback metadata, a drip-fed timeout, oversized child stderr and cancellation/reaping.
- `tests/run-qml`: 37 QML checks passed.
- Native `omarchy plugin validate` passed.
- `validate_plugin.py` passed.
- Clean release preflight reported READY. Its advisory QML-process, collected-input, installer, package-manager and privilege notices remain review prompts, not certification.
- Repeatable E2E report: `/home/tyler/Projects/rat-detective/output/omarchy-response-cap-2026-09-22/e2e.json`; full test logs are alongside it.

## Marketplace status and limits

The existing [submission issue #6926](https://github.com/omacom/omarchy-plugin-marketplace/issues/6926) remains open. Its maintainer notes identify this exact commit, release and test evidence. The marketplace [issue-automation run #27950](https://github.com/omacom/omarchy-plugin-marketplace/actions/runs/35823008958) completed analysis and produced artifact `validation-reports-35823008958-1` (artifact SHA-256 `5d68b9c029e5a51c7ef2c8950fe99a692e6945b475624d65c48d267ef018b028`). The report passes repository/manifest/Quattro compatibility checks for `0212362`; its result is **Ready for listing review**. The automated security baseline reports **manual review required**, with no findings, because the plugin has installer scripts. A maintainer must review that capability before `approved-and-verified`.

The workflow's serialized issue-publication job remains queued behind unrelated marketplace writes, so these refreshed reports are in the run artifact but are not yet posted to issue #6926. The issue is still open with its previous `needs-fixes`/`security-review-required` labels; the older comments describe 1.3.1 and do not establish approval for 1.3.2. No new issue was opened and no approval label was applied. Automated compatibility passing is progress, not marketplace acceptance.

The live Omarchy shell and install/update/removal lifecycle were not rerun for this patch. Veelox remains on 1.3.1. The game Worker and production service were not changed. Marketplace acceptance remains a maintainer decision; automated checks are not a security audit. Remaining gates: publish the refreshed report to issue #6926, then complete maintainer security review and approval.

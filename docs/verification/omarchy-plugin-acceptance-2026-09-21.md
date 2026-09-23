# Rat Detective Omarchy plugin acceptance — 21 September 2026

## Verdict

**Runtime acceptance passed after one lifecycle repair.** The exact repaired
`co.animasai.rat-detective` 1.3.0 export validates, loads in the real Omarchy
shell, renders its bar entry, and cleans up its helper after disable/removal.
Portable, QML and focused service checks all pass on Ibara. Ibara was restored
to its starting plugin inventory and exact `shell.json` hash.

At the time of this acceptance pass, deployment and publishing remained on hold:
the repository was intentionally dirty and the final human gameplay session was
still outstanding. Tyler later completed that check, reported that everything
looked good and authorized deployment and publication. The release closure is
recorded in [Omarchy plugin 1.3.1 release](omarchy-plugin-release-2026-09-21.md).
This pass itself did not publish, tag, push, deploy the Worker, change marketplace
state or leave the plugin installed on Ibara.

## Scope and candidate identity

- Repository: `/home/tyler/Projects/rat-detective`
- Git `HEAD`: `918ed23ce4868426b091b7eeb165f5dd5af17fbf`
- Source: the preserved dirty working tree; `HEAD` is not the candidate identity
- Plugin: `co.animasai.rat-detective` version `1.3.0`
- Final export:
  `output/omarchy-acceptance-20260921-172816/export`
- Export content hash: `f370ee7bb1646b59a7134590db0a6dcb5d95cce1b7362f93816c2687e1398512`
- Connector content hash: `1b52f323819ea12c89749687988f874d5ad7c5a150c3df6ffc0f6e26fbf76cd3`
- Ibara transfer archive:
  `output/omarchy-acceptance-20260921-172816/ibara-candidate.tar.gz`
- Transfer SHA-256:
  `1c0b15d28fb4f8df771066cb8aa6cd3202f84d733840a32698127abad5be930c`
- Final `release.json` SHA-256:
  `e71ad39b0c02d9c4964a27909d4ba22a0e6721f8b214d20e21bf17e6edf7d8c3`
- Final `scripts/highlights/service.py` SHA-256:
  `b2f86501fd5b3632ee71a2e9fc0f0beee8e37423b9548eccf3cba2875dddc8b3`

The export and installed Ibara copies of both `release.json` and `service.py`
matched byte-for-byte.

## Defect found and repaired

The first real-shell pass found that disabling the plugin removed its bar and
panel surfaces but left the Highlights helper process running. Source diagnosis
found a more important safety defect beneath that symptom: the helper accepted
20-second control-lease renewals but never enforced lease expiry. An enabled
owned recorder could therefore survive plugin disable/removal.

The repair in `omarchy/plugin/scripts/highlights/service.py`:

- establishes a fresh bounded lease on Enable and Resume;
- stops owned capture and audio routing when the lease expires;
- sets `arm_held` and reports `interrupted`, so the same tick cannot re-arm and
  the user must explicitly Resume;
- permits automatic capture only while the control lease is live; and
- exits an idle helper after the same grace interval when there is no live
  lease, capture, media save or export job. Requests inside that interval retain
  the helper, preserving the documented brief shell-reload reattachment path.

The regression was written before the implementation change. It covers lost
lease teardown, held re-arm, idle exit and reload-grace activity. Existing
resize/reframe fixtures now establish the lease their scenario requires.

## Acceptance matrix

| Behavior | Status | Evidence and limits |
| --- | --- | --- |
| Manifest and package contract | pass | Toolkit and native `omarchy plugin validate` passed; the export has a complete file/mode/SHA-256 receipt and a separately receipted connector. Release preflight correctly remains blocked by the dirty repository. |
| Advisory security boundary | pass | Advisory validator and focused command/path review found no unexplained runtime download, privilege or unsafe-command finding. This is not a standalone penetration test. |
| Portable plugin behavior | pass | Exact repaired export: 24/24 model/helper checks on Ibara. |
| Hosted QML behavior | pass | Exact repaired export: 37/37 Qt 6.11.2 QML checks on Ibara, Omarchy 4.0.3. |
| Repository integration | pass | Before the lifecycle repair: focused integration 84/84, `npm run typecheck`, full `npm test` 1476/1476 and `npm run build`. The affected service file was then rerun on Ibara with 11/11 focused checks. No automated pointer-lock/gameplay input was used. |
| Exact export identity | pass | Final archive SHA-256 matched on Veelox and Ibara; installed receipt and service hashes matched the transferred export. |
| Bar and panel lifecycle | pass | Real Ibara shell showed the live Rat Detective bar entry; panel open/re-open/close and fixture clear had already passed on the preceding exact candidate. The repair changed helper lifecycle only. Disable removed the bar entry. |
| Service and helper recovery | pass | Ibara 11/11 service tests include lease expiry, explicit Resume hold, idle exit and resize/reframe. The real shell helper was observed while enabled and absent after disable/removal. |
| Highlights library journey | pass in fictional fixture | On Ibara: wide and 700×900 compact layouts, favorite, muted playback, rename, exact trim persistence, delete/undo, clip export, reel export, Escape dismissal, restart and duplicate-surface rejection. Fictional media only; no production recording was altered. |
| Install/update/removal safety | pass in tested scope | Exact export installed, enabled, disabled and removed in the real Ibara shell. Export/install/rollback regressions passed earlier. Omarchy's hidden removal backup was moved into the task workspace rather than left in plugin discovery. |
| Restoration | pass | Ibara ended with zero surfaces, no Rat Detective plugin/backups/processes/runtime/config/state, and the original shell hash `6885b2cff8a0f8d57eeda3f71f3b878ed44730a29cc7b9a0f924c5dfa43564e4`. Pre-existing cache frames and empty Videos directories were preserved. |

## Ibara evidence

- `task_541e749ff02a4155b7a363790ac2e28e`: isolated fictional
  Highlights library journey and deterministic exports.
- `task_d263c00fd761454cafacb15014de42d4`: first real-shell install,
  enable, bar/panel/fixture/Clips checks; found the teardown defect; restored
  Ibara before source repair.
- `task_27d958fda91a4627b4aadcaa041e99cc`: repaired exact-candidate
  checksum, 11/11 lifecycle checks, 24/24 portable checks, 37/37 QML checks,
  native validation, exact install identity, live enable/disable/removal and
  complete restoration. Controller completion recorded every criterion met with
  no verification gaps.

Testing stayed on Ibara. Veelox was used for repository inspection, source
editing and reproducible artifact construction. Temporary transfer servers were
stopped immediately after each transfer.

## Release-gate closure

The original gates closed later on 21 September:

1. The release was rebuilt in the clean standalone
   `MayberryDT/rat-detective-omarchy` repository and passed release preflight.
2. Tyler completed the human check, reported that everything looked good and
   explicitly authorized deployment and publication.
3. The final 1.3.1 package received a new content receipt, public CI run,
   annotated tag and GitHub release. The marketplace validated that exact commit.

This acceptance receipt remains the evidence for the accepted runtime. The
separate release receipt records the later packaging-only 1.3.1 adjustment and
public identities.

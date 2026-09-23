# Rat Detective Omarchy plugin 1.3.1 release — 21 September 2026

## Outcome

Rat Detective Dispatch **1.3.1** is deployed to its public standalone repository,
installed locally on Veelox and submitted to the Omarchy plugin marketplace.
The marketplace's automated validation and security baseline cover the exact
release commit and report it ready for listing review. Actual catalog listing is
still gated on a marketplace maintainer manually reviewing the disclosed
installer capability and applying `approved-and-verified`.

No game Worker was redeployed. The production client already contains the
highlight event bridge and the existing companion endpoint already serves the
plugin's live data contract.

## Immutable identities

- Repository: <https://github.com/MayberryDT/rat-detective-omarchy>
- Release: <https://github.com/MayberryDT/rat-detective-omarchy/releases/tag/v1.3.1>
- Annotated tag: `v1.3.1`
- Commit: `36a56b14f9497170b0de49cb3ca9618b6e1864c6`
- Public CI: <https://github.com/MayberryDT/rat-detective-omarchy/actions/runs/35680129927>
- Marketplace issue: <https://github.com/omacom/omarchy-plugin-marketplace/issues/6926>
- Plugin content hash: `dc233d405d868d4ae0879ced28a51d41d8258719fce444a01fec83e04ff53efa`
- Plugin `release.json` SHA-256: `b22c6053e220dcc79afa5c2eae44d666621260866e1021ee69d7229e2cac3f7c`
- Connector content hash: `1b52f323819ea12c89749687988f874d5ad7c5a150c3df6ffc0f6e26fbf76cd3`
- Connector `release.json` SHA-256: `cd2bb3c8c7e4adf74138050c40c5e56f49cd2cb8d8769a2b02e34899aa14baba`

## Release construction

The accepted 1.3.0 runtime from the Ibara pass was copied into a dedicated clean
repository. Publication documentation was updated without changing the accepted
QML, helper or media runtime. Public CI initially exposed two missing Ubuntu QML
runtime packages; adding the explicit Qt Quick Controls and Templates packages
made the same QML suite pass in the clean GitHub runner.

Marketplace validation then exposed a repository-layout conflict: its scanner
treated the bundled browser connector's one-level `connector/manifest.json` as a
second Omarchy plugin manifest. Patch release 1.3.1 nests those connector source
files under `connector/extension/`. The installer accepts both the new nested
layout and the preceding 1.3.0 layout, and still copies the extension into its
ordinary root-manifest browser directory. The accepted plugin runtime is
otherwise byte-identical; `scripts/highlights/service.py` remains
`b2f86501fd5b3632ee71a2e9fc0f0beee8e37423b9548eccf3cba2875dddc8b3`.

## Verification

- Clean standalone release preflight: pass, including annotated local/remote tag.
- Native `omarchy plugin validate`: pass on the exported, standalone and installed copies.
- Public release CI: pass, including receipt, helper syntax, portable and QML checks.
- Plugin portable suite: 24/24 pass.
- Focused release and launcher checks: 23/23 pass.
- `npm run typecheck`: pass.
- `npm run build`: pass.
- Full `npm test`: two runs each reached 173/174 in the worker leg but hit different
  randomized bot-roster expectations in `matchmaking.test.ts`; the first exact
  failing case passed alone. The packaging change does not touch matchmaking.
- Veelox install: version 1.3.1, matching content hash; native validation passes.
- Marketplace: one valid root manifest, README/license/preview present, Quattro
  compatibility passed at `36a56b1`; automated baseline requests manual review
  for the documented installer/uninstaller surface.

The release tooling also checked for Omakit, but it is unavailable on this host;
that optional check was not claimed.

## Remaining boundary

The Git repository, tag and GitHub release are public and complete. The
marketplace submission is valid and awaiting the marketplace maintainer's
manual listing decision. Do not describe it as catalog-listed until issue #6926
receives `approved-and-verified` and the registry includes the plugin.

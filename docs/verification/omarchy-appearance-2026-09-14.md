# Omarchy appearance implementation — September 14, 2026

Tyler authorized the complete revised design using parallel Sol medium agents.
Three bounded agents implemented appearance tokens, panel/components and brand
assets; the parent integrated them, fixed issues found in the real shell and
prepared the release. The dirty gameplay checkout was preserved.

## Result

- Default **Omarchy** appearance follows reactive popup text/background/border,
  accent and urgent roles plus the native font. Muted text retains the native
  role when readable; otherwise a foreground/background blend provides 4.5:1
  body contrast when the base theme supports it.
- **Rat Detective** uses purple, lavender and brass, Bangers headings and static
  Outfit Regular/Bold. The variable Outfit font initially loaded its Thin family
  in this Qt build, so the release bundles unmodified official static faces.
  All bundled fonts carry their OFL licenses.
- One shared layout, native outer popup and bar, the actual game badge and a
  small monochrome rat/fedora icon. The native control focus/hover behavior stays.
- Assignment file, Paper Chase stamps/destination, Jurisdiction current zone and
  relocation warning, qualifying-kill tracks and a large Closing Time clock.
  Enter/Return, separate joining, copying, recording and captures remain explicit.
- Appearance saves on the existing inline widget entry. Cosmetic preferences no
  longer reset the service polling timer. No global theme or gameplay change.

## Evidence

- 31 focused Node tests passed (desktop helper, status model and release tooling).
- Qt 6.11.2 QtTest: 8 passed, including lifecycle setup/cleanup; six tests cover
  live dark/light roles, switching, invalid-mode fallback, fonts and contrast.
  These use the actual appearance component and narrow Commons stubs, without
  changing the user's desktop theme.
- Native `omarchy plugin validate` and toolkit portable validation passed.
  Release preflight reports no blocking findings. Existing subprocess/installer
  capabilities and CI-only package installation are review notes, not security
  certification.
- Real Omarchy 4.0.3-1 / Hyprland 0.56: all eight fixtures captured in both
  appearances, both preference views, and top/bottom/left/right placement. The
  symbolic icon was inspected in the native bar. Panel-only captures used an
  empty workspace; fixture, workspace, cursor and bar position were restored.
- Appearance changed live with the same Omarchy shell process. Bundled fonts
  resolved to Outfit and Bangers. Updated QML was loaded via supported shell
  restarts; changing appearance itself needs none.

The first real captures exposed dim native secondary text and the thin variable
font. Both were corrected and recaptured. The case file's destination no longer
repeats “Deliver to” below its label. Empty states omit the unusable Join control.

## Scope and limits

One 1920×1080 display at scale 1 was available. Physical multi-monitor ownership,
actual high-DPI shell output, global desktop theme swaps, outside-click/keyboard
input and a long soak were not independently exercised. Light/dark role mutation
was verified in QtTest. Native panel lifecycle/geometry remains inherited.
Changing bar position transiently produced the host's duplicate-IPC warnings for
several built-in and installed panels; the final supported restart clears the
transient instances. No automated gameplay input or actual recording was started.
Existing user recording/DND preferences were preserved.

The game Worker remains `55a9e2fe-e219-451d-aa55-de48ba72928e`, protocol 18.
Public listing review is still separate from publishing a GitHub release.

Local reproducible source is `omarchy/plugin`; package with
`scripts/omarchy-release.mjs`. Portable checks ship as `tests/run` and
`tests/run-qml`. Visual receipts live in ignored
`output/omarchy-dispatch-2026-09-14/appearance-final-renders`.

## Release

- Published [v1.1.0](https://github.com/MayberryDT/rat-detective-omarchy/releases/tag/v1.1.0).
- Exact commit: `70e722352af7552debfef35aa9ab69eba42a7b45`.
- Content hash: `d9ca5516a4faa336df4386461186c47eeeb2f0b9f6aa7962eac5ed72031ee45d`.
- Archive SHA-256: `7cb27681dca774db5fac2f10fac8f7f2a8660b1e4f49f8e729fabcd066807e0f`.
- [CI passed](https://github.com/MayberryDT/rat-detective-omarchy/actions/runs/34883156727).
- Annotated local/remote tag, source tree, downloaded draft assets, SPDX document,
  source/release manifests and complete checksums passed release preflight before
  the release was published.
- Reinstalled the exact published 1.0.0 baseline, then ran the normal
  `omarchy plugin update co.animasai.rat-detective --yes`. It installed the exact
  1.1.0 commit with a clean Git tree; a subsequent update reports up to date.
  All 35 managed file hashes match the receipt.
- Rat Detective appearance survived the supported shell restart after updating.
  Restored Omarchy afterward; the panel is closed, on the live feed, with the bar
  at its original top position. The final shell log has no Rat Detective warnings.
- Repaired the durable app-menu launcher icon and verified it matches the real
  game badge. Launcher helper/entry remain canonical and do not launch gameplay.

Only the standalone plugin repository was committed/published. No game checkout
commit or Worker deployment was made for this appearance release. The existing
marketplace submission is still awaiting its separate review; this release does
not claim approval for the new commit.


## Selected toolbar icon A — 1.1.1 follow-up

Tyler selected generated option A and clarified that this must work across
Omarchy bars. The angular profile is implemented as a clean SVG; generated PNG
cleanup attempts retained opaque backgrounds, so those are not shipped.
`DispatchBarMetrics.qml` derives geometry from host thickness and native icon
canvas, stacks the vertical count without overlap and uses device-pixel-ratio
raster sizing. Colors/fonts follow native roles with fallbacks.

Both stock `omarchy.bar` and the user's custom bar rendered correctly in top,
bottom, left and right positions. QtTest covers 60 orientation/thickness/scale
combinations plus live reconfiguration; 12 QtTest results and 9 portable model
tests pass. Actual hardware remains one display at scale 1. Support is Omarchy 4
bar hosts implementing the standard plugin API, not legacy Waybar or arbitrary
unrelated toolbar implementations. Original host/position were restored and the
final shell log has no Rat Detective warnings. Local cropped bar receipts are in
`output/omarchy-dispatch-2026-09-14/icon-a-bar-checks`.


The follow-up is published as
[v1.1.1](https://github.com/MayberryDT/rat-detective-omarchy/releases/tag/v1.1.1),
commit `94b16239b7d952f478ab3198b8536ce00b840c26`, content hash
`74704ca694993b98aa828615f2f217c4d2bf19e0fb398ae41feaa547d702705a`.
[CI passed](https://github.com/MayberryDT/rat-detective-omarchy/actions/runs/34894729588).
Downloaded release manifests/assets passed the same exact-tag preflight. The
normal updater installed it from the published 1.1.0 baseline with a clean Git
tree; all 37 managed file hashes match. The original custom top bar is restored,
the panel is closed, and the live feed is active. The implementation uses the
native icon-canvas role, not a per-user hardcoded icon size.

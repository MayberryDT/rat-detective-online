# Omarchy live stats and local mini-scoreboard — September 14, 2026

Plugin **1.2.0** was published to GitHub, then rejected as a desktop release
because the menu was too busy. Local source later replaced that menu with a
mini-scoreboard. Manifest version remains **1.2.0**; this is a local
modification, not a new tag. No further publish is authorized. This receipt
does not claim the live public feed is fixed or finished. The later persistent-city
Worker is accepted locally (revision 15) and is not part of this desktop package.
No plugin publish or Worker deploy is authorized here.

Dated 1.0.0 and 1.1.x reports stay as measured:
[Dispatch 1.0.0](omarchy-dispatch-2026-09-14.md) and
[appearance 1.1.0 / icon A 1.1.1](omarchy-appearance-2026-09-14.md).
**1.1.1** remains the last accepted published appearance.

## Chronology

1. Integrated **1.2.0** added a default ten-name public roster, coalesced open
   refresh and quieter opt-in alerts, together with a full panel menu (Join,
   record, captures, desktop and alert settings, Quiet/Live badge, and
   public/playtest/alerts status copy).
2. That package was published as
   [v1.2.0](https://github.com/MayberryDT/rat-detective-omarchy/releases/tag/v1.2.0)
   from commit `a9e1c30d87c911551d1d49435632eb913269306d`, content hash
   `53e8ac0b7bed24bfaa6f3b0c79527c8f613ba916ab597ebd229d61a6391939ab`.
   [CI 34932529441](https://github.com/MayberryDT/rat-detective-omarchy/actions/runs/34932529441)
   passed. That GitHub publish was **without authorization**. Tyler objected.
   The tag is not an accepted desktop release.
3. After publication the busy menu was rejected and further publishing stopped.
   No new publish is authorized.
4. A local-only mini-scoreboard followed that tag. The installed plugin is
   still version **1.2.0**, modified in place.

## Published 1.2.0 package

The published tag still has the full live-stats menu. Dated measurements of
that package, not of the later local panel:

| Check | Result |
| --- | --- |
| Integrated model tests | **17 passed** |
| Desktop and release tests | **22 passed** |
| Combined plugin integration | **39 passed** (17 + 22) |
| Native Qt QML (`tests/run-qml`) | **27 passed**, including init and cleanup (**13** roster functions + **8** existing functions) |
| Companion backend (`companionStatus`, `companionRoute`, `companionLifecycle`) | **9 passed** in 3 files against the unchanged Worker |
| `omarchy plugin validate` | Passed |
| Toolkit static review | **0** errors, **0** warnings, no security findings. This is a capability review, not a security audit. |

Service-side alert policy on that package: opt-in defaults remain false;
gathering threshold default **2** humans per room; assignment-change notices
are a separate optional toggle; quiet hours default **22:00–08:00** local
time; cooldown **15** minutes. Failed sends use **3** total attempts with a
**4 s** backoff and a bounded queue of **8**. The first live snapshot and any
recovery snapshot stay silent. Background Service stored alert preferences
were not rewritten then, and they remain untouched by the later local panel
change. Schema maximum for the gathering threshold is **10**; the service
still clamps stored values up to **16**.

## Local mini-scoreboard

Source remains `StatusModel.js`, `Service.qml`, `Panel.qml` and
`DispatchRoster.qml`. The locally installed panel now shows:

- A native compact header.
- Current mode and objective.
- A full public roster of up to **10** names with objective totals and K/D.
- Play/Return, plus appearance-only Settings (Omarchy or Rat Detective).

Removed from the panel: the Quiet/Live badge; redundant public/playtest/alerts
status copy; invites and Join; record and captures controls; desktop and alert
settings. Native Omarchy appearance, optional Rat Detective palette and icon
**A** stay. Opening the panel still requests a report immediately and
coalesces extra open refreshes while one is in flight. Defaults remain **2 s**
open and **30 s** closed. Directory reads do not wake sleeping rooms.

## Live public feed

A live curl of `GET /api/companion/v1/status` returned `rooms: []`. Legacy
`GET /status` reported `players: 0`, `bots: 0`, `phase: playing`. That empty
automatic-room result is the **currently deployed** sleep policy. Tyler later
confirmed the city stays alive: `public-live-v2` must list eight named bots
with zero humans. Overflow 0/0 remains healthy. That backend is accepted locally
(revision 15) and is not deployed; directory GET still does not
wake a GameRoom. This observation is not a live-data fix. See
[the canonical-city receipt](canonical-city-2026-09-14.md).

## Local install and layout renders

The modified **1.2.0** plugin is installed locally from `omarchy/plugin`
through `scripts/omarchy-release.mjs`. Sixteen native fixture renders — four
assignments plus empty, stale, unavailable and loading, each in both themes —
are under `output/omarchy-dispatch-2026-09-14/mini-scoreboard-renders`. Those
captures support layout only.

## Still pending

No additional plugin publish or ordinary `omarchy plugin update` of the
mini-scoreboard is authorized. The persistent-city contract is confirmed and
local revision 15 is accepted after independent review; it is not deployed.
Production activation and a live check of 0 humans / 8 named rats with a
fresh mode and scores after more than 75 seconds with no game tab remain
pending.

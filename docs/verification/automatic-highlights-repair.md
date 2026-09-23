# Automatic highlights repair — 19 September 2026

Repair and local activation of unpublished plugin **1.3.0** against
[the audit](automatic-highlights-audit-2026-09-19.md),
[the follow-up](automatic-highlights-repair-followup.md) and
[the original plan](../handoffs/automatic-highlights-implementation-plan.md).
No production deploy or GitHub publish.

Desktop control was **stopped on Tyler’s instruction** before portal window
confirmation. Capture preference is **on**; the recorder is **not** buffering.

## Tickets / findings

| Item | Status | Evidence |
| --- | --- | --- |
| F1 window | CLI no longer sends `portalEvidence`. `inspect_source()` is the only authority, including replacement recorder sessions. Fabricated CLI evidence cannot arm a monitor. | `test/scripts/highlightsRepair.test.mjs`; historical `isolation.py` kept as dated defect evidence |
| F8 export | FFmpeg runs on `ExportQueue` worker; helper `handle`/`status` stay unblocked; `serve()` cleanup is `finally` | same repair test |
| last session | `lastSessionId` persisted in settings and reloaded | same |
| H05–H07 UI | Session selector, reel strip, export destination, progress, cancel | `HighlightsWindow.qml`, `HighlightsModel.js` |
| H00 GSR | Replay still uses `-o`. `-w focused` is **X11-only** on this host; Wayland window capture is portal. Portal picker was shown, then stopped. | recorder log: “window capture only works in a pure X11 session” |
| H08 package | Brave + Chromium native-host JSON; durable DEV connector; matching preview service | paths below |
| H09 native E2E | **Incomplete.** No confirmed window source, no real GSR clip, no library/reel from capture. Tyler ordered desktop control stopped. | this receipt |

Historical audit scripts remain dated reproductions of the **old** defects.

## Installed on Veelox

| Path | Notes |
| --- | --- |
| Plugin `~/.config/omarchy/plugins/co.animasai.rat-detective` | 1.3.0, Highlights window, Play matching preview |
| Durable helper / `highlights/` package | F1/F8 service |
| Native host | Chromium **and** Brave, ID `lbhddkbbmnofokcjnlpfhffcplijjpnh` |
| Connector | `~/.local/share/rat-detective/highlights-connector` (DEV origins including `127.0.0.1:5174`) |
| Matching client | `~/.local/share/rat-detective/matching-client` (built `index-O1vBa_u_.js` / `createGame-BRbGLvLX.js` with highlight bridge) |
| Preview server | user unit `rat-detective-matching-preview.service` on `http://127.0.0.1:5174/` (static matching client, `/ws` to production city) |
| Settings | `"enabled": true`; state **setup-needed** |
| 1.2.0 backup | `output/highlights-repair-2026-09-19/plugin-1.2.0-backup` |
| Pre-activation 1.3.0 copy | `output/highlights-repair-2026-09-19/plugin-1.3.0-pre-activation` |

Omarchy shell was restarted once so 1.3.0 is the running plugin. Production Play/Return still opens `https://ratdetective.online/`.

## Capture state when desktop control stopped

Automatic highlights is **enabled**. GPU Screen Recorder is **not** running.
Setup did not confirm a window: focused capture exits on Wayland; portal
requires picking **Windows → Rat Detective Online**, not a monitor. A portal
dialog was opened during activation and then torn down. No monitor source was
armed.

Production `https://ratdetective.online/` still lacks the highlight bridge.
Use **Play matching preview** for automatic markers.

## Checks run

- `python3 -m py_compile` on helper modules
- `npx tsc --noEmit`
- `npx vitest run --config vitest.client.config.ts test/client/highlights.test.ts` (12 pass)
- `node --test` repair/service/protocol/media + plugin JS tests (pass)
- `npm run build` (matching client; not deployed)

Not run after the stop: portal confirmation, real GSR clip, Qt library playback,
audio-isolation proof, QML `tst_roster.qml` (two pre-existing tryVerify failures).

## Exact remaining action

In the plugin: **Set up capture**, choose the **Windows** tab, pick
**Rat Detective Online** (the matching preview), confirm. Do not pick a
monitor/output. Then join an eligible session in that preview app. Clips land
in Videos/`Rat Detective/Highlights/`.

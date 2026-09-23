# Automatic highlights — platform proof and implementation receipt

Prepared **19 September 2026** on Veelox during implementation of
[the plan](../handoffs/automatic-highlights-implementation-plan.md). This is
not a production release. No GitHub publish, Worker deploy or extension-store
submission was performed.

## Exact versions (Veelox)

| Package | Version |
| --- | --- |
| gpu-screen-recorder / gsr-cli | 6.1.0-1 (binary `--version` 6.1.0) |
| ffmpeg / ffprobe | 2:9.0.1-4 |
| qt6-multimedia / qt6-base | 6.11.2 |
| chromium | 152.0.7977.82-1 |
| pipewire | 1:1.6.8-1 |
| xdg-desktop-portal-hyprland | 1.4.1-2 |
| python | 3.14.7-1 |
| Hyprland session | Wayland `wayland-1`, monitor `eDP-2` 1920×1080 |

Hardware: Intel iHD VA-API H.264 encode is present (`VAProfileH264High` EncSlice).
GSR is started with `-encoder gpu -fallback-cpu-encoding no`.

## Recorder contracts used

- Replay: `-r 45 -replay-storage ram -restart-replay-on-save no`
- IPC: owned `$XDG_RUNTIME_DIR/rat-detective-highlights/gsr.sock`
- `gsr-cli -ipc … save-replay N` waits and prints a path
- Wayland source: `-w portal` only. Direct window IDs / focused are X11-only
- `--list-capture-options` on this machine: `eDP-2|1920x1080`, `region`, v4l2 devices, `portal`
- `-write-first-frame-ts yes` writes monotonic_microsec + realtime_microsec beside the file
- Restoration tokens are not used as identity. Recorder logs are redacted
- Process argv0 is `rat-detective-gsr` so Omarchy `pkill -f "^gpu-screen-recorder"` does not match. External stop of the owned process is still treated as Interrupted

Unmodified 6.1.0 portal still requests all source types. No system recorder was
patched. Automatic saves require a confirmed window: compositor class
`co.animasai.rat-detective` (or the existing origin-derived app classes) plus
the user's picker confirmation. Monitor and unknown sources stay in setup-needed.

## Browser / native messaging

- Default Omarchy web app launcher uses `chromium.desktop` `--app=`
- Production extension host permission: `https://ratdetective.online/*`, top frame, no incognito
- Development manifest adds explicit 5174/5175/5193 loopback origins
- Unpacked extension ID `lbhddkbbmnofokcjnlpfhffcplijjpnh`
- Native host `co.animasai.rat_detective_highlights`

## Alternative backends compared, not selected

- OBS replay buffer: another recorder/controller
- Chromium `tabCapture`: useful isolation, but needs a browser user gesture and is not the Omarchy app-first workflow

## Evidence completed in this pass

- Inventory of GSR flags, IPC, VA-API, portal listing, Omarchy launch/stop, Qt Multimedia plugins
- Unit/subprocess tests for detector, protocol, helper lifecycle, catalog, reel ranking, FFmpeg trim
- Plugin model and QML label tests
- Code for helper, extension, detector, library window, packaging hooks

## Evidence still required (not claimed)

- Real portal window pick, resize/fullscreen/lock/revoke fixtures on Ibara
- Game-only audio vs unrelated Chromium / microphone, with decoded tracks
- Timing fixture with a visible millisecond counter and `ffprobe`
- Qt playback of a real GSR clip in the library window
- 2-minute capture-off/normal/light frame-time comparison
- 30-minute bounded-memory fixture
- Human gameplay session with automatic clips and an exported reel

A GSR source patch was not applied. If window-only portal restriction is later
required, keep it app-owned, version-pinned, and never overwrite `/usr/bin/gpu-screen-recorder`.

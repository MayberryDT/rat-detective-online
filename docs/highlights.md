# Automatic highlights

Local, opt-in capture for the Omarchy Rat Detective web app. Interesting
moments become clips with buildup and aftermath. The companion library can
watch, rename, favorite, trim, delete and export those clips, then export an
automatic session reel. There is no continuous session recording on disk.

**Status on 21 September 2026:** production Worker
`7b3c4b2a-1a75-48b4-b36c-bda91bcb3248` serves the fullscreen-corrected client
(`index-BL9xcsnh.js` / `createGame-BSxvfOuu.js`), retaining the repaired highlight pipeline. The local helper is running
with Automatic highlights on. Close the existing game window and Enter City
again to load the new assets. Catalog marker rows are still publication
records; the helper journals marker stages separately. Tyler subsequently
confirmed that clip detection and playback work. The September 21 UI rebuild
is installed locally; see [its verification](verification/highlights-library-ui-2026-09-21.md).

The later September 21 missing-clips fix is installed in the local helper.
Clock calibration now resets for each accepted game document, rejects clock
updates from other documents, and expires old samples. This fixes fresh wins
and multi-kills being discarded as hours old after reopening the game.
Tyler confirmed that capture now produces clips in the subsequent human session. See [clock verification](verification/highlights-clock-2026-09-21.md).

The subsequent resize correction follows the app rectangle when the window
moves or changes size. Replay buildup restarts after each change; already saved
clips remain. The prior narrow recordings contain only the original rectangle
and cannot be expanded. See [resize verification and installation](verification/window-resize-capture-2026-09-21.md).

The later audio/export repair is **installed on Veelox as of 21 September**. It attaches a
stable game-only audio monitor before sound starts, reconciles late/replaced
streams and distinguishes waiting/routing errors from ready capture. Existing
video-only clips stay intact and are labelled honestly. Export Settings adds a
folder chooser, dated subfolders, size/quality/sound preferences and editable
date/time filenames for clips and reels. The duplicate Automatic highlights
option has been removed from Clips Settings; use the plugin's existing setting.
See [checks, native evidence and remaining live-audio acceptance](verification/clips-audio-export-2026-09-21.md).
The helper was restarted and the plugin reloaded; capture remains enabled and
ready for human testing. The roster QML fixes are installed too. See the
[live installation receipt](verification/clips-live-2026-09-21.md).

## What is installed (Veelox)

- Plugin `~/.config/omarchy/plugins/co.animasai.rat-detective` version 1.3.0
- Durable helper `~/.local/share/rat-detective/rat-detective-highlights.py`
- Native-host registration (Brave and Chromium) for unpacked ID
  `lbhddkbbmnofokcjnlpfhffcplijjpnh`
- DEV connector `~/.local/share/rat-detective/highlights-connector`
- Matching client + user service `rat-detective-matching-preview.service`
- Settings `~/.config/rat-detective/highlights/settings.json` with
  `"enabled": true`

1.2.0 backup: `output/highlights-repair-2026-09-19/plugin-1.2.0-backup`

## Ordinary use

1. Turn on Automatic highlights in the plugin settings.
2. Enter City. Capture starts using the recognized game window’s desktop
   rectangle. The installed backend does not use a window picker.
3. Clips opens the library. Videos/`Rat Detective/Highlights/`.

Opening the companion or the public city with zero humans does not record.

## Highlights library

The library uses the active Omarchy colors, fonts and native controls. All clips,
Favorites and Session reels share a thumbnail list and a selected-video player.
Search and the session menu narrow the list. Playback has pause, seeking and mute;
Trim clip and Export clip sit below it. The More menu contains Rename, Show in
folder and Delete clip, with Undo delete in the footer. Clips Settings contains
export preferences; capture enablement remains in the plugin settings.
Trim opens inline on the playback timeline at the saved boundaries. Drag either
bracket to pause and preview that cut in the video; Play previews the selected
range. Arrow keys adjust a focused bracket by 0.1 seconds. Save trim persists
the range after the helper confirms success, while Cancel or Escape discards the edit.
Normal playback and the library duration then contain only the kept section,
with a timeline starting at zero. A cached, full-resolution MP4 of the cut avoids
the player's earlier-keyframe seek behavior. Export uses the same saved boundaries.
The original stays intact so Trim can adjust the cut again.

Dragging uses predecoded 60 fps JPEG frames (up to 854 × 480), so it does not
repeatedly seek the inter-frame video decoder. Frames prepare when a clip is
selected; the editor shows preparation or failure feedback. Cache entries are
keyed by recording identity, size and modification time, plus cut boundaries for
playback copies. The disposable cache is limited to 256 MiB; generation uses two
FFmpeg threads, a two-minute input limit and a 90-second encoding timeout.
Search and session controls share a 38-pixel height, and the video border fits
the recording’s aspect ratio rather than spanning empty widescreen space.

Clip selection follows its ID across catalog refreshes. Compact windows wrap the
toolbar and use vertical clip cards; the library and player scroll independently.
Session reel export requires a selected session.
Session labels use local `YYYY-MM-DD HH:mm · Game mode` titles. A session spanning
several modes lists each observed mode. The local connector reads the game's
existing assignment HUD `data-mode` on session start/heartbeat; the helper stores
only recognized modes after session validation. Historical modes recovered from
saved footage are included; empty sessions without evidence say Mode unavailable.

Clip and reel export dialogs contain a prefilled, editable filename and destination
folder with a native Browse action, plus Cancel/Export. Export preferences remain
in Settings. A dated default folder is shown explicitly; choosing another folder
saves directly there without appending another hidden date directory.

## Limits

- The installed Wayland backend uses GSR **region** capture from the recognized
  app bounds. It captures desktop pixels inside that rectangle, including any
  overlapping window. Earlier portal-picker notes describe the previous backend.
- GSR has no live region-update command. The resize fix briefly restarts capture
  and its replay buildup; unfinished intervals crossing that boundary are missed.
- Hardware encoding only. Replay output uses `-o` (directory in replay mode).
- Production gameplay, protocol 18 and publishing are unchanged.

See [the pipeline repair](verification/automatic-highlights-pipeline-2026-09-20.md),
[the earlier repair receipt](verification/automatic-highlights-repair.md) and the
dated [audit](verification/automatic-highlights-audit-2026-09-19.md).

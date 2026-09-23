# Clips audio and export settings — 21 September 2026

Implemented in the existing dirty working tree on Veelox. **Not installed or deployed.** No live helper or shell restart, game deployment, Git commit or publication. This implements the [diagnosis handoff](../handoffs/clips-audio-export-handoff-2026-09-21.md) under Tyler's subsequent implementation request. Tyler also requested removal of the duplicate Automatic highlights option from Clips Settings; capture enablement remains in the plugin settings.

## Changes

- Create the owned PipeWire sink and audible loopback before looking for game streams. GSR always receives the monitor explicitly. An unavailable monitor blocks capture with an actionable audio error instead of silently starting video-only capture.
- Reconcile late and replaced streams every three seconds. Match the dedicated launcher's `rat-detective/webapp-profile` process tree, never a generic Chromium name, unrelated output or microphone. Keep the original stream destinations and only unload modules created by this router. Waiting/routed/error audio state is separate from visual-source confirmation. “Routed” means a stream was routed, not that natural silence is a failure.
- Catalog schema 4 stores nullable audio presence, codec and sample rate. Old clips are probed lazily in batches of three; unknown is not labelled silent. Verified silent clips show “No audio recorded.” Their original media is untouched. Cached saved cuts and fast JPEG drag previews are unchanged.
- Persist export folder, date organization, original/up-to-1080p/up-to-720p size, standard/high quality and recorded-sound preference atomically. Defaults are dated exports, original size, standard quality and sound included. Size limits preserve aspect ratio without upscaling; output remains H.264/AAC MP4. Playback mute does not change export sound.
- Prefill separate editable filenames using clip creation or session start time in the local timezone. Both native dialogs and CLI use the helper's naming/path resolver. Explicit legacy MP4 destinations remain supported; existing directory destinations now place a file inside the directory. Queued options are snapshots, colliding names receive readable numbered suffixes, and final publication never overwrites another file.
- Mixed reels normalize dimensions and audio layout, padding silent segments only for compatibility. This never changes a silent source's recorded-audio status. Export errors/progress remain visible and completed jobs offer Open folder.
- A regression exposed concurrent SQLite cached-statement reuse returning malformed/empty rows. A four-thread reproduction failed with the default cache and passed with it disabled. The shared catalog now disables statement caching; the concurrent catalog regression passes.

## Checks

| Check | Result |
| --- | --- |
| `node --test test/scripts/highlights{AudioExport,Media,Preview,Service,Repair,Pipeline,Protocol}.test.mjs` | 41 passed, including resize/in-flight saves, late/replaced audio, routing failures, cleanup, ownership, exports and decoded media |
| `node --test test/scripts/highlightsAudioExport.test.mjs` | Seven passed after strengthening queued-option snapshot and invalid-folder assertions |
| `bash omarchy/plugin/tests/run` | 23 passed; shell/Python parsing passed |
| `npm run typecheck` | Passed |
| Portable plugin validator and `omarchy plugin validate /home/tyler/Projects/rat-detective/omarchy/plugin` | Passed |
| QML parser | Changed window parsed successfully |
| `bash omarchy/plugin/tests/run-qml` | 35 passed, two existing DispatchRoster failures (long names and bot/human labels); identical failures reproduce in the untouched pre-task plugin backup |
| Preservation | All 26 original recording/sidecar hashes unchanged. All seven changed existing plugin files still match their pre-task versions in the live installed plugin. Preview builder, timeline implementation and dated-original path owner unchanged |

No full game build or gameplay/input test was needed: changes are confined to the local companion/helper, tests and documentation. No marketplace release checks or installation tests were performed.

## Media measurements

The reproducible fixture `test/scripts/fixtures/highlights-audio-media.py` generates a 440 Hz cue aligned with a white video flash. FFmpeg decodes samples and frames; there is no speaker playback. Source hashes are checked afterward.

| Media | Audio onset | Visual onset | Decoded RMS | Duration |
| --- | --- | --- | --- | --- |
| Source | 0.750 s | 0.750 s | 0.0647 | 2.000 s |
| Saved playback cut, 300–1600 ms | 0.450 s | 0.450 s | 0.0803 | 1.300 s |
| Clip export | 0.450 s | 0.450 s | 0.0802 | 1.300 s |
| Silent clip then sound-bearing cut, mixed reel | 1.470 s | 1.467 s | 0.0600 | 2.321 s |

The mixed reel's AAC/container rounding adds approximately 21 ms to its nominal 2.300 s total. A/V cue separation is approximately 3 ms. Sound-off exports have no audio stream; the 720p limit does not upscale the 160×96 fixture.

## Native verification on Ibara

Task `task_6d023c11eea245bb863a73d71155796b` used an isolated catalog, synthetic media and the real native components plus wrapper/helper export path. Capture enablement stayed off in that catalog. The fixture needed a short private runtime path because its long workspace path exceeded Unix socket limits; this was a fixture setup correction. No live user configuration was changed.

Verified Settings rendering without the duplicate toggle; folder chooser cancellation preserved the folder; selecting 720p and Done persisted it; subsequent Export showed that preset, a resolved dated folder and an editable date/time filename. Entering `Native export é.mp4` produced that exact file. A session reel received its own dated default filename and exported successfully. The silent clip received a different timestamp and explicit missing-audio label. Muted native playback advanced to the end without a media error. Native clip/reel files decoded to RMS 0.0647/0.0600 respectively.

A separate real GSR/PipeWire test used the changed router with two explicit fixture boundaries: known owned `paplay` PIDs in place of browser discovery, and an owned null playback output in place of physical speakers. All routing/module/recording operations were real. GSR began with the capture monitor attached and zero streams; two sequential 440 Hz streams arrived later and were routed without adding modules. A simultaneous unrelated 880 Hz stream remained on a different sink.

- Recorder exited successfully; capture RMS **0.0997**, loopback RMS **0.0976**.
- Capture 440 Hz energy was over **600,000 times** the 880 Hz energy (minor AAC distortion remains).
- Stream counts were **0 → 1 → 1 → 0**, with the same two owned module IDs.
- Cleanup left **zero** QA modules. Fixture UI/helper/terminal and temporary transfer server were closed; desktop control was released.

Evidence was fetched with verified SHA-256 into `output/clips-audio-export-2026-09-21/native-evidence.tar.gz` (SHA-256 `a45e0436e8ca39edb386f57103524caf345bc45f8f351bb24be7331ff6dc3aab`). Extracted reports, the native screenshot and captured video are under `output/clips-audio-export-2026-09-21/native-evidence/`. Test logs, local signal measurements, pre-task plugin backup and preservation receipt are in the parent directory. These are local evidence artifacts, not published assets.

## Remaining acceptance boundary

This proves the monitor-before-stream approach on installed GSR/PipeWire and the native export workflow. It does **not** prove fresh live Rat Detective audio, actual launcher ownership on a running game, human speaker audibility, external-player audible acceptance, or live installed UI activation. Those remain explicit acceptance gaps. The 13 old video-only recordings contain no missing sound to recover. Any installation/restart or subsequent human game capture needs separately authorized work; production game audio and Worker remain unchanged.

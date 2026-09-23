# Clips audio and export handoff

Diagnosis and proposed plan, 21 September 2026. **No application fix or installation has been authorized or performed in this task.** Tyler asked for diagnosis, a plan and a handoff only. A later explicit implementation request may authorize the work below; this document itself does not.

## Outcome and constraints

Tyler confirms that clips and trimming now work well. Restore sound in newly captured clips, their normal/trimmed playback and exports. Make export controls understandable, put persistent export options in Settings, and prefill an editable filename based on date and time when Export opens.

Preserve automatic saving under `Videos/Rat Detective/Highlights/YYYY/MM/DD`, the existing recordings, clip IDs, saved trims, smooth drag previews, native Omarchy appearance and current capture timing/resize repairs. Keep the accepted game audio mix unchanged. This is local companion/helper work; no game deployment, GitHub publication, commit, desktop restart or live installation follows from this diagnosis request. Do not introduce another recorder or media stack without evidence that the existing one cannot work.

The working tree contains extensive tracked and untracked work, including the entire highlights subsystem and recent production changes. Run `git status --short` before editing; do not reset or replace the tree with HEAD. Work on Veelox. No delegation was requested.

## Verified diagnosis

### Saved files have no audio stream

Read-only FFprobe inspection of **all 13 MP4s** under `/home/tyler/Videos/Rat Detective` found H.264 video and **zero audio streams in every file**. This is absent audio, not a quiet audio track. It explains silence outside the Clips app as well as inside it. Those files contain no original audio to recover.

Repeat the file-level failure without changing recordings:

```bash
python3 - <<'PY'
import json, pathlib, subprocess
files = list((pathlib.Path.home() / 'Videos/Rat Detective').rglob('*.mp4'))
assert files, 'No recordings to inspect'
missing = []
for path in files:
    result = subprocess.run([
        'ffprobe', '-v', 'error', '-select_streams', 'a',
        '-show_entries', 'stream=codec_name', '-of', 'json', str(path)
    ], capture_output=True, text=True, check=True)
    if not json.loads(result.stdout).get('streams'):
        missing.append(path.name)
print(f'{len(missing)}/{len(files)} recordings lack audio')
assert not missing, 'Recordings have no audio track'
PY
```

This intentionally fails on the old recordings even after a successful repair. Acceptance must target **new** captures; do not modify old files merely to make this inventory pass.

### Confirmed failure path: audio errors silently become video-only capture

In `omarchy/plugin/scripts/highlights/service.py`, `_confirm_active_source` calls `audio.ensure_game_route` only when starting the recorder. It catches `AudioError`, discards the reason and passes `audio_source=None` into `capture.start`. `GsrCapture.start` in `capture.py` adds `-a` only for a truthy source. The service then confirms the visual source and reports ordinary capture success.

The successful-recorder branch in `arm_capture` returns without routing again. `tick` has no audio reconciliation. A stream that appears after capture begins therefore cannot repair that recorder's missing audio input.

An isolated differential reproduction called the real `_confirm_active_source` with a mocked recorder and routing boundary, without constructing the live helper or touching PipeWire:

| Routing result | Recorder audio argument | Source confirmed | Route calls after another arm |
| --- | --- | --- | --- |
| `AudioError('The game audio stream was not found.')` | `None` | true | 1 |
| Same fixture, successful route | `rat-detective-highlights.monitor` | true | 1 |

Both paths reported “Capturing the Rat Detective window.” with an empty recovery message. The only changed variable was whether routing succeeded.

`audio.ensure_game_route` raises before creating a sink if no matching stream exists. `streams_for_pid` matches the game-window PID and descendants, with a fallback requiring a Chromium binary and a Rat Detective media/application name. It routes only streams present at that instant. Later stream replacement is also unhandled.

**Limit:** the exact original routing error cannot be recovered from this code path because it was swallowed. At inspection there were zero recognized game windows, no running owned recorder and no Rat Detective audio modules. The helper was running from the installed plugin. Startup before the browser creates audio is the leading trigger; PID ancestry/shared-browser identity mismatch or module failures remain possible. Do not present any one trigger as a measured fact. A current Brave stream was generically labelled `Playback`; it was not established to be game audio.

### Export and saved-trim encoding preserve audio when it exists

A temporary two-second 440 Hz + 64×64 video fixture exercised the real `export_clip` and `highlights-preview.py.prepare(source, 300, 1500)` functions. Temporary files were removed afterward. No sound was played and no real recording or trim changed.

| Media | Result | Decoded mean level |
| --- | --- | --- |
| Synthetic source | 2.0 seconds, H.264/AAC, 44.1 kHz | −21.1 dB |
| Exported saved range | 1.2 seconds, H.264/AAC, 48 kHz | −24.1 dB |
| Cached playback cut | 1.2 seconds, H.264/AAC, 44.1 kHz | −21.1 dB |

The JPEG drag-preview branch uses `-an` intentionally; its saved-playback MP4 branch uses AAC. Do not remove the fast frame preview to repair capture. QML already attaches `AudioOutput { volume: 0.8; muted: root.muted }` to the player and initializes `muted` to false, consistent with the [Qt AudioOutput contract](https://doc.qt.io/qt-6/qml-qtmultimedia-audiooutput.html).

These checks reject export stripping and forced QML mute as explanations for the absent audio in these source files. **Native audible playback with a known sound-bearing file was not tested**, so a separate playback/device issue is not ruled out.

`export.probe` already returns `hasAudio`, `audioCodec` and `sampleRate`. The publication path does not retain these as clip audio status, and marker journaling retains only the video codec. The UI cannot currently distinguish an old video-only recording from a muted player.

### Export confusion has concrete causes

- `HighlightsWindow.qml:openEditor` copies `exportDestination`, initially empty, into a single “Destination folder or .mp4 file” field. It generates no name.
- The desktop wrapper supplies hidden defaults: `Exports/<clip UUID>.mp4` for clips and `Exports/reel-<Unix seconds>.mp4` for reels. Export copies are separate from the automatic dated originals.
- The purported folder input is interpreted as a file. A temporary wrapper reproduction, with helper requests mocked, passed an existing `chosen/` directory and received sibling path `chosen-1800000000.mp4`, not a file inside that directory.
- Existing-path handling appends an epoch once; it does not reserve a unique name against queued jobs or repeated same-second requests.
- Settings exposes automatic-capture actions only. Helper persistence currently handles enabled/profile/last session and a fixed budget, with no export preferences.

## Proposed implementation order

These are recommendations for the next implementation task, not already selected or shipped behavior. Keep the scope small and complete the audio repair before expanding export UI.

### 1. Make audio readiness and recovery real

Add focused regressions at the service/recorder boundary for a stream absent at startup then appearing, stream replacement, routing failure and retry, resize restart, disable/session end and cleanup. Reproduce the table above as a failing regression before changing behavior.

Prefer separating creation of the owned capture sink/monitor from discovery and movement of game streams. Start GSR with the monitor explicitly attached, even while waiting for the game's stream; then reconcile proven game-owned streams with bounded polling or existing lifecycle ticks. This avoids permanently omitting the audio track because the browser was silent at startup. Verify this approach against the installed GSR/PipeWire behavior before committing to it. If the required monitor cannot be created, surface the failure and retry with a bound; never report full audio readiness while silently omitting `-a`.

Track audio readiness separately from visual-source confirmation. Preserve an actionable, redacted routing error and expose waiting/ready/error state. “Stream exists” or “AAC track exists” alone does not prove audible samples; known-signal tests must establish that distinction. Natural in-game silence is not an error.

Make routing idempotent: one owned sink/loopback, no duplicate loopbacks on resize or retry, retain the true original output destination, restore streams and remove owned modules at the right lifecycle boundary. Keep game sound audible to Tyler. Verify browser process ownership against the actual launcher; do not solve identity ambiguity by routing every Brave/Chromium stream or the whole desktop. Exclude unrelated apps and microphones.

### 2. Preserve and expose media audio status

Carry probe audio facts through publication/catalog response to the UI using a small backward-compatible schema change if needed. Probe old clips lazily or in bounded batches; treat unprobed clips as unknown, not silent. Display concise “No audio recorded” feedback for verified video-only clips and distinguish that from the mute toggle. Preserve playback audio in normal mode, saved cuts and exports.

Test reels containing sound-bearing and old silent clips. Normalize their stream layout deliberately if required, keeping each segment's duration and sync. A silent compatibility track is not recovered sound and must not relabel an old clip as having recorded audio.

### 3. Add a small Export section to Settings

Suggested controls:

- **Export folder**, with a chooser and resolved path. Default to the existing `Videos/Rat Detective/Highlights/Exports` location.
- **Organize exports by date**, enabled by default as a recommendation consistent with Tyler's preferred organization. This affects exported copies only; automatic original storage stays unchanged.
- **Video size**: original, up to 1080p, or up to 720p; default original. Preserve aspect ratio, avoid upscaling and keep frame rate unless an explicit preset requires otherwise.
- **Quality**: standard/high, with implementation presets verified against the existing encoder. Retain MP4/H.264/AAC rather than adding a codec menu.
- **Include recorded sound**, on by default. Playback mute must never silently alter export settings or recording capture.

Tyler requested more export controls in Settings but did not enumerate quality/size choices. The list above is a proposed minimal set, not a claim of approval. Preserve the accepted visual direction and existing native controls. Persist through the helper's existing settings owner; save atomically and ensure updates to capture settings do not erase export settings or vice versa. Snapshot export options when a job is queued.

### 4. Prefill a name and make the destination explicit

When Export opens, show a separate editable **Filename** and destination-folder summary/chooser. Suggested default: `Rat Detective - 2026-09-21_14-35-08.mp4`; add `Reel` for a session reel. Use the clip's saved creation timestamp, or the reel session timestamp, in local time. Current creation time is save/publication time, not an exact gameplay-event timestamp; do not invent precision. Use export time only when source time is unavailable.

Generate the name on opening for the selected item, not from the previous clip's dialog state. Show the resolved folder, date subfolder and active size/quality/audio defaults before submission. Export clip and Export reel remain discoverable actions; persistent options belong in Settings.

Centralize path/default resolution in the helper so UI and CLI agree. Validate filename versus folder, extension, writable destinations and existing files. Handle spaces, Unicode and cancelled choosers. Reserve unique names against files and queued jobs with readable suffixes such as ` (2)`; never overwrite originals or silently choose a sibling of the selected folder. Keep job progress, useful errors and an “Open folder” success action. Do not broaden into an unrelated export-queue rewrite.

### 5. Verify before any separately authorized installation

- Focused audio service tests: late streams, disappearing/replaced streams, explicit errors, bounded retry, no unrelated stream capture, idempotent modules, cleanup, resize and in-flight save behavior.
- Synthetic media: known nonzero audio and a time-aligned visual cue survive source → saved cut → clip export → reel. Check decoded samples and A/V timing, not only codec presence. Include mixed silent/audio sources.
- Settings/export tests: persistence/migration, UI and CLI defaults, populated date/time names for clips and reels, date folders, concurrent name collisions, cancelled chooser, invalid destination, job failure and unchanged source hashes/trims.
- Run affected Node/Python/QML suites and plugin validation. Relevant starting commands: `node --test test/scripts/highlights{Media,Preview,Service,Repair,Pipeline,Protocol}.test.mjs`, `bash omarchy/plugin/tests/run`, and `npm run typecheck`. Use the repository's QML test harness for the changed dialogs. Run broader build/gameplay checks only if affected code or project gates require them.
- Native UI/appearance checks use Ibara with its required skill and lease. Use an isolated catalog and synthetic media. Keep agent previews muted; use decoded signal measurement for audio evidence and leave human audible acceptance audible. Browser gameplay/input tests remain human-led.
- Fresh end-to-end capture must demonstrate game audio, continuing local audibility, exclusion of unrelated audio, stream recovery and sound in an external player. At diagnosis time no active game was available, so this remains unverified. Report any Ibara or actual-host gap explicitly.
- Before an authorized live install, compare source/installed hashes and back up affected files. A successful shell rescan previously failed to activate the retained Clips window; do not claim UI upgrade from rescan success alone. Helper/shell restart and live install require scope granted by the next user request. Production Worker and game mix need no change for this plan.

## Files and verified environment

| Responsibility | Repository path |
| --- | --- |
| Audio ownership and routing | `omarchy/plugin/scripts/highlights/audio.py` |
| Arming, retry, publication, settings, export jobs | `omarchy/plugin/scripts/highlights/service.py` |
| GSR arguments and replay capture | `omarchy/plugin/scripts/highlights/capture.py` |
| Window/PID recognition | `omarchy/plugin/scripts/highlights/identity.py` |
| Probe, clip/reel encoding | `omarchy/plugin/scripts/highlights/export.py` |
| Catalog and original paths | `omarchy/plugin/scripts/highlights/library.py`, `paths.py` |
| Wrapper defaults and CLI | `omarchy/plugin/scripts/rat-detective-desktop.py` |
| Native UI and transport | `omarchy/plugin/components/HighlightsWindow.qml`, `omarchy/plugin/Service.qml`, `omarchy/plugin/HighlightsModel.js` |
| Accepted saved-cut/frame cache | `omarchy/plugin/scripts/highlights-preview.py`, `omarchy/plugin/components/HighlightTimeline.qml` |

Installed plugin: `/home/tyler/.config/omarchy/plugins/co.animasai.rat-detective`. Running helper command uses that plugin's `scripts/rat-detective-highlights.py serve`; do not assume it runs from the durable secondary copy. At diagnosis, source matched the active installed `audio.py`, `service.py`, `capture.py`, desktop wrapper, preview builder, Service.qml and HighlightsWindow.qml. The secondary audio/service/capture copies under `/home/tyler/.local/share/rat-detective` also matched. The guessed `rat-detective-highlights.service` user unit was inactive despite the live helper process; discover actual launch ownership before restarting anything.

Installed package versions: GSR **6.1.0-1**, FFmpeg **2:9.0.1-4**, Qt Multimedia **6.11.2-1**, PipeWire Pulse **1:1.6.8-1**. Settings has automatic capture enabled and normal profile. No capture/routing configuration was changed in diagnosis.

References:

- [Highlights guide](../highlights.md), [smooth trimming receipt](../verification/highlights-smooth-trim-2026-09-21.md), [UI receipt and rescan correction](../verification/highlights-library-ui-2026-09-21.md), [resize preservation](../verification/window-resize-capture-2026-09-21.md).
- [Reference preflight](../../.research/clips-audio-export-implementation-references.draft.json): preliminary, not a finalized implementation contract.
- [Qt native media-player example](https://doc.qt.io/qt-6/qtmultimedia-video-mediaplayer-example.html): separate player output, mute/volume controls and track information. Existing stack retained.
- Chartroom `brain:sessions/2026/09/rat-detective-automatic-highlights-repair-2026-09-19`: historical repair explicitly left game-audio proof unverified. Its portal/backend details are superseded by current local source and dated receipts.

## Completion evidence to return

A newly captured clip has measured nonzero game audio; Clips normal/trim playback and external exported playback retain it in sync. Capture survives late/replaced audio streams and window resize without capturing unrelated audio. Existing silent clips remain intact and honestly labelled. Export Settings persists, opening either Export dialog shows an editable date/time filename and clear destination, and concurrent exports never overwrite files. Report exact tests, native/human verification gaps and any separately authorized installed revision.

Diagnosis completed with read-only real-media/installed-source inspection and temporary mocked/synthetic reproductions. No game launch, GUI playback, audio-route mutation, service restart, live export, recording edit, deployment or full gameplay suite was performed.

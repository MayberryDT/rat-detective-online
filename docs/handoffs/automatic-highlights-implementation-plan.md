# Automatic highlights implementation plan

Prepared 19 September 2026 for an implementing agent. This is a full delivery
plan, not a report of shipped functionality. Tyler requested the whole feature:
automatic local clips, a usable library and automatic highlight reels.

## Outcome

A player enables automatic highlights through the Omarchy companion, completes
capture setup and plays Rat Detective in the Omarchy web app opened by the
plugin. Interesting moments become local video
clips with their buildup and aftermath. The player can watch, rename, favorite,
trim, delete and export clips, then watch or export an automatically assembled
session reel. No continuous session recording is written to permanent storage.

Implement every phase below. The first successful clip is an integration
milestone, not the finished product. Do not stop with a CLI, mocked UI, technical
prototype, folder opener, or a list of future work for the library and reels.

Suggested receiving-agent brief:

> Implement the complete automatic-highlights plan in this document, preserving
> the current dirty working tree and existing game behavior. Native Omarchy web
> apps launched by the plugin are the primary target. Use GPU Screen Recorder
> and prove capture isolation first. Complete the library, clip management,
> automatic reels, export, packaging and applicable verification. Treat only
> real external dependencies or missing authority as blockers. Prepare a human
> playtest and reviewable release artifacts; do not publish or deploy production
> without separate authorization.

## Scope and authority

This handoff defines implementation requirements. The present task only writes
the plan. Follow the execution authorization in the receiving task; this file
does not independently authorize deployment, publication or account changes.

Read `AGENTS.md`, [current state](../current-state.md), the
[documentation map](../README.md), [companion guide](../omarchy.md) and
[tooling guide](../tooling.md). Current source and the newest preservation rules
take precedence over historical examples in older documents.

Inspect `git status` before editing. The working tree contains deployed gameplay
and unfinished companion changes. Preserve them. A new Git worktree made from
HEAD excludes that work. Do not reset, clean, revert or silently replace it.

If delegation is requested in the execution task, follow
`/home/tyler/.agents/references/cursor-workers.md`: Cursor workers use
`grok-4.6[effort=high,fast=true]`, with bounded ownership and no backend fallback.
This document does not itself request delegation.

Repository work, command tests, APIs and SSH run on the requesting host. Native
plugin interaction, authenticated browser integration and visual verification
run on Ibara under its skill and lease procedure. An installed package on
Veelox does not prove availability or behavior on Ibara. Respect its busy,
paused and cleanup states. Keep human gameplay/input testing with Tyler unless
he explicitly authorizes automation. Report blocked evidence separately from
completed code; do not use another desktop to bypass that route.

Production deployment, GitHub publication, extension-store submission and public
sharing require their own authorization. Prepare reviewable release artifacts
and exact commands before requesting release approval. Do not infer permission
from earlier releases. Preserve `public-live-v2`, protocol 18, current physics,
6–9 bots per round, ten-rat cap, reconnect behavior and all existing audio levels.

## Verified starting point

These observations describe Veelox on 19 September, not all target machines:

| Area | Current evidence | Consequence |
| --- | --- | --- |
| Recorder | GPU Screen Recorder 6.1.0-1 and `gsr-cli` installed | Replay mode and per-instance control are available |
| Media tools | FFmpeg 9.0.1 installed | Probe, trim, thumbnail and export can use a subprocess |
| Desktop | Qt 6.11.2, Qt Multimedia, Quickshell 0.3.1, PipeWire 1.6.8 | Use the existing QML stack; verify codecs on target |
| Browser | Chromium 152 installed; launcher supports several Chromium-family browsers | Verify each browser advertised as supported |
| Existing capture | `recording_start` calls Omarchy fullscreen recording; status checks all recorder processes | Neither is sufficient for owned automatic capture |
| Existing panel | Modified local plugin 1.2.0, compact scoreboard and settings | Preserve its layout and add a small highlights entry |
| Game events | `GameSession.ts` handles deaths, wins, resets and confirmed outcomes | Basic highlight detection needs no Worker protocol change |
| Presentation | `RatReactionEvents.ts` already tracks fresh delivery, ownership, launch and reflection events | Reuse its freshness principles without coupling highlights to animation |

Important findings from primary sources:

* `gsr-cli save-replay N` waits for completion and returns a saved path. A live
  socket alone does not prove frames are being captured.
* Direct window-ID and focused-window capture are documented as X11-only.
  Wayland uses the desktop portal.
* The upstream portal source inspected during planning requests
  `GSR_PORTAL_CAPTURE_TYPE_ALL`. Do not claim `-w portal` enforces window-only
  capture. Inspect the exact installed source/version during phase 1.
* The inspected source logs portal restoration tokens at info level. Suppress
  or redact those messages before collecting diagnostics; never retain raw
  recorder stderr indiscriminately.
* Omarchy's installed stop command uses broad recorder process matches. Treat
  external termination as an intentional stop; do not fight it with restarts.
* Native messaging requires an extension. A game webpage cannot call
  `connectNative` directly. Content scripts must relay through the extension.

The [reference preflight](../../.research/automatic-highlights-implementation-references.draft.json)
records candidates, source links and remaining platform proofs. It is not a
validated final dependency contract. Complete and validate the final reference
artifact after the platform spike fixes the exact supported configuration.

## Product decisions

Tyler's explicit direction is native Omarchy integration first: support the
Omarchy web app that the plugin already launches. The existing
`omarchy launch webapp` and Play/Return workflow is the primary entry point.
Do not redesign this around ordinary browser tabs, an extension toolbar button,
a separate desktop launcher, Electron, or a second Quickshell process.

Use a local rolling video buffer. GPU Screen Recorder is the selected backend.
Tyler confirmed: “Keep GPU Screen Recorder as the main backend; prove and harden
isolation first.” Browser capture is a researched alternative, not an authorized
substitution.
Use an owned native helper and a narrow browser extension for immediate game
events. Use FFmpeg for selected-media processing, and QML for the library.

Keep game-state reconstruction, alternate cameras, cloud upload, public links,
automatic social posting, AI video analysis, microphone capture and a general
video editor outside this feature. This is a complete automatic-highlights
product within that scope. No model API or paid service is required.

Use the following initial settings, with bounded user controls:

| Setting | Initial value | Contract |
| --- | --- | --- |
| Automatic highlights | Off | Installation and plugin enablement never start capture |
| Replay buffer | 45 seconds in RAM | No disk replay buffer or session-long video |
| Ordinary highlight | 10 seconds before, 5 after | Persist actual captured coverage, including truncation |
| Merged interval | At most 30 seconds | Seal before its beginning can leave the buffer |
| Normal profile | Up to 1080p, 60 fps, H.264, AAC, MP4 | Hardware encoding; preserve aspect ratio |
| Light profile | Up to 720p, 30 fps | Same behavior with lower capture load |
| Encoded video target | 12 Mbit/s normal, 5 Mbit/s light | Starting measurements, not a performance promise |
| Audio | Game audio only | Microphone and unrelated applications excluded |
| Storage budget | 5 GiB | Clips, managed exports, thumbnails, trash and temporary reservations count |
| Low-space reserve | 1 GiB | Also reserve estimated bytes for active saves/exports |
| Automatic save limit | 6 new clips per rolling minute | Merges do not spend another slot |
| Reel | Up to 60 seconds, at most 6 moments | Deterministic selection; shorter is valid |

Do not silently use CPU encoding if hardware setup fails. Offer the light
profile or a clearly explained unsupported state. Quality changes apply at a
safe recording boundary and cannot corrupt pending clips.

## Architecture and proposed files

Keep responsibilities separate, without a generic plugin framework:

```text
Game presentation and confirmed events
  -> bounded HighlightDetector and HighlightBridge
  -> origin-scoped extension content script
  -> extension service worker and native messaging port
  -> small native stdio adapter
  -> per-user helper over an owned Unix socket
       -> GPU Screen Recorder and its separate IPC socket
       -> interval scheduler and SQLite library
       -> bounded FFmpeg jobs
  <- QML service, compact panel entry and separate library window
```

The helper is the single writer and lifecycle owner. QML is a client. Closing
the panel cannot interrupt a save. Browser messages cannot run arbitrary local
commands or perform library deletion/export operations.

| Proposed area | Responsibility |
| --- | --- |
| `src/highlights/HighlightDetector.ts` | Pure bounded detector and ranking inputs |
| `src/highlights/HighlightBridge.ts` | Capability handshake, markers, heartbeats, cleanup |
| `src/highlights/protocol.ts` | Browser-side versioned message types and validation |
| `src/session/GameSession.ts` | Actual session lifecycle, confirmed deaths and wins |
| `src/prototype/ChaosView.ts` | Presented objective and physical-comedy observations |
| `omarchy/extension/` | MV3 extension, exact host permissions, native-message relay |
| `omarchy/plugin/scripts/highlights/` | Python helper modules: protocol, capture, scheduler, library, export |
| `omarchy/plugin/scripts/rat-detective-native-host.py` | Length-prefixed stdio adapter only |
| `omarchy/plugin/scripts/rat-detective-desktop.py` | Existing desktop CLI plus narrow highlights commands |
| `omarchy/plugin/Service.qml` | Helper state subscription and existing service lifecycle |
| `omarchy/plugin/Panel.qml` | Small highlights control and library entry |
| `omarchy/plugin/components/HighlightsWindow.qml` | Search, clip detail, playback, trim and reel UI |
| `scripts/omarchy-release.mjs` | Reproducible package, installation, upgrade and rollback |

File names are proposed, not claims that these modules already exist. Prefer
Python standard-library `sqlite3`, sockets and subprocesses over a new server
framework. Reuse existing appearance components and native QML controls.

## 1. Prove capture and browser integration

Complete this phase before building UI around unverified platform assumptions.

1. Inventory recorder flags, IPC behavior, hardware encoders, portal source
   types, browser native messaging and Qt playback on the actual target.
2. Produce a short known-content recording from a dedicated Rat Detective app
   window. Verify resize, fullscreen, another focused window, monitor changes,
   minimization, lock, close and a revoked portal session.
3. Establish window-only selection and validation. A crop of a monitor is not
   window capture. A window title or the fact the game has focus is not proof
   of what the recorder selected. Do not start automatic saves while the source
   is unknown, is a monitor, or is a different application.
4. Where the exact GSR version cannot restrict and expose the portal source,
   implement a narrowly scoped, version-pinned integration patch: request only
   WINDOW sources, reject a returned non-window source, expose the verified
   source type and capture readiness without tokens, and redact restoration
   tokens. Keep it in an app-owned package/path, with source, license notices,
   patch and reproducible build. Never overwrite the system recorder. Verify
   the selected game surface in setup; portal metadata alone may not identify
   its browser tab. Do not invent an unsupported CLI option.
   Present a live first-run source preview and source identity in native setup
   so the chosen game is confirmed before automatic saving is armed. Keep this
   preview transient. Revalidate after permission/source changes; never treat a
   restored token as proof that the same window was selected. Record which
   identity checks are machine-enforced and which rely on the user's selection.
5. Bind recording to the recognized Omarchy game app window and approved
   origin. Start with the browser/profile selected by the existing Omarchy
   launcher, and prove the real installed Play/Return path. Use both compositor
   app-window identity and connector document identity; browser tab IDs are
   internal implementation details, not the user workflow. Do not choose a
   similarly titled ordinary tab or require a toolbar click to begin a session.
   If this browser cannot isolate capture/audio in its existing profile, report
   that exact limitation. A separate profile remains an explicit compatibility
   choice within an Omarchy web app, requiring Tyler's decision; it is not the
   default or a silent migration. Never move cookies/history/resume secrets,
   close an existing game, or replace `omarchy launch webapp` with a generic
   browser launcher to make a test pass.
6. Isolate audio to that game's process/stream. Browser-wide `app:chromium` is
   insufficient when other browser audio is present. A dedicated PipeWire sink
   is acceptable if only the owned game stream is routed to it and it remains
   audible at the existing volume. Verify unrelated audio is absent and clean
   up only the nodes/routes created by this feature. Do not change the default
   sink or system mute state.
7. Demonstrate a real browser marker reaching the helper and a replay save
   covering its visual time. Verify one playable H.264/AAC clip in Qt and an
   ordinary external player. Use synthetic content for audio separation and
   timing proofs; no gameplay-input automation is implied.

Compare OBS replay-buffer control and browser `tabCapture` as alternatives in
the dependency record. OBS introduces another recorder/controller. Tab capture
has useful tab/audio isolation, but requires a browser user gesture and its own
bounded recording implementation. Do not silently swap backends. If GSR cannot
meet isolation or performance even with the bounded integration above, record
the specific failure and obtain a backend decision while continuing independent
library, detector and export work. Unsupported capture is an honest state, not
acceptance of the complete feature.

Deliver `docs/verification/automatic-highlights-platform.md` with exact versions,
source revisions, evidence locations, restrictions and measured results. Avoid
source patches unless the unmodified supported recorder actually needs them.

## 2. Implement the local service and lifecycle

Use a per-user service or equivalent owned process with one instance lock.
Install executable code in the existing durable Rat Detective data directory.
Use `$XDG_RUNTIME_DIR/rat-detective-highlights/` for sockets and transient state,
with mode 0700 and sockets accessible only to the owner. Validate peer UID and
do not follow pre-existing symlinks. Separate the helper control socket from the
GSR socket. Do not bind an HTTP listener or open a firewall port.

Start the service on demand. Starting it is not starting capture. Do not enable
login capture or an endlessly restarting recorder. Use process ownership,
start-time identity and IPC together; never signal a process by name or a stale
PID alone. Existing manual capture commands must not accidentally stop the
owned replay buffer through Omarchy's global stop operation. Report a conflict
and offer an explicit handover instead.

Expose these states with a reason and actionable recovery where applicable:

| State | Meaning |
| --- | --- |
| Off | User has disabled automatic capture |
| Setup needed | Missing supported connector, recorder, audio route or source selection |
| Ready | Enabled, but no eligible local gameplay session |
| Starting | Source/encoder is being established; no coverage claim yet |
| Buffering | Capturing with less than the full requested history |
| Capturing | Valid source and audio with live frame progress |
| Interrupted | External stop, lock, navigation, capture loss or stale connection |
| Storage full | Cannot safely reserve a new clip |
| Error | A classified failure with bounded diagnostics |

Saving clips and exporting reels are job states alongside capture state. They
must not make the UI imply that capture has stopped.

An eligible session requires explicit opt-in, a valid connector, the selected
top-level game document, an active joined human player and validated capture.
Title screens, an open companion, the always-active public city, static
fixtures and private observers are not eligible. Do not attach capture to
public population or the scoreboard polling timer.

Send a gameplay heartbeat every 2 seconds. Expire eligibility after 6 seconds
without a valid heartbeat. A browser/page navigation, lock, suspend, tab close,
bridge loss or capture-source change ends the capture epoch and clears its
unsaved buffer. A pause menu within the same game can retain capture, but does
not itself generate highlights. Other windows gaining focus must never become
the captured source. Ambiguous identity interrupts capture.

After an external recorder stop or permission denial, require an explicit
Resume action. No restart loop. After a normal session end, finish safe pending
saves using available footage, mark shortened aftermath, then stop. Reconnection
may preserve game identity but creates a new recording epoch if capture broke.
Never merge media across that gap. Finalize the session reel after pending
saves settle and 30 seconds pass without a resumed eligible session.

The plugin service holds a short renewable control lease. Panel visibility is
irrelevant. Plugin disable/removal or a shell crash causes owned capture to stop
when that lease expires, even if a browser remains open. A routine shell reload
can reattach within the lease. Do not restart the recorder merely because QML
reloaded. Uninstall removes owned services/hosts/routes, preserves clips and
does not stop unrelated recordings.

## 3. Implement the browser bridge and time contract

Ship a small Manifest V3 connector using native messaging. Grant only the
permissions needed for the Rat Detective origin and the native host. Production
matches `https://ratdetective.online/*`, top frame only, excluding unrelated
origins and incognito by default. Development uses a distinct manifest/ID with
explicit loopback origins for the selected hosted preview. Never ship a wildcard
localhost or all-sites permission to production.

The extension is background plumbing for the Omarchy app, not the product UI.
Prove content-script injection, the native port and lifecycle in `--app` mode
for the actual browser used by Omarchy. All ongoing capture controls, errors,
setup guidance and library access belong to the native plugin. First-time
extension installation may require the browser's own management screen; return
to the same web app afterward. Do not rely on a browser action icon, a pinned
extension, an ordinary tab being active or a browser-capture user gesture.

Register the native host in the selected browser's supported per-user location.
Pin `allowed_origins` to the actual extension ID, and verify the host's caller
argument. Provide deterministic unpacked-development identity and explicit
packaging for release identity. Do not assume copying an extension folder
installs or enables it. Setup must show a successful real handshake. Missing
extensions must not break ordinary Play/Return.

Validate at each boundary. The content script checks `event.source`, origin,
schema and size. The extension service worker validates the browser-supplied
sender origin, tab and top-frame/document identity; it never trusts a page's
claimed identity. The native host validates framing, extension identity and
schema again. Page messages may request a session or submit markers, but cannot
grant capture consent, choose paths, invoke shell commands, export, delete,
upload or browse the library. The helper makes eligibility decisions.

Proposed version-1 envelope:

```text
version, messageId, type, sessionId, documentEpoch, sequence
types: hello, session-start, heartbeat, marker, session-end
marker: id, roundId, kind, score, presentedAtMs, preMs, postMs,
        titleKey, bounded event metadata
reply: messageId, accepted | duplicate | rejected, reason
```

Use random session/document IDs unrelated to multiplayer resume credentials.
Allow only known title keys and short sanitized plain text. Cap each message
at 16 KiB, queued messages at 128, markers at 10 per second with a bounded burst,
and session dedupe storage at 2,048 IDs. The helper chooses/clamps scores and
intervals to the detector policy. Sequence checks must allow acknowledged
retransmission without another saved clip. Reject NaN, infinities, excessive
duration, future timestamps, stale epochs and unknown message versions. Return
clear incompatibility states rather than repeatedly retrying.

Use monotonic time. `presentedAtMs` is the browser's `performance.now()` at the
relevant HUD/presentation event, not the server's simulation timestamp. Associate
it with the document epoch. Establish the mapping to helper monotonic time with
a small ping/echo handshake, retain the lowest-round-trip samples, and refresh
every 30 seconds. Record uncertainty; reject or mark degraded timing above
250 ms instead of silently assuming receipt time is exact. Detect suspend and
clock discontinuities and start a new capture epoch.

Calibrate recorder coverage with a visible synthetic timestamp fixture and
`ffprobe` media timestamps. Use supported first-frame timestamp metadata only
after verifying its units and clock. Wall time is for library display, not
interval selection. Clip metadata records requested and actual bounds,
uncertainty, startup truncation and any extra keyframe lead-in.

## 4. Detect useful highlights without changing gameplay

Build a pure detector over confirmed outcomes and presentation observations.
It must have no authority over health, scoring, physics, pickups or input. When
the connector is absent or disabled, avoid per-frame work, network probes and
large histories. No full world snapshots or player tracking history on disk.

Implement these initial rules in one versioned tuning table:

| Kind | Evidence and condition | Score | Before / after |
| --- | --- | --- | --- |
| Round win | `gameWon.winnerId` is the local player | 100 | 12 / 6 seconds |
| Triple kill | 3 distinct confirmed local kills within 8 seconds | 90 | 10 / 5 |
| Double kill | 2 distinct confirmed local kills within 6 seconds | 75 | 10 / 5 |
| Paperwork delivered | Fresh delivery serial attributed to local player | 70 | 10 / 5 |
| Last-second case steal | Confirmed local ownership transition within the final 5 seconds of Closing Time | 85 | 10 / 5 |
| Launcher escape | Confirmed local launch, then confirmed kill or case acquisition within 6 seconds | 75 | 10 / 5 |
| Spectacular local launch | Confirmed launch followed by a presented rise of at least 25 world units from launch feet | 60 | 8 / 6 |
| Local chaos death | Local confirmed death during a known physical incident, with a visible nearby eruption/corpse event | 65 | 8 / 5 |
| Visible pile-up | At least 3 newly presented corpses in 2 seconds within 20 units, inside camera view with visibility evidence | 70 | 8 / 5 |
| Manual save | Explicit local plugin action while eligible | 100 | Last 20 seconds; no aftermath wait |

These numbers are product defaults for this feature, not existing game tuning.
Suppress repeat ordinary launches/pile-ups for 30 seconds; do not suppress wins
or a stronger event that upgrades an already pending clip. An isolated ordinary
kill or pickup is not automatically a clip. A manual save may bypass the
automatic rate limit but not source safety, storage or a bounded save queue.

Use round/epoch/event identities and silent baselines on initial welcome, reload,
stale snapshots, resets and reconnect. Never infer a delivery or win from a
scoreboard poll. Do not replay past snapshots into highlights. Duplicate deaths
need a stable local key from the available event identity and round; do not
count the same victim event twice.

Do not claim a ricochet kill, causal explosion chain or clutch escape unless
existing authoritative data actually establishes it. Current impact positions
and a recent ricochet do not prove kill attribution. Physical highlights may
use descriptive titles such as 'Paperwork in orbit' without fabricated causality.
Use existing spatial/visibility structures and a maximum 10 Hz observation rate
for the few physical predicates; do not introduce full-scene ray scans each frame.

Rank with fixed rules. No AI service or nondeterministic model judgments.
Persist detector version and contributing marker IDs so duplicate selection,
reel ranking and reports are explainable.

## 5. Schedule bounded, correctly timed clips

Each accepted marker requests `[event - pre, event + post]` in the capture
epoch. Intersect with known available coverage. Merge intervals that overlap
or are within 2 seconds, provided their union is at most 30 seconds. Preserve
all contributing markers and the strongest title/score.

Never extend a pending interval beyond the buffer safety deadline. With the
45-second buffer, reserve at least 5 seconds for scheduling and IPC delay.
If an extension would violate that limit, seal the current interval and begin
another. Adjacent source clips may overlap; reel selection later removes
duplicate media. Bound pending intervals to 4 and in-flight saves to the
verified safe concurrency, initially one. Reject excess automatic candidates
by score and age rather than delaying them until their footage is gone.

At actual save dispatch, request `now - requestedStart`, including scheduling
delay, rather than blindly requesting the nominal interval length. Clip end
may then need trimming. Recheck coverage and recorder identity before dispatch.
Measure whether GSR freezes replay contents when it accepts a save; never assume
that a long file write preserves the start while more events wait in a queue.

Treat GSR's output as a staging file. Verify returned paths are regular owned
files within the configured staging directory, reject symlinks and traversal,
then probe codec, duration, streams and decodeability. Only after successful
validation, final rename and durable metadata commit is a clip `ready`.
Handle a crash between each boundary without duplicates or permanent orphan
files. A timeout is an uncertain save: reconcile the operation ID/staging files
before retrying. Never save duplicate clips just because the reply was lost.

Keep capture running while safe saves finish. Disabling capture discards the
unsaved buffer but must not destroy a completed clip. If the session ends before
the aftermath completes, save the available interval and label the shorter end.
If only a tiny or invalid interval remains, report that it was missed.

## 6. Store clips and manage retention

Use these user-owned locations, honoring XDG overrides:

* configuration under `$XDG_CONFIG_HOME/rat-detective/highlights/`
* SQLite and operation state under `$XDG_STATE_HOME/rat-detective/highlights/`
* video under the resolved Videos directory in `Rat Detective/Highlights/`
* thumbnails under an app-owned cache directory
* sockets and short-lived session capabilities under the runtime directory

Use a small versioned SQLite schema: sessions, clips, markers, reel drafts,
reel items, operations and schema migrations. Clips need IDs, capture epoch,
relative paths, timestamps, duration, actual coverage, profile, score, favorite,
title, detector version, trim bounds, bytes and status. Do not use player names
as filenames. The helper is the only writer; QML receives paginated projections.
Use transactions, atomic file publication and bounded startup reconciliation.

Keep local MP4s usable without the plugin. Export an optional portable JSON
sidecar containing harmless clip metadata, excluding local absolute paths,
browser identifiers, tokens and unrelated player history. Store no thumbnails
or frame dumps for discarded buffer material.

Retention rules:

* automatic pruning removes oldest unprotected ready clips first
* favorites, active playback, queued/running exports and active reel drafts pin
  their sources; session drafts expire after 7 days unless saved or exported
* derived thumbnails follow their source; rebuild missing thumbnails lazily
* when all candidates are protected, stop new saves with a storage-full state
* reserve space before saves/exports; include temporary copies and output bytes
* a normal Delete action moves a clip to app trash with Undo; trash counts
  against the budget and expires after 7 days under the disclosed policy
* never prune outside the managed root, follow symlinks, or delete arbitrary
  pre-existing videos; explicitly chosen external exports are user-owned
* exported copies do not silently disappear when a library source is deleted

Expose budget usage and protected usage. A storage-path change must either
perform a resumable verified move or keep an explicitly indexed old root;
changing a setting cannot strand the library. Include a read-only repair/status
command and classified missing/corrupt-file states. Do not reset the database
as a repair shortcut. Uninstall preserves media and the catalog by default.

## 7. Build the complete companion experience

In the compact existing panel, add one Highlights entry with saved count and
capture state. Put Automatic highlights and its short setup action in settings.
While capture is active or interrupted, show a quiet, legible status. Include
Save recent moment while capture is eligible. No mandatory global hotkey;
reuse existing conflict-safe shortcut machinery only if an optional shortcut
is added. Never capture a keystroke that belongs to gameplay without opt-in.

Open a separate, resizable library window owned by the plugin. Do not expand the
scoreboard popup into an editor. Use existing Omarchy and Rat Detective tokens,
bundled fonts and the selected icon. The native appearance remains the default.
One layout serves both appearances; keep global theme and existing settings.

The library must provide:

* recent sessions, all clips and favorites, with a text search and kind filter
* lazy thumbnails, title, date, duration, event label and explicit missing/error state
* built-in Qt Multimedia playback, play/pause, seek, elapsed/duration and volume
* rename, favorite/unfavorite, delete/undo and reveal-in-folder
* non-destructive in/out trim with reset; retain the event inside default trims
* export clip and export session reel, destination choice, progress and cancel
* a reel preview list with selected moments, remove/reorder and regenerate
* settings for profile, storage budget/path and game-audio capture status
* clear setup, empty, buffering, interrupted, saving, exporting, disk-full,
  unsupported-codec, missing-file and failed-operation states

Use explicit playback, never autoplay thumbnails or reels with sound. Opening
or closing the library cannot alter the game's audio mix. Pause library playback
when its window closes. Read local validated paths from the helper; never load
arbitrary remote media or HTML from titles. Use literal text, bounded labels
and safe elision with accessible full names.

Keyboard behavior must cover every control and modal. Enter activates the
focused control, not always Play/Return. Existing `PanelKeyCatcher` behavior
needs particular care when adding text fields, sliders and library navigation.
Escape closes the innermost dialog first, with focus restoration. Show focus,
textual states and progress; color alone is insufficient. Respect reduced
motion. Check native dark/light themes, Rat Detective appearance, 100–200%
scale, narrow windows, long Unicode titles and unavailable thumbnails. Virtualize
large clip lists; opening a 1,000-clip catalog cannot decode 1,000 videos.

## 8. Generate session reels and exports

At session completion, generate a reel draft automatically from ready clips.
Preview uses source files and trim ranges; it does not require rendering a new
video. Render a stitched file only when Export is requested. A one-clip session
still has a valid reel. A session with no eligible clips shows an honest empty
state without producing a blank video.

Selection algorithm version 1:

1. Form candidates around their strongest marker, using 4 seconds before and
   3 after where available; longer physical sequences can use up to 15 seconds.
2. Collapse candidates sharing marker IDs or overlapping source time within
   the same capture epoch. Never treat different epochs as continuous footage.
3. Sort by score descending, then event time ascending and stable ID. Choose
   up to 6 within 60 seconds; prefer at most 2 of the same ordinary kind when
   alternatives exist. A win remains eligible regardless of that diversity cap.
4. Arrange selected moments chronologically. Preserve enough setup and aftermath
   to understand each event. Never pad a short session with weak duplicates.
5. Save the chosen clip IDs, trim bounds, ranking version and user edits.
   Regeneration must not silently overwrite a user-edited draft.

Use hard cuts by default and the recorded game audio. No added music, portrait
crop, artificial camera motion or invented narration. Those are separate future
product choices. Let the game remain readable in its original aspect ratio.

Export standard H.264/AAC MP4 with a broadly supported pixel format, even frame
dimensions and fast-start metadata. Normalize differing source resolution,
frame rate, pixel format and audio sample rate before concatenation. Add silence
only for an explicitly silent/missing track; do not desynchronize the video.
Reset segment timestamps and concatenate audio/video together.

Stream-copy only when matching parameters and acceptable keyframe boundaries
are proven. Frame-accurate trims require re-encoding the selected portions.
Honor non-destructive trim bounds and show actual exported duration. FFmpeg
commands use argument arrays and internally generated filters/manifests; user
titles, paths and player names never become shell syntax or filter expressions.

Run one export at a time with a bounded queue of 3. Default to waiting while
game capture is active; allow a deliberate Export now with measured resource
limits. Thumbnails and exports yield to capture. Persist job identity and show
queued/running/failed/cancelled/complete states. Handle disk-full, missing input,
codec failure, cancellation, shutdown and restart without losing original clips.
Write temporary outputs, validate, then publish atomically. Never overwrite an
existing user file without an explicit overwrite choice.

Sharing means choosing a local export or opening its folder. Do not upload,
create a public URL, copy a private file into a cloud-synced directory by default,
or send anything to another person automatically.

## 9. Package, upgrade and recover

Produce reproducible plugin/helper and extension artifacts with versioned
protocol compatibility, file hashes, dependency requirements and license notices.
The helper must survive plugin file replacement safely; use the durable install
path and owned service rather than executing deleted package files.

Setup checks dependencies and provides direct recovery for each missing item.
It should guide the user through installing/enabling the connector, choosing the
game source and verifying audio. Do not patch managed system files, broadly
grant extension permissions, disable browser security, or assume native host
registration equals successful connection.

Upgrade the plugin and helper atomically where possible. Stop owned capture
before incompatible replacement, finish/reconcile saves, preserve media and
preferences, migrate the database transactionally and verify the new handshake.
Back up the catalog before a migration; rollback cannot silently discard clips
created after the backup. Older components must report incompatibility clearly
and leave ordinary gameplay/scoreboard access working.

Ship install, check, repair, uninstall and rollback procedures. Uninstall
disconnects the native host and owned service, removes its own audio routes and
restoration capability, and leaves clips/catalog intact. Full data removal is a
separate explicit action. No helper, encoder or FFmpeg processes should remain
after a completed uninstall.

## 10. Implementation tickets and order

The rows below are the work breakdown, not optional stages. Each ticket updates
the same verification receipt with its actual evidence. Keep ownership bounded
if the execution task authorizes multiple agents.

| Ticket | Owns | Depends on | Completion evidence |
| --- | --- | --- | --- |
| H00 | Platform proof, reference finalization, exact compatibility list | None | Real isolated source/audio, replay IPC, browser handshake, timing fixture and Qt playback; document any required GSR patch |
| H01 | Native protocol, service lifecycle, process ownership and CLI | H00 contracts | Duplicate start, stale PID/socket, lock, lost lease, external stop and bounded shutdown tests |
| H02 | Extension packaging, native host, document/session bridge | H00, H01 protocol | Real allowed-origin connection; wrong-origin/frame/extension, oversized message and navigation rejection |
| H03 | Game detector and presentation hooks | H02 contract | Table-driven positives/negatives, duplicate/stale/reset cases, absent-helper no-op and bounded work |
| H04 | Recorder adapter, clock mapping, interval scheduler and atomic save | H01–H03 | Real pre/post clip plus overlap, startup, save timeout, gap and buffer-wrap fixtures |
| H05 | SQLite catalog, retention, thumbnails, safe path handling | H01, H04 file contract | Crash recovery, quota, pinned sources, trash/undo, symlink/path rejection and 1,000-clip listing |
| H06 | Compact panel controls, setup and complete library QML | H01, H05 API | Real native theme/keyboard/state proof, playable clips, trim/favorite/delete/search/export controls |
| H07 | Reel ranking, preview and FFmpeg export jobs | H04, H05 | Deterministic reel, duplicate removal, mixed-media export, cancel/restart/full-disk fixtures |
| H08 | Durable installation, extension artifacts, upgrade and rollback | H02, H05–H07 | Clean install, update, component mismatch, restart, rollback and uninstall preserving media |
| H09 | Integrated verification, performance tuning and documentation | H00–H08 | Full acceptance matrix, packaged artifact hashes, known limits and human playtest handoff |

Do not defer H05–H08 because H04 produces a clip. Resolve routine implementation
details using this plan and measured evidence. Escalate only a material product
change, missing authority or an external blocker that the agent cannot repair.

## Verification and acceptance matrix

Use deterministic unit and subprocess tests for policy and lifecycle. Use real
capture fixtures for pixels/audio/timing, and Ibara for native interaction. Fake
`gsr-cli` success does not prove capture. A QML syntax check does not prove UI.

| Area | Required cases |
| --- | --- |
| Consent | Fresh install off; plugin open and public bots never record; enable/setup visible; disable stops owned capture |
| Identity | Wrong tab/window/origin, page navigation, second game session, reload, no connector, incompatible version |
| Omarchy app integration | Launch through the installed plugin, Return to the same app without reload, reconnect continuity, extension relay in app mode, no toolbar dependency, actual default supported browser |
| Capture | Warmup, full buffer, long session, resize, fullscreen, minimize, monitor change, lock/unlock, suspend, revocation, external stop |
| Audio | Known game tone present; unrelated browser tone and microphone absent; normal human game audio remains audible and unchanged |
| Timing | Visible millisecond counter and known flash/tone; pre/post bounds, startup truncation, delayed IPC and clock discontinuity |
| Detection | Every rule positive and negative; stale welcome, duplicate death, delivery serial jump, epoch reset, hidden/offscreen chaos |
| Scheduling | Overlap chains, duration cap, burst/rate limit, queue saturation, wraparound, slow save, missing reply, abrupt close |
| Storage | ENOSPC, read-only directory, missing file, interrupted rename/transaction, all-favorite budget, pinned reel, trash expiry |
| Library | Empty/error/loading, keyboard focus, Unicode, narrow window, scale/theme change, unavailable codec, 1,000 clips |
| Reels | No clips, one clip, overlap, equal-score determinism, mixed profiles, silent clip, trimmed clip, source removed |
| Export | Correct codecs/dimensions, audio sync, progress, cancellation, overwrite choice, restart, disk budget and path safety |
| Packaging | Clean setup, upgrade, mismatched components, rollback, removal; captures and unrelated recorder survive |

Suggested new focused test files include
`test/client/highlights.test.ts`, `test/scripts/highlightsProtocol.test.mjs`,
`test/scripts/highlightsService.test.mjs`, `test/scripts/highlightsMedia.test.mjs`,
`omarchy/plugin/tests/highlights-model.test.mjs` and
`omarchy/plugin/tests/qml/tst_highlights.qml`. Adapt to the repository's test
runners and add extension tests without introducing a redundant framework.

Run focused tests, then the applicable existing checks:

```sh
npm run typecheck
npm test
npm run build
bash omarchy/plugin/tests/run
bash omarchy/plugin/tests/run-qml
omarchy plugin validate omarchy/plugin
```

Add an explicit media integration runner that generates short synthetic video
and audio, invokes the actual installed FFmpeg/ffprobe, and verifies trim/reel
results. Add a separate documented real-recorder fixture command. Do not place
desktop capture or portal pickers in the ordinary unattended unit suite.

Performance proof compares capture off, normal and light profiles on the same
machine, viewport, game build and matching hosted fixture. Collect at least
3 paired two-minute samples after warmup. Record frame-time p50/p95/p99,
encoder drops, helper/recorder memory, CPU/GPU usage and save-time spikes.
Target less than 10% p95 frame-time regression and less than 20% p99 regression,
with under 1% dropped capture frames. These are acceptance targets to measure,
not guarantees. If normal misses them, tune capture or default that supported
machine to the measured light profile; never retune gameplay to meet the target.

Also run a 30-minute bounded-memory fixture with periodic saves. After warmup,
memory must plateau within documented buffer/resource bounds, not grow with
session length. A 45-second 12 Mbit/s video payload is roughly 67.5 MB, but
audio, GPU surfaces, queues and saves add memory; measure total RSS/GPU use.
Aim for helper idle CPU below 1% of one core and no sustained detector work when
disabled. A ready library should show its first page within 500 ms on the test
machine without eagerly decoding every file.

For gameplay previews, use a frozen matching hosted Cloudflare Worker/client
with production-owned bots and current roster rules. Do not use local workerd
or browser bots as a substitute. Agent browser work stays muted. For audio
proof, route the synthetic fixture to a dedicated captured test sink without
audible agent playback; verify decoded tracks offline. Ask Tyler to verify the
audible gameplay experience through the normal human playtest. A muted game
recording is not evidence that production game-audio capture works.

Acceptance requires one real end-to-end human gameplay session with automatic
clips, a watchable library and an exported reel, alongside the automated and
native proofs. If human input or Ibara is unavailable, deliver all completed
work with the exact unverified remainder; do not call the whole feature verified.

## Final handoff and release boundary

Update current documentation only to describe behavior actually implemented.
Keep this plan and historical receipts clearly dated. Document setup, supported
browsers/versions, first-run permission requirements, capture status, retention,
favorites, recovery and export. Provide screenshots from the real native UI,
sanitized test clips and a short exported reel from authorized test content.

The final report must list completed tickets, exact checks/results, artifact
paths/hashes, platform limitations, outstanding human evidence and any deployed
versions. Log a curated session in Chartroom without raw logs, tokens or media.
Do not claim publishing or production deployment unless it was separately
authorized, executed and verified.

The result is complete when the player can set up capture, play, receive useful
automatic clips, manage them and export a coherent reel, while source isolation,
bounded resources, recovery and the existing game remain intact.

## Primary references used in this plan

Read the linked contract when implementing its boundary. Recheck exact versions
in H00; current documentation is not evidence that a particular target passed.

| Reference | Use |
| --- | --- |
| [GSR control manual](https://man.archlinux.org/man/gsr-cli.1.en) | Per-instance control, save completion and status limits |
| [GSR portal source](https://git.dec05eba.com/gpu-screen-recorder/tree/src/capture/portal.c) | Inspect source selection and token logging; pin the actual build revision |
| [Desktop portal ScreenCast contract](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.ScreenCast.html) | Available source types, session closure, stream metadata and restoration limits |
| [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) | Native host registration, exact extension allowlist, framing and sender checks |
| [Chrome native messaging sample](https://github.com/GoogleChrome/chrome-extensions-samples/blob/main/api-samples/nativeMessaging/README.md) | Host/extension installation precedent; harden the demo for this product |
| [Chrome capture guide](https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture) | Alternative comparison only; browser capture is not the selected backend |
| [FFmpeg concat filter](https://ffmpeg.org/ffmpeg-filters.html#concat) | Stream normalization, timestamp reset and synchronized reel assembly |
| [Qt MediaPlayer](https://doc.qt.io/qt-6/qml-qtmultimedia-mediaplayer.html) | Native playback outputs, seek, status and errors |

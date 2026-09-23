# Automatic highlights implementation audit — 19 September 2026

**Verdict: do not accept this as the completed feature.** There is substantial source code, but the installed plugin is unchanged and several core paths are broken. Installing the code would not make the promised workflow usable. This needs an implementation repair pass before human gameplay acceptance.

Audited on Veelox at 22:25 PDT against the working tree, including untracked feature files. Git HEAD is `918ed23ce4868426b091b7eeb165f5dd5af17fbf`; it is not the feature's implementation baseline because this repository contains pre-existing uncommitted production work. Findings below concern highlights additions and their integration, not unrelated dirty gameplay changes. A file-hash snapshot accompanies the evidence.

## Why the plugin looks unchanged

| Component | Verified state |
| --- | --- |
| Repository `omarchy/plugin/manifest.json` | 1.3.0 |
| Installed `~/.config/omarchy/plugins/co.animasai.rat-detective/manifest.json` | 1.2.0; ordinary directory, not a link to this source |
| Installed `components/HighlightsWindow.qml` | Absent |
| Durable `~/.local/share/rat-detective/rat-detective-highlights.py` | Absent |
| Chromium native-host registration `co.animasai.rat_detective_highlights.json` | Absent |

The implementation receipt explicitly says nothing was deployed. New event hooks also live in the modified game client (`src/session/GameSession.ts` and `src/highlights/`); the connector alone does not add those hooks to the previously deployed game. I did not fetch or certify the current production asset in this audit.

The instruction to “repair/install the companion” omits the prerequisite of installing the new plugin package. Repair from the currently installed 1.2.0 plugin cannot copy files that it does not contain. The required extension is outside `omarchy/plugin/`, while the existing release exporter copies only that plugin directory. A standalone exported plugin therefore does not include the connector or a complete installation flow for it.

## Findings requiring changes

### F1 — P1: setup asserts window isolation without verifying it

[Desktop setup](../../omarchy/plugin/scripts/rat-detective-desktop.py#L885) finds any recognized game window and sends `sourceType: window`. [Service setup](../../omarchy/plugin/scripts/highlights/service.py#L249) starts GSR and immediately calls `confirm_source("window", label)`. [The recorder adapter](../../omarchy/plugin/scripts/highlights/capture.py#L170) simply sets a boolean. No returned portal source type or selected-window identity is checked.

The supplied recorder still permits monitor selection. A game window existing does not establish that the picker selected it. The receipt's statement that monitor/unknown sources remain disarmed is not enforced by this implementation. A mocked platform fixture confirmed setup marks the source confirmed without any portal result and starts recording with no joined session.

**Required repair:** complete H00's real window-only selection/validation contract, then bind the verified source to the actual Omarchy app and connector document. Readiness must require frames and verified identity. Keep automatic capture disarmed when identity cannot be established. Do not treat a picker instruction or a title match as proof.

### F2 — P1: session eligibility and shutdown do not enforce the promised boundaries

[Marker handling](../../omarchy/plugin/scripts/highlights/service.py#L367) and session-end handling do not compare session/document identities with the active session. Sequence is validated as a number but not enforced as increasing. A second session-start can replace the active session. Browser tab identity is forwarded by the extension but not retained in the validated service envelope.

**Reproduced:** a marker from an unrelated session/document was accepted; its session-end then stopped the primary session. By contrast, heartbeats do check these identities.

[Expiry](../../omarchy/plugin/scripts/highlights/service.py#L490) checks heartbeat/lease/process lifetime, but never calls `identity.lock_state()` or revalidates the source window. That lock function is itself an environment-override stub. The code does not establish the required lock, navigation, suspend or source-revocation behavior. Setup can record while waiting for a first session; no initial heartbeat deadline exists in that state. Safety on those transitions cannot depend on unverified portal behavior.

**Required repair:** one consistent identity/sequence/eligibility gate for every browser operation; explicit lock/source-loss transitions, buffer discard and bounded cleanup. Test competing game windows and stale messages.

### F3 — P1: audio isolation and restoration are incomplete

[Audio routing](../../omarchy/plugin/scripts/highlights/audio.py#L54) identifies game streams solely by equality with the compositor window's PID. It does not prove how Chromium's audio process maps to that web app. It can fail to find the stream; shared-process audio cannot be considered game-only without a real test.

The loopback existence check searches the sink list for a loopback label, ignores the loopback creation result, and moves game streams without remembering their original sink. `cleanup_owned_routes()` has no caller in the feature. **Reproduced:** disabling capture called audio cleanup zero times. Partial setup failure also has no rollback of routing.

**Required repair:** prove game-only audio against unrelated Chromium audio and a microphone, track owned module IDs and original routes, verify loopback creation, handle stream replacement, and restore playback on disable/failure/uninstall.

### F4 — P1: enabling after joining does not reconnect the game; clock setup is delayed

[HighlightBridge](../../src/highlights/HighlightBridge.ts#L69) starts its session once when connector availability/join state changes. It ignores rejection/status responses. The content script reports connector availability even when the helper rejects the message because highlights are off or setup is incomplete.

**Reproduced:** one session-start was sent while the helper was off; after simulated enable/setup and three heartbeats there was still only one attempt, while `bridge.live` remained true. A normal “play, then enable highlights” flow therefore gets stale-session heartbeats until a rejoin/reload changes identity.

[Extension response handling](../../omarchy/extension/service-worker.js#L52) also does not match replies by message ID. **Reproduced:** with two requests in flight, the first native reply completed both callbacks; the second request received the first request's response. Timeout listeners are not removed. This needs a bounded request map with response correlation and cleanup.

No immediate clock calibration is sent. The first ping timer is 30 seconds; the service rejects earlier automatic markers as “timing not calibrated,” also reproduced. Subsequent pings reuse a helper timestamp from an earlier reply, rather than a correlated round trip. Capture first-frame timestamps are discarded, and saved clips hard-code `actual_start_ms=0`.

**Required repair:** negotiated enabled/ready/session-accepted states with bounded retries, immediate correlated clock calibration, and the planned capture-to-media timestamp mapping. Keep detector work inactive when the helper has not accepted capture.

### F5 — P1: detection stops after a round reset and advertised launch predicates fail

[GameSession's reset handler](../../src/session/GameSession.ts#L422) calls `detector.reset()`, clearing `primed` and local identity. Later `onSnapshot()` returns immediately when unprimed; only a new welcome restores it. The server's ordinary round reset broadcasts `gameReset`, not another welcome. **Reproduced:** a subsequent round snapshot followed by a local win emits no marker.

[Physical detection](../../src/highlights/HighlightDetector.ts#L184) requires a launch younger than eight seconds, then applies a thirty-second suppression check using that same launch time. **Reproduced:** a forty-unit rise two seconds after launch produces no spectacular-launch marker. Launcher-escape lookup uses the player ID, but launches are stored under event IDs or `local:<time>`; the fixture also produced no escape marker.

Additionally, [GameSession](../../src/session/GameSession.ts#L593) stamps every observed corpse with the current time on every observation. Old visible bodies therefore appear newly dead to the pile-up detector; proximity/event freshness are not established.

**Required repair:** preserve/reprime identity at round boundaries, separate launch time from last-emitted time, use consistent event/player keys, and retain genuine corpse birth time and spatial bounds. Add integration tests spanning two rounds and real detector inputs from GameSession.

### F6 — P1: saved clips cannot play; library controls are incomplete

[Library results](../../omarchy/plugin/scripts/highlights/library.py#L174) return raw SQLite rows containing `relative_path`. [QML playback](../../omarchy/plugin/components/HighlightsWindow.qml#L46) requires `selected.path`. No intervening layer resolves it. **Reproduced:** three existing clip files were listed without the property required by playback. The UI reports “This clip is missing” before attempting media playback.

Search and Favorites change local properties, but the list always uses unfiltered `root.clips`. The service fetches the list when opening the window and does not refresh it after favorite/delete/trim actions or new saves. Rename, a session chooser, reel preview/editing, export progress/cancel and complete keyboard selection are absent. The receipt overstates what the companion can do.

**Required repair:** define and use a validated clip view model, connect filters and updates, and finish H06's native controls. Verify the actual rendered window and Qt playback on Ibara; label/model tests are not UI proof.

### F7 — P1: reels select the wrong time and cannot be exported through the normal post-session path

[Candidate construction](../../omarchy/plugin/scripts/highlights/library.py#L309) gives every clip in an epoch `start_ms=0` and uses `actual_start_ms` as the event time. The save path sets that field to zero. Independent clips are therefore treated as overlapping and the event is placed at their beginning.

**Reproduced:** three fifteen-second clips with events at session times 100s, 200s and 300s collapsed to one reel item trimmed to 0–3s. The real fixture event was ten seconds into each clip, so the selected trim excluded it.

[The desktop reel actions](../../omarchy/plugin/scripts/rat-detective-desktop.py#L947) use the current `status.sessionId`. The service clears that field at session end, when it creates the reel. Export/regenerate then address an empty session ID; there is no completed-session selector in the UI.

**Required repair:** separate absolute capture interval, event offset and clip-relative trim fields; use durable selected-session/draft IDs; implement preview/edit/export and test separated and overlapping moments through the catalog, not just directly constructed ranking inputs.

### F8 — P1: export/save work blocks the process responsible for stopping recording

[The socket server](../../omarchy/plugin/scripts/highlights/service.py#L538) handles one request at a time. Save/probe/thumbnail/export calls run synchronously inside it. [Exports](../../omarchy/plugin/scripts/highlights/service.py#L452) directly run FFmpeg; the queue object is unused and job state never progresses. A long export prevents heartbeat, lease, disable and status processing. Client timeouts are four/eight seconds; individual media subprocess timeouts reach minutes.

Request validation and response writing are not protected by a per-request exception boundary. **Reproduced:** a well-formed JSON helper request with an unknown operation throws `ProtocolError` out of `handle`. A timed-out/disconnected client can also leave an unhandled response-write error. The entry point's `finally` closes the instance lock but does not stop the recorder, which was launched in its own session.

**Required repair:** keep lifecycle control responsive; use bounded asynchronous media jobs and cancellation, request/read deadlines, protected replies, and guaranteed recorder/audio cleanup on every helper exit. Test slow FFmpeg, disconnects and malformed requests.

### F9 — P1: retention reaches a state from which automatic pruning cannot recover

[Reservation](../../omarchy/plugin/scripts/highlights/library.py#L244) rejects saves once usage plus a one-GiB reserve would exceed five GiB. [Pruning](../../omarchy/plugin/scripts/highlights/library.py#L248) only runs when existing usage already exceeds five GiB.

**Reproduced with catalog byte counts, not a large disk allocation:** at four GiB with three unprotected clips, reserving one byte failed, pruning removed nothing, and reservation still failed. This is not rolling retention. Usage also excludes exports, temporary outputs, sidecars and thumbnails and does not test actual filesystem free space.

**Required repair:** reserve/prune atomically for the upcoming operation, account for all managed storage and filesystem free space, respect active pins, and recover automatically after space becomes available.

### F10 — P2: recorder launch, logs and recovery need concrete correction/verification

[Recorder arguments](../../omarchy/plugin/scripts/highlights/capture.py#L96) specify `-ro` but omit `-o`. The installed GSR manual defines `-o` as the replay output directory and `-ro` as the directory for regular recordings during replay/streaming. The supplied real-recorder fixture has the same omission. Correct this against the exact 6.1.0 binary and prove a real saved path; this audit did not launch a capture to test startup failure.

Recorder stdout/stderr go directly to an append-only file before any redaction. Redacting later diagnostic reads does not satisfy the plan's requirement to avoid retaining raw portal tokens. No actual token disclosure was observed in this audit. Normal profile also omits the planned 1080p size cap.

Publication moves the file before the database transaction without a durable operation journal. Recovery scans old staging files and missing catalog rows, not orphaned files already moved into the library. Cross-filesystem staging-to-Videos moves, failed exports and stale draft pins need explicit recovery coverage.

## What the tests establish

Fresh focused execution passed **20 tests**: nine Python/protocol/media subprocess tests, ten client detector/protocol tests, and one plugin model test. These are useful unit foundations and do not establish a working product.

The test named “ffmpeg trim and reel concat produce playable h264/aac mp4” only invokes `export_clip`; it creates a second input but never calls `export_reel`. The QML highlights test checks text labels and never instantiates the library window. The existing tests do not cover the cross-layer failures reproduced above.

Evidence and reproducible fixtures are in [the evidence directory](automatic-highlights-audit-2026-09-19/evidence.json). Run from the repository root:

```sh
python3 docs/verification/automatic-highlights-audit-2026-09-19/reproduce.py
node docs/verification/automatic-highlights-audit-2026-09-19/reproduce.cjs
```

These fixtures deliberately assert the observed defects. A successful run means the defect was reproduced, not that the feature passed. They use temporary XDG state, fake media/capture and mocked platform/browser interfaces. They do not record a desktop, route real audio or exercise QML rendering.

No native capture, picker, audio-isolation, Qt playback, performance or human-play evidence was generated in this audit. Those acceptance gates remain open. No independent Cursor reviewer was available through this session's tools; this is a direct source audit with targeted reproductions, not a signed multi-reviewer/native acceptance pass.

## Completion status and repair order

| Ticket | Audit status |
| --- | --- |
| H00 platform proof | Incomplete; mandatory isolation/timing/playback proof absent |
| H01 service lifecycle | Partial; eligibility, cleanup and blocking-request defects |
| H02 connector | Partial; session negotiation and request correlation broken |
| H03 detector | Partial; reset/launch defects and incorrect physical-event inputs |
| H04 capture/timing | Unproven real path; source and timestamp contracts incomplete |
| H05 catalog/retention | Partial; playback data, retention and recovery defects |
| H06 native experience | Incomplete; playback broken and promised controls absent |
| H07 reels/export | Incomplete; wrong selection/timing and unused job queue |
| H08 packaging | Incomplete; live 1.2.0 unchanged, connector outside exported package |
| H09 integrated verification | Not accepted |

1. Reopen H00: prove the existing Omarchy web app's actual window and audio isolation on Ibara, correct the recorder contract, and implement the required source validation before arming capture.
2. Fix service/bridge identity, lifecycle, clock and detector integration; add focused regression tests for these reproduced failures.
3. Finish the clip view model, retention/recovery, native library and completed-session reels; make media jobs asynchronous and cancellable.
4. Produce an installable plugin plus connector/native-host artifacts and a matching hosted client preview. Demonstrate the real installed Play/Return → enable/setup → save → watch/manage → session reel/export workflow on Ibara. Preserve current production gameplay and the dirty tree.
5. Run the remaining capture/audio/timing/performance/recovery acceptance matrix, then provide screenshots, a sanitized real clip/reel, artifact hashes and exact usage instructions. Keep production deployment and publishing at the separately authorized release boundary.

The useful source should be repaired rather than discarded. The appropriate next milestone is a demonstrated, locally installed end-to-end feature—not asking Tyler to discover implementation failures during a human playtest. This audit changed only its report and evidence files; it did not install, enable, publish or deploy anything.

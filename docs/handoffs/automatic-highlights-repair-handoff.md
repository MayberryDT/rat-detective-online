# Automatic highlights: finish, activate and expose locally

Prepared 19 September 2026 after the implementation audit. Pair with the [short agent prompt](automatic-highlights-repair-prompt.txt). This is the execution brief for completing the existing feature, not a new architecture proposal. The current task creates this handoff; execution begins when Tyler gives it to the implementing agent.

## Latest instruction and required outcome

**Tyler explicitly wants capture ON locally and the feature integrated and visible in his running Omarchy plugin. This supersedes the earlier instruction to leave his capture off.** Complete the installation and activation yourself within the authorized operating routes; do not return another source-only repair report or ask Tyler to assemble the components.

The present task only writes this handoff. The receiving agent is assigned the implementation and local activation below. Production publishing/deployment is still a separate boundary.


Deliver usable automatic highlights in the native Omarchy web app opened by the Rat Detective plugin. Keep GPU Screen Recorder as the primary backend and prove window/audio isolation first. Finish local replay capture, automatic detection, clip management, session reels, export, packaging and recovery. Preserve the existing game and companion.

Delivery means all of the following are true on **Veelox**, Tyler's actual workstation:

1. The installed plugin is loaded by the running Omarchy shell and visibly exposes Highlights and capture status. Apply the scoped reload needed; “reload the shell yourself” is not the final handoff.
2. The connector is actually loaded in the Chromium-family profile used by the Omarchy web app, its native host communicates with the durable helper, and component versions agree. Registration JSON or an unpacked extension folder alone is insufficient.
3. The plugin opens a matching game client as an **Omarchy web app**, and Return brings Tyler back to it. Deliver the actual working launch route, not a reference to a preview that has not been built.
4. Automatic highlights is **enabled persistently** for Tyler. Complete actual source setup and connect the verified game window/audio. The plugin reports real Buffering/Capturing while an eligible game session is active, or an accurate enabled/ready state when no eligible game is running. Never substitute an `enabled: true` setting or a false “Capturing” label for a working recorder.
5. Saved clips are visible and playable in the plugin's library; clip management, completed-session reels and export work. Provide a real proof clip and coherent reel, with exact paths and the small number of actions Tyler needs for ordinary use.

“Capture on” means the opted-in game-only rolling replay buffer, not continuous desktop/session recording. Preserve eligibility, lock/source-loss handling and the ordinary off switch. Fix isolation before capturing; never bypass it to make the status look successful. Keep Tyler's enabled preference after test cleanup. Remove disposable test captures/processes without resetting that preference or dismantling the working local feature.

The [original implementation plan](automatic-highlights-implementation-plan.md) remains the complete product and acceptance specification. The [audit](../verification/automatic-highlights-audit-2026-09-19.md) identifies defects and overstatements in the first implementation; it is not an exhaustive replacement specification. Finish H00–H09, including requirements not singled out in the audit.

## Read first and establish the starting state

1. Read applicable `AGENTS.md`, [current state](../current-state.md) and [documentation map](../README.md), then this handoff, the original plan, audit and [repair follow-up](../verification/automatic-highlights-repair-followup.md).
2. Inspect `git status` and the audit's [source hashes and results](../verification/automatic-highlights-audit-2026-09-19/evidence.json). Recheck findings against current source before editing. Preserve unrelated uncommitted work; HEAD is not the deployed/feature baseline. An isolated checkout must include the relevant dirty source explicitly.
3. Inventory repository, installed plugin, durable helper, native-host registration, connector/profile and game-client versions separately. The latest follow-up verified plugin 1.3.0 and the Highlights window are installed, but capture is off. The last agent reported the connector unloaded and the matching hosted preview unbuilt. Recheck these separately; installed files do not establish a loaded or usable runtime.
4. Read [Omarchy integration](../omarchy.md) before installation and [tooling](../tooling.md) before preparing a preview. Use existing install/export/rollback mechanisms where sound. Read the Ibara skill and client quickstart before native/browser operations.

The first agent's [platform receipt](../verification/automatic-highlights-platform.md) and [usage guide](../highlights.md) contain claims contradicted by the audit. They are evidence to reconcile, not proof that those capabilities work. Update current guidance to match the repaired implementation; keep historical audit results intact.

## Scope, environment and release boundary

The receiving task's short prompt authorizes implementation, reversible local installation/repair, scoped shell reload, connector setup, local game-only capture setup and activation, and the existing private hosted-preview workflow needed for the working client. Back up affected plugin/config/catalog state, preserve profiles and media, and record what is installed on each host. Integrate and activate the validated plugin/helper on Veelox; native UI acceptance runs on Ibara under the existing routing rules. Veelox live desktop configuration and runtime IPC remain targeted at Veelox. A source-tree QML preview is not an installed-package acceptance test.

Keep repository edits, git, unit/type/media tests and APIs on the requesting host. Use Ibara for native plugin interaction, browser integration, picker operation and rendered evidence. Follow its lease, busy/pause and cleanup procedure. Do not substitute Veelox GUI testing or claim unavailable evidence passed. Continue independent implementation, local configuration, applicable checks and matching-preview preparation when desktop access is unavailable. A busy Ibara does not block those steps or authorize declaring the local feature complete. If an actual local picker/profile action cannot be completed through available authorized tools, state that exact remaining action and tool limitation after finishing the independent work; do not replace it with a generic “human playtest next.”

Preserve `omarchy launch webapp`, the existing Play/Return behavior, selected browser/profile and ordinary gameplay audio. Do not silently move to a separate profile, generic browser tab or another recorder backend. Any unavoidable material compatibility change needs Tyler's decision, with concrete evidence of the limitation.

Production deployment, GitHub publishing, extension-store submission and public sharing remain outside this task. The modified game client is necessary: installing the plugin/extension does not add event hooks to the previously deployed game. Build a frozen matching hosted preview through the existing process and prove the native flow against it using an explicitly scoped development connector/configuration. Make the matching client available from the installed plugin as a clearly labeled Omarchy preview app while the canonical client remains incompatible. Build and connect this route yourself, retain ordinary production Play/Return, and use narrowly scoped connector permissions. Do not silently redirect an existing game or leave Tyler with only the incompatible production route.

Local capture must work through the delivered matching app even while production deployment remains unauthorized. Before production authorization, report the canonical site's actual compatibility accurately. If its client lacks the bridge, the companion must say that automatic capture is unavailable for that client, rather than claim it is ready. Prepare the exact production release artifacts and commands only after local acceptance. Separate “installed locally,” “preview verified,” “human verified” and “production available.”

Human gameplay/input testing remains with Tyler. Use synthetic fixtures for machine verification; do not automate pointer-lock gameplay. Follow the plan's muted agent-testing and synthetic audio-isolation procedure. Preserve protocol 18, current game tuning, 6–9 server bots per round, ten-rat cap and the dirty production source. This handoff does not request delegation; follow the repository's Cursor-only procedure if delegation is separately authorized.

## Work order and required regression evidence

### 1. Establish the real capture contract — H00, F1/F3/F10

Prove source selection, frame readiness, game-only audio, replay output and timing with the actual supported GSR/browser/portal versions on Ibara before arming automatic saves. Correct the `-o`/`-ro` launch contract against the real binary; the audit established a documentation mismatch, not a captured runtime failure.

A recognized app title/class or successful IPC status is insufficient proof of the selected recording source. Follow the original plan's app-owned, narrowly scoped GSR patch route if needed to request only window sources, expose verified source/readiness, and reject invalid sources. Do not overwrite the system recorder. Complete the transient source preview and identity confirmation. The latest follow-up found that the CLI still fabricates `portalEvidence` and `userConfirmed: true`, overriding an explicit monitor result. Remove this bypass and add a regression through the actual CLI → service path. Every replacement recorder/portal session must be independently validated; a confirmed preview does not authorize a later uninspected source.

Prove the game tone is present while unrelated browser audio and microphone input are absent. Track owned audio modules and original routes; verify creation, stream replacement and restoration on failure/disable/uninstall. Preserve ordinary audible gameplay. Redact/suppress recorder secrets before persistence, bound diagnostics, and apply the promised profile limits. Finalize the existing dependency/reference contract and its validation receipt from exact supported sources.

### 2. Repair lifecycle, bridge, timing and detection — H01–H04

| Audit finding | Required successful behavior |
| --- | --- |
| F2 identity | Reject stale/wrong document, session, sequence and competing-window messages for every operation, including marker/end/ping; keep the active session intact. Establish trusted connector-to-app identity. |
| F1/F2 eligibility | Opening the plugin or running public bots does not start automatic recording. Any setup preview is explicit, bounded and transient. Lock, suspend, navigation, revoke, lost lease/source and external stop discard unsafe buffer state and stop owned work. |
| F4 negotiation | Enable before joining and after joining both work without a forced reload. Helper restart and connector reconnect renegotiate. Disabled/unaccepted capture does not run sustained detector work. |
| F4 replies/time | Correlate concurrent native replies by request ID; remove timed-out listeners and bound queues. Calibrate immediately, refresh with real round trips and map capture first-frame timestamps to clip-relative event offsets. |
| F5 detection | Positive/negative cases survive at least two ordinary round resets. Launch rise and launcher escape emit correctly; old/offscreen/distant bodies do not appear as fresh pile-ups. Preserve authoritative attribution and duplicate suppression. |
| F8 control | Slow saves/FFmpeg never block stop, status, heartbeats or lease expiry. Bound jobs, add cancellation/read deadlines, contain malformed requests and broken connections, and guarantee recorder/audio cleanup on helper exit. |

Use the existing code where correct. Prefer a small explicit state machine and one clear owner for each resource over additional daemons or generic frameworks.

### 3. Complete storage and the native experience — H05–H07

| Audit finding | Required successful behavior |
| --- | --- |
| F6 clip contract | A real saved clip lists, selects and plays in Qt via a validated local media URL. New saves and favorite/rename/trim/delete/undo updates appear without reopening the window. Search and filters actually change results. |
| F6 UI scope | Finish the original plan's keyboard access, states, thumbnails, clip editing, completed-session selection, reel preview/editing, export destination/progress/cancel and applicable settings. Render and operate the actual native UI. |
| F7 reels | Keep capture/session times separate from clip offsets. Three nonoverlapping moments remain distinct and include their events; true overlap collapses correctly. A completed session remains selectable and exportable after session end and helper restart. |
| F8 export | Use the bounded job queue in the live service. Test mixed sizes/profiles, silent media, audio sync, cancel/restart, missing input and overwrite protection through the real reel exporter. |
| F9 retention | The audited four-GiB case with unprotected clips can make room for a new save. Respect favorites/playback/reel/export pins; account for managed temporary media and real filesystem free space. Recover after space becomes available. |
| F10 recovery | Interrupt publication at file/database boundaries and recover consistently. Cover cross-filesystem staging, orphaned final files, failed exports and expired pins; preserve existing clips and catalog across repair/rollback. |

The audit reproduction scripts intentionally assert broken behavior. Preserve them as dated evidence. Convert their scenarios into normal regression tests that assert the corrected result; a successful run of the historical scripts is not a pass for the feature.

### 4. Package, install and demonstrate — H08–H09

Ship reproducible plugin/helper and connector artifacts together, with supported-browser host registration, component compatibility, hashes, install/check/repair/uninstall/rollback procedures and license notices. The repair now exports a sibling `.connector`; verify that the complete distribution installs and loads it in the actual target profile rather than stopping at artifact creation. Developer setup must use a loadable artifact and the intended development identity/origins, not unexplained manifest-file swapping.

Test clean installation and an upgrade from the actual 1.2.0 package. Preserve existing settings, launch/return and the scoreboard. Verify rollback/uninstall stop only owned processes/routes and preserve clips. Record backup locations and installed file hashes.

On Ibara, demonstrate the installed plugin's flow: Play/Return → Highlights entry → enable/setup and verified source → eligible joined session/authorized synthetic fixture → manual and automatic clips → library playback/edit/filter → completed-session reel preview/export → disable and cleanup. A fixture can establish machine behavior; label it honestly and retain the separate human-gameplay acceptance gate.

Finish the **Veelox activation** in the required-outcome checklist above: install/reconcile the validated local package and helper, apply the shell reload, establish the real connector handshake, provide the matching Omarchy app route, complete verified capture setup, and leave automatic highlights **on**. Verify the preference survives normal helper/shell restart and that eligible sessions reconnect correctly. Do not restart or close unrelated browser sessions or discard user state to load the connector.

After testing disable/recovery, restore Tyler's requested enabled state. Final status must identify the app/client and whether capture is currently buffering/capturing or enabled and waiting for an eligible session. If a real unresolved dependency prevents activation, label the task incomplete and name it precisely; do not claim “integrated” on file presence alone.

## Verification and completion record

Run focused regressions for each repaired boundary, then applicable repository checks from the original plan: typecheck, tests, build, plugin tests, QML tests and plugin validation. Run the genuine media integration path, real source/audio/timing fixtures, native UI acceptance and the original performance/bounded-memory matrix. Reuse valid evidence; rerun affected checks when implementation or artifacts change.

Investigate the two previously reported DispatchRoster QML failures enough to establish whether they predate this work or expose a changed integration. Report their exact evidence and effect on acceptance; do not silently omit them or retune unrelated UI to hide them.

Maintain one repair receipt at `docs/verification/automatic-highlights-repair.md` containing:

- H00–H09 and F1–F10 status with source changes, exact checks and linked evidence; disclose remaining failures and unsupported configurations.
- Per-host installed and running versions/paths/hashes, connector identity/profile and successful handshake, verified game-client/Worker preview identity, persisted enabled setting and actual capture state. Record production separately.
- Native screenshots, a sanitized real GSR clip, a coherent exported reel, timing/audio/performance measurements, and cleanup/rollback results.
- Exact user steps from the existing plugin, expected states, media/export locations and recovery actions. Test those instructions against the installed result.
- Any genuinely blocked remainder, the dependency/authority missing, and the completed independent work. Do not substitute “human playtest next” for unfinished engineering.

Update `docs/highlights.md`, the documentation map and current-state summary to reflect only demonstrated behavior. Log a curated Chartroom session without recordings, tokens or raw logs.

Engineering completion means the full local outcome on Veelox above is delivered, capture is enabled, the matching app workflow works, and the repair findings are closed with appropriate evidence. Full feature acceptance additionally needs the human gameplay session required by the original plan. Production availability additionally needs an authorized matching-client release. State each milestone truthfully; do not stop at source-only code or declare the whole feature complete while one remains unverified.

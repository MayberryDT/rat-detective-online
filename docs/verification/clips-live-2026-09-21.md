# Clips and roster fixes installed — 21 September 2026

Tyler authorized making the completed work live for human testing. Installed the
audio/export repair and roster QML fixes on Veelox, retaining local plugin 1.3.0.
No game/Worker deployment or public release was needed.

Updated 19 differing files across the installed plugin and durable helper copy.
Files were hash-checked against the prepared source, copied through temporary
files and atomically replaced, with helper modules installed before QML consumers.
The helper received its graceful shutdown command and restarted from
`~/.local/share/rat-detective/rat-detective-highlights.py`; PID changed from
2648706 to 2988578. Ran `omarchy-shell shell rescanPlugins`; shell ping succeeded.

Verified the complete installed plugin matches repository source, native plugin
validation passes, no Rat Detective-specific reload error appears in the shell
log after installation, and the helper answers with the new `audio` and
`exportSettings` fields. A fresh shell lease confirms continued service polling.
Automatic highlights remains enabled, with `ready` / `Waiting for the game.`
No capture or media job was active during the update. Dedicated-profile native
host registration still points to an existing executable.

All 13 clips remain in the catalog. All 26 pre-existing original recording and
sidecar hashes are unchanged, as are capture settings and shell configuration.
Full plugin backup, durable Python backup, SQLite backup, settings/config backup,
install manifest and preservation hashes are private local artifacts under
`output/clips-live-20260921-124130/`.

Prior evidence: [audio/export implementation](clips-audio-export-2026-09-21.md)
and [37-pass QML repair](roster-qml-2026-09-21.md). These earlier receipts describe
the source-only boundary at their time; this receipt supersedes that installation
status. Human testing should open the game, produce a fresh clip, check its sound,
and try clip/reel export with the editable filename and preferences. Actual game
audio and speaker audibility remain human acceptance, not claimed by this install.

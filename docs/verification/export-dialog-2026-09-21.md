# Export dialog correction — 21 September 2026

Tyler's screenshot still showed the old single destination field after the prior
plugin rescan. The new files were on disk, but the existing shell process retained
the old window. File parity and a successful rescan were insufficient activation
evidence.

Simplified both clip and reel export to a prefilled editable filename and folder
with native Qt FolderDialog Browse, plus Cancel/Export. Removed explanatory copy,
the duplicate resolved-path label, preset summary and silent-source note from the
dialog; export preferences stay in Settings. Filename initialization also has a
date/time fallback. The initial folder includes the dated default explicitly;
the chosen folder is now used exactly. A failing regression demonstrated the
previous hidden date suffix on an explicit folder; the fixed helper passes it.

Verification: all seven audio/export tests and 37 QML checks pass; the changed
window parses with qmlformat, and whitespace checks pass. Ibara reported an
operator pause, so native chooser interaction and visual verification were not
performed. No pause was cleared or substitute desktop test attempted.

Installed the QML and both live export-options module copies, verified hashes,
gracefully stopped the idle helper and restarted the Omarchy shell. The packaged
restart command raced the old shell's shutdown: its first replacement declined
to launch because the old instance was still exiting. After confirming exit,
launched the normal shell through Hyprland. New shell PID 3072520 responds to ping,
has no Rat Detective load warnings/errors, and renews the enabled helper's lease.
This replaces the old process rather than relying on component rescan. The helper
currently reports 24 clips, including the user's intervening captures.

Before-edit/live backups, tests and activation receipt are private local files
in `output/export-dialog-2026-09-21/`. No recordings were edited or removed; no
game deployment or publishing. Human confirmation of the new dialog and native
folder picker remains outstanding.

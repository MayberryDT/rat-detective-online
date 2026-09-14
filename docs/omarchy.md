# Omarchy Dispatch desk

Rat Detective stays a browser game at [ratdetective.online](https://ratdetective.online/).
The companion adds a public activity board, assignment progress, launch/return,
room invitations and optional desktop controls. It runs in the existing Omarchy
shell process. The game's hosted Worker owns gameplay and matchmaking.

See the [implementation plan](omarchy-dispatch-plan.md),
[plugin guide](../omarchy/plugin/README.md) and
[verification receipt](verification/omarchy-dispatch-2026-09-14.md) for scope and
release status. The plan is design history; the receipt distinguishes checked
behavior from remaining human desktop checks.

## Appearance

The redesigned Dispatch panel defaults to **Omarchy** and follows live popup
colors and shell fonts. **Preferences → Appearance → Rat Detective** switches to
the game’s purple, lavender and brass palette, Bangers headings and Outfit body
text. Both use the same assignment layout and native outer popup/bar. The choice
persists on the existing widget entry and applies immediately without restarting
the game, service or recording, or changing the global theme. Low-contrast native
muted text receives a readable blend of that theme’s foreground/background.

The launcher/header now use the actual game badge. A monochrome rat-and-fedora
mark replaces the generic bar glyph. Licensed fonts are bundled locally.
See the [appearance receipt](verification/omarchy-appearance-2026-09-14.md).

## Public information

`GET /api/companion/v1/status` is the versioned companion feed. It reads a bounded,
paginated directory of public rooms. Active GameRooms publish authoritative
summaries; opening the panel does not fan out to or start sleeping games.

Summaries include population, assignment progress, public holder/result information
and observation/expiry times. They exclude positions, private rooms, reconnect
credentials and unrevealed upcoming zones. Legacy `/status` remains available for
old companions and title world preparation; it describes only the canonical room.

The panel prioritizes deliveries for Paper Chase, personal zone points for
Jurisdiction, qualifying case kills for Excessive Force, and the actual countdown
and holder for Closing Time. Combat statistics remain secondary. Empty rooms
sleep; occupied rooms normally fill to eight total rats, with a 16-rat maximum.

## Launch and invitations

Return focuses a recognized game window without reloading it. Play launches when
none exists. An explicit Join action opens a selected-room invitation separately.
Links use the canonical URL with a validated public-room preference; all joins
still use normal admission and capacity checks. Full or expired preferences fall
back with clear feedback. After successful entry the page consumes its invitation
parameter so a same-tab reload can use its private resume credential normally.

The desktop launcher uses a durable helper and icon outside the plugin directory.
It survives plugin removal. Installation or repair backs up the previous launcher
and support files. Workspace/fullscreen preferences and shortcuts are optional.
The companion leaves global DND, lock policy and the accepted game mix alone.

## Development installation and rollback

From the game repository, create a fresh export directory:

```sh
node scripts/omarchy-release.mjs export --out=output/omarchy-release
node scripts/omarchy-release.mjs install --source=output/omarchy-release
omarchy-shell shell rescanPlugins
```

Use a new output path for the next export. The installer stages and validates the
package, preserves unrelated local files, and saves the previous plugin under
`~/.local/state/rat-detective/plugin-backups/`. A modified managed file blocks an
upgrade until reconciled. Reinstalling identical content is a no-op.

```sh
node scripts/omarchy-release.mjs rollback
omarchy-shell shell rescanPlugins
```

For first installation, enable `co.animasai.rat-detective` through Omarchy. Existing
bar placement/settings survive upgrades. Enabling does not install or launch the
game: use the panel's Add to menu or Repair launcher action. Launcher rollback is
separate from plugin rollback and uses `omarchy/plugin/scripts/rollback-webapp.sh`.

## Optional controls

Notifications start disabled. Configure gathering thresholds, assignment alerts,
quiet hours and cooldowns in the companion settings. Recovery establishes a fresh
baseline and avoids replaying missed notices. Focused play suppresses companion
alerts, and system DND is respected.

Recording starts/stops only through an explicit control, uses the installed
Omarchy recorder and leaves captures local. Desktop audio is an opt-in preference;
this companion does not enable microphone capture. Recording state includes
recordings started elsewhere, so Stop is an explicit user action. Disabling the
companion does not stop a recording or delete captures.

## Checks

```sh
node --test test/scripts/omarchyModel.test.mjs test/scripts/omarchyDesktop.test.mjs test/scripts/omarchyRelease.test.mjs
omarchy plugin validate omarchy/plugin
npm run typecheck
npm test
npm run build
```

The bounded hosted check is `node scripts/verify-companion.mjs STAGING_ORIGIN`.
It accepts only the named staging Worker for synthetic admission checks. Use
`--read-only` for production metadata verification. It drives no browser input,
movement or shooting. Staging must be empty before it starts.

Desktop rendering, actual supported-browser window identity, recording usability
and subjective play remain distinct checks. Keep agent game inspections muted
and human playtests audible, following [tooling](tooling.md).

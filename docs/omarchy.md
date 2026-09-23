# Omarchy Dispatch desk

Rat Detective stays a browser game at [ratdetective.online](https://ratdetective.online/).
The companion is a compact public scoreboard: assignment objective, a full
ten-name roster with BOT/HUMAN tags, objective totals and K/D, and Play/Return.
Settings has the Omarchy or Rat Detective theme, one gathering notification
switch, and a keyboard shortcut. It runs in the existing Omarchy shell process.
The game's hosted Worker owns gameplay and matchmaking.

See the [implementation plan](omarchy-dispatch-plan.md),
[plugin guide](../omarchy/plugin/README.md),
[1.0.0 release receipt](verification/omarchy-dispatch-2026-09-14.md),
[appearance receipt](verification/omarchy-appearance-2026-09-14.md) and the
[1.2.0 / mini-scoreboard receipt](verification/omarchy-live-stats-2026-09-14.md).
The plan is design history. Dated receipts keep their measured results and
current release status.

GitHub [v1.2.0](https://github.com/MayberryDT/rat-detective-omarchy/releases/tag/v1.2.0)
was published from commit `a9e1c30d87c911551d1d49435632eb913269306d` with a
full live-stats menu **without authorization**. Tyler objected. That tag is
not an accepted desktop release. Local plugin **1.3.0** is unpublished work on
that mini-scoreboard plus opt-in [automatic highlights](highlights.md). Do not
publish it. See the
[14 September receipt](verification/omarchy-live-stats-2026-09-14.md).

## Appearance

The redesigned Dispatch panel defaults to **Omarchy** and follows live popup
colors and shell fonts. **Settings** on the panel offers **Omarchy** or
**Rat Detective**, one switch to notify when people are playing, an At least
people stepper (1–10, default 2), and an editable Super+Shift+R shortcut. Rat Detective uses the
game’s purple, lavender and brass
palette, Bangers headings and Outfit body text. Both use the same assignment
layout and native outer popup/bar. The choice persists on the existing widget
entry and applies immediately without restarting the game or service, or
changing the global theme. Low-contrast native muted text receives a readable
blend of that theme’s foreground/background.

The launcher/header use the actual game badge. The symbolic icon remains selected
angular-profile **A**. Licensed fonts are bundled locally.
See the [appearance receipt](verification/omarchy-appearance-2026-09-14.md).

## Public information

`GET /api/companion/v1/status` is the versioned companion feed. It reads a bounded,
paginated directory of public rooms. Active GameRooms publish authoritative
summaries; opening the panel does not fan out to or start sleeping games. Private
fixtures are excluded from the public feed.

Summaries include population, assignment progress, public holder/result information
and observation/expiry times. They exclude positions, private rooms, reconnect
credentials and unrevealed upcoming zones. Legacy `/status` remains available for
old companions and title world preparation; it describes only the canonical room.

The panel shows a compact header, the current mode and objective, and a default
full roster of up to ten public-report names with small muted bot or human tags
beside the name, objective totals and K/D. Long names wrap. Play/Return sits
below that roster.
The panel does not show a Quiet/Live badge, invite/Join, record or capture
controls, or redundant public/playtest/alerts copy. Settings exposes the gathering toggle and At least stepper. It does not expose
cooldown, quiet hours, assignment alerts, workspace, fullscreen or
refresh controls. Automatic refresh defaults continue behind the scenes. Room
lines report rat counts without a `/16` label.

The panel prioritizes deliveries for Paper Chase, personal zone points for
Jurisdiction, qualifying case kills for Excessive Force, and the actual countdown
and holder for Closing Time. Combat statistics remain secondary. Occupied rooms
normally fill to eight total rats, with a 10-rat maximum. Tyler confirmed the
canonical city stays alive: `public-live-v2` keeps eight named bots with
zero humans. Overflow rooms still sleep. Production Worker
`0965112e-c50d-4075-86f7-decd93738f19` now publishes that city. Directory GET
does not wake a GameRoom. This document does not claim the installed native
panel was verified after deploy. See [server operations](server-operations.md)
and the [canonical-city receipt](verification/canonical-city-2026-09-14.md).

## Launch

Return focuses a recognized game window without reloading it. Play launches when
none exists. The panel no longer offers a separate Join control. Existing
invitation URLs still use the canonical site with a validated public-room
preference; all joins still use normal admission and capacity checks. Full or
expired preferences fall back with clear feedback. After successful entry the
page consumes its invitation parameter so a same-tab reload can use its private
resume credential normally.

The desktop launcher uses a durable helper and icon outside the plugin directory.
It survives plugin removal. Installation or repair backs up the previous launcher
and support files. Workspace and fullscreen remain CLI helper preferences only;
the panel no longer exposes those choices and does not migrate existing desktop
settings. The shortcut control can enable or remove Super+Shift+R, or another
edited chord, after an explicit click. The companion leaves global DND, lock
policy and the accepted game mix alone.

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
game. Install or repair the desktop launcher with the existing CLI helper, not
the panel. Launcher rollback is separate from plugin rollback and uses
`omarchy/plugin/scripts/rollback-webapp.sh`.

Published-plugin install and update remain:

```sh
omarchy plugin add https://github.com/MayberryDT/rat-detective-omarchy.git --enable
omarchy plugin update co.animasai.rat-detective
```

Those commands install the published **v1.2.0** tag, not this local
mini-scoreboard modification.

## Background alerts and CLI helpers

Notifications start disabled and keep the existing master preference. One
notice fires when a fresh public room reaches the configured human count
(default 2, range 1–10). Enabling the switch or changing the threshold
while that lobby already qualifies can notify then; startup with the
switch on can notify once. The same room is not re-alerted on later polls,
round changes, roster churn, refresh or brief network gaps. The room rearms
only after a fresh count below the current threshold. Assignment notices are gone.
Cooldown and quiet-hour leftovers do not affect this alert. A stored
`alertHumanThreshold` is the user’s current choice and is clamped to 1–10.
Focused play, system DND, lock, fixtures and stale or unavailable
reports still suppress delivery. Failed sends use 3 total attempts; a failed
delivery does not permanently swallow the notice.

Opening the panel refreshes immediately and coalesces extra open requests while
one report is in flight. Defaults remain 2 seconds open and 30 seconds closed.
Recording and capture helpers remain on the existing CLI, not the menu.
Opening the panel does not enable alerts or change global DND.

## Checks

```sh
npx vitest run test/worker/companionStatus.test.ts test/worker/companionRoute.test.ts test/worker/companionLifecycle.test.ts
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

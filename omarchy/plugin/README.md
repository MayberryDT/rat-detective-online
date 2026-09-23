# Rat Detective Dispatch

A desktop companion for [Rat Detective](https://ratdetective.online/), the browser
shooter about rats, paperwork and ricocheting cheese. The game runs in your browser;
the companion shows a compact public scoreboard.

Version **1.3.1** keeps the compact live-scoreboard panel and adds opt-in
automatic highlights: a compact Clips entry, explicit setup, and a separate
library window for playback, trim, favorites and exports. Capture stays off
until enabled and is bounded to the recognized Rat Detective app window.

![Dispatch desk showing a static Paper Chase fixture](preview.png)

*Rat Detective appearance, static fixture on Omarchy 4.0.3; no gameplay is running in this preview. Omarchy appearance is the default.*

## What it does

- Follows your Omarchy theme by default, with an optional Rat Detective noir appearance.
  The selected angular-profile icon A and bundled fonts are unchanged.
- Shows a compact header plus the current Dispatch Assignment and objective.
- Lists up to ten names from the current public report with a small muted bot or
  human tag beside the name, objective totals and K/D. Long names wrap. Unknown
  legacy rows stay unlabeled.
- Displays paperwork deliveries, zone points, qualifying case kills or the Closing
  Time clock. Combat totals stay secondary. Room lines report rat counts without a
  leftover `/16` capacity label.
- Returns to an existing game window or launches the game (Play/Return).
- Offers Settings for Omarchy or Rat Detective appearance, one switch to notify
  when people are playing, an At least people stepper (1–10, default 2), an
  editable Super+Shift+R shortcut, and Automatic highlights with setup. Invite,
  Join, Omarchy fullscreen recording, cooldown, quiet hours, workspace,
  fullscreen and refresh controls stay off the panel. The Highlights library is
  a separate window.

The tested release target is x86_64 Omarchy 4.0.3 with Hyprland 0.56 and Qt
6.11.2. Python 3, curl and Omarchy's supported web-app browser are required;
clipboard actions use `wl-copy`. Automatic highlights additionally use GPU
Screen Recorder (`gpu-screen-recorder` and `gsr-cli`), FFmpeg/FFprobe and
PipeWire/PulseAudio command-line tools (`pw-dump` and `pactl`). Missing
capabilities produce a visible error without changing the game. Brave app-window
identity, focus, fullscreen and audible automatic capture were verified on the
tested target. Other browsers and CPU architectures are not claimed by this
release.

## Automatic highlights

Automatic highlights is off by default. When enabled, the bundled browser
connector reports eligible game events to a same-user native host. The helper
keeps a 45-second replay buffer in memory and writes only selected clips; it does
not make a continuous session recording on disk or capture the microphone.

Clips, the SQLite catalog and helper state stay in the user's XDG directories.
Videos default to `~/Videos/Rat Detective/Highlights/`, with a 5 GiB library
budget. Favorites and clips used by a reel are protected from automatic pruning;
deleted clips remain recoverable for seven days. Disabling or removing the
plugin stops its owned automatic capture after the bounded companion lease and
does not delete the library.

## Install and update

Install the published plugin repository:

```sh
omarchy plugin add https://github.com/MayberryDT/rat-detective-omarchy.git --enable
```

That command installs the current **1.3.1** release. Existing installations can
use the update command below; saved appearance, alert and highlight settings are
kept.

Enabling the plugin alone does not install or launch the game. Install or repair
the desktop launcher, browser connector and native host with the bundled helper:

```sh
~/.config/omarchy/plugins/co.animasai.rat-detective/scripts/install-webapp.sh
```

The launcher is then available from Super+Space. The installer writes only
user-owned XDG locations, backs up a replaced launcher/helper and does not start
the game or enable capture.

```sh
omarchy plugin update co.animasai.rat-detective
```

If the current shell keeps an older QML component after an update, use the
supported `omarchy restart shell` command. This refreshes the desktop shell.

Source development stays in the game's `omarchy/plugin/` directory. Published
releases are reproducible exports; `release.json` records hashes of packaged files.
The game repository's `scripts/omarchy-release.mjs` also supports staged local
installation and rollback for development or migration from a manual folder copy.

## Appearance

Open **Settings** on the panel and choose **Omarchy** or **Rat Detective**.
Omarchy is the default, including existing installations. It follows your live
popup colors and shell font. Rat Detective uses midnight purple, lavender and
brass, with the game’s Bangers display lettering and Outfit body text. Both modes
share the same layout; the bar and outside popup frame retain your native theme.
The same Settings disclosure also has the gathering notification and shortcut.
The theme choice saves on this widget and applies immediately without changing your
global theme or restarting the game or service.

The badge comes from the game. The symbolic rat-head icon is the selected angular
profile A, implemented as a clean, theme-tinted SVG. It uses the host bar icon
canvas and thickness, stacks its count on vertical bars, and rasterizes at the
current display scale. The widget supports stock and custom Omarchy 4 bars that
implement the standard bar-widget API. Stock Omarchy and the custom bar were
checked in all four positions; layout tests cover 16–64px thickness and 1×–3×
scales. This QML plugin does not target legacy Waybar. Fonts are bundled locally under the SIL Open Font License; see
[asset credits](assets/README.md). No fonts are downloaded at runtime.

## Live stats

Opening the panel requests a city report immediately and coalesces extra open
refreshes while one is already in flight. Defaults remain 2 seconds open and
30 seconds closed.

The public companion feed lists public rooms only. Private playtest fixtures are
excluded. Reading the directory does not start gameplay, reserve slots or wake
a GameRoom. The canonical `public-live-v2` city remains active with its current
six-to-nine-bot round roster when no humans are present; humans join on top until
the ten-rat cap. Overflow rooms still sleep. The native panel and exact 1.3.1
package were verified against the live service before release.

The gathering notification remains off until enabled and keeps the existing
master preference. It fires once when a fresh public room reaches the
configured human count (default 2, range 1–10), including when you enable it
or change the threshold against a lobby that already qualifies. The same room
is not re-alerted on later polls, round changes or brief reconnects; it rearms
only after a fresh count below the current threshold. A stored
`alertHumanThreshold` is clamped to 1–10. Cooldown, quiet-hour and
assignment-alert leftovers are ignored. Opening the panel does not enable
alerts or rewrite DND.

## Desktop CLI helpers

The same adapter remains available for scripts. These are CLI helpers, not
panel menu items:

```sh
python3 scripts/rat-detective-desktop.py status
python3 scripts/rat-detective-desktop.py return
python3 scripts/rat-detective-desktop.py copy-link
python3 scripts/rat-detective-desktop.py preferences --workspace=current --fullscreen=false
```

`return` focuses an identified game window without reloading it. A new window does
not inherit another tab's reconnect credential. `join ROOM` opens an explicit room
invitation; if the room fills or expires, the game explains its matchmaking fallback.

Workspace, fullscreen and desktop-recording audio remain optional CLI
preferences. The panel no longer exposes workspace, fullscreen or refresh
controls and does not migrate those saved desktop preferences. Notification
settings start disabled. The one gathering notice stays quiet when the game
is focused, during DND, lock, fixtures or stale reports. Failed sends use 3
total attempts and keep their receipts. The companion does not alter global
DND, lock settings or the game's audio mix. Recording starts only from an
explicit CLI control; microphone capture is not enabled. Files stay local.

The panel shortcut prefills Super+Shift+R. Enable or Remove only run after
you click; existing bindings and conflict checks stay. A shortcut can also
be installed with `shortcut-install 'SUPER + SHIFT + R'` and removed with
`shortcut-remove`. Installation rejects conflicts, backs up the affected
configuration and validates Hyprland.

## Remove

```sh
omarchy plugin disable co.animasai.rat-detective
omarchy plugin remove co.animasai.rat-detective
```

The separately installed game launcher remains usable after plugin removal. To
stop the highlights helper and remove the launcher plus native-host registration,
run the bundled uninstaller before removing the plugin directory:

```sh
~/.config/omarchy/plugins/co.animasai.rat-detective/scripts/uninstall-webapp.sh
```

Remove an installed shortcut with `shortcut-remove` before removing the launcher.
Disabling the plugin stops its polling, alerts and owned automatic capture after
the bounded companion lease. Neither command deletes clips, settings or the
remaining support files under the user's XDG data/state directories. Separate
recordings started outside Rat Detective stay under the user's control.

## Development and compatibility

Validate a source or exported package using `omarchy plugin validate PATH`.
The versioned companion HTTP API is independent of the gameplay WebSocket protocol.
Older servers retain a limited legacy panel; assignment features require the new
companion endpoint. Public summaries contain no positions or reconnect credentials.
Polling the city directory does not start gameplay, reserve slots, create bots
or wake a GameRoom. `GET /status` is the one-time canonical-city activation.
Release 1.3.0 was checked as an exact export on Omarchy 4.0.3: 24 portable
checks, 37 hosted QML checks, 11 focused lifecycle checks, real-shell
enable/disable/removal, and a human gameplay session covering automatic clips,
playback and export. These checks are release evidence, not a security audit.

[Game source and implementation evidence](https://github.com/MayberryDT/rat-detective-online)

## Tests, previews and support

Run `tests/run` from a fresh checkout (Node.js 22+, Python 3 and Bash). These
portable checks cover normalized room data, clocks, freshness and alert policy;
they never launch a browser or record the desktop. Live QML checks require the
installed Omarchy imports and are documented in the release notes.
Run `tests/run-qml` with Qt 6 QtQuick/QtTest installed to check the actual
appearance component against narrow, mutable native-role stubs.

For a deterministic visual inspection, use `omarchy-shell
co.animasai.rat-detective fixture paper` and then `open` on the same target.
Fixtures include `paper`, `jurisdiction`, `excessive`, `closing`, `empty`, `stale`,
`unavailable` and `loading`. They are labeled STATIC PREVIEW and suppress desktop
actions and alerts. Always clear the fixture with `fixture ""` and close the panel
afterward. Capture only the panel on an empty workspace.

[Report an issue](https://github.com/MayberryDT/rat-detective-omarchy/issues).
For sensitive security reports, use the repository's private vulnerability
reporting channel when available; do not include credentials or private captures
in public issues. Static validation is not a security audit.

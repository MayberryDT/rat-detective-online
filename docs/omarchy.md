# Omarchy alert plugin

Rat Detective is a browser game at [ratdetective.online](https://ratdetective.online/).
The Omarchy plugin `co.animasai.rat-detective` does one thing: it tells Tyler when
people are playing. Source: [`omarchy/plugin/`](../omarchy/plugin/) (`manifest.json`,
`Service.qml`, `BarWidget.qml`, `ServiceBridge.js`, `assets/rat-detective-symbolic.svg`).

- The rat icon in the bar (right section, after the todo list) is dim with nobody playing and lights up in the bar's urgent colour with the number of people while anyone plays; clicking it opens or focuses the game. No panel. (Tyler, 2 October: "I need to see the plugin in the [bar] and I need it to light up when there's somebody playing.")
- One service (`Service.qml`, published to the widget through `ServiceBridge.js`) does the polling.
- Every 30 s: `curl -sf --max-time 10 --max-filesize 262144` of
  `https://ratdetective.online/api/companion/v1/status?limit=16`. People are the
  `humans` of rooms whose `expiresAt` is after the report's `observedAt`; bots never count.
- From no people to some: one `omarchy notification send` ("Someone is playing." /
  "N people are playing."), clicking runs `omarchy-launch-or-focus-webapp ratdetective.online …`.
  It re-arms only when every public room has no people. Skipped (and disarmed) while
  the focused window is the game, so your own play doesn't alert you.
- `omarchy-shell co.animasai.rat-detective status` returns `{"humans":N,"armed":bool}`.

## Install on Veelox

The plugin folder is a plain copy (not git-managed):

```sh
rm -rf ~/.config/omarchy/plugins/co.animasai.rat-detective
mkdir ~/.config/omarchy/plugins/co.animasai.rat-detective
cp -r omarchy/plugin/{manifest.json,Service.qml,BarWidget.qml,ServiceBridge.js,assets,README.md,LICENSE} ~/.config/omarchy/plugins/co.animasai.rat-detective/
omarchy restart shell   # a running service instance survives a plugin rescan
```

The Super+Space launcher (`~/.local/share/applications/Rat Detective.desktop`) runs
`omarchy-launch-or-focus-webapp ratdetective.online https://ratdetective.online/`
in Brave's default profile (where the admin key is saved).

## History

Plugin 1.x was the "Dispatch desk": a live scoreboard panel, launcher/focus helper,
Hyprland shortcut installer and opt-in automatic highlight recording through a
browser connector, native host and `gpu-screen-recorder`. 2.0.0 (2 October) removed
all of it; 2.1.0 the same day brought back only the bar rat. Dated receipts under [verification](verification/) keep that history; the
1.3.1 install is backed up in `~/.local/state/rat-detective/plugin-backups/installed-1.3.1-20261002`.
GitHub `MayberryDT/rat-detective-omarchy` stays at 1.3.2; Tyler doesn't care about it (2 October).

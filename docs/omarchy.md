# Omarchy launcher (alongside the web app)

Rat Detective stays a browser game on Cloudflare. The public URL remains
`https://rat-detective.animasai.co`. Omarchy users also get a shell plugin that
discovers the game in the plugin marketplace and, on first use, installs the
same title as an Omarchy web app so it launches from Super+Space.

The bar chip shows how many rats are in the public city (`GET /status`).
Click opens a live room panel (names, scoreboard, round clock). Play is a
button in that panel. First use can still add the game to the Super+Space menu.

## Surfaces

| Surface | Role | Permanent? |
|---|---|---|
| Web app at `rat-detective.animasai.co` | The game. Anyone with a browser can play. | Yes |
| Omarchy web-app launcher (`.desktop`) | Super+Space → Rat Detective, chrome-less Chromium window | Yes, once a user installs it |
| Omarchy shell plugin | Live public-room board + Add to menu / Play | Yes as a companion, not as the game runtime |

`omarchy plugin add` never runs plugin code. The `.desktop` file is created only
after an explicit Add to menu click in the plugin panel.

## Player flow

1. Find the plugin (marketplace or `omarchy plugin add`).
2. Enable it. A rat chip appears on the bar.
3. Click the chip. The panel shows the public room, who’s in it, scores, and
   the current round clock.
4. If the Super+Space entry is missing, **Add to menu** writes the Omarchy
   web-app launcher with `omarchy-webapp-install`, then launches the game.
5. **Play** in the panel launches the game. Super+Space also has Rat Detective
   once it is on the menu. Removing the plugin does not delete that launcher.

## What the plugin must not do

- Render the city, physics, or pointer-lock session inside `omarchy-shell`.
- Auto-write the `.desktop` file when the plugin is enabled.
- Ask for sudo, pacman, or a second Quickshell process.
- Describe itself as a 3D game that runs in the shell. Marketplace copy is
  “bar launcher that installs the Rat Detective web app.”

## Layout in this repo

```
omarchy/plugin/     companion plugin (manifest + QML + install scripts)
docs/omarchy.md     this plan
```

Marketplace listing later needs a public git repo with `manifest.json` at the
root. This game repo keeps the plugin in `omarchy/plugin/` until that split.
Until then, copy the folder into `~/.config/omarchy/plugins/co.animasai.rat-detective/`.

## Local test

```bash
rsync -a --delete omarchy/plugin/ ~/.config/omarchy/plugins/co.animasai.rat-detective/
omarchy plugin validate ~/.config/omarchy/plugins/co.animasai.rat-detective
omarchy-shell shell rescanPlugins
omarchy plugin enable co.animasai.rat-detective --section right
```

Click the bar chip. The panel is the menu. Add to menu on first use, then Play.

Rollback:

```bash
omarchy plugin disable co.animasai.rat-detective
omarchy plugin remove co.animasai.rat-detective --yes   # only if it is a git checkout
# or: rm -rf ~/.config/omarchy/plugins/co.animasai.rat-detective
omarchy-webapp-remove "Rat Detective"                   # optional; leaves the plugin
```

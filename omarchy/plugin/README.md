# Rat Detective (Omarchy launcher)

Reviewed 2026-09-08 against the companion source. Public counts include 8–11 AI rats per round plus humans. The plugin does not host bots or keep the game alive. See [live service](../../docs/live-service.md) for the current game deployment. Desktop installation commands below are optional user actions, not part of a game deployment.

Bar companion for [Rat Detective](https://ratdetective.online). The chip
shows how many rats are in the city. Click opens the room panel. First use can
add the game to the Super+Space menu.

## Install

Until this lives in its own git repo (required for `omarchy plugin add` and
the marketplace), copy it into the user plugin directory:

```bash
rsync -a --delete ./ ~/.config/omarchy/plugins/co.animasai.rat-detective/
omarchy plugin validate ~/.config/omarchy/plugins/co.animasai.rat-detective
omarchy-shell shell rescanPlugins
omarchy plugin enable co.animasai.rat-detective --section right
```

## Usage

- The chip shows how many rats (humans and AI) are in the city.
- Click opens the room panel (names, scores, round clock).
- Missing Super+Space entry: **Add to menu**, then the game opens.
- **Play** in the panel launches the game.

## Remove

```bash
omarchy plugin disable co.animasai.rat-detective
rm -rf ~/.config/omarchy/plugins/co.animasai.rat-detective
omarchy-shell shell rescanPlugins
# optional:
omarchy-webapp-remove "Rat Detective"
```

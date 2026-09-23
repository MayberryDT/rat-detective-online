#!/usr/bin/env bash
# Install or repair the durable Rat Detective launcher. Does not start the game.
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ICON="$PLUGIN_DIR/icon.png"
SOURCE_HELPER="$PLUGIN_DIR/scripts/rat-detective-desktop.py"
HIGHLIGHTS_HELPER="$PLUGIN_DIR/scripts/rat-detective-highlights.py"
NATIVE_HOST="$PLUGIN_DIR/scripts/rat-detective-native-host.py"
HIGHLIGHTS_PKG="$PLUGIN_DIR/scripts/highlights"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
SUPPORT_DIR="$DATA_HOME/rat-detective"
DURABLE_HELPER="$SUPPORT_DIR/rat-detective-desktop.py"

if [[ ! -f $ICON || ! -f $SOURCE_HELPER ]]; then
  echo "Missing Rat Detective launcher asset." >&2
  exit 1
fi

mkdir -p "$SUPPORT_DIR/highlights"
if [[ -f $DURABLE_HELPER ]] && ! cmp -s "$SOURCE_HELPER" "$DURABLE_HELPER"; then
  cp -p "$DURABLE_HELPER" "$DURABLE_HELPER.previous"
fi
install -m 0755 "$SOURCE_HELPER" "$DURABLE_HELPER"
install -m 0755 "$HIGHLIGHTS_HELPER" "$SUPPORT_DIR/rat-detective-highlights.py"
install -m 0755 "$NATIVE_HOST" "$SUPPORT_DIR/rat-detective-native-host.py"
cp -a "$HIGHLIGHTS_PKG/." "$SUPPORT_DIR/highlights/"
python3 - "$SUPPORT_DIR/rat-detective-native-host.py" "$CONFIG_HOME" "$SUPPORT_DIR" <<'PY'
import json, sys
from pathlib import Path
host = Path(sys.argv[1]).resolve()
config = Path(sys.argv[2])
support = Path(sys.argv[3])
payload = json.dumps({
    "name": "co.animasai.rat_detective_highlights",
    "description": "Rat Detective highlights native host",
    "path": str(host),
    "type": "stdio",
    "allowed_origins": ["chrome-extension://lbhddkbbmnofokcjnlpfhffcplijjpnh/"],
}, indent=2) + "\n"
dests = [
    config / "chromium/NativeMessagingHosts",
    config / "BraveSoftware/Brave-Browser/NativeMessagingHosts",
    config / "BraveSoftware/Brave-Origin/NativeMessagingHosts",
    config / "google-chrome/NativeMessagingHosts",
    support / "webapp-profile" / "NativeMessagingHosts",
]
for folder in dests:
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "co.animasai.rat_detective_highlights.json").write_text(payload)
PY
CONNECTOR_SRC=""
if [[ -d $PLUGIN_DIR/connector/extension ]]; then
  CONNECTOR_SRC="$PLUGIN_DIR/connector/extension"
elif [[ -d $PLUGIN_DIR/connector ]]; then
  CONNECTOR_SRC="$PLUGIN_DIR/connector"
elif [[ -d $PLUGIN_DIR/../extension ]]; then
  CONNECTOR_SRC="$PLUGIN_DIR/../extension"
fi
if [[ -n $CONNECTOR_SRC ]]; then
  mkdir -p "$SUPPORT_DIR/highlights-connector"
  cp -a "$CONNECTOR_SRC/." "$SUPPORT_DIR/highlights-connector/"
  if [[ -f $SUPPORT_DIR/highlights-connector/manifest.dev.json ]]; then
    cp "$SUPPORT_DIR/highlights-connector/manifest.dev.json" "$SUPPORT_DIR/highlights-connector/manifest.json"
  fi
fi
if ! "$DURABLE_HELPER" install-launcher --icon "$ICON"; then
  if [[ -f $DURABLE_HELPER.previous ]]; then
    cp -p "$DURABLE_HELPER.previous" "$DURABLE_HELPER"
  fi
  exit 1
fi

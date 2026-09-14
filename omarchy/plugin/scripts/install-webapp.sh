#!/usr/bin/env bash
# Install or repair the durable Rat Detective launcher. Does not start the game.
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ICON="$PLUGIN_DIR/icon.png"
SOURCE_HELPER="$PLUGIN_DIR/scripts/rat-detective-desktop.py"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
SUPPORT_DIR="$DATA_HOME/rat-detective"
DURABLE_HELPER="$SUPPORT_DIR/rat-detective-desktop.py"

if [[ ! -f $ICON || ! -f $SOURCE_HELPER ]]; then
  echo "Missing Rat Detective launcher asset." >&2
  exit 1
fi

mkdir -p "$SUPPORT_DIR"
if [[ -f $DURABLE_HELPER ]] && ! cmp -s "$SOURCE_HELPER" "$DURABLE_HELPER"; then
  cp -p "$DURABLE_HELPER" "$DURABLE_HELPER.previous"
fi
install -m 0755 "$SOURCE_HELPER" "$DURABLE_HELPER"
if ! "$DURABLE_HELPER" install-launcher --icon "$ICON"; then
  if [[ -f $DURABLE_HELPER.previous ]]; then
    cp -p "$DURABLE_HELPER.previous" "$DURABLE_HELPER"
  fi
  exit 1
fi

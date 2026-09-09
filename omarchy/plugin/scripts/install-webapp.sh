#!/usr/bin/env bash
# Install the Rat Detective Omarchy web-app launcher. Does not start the game.
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="Rat Detective"
APP_URL="${RAT_DETECTIVE_URL:-https://ratdetective.online}"
ICON="$PLUGIN_DIR/icon.png"

if ! command -v omarchy-webapp-install >/dev/null 2>&1; then
  echo "omarchy-webapp-install is not on PATH." >&2
  exit 1
fi

if [[ ! -f $ICON ]]; then
  echo "Missing plugin icon: $ICON" >&2
  exit 1
fi

exec omarchy-webapp-install "$APP_NAME" "$APP_URL" "$ICON"

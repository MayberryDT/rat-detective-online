#!/usr/bin/env bash
# Remove the Rat Detective Omarchy web-app launcher. Leaves the plugin in place.
set -euo pipefail

APP_NAME="Rat Detective"

if ! command -v omarchy-webapp-remove >/dev/null 2>&1; then
  echo "omarchy-webapp-remove is not on PATH." >&2
  exit 1
fi

export OMARCHY_REMOVE_NOTIFY="${OMARCHY_REMOVE_NOTIFY:-false}"
exec omarchy-webapp-remove "$APP_NAME"

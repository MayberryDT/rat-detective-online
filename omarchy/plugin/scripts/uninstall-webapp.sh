#!/usr/bin/env bash
# Remove the Rat Detective Omarchy web-app launcher. Leaves the plugin in place.
set -euo pipefail

DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
HELPER="$DATA_HOME/rat-detective/rat-detective-desktop.py"

if [[ ! -x $HELPER ]]; then
  echo "Rat Detective launcher helper is not installed." >&2
  exit 1
fi

# A launcher shortcut must never be left pointing at the helper removed below.
"$HELPER" shortcut-remove >/dev/null
exec "$HELPER" uninstall-launcher

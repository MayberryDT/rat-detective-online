#!/usr/bin/env bash
# Restore the most recent Rat Detective launcher/helper backup.
set -euo pipefail

DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
HELPER="$DATA_HOME/rat-detective/rat-detective-desktop.py"
PREVIOUS_HELPER="$HELPER.previous"

if [[ ! -x $HELPER ]]; then
  if [[ -f $PREVIOUS_HELPER ]]; then
    cp -p "$PREVIOUS_HELPER" "$HELPER"
    chmod 0755 "$HELPER"
  else
    echo "No previous Rat Detective launcher helper is available." >&2
    exit 1
  fi
fi

exec "$HELPER" rollback-launcher

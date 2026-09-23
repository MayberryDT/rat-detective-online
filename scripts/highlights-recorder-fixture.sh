#!/usr/bin/env bash
# Real GPU Screen Recorder fixture. Not part of the unattended unit suite.
# Requires a live Wayland session, portal picker, and human confirmation.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/rat-detective-highlights"
STAGING="${XDG_STATE_HOME:-$HOME/.local/state}/rat-detective/highlights/staging"
mkdir -p "$RUNTIME" "$STAGING"
SOCK="$RUNTIME/gsr-fixture.sock"
echo "Starting a 8s portal replay buffer as rat-detective-gsr. Choose the Rat Detective window."
gpu-screen-recorder -w portal -c mp4 -r 8 -replay-storage ram -encoder gpu \
  -fallback-cpu-encoding no -restore-portal-session no -k h264 -ac aac \
  -ipc "$SOCK" -ro "$STAGING" >/tmp/rat-gsr-fixture.log 2>&1 &
GSR_PID=$!
cleanup() { kill -INT "$GSR_PID" 2>/dev/null || true; }
trap cleanup EXIT
for _ in $(seq 1 40); do
  if gsr-cli -ipc "$SOCK" status >/dev/null 2>&1; then break; fi
  sleep 0.2
done
gsr-cli -ipc "$SOCK" status
echo "Wait 3 seconds, then save 2 seconds of replay."
sleep 3
gsr-cli -ipc "$SOCK" save-replay 2
echo "Inspect $STAGING and /tmp/rat-gsr-fixture.log (tokens redacted by the helper in normal use)."

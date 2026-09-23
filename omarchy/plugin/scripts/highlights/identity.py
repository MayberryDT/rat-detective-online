"""Recognize the Omarchy Rat Detective app window."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from typing import Any

APP_ID = "co.animasai.rat-detective"
PREVIEW_CLASS_MARKERS = (
    "127.0.0.1__",
    "localhost__5174",
    "localhost__5175",
    "localhost__5193",
)
LEGACY_CLASSES = {
    "brave-ratdetective.online__-Default",
    "chromium-ratdetective.online__-Default",
    "google-chrome-ratdetective.online__-Default",
    "microsoft-edge-ratdetective.online__-Default",
    "opera-ratdetective.online__-Default",
    "vivaldi-ratdetective.online__-Default",
    "helium-ratdetective.online__-Default",
    "brave-rat-detective.animasai.co__-Default",
    "chromium-rat-detective.animasai.co__-Default",
    "google-chrome-rat-detective.animasai.co__-Default",
    "microsoft-edge-rat-detective.animasai.co__-Default",
    "opera-rat-detective.animasai.co__-Default",
    "vivaldi-rat-detective.animasai.co__-Default",
    "helium-rat-detective.animasai.co__-Default",
}


def _run(argv: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(argv, text=True, capture_output=True, timeout=3)


def hypr_clients() -> list[dict[str, Any]]:
    hypr = shutil.which("hyprctl") or "hyprctl"
    try:
        result = _run([hypr, "clients", "-j"])
        parsed = json.loads(result.stdout) if result.returncode == 0 else []
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return []
    return parsed if isinstance(parsed, list) else []


def is_preview_class(value: str) -> bool:
    return any(marker in value for marker in PREVIEW_CLASS_MARKERS)


def is_game_window(client: dict[str, Any]) -> bool:
    classes = {str(client.get("class", "")), str(client.get("initialClass", ""))}
    return (
        APP_ID in classes
        or any(value.startswith(APP_ID + ".join-") for value in classes)
        or bool(classes & LEGACY_CLASSES)
        or any(is_preview_class(value) for value in classes)
    )


def game_windows() -> list[dict[str, Any]]:
    windows = []
    for client in hypr_clients():
        if not isinstance(client, dict) or not is_game_window(client):
            continue
        workspace = client.get("workspace") if isinstance(client.get("workspace"), dict) else {}
        try:
            focus_history = int(client.get("focusHistoryID", -1))
        except (TypeError, ValueError):
            focus_history = -1
        size = client.get("size") if isinstance(client.get("size"), list) else [0, 0]
        at = client.get("at") if isinstance(client.get("at"), list) else [0, 0]
        windows.append({
            "address": str(client.get("address", "")),
            "class": str(client.get("class", "")),
            "title": str(client.get("title", "")),
            "pid": int(client.get("pid") or 0),
            "workspace": str(workspace.get("name", "")),
            "focused": focus_history == 0,
            "x": int(at[0] if len(at) > 0 else 0),
            "y": int(at[1] if len(at) > 1 else 0),
            "width": int(size[0] if len(size) > 0 else 0),
            "height": int(size[1] if len(size) > 1 else 0),
            "fullscreen": int(client.get("fullscreen", 0) or 0) in (2, 3),
        })
    return windows


def lock_state() -> str:
    explicit = os.environ.get("RAT_DETECTIVE_LOCK_STATE")
    if explicit in {"locked", "unlocked", "unknown"}:
        return explicit
    hypr = shutil.which("omarchy-shell")
    if hypr:
        try:
            result = _run([hypr, "lock", "isLocked"])
            answer = result.stdout.strip().lower()
            if result.returncode == 0 and answer in {"true", "false"}:
                return "locked" if answer == "true" else "unlocked"
        except (OSError, subprocess.TimeoutExpired):
            pass
    locked = shutil.which("omarchy-hyprland-session-locked")
    if locked:
        try:
            result = _run([locked])
            if result.returncode == 0:
                return "locked"
            if result.returncode == 1:
                return "unlocked"
        except (OSError, subprocess.TimeoutExpired):
            pass
    return "unknown"


def recorder_conflict() -> bool:
    """True when an unmanaged gpu-screen-recorder is already running."""
    proc = PathProc()
    return "gpu-screen-recorder" in proc.names()


class PathProc:
    def names(self) -> set[str]:
        names: set[str] = set()
        try:
            entries = os.listdir("/proc")
        except OSError:
            return names
        for entry in entries:
            if not entry.isdigit():
                continue
            try:
                with open(f"/proc/{entry}/comm", encoding="utf-8") as handle:
                    names.add(handle.read().strip())
                with open(f"/proc/{entry}/cmdline", "rb") as handle:
                    argv0 = handle.read().split(b"\0", 1)[0]
                    if argv0:
                        names.add(os.path.basename(os.fsdecode(argv0)))
            except OSError:
                continue
        return names

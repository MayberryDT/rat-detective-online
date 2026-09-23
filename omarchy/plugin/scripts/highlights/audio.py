"""Game-only PipeWire routing for highlight capture."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

SINK_NAME = "rat-detective-highlights"
LOOPBACK_NAME = "rat-detective-highlights-monitor"


class AudioError(RuntimeError):
    pass


class AudioRouter:
    def __init__(self) -> None:
        self.module_ids: list[str] = []
        self.original_sinks: dict[int, str] = {}

    def reset(self) -> None:
        self.module_ids = []
        self.original_sinks = {}


def _run(argv: list[str], timeout: float = 5) -> subprocess.CompletedProcess[str]:
    return subprocess.run(argv, text=True, capture_output=True, timeout=timeout)


def which(name: str) -> str | None:
    override = os.environ.get("RAT_DETECTIVE_" + name.upper().replace("-", "_") + "_COMMAND")
    return override or shutil.which(name)


def list_application_nodes() -> list[dict[str, Any]]:
    binary = which("gpu-screen-recorder")
    if not binary:
        return []
    try:
        result = _run([binary, "--list-application-audio"])
    except (OSError, subprocess.TimeoutExpired):
        return []
    names = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    return [{"name": name} for name in names]


def pactl_sink_inputs() -> list[dict[str, Any]]:
    binary = which("pactl")
    if not binary:
        return []
    try:
        result = _run([binary, "-f", "json", "list", "sink-inputs"])
        if result.returncode != 0:
            raise AudioError("Could not inspect game audio streams. Retrying automatically.")
        parsed = json.loads(result.stdout or "[]")
        return parsed if isinstance(parsed, list) else []
    except (OSError, subprocess.TimeoutExpired, ValueError) as error:
        raise AudioError("Could not inspect game audio streams. Retrying automatically.") from error


def descendant_pids(pid: int) -> set[int]:
    children: dict[int, list[int]] = {}
    try:
        for entry in os.listdir("/proc"):
            if not entry.isdigit():
                continue
            child = int(entry)
            children.setdefault(_ppid(child), []).append(child)
    except OSError:
        return {pid}
    found = {pid}
    stack = [pid]
    while stack:
        current = stack.pop()
        for child in children.get(current, []):
            if child not in found:
                found.add(child)
                stack.append(child)
    return found


def _ppid(pid: int) -> int:
    try:
        text = open(f"/proc/{pid}/status", encoding="utf-8").read()
    except OSError:
        return -1
    for line in text.splitlines():
        if line.startswith("PPid:"):
            return int(line.split()[1])
    return -1


def streams_for_pid(pid: int) -> list[dict[str, Any]]:
    # Only the launcher's dedicated profile is a safe browser-wide ownership
    # boundary. A title or generic Chromium stream name is not one.
    profile = Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local/share"))) / "rat-detective/webapp-profile"
    root = pid
    for _ in range(32):
        try:
            args = Path(f"/proc/{root}/cmdline").read_bytes().split(b"\0")
        except OSError:
            return []
        if os.fsencode(f"--user-data-dir={profile}") in args and not any(arg.startswith(b"--type=") for arg in args):
            break
        root = _ppid(root)
        if root <= 1:
            return []
    else:
        return []
    pids = {str(item) for item in descendant_pids(root)}
    return [item for item in pactl_sink_inputs()
            if str((item.get("properties") or {}).get("application.process.id") or "") in pids]


_router = AudioRouter()


def ensure_game_route(pid: int, router: AudioRouter | None = None) -> dict[str, Any]:
    """Attach a stable monitor before audio starts; reconcile late/replaced streams."""
    owner = router or _router
    pactl = which("pactl")
    if not pactl:
        raise AudioError("PipeWire/Pulse control is unavailable.")
    try:
        if not owner.module_ids:
            existing = _run([pactl, "list", "short", "sinks"])
            if existing.returncode:
                raise AudioError("Could not inspect the audio outputs.")
            if any(len(line.split()) > 1 and line.split()[1] == SINK_NAME for line in existing.stdout.splitlines()):
                raise AudioError("The highlight audio sink is already owned. Stop the other capture helper, then retry.")
            default = _run([pactl, "get-default-sink"])
            output = default.stdout.strip()
            if default.returncode or not output or output == SINK_NAME:
                raise AudioError("No playback output is available for game sound.")
            created = _run([pactl, "load-module", "module-null-sink", f"sink_name={SINK_NAME}",
                            "sink_properties=device.description=RatDetectiveHighlights"])
            if created.returncode or not created.stdout.strip().isdigit():
                raise AudioError("Could not create the highlight audio sink.")
            owner.module_ids.append(created.stdout.strip())
            loopback = _run([pactl, "load-module", "module-loopback", f"source={SINK_NAME}.monitor",
                             f"sink={output}", "latency_msec=20"])
            if loopback.returncode or not loopback.stdout.strip().isdigit():
                cleanup_owned_routes(owner)
                raise AudioError("Could not keep game audio audible while isolating capture.")
            owner.module_ids.append(loopback.stdout.strip())
        streams = streams_for_pid(pid)
        live_ids = {int(item["index"]) for item in streams if item.get("index") is not None}
        owner.original_sinks = {key: value for key, value in owner.original_sinks.items() if key in live_ids}
        for stream in streams:
            index = stream.get("index")
            if index is None:
                continue
            index = int(index)
            # Repeated routing must not replace the real output with our sink.
            if index not in owner.original_sinks:
                owner.original_sinks[index] = str(stream.get("sink", ""))
            moved = _run([pactl, "move-sink-input", str(index), SINK_NAME])
            if moved.returncode:
                raise AudioError("Could not isolate the game audio stream. Retrying automatically.")
        return {"sink": SINK_NAME, "source": capture_source(), "streams": len(streams), "modules": list(owner.module_ids)}
    except (OSError, subprocess.TimeoutExpired) as error:
        if len(owner.module_ids) == 1:
            cleanup_owned_routes(owner)
        raise AudioError("Audio routing is unavailable. Retrying automatically.") from error


def capture_source() -> str:
    return f"{SINK_NAME}.monitor"


def cleanup_owned_routes(router: AudioRouter | None = None) -> None:
    owner = router or _router
    pactl = which("pactl")
    if not pactl:
        owner.reset()
        return
    for index, sink in list(owner.original_sinks.items()):
        if sink and sink != SINK_NAME:
            try:
                _run([pactl, "move-sink-input", str(index), sink])
            except (OSError, subprocess.TimeoutExpired):
                pass
    for module_id in reversed(owner.module_ids):
        if module_id.isdigit():
            try:
                _run([pactl, "unload-module", module_id])
            except (OSError, subprocess.TimeoutExpired):
                pass
    owner.reset()

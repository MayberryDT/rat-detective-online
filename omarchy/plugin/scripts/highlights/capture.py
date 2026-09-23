"""GPU Screen Recorder adapter with owned IPC and process isolation."""

from __future__ import annotations

import json
import math
import os
import re
import shutil
import signal
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
import threading
from typing import Any, Protocol

_REGION_RE = re.compile(r"^\d+x\d+\+\d+\+\d+$")


def parse_first_frame_ts(text: str) -> tuple[int, int] | None:
    """Parse GSR replay sidecar values, skipping a documented header row."""
    for line in text.splitlines():
        parts = line.strip().split()
        if len(parts) < 2:
            continue
        try:
            return (int(parts[0]), int(parts[1]))
        except ValueError:
            continue
    return None


def window_region(window: dict[str, Any]) -> str:
    width = max(2, int(window.get("width") or 0))
    height = max(2, int(window.get("height") or 0))
    x = max(0, int(window.get("x") or 0))
    y = max(0, int(window.get("y") or 0))
    return f"{width}x{height}+{x}+{y}"

from . import paths
from .redact import classify_recorder_line, redact_recorder_text
from .tuning import BUFFER_SECONDS, LIGHT_BITRATE, LIGHT_FPS, LIGHT_HEIGHT, NORMAL_BITRATE, NORMAL_FPS, NORMAL_HEIGHT


def replay_save_seconds(seconds: float) -> int:
    """gsr-cli save-replay accepts an integer > 0, not a decimal."""
    return max(1, min(math.ceil(float(seconds)), BUFFER_SECONDS))


class CaptureError(RuntimeError):
    pass


class CaptureBackend(Protocol):
    def start(self, profile: str, audio_source: str | None, *, window: str = "region",
              region: str | None = None) -> dict[str, Any]: ...
    def status(self) -> dict[str, Any]: ...
    def save_replay(self, seconds: float, staging: Path) -> Path: ...
    def stop(self) -> None: ...
    def alive(self) -> bool: ...


@dataclass
class CaptureStatus:
    state: str
    source_type: str = "unknown"
    source_label: str = ""
    encoder: str = "gpu"
    profile: str = "normal"
    started_at_ms: float = 0
    frames: int = 0
    reason: str = ""
    ready: bool = False


def gsr_bin() -> str:
    return os.environ.get("RAT_DETECTIVE_GSR_COMMAND") or shutil.which("gpu-screen-recorder") or "gpu-screen-recorder"


def gsr_cli() -> str:
    return os.environ.get("RAT_DETECTIVE_GSR_CLI") or shutil.which("gsr-cli") or "gsr-cli"


def hardware_supported() -> tuple[bool, str]:
    try:
        result = subprocess.run([gsr_bin(), "--list-capture-options"], text=True, capture_output=True, timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        return False, "GPU Screen Recorder is not available."
    if result.returncode != 0:
        return False, redact_recorder_text(result.stderr or "recorder failed to list capture options")
    text = result.stdout
    names = {line.split("|", 1)[0].strip() for line in text.splitlines() if line.strip()}
    if "region" not in names and "region" not in text:
        return False, "This session does not expose region capture."
    return True, "region"


def profile_args(profile: str) -> list[str]:
    if profile == "light":
        return ["-k", "h264", "-ac", "aac", "-f", str(LIGHT_FPS), "-bm", "cbr",
                "-q", str(max(1, LIGHT_BITRATE // 1000)), "-s", f"1280x{LIGHT_HEIGHT}"]
    return ["-k", "h264", "-ac", "aac", "-f", str(NORMAL_FPS), "-bm", "cbr",
            "-q", str(max(1, NORMAL_BITRATE // 1000)), "-s", f"1920x{NORMAL_HEIGHT}"]


class GsrCapture:
    def __init__(self) -> None:
        self.process: subprocess.Popen[str] | None = None
        self.started_at = 0.0
        self.profile = "normal"
        self.source_type = "unknown"
        self.source_label = ""
        self.log_path = paths.state_dir() / "recorder.log"
        self.confirmed = False
        self.last_source: dict[str, Any] = {}
        self.first_frame_ts: tuple[int, int] | None = None
        self._owned_region = ""

    def start(self, profile: str, audio_source: str | None, *, window: str = "region",
              region: str | None = None) -> dict[str, Any]:
        if self.process and self.alive():
            raise CaptureError("capture is already running")
        if window == "portal":
            raise CaptureError("window picker is disabled")
        if window not in {"region"}:
            raise CaptureError("capture source must be the game window")
        if not region or not _REGION_RE.fullmatch(region):
            raise CaptureError("game window region is not ready")
        paths.prepare_runtime()
        paths.prepare_state()
        socket = paths.gsr_socket()
        if socket.exists() or socket.is_symlink():
            try:
                socket.unlink()
            except OSError as error:
                raise CaptureError(f"stale recorder socket: {error}") from error
        output = paths.staging_dir()
        output.mkdir(parents=True, exist_ok=True)
        argv = [
            "rat-detective-gsr",
            "-w", "region",
            "-region", region,
            "-c", "mp4",
            "-r", str(BUFFER_SECONDS),
            "-replay-storage", "ram",
            "-restart-replay-on-save", "no",
            "-encoder", "gpu",
            "-fallback-cpu-encoding", "no",
            "-write-first-frame-ts", "yes",
            "-cursor", "yes",
            "-ipc", str(socket),
            "-v", "no",
            "-o", str(output),
            *profile_args(profile),
        ]
        if audio_source:
            argv.extend(["-a", audio_source])
        log_pipe = subprocess.PIPE
        self.process = subprocess.Popen(
            argv,
            executable=gsr_bin(),
            stdin=subprocess.DEVNULL,
            stdout=log_pipe,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            text=True,
        )
        threading.Thread(target=self._drain_logs, daemon=True).start()
        self.started_at = time.monotonic()
        self.profile = profile
        self.source_type = "region"
        self.source_label = region
        self.confirmed = False
        self._owned_region = region
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            if not self.alive():
                raise CaptureError("recorder exited during start")
            if self._cli(["status"]).returncode == 0:
                return self.status()
            time.sleep(0.15)
        raise CaptureError("recorder did not accept IPC")

    def _drain_logs(self) -> None:
        if not self.process or not self.process.stdout:
            return
        try:
            with self.log_path.open("a", encoding="utf-8") as log:
                for line in self.process.stdout:
                    safe = classify_recorder_line(line)
                    if safe:
                        log.write(safe + "\n")
                        log.flush()
        except OSError:
            return

    def inspect_source(self, windows: list[dict[str, Any]]) -> dict[str, Any]:
        if self._owned_region:
            match = any(window_region(window) == self._owned_region for window in windows)
            self.last_source = {
                "sourceKind": "region",
                "matchesGameWindow": match,
                "label": self._owned_region,
                "captureMode": "region",
                "pixelIsolation": False,
            }
            return self.last_source
        monitors = set()
        try:
            listed = subprocess.run([gsr_bin(), "--list-capture-options"], text=True, capture_output=True, timeout=5)
            for line in listed.stdout.splitlines():
                name = line.split("|", 1)[0].strip()
                if name and name not in {"portal", "region"} and not name.startswith("/dev/"):
                    monitors.add(name)
        except (OSError, subprocess.TimeoutExpired):
            pass
        description = ""
        try:
            dump = subprocess.run(["pw-dump"], text=True, capture_output=True, timeout=5)
            payload = json.loads(dump.stdout) if dump.returncode == 0 else []
            pid = self.process.pid if self.process else None
            for node in payload if isinstance(payload, list) else []:
                info = node.get("info") or {}
                props = info.get("props") or {}
                if pid and str(props.get("application.process.id")) != str(pid):
                    continue
                description = str(props.get("node.description") or props.get("media.name") or "")
                if description:
                    break
        except (OSError, subprocess.TimeoutExpired, ValueError):
            description = ""
        kind = "unknown"
        match = False
        if description in monitors:
            kind = "monitor"
        for window in windows:
            title = str(window.get("title") or "")
            klass = str(window.get("class") or "")
            if description and (description == title or klass in description or title in description):
                kind = "window"
                match = True
                break
        self.last_source = {"sourceKind": kind, "label": description, "matchesGameWindow": match, "monitors": sorted(monitors)}
        return self.last_source

    def _cli(self, args: list[str], timeout: float = 8) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [gsr_cli(), "-ipc", str(paths.gsr_socket()), *args],
            text=True, capture_output=True, timeout=timeout,
        )

    def alive(self) -> bool:
        return self.process is not None and self.process.poll() is None

    def status(self) -> dict[str, Any]:
        running = self.alive() and self._cli(["status"]).returncode == 0
        elapsed = max(0.0, time.monotonic() - self.started_at) if running else 0.0
        state = "off"
        if running:
            if not self.confirmed:
                state = "starting"
            elif elapsed < BUFFER_SECONDS:
                state = "buffering"
            else:
                state = "capturing"
        return {
            "running": running,
            "state": state,
            "sourceType": self.source_type if self.confirmed else "unknown",
            "sourceLabel": self.source_label,
            "profile": self.profile,
            "elapsedSec": elapsed,
            "pid": self.process.pid if self.process else None,
            "ready": running and self.confirmed and self.source_type in {"window", "region"},
            "ipcReady": running,
            "footageReady": bool(self.first_frame_ts),
            "pixelIsolation": False,
            "captureMode": "region" if self._owned_region else self.source_type,
        }

    def confirm_source(self, source_type: str, source_label: str) -> None:
        if source_type not in {"window", "region"}:
            self.confirmed = False
            self.source_type = source_type
            raise CaptureError("capture source is not the game window")
        self.source_type = source_type
        self.source_label = source_label
        self.confirmed = True

    def save_replay(self, seconds: float, staging: Path) -> Path:
        if not self.alive():
            raise CaptureError("recorder is not running")
        seconds = replay_save_seconds(seconds)
        result = self._cli(["save-replay", str(seconds)], timeout=30)
        if result.returncode != 0:
            raise CaptureError(redact_recorder_text(result.stderr or "save-replay failed"))
        saved = Path(result.stdout.strip().splitlines()[-1] if result.stdout.strip() else "")
        if not saved or not paths.is_owned_regular(saved, paths.staging_dir()) and not paths.is_owned_regular(saved, paths.videos_root()):
            # GSR may write into the replay output directory. Accept owned regular files only.
            if not saved.is_file() or saved.is_symlink():
                raise CaptureError("recorder returned an unusable path")
            if saved.stat().st_uid != os.getuid():
                raise CaptureError("recorder path is not owned")
        staging.parent.mkdir(parents=True, exist_ok=True)
        if staging.exists() or staging.is_symlink():
            raise CaptureError("staging path already exists")
        os.replace(saved, staging)
        ts_file = Path(str(saved) + ".ts")
        if not ts_file.is_file():
            ts_file = saved.with_suffix(saved.suffix + ".ts")
        if ts_file.is_file() and not ts_file.is_symlink():
            try:
                parsed = parse_first_frame_ts(ts_file.read_text(encoding="utf-8"))
                if parsed:
                    self.first_frame_ts = parsed
                ts_file.unlink()
            except OSError:
                pass
        return staging

    def stop(self) -> None:
        if not self.process:
            return
        try:
            self._cli(["stop"], timeout=5)
        except (OSError, subprocess.TimeoutExpired):
            pass
        try:
            self.process.send_signal(signal.SIGINT)
            self.process.wait(timeout=4)
        except (OSError, subprocess.TimeoutExpired):
            try:
                self.process.kill()
            except OSError:
                pass
        self.process = None
        self.confirmed = False

    def diagnostics(self) -> list[str]:
        lines: list[str] = []
        try:
            text = self.log_path.read_text(encoding="utf-8", errors="replace")[-4000:]
        except OSError:
            return lines
        for raw in text.splitlines()[-40:]:
            classified = classify_recorder_line(raw)
            if classified:
                lines.append(classified)
        return lines


class FakeCapture:
    """In-process backend for unattended tests. Never talks to a portal."""

    def __init__(self, fixture: Path | None = None):
        self.running = False
        self.started_at = 0.0
        self.profile = "normal"
        self.fixture = fixture
        self.confirmed = False
        self.source_type = "unknown"
        self.saves = 0
        self.killed = False
        self.forced_source: dict[str, Any] | None = None
        self.first_frame_ts: tuple[int, int] | None = None
        self.last_source: dict[str, Any] = {}
        self._owned_region = ""

    def start(self, profile: str, audio_source: str | None, *, window: str = "region",
              region: str | None = None) -> dict[str, Any]:
        self.running = True
        self.started_at = time.monotonic()
        self.profile = profile
        self.killed = False
        self.source_type = "region" if window == "region" else "unknown"
        self._owned_region = region or ""
        return self.status()

    def inspect_source(self, windows: list[dict[str, Any]]) -> dict[str, Any]:
        if self.forced_source is not None:
            self.last_source = dict(self.forced_source)
            return self.last_source
        self.last_source = {"sourceKind": "unknown", "matchesGameWindow": False, "label": ""}
        return self.last_source

    def confirm_source(self, source_type: str, source_label: str) -> None:
        if source_type not in {"window", "region"}:
            raise CaptureError("capture source is not the game window")
        self.source_type = source_type
        self.confirmed = True

    def status(self) -> dict[str, Any]:
        elapsed = time.monotonic() - self.started_at if self.running else 0
        state = "off"
        if self.running:
            if not self.confirmed:
                state = "starting"
            elif elapsed < BUFFER_SECONDS:
                state = "buffering"
            else:
                state = "capturing"
        return {
            "running": self.running,
            "state": state,
            "sourceType": self.source_type if self.confirmed else "unknown",
            "sourceLabel": "Rat Detective",
            "profile": self.profile,
            "elapsedSec": elapsed,
            "pid": os.getpid() if self.running else None,
            "ready": self.running and self.confirmed and self.source_type in {"window", "region"},
            "ipcReady": self.running,
            "footageReady": self.running and self.confirmed,
            "pixelIsolation": False,
            "captureMode": "region" if self._owned_region else self.source_type,
        }

    def save_replay(self, seconds: float, staging: Path) -> Path:
        if not self.running or not self.confirmed:
            raise CaptureError("recorder is not running")
        staging.parent.mkdir(parents=True, exist_ok=True)
        if self.fixture and self.fixture.is_file():
            shutil.copy2(self.fixture, staging)
        else:
            staging.write_bytes(b"\x00\x00fake-mp4")
        self.saves += 1
        return staging

    def stop(self) -> None:
        self.running = False
        self.confirmed = False

    def alive(self) -> bool:
        return self.running and not self.killed

    def simulate_external_stop(self) -> None:
        self.killed = True
        self.running = False

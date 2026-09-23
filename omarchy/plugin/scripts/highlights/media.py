"""One bounded worker for GSR save/probe, separate from helper control handling."""

from __future__ import annotations

import queue
import subprocess
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from .capture import CaptureError
from .export import ExportError, probe
from .redact import redact_recorder_text
from .tuning import IN_FLIGHT_SAVES, PENDING_INTERVAL_LIMIT


@dataclass(frozen=True)
class SaveJob:
    job_id: str
    marker_ids: tuple[str, ...]
    session_id: str
    document_epoch: str
    capture_epoch: str
    seconds: float
    event_ms: float
    start_ms: float
    end_ms: float
    requested_start_ms: float
    requested_end_ms: float
    title_key: str
    kind: str
    score: int
    truncated: bool
    staging: Path
    require_real_media: bool
    created_at: float = field(default_factory=time.monotonic)


class MediaWorker:
    def __init__(self, save_replay: Callable[[float, Path], Path]):
        self._save_replay = save_replay
        self.jobs: queue.Queue[SaveJob] = queue.Queue(maxsize=PENDING_INTERVAL_LIMIT)
        self.results: queue.Queue[dict[str, Any]] = queue.Queue()
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._pending = 0
        self._thread = threading.Thread(target=self._run, daemon=True, name="highlights-media")
        self._thread.start()

    def submit(self, job: SaveJob) -> bool:
        with self._lock:
            self._pending += 1
        try:
            self.jobs.put_nowait(job)
            return True
        except queue.Full:
            with self._lock:
                self._pending -= 1
            return False

    def collect(self) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        while True:
            try:
                out.append(self.results.get_nowait())
            except queue.Empty:
                return out

    def busy(self) -> bool:
        with self._lock:
            pending = self._pending
        return pending > 0 or not self.results.empty()

    def stop(self) -> None:
        self._stop.set()

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                job = self.jobs.get(timeout=0.1)
            except queue.Empty:
                continue
            try:
                self.results.put(self._execute(job))
            finally:
                with self._lock:
                    self._pending = max(0, self._pending - 1)
                self.jobs.task_done()

    def _execute(self, job: SaveJob) -> dict[str, Any]:
        result: dict[str, Any] = {
            "job_id": job.job_id,
            "marker_ids": list(job.marker_ids),
            "session_id": job.session_id,
            "document_epoch": job.document_epoch,
            "capture_epoch": job.capture_epoch,
            "seconds": job.seconds,
            "event_ms": job.event_ms,
            "start_ms": job.start_ms,
            "end_ms": job.end_ms,
            "requested_start_ms": job.requested_start_ms,
            "requested_end_ms": job.requested_end_ms,
            "title_key": job.title_key,
            "kind": job.kind,
            "score": job.score,
            "truncated": job.truncated,
            "path": None,
            "probe": None,
            "error": "",
            "status": "failed",
        }
        try:
            path = self._save_replay(job.seconds, job.staging)
            result["path"] = str(path)
            if job.require_real_media or path.stat().st_size > 32:
                info = probe(path)
            else:
                info = {"durationMs": int(job.seconds * 1000), "codec": "h264", "fake": True}
            result["probe"] = info
            result["status"] = "saved"
        except subprocess.TimeoutExpired as error:
            result["status"] = "timeout"
            result["error"] = redact_recorder_text(str(error))
            recovered = _owned_output(job.staging)
            if recovered is not None:
                result["path"] = str(recovered)
                result["status"] = "timeout-with-file"
        except (CaptureError, ExportError, OSError, KeyError, ValueError) as error:
            result["status"] = "failed"
            result["error"] = redact_recorder_text(str(error))
            if job.staging.exists():
                try:
                    job.staging.unlink()
                except OSError:
                    pass
        return result


def _owned_output(staging: Path) -> Path | None:
    if staging.is_file() and not staging.is_symlink():
        return staging
    parent = staging.parent
    if not parent.is_dir():
        return None
    newest: Path | None = None
    newest_mtime = 0.0
    for child in parent.iterdir():
        if child.suffix != ".mp4" or not child.is_file() or child.is_symlink():
            continue
        mtime = child.stat().st_mtime
        if mtime > newest_mtime:
            newest = child
            newest_mtime = mtime
    return newest


# Keep the imported constant referenced so a future IN_FLIGHT change stays visible.
_ = IN_FLIGHT_SAVES

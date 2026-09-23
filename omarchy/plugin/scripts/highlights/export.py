"""Bounded FFmpeg thumbnail, trim and reel export jobs."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Any, Callable

from .library import Library
from .protocol import new_id
from .tuning import EXPORT_QUEUE_LIMIT, THUMBNAIL_WIDTH


class ExportError(RuntimeError):
    pass


def command(name: str) -> str:
    override = os.environ.get("RAT_DETECTIVE_" + name.upper().replace("-", "_") + "_COMMAND")
    if override:
        return override
    found = shutil.which(name)
    return found or name


def run_ffmpeg(argv: list[str], timeout: float = 120) -> subprocess.CompletedProcess[str]:
    return subprocess.run(argv, text=True, capture_output=True, timeout=timeout, check=False)


def probe(path: Path) -> dict[str, Any]:
    argv = [command("ffprobe"), "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)]
    result = run_ffmpeg(argv, timeout=20)
    if result.returncode != 0:
        raise ExportError(result.stderr.strip() or "ffprobe failed")
    payload = json.loads(result.stdout)
    video = next((stream for stream in payload.get("streams", []) if stream.get("codec_type") == "video"), None)
    audio = next((stream for stream in payload.get("streams", []) if stream.get("codec_type") == "audio"), None)
    duration = float(payload.get("format", {}).get("duration") or 0)
    if not video or duration <= 0:
        raise ExportError("clip is not a playable video")
    return {
        "durationMs": int(duration * 1000),
        "width": int(video.get("width") or 0),
        "height": int(video.get("height") or 0),
        "codec": video.get("codec_name"),
        "audioCodec": audio.get("codec_name") if audio else None,
        "sampleRate": int(audio.get("sample_rate") or 0) if audio else 0,
        "hasAudio": audio is not None,
    }


def write_thumbnail(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".tmp.jpg")
    argv = [
        command("ffmpeg"), "-y", "-hide_banner", "-loglevel", "error",
        "-ss", "0.4", "-i", str(source), "-frames:v", "1", "-vf", f"scale={THUMBNAIL_WIDTH}:-2",
        str(temporary),
    ]
    result = run_ffmpeg(argv, timeout=20)
    if result.returncode != 0 or not temporary.is_file():
        raise ExportError(result.stderr.strip() or "thumbnail failed")
    os.replace(temporary, destination)


def _publish(temporary: Path, destination: Path) -> dict[str, Any]:
    info = probe(temporary)
    # Atomic no-overwrite publication, even if another process creates the name
    # after this job was queued. Temporary media is on the same filesystem.
    os.link(temporary, destination)
    temporary.unlink()
    return info


def export_clip(source: Path, destination: Path, trim_in_ms: int, trim_out_ms: int,
                options: dict[str, Any] | None = None, *, canvas: tuple[int, int] | None = None,
                fill_silence: bool = False) -> dict[str, Any]:
    options = options or {}
    if destination.exists():
        raise ExportError("refusing to overwrite an existing file")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.parent / f".{destination.stem}-{new_id()}.partial.mp4"
    start = max(0, trim_in_ms) / 1000
    duration = max(0.2, (trim_out_ms - trim_in_ms) / 1000)
    sound = options.get("sound", True)
    info = probe(source)
    argv = [command("ffmpeg"), "-y", "-hide_banner", "-loglevel", "error",
            "-ss", f"{start:.3f}", "-i", str(source)]
    if sound and fill_silence and not info["hasAudio"]:
        argv += ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
    argv += ["-t", f"{duration:.3f}", "-map", "0:v:0"]
    if sound and (info["hasAudio"] or fill_silence):
        argv += ["-map", "0:a:0" if info["hasAudio"] else "1:a:0",
                 "-c:a", "aac", "-ac", "2", "-ar", "48000", "-af", "aresample=async=1:first_pts=0,apad"]
    else:
        argv += ["-an"]
    limit = {"1080p": (1920, 1080), "720p": (1280, 720)}.get(options.get("size"))
    width, height = info["width"], info["height"]
    factor = min(1, limit[0] / width, limit[1] / height) if limit else 1
    width, height = max(2, int(width * factor) // 2 * 2), max(2, int(height * factor) // 2 * 2)
    filters = f"scale={width}:{height},setsar=1"
    if canvas:
        filters += f",pad={canvas[0]}:{canvas[1]}:(ow-iw)/2:(oh-ih)/2:black"
    argv += ["-vf", filters, "-c:v", "libx264", "-crf", "18" if options.get("quality") == "high" else "23",
             "-preset", "medium", "-pix_fmt", "yuv420p", "-fps_mode", "vfr",
             "-video_track_timescale", "90000", "-movflags", "+faststart", str(temporary)]
    try:
        result = run_ffmpeg(argv, timeout=180)
        if result.returncode or not temporary.is_file():
            raise ExportError(result.stderr.strip() or "export failed")
        return _publish(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def export_reel(library: Library, items: list[dict[str, Any]], destination: Path,
                progress: Callable[[float], None] | None = None,
                options: dict[str, Any] | None = None) -> dict[str, Any]:
    options = options or {}
    if destination.exists():
        raise ExportError("refusing to overwrite an existing file")
    if not items:
        raise ExportError("reel has no clips")
    sources = []
    sizes = []
    limit = {"1080p": (1920, 1080), "720p": (1280, 720)}.get(options.get("size"))
    for item in items:
        clip = library.get_clip(item["clip_id"])
        if not clip or clip["status"] != "ready":
            raise ExportError("reel source is missing")
        source = library.clip_path(clip)
        if not source.is_file() or source.is_symlink():
            raise ExportError("reel source is not a regular file")
        info = probe(source)
        factor = min(1, limit[0] / info["width"], limit[1] / info["height"]) if limit else 1
        sizes.append((max(2, int(info["width"] * factor) // 2 * 2), max(2, int(info["height"] * factor) // 2 * 2)))
        sources.append(source)
    canvas = (max(s[0] for s in sizes), max(s[1] for s in sizes))
    work = destination.parent / f".reel-{new_id()}"
    work.mkdir(parents=True, exist_ok=True)
    temporary = work / "reel.mp4"
    try:
        segments = []
        for index, (item, source) in enumerate(zip(items, sources)):
            segment = work / f"seg-{index:02d}.mp4"
            export_clip(source, segment, int(item["trim_in_ms"]), int(item["trim_out_ms"]),
                        options, canvas=canvas, fill_silence=True)
            segments.append(segment)
            if progress:
                progress((index + 1) / (len(items) + 1))
        listing = work / "concat.txt"
        listing.write_text("".join(f"file '{path.name}'\n" for path in segments), encoding="utf-8")
        argv = [command("ffmpeg"), "-y", "-hide_banner", "-loglevel", "error",
                "-f", "concat", "-safe", "0", "-i", str(listing), "-c:v", "libx264",
                "-crf", "18" if options.get("quality") == "high" else "23", "-pix_fmt", "yuv420p",
                "-fps_mode", "vfr"]
        argv += ["-c:a", "aac", "-ac", "2", "-ar", "48000"] if options.get("sound", True) else ["-an"]
        argv += ["-movflags", "+faststart", str(temporary)]
        result = run_ffmpeg(argv, timeout=240)
        if result.returncode:
            raise ExportError(result.stderr.strip() or "reel concat failed")
        info = _publish(temporary, destination)
        if progress:
            progress(1)
        return info
    finally:
        shutil.rmtree(work, ignore_errors=True)


class ExportQueue:
    def __init__(self) -> None:
        self.jobs: list[dict[str, Any]] = []
        self._work: dict[str, Callable[[Callable[[float], None]], dict[str, Any]]] = {}
        self._cv = threading.Condition()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="highlights-export", daemon=True)
        self._thread.start()

    def stop(self, timeout: float = 2.0) -> None:
        self._stop.set()
        with self._cv:
            self._cv.notify_all()
        thread = self._thread
        if thread is not None:
            thread.join(timeout=timeout)

    def enqueue(self, kind: str, work: Callable[[Callable[[float], None]], dict[str, Any]], *,
                destination: str = "") -> dict[str, Any]:
        with self._cv:
            active = [item for item in self.jobs if item["status"] in {"queued", "running"}]
            if len(active) >= EXPORT_QUEUE_LIMIT:
                raise ExportError("export queue is full")
            job_id = new_id()
            job = {
                "id": job_id, "kind": kind, "status": "queued", "progress": 0.0,
                "destination": destination, "error": "", "path": "",
            }
            self.jobs.append(job)
            self._work[job_id] = work
            self._cv.notify()
        self.start()
        return self._public(job)

    def cancel(self, job_id: str) -> bool:
        with self._cv:
            for job in self.jobs:
                if job["id"] == job_id and job["status"] in {"queued", "running"}:
                    job["status"] = "cancelled"
                    self._cv.notify_all()
                    return True
        return False

    def current(self) -> dict[str, Any] | None:
        with self._cv:
            for job in reversed(self.jobs):
                if job["status"] in {"queued", "running"}:
                    return self._public(job)
            return self._public(self.jobs[-1]) if self.jobs else None

    def _public(self, job: dict[str, Any]) -> dict[str, Any]:
        return {key: job[key] for key in ("id", "kind", "status", "progress", "destination", "error", "path") if key in job}

    def _run(self) -> None:
        while not self._stop.is_set():
            with self._cv:
                job = next((item for item in self.jobs if item["status"] == "queued"), None)
                if job is None:
                    self._cv.wait(timeout=0.2)
                    continue
                job["status"] = "running"
                work = self._work.get(job["id"])
            if work is None or job["status"] == "cancelled":
                continue
            try:
                def progress(value: float, current=job) -> None:
                    with self._cv:
                        if current["status"] == "running":
                            current["progress"] = max(0.0, min(1.0, float(value)))
                info = work(progress)
                with self._cv:
                    if job["status"] != "cancelled":
                        job["status"] = "done"
                        job["progress"] = 1.0
                        job["path"] = str(info.get("path") or job.get("destination") or "")
            except Exception as error:
                with self._cv:
                    if job["status"] != "cancelled":
                        job["status"] = "error"
                        job["error"] = str(error)
            finally:
                self._work.pop(job["id"], None)

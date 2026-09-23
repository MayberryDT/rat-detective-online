#!/usr/bin/env python3
"""Disposable 60fps edit frames; original recordings are never modified."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
from urllib.parse import unquote, urlparse


def prepare(source_url, start=None, end=None):
    parsed = urlparse(source_url)
    if parsed.scheme != "file" or parsed.netloc not in ("", "localhost"):
        raise ValueError("preview requires a local recording")
    source = Path(unquote(parsed.path)).resolve(strict=True)
    stat = source.stat()
    key = hashlib.sha256(f"v2:{source}:{stat.st_size}:{stat.st_mtime_ns}:{start}:{end}".encode()).hexdigest()
    cache = Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache") / "rat-detective/highlights/edit-frames"
    cache.mkdir(parents=True, exist_ok=True)
    # One producer, including overlapping windows during shell reloads.
    with (cache / "lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        destination = cache / key
        manifest = destination / "frames.json"
        if manifest.is_file():
            os.utime(destination, None)
            return json.loads(manifest.read_text())
        info = json.loads(subprocess.check_output([
            "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(source)
        ], timeout=15))
        duration = float(info["format"]["duration"])
        if not 0 < duration <= 120:
            raise ValueError("preview supports clips up to two minutes")
        if start is not None and not (0 <= start < end <= duration * 1000 + 50):
            raise ValueError("invalid playback range")
        work = Path(tempfile.mkdtemp(prefix="partial-", dir=cache))
        child = None
        try:
            argv = [
                "ffmpeg", "-nostdin", "-v", "error", "-threads", "2", "-i", str(source),
                "-t", str(duration), "-an", "-vf", "fps=60,scale=854:480:force_original_aspect_ratio=decrease",
                "-q:v", "4", "-threads", "2", "-start_number", "0", str(work / "%06d.jpg")
            ]
            if start is not None:
                argv = ["ffmpeg", "-nostdin", "-v", "error", "-threads", "2",
                        "-ss", str(start / 1000), "-i", str(source), "-t", str((end - start) / 1000),
                        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-threads", "2",
                        "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", str(work / "clip.mp4")]
            child = subprocess.Popen(argv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if child.wait(timeout=90) != 0:
                raise RuntimeError("preview generation failed")
            frames = list(work.glob("*.jpg" if start is None else "*.mp4"))
            size = sum(frame.stat().st_size for frame in frames)
            if not frames or size > 256 * 1024 * 1024:
                raise RuntimeError("preview exceeds cache budget")
            # Bound the entire disposable cache, evicting oldest previews first.
            used = size
            for old in sorted((p for p in cache.iterdir() if p.is_dir() and p != work), key=lambda p: p.stat().st_mtime, reverse=True):
                used += sum(p.stat().st_size for p in old.iterdir() if p.is_file())
                if used > 256 * 1024 * 1024 or old.name.startswith("partial-"):
                    shutil.rmtree(old)
            result = {"url": destination.as_uri() + "/", "fps": 60, "count": len(frames)} if start is None else {"playback": (destination / "clip.mp4").as_uri()}
            (work / "frames.json").write_text(json.dumps(result))
            work.rename(destination)
            return result
        finally:
            if child is not None and child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()
            if work.exists():
                shutil.rmtree(work)


def interrupted(signum, frame):
    raise InterruptedError("preview cancelled")


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, interrupted)
    try:
        print(json.dumps(prepare(sys.argv[1], *[int(value) for value in sys.argv[2:]])))
    except Exception as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(1)

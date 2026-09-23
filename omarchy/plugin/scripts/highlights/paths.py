"""User-owned highlights locations. Never follow pre-existing symlinks."""

from __future__ import annotations

import os
from pathlib import Path

from .tuning import RUNTIME_MODE

APP = "rat-detective"
HIGHLIGHTS = "highlights"


def home() -> Path:
    return Path(os.environ.get("HOME", str(Path.home())))


def _xdg(env_name: str, fallback: Path) -> Path:
    value = os.environ.get(env_name)
    return Path(value) if value else fallback


def config_dir() -> Path:
    return _xdg("XDG_CONFIG_HOME", home() / ".config") / APP / HIGHLIGHTS


def data_dir() -> Path:
    return _xdg("XDG_DATA_HOME", home() / ".local" / "share") / APP


def state_dir() -> Path:
    return _xdg("XDG_STATE_HOME", home() / ".local" / "state") / APP / HIGHLIGHTS


def cache_dir() -> Path:
    return _xdg("XDG_CACHE_HOME", home() / ".cache") / APP / HIGHLIGHTS


def runtime_dir() -> Path:
    base = Path(os.environ.get("XDG_RUNTIME_DIR") or f"/run/user/{os.getuid()}")
    return base / "rat-detective-highlights"


def videos_root() -> Path:
    explicit = os.environ.get("RAT_DETECTIVE_HIGHLIGHTS_VIDEOS")
    if explicit:
        return Path(explicit)
    user_dirs = _xdg("XDG_CONFIG_HOME", home() / ".config") / "user-dirs.dirs"
    try:
        text = user_dirs.read_text(encoding="utf-8")
        for line in text.splitlines():
            if line.startswith("XDG_VIDEOS_DIR="):
                raw = line.split("=", 1)[1].strip().strip('"')
                return Path(raw.replace("$HOME", str(home()))) / "Rat Detective" / "Highlights"
    except OSError:
        pass
    return home() / "Videos" / "Rat Detective" / "Highlights"


def thumbnails_dir() -> Path:
    return cache_dir() / "thumbnails"


def staging_dir() -> Path:
    return state_dir() / "staging"


def trash_dir() -> Path:
    return videos_root() / "Trash"


def catalog_path() -> Path:
    return state_dir() / "catalog.sqlite"


def settings_path() -> Path:
    return config_dir() / "settings.json"


def control_socket() -> Path:
    return runtime_dir() / "control.sock"


def gsr_socket() -> Path:
    return runtime_dir() / "gsr.sock"


def portal_token_path() -> Path:
    return config_dir() / "portal-session-token"


def instance_lock() -> Path:
    return runtime_dir() / "instance.lock"


def pid_path() -> Path:
    return runtime_dir() / "helper.pid"


def lease_path() -> Path:
    return runtime_dir() / "lease.json"


def prepare_runtime() -> Path:
    path = runtime_dir()
    if path.exists() and path.is_symlink():
        raise OSError("runtime directory must not be a symlink")
    path.mkdir(mode=RUNTIME_MODE, parents=True, exist_ok=True)
    os.chmod(path, RUNTIME_MODE)
    if path.is_symlink():
        raise OSError("runtime directory became a symlink")
    return path


def prepare_state() -> None:
    for path in (config_dir(), state_dir(), cache_dir(), videos_root(), thumbnails_dir(), staging_dir(), trash_dir()):
        if path.exists() and path.is_symlink():
            raise OSError(f"refusing symlink path: {path}")
        path.mkdir(parents=True, exist_ok=True)
        if path.is_symlink():
            raise OSError(f"refusing symlink path: {path}")


def is_owned_regular(path: Path, root: Path) -> bool:
    try:
        stat = path.lstat()
    except OSError:
        return False
    import stat as statmod
    if statmod.S_ISLNK(stat.st_mode) or not statmod.S_ISREG(stat.st_mode):
        return False
    if stat.st_uid != os.getuid():
        return False
    resolved_root = root.resolve()
    try:
        resolved = path.resolve()
    except OSError:
        return False
    return resolved == resolved_root or str(resolved).startswith(str(resolved_root) + os.sep)


def relative_under(root: Path, path: Path) -> str:
    resolved_root = root.resolve()
    resolved = path.resolve()
    relative = resolved.relative_to(resolved_root)
    if ".." in relative.parts:
        raise ValueError("path escaped managed root")
    return str(relative)

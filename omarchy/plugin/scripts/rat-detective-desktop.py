#!/usr/bin/env python3
"""Safe desktop adapter for the Rat Detective Omarchy companion.

Every command that accepts data builds an argv vector; no value is passed through
a shell.  The adapter is copied to a durable user data directory by
install-webapp.sh so the launcher keeps working after the shell plugin is removed.
"""

from __future__ import annotations

import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import tempfile
import time
from typing import Any
from urllib.parse import urlencode


APP_ID = "co.animasai.rat-detective"
APP_NAME = "Rat Detective"
APP_URL = "https://ratdetective.online/"
ROOM_RE = re.compile(r"^public-live-v2(?:-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$")
CHORD_RE = re.compile(r"^[A-Z0-9][A-Z0-9 _+:-]{0,80}$")
MARKER_START = "-- rat-detective-dispatch: shortcut start"
MARKER_END = "-- rat-detective-dispatch: shortcut end"


def home() -> Path:
    return Path(os.environ.get("HOME", str(Path.home())))


def xdg_path(env_name: str, fallback: Path) -> Path:
    value = os.environ.get(env_name)
    return Path(value) if value else fallback


def config_dir() -> Path:
    return xdg_path("XDG_CONFIG_HOME", home() / ".config") / "rat-detective"


def data_dir() -> Path:
    return xdg_path("XDG_DATA_HOME", home() / ".local" / "share") / "rat-detective"


def state_dir() -> Path:
    return xdg_path("XDG_STATE_HOME", home() / ".local" / "state") / "rat-detective"


def desktop_path() -> Path:
    return xdg_path("XDG_DATA_HOME", home() / ".local" / "share") / "applications" / f"{APP_NAME}.desktop"


def preferences_path() -> Path:
    return config_dir() / "desktop.json"


def helper_path() -> Path:
    override = os.environ.get("RAT_DETECTIVE_DESKTOP_HELPER")
    return Path(override) if override else data_dir() / "rat-detective-desktop.py"


def command(name: str) -> str:
    override = os.environ.get("RAT_DETECTIVE_" + name.upper().replace("-", "_") + "_COMMAND")
    if override:
        return override
    found = shutil.which(name)
    return found or name


def run(argv: list[str], *, check: bool = False, timeout: float = 5) -> subprocess.CompletedProcess[str]:
    return subprocess.run(argv, text=True, capture_output=True, check=check, timeout=timeout)


def print_json(payload: dict[str, Any]) -> int:
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    return 0 if payload.get("ok", True) else 1


def atomic_write(path: Path, text: str, mode: int = 0o644) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            output.write(text)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temp_name, mode)
        os.replace(temp_name, path)
    finally:
        try:
            os.unlink(temp_name)
        except FileNotFoundError:
            pass


def backup(path: Path) -> Path | None:
    if not path.exists():
        return None
    stamp = time.strftime("%Y%m%d-%H%M%S")
    target = path.with_name(f"{path.name}.rat-detective-backup-{stamp}")
    counter = 1
    while target.exists():
        target = path.with_name(f"{path.name}.rat-detective-backup-{stamp}-{counter}")
        counter += 1
    shutil.copy2(path, target)
    return target


def load_preferences() -> dict[str, Any]:
    defaults: dict[str, Any] = {"workspace": None, "fullscreen": False, "desktopAudio": False}
    try:
        raw = json.loads(preferences_path().read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            workspace = raw.get("workspace")
            if workspace is None or (isinstance(workspace, int) and 1 <= workspace <= 99):
                defaults["workspace"] = workspace
            defaults["fullscreen"] = raw.get("fullscreen") is True
            defaults["desktopAudio"] = raw.get("desktopAudio") is True
    except (FileNotFoundError, OSError, ValueError):
        pass
    return defaults


def save_preferences(args: argparse.Namespace) -> int:
    prefs = load_preferences()
    if args.workspace is not None:
        prefs["workspace"] = None if args.workspace == "current" else int(args.workspace)
    if args.fullscreen is not None:
        prefs["fullscreen"] = args.fullscreen == "true"
    if args.desktop_audio is not None:
        prefs["desktopAudio"] = args.desktop_audio == "true"
    atomic_write(preferences_path(), json.dumps(prefs, indent=2) + "\n")
    return print_json({"ok": True, "preferences": prefs})


def proc_names() -> set[str]:
    override = os.environ.get("RAT_DETECTIVE_PROC_NAMES")
    if override is not None:
        return set(filter(None, override.split(",")))
    names: set[str] = set()
    proc = Path("/proc")
    try:
        entries = proc.iterdir()
    except OSError:
        return names
    for entry in entries:
        if not entry.name.isdigit():
            continue
        try:
            names.add((entry / "comm").read_text(encoding="utf-8").strip())
            argv0 = (entry / "cmdline").read_bytes().split(b"\0", 1)[0]
            if argv0:
                names.add(os.path.basename(os.fsdecode(argv0)))
        except OSError:
            continue
    return names


def lock_state() -> str:
    explicit = os.environ.get("RAT_DETECTIVE_LOCK_STATE")
    if explicit in {"locked", "unlocked", "unknown"}:
        return explicit
    try:
        result = run([command("omarchy-shell"), "lock", "isLocked"], timeout=2)
        answer = result.stdout.strip().lower()
        if result.returncode == 0 and answer in {"true", "false"}:
            return "locked" if answer == "true" else "unlocked"
    except (OSError, subprocess.TimeoutExpired):
        pass
    # Covers a stranded ext-session-lock if the shell crashed. Exit 2 means the
    # compositor cannot determine state, so preserve unknown rather than lying.
    try:
        result = run([command("omarchy-hyprland-session-locked")], timeout=2)
        if result.returncode == 0:
            return "locked"
        if result.returncode == 1:
            return "unlocked"
    except (OSError, subprocess.TimeoutExpired):
        pass
    return "unknown"


def hypr_clients() -> list[dict[str, Any]]:
    try:
        result = run([command("hyprctl"), "clients", "-j"])
        parsed = json.loads(result.stdout) if result.returncode == 0 else []
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return []
    return parsed if isinstance(parsed, list) else []


def is_game_window(client: dict[str, Any]) -> bool:
    # New launchers set --class explicitly. Legacy browser app identities are
    # accepted only when their exact origin-derived suffix matches the canonical
    # host; a window title alone never qualifies.
    classes = {str(client.get("class", "")), str(client.get("initialClass", ""))}
    legacy_classes = {
        "brave-ratdetective.online__-Default",
        "chromium-ratdetective.online__-Default",
        "google-chrome-ratdetective.online__-Default",
        "microsoft-edge-ratdetective.online__-Default",
        "opera-ratdetective.online__-Default",
        "vivaldi-ratdetective.online__-Default",
        "helium-ratdetective.online__-Default",
        # Launcher installed before the canonical-domain repair. Redirected
        # windows keep the app identity derived from their launch origin.
        "brave-rat-detective.animasai.co__-Default",
        "chromium-rat-detective.animasai.co__-Default",
        "google-chrome-rat-detective.animasai.co__-Default",
        "microsoft-edge-rat-detective.animasai.co__-Default",
        "opera-rat-detective.animasai.co__-Default",
        "vivaldi-rat-detective.animasai.co__-Default",
        "helium-rat-detective.animasai.co__-Default",
    }
    return (
        APP_ID in classes
        or any(value.startswith(APP_ID + ".join-") for value in classes)
        or bool(classes & legacy_classes)
    )


def game_windows() -> list[dict[str, Any]]:
    windows: list[dict[str, Any]] = []
    for client in hypr_clients():
        if not isinstance(client, dict) or not is_game_window(client):
            continue
        workspace = client.get("workspace") if isinstance(client.get("workspace"), dict) else {}
        try:
            focus_history = int(client.get("focusHistoryID", -1))
        except (TypeError, ValueError):
            focus_history = -1
        windows.append({
            "address": str(client.get("address", "")),
            "class": str(client.get("class", "")),
            "title": str(client.get("title", "")),
            "workspace": str(workspace.get("name", "")),
            "focused": focus_history == 0,
            "focusHistoryID": focus_history,
            "fullscreen": int(client.get("fullscreen", 0) or 0) in (2, 3),
        })
    return windows


def browser_window_class() -> str:
    desktop = os.environ.get("RAT_DETECTIVE_BROWSER_DESKTOP", "")
    if not desktop:
        try:
            result = run([command("xdg-settings"), "get", "default-web-browser"], timeout=3)
            if result.returncode == 0:
                desktop = result.stdout.strip()
        except (OSError, subprocess.TimeoutExpired):
            pass
    stem = desktop.removesuffix(".desktop").lower()
    if stem.startswith("brave"):
        prefix = "brave"
    elif stem.startswith("google-chrome"):
        prefix = "google-chrome"
    elif stem.startswith("microsoft-edge"):
        prefix = "microsoft-edge"
    elif stem.startswith("opera"):
        prefix = "opera"
    elif stem.startswith("vivaldi"):
        prefix = stem
    elif stem.startswith("helium"):
        prefix = "helium"
    else:
        prefix = "chromium"
    return f"{prefix}-ratdetective.online__-Default"


def launcher_state() -> dict[str, Any]:
    path = desktop_path()
    installed = path.is_file()
    canonical = False
    durable = False
    if installed:
        try:
            text = path.read_text(encoding="utf-8")
            exec_line = next((line for line in text.splitlines() if line.startswith("Exec=")), "")
            expected_exec = f"Exec={desktop_exec_arg(str(helper_path().resolve()))} return"
            durable = exec_line == expected_exec
            # Older launchers carry the URL directly. Current launchers keep the
            # desktop entry stable and delegate to a durable helper, so verify
            # that helper's canonical constant instead of expecting a URL in
            # Exec=. Read it as data; status must never execute an unknown file.
            helper_canonical = False
            if durable:
                helper_text = helper_path().read_text(encoding="utf-8")
                helper_canonical = re.search(
                    r'^APP_URL\s*=\s*["\']https://ratdetective\.online/["\']\s*$',
                    helper_text,
                    re.M,
                ) is not None
            canonical = APP_URL in exec_line or helper_canonical
        except OSError:
            pass
    return {"installed": installed, "canonical": canonical, "durable": durable, "path": str(path)}


def dnd_state() -> str:
    explicit = os.environ.get("RAT_DETECTIVE_DND")
    if explicit in {"on", "off", "unknown"}:
        return explicit
    path = xdg_path("XDG_STATE_HOME", home() / ".local" / "state") / "omarchy" / "notifications.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return "on" if payload.get("dnd") is True else "off"
    except (FileNotFoundError, OSError, ValueError, AttributeError):
        return "unknown"


def shortcut_state() -> dict[str, Any]:
    path = xdg_path("XDG_CONFIG_HOME", home() / ".config") / "hypr" / "bindings.lua"
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        text = ""
    match = re.search(re.escape(MARKER_START) + r"\n.*?o\.bind\(\"([^\"]+)\"", text, re.S)
    return {"installed": bool(match), "chord": match.group(1) if match else None, "path": str(path)}


def status(_: argparse.Namespace) -> int:
    windows = game_windows()
    names = proc_names()
    captures = screenrecord_dir()
    locked = lock_state()
    return print_json({
        "ok": True,
        "windows": windows,
        "windowOpen": bool(windows),
        "focused": any(window["focused"] for window in windows),
        "locked": locked == "locked",
        "lockState": locked,
        "dnd": dnd_state(),
        "recording": "gpu-screen-recorder" in names,
        "capturesDirectory": str(captures),
        "launcher": launcher_state(),
        "shortcut": shortcut_state(),
        "preferences": load_preferences(),
        "launchPending": current_launch_pending(),
    })


def acquire_action_lock() -> Any | None:
    target = state_dir() / "desktop-action.lock"
    target.parent.mkdir(parents=True, exist_ok=True)
    handle = target.open("a+")
    try:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close()
        return None
    return handle


def hypr_dispatch(*parts: str) -> bool:
    try:
        result = run([command("hyprctl"), "dispatch", *parts])
        return result.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def focus_window(window: dict[str, Any]) -> bool:
    address = window.get("address", "")
    if not re.fullmatch(r"0x[0-9a-fA-F]+", str(address)):
        return False
    expression = f'hl.dsp.focus({{ window = "address:{address}" }})'
    return hypr_dispatch(expression) or hypr_dispatch("focuswindow", f"address:{address}")


def set_true_fullscreen(address: str) -> bool:
    # Omarchy 4 / Hyprland 0.56 expose a deterministic Lua dispatcher. This
    # names the target and uses action=set, avoiding the legacy fullscreen
    # toggle (whose mode 1 is maximized rather than true fullscreen).
    expression = (
        'hl.dsp.window.fullscreen({ mode = "fullscreen", action = "set", '
        f'window = "address:{address}" }})'
    )
    if hypr_dispatch(expression):
        return True
    # Compatibility fallback for pre-Lua dispatcher installations. Focus the
    # exact address, re-read it, and toggle only when it is not already true
    # fullscreen. Mode 0 is classic true fullscreen; mode 1 is maximized.
    if not hypr_dispatch("focuswindow", f"address:{address}"):
        return False
    current = next((window for window in game_windows() if window["address"] == address), None)
    if current and current["fullscreen"]:
        return True
    return hypr_dispatch("fullscreen", "0")


def apply_window_preferences(address: str, prefs: dict[str, Any]) -> None:
    workspace = prefs.get("workspace")
    if isinstance(workspace, int):
        expression = (
            f'hl.dsp.window.move({{ workspace = "{workspace}", follow = false, '
            f'window = "address:{address}" }})'
        )
        if not hypr_dispatch(expression):
            hypr_dispatch("movetoworkspacesilent", f"{workspace},address:{address}")
        focus_window({"address": address})
    if prefs.get("fullscreen") is True:
        set_true_fullscreen(address)


def launch_url(url: str) -> subprocess.Popen[bytes]:
    # Chromium-family app windows derive their Wayland identity from the URL
    # origin. Brave ignores --class in app mode, verified on Omarchy 4.
    argv = [command("omarchy"), "launch", "webapp", url]
    return subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)


def wait_for_new_window(previous: set[str], timeout: float = 4.0) -> dict[str, Any] | None:
    try:
        timeout = float(os.environ.get("RAT_DETECTIVE_WINDOW_WAIT_SECONDS", timeout))
    except ValueError:
        pass
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        for window in game_windows():
            if window["address"] not in previous:
                return window
        time.sleep(0.1)
    return None


def launch_pending_path() -> Path:
    return state_dir() / "launch-pending.json"


def pending_window_seconds() -> float:
    try:
        return max(2.0, min(30.0, float(os.environ.get("RAT_DETECTIVE_LAUNCH_GUARD_SECONDS", "15"))))
    except ValueError:
        return 15.0


def current_launch_pending() -> dict[str, Any] | None:
    path = launch_pending_path()
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        started = float(payload.get("startedAt", 0))
        if time.time() - started <= pending_window_seconds() and payload.get("kind") in {"return", "join"}:
            return {"kind": payload["kind"], "startedAt": started}
    except (FileNotFoundError, OSError, ValueError, TypeError, AttributeError):
        pass
    try:
        path.unlink()
    except FileNotFoundError:
        pass
    return None


def mark_launch_pending(kind: str) -> None:
    atomic_write(launch_pending_path(), json.dumps({"kind": kind, "startedAt": time.time()}) + "\n")


def clear_launch_pending() -> None:
    try:
        launch_pending_path().unlink()
    except FileNotFoundError:
        pass


def launch_outcome(process: subprocess.Popen[bytes], target: dict[str, Any] | None, kind: str) -> dict[str, Any]:
    if target:
        clear_launch_pending()
        apply_window_preferences(target["address"], load_preferences())
        return {"ok": True, "action": "launched" if kind == "return" else "join-launched", "windowObserved": True}
    exit_code = process.poll()
    if exit_code is not None and exit_code != 0:
        clear_launch_pending()
        return {"ok": False, "action": "launch-failed", "exitCode": exit_code, "windowObserved": False}
    return {"ok": True, "action": "pending", "pendingKind": kind, "windowObserved": False}


def return_or_launch(_: argparse.Namespace) -> int:
    lock = acquire_action_lock()
    if lock is None:
        return print_json({"ok": True, "action": "busy"})
    with lock:
        windows = game_windows()
        if windows:
            clear_launch_pending()
            # Hyprland's focus history gives the most recently focused candidate.
            target = min(windows, key=lambda item: item["focusHistoryID"] if item["focusHistoryID"] >= 0 else 1_000_000)
            ok = focus_window(target)
            return print_json({"ok": ok, "action": "focused" if ok else "focus-failed", "address": target["address"]})
        pending = current_launch_pending()
        if pending:
            return print_json({"ok": True, "action": "pending", "pendingKind": pending["kind"], "windowObserved": False})
        previous: set[str] = set()
        mark_launch_pending("return")
        process = launch_url(APP_URL)
        target = wait_for_new_window(previous)
        return print_json(launch_outcome(process, target, "return"))


def invitation_url(room: str) -> str:
    if not ROOM_RE.fullmatch(room):
        raise ValueError("room must be a published public Rat Detective room")
    return APP_URL + "?" + urlencode({"preferred": room})


def join_room(args: argparse.Namespace) -> int:
    try:
        url = invitation_url(args.room)
    except ValueError as error:
        return print_json({"ok": False, "error": str(error)})
    lock = acquire_action_lock()
    if lock is None:
        return print_json({"ok": True, "action": "busy"})
    with lock:
        pending = current_launch_pending()
        if pending:
            return print_json({"ok": True, "action": "pending", "pendingKind": pending["kind"], "windowObserved": False})
        previous = {window["address"] for window in game_windows()}
        mark_launch_pending("join")
        process = launch_url(url)
        target = wait_for_new_window(previous)
        outcome = launch_outcome(process, target, "join")
        outcome["url"] = url
        return print_json(outcome)


def desktop_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t")


def desktop_exec_arg(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"').replace("`", "\\`").replace("$", "\\$").replace("%", "%%")
    return f'"{escaped}"'


def install_durable_helper() -> tuple[Path, Path | None]:
    source = Path(__file__).resolve()
    target = helper_path().resolve()
    if not source.is_file():
        raise OSError("Rat Detective source helper is missing")
    source_bytes = source.read_bytes()
    try:
        target_bytes = target.read_bytes()
    except FileNotFoundError:
        target_bytes = None
    previous = None
    if target_bytes != source_bytes:
        target.parent.mkdir(parents=True, exist_ok=True)
        if target_bytes is not None:
            previous = target.with_suffix(".py.previous")
            shutil.copy2(target, previous)
        atomic_write(target, source_bytes.decode("utf-8"), 0o755)
    elif target.exists() and not os.access(target, os.X_OK):
        os.chmod(target, 0o755)
    return target, previous


def install_launcher(args: argparse.Namespace) -> int:
    icon = Path(args.icon).resolve()
    if not icon.is_file():
        return print_json({"ok": False, "error": "Rat Detective launcher icon is missing"})
    try:
        helper, helper_previous = install_durable_helper()
    except (OSError, UnicodeError) as error:
        return print_json({"ok": False, "error": f"could not install durable helper: {error}"})
    target_icon = data_dir() / "rat-detective.png"
    target_icon.parent.mkdir(parents=True, exist_ok=True)
    if target_icon.exists() and target_icon.read_bytes() != icon.read_bytes():
        shutil.copy2(target_icon, target_icon.with_suffix(".png.previous"))
    shutil.copy2(icon, target_icon)
    path = desktop_path()
    entry = "\n".join([
        "[Desktop Entry]", "Version=1.0", f"Name={APP_NAME}", f"Comment={APP_NAME}",
        f"Exec={desktop_exec_arg(str(helper))} return", "Terminal=false", "Type=Application",
        f"Icon={desktop_escape(str(target_icon))}", "StartupNotify=true", f"StartupWMClass={browser_window_class()}", "",
    ])
    try:
        unchanged = path.read_text(encoding="utf-8") == entry
    except OSError:
        unchanged = False
    previous = None if unchanged else backup(path)
    if not unchanged:
        atomic_write(path, entry, 0o755)
    updater = shutil.which("update-desktop-database")
    if updater:
        run([updater, str(path.parent)], timeout=10)
    return print_json({
        "ok": True,
        "launcher": str(path),
        "backup": str(previous) if previous else None,
        "helperBackup": str(helper_previous) if helper_previous else None,
    })


def uninstall_launcher(_: argparse.Namespace) -> int:
    path = desktop_path()
    removed = False
    if path.exists():
        path.unlink()
        removed = True
    for target in (data_dir() / "rat-detective.png", data_dir() / "rat-detective-desktop.py"):
        try:
            target.unlink()
        except FileNotFoundError:
            pass
    updater = shutil.which("update-desktop-database")
    if updater:
        run([updater, str(path.parent)], timeout=10)
    return print_json({"ok": True, "removed": removed})


def rollback_launcher(_: argparse.Namespace) -> int:
    path = desktop_path()
    candidates = sorted(path.parent.glob(path.name + ".rat-detective-backup-*"), reverse=True)
    previous_helper = helper_path().with_suffix(".py.previous")
    previous_icon = (data_dir() / "rat-detective.png").with_suffix(".png.previous")
    restored: list[str] = []
    if candidates:
        backup(path)
        shutil.copy2(candidates[0], path)
        restored.append("launcher")
    if previous_helper.is_file():
        shutil.copy2(previous_helper, helper_path())
        os.chmod(helper_path(), 0o755)
        restored.append("helper")
    if previous_icon.is_file():
        shutil.copy2(previous_icon, data_dir() / "rat-detective.png")
        restored.append("icon")
    if not restored:
        return print_json({"ok": False, "error": "no Rat Detective launcher backup is available"})
    return print_json({"ok": True, "restored": restored})


def bindings_path() -> Path:
    return xdg_path("XDG_CONFIG_HOME", home() / ".config") / "hypr" / "bindings.lua"


def validate_chord(chord: str) -> str:
    normalized = " + ".join(part.strip().upper() for part in chord.split("+") if part.strip())
    if not CHORD_RE.fullmatch(normalized) or "+" not in normalized:
        raise ValueError("shortcut must be a Hyprland chord such as SUPER + SHIFT + R")
    return normalized


def chord_in_use(chord: str, text: str) -> bool:
    escaped = re.escape(chord).replace(r"\ ", r"\s*")
    return re.search(r"(?:o\.bind|hl\.bind)\(\s*[\"']" + escaped + r"[\"']", text, re.I) is not None


def chord_signature(chord: str) -> tuple[int, str]:
    modifier_bits = {
        "SHIFT": 1,
        "CAPS": 2,
        "CTRL": 4,
        "CONTROL": 4,
        "ALT": 8,
        "MOD1": 8,
        "MOD2": 16,
        "MOD3": 32,
        "SUPER": 64,
        "MOD4": 64,
        "MOD5": 128,
    }
    parts = [part.strip().upper() for part in chord.split("+")]
    if len(parts) < 2 or any(not part for part in parts):
        raise ValueError("shortcut must contain modifiers and one key")
    key = parts[-1]
    mask = 0
    for modifier in parts[:-1]:
        if modifier not in modifier_bits:
            raise ValueError(f"unsupported shortcut modifier: {modifier}")
        mask |= modifier_bits[modifier]
    return mask, key


def live_chord_conflict(chord: str) -> tuple[bool, str | None]:
    expected_mask, expected_key = chord_signature(chord)
    try:
        result = run([command("hyprctl"), "binds", "-j"], timeout=5)
        if result.returncode != 0:
            return False, "could not read Hyprland's active shortcuts"
        bindings = json.loads(result.stdout)
        if not isinstance(bindings, list):
            return False, "Hyprland returned an invalid active-shortcut list"
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return False, "could not confirm Hyprland's active shortcuts"
    for binding in bindings:
        if not isinstance(binding, dict):
            continue
        try:
            mask = int(binding.get("modmask", -1))
        except (TypeError, ValueError):
            continue
        key = str(binding.get("key", "")).upper()
        if mask == expected_mask and key == expected_key:
            description = str(binding.get("description", "")).strip()
            detail = f" ({description})" if description else ""
            return False, f"{chord} is already active in Hyprland{detail}; choose a free shortcut"
    return True, None


def validate_hyprland(previous: Path | None, target: Path) -> tuple[bool, str]:
    hyprctl = command("hyprctl")
    try:
        reload_result = run([hyprctl, "reload"], timeout=10)
        errors = run([hyprctl, "configerrors"], timeout=10)
    except (OSError, subprocess.TimeoutExpired) as error:
        return False, str(error)
    message = (reload_result.stderr + "\n" + errors.stdout + "\n" + errors.stderr).strip()
    clean = reload_result.returncode == 0 and errors.returncode == 0 and not message
    if clean:
        return True, ""
    if previous and previous.exists():
        shutil.copy2(previous, target)
    elif target.exists():
        target.unlink()
    try:
        run([hyprctl, "reload"], timeout=10)
    except (OSError, subprocess.TimeoutExpired):
        pass
    return False, message or "Hyprland rejected the shortcut"


def install_shortcut(args: argparse.Namespace) -> int:
    try:
        chord = validate_chord(args.chord)
    except ValueError as error:
        return print_json({"ok": False, "error": str(error)})
    path = bindings_path()
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        text = ""
    if MARKER_START in text or MARKER_END in text:
        return print_json({"ok": False, "error": "Rat Detective shortcut already installed; remove it before choosing another"})
    if chord_in_use(chord, text):
        return print_json({"ok": False, "error": f"{chord} is already bound; choose a free shortcut"})
    try:
        live_free, live_error = live_chord_conflict(chord)
    except ValueError as error:
        return print_json({"ok": False, "error": str(error)})
    if not live_free:
        return print_json({"ok": False, "error": live_error})
    helper = helper_path().resolve()
    if not helper.is_file():
        return print_json({"ok": False, "error": "install or repair the launcher before adding a shortcut"})
    previous = backup(path)
    launch_command = shlex.quote(str(helper)) + " return"
    block = f'{MARKER_START}\no.bind({json.dumps(chord)}, "Rat Detective", {json.dumps(launch_command)})\n{MARKER_END}\n'
    next_text = text + ("" if not text or text.endswith("\n") else "\n") + "\n" + block
    atomic_write(path, next_text)
    valid, error = validate_hyprland(previous, path)
    if not valid:
        return print_json({"ok": False, "error": error, "rolledBack": previous is not None})
    return print_json({"ok": True, "chord": chord, "backup": str(previous) if previous else None})


def remove_shortcut(_: argparse.Namespace) -> int:
    path = bindings_path()
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return print_json({"ok": True, "removed": False})
    pattern = re.compile(r"\n?" + re.escape(MARKER_START) + r"\n.*?" + re.escape(MARKER_END) + r"\n?", re.S)
    if not pattern.search(text):
        return print_json({"ok": True, "removed": False})
    previous = backup(path)
    atomic_write(path, pattern.sub("\n", text, count=1))
    valid, error = validate_hyprland(previous, path)
    if not valid:
        return print_json({"ok": False, "error": error, "rolledBack": True})
    return print_json({"ok": True, "removed": True, "backup": str(previous)})


def screenrecord_dir() -> Path:
    explicit = os.environ.get("OMARCHY_SCREENRECORD_DIR")
    if explicit:
        return Path(explicit)
    user_dirs = xdg_path("XDG_CONFIG_HOME", home() / ".config") / "user-dirs.dirs"
    try:
        text = user_dirs.read_text(encoding="utf-8")
        match = re.search(r'^XDG_VIDEOS_DIR="([^"]+)"', text, re.M)
        if match:
            return Path(match.group(1).replace("$HOME", str(home())))
    except OSError:
        pass
    return home() / "Videos"


def recording_start(_: argparse.Namespace) -> int:
    if "gpu-screen-recorder" in proc_names():
        return print_json({"ok": True, "action": "already-recording"})
    argv = [command("omarchy"), "capture", "screenrecording", "--fullscreen"]
    if load_preferences().get("desktopAudio") is True:
        argv.append("--with-desktop-audio")
    # Microphone capture is intentionally unavailable through this companion.
    result = run(argv, timeout=15)
    return print_json({"ok": result.returncode == 0, "action": "started" if result.returncode == 0 else "start-failed", "error": result.stderr.strip()})


def recording_stop(_: argparse.Namespace) -> int:
    if "gpu-screen-recorder" not in proc_names():
        return print_json({"ok": True, "action": "not-recording"})
    result = run([command("omarchy"), "capture", "screenrecording", "--stop-recording"], timeout=20)
    return print_json({"ok": result.returncode == 0, "action": "stopped" if result.returncode == 0 else "stop-failed", "file": result.stdout.strip(), "error": result.stderr.strip()})


def open_captures(_: argparse.Namespace) -> int:
    path = screenrecord_dir()
    path.mkdir(parents=True, exist_ok=True)
    subprocess.Popen([command("xdg-open"), str(path)], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    return print_json({"ok": True, "path": str(path)})


def link_for_room(room: str | None) -> str:
    return invitation_url(room) if room else APP_URL


def copy_link(args: argparse.Namespace) -> int:
    try:
        link = link_for_room(args.room)
    except ValueError as error:
        return print_json({"ok": False, "error": str(error)})
    try:
        result = subprocess.run([command("wl-copy")], input=link, text=True, capture_output=True, timeout=5)
    except (OSError, subprocess.TimeoutExpired) as error:
        return print_json({"ok": False, "error": str(error)})
    return print_json({"ok": result.returncode == 0, "link": link, "error": result.stderr.strip()})


def notify(args: argparse.Namespace) -> int:
    if dnd_state() == "on":
        return print_json({"ok": True, "action": "suppressed-dnd"})
    if any(window["focused"] for window in game_windows()):
        return print_json({"ok": True, "action": "suppressed-focused"})
    argv = [command("omarchy"), "notification", "send", "--app-name", APP_ID, "-u", "low", "-t", "5000", args.headline]
    if args.body:
        argv.append(args.body)
    argv.extend(["--exec", str(Path(__file__).resolve()), "return"])
    result = run(argv, timeout=10)
    return print_json({"ok": result.returncode == 0, "action": "sent" if result.returncode == 0 else "failed", "error": result.stderr.strip()})


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description="Rat Detective desktop integration")
    sub = root.add_subparsers(dest="command", required=True)
    sub.add_parser("status").set_defaults(func=status)
    sub.add_parser("return").set_defaults(func=return_or_launch)
    join = sub.add_parser("join")
    join.add_argument("room")
    join.set_defaults(func=join_room)
    install = sub.add_parser("install-launcher")
    install.add_argument("--icon", required=True)
    install.set_defaults(func=install_launcher)
    sub.add_parser("uninstall-launcher").set_defaults(func=uninstall_launcher)
    sub.add_parser("rollback-launcher").set_defaults(func=rollback_launcher)
    prefs = sub.add_parser("preferences")
    prefs.add_argument("--workspace", choices=["current"] + [str(i) for i in range(1, 100)])
    prefs.add_argument("--fullscreen", choices=["true", "false"])
    prefs.add_argument("--desktop-audio", choices=["true", "false"])
    prefs.set_defaults(func=save_preferences)
    shortcut = sub.add_parser("shortcut-install")
    shortcut.add_argument("chord")
    shortcut.set_defaults(func=install_shortcut)
    sub.add_parser("shortcut-remove").set_defaults(func=remove_shortcut)
    sub.add_parser("record-start").set_defaults(func=recording_start)
    sub.add_parser("record-stop").set_defaults(func=recording_stop)
    sub.add_parser("open-captures").set_defaults(func=open_captures)
    copied = sub.add_parser("copy-link")
    copied.add_argument("--room")
    copied.set_defaults(func=copy_link)
    notice = sub.add_parser("notify")
    notice.add_argument("headline")
    notice.add_argument("body", nargs="?")
    notice.set_defaults(func=notify)
    return root


def main() -> int:
    args = parser().parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())

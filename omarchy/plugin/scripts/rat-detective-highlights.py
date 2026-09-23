#!/usr/bin/env python3
"""Rat Detective automatic-highlights helper."""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from highlights import paths
from highlights.service import HighlightsService, serve


def acquire_lock() -> object:
    paths.prepare_runtime()
    handle = paths.instance_lock().open("a+")
    try:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError as error:
        handle.close()
        raise SystemExit("highlights helper is already running") from error
    handle.seek(0)
    handle.truncate()
    handle.write(str(os.getpid()))
    handle.flush()
    return handle


def request(payload: dict) -> dict:
    import socket
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.settimeout(8)
    sock.connect(str(paths.control_socket()))
    sock.sendall((json.dumps(payload) + "\n").encode("utf-8"))
    data = b""
    while b"\n" not in data:
        chunk = sock.recv(4096)
        if not chunk:
            break
        data += chunk
    sock.close()
    return json.loads(data.decode("utf-8") or "{}")


def ensure_running(fake: bool = False) -> None:
    if paths.control_socket().exists():
        try:
            request({"version": 1, "type": "status"})
            return
        except OSError:
            pass
    import subprocess
    argv = [sys.executable, str(Path(__file__).resolve()), "serve"]
    if fake:
        argv.append("--fake")
    subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    import time
    for _ in range(40):
        time.sleep(0.05)
        try:
            request({"version": 1, "type": "status"})
            return
        except OSError:
            continue
    raise SystemExit("highlights helper did not start")


def main() -> int:
    parser = argparse.ArgumentParser(description="Rat Detective highlights helper")
    parser.add_argument("command", choices=["serve", "status", "request", "check", "repair", "stop"])
    parser.add_argument("--fake", action="store_true")
    parser.add_argument("--json", dest="payload")
    args = parser.parse_args()
    fake = args.fake or os.environ.get("RAT_DETECTIVE_HIGHLIGHTS_BACKEND") == "fake"
    if args.command == "serve":
        lock = acquire_lock()
        service = HighlightsService(fake=fake)
        try:
            serve(service)
        finally:
            lock.close()
        return 0
    if args.command == "check":
        from highlights.capture import hardware_supported
        ok, detail = hardware_supported() if not fake else (True, "fake")
        print(json.dumps({"ok": ok, "detail": detail}))
        return 0 if ok else 1
    ensure_running(fake)
    if args.command == "status":
        print(json.dumps(request({"version": 1, "type": "status"}), separators=(",", ":")))
        return 0
    if args.command == "repair":
        print(json.dumps(request({"version": 1, "type": "repair"}), separators=(",", ":")))
        return 0
    if args.command == "stop":
        print(json.dumps(request({"version": 1, "type": "shutdown"}), separators=(",", ":")))
        return 0
    payload = json.loads(args.payload or "{}")
    print(json.dumps(request(payload), separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

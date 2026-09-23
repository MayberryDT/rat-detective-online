#!/usr/bin/env python3
"""Stdio adapter between Chromium native messaging and the highlights helper."""

from __future__ import annotations

import json
import os
import socket
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from highlights.framing import read_native_message, write_native_message
from highlights.paths import control_socket
from highlights.protocol import PROTOCOL_VERSION, ProtocolError
from highlights.tuning import MESSAGE_BYTES

def ensure_helper() -> None:
    if control_socket().exists():
        return
    import subprocess
    helper = Path(__file__).with_name("rat-detective-highlights.py")
    subprocess.Popen(
        [sys.executable, str(helper), "serve"],
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    import time
    for _ in range(40):
        time.sleep(0.05)
        if control_socket().exists():
            return

ALLOWED_HOST_NAMES = {"co.animasai.rat_detective_highlights"}


def forward(payload: dict) -> dict:
    payload = {**payload, "channel": "browser"}
    ensure_helper()
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.settimeout(8)
    try:
        sock.connect(str(control_socket()))
        raw = (json.dumps(payload, separators=(",", ":")) + "\n").encode("utf-8")
        if len(raw) > MESSAGE_BYTES:
            return {"version": PROTOCOL_VERSION, "status": "rejected", "reason": "message too large"}
        sock.sendall(raw)
        data = b""
        while b"\n" not in data:
            chunk = sock.recv(4096)
            if not chunk:
                break
            data += chunk
        return json.loads(data.decode("utf-8") or "{}")
    except OSError as error:
        return {"version": PROTOCOL_VERSION, "status": "rejected", "reason": "helper unavailable", "error": str(error)}
    finally:
        sock.close()


def main() -> int:
    origin = sys.argv[1] if len(sys.argv) > 1 else ""
    if origin and not origin.startswith("chrome-extension://"):
        write_native_message({"version": PROTOCOL_VERSION, "status": "rejected", "reason": "invalid caller"})
        return 1
    while True:
        try:
            message = read_native_message()
        except ProtocolError as error:
            write_native_message({"version": PROTOCOL_VERSION, "status": "rejected", "reason": error.reason})
            continue
        if message is None:
            return 0
        write_native_message(forward(message))


if __name__ == "__main__":
    raise SystemExit(main())

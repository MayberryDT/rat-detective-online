#!/usr/bin/env python3
"""Fetch one Dispatch page without exposing an unbounded body to QML."""

from __future__ import annotations

import shutil
import signal
import subprocess
import sys


MAX_RESPONSE_BYTES = 64 * 1024
MAX_TRAILER_BYTES = 256
MAX_OUTPUT_BYTES = MAX_RESPONSE_BYTES + MAX_TRAILER_BYTES
TRAILER_MARKER = b"\n__RAT_HTTP__"
WRITE_OUT = "\n__RAT_HTTP__%{http_code}:%{content_type}"
_active_curl: subprocess.Popen[bytes] | None = None


def _stop(child: subprocess.Popen[bytes]) -> None:
    if child.poll() is not None:
        return
    try:
        child.terminate()
    except ProcessLookupError:
        pass
    try:
        child.wait(timeout=0.25)
    except subprocess.TimeoutExpired:
        try:
            child.kill()
        except ProcessLookupError:
            pass
        child.wait()


def _on_signal(signum: int, _frame: object) -> None:
    if _active_curl is not None:
        _stop(_active_curl)
    raise SystemExit(128 + signum)


def _error(message: str, code: int = 1) -> int:
    # Never pass a remote body, URL, or arbitrary child stderr to QML.
    sys.stderr.write(message[:256] + "\n")
    return code


def fetch(url: str) -> int:
    curl = shutil.which("curl")
    if curl is None:
        return _error("The Dispatch fetch tool is unavailable.", 127)

    try:
        child = subprocess.Popen(
            [
                curl,
                "--silent",
                "--show-error",
                "--max-time",
                "5",
                "--write-out",
                WRITE_OUT,
                "--",
                url,
            ],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            close_fds=True,
        )
    except OSError:
        return _error("The Dispatch fetch tool could not start.", 127)

    global _active_curl
    _active_curl = child
    try:
        assert child.stdout is not None
        # Read only a fixed budget plus one overflow byte. curl's --max-time is
        # the whole-transfer deadline, including slow/drip-fed responses.
        output = child.stdout.read(MAX_OUTPUT_BYTES + 1)
        if len(output) > MAX_OUTPUT_BYTES:
            _stop(child)
            return _error("The Dispatch response exceeded the 64 KiB limit.")

        if child.wait() != 0:
            return _error("The Dispatch request timed out or failed.")

        marker = output.rfind(TRAILER_MARKER)
        if marker >= 0:
            body = output[:marker]
            if len(body) > MAX_RESPONSE_BYTES or len(output) - len(body) > MAX_TRAILER_BYTES:
                return _error("The Dispatch response exceeded the 64 KiB limit.")
        elif len(output) > MAX_RESPONSE_BYTES:
            return _error("The Dispatch response exceeded the 64 KiB limit.")

        # No bytes reach StdioCollector until the complete response is within
        # budget. This also preserves QML's existing status/content-type parse.
        sys.stdout.buffer.write(output)
        sys.stdout.buffer.flush()
        return 0
    except OSError:
        _stop(child)
        return _error("The Dispatch request could not be read.")
    finally:
        if child.poll() is None:
            _stop(child)
        if child.stdout is not None:
            child.stdout.close()
        _active_curl = None


def main(argv: list[str] | None = None) -> int:
    signal.signal(signal.SIGTERM, _on_signal)
    signal.signal(signal.SIGINT, _on_signal)
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 1:
        return _error("Usage: bounded-dispatch-fetch.py URL", 2)
    return fetch(args[0])


if __name__ == "__main__":
    raise SystemExit(main())

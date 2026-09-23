#!/usr/bin/env python3
"""Exercise the packaged Dispatch fetch producer against local HTTP fixtures."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / "scripts" / "bounded-dispatch-fetch.py"
MARKER = b"\n__RAT_HTTP__"
spec = importlib.util.spec_from_file_location("bounded_dispatch_fetch", HELPER)
if spec is None or spec.loader is None:
    raise RuntimeError("cannot load bounded fetch helper")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
MAX_BODY_BYTES = module.MAX_RESPONSE_BYTES


class FixtureServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, _format: str, *_args: object) -> None:
        return

    def _fixed(self, status: int, body: bytes, content_type: str = "application/json") -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _chunked(self, status: int = 200, content_type: str = "application/json") -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()

    def _write_chunk(self, body: bytes) -> None:
        self.wfile.write(f"{len(body):x}\r\n".encode("ascii"))
        self.wfile.write(body + b"\r\n")
        self.wfile.flush()

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        self.close_connection = True
        try:
            if self.path == "/normal":
                self._fixed(200, b'{"rooms":[]}')
            elif self.path == "/exact":
                prefix = b'{"ok":true}'
                self._fixed(200, prefix + (b" " * (MAX_BODY_BYTES - len(prefix))))
            elif self.path == "/over":
                self._fixed(200, b"x" * (MAX_BODY_BYTES + 1))
            elif self.path == "/chunked-over":
                self._chunked()
                chunk = b"x" * 8192
                for _ in range(128):
                    self._write_chunk(chunk)
            elif self.path == "/large-error":
                self._chunked(503, "text/plain")
                chunk = b"error " * 2048
                for _ in range(64):
                    self._write_chunk(chunk)
            elif self.path == "/not-found":
                self._fixed(404, b"missing", "application/json")
            elif self.path == "/legacy-html":
                self._fixed(200, b"<!doctype html><title>legacy</title>", "text/html")
            elif self.path == "/drip":
                self._chunked()
                for _ in range(8):
                    self._write_chunk(b"x")
                    time.sleep(1)
                self.wfile.write(b"0\r\n\r\n")
                self.wfile.flush()
            else:
                self._fixed(404, b"missing", "text/plain")
        except (BrokenPipeError, ConnectionResetError, OSError):
            # The overflow/deadline cases intentionally close the client early.
            return


def run_fetch(base_url: str, path: str, *, env: dict[str, str] | None = None, timeout: float = 8) -> tuple[subprocess.CompletedProcess[bytes], float]:
    started = time.monotonic()
    result = subprocess.run(
        [sys.executable, str(HELPER), base_url + path],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        timeout=timeout,
        check=False,
    )
    return result, time.monotonic() - started


def assert_ok(result: subprocess.CompletedProcess[bytes], message: str) -> None:
    if result.returncode != 0:
        raise AssertionError(f"{message}: exit={result.returncode}, stderr={result.stderr[:512]!r}")


def assert_rejected(result: subprocess.CompletedProcess[bytes], message: str) -> None:
    if result.returncode == 0 or result.stdout:
        raise AssertionError(f"{message}: expected bounded failure, got exit={result.returncode}, stdout={len(result.stdout)} bytes")
    if len(result.stderr) > 512:
        raise AssertionError(f"{message}: helper diagnostic exceeded 512 bytes ({len(result.stderr)})")


def main() -> int:
    server = FixtureServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base_url = f"http://127.0.0.1:{server.server_address[1]}"
    checks: list[dict[str, object]] = []
    try:
        result, elapsed = run_fetch(base_url, "/normal")
        assert_ok(result, "normal response")
        assert result.stdout.startswith(b'{"rooms":[]}') and result.stdout.endswith(MARKER + b"200:application/json")
        checks.append({"case": "normal", "exit": result.returncode, "stdout_bytes": len(result.stdout), "elapsed_s": round(elapsed, 3)})

        result, elapsed = run_fetch(base_url, "/exact")
        assert_ok(result, "exact-limit response")
        body, trailer = result.stdout.rsplit(MARKER, 1)
        assert len(body) == MAX_BODY_BYTES and trailer == b"200:application/json"
        checks.append({"case": "exact_limit", "body_bytes": len(body), "elapsed_s": round(elapsed, 3)})

        result, elapsed = run_fetch(base_url, "/over")
        assert_rejected(result, "one-byte-over response")
        checks.append({"case": "one_byte_over", "exit": result.returncode, "stderr_bytes": len(result.stderr), "elapsed_s": round(elapsed, 3)})

        result, elapsed = run_fetch(base_url, "/chunked-over")
        assert_rejected(result, "chunked overflow")
        assert elapsed < 3.0, f"chunked overflow was not stopped promptly ({elapsed:.3f}s)"
        checks.append({"case": "chunked_overflow", "exit": result.returncode, "stderr_bytes": len(result.stderr), "elapsed_s": round(elapsed, 3)})

        result, elapsed = run_fetch(base_url, "/large-error")
        assert_rejected(result, "large error response")
        checks.append({"case": "large_error_body", "exit": result.returncode, "stderr_bytes": len(result.stderr), "elapsed_s": round(elapsed, 3)})

        result, elapsed = run_fetch(base_url, "/not-found")
        assert_ok(result, "404 metadata")
        assert result.stdout.endswith(MARKER + b"404:application/json")
        checks.append({"case": "404_fallback_metadata", "exit": result.returncode, "elapsed_s": round(elapsed, 3)})

        result, elapsed = run_fetch(base_url, "/legacy-html")
        assert_ok(result, "HTML fallback metadata")
        assert result.stdout.endswith(MARKER + b"200:text/html")
        checks.append({"case": "html_fallback_metadata", "exit": result.returncode, "elapsed_s": round(elapsed, 3)})

        result, elapsed = run_fetch(base_url, "/drip", timeout=8)
        assert_rejected(result, "drip-fed response deadline")
        assert 4.0 <= elapsed < 7.5, f"curl's five-second whole-transfer deadline changed ({elapsed:.3f}s)"
        checks.append({"case": "drip_deadline", "exit": result.returncode, "stderr_bytes": len(result.stderr), "elapsed_s": round(elapsed, 3)})

        with tempfile.TemporaryDirectory(prefix="rat-detective-fake-curl-") as directory:
            fake_curl = Path(directory) / "curl"
            fake_curl.write_text(
                "#!/usr/bin/python3\n"
                "import os, sys\n"
                "os.write(2, b'E' * 1000000)\n"
                "os.write(1, b'{\\\"ok\\\":true}\\n__RAT_HTTP__200:application/json')\n",
                encoding="utf-8",
            )
            fake_curl.chmod(0o755)
            child_env = os.environ.copy()
            child_env["PATH"] = directory + os.pathsep + child_env.get("PATH", "")
            result, elapsed = run_fetch(base_url, "/unused", env=child_env)
            assert_ok(result, "oversized child stderr")
            assert result.stdout.endswith(MARKER + b"200:application/json")
            assert len(result.stderr) <= 512
            checks.append({"case": "oversized_child_stderr", "exit": result.returncode, "helper_stderr_bytes": len(result.stderr), "elapsed_s": round(elapsed, 3)})

        with tempfile.TemporaryDirectory(prefix="rat-detective-cancel-curl-") as directory:
            pid_file = Path(directory) / "curl.pid"
            fake_curl = Path(directory) / "curl"
            fake_curl.write_text(
                "#!/usr/bin/python3\n"
                "import pathlib, os, time\n"
                f"pathlib.Path({str(pid_file)!r}).write_text(str(os.getpid()))\n"
                "while True: time.sleep(1)\n",
                encoding="utf-8",
            )
            fake_curl.chmod(0o755)
            child_env = os.environ.copy()
            child_env["PATH"] = directory + os.pathsep + child_env.get("PATH", "")
            started = time.monotonic()
            helper = subprocess.Popen(
                [sys.executable, str(HELPER), base_url + "/unused"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=child_env,
            )
            deadline = time.monotonic() + 2
            while not pid_file.exists() and time.monotonic() < deadline:
                time.sleep(0.02)
            assert pid_file.exists(), "fake curl did not start"
            curl_pid = int(pid_file.read_text(encoding="utf-8"))
            helper.terminate()
            helper_out, helper_err = helper.communicate(timeout=2)
            assert helper.returncode == 128 + signal.SIGTERM
            assert not helper_out and len(helper_err) <= 512
            for _ in range(20):
                try:
                    os.kill(curl_pid, 0)
                except ProcessLookupError:
                    break
                time.sleep(0.05)
            else:
                raise AssertionError(f"curl child {curl_pid} survived helper cancellation")
            checks.append({"case": "cancel_reaps_child", "exit": helper.returncode, "helper_stderr_bytes": len(helper_err), "elapsed_s": round(time.monotonic() - started, 3)})

        report = {
            "suite": "dispatch-fetch-e2e",
            "status": "passed",
            "max_response_bytes": MAX_BODY_BYTES,
            "helper_sha256": hashlib.sha256(HELPER.read_bytes()).hexdigest(),
            "test_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "checks": checks,
        }
        print(json.dumps(report, sort_keys=True, separators=(",", ":")))
        return 0
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


if __name__ == "__main__":
    raise SystemExit(main())

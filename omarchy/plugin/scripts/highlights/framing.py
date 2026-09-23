"""Chrome native-messaging length-prefixed JSON framing."""

from __future__ import annotations

import json
import struct
import sys
from typing import Any, BinaryIO, TextIO

from .protocol import MESSAGE_BYTES, ProtocolError, parse_json_bytes


def read_native_message(stream: BinaryIO | None = None) -> dict[str, Any] | None:
    handle = stream or sys.stdin.buffer
    header = handle.read(4)
    if len(header) < 4:
        return None
    length = struct.unpack("<I", header)[0]
    if length > MESSAGE_BYTES:
        handle.read(min(length, MESSAGE_BYTES + 1))
        raise ProtocolError("message too large")
    body = handle.read(length)
    if len(body) < length:
        raise ProtocolError("truncated native message")
    return parse_json_bytes(body)


def write_native_message(payload: dict[str, Any], stream: BinaryIO | None = None) -> None:
    handle = stream or sys.stdout.buffer
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    if len(raw) > MESSAGE_BYTES:
        raw = json.dumps({"status": "rejected", "reason": "reply too large"}).encode("utf-8")
    handle.write(struct.pack("<I", len(raw)))
    handle.write(raw)
    handle.flush()

"""Versioned message validation for the browser bridge and helper socket."""

from __future__ import annotations

import math
import re
import uuid
from typing import Any

from .tuning import (
    DETECTOR_VERSION,
    MARKER_BURST,
    MARKERS_PER_SECOND,
    MAX_MERGED_SECONDS,
    MESSAGE_BYTES,
    PROTOCOL_VERSION,
)

TITLE_KEYS = frozenset({
    "round-win",
    "triple-kill",
    "double-kill",
    "paperwork-delivered",
    "last-second-steal",
    "launcher-escape",
    "spectacular-launch",
    "local-chaos-death",
    "visible-pileup",
    "manual-save",
    "paperwork-in-orbit",
})
MARKER_KINDS = TITLE_KEYS
BROWSER_TYPES = frozenset({"hello", "session-start", "heartbeat", "marker", "session-end", "ping"})
HELPER_TYPES = frozenset({
    "hello", "status", "enable", "disable", "resume", "setup-begin", "setup-confirm",
    "setup-cancel", "arm-capture", "save-manual", "lease-renew", "list-clips", "get-clip", "rename-clip",
    "favorite-clip", "delete-clip", "undo-delete", "trim-clip", "reveal-clip",
    "list-sessions", "get-reel", "edit-reel", "regenerate-reel", "export-clip",
    "export-reel", "cancel-job", "set-settings", "repair", "shutdown", "ping",
})
ID_RE = re.compile(r"^[A-Za-z0-9._:-]{8,80}$")
SAFE_TEXT_RE = re.compile(r"^[\w .,'!?:;+\-()\[\]#/]{1,80}$", re.UNICODE)
PRODUCTION_ORIGINS = frozenset({"https://ratdetective.online"})


class ProtocolError(ValueError):
    def __init__(self, reason: str, code: str = "rejected"):
        super().__init__(reason)
        self.reason = reason
        self.code = code


def new_id() -> str:
    return str(uuid.uuid4())


def is_finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def require_id(value: Any, name: str) -> str:
    if not isinstance(value, str) or not ID_RE.fullmatch(value):
        raise ProtocolError(f"invalid {name}")
    return value


def require_text(value: Any, name: str, *, optional: bool = False) -> str | None:
    if value is None and optional:
        return None
    if not isinstance(value, str) or not value or len(value) > 80 or not SAFE_TEXT_RE.fullmatch(value):
        raise ProtocolError(f"invalid {name}")
    return value


def parse_json_bytes(raw: bytes) -> dict[str, Any]:
    if len(raw) > MESSAGE_BYTES:
        raise ProtocolError("message too large", "rejected")
    import json
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as error:
        raise ProtocolError("unreadable message") from error
    if not isinstance(payload, dict):
        raise ProtocolError("message must be an object")
    return payload


def validate_browser_envelope(payload: dict[str, Any]) -> dict[str, Any]:
    version = payload.get("version")
    if version != PROTOCOL_VERSION:
        raise ProtocolError("incompatible protocol version", "incompatible")
    message_type = payload.get("type")
    if message_type not in BROWSER_TYPES:
        raise ProtocolError("unknown message type")
    message_id = require_id(payload.get("messageId"), "messageId")
    sequence = payload.get("sequence")
    if not is_finite_number(sequence) or sequence < 0 or sequence > 1_000_000_000:
        raise ProtocolError("invalid sequence")
    session_id = payload.get("sessionId")
    document_epoch = payload.get("documentEpoch")
    if message_type in {"hello", "ping"}:
        if session_id is not None:
            require_id(session_id, "sessionId")
        if document_epoch is not None:
            require_id(document_epoch, "documentEpoch")
    else:
        require_id(session_id, "sessionId")
        require_id(document_epoch, "documentEpoch")
    presented = payload.get("presentedAtMs")
    if presented is not None and (not is_finite_number(presented) or presented < 0 or presented > 1e12):
        raise ProtocolError("invalid presentedAtMs")
    helper_now = payload.get("helperNowMs")
    if helper_now is not None and (not is_finite_number(helper_now) or helper_now < 0):
        raise ProtocolError("invalid helperNowMs")
    if message_type == "marker":
        return _validate_marker(payload, message_id, int(sequence))
    if message_type == "session-start":
        origin = payload.get("origin")
        if not isinstance(origin, str) or origin not in PRODUCTION_ORIGINS and not _dev_origin(origin):
            raise ProtocolError("unapproved origin")
        if payload.get("observing") is True:
            raise ProtocolError("observers are not eligible")
        if payload.get("joined") is not True:
            raise ProtocolError("no joined human player")
    return {
        "version": PROTOCOL_VERSION,
        "type": message_type,
        "messageId": message_id,
        "sessionId": session_id,
        "documentEpoch": document_epoch,
        "sequence": int(sequence),
        "presentedAtMs": float(presented) if presented is not None else None,
        "helperNowMs": float(helper_now) if helper_now is not None else None,
        "origin": payload.get("origin"),
        "joined": payload.get("joined") is True,
        "observing": payload.get("observing") is True,
        "payload": payload,
    }


def _dev_origin(origin: str) -> bool:
    return origin in {"http://127.0.0.1:5174", "http://127.0.0.1:5175", "http://127.0.0.1:5193", "http://localhost:5174"}


def _validate_marker(payload: dict[str, Any], message_id: str, sequence: int) -> dict[str, Any]:
    kind = payload.get("kind")
    if kind not in MARKER_KINDS:
        raise ProtocolError("unknown marker kind")
    title_key = payload.get("titleKey", kind)
    if title_key not in TITLE_KEYS:
        raise ProtocolError("unknown title key")
    score = payload.get("score")
    if not is_finite_number(score) or score < 0 or score > 100:
        raise ProtocolError("invalid score")
    pre_ms = payload.get("preMs")
    post_ms = payload.get("postMs")
    for name, value in (("preMs", pre_ms), ("postMs", post_ms)):
        if not is_finite_number(value) or value < 0 or value > MAX_MERGED_SECONDS * 1000:
            raise ProtocolError(f"invalid {name}")
    presented = payload.get("presentedAtMs")
    if not is_finite_number(presented) or presented < 0:
        raise ProtocolError("invalid presentedAtMs")
    marker_id = require_id(payload.get("id"), "id")
    round_id = require_id(payload.get("roundId"), "roundId")
    metadata = payload.get("metadata")
    if metadata is None:
        metadata = {}
    if not isinstance(metadata, dict) or len(str(metadata)) > 1024:
        raise ProtocolError("invalid metadata")
    return {
        "version": PROTOCOL_VERSION,
        "type": "marker",
        "messageId": message_id,
        "sessionId": payload.get("sessionId"),
        "documentEpoch": payload.get("documentEpoch"),
        "sequence": sequence,
        "id": marker_id,
        "roundId": round_id,
        "kind": kind,
        "titleKey": title_key,
        "score": int(score),
        "preMs": int(pre_ms),
        "postMs": int(post_ms),
        "presentedAtMs": float(presented),
        "detectorVersion": int(payload.get("detectorVersion") or DETECTOR_VERSION),
        "metadata": metadata,
    }


def clamp_interval(pre_ms: int, post_ms: int) -> tuple[int, int]:
    pre_ms = max(0, min(int(pre_ms), MAX_MERGED_SECONDS * 1000))
    post_ms = max(0, min(int(post_ms), MAX_MERGED_SECONDS * 1000))
    if pre_ms + post_ms > MAX_MERGED_SECONDS * 1000:
        post_ms = max(0, MAX_MERGED_SECONDS * 1000 - pre_ms)
    return pre_ms, post_ms


def reply(message_id: str, status: str, reason: str = "", **extra: Any) -> dict[str, Any]:
    payload = {"version": PROTOCOL_VERSION, "messageId": message_id, "status": status, "reason": reason}
    payload.update(extra)
    return payload


def validate_helper_request(payload: dict[str, Any]) -> dict[str, Any]:
    version = payload.get("version", PROTOCOL_VERSION)
    if version != PROTOCOL_VERSION:
        raise ProtocolError("incompatible protocol version", "incompatible")
    message_type = payload.get("type")
    if message_type not in HELPER_TYPES:
        raise ProtocolError("unknown helper request")
    request_id = payload.get("id") or new_id()
    if not isinstance(request_id, str) or len(request_id) > 80:
        raise ProtocolError("invalid request id")
    return {"type": message_type, "id": request_id, "payload": payload}


class RateLimiter:
    def __init__(self, per_second: int = MARKERS_PER_SECOND, burst: int = MARKER_BURST):
        self.per_second = per_second
        self.burst = burst
        self.tokens = burst
        self.updated_at = 0.0

    def allow(self, now: float) -> bool:
        elapsed = max(0.0, now - self.updated_at)
        self.tokens = min(self.burst, self.tokens + elapsed * self.per_second)
        self.updated_at = now
        if self.tokens < 1:
            return False
        self.tokens -= 1
        return True

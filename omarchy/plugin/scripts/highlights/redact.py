"""Redact GPU Screen Recorder restoration tokens from diagnostics."""

from __future__ import annotations

import re

TOKEN_RE = re.compile(
    r"(restore[_-]?token|portal[_-]?session[_-]?token|restoration token)([=: ]+)(\S+)",
    re.IGNORECASE,
)
HEX_TOKEN_RE = re.compile(r"\b[0-9a-f]{32,}\b", re.IGNORECASE)


def redact_recorder_text(text: str) -> str:
    if not text:
        return ""
    cleaned = TOKEN_RE.sub(r"\1\2[redacted]", text)
    return HEX_TOKEN_RE.sub("[redacted-token]", cleaned)


def classify_recorder_line(line: str) -> str | None:
    """Return a safe diagnostic fragment, or None to drop the line."""
    lowered = line.lower()
    if "restore" in lowered and "token" in lowered:
        return "recorder: restoration token present [redacted]"
    if "portal" in lowered and "token" in lowered:
        return "recorder: portal token log suppressed"
    if len(line) > 400:
        return line[:200] + "…"
    return line.strip()

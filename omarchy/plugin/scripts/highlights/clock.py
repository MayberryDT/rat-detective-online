"""Map browser presentation time onto helper monotonic time."""

from __future__ import annotations

import time
from dataclasses import dataclass, field

from .tuning import PING_REFRESH_SECONDS, TIMING_DEGRADED_MS


def monotonic_ms() -> float:
    return time.monotonic() * 1000


def wall_ms() -> float:
    return time.time() * 1000


@dataclass
class ClockMap:
    samples: list[tuple[float, float, float]] = field(default_factory=list)
    offset_ms: float | None = None
    rtt_ms: float | None = None
    last_refresh_ms: float = 0
    degraded: bool = False
    last_helper_now: float = 0
    last_browser_now: float | None = None

    def ping_payload(self, message_id: str) -> dict[str, float | str]:
        return {"type": "ping", "messageId": message_id, "helperNowMs": monotonic_ms()}

    def observe(self, helper_sent_ms: float, browser_ms: float, helper_recv_ms: float) -> None:
        rtt = helper_recv_ms - helper_sent_ms
        if rtt < 0 or rtt > 2000:
            return
        offset = browser_ms - (helper_sent_ms + rtt / 2)
        # A low-RTT startup sample must not pin calibration for the lifetime
        # of this helper. Keep at most three refresh periods of observations.
        cutoff = helper_recv_ms - 3 * PING_REFRESH_SECONDS * 1000
        self.samples = [item for item in self.samples if item[2] >= cutoff]
        self.samples.append((rtt, offset, helper_recv_ms))
        self.samples = sorted(self.samples, key=lambda item: item[0])[:8]
        if not self.samples:
            return
        best = self.samples[: min(3, len(self.samples))]
        self.rtt_ms = sum(item[0] for item in best) / len(best)
        self.offset_ms = sum(item[1] for item in best) / len(best)
        self.degraded = (self.rtt_ms or 0) > TIMING_DEGRADED_MS
        self.last_refresh_ms = helper_recv_ms
        self.last_helper_now = helper_recv_ms
        self.last_browser_now = browser_ms

    def needs_refresh(self, now_ms: float) -> bool:
        return self.offset_ms is None or now_ms - self.last_refresh_ms >= PING_REFRESH_SECONDS * 1000

    def to_helper(self, presented_at_ms: float) -> tuple[float, bool]:
        if self.offset_ms is None:
            return monotonic_ms(), True
        helper_time = presented_at_ms - self.offset_ms
        return helper_time, self.degraded

    def discontinuity(self, helper_now: float, browser_now: float | None) -> bool:
        if self.last_helper_now and helper_now + 5 < self.last_helper_now:
            return True
        if browser_now is not None and self.last_browser_now is not None:
            if browser_now + 5 < self.last_browser_now:
                return True
            if browser_now - self.last_browser_now > 10_000 and helper_now - self.last_helper_now < 2_000:
                return True
        self.last_helper_now = helper_now
        if browser_now is not None:
            self.last_browser_now = browser_now
        return False

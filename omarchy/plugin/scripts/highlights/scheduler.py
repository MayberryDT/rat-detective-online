"""Merge highlight intervals against a rolling replay buffer."""

from __future__ import annotations

from dataclasses import dataclass, field

from .protocol import new_id
from .tuning import (
    BUFFER_SECONDS,
    IN_FLIGHT_SAVES,
    MAX_MERGED_SECONDS,
    MERGE_GAP_SECONDS,
    PENDING_INTERVAL_LIMIT,
    RATE_LIMIT_CLIPS,
    RATE_LIMIT_WINDOW_SECONDS,
    SAFETY_SECONDS,
)


@dataclass(order=True)
class PendingInterval:
    score: int
    start_ms: float
    end_ms: float
    event_ms: float
    title_key: str
    kind: str
    marker_ids: list[str] = field(compare=False, default_factory=list)
    truncated_start: bool = False
    manual: bool = False
    created_at_ms: float = 0
    job_id: str = field(compare=False, default="")
    session_id: str = field(compare=False, default="")
    document_epoch: str = field(compare=False, default="")
    capture_epoch: str = field(compare=False, default="")


@dataclass
class SaveRequest:
    seconds: float
    interval: PendingInterval
    requested_start_ms: float
    requested_end_ms: float


class IntervalScheduler:
    def __init__(self) -> None:
        self.pending: list[PendingInterval] = []
        self.in_flight = 0
        self.saves: list[tuple[float, bool]] = []
        self.coverage_start_ms: float | None = None
        self.epoch_id: str | None = None
        self.missed: list[str] = []
        self.last_dispatch_missed: list[str] = []

    def reset_epoch(self, epoch_id: str, now_ms: float) -> None:
        self.pending.clear()
        self.coverage_start_ms = now_ms
        self.epoch_id = epoch_id
        self.missed.clear()

    def coverage_start(self, now_ms: float) -> float:
        earliest = now_ms - BUFFER_SECONDS * 1000
        if self.coverage_start_ms is None:
            return earliest
        return max(earliest, self.coverage_start_ms)

    def accept(
        self,
        *,
        now_ms: float,
        event_ms: float,
        pre_ms: int,
        post_ms: int,
        score: int,
        title_key: str,
        kind: str,
        marker_id: str,
        manual: bool = False,
        session_id: str = "",
        document_epoch: str = "",
        capture_epoch: str = "",
    ) -> str:
        if not manual and not self._rate_ok(now_ms):
            self.missed.append(marker_id)
            return "rate-limited"
        available_start = self.coverage_start(now_ms)
        start = max(event_ms - pre_ms, available_start)
        end = event_ms + post_ms
        deadline = now_ms - SAFETY_SECONDS * 1000 + BUFFER_SECONDS * 1000
        if end > deadline:
            end = deadline
        if end - start < 400:
            self.missed.append(marker_id)
            return "missed"
        interval = PendingInterval(
            score=-score,
            start_ms=start,
            end_ms=end,
            event_ms=event_ms,
            title_key=title_key,
            kind=kind,
            marker_ids=[marker_id],
            truncated_start=start > event_ms - pre_ms,
            manual=manual,
            created_at_ms=now_ms,
            job_id=new_id(),
            session_id=session_id,
            document_epoch=document_epoch,
            capture_epoch=capture_epoch,
        )
        interval.score = score
        merged = self._merge(interval)
        if merged is None:
            self.missed.append(marker_id)
            return "queue-full"
        return "accepted"

    def _merge(self, incoming: PendingInterval) -> PendingInterval | None:
        keep: list[PendingInterval] = []
        current = incoming
        for existing in self.pending:
            if existing.end_ms + MERGE_GAP_SECONDS * 1000 < current.start_ms or current.end_ms + MERGE_GAP_SECONDS * 1000 < existing.start_ms:
                keep.append(existing)
                continue
            union_start = min(existing.start_ms, current.start_ms)
            union_end = max(existing.end_ms, current.end_ms)
            if union_end - union_start > MAX_MERGED_SECONDS * 1000:
                keep.append(existing)
                continue
            current = PendingInterval(
                score=max(existing.score, current.score),
                start_ms=union_start,
                end_ms=union_end,
                event_ms=existing.event_ms if existing.score >= current.score else current.event_ms,
                title_key=existing.title_key if existing.score >= current.score else current.title_key,
                kind=existing.kind if existing.score >= current.score else current.kind,
                marker_ids=list(dict.fromkeys(existing.marker_ids + current.marker_ids)),
                truncated_start=existing.truncated_start or current.truncated_start,
                manual=existing.manual or current.manual,
                created_at_ms=min(existing.created_at_ms, current.created_at_ms),
                job_id=existing.job_id or current.job_id,
                session_id=existing.session_id or current.session_id,
                document_epoch=existing.document_epoch or current.document_epoch,
                capture_epoch=existing.capture_epoch or current.capture_epoch,
            )
        keep.append(current)
        keep.sort(key=lambda item: (-item.score, item.created_at_ms, item.marker_ids[0] if item.marker_ids else ""))
        if len(keep) > PENDING_INTERVAL_LIMIT:
            dropped = keep[PENDING_INTERVAL_LIMIT:]
            keep = keep[:PENDING_INTERVAL_LIMIT]
            for item in dropped:
                self.missed.extend(item.marker_ids)
        self.pending = keep
        return current

    def _rate_ok(self, now_ms: float) -> bool:
        window = now_ms - RATE_LIMIT_WINDOW_SECONDS * 1000
        self.saves = [item for item in self.saves if item[0] >= window]
        automatic = [item for item in self.saves if not item[1]]
        return len(automatic) < RATE_LIMIT_CLIPS

    def due(self, now_ms: float) -> list[PendingInterval]:
        ready = [item for item in self.pending if item.end_ms <= now_ms]
        ready.sort(key=lambda item: (-item.score, item.created_at_ms))
        return ready

    def dispatch(self, now_ms: float) -> SaveRequest | None:
        self.last_dispatch_missed = []
        if self.in_flight >= IN_FLIGHT_SAVES:
            return None
        due = self.due(now_ms)
        if not due:
            return None
        interval = due[0]
        available_start = self.coverage_start(now_ms)
        start = max(interval.start_ms, available_start)
        if interval.end_ms - start < 400:
            self.pending = [item for item in self.pending if item is not interval]
            self.missed.extend(interval.marker_ids)
            self.last_dispatch_missed = list(interval.marker_ids)
            return None
        seconds = max(0.5, (now_ms - start) / 1000)
        seconds = min(seconds, BUFFER_SECONDS - 0.25)
        self.pending = [item for item in self.pending if item is not interval]
        self.in_flight += 1
        self.saves.append((now_ms, interval.manual))
        interval.start_ms = start
        if not interval.job_id:
            interval.job_id = new_id()
        return SaveRequest(seconds=seconds, interval=interval, requested_start_ms=start, requested_end_ms=now_ms)

    def finish_save(self) -> None:
        self.in_flight = max(0, self.in_flight - 1)

    def seal_all(self, now_ms: float) -> None:
        for item in self.pending:
            item.end_ms = min(item.end_ms, now_ms)

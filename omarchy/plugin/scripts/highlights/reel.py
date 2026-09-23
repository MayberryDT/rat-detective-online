"""Deterministic session-reel ranking."""

from __future__ import annotations

from dataclasses import dataclass

from .tuning import (
    REEL_MAX_MOMENTS,
    REEL_MAX_SECONDS,
    REEL_PHYSICAL_MAX_SECONDS,
    REEL_POST_SECONDS,
    REEL_PRE_SECONDS,
    REEL_RANKING_VERSION,
)

PHYSICAL_KINDS = frozenset({
    "spectacular-launch",
    "local-chaos-death",
    "visible-pileup",
    "launcher-escape",
    "paperwork-in-orbit",
})
ORDINARY_KINDS = frozenset({
    "double-kill",
    "triple-kill",
    "paperwork-delivered",
    "spectacular-launch",
    "visible-pileup",
    "local-chaos-death",
    "launcher-escape",
})


@dataclass(frozen=True)
class ReelCandidate:
    clip_id: str
    marker_ids: tuple[str, ...]
    epoch: str
    score: int
    event_ms: float
    start_ms: float
    end_ms: float
    kind: str
    duration_ms: int


@dataclass(frozen=True)
class ReelItem:
    clip_id: str
    trim_in_ms: int
    trim_out_ms: int
    marker_ids: tuple[str, ...]
    score: int
    kind: str


def build_reel(candidates: list[ReelCandidate]) -> list[ReelItem]:
    collapsed: list[ReelCandidate] = []
    for candidate in sorted(candidates, key=lambda item: (-item.score, item.event_ms, item.clip_id)):
        start, end = _window(candidate)
        shaped = ReelCandidate(
            clip_id=candidate.clip_id,
            marker_ids=candidate.marker_ids,
            epoch=candidate.epoch,
            score=candidate.score,
            event_ms=candidate.event_ms,
            start_ms=candidate.start_ms + start,
            end_ms=candidate.start_ms + end,
            kind=candidate.kind,
            duration_ms=int(end - start),
        )
        overlap = False
        for existing in collapsed:
            if existing.epoch != shaped.epoch:
                continue
            if set(existing.marker_ids) & set(shaped.marker_ids) or _overlaps(existing, shaped):
                overlap = True
                break
        if overlap:
            continue
        collapsed.append(shaped)
    ranked = sorted(collapsed, key=lambda item: (-item.score, item.event_ms, item.clip_id))
    selected: list[ReelCandidate] = []
    used_kinds: dict[str, int] = {}
    total = 0
    for candidate in ranked:
        kind_count = used_kinds.get(candidate.kind, 0)
        if candidate.kind in ORDINARY_KINDS and candidate.kind != "round-win" and kind_count >= 2:
            alternatives = [item for item in ranked if item not in selected and item.kind != candidate.kind]
            if alternatives:
                continue
        if candidate.kind != "round-win" and total + candidate.duration_ms > REEL_MAX_SECONDS * 1000:
            continue
        if len(selected) >= REEL_MAX_MOMENTS:
            break
        selected.append(candidate)
        used_kinds[candidate.kind] = kind_count + 1
        total += candidate.duration_ms
    selected.sort(key=lambda item: (item.event_ms, item.clip_id))
    return [
        ReelItem(
            clip_id=item.clip_id,
            trim_in_ms=max(0, int(item.start_ms)),
            trim_out_ms=int(item.end_ms),
            marker_ids=item.marker_ids,
            score=item.score,
            kind=item.kind,
        )
        for item in selected
    ]


def _window(candidate: ReelCandidate) -> tuple[float, float]:
    pre = REEL_PHYSICAL_MAX_SECONDS if candidate.kind in PHYSICAL_KINDS else REEL_PRE_SECONDS
    start = max(candidate.start_ms, candidate.event_ms - pre * 1000)
    end = min(candidate.end_ms, candidate.event_ms + REEL_POST_SECONDS * 1000)
    if candidate.kind in PHYSICAL_KINDS:
        end = min(candidate.end_ms, start + REEL_PHYSICAL_MAX_SECONDS * 1000)
    if end <= start:
        end = min(candidate.end_ms, start + 1000)
    return start - candidate.start_ms, end - candidate.start_ms


def _overlaps(left: ReelCandidate, right: ReelCandidate) -> bool:
    return left.start_ms < right.end_ms and right.start_ms < left.end_ms


def ranking_version() -> int:
    return REEL_RANKING_VERSION

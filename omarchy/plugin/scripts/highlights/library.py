"""SQLite catalog, retention, trash and path-safe clip publication."""

from __future__ import annotations

import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any

from . import paths
from .protocol import new_id, require_text
from .reel import ReelCandidate, ReelItem, build_reel, ranking_version
from .tuning import (
    LOW_SPACE_RESERVE_BYTES,
    REEL_DRAFT_EXPIRE_SECONDS,
    STORAGE_BUDGET_BYTES,
    TRASH_EXPIRE_SECONDS,
)

SCHEMA_VERSION = 4
JOURNAL_LIMIT = 200


class Library:
    def __init__(self, catalog: Path | None = None, media_root: Path | None = None):
        paths.prepare_state()
        self.catalog = catalog or paths.catalog_path()
        self.media_root = media_root or paths.videos_root()
        self.media_root.mkdir(parents=True, exist_ok=True)
        # Media, audio probes and status reads share this connection. Reusing
        # cached statements across threads can return empty/malformed rows.
        self.conn = sqlite3.connect(self.catalog, isolation_level=None, check_same_thread=False, cached_statements=0)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.conn.execute("PRAGMA journal_mode=WAL")
        self._migrate()

    def close(self) -> None:
        self.conn.close()

    def _migrate(self) -> None:
        self.conn.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at REAL NOT NULL)")
        current = self.conn.execute("SELECT COALESCE(MAX(version),0) FROM schema_migrations").fetchone()[0]
        if current < 1:
            self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                started_at REAL NOT NULL,
                ended_at REAL,
                capture_epoch TEXT,
                status TEXT NOT NULL DEFAULT 'open'
            );
            CREATE TABLE IF NOT EXISTS clips (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                capture_epoch TEXT NOT NULL,
                relative_path TEXT NOT NULL,
                created_at REAL NOT NULL,
                duration_ms INTEGER NOT NULL,
                requested_start_ms INTEGER,
                requested_end_ms INTEGER,
                actual_start_ms INTEGER,
                actual_end_ms INTEGER,
                profile TEXT NOT NULL,
                score INTEGER NOT NULL,
                favorite INTEGER NOT NULL DEFAULT 0,
                title TEXT NOT NULL,
                title_key TEXT NOT NULL,
                kind TEXT NOT NULL,
                detector_version INTEGER NOT NULL,
                trim_in_ms INTEGER NOT NULL DEFAULT 0,
                trim_out_ms INTEGER,
                bytes INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL,
                truncated INTEGER NOT NULL DEFAULT 0,
                uncertainty_ms INTEGER NOT NULL DEFAULT 0,
                deleted_at REAL
            );
            CREATE TABLE IF NOT EXISTS markers (
                id TEXT PRIMARY KEY,
                clip_id TEXT,
                session_id TEXT,
                kind TEXT NOT NULL,
                title_key TEXT NOT NULL,
                score INTEGER NOT NULL,
                presented_at_ms REAL NOT NULL,
                event_helper_ms REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS reel_drafts (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                ranking_version INTEGER NOT NULL,
                user_edited INTEGER NOT NULL DEFAULT 0,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS reel_items (
                draft_id TEXT NOT NULL,
                position INTEGER NOT NULL,
                clip_id TEXT NOT NULL,
                trim_in_ms INTEGER NOT NULL,
                trim_out_ms INTEGER NOT NULL,
                PRIMARY KEY (draft_id, position)
            );
            CREATE TABLE IF NOT EXISTS operations (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                detail TEXT
            );
        """)
            self.conn.execute("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)", (1, time.time()))
            current = 1
        if current < 2:
            for column, definition in (
                ("event_offset_ms", "INTEGER NOT NULL DEFAULT 0"),
                ("capture_start_ms", "INTEGER NOT NULL DEFAULT 0"),
                ("capture_end_ms", "INTEGER NOT NULL DEFAULT 0"),
            ):
                try:
                    self.conn.execute(f"ALTER TABLE clips ADD COLUMN {column} {definition}")
                except sqlite3.OperationalError:
                    pass
            self.conn.execute("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)", (2, time.time()))
            current = 2
        if current < 3:
            self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS marker_journal (
                id TEXT PRIMARY KEY,
                message_id TEXT,
                job_id TEXT,
                session_id TEXT,
                document_epoch TEXT,
                capture_epoch TEXT,
                kind TEXT,
                round_id TEXT,
                presented_at_ms REAL,
                helper_received_ms REAL,
                event_helper_ms REAL,
                pre_ms INTEGER,
                post_ms INTEGER,
                stage TEXT NOT NULL,
                reason TEXT,
                eligibility TEXT,
                save_attempt INTEGER NOT NULL DEFAULT 0,
                output_path TEXT,
                probe TEXT,
                clip_id TEXT,
                merged_ids TEXT,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS save_jobs (
                id TEXT PRIMARY KEY,
                marker_ids TEXT NOT NULL,
                session_id TEXT,
                document_epoch TEXT,
                capture_epoch TEXT,
                status TEXT NOT NULL,
                seconds REAL,
                event_ms REAL,
                start_ms REAL,
                end_ms REAL,
                output_path TEXT,
                error TEXT,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            );
            """)
            self.conn.execute("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)", (3, time.time()))

        if current < 4:
            columns = {row[1] for row in self.conn.execute("PRAGMA table_info(clips)")}
            for name, kind in (("has_audio", "INTEGER"), ("audio_codec", "TEXT"), ("sample_rate", "INTEGER")):
                if name not in columns:
                    self.conn.execute(f"ALTER TABLE clips ADD COLUMN {name} {kind}")
            self.conn.execute("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)", (4, time.time()))

        if current < 5:
            self.conn.execute("CREATE TABLE IF NOT EXISTS session_modes (session_id TEXT NOT NULL REFERENCES sessions(id), game_mode TEXT NOT NULL, PRIMARY KEY(session_id, game_mode))")
            self.conn.execute("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)", (5, time.time()))

    def set_audio_info(self, clip_id: str, info: dict[str, Any]) -> None:
        if "hasAudio" in info:
            self.conn.execute("UPDATE clips SET has_audio=?, audio_codec=?, sample_rate=? WHERE id=?",
                              (int(info["hasAudio"]), info.get("audioCodec"), info.get("sampleRate", 0), clip_id))

    def list_sessions(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM sessions ORDER BY started_at DESC LIMIT 50").fetchall()
        modes = {}
        for row in self.conn.execute("SELECT session_id, game_mode FROM session_modes ORDER BY rowid").fetchall():
            modes.setdefault(row[0], []).append(row[1])
        return [{**dict(row), "game_modes": modes.get(row["id"], [])} for row in rows]

    def record_session_mode(self, session_id: str, mode: str) -> None:
        if not isinstance(mode, str) or mode not in {"chain-of-custody", "closing-time", "excessive-force", "jurisdiction"}:
            return
        self.conn.execute("INSERT OR IGNORE INTO session_modes(session_id, game_mode) SELECT id, ? FROM sessions WHERE id=?", (mode, session_id))

    def create_session(self, session_id: str, epoch: str) -> None:
        self.conn.execute(
            "INSERT OR IGNORE INTO sessions(id, started_at, capture_epoch, status) VALUES (?,?,?, 'open')",
            (session_id, time.time(), epoch),
        )

    def record_marker(
        self,
        marker_id: str,
        *,
        stage: str,
        message_id: str = "",
        job_id: str = "",
        session_id: str = "",
        document_epoch: str = "",
        capture_epoch: str = "",
        kind: str = "",
        round_id: str = "",
        presented_at_ms: float | None = None,
        helper_received_ms: float | None = None,
        event_helper_ms: float | None = None,
        pre_ms: int | None = None,
        post_ms: int | None = None,
        reason: str = "",
        eligibility: str = "",
        save_attempt: int | None = None,
        output_path: str = "",
        probe: str = "",
        clip_id: str = "",
        merged_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        now = time.time()
        existing = self.conn.execute("SELECT * FROM marker_journal WHERE id=?", (marker_id,)).fetchone()
        if existing:
            row = dict(existing)
            updates = {
                "message_id": message_id or row.get("message_id"),
                "job_id": job_id or row.get("job_id"),
                "session_id": session_id or row.get("session_id"),
                "document_epoch": document_epoch or row.get("document_epoch"),
                "capture_epoch": capture_epoch or row.get("capture_epoch"),
                "kind": kind or row.get("kind"),
                "round_id": round_id or row.get("round_id"),
                "presented_at_ms": presented_at_ms if presented_at_ms is not None else row.get("presented_at_ms"),
                "helper_received_ms": helper_received_ms if helper_received_ms is not None else row.get("helper_received_ms"),
                "event_helper_ms": event_helper_ms if event_helper_ms is not None else row.get("event_helper_ms"),
                "pre_ms": pre_ms if pre_ms is not None else row.get("pre_ms"),
                "post_ms": post_ms if post_ms is not None else row.get("post_ms"),
                "stage": stage,
                "reason": reason if reason != "" or stage != row.get("stage") else row.get("reason"),
                "eligibility": eligibility or row.get("eligibility"),
                "save_attempt": save_attempt if save_attempt is not None else row.get("save_attempt") or 0,
                "output_path": output_path or row.get("output_path"),
                "probe": probe or row.get("probe"),
                "clip_id": clip_id or row.get("clip_id"),
                "merged_ids": json.dumps(merged_ids) if merged_ids is not None else row.get("merged_ids"),
                "updated_at": now,
            }
            self.conn.execute(
                """UPDATE marker_journal SET message_id=?, job_id=?, session_id=?, document_epoch=?, capture_epoch=?,
                   kind=?, round_id=?, presented_at_ms=?, helper_received_ms=?, event_helper_ms=?, pre_ms=?, post_ms=?,
                   stage=?, reason=?, eligibility=?, save_attempt=?, output_path=?, probe=?, clip_id=?, merged_ids=?,
                   updated_at=? WHERE id=?""",
                (*updates.values(), marker_id),
            )
        else:
            self.conn.execute(
                """INSERT INTO marker_journal(id, message_id, job_id, session_id, document_epoch, capture_epoch, kind,
                   round_id, presented_at_ms, helper_received_ms, event_helper_ms, pre_ms, post_ms, stage, reason,
                   eligibility, save_attempt, output_path, probe, clip_id, merged_ids, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    marker_id, message_id, job_id, session_id, document_epoch, capture_epoch, kind, round_id,
                    presented_at_ms, helper_received_ms, event_helper_ms, pre_ms, post_ms, stage, reason, eligibility,
                    save_attempt or 0, output_path, probe, clip_id,
                    json.dumps(merged_ids or []), now, now,
                ),
            )
        self._prune_journal()
        row = self.conn.execute("SELECT * FROM marker_journal WHERE id=?", (marker_id,)).fetchone()
        return dict(row) if row else {"id": marker_id, "stage": stage, "reason": reason}

    def get_marker(self, marker_id: str) -> dict[str, Any] | None:
        row = self.conn.execute("SELECT * FROM marker_journal WHERE id=?", (marker_id,)).fetchone()
        return dict(row) if row else None

    def last_marker(self) -> dict[str, Any] | None:
        row = self.conn.execute("SELECT * FROM marker_journal ORDER BY updated_at DESC LIMIT 1").fetchone()
        return dict(row) if row else None

    def last_marker_failure(self) -> dict[str, Any] | None:
        row = self.conn.execute(
            "SELECT * FROM marker_journal WHERE stage IN ('rejected','missed','failed','cancelled') ORDER BY updated_at DESC LIMIT 1"
        ).fetchone()
        return dict(row) if row else None

    def record_save_job(
        self,
        job_id: str,
        *,
        status: str,
        marker_ids: list[str],
        session_id: str = "",
        document_epoch: str = "",
        capture_epoch: str = "",
        seconds: float | None = None,
        event_ms: float | None = None,
        start_ms: float | None = None,
        end_ms: float | None = None,
        output_path: str = "",
        error: str = "",
    ) -> None:
        now = time.time()
        ids_json = json.dumps(marker_ids)
        existing = self.conn.execute("SELECT id FROM save_jobs WHERE id=?", (job_id,)).fetchone()
        if existing:
            self.conn.execute(
                """UPDATE save_jobs SET marker_ids=?,
                   session_id=CASE WHEN ? = '' THEN session_id ELSE ? END,
                   document_epoch=CASE WHEN ? = '' THEN document_epoch ELSE ? END,
                   capture_epoch=CASE WHEN ? = '' THEN capture_epoch ELSE ? END,
                   status=?,
                   seconds=COALESCE(?, seconds), event_ms=COALESCE(?, event_ms), start_ms=COALESCE(?, start_ms),
                   end_ms=COALESCE(?, end_ms),
                   output_path=CASE WHEN ? = '' THEN output_path ELSE ? END,
                   error=?, updated_at=? WHERE id=?""",
                (ids_json, session_id, session_id, document_epoch, document_epoch, capture_epoch, capture_epoch,
                 status, seconds, event_ms, start_ms, end_ms, output_path, output_path, error, now, job_id),
            )
        else:
            self.conn.execute(
                """INSERT INTO save_jobs(id, marker_ids, session_id, document_epoch, capture_epoch, status, seconds,
                   event_ms, start_ms, end_ms, output_path, error, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (job_id, ids_json, session_id, document_epoch, capture_epoch, status, seconds, event_ms, start_ms,
                 end_ms, output_path, error, now, now),
            )

    def get_save_job(self, job_id: str) -> dict[str, Any] | None:
        row = self.conn.execute("SELECT * FROM save_jobs WHERE id=?", (job_id,)).fetchone()
        return dict(row) if row else None

    def _prune_journal(self) -> None:
        count = self.conn.execute("SELECT COUNT(*) FROM marker_journal").fetchone()[0]
        if count <= JOURNAL_LIMIT:
            return
        self.conn.execute(
            "DELETE FROM marker_journal WHERE id IN (SELECT id FROM marker_journal ORDER BY updated_at ASC LIMIT ?)",
            (count - JOURNAL_LIMIT,),
        )

    def close_session(self, session_id: str) -> None:
        self.conn.execute("UPDATE sessions SET ended_at=?, status='closed' WHERE id=?", (time.time(), session_id))

    def publish_clip(self, *, staging: Path, session_id: str, epoch: str, duration_ms: int,
                     requested_start_ms: int, requested_end_ms: int, actual_start_ms: int,
                     actual_end_ms: int, profile: str, score: int, title: str, title_key: str,
                     kind: str, detector_version: int, truncated: bool, uncertainty_ms: int,
                     marker_ids: list[str], event_ms: float, event_offset_ms: int | None = None,
                     capture_start_ms: int | None = None, capture_end_ms: int | None = None) -> dict[str, Any]:
        clip_id = new_id()
        relative = f"{time.strftime('%Y/%m/%d')}/{clip_id}.mp4"
        destination = self.media_root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists() or destination.is_symlink():
            raise OSError("clip destination already exists")
        os.replace(staging, destination)
        size = destination.stat().st_size
        self.conn.execute("BEGIN")
        try:
            offset = event_offset_ms if event_offset_ms is not None else max(0, int(event_ms - requested_start_ms))
            cap_start = capture_start_ms if capture_start_ms is not None else int(requested_start_ms)
            cap_end = capture_end_ms if capture_end_ms is not None else int(requested_end_ms)
            self.conn.execute(
                """INSERT INTO clips(id, session_id, capture_epoch, relative_path, created_at, duration_ms,
                   requested_start_ms, requested_end_ms, actual_start_ms, actual_end_ms, profile, score,
                   favorite, title, title_key, kind, detector_version, trim_in_ms, trim_out_ms, bytes,
                   status, truncated, uncertainty_ms, event_offset_ms, capture_start_ms, capture_end_ms)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,0,?,?, 'ready', ?, ?, ?, ?, ?)""",
                (clip_id, session_id, epoch, relative, time.time(), duration_ms, requested_start_ms,
                 requested_end_ms, actual_start_ms if actual_start_ms else offset, actual_end_ms, profile, score, title, title_key, kind,
                 detector_version, duration_ms, size, int(truncated), uncertainty_ms, offset, cap_start, cap_end),
            )
            for marker_id in marker_ids:
                self.conn.execute(
                    "INSERT OR REPLACE INTO markers(id, clip_id, session_id, kind, title_key, score, presented_at_ms, event_helper_ms) VALUES (?,?,?,?,?,?,?,?)",
                    (marker_id, clip_id, session_id, kind, title_key, score, event_ms, event_ms),
                )
            sidecar = {
                "id": clip_id, "title": title, "kind": kind, "score": score, "durationMs": duration_ms,
                "detectorVersion": detector_version, "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            sidecar_path = destination.with_suffix(".json")
            sidecar_path.write_text(json.dumps(sidecar, indent=2) + "\n", encoding="utf-8")
            self.conn.execute("COMMIT")
        except Exception:
            self.conn.execute("ROLLBACK")
            raise
        return self.get_clip(clip_id)

    def get_clip(self, clip_id: str) -> dict[str, Any] | None:
        row = self.conn.execute("SELECT * FROM clips WHERE id=?", (clip_id,)).fetchone()
        return self.project(dict(row)) if row else None

    def project(self, row: dict[str, Any]) -> dict[str, Any]:
        path = self.clip_path(row)
        row["path"] = path.resolve().as_uri() if path.is_file() and not path.is_symlink() else ""
        row["hasAudio"] = None if row.get("has_audio") is None else bool(row["has_audio"])
        row["audioCodec"] = row.get("audio_codec")
        row["sampleRate"] = row.get("sample_rate")
        row["eventOffsetMs"] = int(row.get("event_offset_ms") or 0)
        row["captureStartMs"] = int(row.get("capture_start_ms") or row.get("requested_start_ms") or 0)
        row["captureEndMs"] = int(row.get("capture_end_ms") or row.get("requested_end_ms") or 0)
        return row

    def clip_path(self, clip: dict[str, Any]) -> Path:
        return self.media_root / clip["relative_path"]

    def list_clips(self, *, query: str = "", kind: str = "", favorite: bool | None = None,
                   session_id: str | None = None, limit: int = 50, offset: int = 0,
                   include_trash: bool = False) -> list[dict[str, Any]]:
        clauses = []
        args: list[Any] = []
        if include_trash:
            clauses.append("status IN ('ready','missing','corrupt','trash')")
        else:
            clauses.append("status='ready'")
        if query:
            clauses.append("(title LIKE ? OR kind LIKE ?)")
            args.extend([f"%{query}%", f"%{query}%"])
        if kind:
            clauses.append("kind=?")
            args.append(kind)
        if favorite is True:
            clauses.append("favorite=1")
        if session_id:
            clauses.append("session_id=?")
            args.append(session_id)
        sql = "SELECT * FROM clips WHERE " + " AND ".join(clauses) + " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        args.extend([max(1, min(limit, 100)), max(0, offset)])
        return [self.project(dict(row)) for row in self.conn.execute(sql, args)]

    def rename(self, clip_id: str, title: str) -> dict[str, Any] | None:
        require_text(title, "title")
        self.conn.execute("UPDATE clips SET title=? WHERE id=? AND status='ready'", (title, clip_id))
        return self.get_clip(clip_id)

    def set_favorite(self, clip_id: str, favorite: bool) -> dict[str, Any] | None:
        self.conn.execute("UPDATE clips SET favorite=? WHERE id=? AND status='ready'", (1 if favorite else 0, clip_id))
        return self.get_clip(clip_id)

    def set_trim(self, clip_id: str, trim_in_ms: int, trim_out_ms: int) -> dict[str, Any] | None:
        clip = self.get_clip(clip_id)
        if not clip or clip["status"] != "ready":
            return None
        duration = int(clip["duration_ms"])
        trim_in_ms = max(0, min(trim_in_ms, duration - 200))
        trim_out_ms = max(trim_in_ms + 200, min(trim_out_ms, duration))
        event_offset = max(0, min(duration, int(clip["actual_start_ms"] or duration // 3)))
        if not (trim_in_ms <= event_offset <= trim_out_ms) and trim_in_ms != 0:
            raise ValueError("trim would drop the highlight event")
        self.conn.execute("UPDATE clips SET trim_in_ms=?, trim_out_ms=? WHERE id=?", (trim_in_ms, trim_out_ms, clip_id))
        return self.get_clip(clip_id)

    def delete(self, clip_id: str) -> dict[str, Any] | None:
        clip = self.get_clip(clip_id)
        if not clip or clip["status"] != "ready":
            return None
        self.conn.execute("UPDATE clips SET status='trash', deleted_at=? WHERE id=?", (time.time(), clip_id))
        return self.get_clip(clip_id)

    def undo_delete(self, clip_id: str) -> dict[str, Any] | None:
        self.conn.execute("UPDATE clips SET status='ready', deleted_at=NULL WHERE id=? AND status='trash'", (clip_id,))
        return self.get_clip(clip_id)

    def mark_missing(self, clip_id: str, status: str = "missing") -> None:
        self.conn.execute("UPDATE clips SET status=? WHERE id=?", (status, clip_id))

    def usage(self) -> dict[str, int]:
        total = 0
        protected = 0
        for row in self.conn.execute("SELECT id, bytes, favorite, status FROM clips"):
            total += int(row["bytes"] or 0)
            if row["favorite"] or row["status"] in {"trash"}:
                protected += int(row["bytes"] or 0)
        pinned = self.conn.execute("SELECT COUNT(*) FROM reel_items").fetchone()[0]
        return {"bytes": total, "protectedBytes": protected, "budget": STORAGE_BUDGET_BYTES, "pinnedItems": pinned}

    def can_reserve(self, bytes_needed: int) -> bool:
        used = self.usage()["bytes"]
        return used + bytes_needed + LOW_SPACE_RESERVE_BYTES <= STORAGE_BUDGET_BYTES

    def reserve(self, bytes_needed: int) -> bool:
        self.prune(need_bytes=bytes_needed)
        return self.can_reserve(bytes_needed)

    def prune(self, need_bytes: int = 0) -> list[str]:
        removed: list[str] = []
        used = self.usage()["bytes"]
        ceiling = STORAGE_BUDGET_BYTES - LOW_SPACE_RESERVE_BYTES - max(0, need_bytes)
        if used <= ceiling:
            return removed
        rows = self.conn.execute(
            "SELECT id, bytes, relative_path FROM clips WHERE status='ready' AND favorite=0 ORDER BY created_at ASC"
        ).fetchall()
        pinned = {row[0] for row in self.conn.execute("SELECT clip_id FROM reel_items")}
        for row in rows:
            if used <= ceiling:
                break
            if row["id"] in pinned:
                continue
            path = self.media_root / row["relative_path"]
            try:
                if path.is_file() and not path.is_symlink():
                    path.unlink()
                    sidecar = path.with_suffix(".json")
                    if sidecar.is_file() and not sidecar.is_symlink():
                        sidecar.unlink()
            except OSError:
                continue
            self.conn.execute("DELETE FROM clips WHERE id=?", (row["id"],))
            used -= int(row["bytes"] or 0)
            removed.append(row["id"])
        return removed

    def expire_trash(self, now: float | None = None) -> None:
        now = now or time.time()
        cutoff = now - TRASH_EXPIRE_SECONDS
        for row in self.conn.execute("SELECT id, relative_path FROM clips WHERE status='trash' AND deleted_at < ?", (cutoff,)):
            path = self.media_root / row["relative_path"]
            try:
                if path.is_file() and not path.is_symlink():
                    path.unlink()
            except OSError:
                pass
            self.conn.execute("DELETE FROM clips WHERE id=?", (row["id"],))

    def reconcile(self) -> dict[str, int]:
        missing = 0
        for row in self.conn.execute("SELECT id, relative_path, status FROM clips WHERE status IN ('ready','staging')"):
            path = self.media_root / row["relative_path"]
            if not path.is_file() or path.is_symlink():
                self.mark_missing(row["id"])
                missing += 1
        staging = paths.staging_dir()
        orphans = 0
        if staging.is_dir():
            for child in staging.iterdir():
                if child.suffix == ".mp4" and child.is_file() and time.time() - child.stat().st_mtime > 3600:
                    child.unlink()
                    orphans += 1
        self.expire_trash()
        self.conn.execute(
            "DELETE FROM reel_drafts WHERE user_edited=0 AND updated_at < ?",
            (time.time() - REEL_DRAFT_EXPIRE_SECONDS,),
        )
        return {"missing": missing, "orphans": orphans}

    def session_candidates(self, session_id: str) -> list[ReelCandidate]:
        clips = self.list_clips(session_id=session_id, limit=100)
        out: list[ReelCandidate] = []
        for clip in clips:
            markers = [row["id"] for row in self.conn.execute("SELECT id FROM markers WHERE clip_id=?", (clip["id"],))]
            capture_start = float(clip.get("capture_start_ms") or clip.get("requested_start_ms") or 0)
            offset = float(clip.get("event_offset_ms") or clip.get("actual_start_ms") or 0)
            duration = float(clip["duration_ms"])
            out.append(ReelCandidate(
                clip_id=clip["id"],
                marker_ids=tuple(markers),
                epoch=clip["capture_epoch"],
                score=int(clip["score"]),
                event_ms=capture_start + offset,
                start_ms=capture_start,
                end_ms=capture_start + duration,
                kind=clip["kind"],
                duration_ms=int(duration),
            ))
        return out

    def save_reel(self, session_id: str, items: list[ReelItem], *, user_edited: bool = False) -> dict[str, Any]:
        existing = self.conn.execute("SELECT id, user_edited FROM reel_drafts WHERE session_id=?", (session_id,)).fetchone()
        if existing and existing["user_edited"] and not user_edited:
            return self.get_reel(session_id) or {}
        draft_id = existing["id"] if existing else new_id()
        now = time.time()
        self.conn.execute("BEGIN")
        try:
            self.conn.execute(
                "INSERT OR REPLACE INTO reel_drafts(id, session_id, ranking_version, user_edited, created_at, updated_at) VALUES (?,?,?,?,?,?)",
                (draft_id, session_id, ranking_version(), 1 if user_edited or (existing and existing["user_edited"]) else 0, now, now),
            )
            self.conn.execute("DELETE FROM reel_items WHERE draft_id=?", (draft_id,))
            for index, item in enumerate(items):
                self.conn.execute(
                    "INSERT INTO reel_items(draft_id, position, clip_id, trim_in_ms, trim_out_ms) VALUES (?,?,?,?,?)",
                    (draft_id, index, item.clip_id, item.trim_in_ms, item.trim_out_ms),
                )
            self.conn.execute("COMMIT")
        except Exception:
            self.conn.execute("ROLLBACK")
            raise
        return self.get_reel(session_id) or {}

    def generate_reel(self, session_id: str) -> dict[str, Any]:
        items = build_reel(self.session_candidates(session_id))
        return self.save_reel(session_id, items, user_edited=False)

    def get_reel(self, session_id: str) -> dict[str, Any] | None:
        draft = self.conn.execute("SELECT * FROM reel_drafts WHERE session_id=?", (session_id,)).fetchone()
        if not draft:
            return None
        items = [dict(row) for row in self.conn.execute("SELECT * FROM reel_items WHERE draft_id=? ORDER BY position", (draft["id"],))]
        return {**dict(draft), "items": items}

    def record_operation(self, kind: str, status: str, detail: dict[str, Any] | None = None) -> str:
        op_id = new_id()
        now = time.time()
        self.conn.execute(
            "INSERT INTO operations(id, kind, status, created_at, updated_at, detail) VALUES (?,?,?,?,?,?)",
            (op_id, kind, status, now, now, json.dumps(detail or {})),
        )
        return op_id

    def update_operation(self, op_id: str, status: str, detail: dict[str, Any] | None = None) -> None:
        self.conn.execute(
            "UPDATE operations SET status=?, updated_at=?, detail=? WHERE id=?",
            (status, time.time(), json.dumps(detail or {}), op_id),
        )

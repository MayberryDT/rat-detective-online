"""Per-user highlights helper: one instance, owned socket, capture lifecycle."""

from __future__ import annotations

import json
import os
import socket
import threading
import tempfile
import time
from pathlib import Path
from typing import Any

from . import audio, identity, paths, export_options
from .capture import CaptureError, FakeCapture, GsrCapture, hardware_supported, window_region
from .clock import ClockMap, monotonic_ms
from .export import ExportError, ExportQueue, export_clip, export_reel, probe, write_thumbnail
from .library import Library
from .media import MediaWorker, SaveJob
from .protocol import (
    ProtocolError,
    RateLimiter,
    clamp_interval,
    new_id,
    parse_json_bytes,
    reply,
    require_text,
    validate_browser_envelope,
    validate_helper_request,
)
from .redact import redact_recorder_text
from .scheduler import IntervalScheduler
from .tuning import (
    BUFFER_SECONDS,
    ELIGIBILITY_EXPIRE_SECONDS,
    HEARTBEAT_SECONDS,
    LEASE_TTL_SECONDS,
    PROTOCOL_VERSION,
    SESSION_REEL_IDLE_SECONDS,
    STORAGE_BUDGET_BYTES,
)

STATES = (
    "off", "setup-needed", "ready", "starting", "buffering", "capturing",
    "interrupted", "storage-full", "error",
)


class HighlightsService:
    def __init__(self, *, fake: bool = False, fixture: Path | None = None):
        paths.prepare_runtime()
        paths.prepare_state()
        self.library = Library()
        self.scheduler = IntervalScheduler()
        self.clock = ClockMap()
        self.limiter = RateLimiter()
        self.exports = ExportQueue()
        self.export_lock = threading.Lock()
        self._audio_probing = False
        self._audio_probe_attempted: set[str] = set()
        self.capture = FakeCapture(fixture) if fake else GsrCapture()
        self.fake = fake
        self.require_real_media = not fake
        self.enabled = False
        self.state = "off"
        self.reason = "Automatic highlights are off."
        self.recovery = "Turn on Automatic highlights in the plugin settings."
        self.lease_until = 0.0
        self.session_id: str | None = None
        self.document_epoch: str | None = None
        self.capture_epoch: str | None = None
        self.last_heartbeat = 0.0
        self.seen_ids: list[str] = []
        self.sequence = -1
        self.profile = "normal"
        self.source_confirmed = False
        self.capture_window = "portal"
        self.last_session_id: str | None = None
        self.last_browser: dict[str, Any] | None = None
        self.job: dict[str, Any] | None = None
        self.lock = threading.Lock()
        self.stop_event = threading.Event()
        self._arming = False
        self.audio_pid = 0
        self.audio_retry_at = 0.0
        self.audio_status = {"state": "off", "reason": ""}
        self.capture_region = ""
        self.capture_address = ""
        self._reframing = False
        self.arm_held = False
        self.last_marker: dict[str, Any] | None = None
        self.last_marker_failure: dict[str, Any] | None = None
        self.media = MediaWorker(lambda seconds, staging: self.capture.save_replay(seconds, staging))
        self.exports.start()
        self.settings = self._load_settings()
        self.library.reconcile()

    def _load_settings(self) -> dict[str, Any]:
        self.export_settings = export_options.settings()
        defaults = {"enabled": False, "profile": "normal", "budgetBytes": STORAGE_BUDGET_BYTES, "lastSessionId": None}
        try:
            raw = json.loads(paths.settings_path().read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                defaults["enabled"] = raw.get("enabled") is True
                try:
                    self.export_settings = export_options.settings(raw.get("export"))
                except ExportError:
                    pass
                if raw.get("profile") in {"normal", "light"}:
                    defaults["profile"] = raw["profile"]
                last = raw.get("lastSessionId")
                if isinstance(last, str) and last:
                    defaults["lastSessionId"] = last
                    self.last_session_id = last
        except (OSError, ValueError):
            pass
        self.enabled = defaults["enabled"]
        self.profile = defaults["profile"]
        if self.enabled:
            self.state = "ready"
            self.reason = "Waiting for the game."
            self.recovery = ""
        return defaults

    def _save_settings(self) -> None:
        paths.settings_path().parent.mkdir(parents=True, exist_ok=True)
        payload = {"enabled": self.enabled, "profile": self.profile, "budgetBytes": STORAGE_BUDGET_BYTES}
        if self.last_session_id:
            payload["lastSessionId"] = self.last_session_id
        payload["export"] = dict(self.export_settings)
        with tempfile.NamedTemporaryFile(mode="w", dir=paths.settings_path().parent, delete=False) as file:
            temporary = Path(file.name)
            try:
                file.write(json.dumps(payload, indent=2) + "\n")
                file.flush()
                os.fsync(file.fileno())
                os.replace(temporary, paths.settings_path())
            finally:
                temporary.unlink(missing_ok=True)

    def snapshot(self) -> dict[str, Any]:
        capture = self.capture.status() if self.enabled else {"running": False, "state": "off", "ready": False}
        clips = self.library.list_clips(limit=1)
        usage = self.library.usage()
        state = self.state
        if self.enabled and state not in {"interrupted", "error", "storage-full", "off"}:
            if capture.get("state") in {"starting", "buffering", "capturing"}:
                state = capture["state"]
        return {
            "ok": True,
            "version": PROTOCOL_VERSION,
            "state": state,
            "reason": self.reason,
            "recovery": self.recovery,
            "enabled": self.enabled,
            "profile": self.profile,
            "exportSettings": dict(self.export_settings),
            "capture": capture,
            "audio": self.audio_status,
            "job": self.exports.current() or self.job,
            "clipCount": len(self.library.list_clips(limit=100)),
            "recentTitle": clips[0]["title"] if clips else "",
            "usage": usage,
            "sessionId": self.session_id,
            "lastSessionId": getattr(self, "last_session_id", None),
            "lastBrowser": self.last_browser,
            "lastMarker": self.last_marker,
            "lastMarkerFailure": self.last_marker_failure,
            "pendingIntervals": len(self.scheduler.pending),
            "mediaBusy": self.media.busy(),
            "captureFacts": {
                "mode": capture.get("captureMode") or capture.get("sourceType") or "unknown",
                "sourceType": capture.get("sourceType"),
                "sourceSafe": self.source_confirmed and bool(capture.get("ready")),
                "processAlive": bool(capture.get("running")),
                "ipcReady": bool(capture.get("ipcReady") or capture.get("running")),
                "footageReady": bool(capture.get("footageReady")),
                "pixelIsolation": False,
            },
            "leaseMs": max(0, int((self.lease_until - time.monotonic()) * 1000)),
            "sourceConfirmed": self.source_confirmed,
        }

    def handle(self, raw: bytes, *, peer_uid: int | None = None) -> dict[str, Any]:
        if peer_uid is not None and peer_uid != os.getuid():
            return {"ok": False, "error": "peer rejected"}
        try:
            payload = parse_json_bytes(raw)
            if payload.get("channel") == "browser":
                result = self._browser(payload)
                if isinstance(result, dict):
                    self.last_browser = {
                        "type": str(payload.get("type") or ""),
                        "status": str(result.get("status") or ""),
                        "reason": str(result.get("reason") or ""),
                    }
                return result
            request = validate_helper_request(payload)
            return self._helper(request)
        except ProtocolError as error:
            try:
                payload = parse_json_bytes(raw)
            except ProtocolError:
                payload = {}
            if payload.get("channel") == "browser" and payload.get("type") == "marker":
                self._note_marker(
                    str(payload.get("id") or payload.get("messageId") or new_id()),
                    stage="rejected",
                    message_id=str(payload.get("messageId") or ""),
                    round_id=str(payload.get("roundId") or ""),
                    kind=str(payload.get("kind") or ""),
                    reason=error.reason,
                    eligibility="invalid envelope",
                )
            return {"ok": False, "error": error.reason, "status": error.code, "reason": error.reason}
        except Exception:
            return {"ok": False, "error": "internal error", "status": "rejected"}

    def _helper(self, request: dict[str, Any]) -> dict[str, Any]:
        kind = request["type"]
        payload = request["payload"]
        if kind == "status":
            return self.snapshot()
        if kind == "lease-renew":
            self.lease_until = time.monotonic() + LEASE_TTL_SECONDS
            return {**self.snapshot(), "lease": True}
        if kind == "enable":
            return self.enable()
        if kind == "disable":
            return self.disable()
        if kind == "resume":
            return self.resume()
        if kind == "setup-confirm" or kind == "arm-capture":
            return self.arm_capture()
        if kind == "save-manual":
            return self.manual_save()
        if kind == "list-sessions":
            return {"ok": True, "sessions": [{**item, "export": export_options.defaults(item["started_at"], True)} for item in self.library.list_sessions()]}
        if kind == "list-clips":
            clips = self.library.list_clips(
                query=str(payload.get("query") or ""), kind=str(payload.get("kind") or ""),
                favorite=True if payload.get("favorite") is True else None,
                session_id=payload.get("sessionId"),
                limit=int(payload.get("limit") or 50), offset=int(payload.get("offset") or 0),
            )
            self._probe_clip_audio(clips)
            return {"ok": True, "clips": [{**clip, "export": export_options.defaults(clip["created_at"])} for clip in clips]}
        if kind == "rename-clip":
            clip = self.library.rename(str(payload.get("clipId")), str(payload.get("title")))
            return {"ok": bool(clip), "clip": clip}
        if kind == "favorite-clip":
            clip = self.library.set_favorite(str(payload.get("clipId")), payload.get("favorite") is True)
            return {"ok": bool(clip), "clip": clip}
        if kind == "delete-clip":
            clip = self.library.delete(str(payload.get("clipId")))
            return {"ok": bool(clip), "clip": clip}
        if kind == "undo-delete":
            clip = self.library.undo_delete(str(payload.get("clipId")))
            return {"ok": bool(clip), "clip": clip}
        if kind == "trim-clip":
            try:
                clip = self.library.set_trim(str(payload.get("clipId")), int(payload.get("trimInMs") or 0), int(payload.get("trimOutMs") or 0))
            except ValueError as error:
                return {"ok": False, "error": str(error)}
            return {"ok": bool(clip), "clip": clip}
        if kind == "get-reel":
            return {"ok": True, "reel": self.library.get_reel(str(payload.get("sessionId") or self.session_id or ""))}
        if kind == "regenerate-reel":
            return {"ok": True, "reel": self.library.generate_reel(str(payload.get("sessionId")))}
        if kind == "export-clip":
            return self._export_clip(payload)
        if kind == "export-reel":
            return self._export_reel(payload)
        if kind == "cancel-job":
            job_id = str(payload.get("jobId") or "")
            cancelled = self.exports.cancel(job_id) if job_id else False
            return {**self.snapshot(), "ok": cancelled, "cancelled": cancelled}
        if kind == "edit-reel":
            return self._edit_reel(payload)
        if kind == "set-settings":
            if "export" in payload:
                try:
                    self.export_settings = export_options.settings({**self.export_settings, **payload["export"]})
                except (ExportError, TypeError) as error:
                    return {"ok": False, "error": str(error)}
            if payload.get("profile") in {"normal", "light"}:
                self.profile = payload["profile"]
            self._save_settings()
            return self.snapshot()
        if kind == "repair":
            return {"ok": True, "repair": self.library.reconcile(), **self.snapshot()}
        if kind == "shutdown":
            self._stop_capture()
            audio.cleanup_owned_routes()
            self.media.stop()
            self.stop_event.set()
            return {"ok": True, "stopped": True}
        if kind == "hello":
            return {"ok": True, "version": PROTOCOL_VERSION, **self.snapshot()}
        return {"ok": False, "error": "unknown request"}

    def enable(self) -> dict[str, Any]:
        self.enabled = True
        self.arm_held = False
        self.lease_until = time.monotonic() + LEASE_TTL_SECONDS
        self._save_settings()
        supported, detail = (True, "fake") if self.fake else hardware_supported()
        if not supported:
            self.state = "error"
            self.reason = detail
            self.recovery = "Install GPU Screen Recorder with GPU encoding, or choose the light profile after hardware is ready."
            return self.snapshot()
        if identity.recorder_conflict() and not self.fake:
            self.state = "interrupted"
            self.reason = "Another recorder is already running."
            self.recovery = "Stop the other recording, then Resume highlights."
            return self.snapshot()
        self.state = "ready"
        self.reason = "Waiting for the game."
        self.recovery = ""
        return self.snapshot()

    def disable(self) -> dict[str, Any]:
        self.enabled = False
        self.arm_held = True
        self._save_settings()
        self._stop_capture()
        audio.cleanup_owned_routes()
        self.session_id = None
        self.document_epoch = None
        self.state = "off"
        self.reason = "Automatic highlights are off."
        self.recovery = "Turn on Automatic highlights in the plugin settings."
        return self.snapshot()

    def resume(self) -> dict[str, Any]:
        self.arm_held = False
        self.lease_until = time.monotonic() + LEASE_TTL_SECONDS
        if not self.enabled:
            return self.enable()
        return self.arm_capture()

    def confirm_setup(self, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        return self.arm_capture()

    def arm_capture(self) -> dict[str, Any]:
        if not self.enabled:
            return self.snapshot()
        if self._reframing and self.media.busy():
            return self.snapshot()
        if self.capture.alive() and self.source_confirmed:
            self._reconcile_audio()
            self.state = self.capture.status().get("state", "capturing")
            self.reason = "Capturing the Rat Detective window."
            return {**self.snapshot(), "sourceConfirmed": True}
        windows = identity.game_windows() if not self.fake else [{"pid": os.getpid(), "class": "co.animasai.rat-detective", "title": "Rat Detective", "x": 0, "y": 0, "width": 1920, "height": 1080}]
        windows.sort(key=lambda item: item.get("address") != self.capture_address)
        if not windows:
            self.state = "ready"
            self.reason = "Waiting for the game."
            self.recovery = ""
            return {**self.snapshot(), "ok": True, "sourceConfirmed": False}
        if self.fake:
            return self._confirm_active_source(windows, "Rat Detective", window="region", keep_running=True)
        if self._arming:
            return self.snapshot()
        self._arming = True
        self.state = "starting"
        self.reason = "Starting capture."
        threading.Thread(target=self._arm_worker, args=(windows,), daemon=True, name="highlights-arm").start()
        return {**self.snapshot(), "ok": True}

    def _arm_worker(self, windows: list[dict[str, Any]]) -> None:
        try:
            self._confirm_active_source(windows, "Rat Detective", window="region", keep_running=True)
        finally:
            self._arming = False

    def _confirm_active_source(
        self, windows: list[dict[str, Any]], label: str, *, window: str, keep_running: bool,
    ) -> dict[str, Any]:
        # Recorder inspection is the only source of truth. CLI portalEvidence and
        # userConfirmed flags are ignored even if a caller still supplies them.
        started = False
        try:
            if not self.capture.alive():
                self.audio_pid = int(windows[0].get("pid") or 0)
                audio_source = None
                if not self.fake:
                    self.audio_retry_at = 0
                    self._reconcile_audio()
                    if self.audio_status["state"] == "error":
                        self.state = "ready"
                        self.reason = self.audio_status["reason"]
                        self.recovery = "Audio setup will retry automatically."
                        return {**self.snapshot(), "ok": False, "sourceConfirmed": False}
                    audio_source = audio.capture_source()
                region = window_region(windows[0]) if windows else ""
                self.capture.start(self.profile, audio_source, window="region", region=region)
                started = True
                self.capture_region = region
                self.capture_address = str(windows[0].get("address") or "")
            if not self.enabled:
                self._stop_capture()
                return {**self.snapshot(), "ok": False, "sourceConfirmed": False}
            inspected = self.capture.inspect_source(windows)
        except (CaptureError, OSError, TypeError) as error:
            self._stop_capture()
            self.state = "error"
            self.reason = redact_recorder_text(str(error))
            self.recovery = "Check GPU encoding, then retry setup."
            return {**self.snapshot(), "ok": False, "error": self.reason, "sourceConfirmed": False}
        kind = str(inspected.get("sourceKind") or "unknown")
        matched = inspected.get("matchesGameWindow") is True
        if kind not in {"window", "region"} or not matched:
            self._stop_capture()
            self.source_confirmed = False
            self.state = "setup-needed"
            self.reason = "The selected source is not the verified Rat Detective window."
            self.recovery = "Relaunch the game with Automatic highlights on. Capture uses the game window region, not a monitor."
            return {**self.snapshot(), "ok": False, "error": self.reason, "sourceConfirmed": False, "inspected": {
                "sourceKind": kind, "matchesGameWindow": matched, "label": inspected.get("label"),
            }}
        try:
            self.capture.confirm_source(kind, str(inspected.get("label") or label))
        except CaptureError as error:
            self._stop_capture()
            self.source_confirmed = False
            self.state = "setup-needed"
            self.reason = str(error)
            return {**self.snapshot(), "ok": False, "error": self.reason, "sourceConfirmed": False}
        self.source_confirmed = True
        if started:
            self.capture_epoch = new_id()
            self.scheduler.reset_epoch(self.capture_epoch, monotonic_ms())
        self._reframing = False
        self.capture_window = "region"
        if not keep_running:
            self._stop_capture()
            self.state = "ready"
        else:
            self.state = self.capture.status().get("state", "starting")
        self.reason = "Capture is armed for the selected Rat Detective window."
        self.recovery = ""
        return {**self.snapshot(), "sourceConfirmed": True, "previewStopped": not self.capture.alive()}

    def manual_save(self) -> dict[str, Any]:
        if not self._eligible():
            return {"ok": False, "error": "capture is not eligible"}
        now = monotonic_ms()
        result = self.scheduler.accept(
            now_ms=now, event_ms=now, pre_ms=20_000, post_ms=0, score=100,
            title_key="manual-save", kind="manual-save", marker_id=new_id(), manual=True,
        )
        if result != "accepted":
            return {"ok": False, "error": result}
        saved = self._dispatch_saves(now)
        return {"ok": True, "accepted": True, "saved": saved}

    def _browser(self, payload: dict[str, Any]) -> dict[str, Any]:
        self._collect_media_results()
        try:
            message = validate_browser_envelope(payload)
        except ProtocolError as error:
            if payload.get("type") == "marker":
                self._note_marker(
                    str(payload.get("id") or payload.get("messageId") or new_id()),
                    stage="rejected",
                    message_id=str(payload.get("messageId") or ""),
                    round_id=str(payload.get("roundId") or ""),
                    kind=str(payload.get("kind") or ""),
                    reason=error.reason,
                    eligibility="invalid envelope",
                )
            return reply(str(payload.get("messageId") or "unknown"), error.code, error.reason)
        message_id = message["messageId"]
        if message_id in self.seen_ids:
            return reply(message_id, "duplicate", "already processed")
        self.seen_ids.append(message_id)
        if len(self.seen_ids) > 2048:
            self.seen_ids = self.seen_ids[-1024:]
        if message["type"] == "hello":
            return reply(message_id, "accepted", "", helperNowMs=monotonic_ms(), version=PROTOCOL_VERSION,
                         enabled=self.enabled, state=self.state)
        if message["type"] == "ping":
            recv = monotonic_ms()
            # Startup probes may precede session-start. Reply to discovery,
            # but only the accepted document may calibrate the active clock.
            if not self.session_id:
                return reply(message_id, "accepted", "", helperNowMs=recv, enabled=self.enabled, state=self.state)
            if message.get("documentEpoch") != self.document_epoch or (
                message.get("sessionId") is not None and message["sessionId"] != self.session_id
            ):
                return reply(message_id, "rejected", "stale session")
            sent = message.get("helperNowMs")
            browser = message.get("presentedAtMs")
            if sent is not None and browser is not None:
                self.clock.observe(float(sent), float(browser), recv)
            elif browser is not None:
                self.clock.observe(recv, float(browser), recv)
            return reply(message_id, "accepted", "", helperNowMs=recv, enabled=self.enabled, state=self.state)
        if not self.enabled:
            return reply(message_id, "rejected", "highlights are off", enabled=False, state=self.state)
        if message["type"] != "session-start" and not self._same_session(message):
            return reply(message_id, "rejected", "stale session")
        if message["type"] != "session-start" and int(message["sequence"]) < self.sequence:
            return reply(message_id, "rejected", "stale sequence")
        if message["type"] != "session-start":
            self.sequence = max(self.sequence, int(message["sequence"]))
        if message["type"] == "session-start":
            return self._session_start(message)
        if message["type"] == "heartbeat":
            return self._heartbeat(message)
        if message["type"] == "session-end":
            return self._session_end(message)
        if message["type"] == "marker":
            return self._marker(message)
        return reply(message_id, "rejected", "unsupported")

    def _same_session(self, message: dict[str, Any]) -> bool:
        if not self.session_id:
            return False
        return message.get("sessionId") == self.session_id and message.get("documentEpoch") == self.document_epoch

    def _session_start(self, message: dict[str, Any]) -> dict[str, Any]:
        if message.get("observing"):
            return reply(message["messageId"], "rejected", "observers are not eligible")
        if self.state in {"off", "setup-needed", "interrupted", "error", "storage-full"}:
            return reply(message["messageId"], "rejected", self.reason, enabled=self.enabled, state=self.state)
        same = self._same_session(message)
        now = monotonic_ms()
        incoming_session = str(message["sessionId"])
        incoming_document = str(message["documentEpoch"])
        incoming_sequence = int(message["sequence"])
        if incoming_document != self.document_epoch:
            # performance.now() has a new origin for each document. Seed
            # before acknowledging start: the client can immediately flush
            # early markers, ahead of its next ping.
            self.clock = ClockMap()
            presented = message.get("presentedAtMs")
            if presented is not None:
                self.clock.observe(now, float(presented), now)
        if self.session_id and not same:
            previous = self.session_id
            self.scheduler.seal_all(now)
            self._enqueue_due(now)
            self.library.close_session(previous)
            self.sequence = incoming_sequence
            self.session_id = incoming_session
            self.document_epoch = incoming_document
            if not self.capture.alive() or not self.capture_epoch:
                self.capture_epoch = new_id()
                self.scheduler.reset_epoch(self.capture_epoch, now)
        else:
            self.session_id = incoming_session
            self.document_epoch = incoming_document
            if same:
                self.sequence = max(self.sequence, incoming_sequence)
            else:
                self.sequence = incoming_sequence
            if not self.capture_epoch:
                self.capture_epoch = new_id()
                self.scheduler.reset_epoch(self.capture_epoch, now)
        self.last_heartbeat = now
        self.library.create_session(self.session_id, self.capture_epoch)
        self.library.record_session_mode(self.session_id, message.get("payload", {}).get("gameMode"))
        if not self.capture.alive() and not self.arm_held:
            self.arm_capture()
        capture = self.capture.status()
        self.state = capture.get("state", "starting") if capture.get("running") else self.state
        if capture.get("running"):
            self.reason = "Capturing the selected Rat Detective window."
        return reply(message["messageId"], "accepted", "", captureEpoch=self.capture_epoch)

    def _heartbeat(self, message: dict[str, Any]) -> dict[str, Any]:
        if message.get("sessionId") != self.session_id or message.get("documentEpoch") != self.document_epoch:
            return reply(message["messageId"], "rejected", "stale session")
        now = monotonic_ms()
        if self.clock.discontinuity(now, message.get("presentedAtMs")):
            self._new_epoch("clock discontinuity")
            return reply(message["messageId"], "rejected", "clock discontinuity")
        self.last_heartbeat = now
        self.library.record_session_mode(self.session_id, message.get("payload", {}).get("gameMode"))
        self._enqueue_due(now)
        self._expire_if_needed(now)
        return reply(message["messageId"], "accepted", "", helperNowMs=now, degraded=self.clock.degraded)

    def _marker(self, message: dict[str, Any]) -> dict[str, Any]:
        now = monotonic_ms()
        marker_id = str(message["id"])
        failed = self._eligibility_reason()
        if failed:
            self._note_marker(
                marker_id, stage="rejected", message_id=message["messageId"], session_id=str(self.session_id or ""),
                document_epoch=str(self.document_epoch or ""), capture_epoch=str(self.capture_epoch or ""),
                kind=str(message.get("kind") or ""), round_id=str(message.get("roundId") or ""),
                presented_at_ms=message.get("presentedAtMs"), helper_received_ms=now, reason=failed,
                eligibility=failed, pre_ms=int(message.get("preMs") or 0), post_ms=int(message.get("postMs") or 0),
            )
            return reply(message["messageId"], "rejected", failed)
        if not self.limiter.allow(now / 1000):
            self._note_marker(
                marker_id, stage="rejected", message_id=message["messageId"], reason="rate limited",
                eligibility="rate limited", kind=str(message.get("kind") or ""), round_id=str(message.get("roundId") or ""),
            )
            return reply(message["messageId"], "rejected", "rate limited")
        helper_event, degraded = self.clock.to_helper(message["presentedAtMs"])
        if degraded and self.clock.offset_ms is None:
            self._note_marker(
                marker_id, stage="rejected", message_id=message["messageId"], reason="timing not calibrated",
                eligibility="timing not calibrated", kind=str(message.get("kind") or ""),
                round_id=str(message.get("roundId") or ""), presented_at_ms=message.get("presentedAtMs"),
                helper_received_ms=now,
            )
            return reply(message["messageId"], "rejected", "timing not calibrated")
        pre, post = clamp_interval(message["preMs"], message["postMs"])
        accepted = self.scheduler.accept(
            now_ms=now, event_ms=helper_event, pre_ms=pre, post_ms=post, score=message["score"],
            title_key=message["titleKey"], kind=message["kind"], marker_id=marker_id,
            manual=message["kind"] == "manual-save",
            session_id=str(self.session_id or ""), document_epoch=str(self.document_epoch or ""),
            capture_epoch=str(self.capture_epoch or ""),
        )
        job_id = ""
        for item in self.scheduler.pending:
            if marker_id in item.marker_ids:
                job_id = item.job_id
                break
        stage = "scheduled" if accepted == "accepted" else ("missed" if accepted in {"missed", "queue-full", "rate-limited"} else "rejected")
        self._note_marker(
            marker_id, stage=stage, message_id=message["messageId"], job_id=job_id,
            session_id=str(self.session_id or ""), document_epoch=str(self.document_epoch or ""),
            capture_epoch=str(self.capture_epoch or ""), kind=str(message.get("kind") or ""),
            round_id=str(message.get("roundId") or ""), presented_at_ms=message.get("presentedAtMs"),
            helper_received_ms=now, event_helper_ms=helper_event, pre_ms=pre, post_ms=post,
            reason=accepted, eligibility="ok",
            merged_ids=next((item.marker_ids for item in self.scheduler.pending if marker_id in item.marker_ids), [marker_id]),
        )
        self._enqueue_due(now)
        status = "accepted" if accepted == "accepted" else "rejected"
        return reply(message["messageId"], status, accepted, saved=[], jobId=job_id, degraded=degraded)

    def _session_end(self, message: dict[str, Any]) -> dict[str, Any]:
        now = monotonic_ms()
        self.scheduler.seal_all(now)
        self._enqueue_due(now)
        saved = self.drain_media(timeout=2.0 if self.fake else 0.0)
        if self.session_id:
            self.library.close_session(self.session_id)
            self.library.generate_reel(self.session_id)
            self.last_session_id = self.session_id
            self._save_settings()
        self.session_id = None
        self.document_epoch = None
        if self.enabled and self.capture.alive():
            self.state = self.capture.status().get("state", "capturing")
            self.reason = "Capturing the Rat Detective window."
        elif self.enabled:
            self.state = "ready"
            self.reason = "Waiting for the game."
        return reply(message["messageId"], "accepted", "", saved=saved)

    def _eligible(self) -> bool:
        return self._eligibility_reason() is None

    def _eligibility_reason(self) -> str | None:
        if not self.enabled:
            return "highlights are off"
        if not self.session_id:
            return "no session"
        if not self.source_confirmed:
            return "source not confirmed"
        if self.state in {"off", "setup-needed", "interrupted", "error", "storage-full"}:
            return f"state {self.state}"
        capture = self.capture.status()
        if not (capture.get("ready") or (self.fake and capture.get("running"))):
            return "capture not ready"
        return None

    def _note_marker(self, marker_id: str, *, stage: str, **fields: Any) -> dict[str, Any]:
        row = self.library.record_marker(marker_id, stage=stage, **fields)
        self.last_marker = {"id": marker_id, "stage": stage, "reason": str(fields.get("reason") or ""), "jobId": fields.get("job_id") or row.get("job_id")}
        if stage in {"rejected", "missed", "failed", "cancelled"}:
            self.last_marker_failure = dict(self.last_marker)
        return row

    def _enqueue_due(self, now: float) -> None:
        if self._reframing:
            self._collect_media_results()
            return
        while True:
            request = self.scheduler.dispatch(now)
            for marker_id in self.scheduler.last_dispatch_missed:
                self._note_marker(marker_id, stage="missed", reason="coverage expired")
            if not request:
                break
            interval = request.interval
            job_id = interval.job_id or new_id()
            needed = int((request.seconds * 12_000_000) / 8) + 8_000_000
            if not self.library.reserve(needed):
                self.state = "storage-full"
                self.reason = "The highlights library is full."
                self.recovery = "Delete or export old clips, or raise nothing — favorites are kept."
                self.scheduler.finish_save()
                for marker_id in interval.marker_ids:
                    self._note_marker(marker_id, stage="failed", job_id=job_id, reason="storage full")
                self.library.record_save_job(job_id, status="failed", marker_ids=interval.marker_ids, error="storage full")
                break
            staging = paths.staging_dir() / f"{job_id}.mp4"
            job = SaveJob(
                job_id=job_id,
                marker_ids=tuple(interval.marker_ids),
                session_id=interval.session_id or str(self.session_id or ""),
                document_epoch=interval.document_epoch or str(self.document_epoch or ""),
                capture_epoch=interval.capture_epoch or str(self.capture_epoch or ""),
                seconds=request.seconds,
                event_ms=interval.event_ms,
                start_ms=interval.start_ms,
                end_ms=interval.end_ms,
                requested_start_ms=request.requested_start_ms,
                requested_end_ms=request.requested_end_ms,
                title_key=interval.title_key,
                kind=interval.kind,
                score=interval.score,
                truncated=interval.truncated_start,
                staging=staging,
                require_real_media=self.require_real_media,
            )
            self.library.record_save_job(
                job_id, status="saving", marker_ids=list(interval.marker_ids), session_id=job.session_id,
                document_epoch=job.document_epoch, capture_epoch=job.capture_epoch, seconds=job.seconds,
                event_ms=job.event_ms, start_ms=job.start_ms, end_ms=job.end_ms,
            )
            for marker_id in interval.marker_ids:
                self._note_marker(marker_id, stage="saving", job_id=job_id, save_attempt=1)
            if not self.media.submit(job):
                self.scheduler.finish_save()
                for marker_id in interval.marker_ids:
                    self._note_marker(marker_id, stage="missed", job_id=job_id, reason="media queue full")
                self.library.record_save_job(job_id, status="failed", marker_ids=list(interval.marker_ids), error="media queue full")
        self._collect_media_results()

    def _collect_media_results(self) -> list[str]:
        saved_ids: list[str] = []
        for result in self.media.collect():
            self.scheduler.finish_save()
            job_id = str(result.get("job_id") or "")
            marker_ids = list(result.get("marker_ids") or [])
            status = str(result.get("status") or "failed")
            if status == "saved":
                clip = self._publish_result(result)
                if clip:
                    saved_ids.append(clip["id"])
                    self.library.record_save_job(
                        job_id, status="saved", marker_ids=marker_ids, output_path=str(result.get("path") or ""),
                    )
                    for marker_id in marker_ids:
                        self._note_marker(
                            marker_id, stage="saved", job_id=job_id, clip_id=clip["id"],
                            output_path=str(result.get("path") or ""), probe=str((result.get("probe") or {}).get("codec") or ""),
                            reason="saved",
                        )
                else:
                    self.library.record_save_job(job_id, status="failed", marker_ids=marker_ids, error="publication failed")
                    for marker_id in marker_ids:
                        self._note_marker(marker_id, stage="failed", job_id=job_id, reason="publication failed")
            elif status == "timeout-with-file" and result.get("path"):
                recovered = self._publish_result(result)
                if recovered:
                    saved_ids.append(recovered["id"])
                    self.library.record_save_job(job_id, status="saved", marker_ids=marker_ids, output_path=str(result["path"]))
                    for marker_id in marker_ids:
                        self._note_marker(marker_id, stage="saved", job_id=job_id, clip_id=recovered["id"], reason="reconciled after timeout")
                else:
                    self.library.record_save_job(job_id, status="uncertain", marker_ids=marker_ids, error=str(result.get("error") or "timeout"))
                    for marker_id in marker_ids:
                        self._note_marker(marker_id, stage="failed", job_id=job_id, reason="timeout; file present but unpublished")
            else:
                error = str(result.get("error") or status)
                self.reason = error
                self.library.record_save_job(job_id, status="failed", marker_ids=marker_ids, error=error)
                for marker_id in marker_ids:
                    self._note_marker(marker_id, stage="failed", job_id=job_id, reason=error)
        return saved_ids

    def drain_media(self, timeout: float = 2.0) -> list[str]:
        deadline = time.monotonic() + timeout
        saved: list[str] = []
        while time.monotonic() <= deadline:
            saved.extend(self._collect_media_results())
            if not self.media.busy():
                saved.extend(self._collect_media_results())
                return saved
            time.sleep(0.01)
        saved.extend(self._collect_media_results())
        return saved

    def _publish_result(self, result: dict[str, Any]) -> dict[str, Any] | None:
        path_value = result.get("path")
        if not path_value:
            return None
        path = Path(path_value)
        if not path.is_file() or path.is_symlink():
            return None
        info = result.get("probe") or {"durationMs": int(float(result.get("seconds") or 1) * 1000), "codec": "h264"}
        title = _title(str(result.get("title_key") or "manual-save"))
        offset = max(0, int(float(result.get("event_ms") or 0) - float(result.get("start_ms") or 0)))
        try:
            clip = self.library.publish_clip(
                staging=path, session_id=str(result.get("session_id") or ""),
                epoch=str(result.get("capture_epoch") or ""),
                duration_ms=int(info.get("durationMs") or 0),
                requested_start_ms=int(result.get("requested_start_ms") or 0),
                requested_end_ms=int(result.get("requested_end_ms") or 0),
                actual_start_ms=offset, actual_end_ms=int(info.get("durationMs") or 0),
                profile=self.profile, score=int(result.get("score") or 0), title=title,
                title_key=str(result.get("title_key") or ""), kind=str(result.get("kind") or ""),
                detector_version=1, truncated=bool(result.get("truncated")),
                uncertainty_ms=int(self.clock.rtt_ms or 0), marker_ids=list(result.get("marker_ids") or []),
                event_ms=float(result.get("event_ms") or 0), event_offset_ms=offset,
                capture_start_ms=int(result.get("start_ms") or 0), capture_end_ms=int(result.get("end_ms") or 0),
            )
        except (OSError, KeyError) as error:
            self.reason = redact_recorder_text(str(error))
            return None
        self.library.set_audio_info(clip["id"], info)
        clip = self.library.get_clip(clip["id"])
        try:
            write_thumbnail(paths.videos_root() / clip["relative_path"], paths.thumbnails_dir() / f"{clip['id']}.jpg")
        except ExportError:
            pass
        return clip

    def _dispatch_saves(self, now: float) -> list[str]:
        self._enqueue_due(now)
        return self.drain_media(timeout=2.0 if self.fake else 0.0)

    def _probe_clip_audio(self, clips: list[dict[str, Any]]) -> None:
        if self._audio_probing or self.fake:
            return
        pending = [clip for clip in clips if clip.get("hasAudio") is None
                   and clip["id"] not in self._audio_probe_attempted and clip["status"] == "ready"][:3]
        if not pending:
            return
        self._audio_probing = True
        def work():
            try:
                for clip in pending:
                    self._audio_probe_attempted.add(clip["id"])
                    try:
                        self.library.set_audio_info(clip["id"], probe(self.library.clip_path(clip)))
                    except (ExportError, OSError, ValueError):
                        pass  # Unknown stays unknown; never infer silence from a probe failure.
            finally:
                self._audio_probing = False
        threading.Thread(target=work, name="highlights-audio-probe", daemon=True).start()

    def _export_clip(self, payload: dict[str, Any]) -> dict[str, Any]:
        clip = self.library.get_clip(str(payload.get("clipId")))
        if not clip or clip["status"] != "ready":
            return {"ok": False, "error": "clip not found"}
        source = self.library.clip_path(clip)
        if not source.is_file() or source.is_symlink():
            return {"ok": False, "error": "recording is unavailable"}
        trim_in = int(clip["trim_in_ms"])
        trim_out = int(clip["trim_out_ms"] or clip["duration_ms"])
        return self._queue_export("clip", payload, export_options.defaults(clip["created_at"]),
                                  lambda dest, opts, progress: export_clip(source, dest, trim_in, trim_out, opts))

    def _export_reel(self, payload: dict[str, Any]) -> dict[str, Any]:
        session_id = str(payload.get("sessionId") or self.session_id or self.last_session_id or "")
        reel = self.library.get_reel(session_id)
        if not reel or not reel.get("items"):
            return {"ok": False, "error": "reel is empty"}
        session = self.library.conn.execute("SELECT started_at FROM sessions WHERE id=?", (session_id,)).fetchone()
        items = [dict(item) for item in reel["items"]]
        return self._queue_export("reel", payload, export_options.defaults(session[0] if session else None, True),
                                  lambda dest, opts, progress: export_reel(self.library, items, dest, progress, opts))

    def _queue_export(self, kind, payload, naming, work):
        try:
            with self.export_lock:
                options = dict(self.export_settings)
                occupied = [job["destination"] for job in self.exports.jobs if job["status"] in {"queued", "running"}]
                dest = export_options.destination(payload, options, naming, occupied)
                job = self.exports.enqueue(kind, lambda progress: {**work(dest, options, progress), "path": str(dest)},
                                           destination=str(dest))
        except (ExportError, OSError, ValueError) as error:
            return {"ok": False, "error": str(error)}
        self.job = job
        return {**self.snapshot(), "ok": True, "queued": True, "job": job}

    def _edit_reel(self, payload: dict[str, Any]) -> dict[str, Any]:
        from .reel import ReelItem
        session_id = str(payload.get("sessionId") or self.last_session_id or "")
        raw_items = payload.get("items") if isinstance(payload.get("items"), list) else []
        items = []
        for raw in raw_items:
            if not isinstance(raw, dict):
                continue
            clip_id = str(raw.get("clip_id") or raw.get("clipId") or "")
            if not clip_id:
                continue
            items.append(ReelItem(
                clip_id=clip_id,
                trim_in_ms=int(raw.get("trim_in_ms") or raw.get("trimInMs") or 0),
                trim_out_ms=int(raw.get("trim_out_ms") or raw.get("trimOutMs") or 0),
                marker_ids=tuple(),
                score=int(raw.get("score") or 0),
                kind=str(raw.get("kind") or "manual-save"),
            ))
        if not session_id or not items:
            return {"ok": False, "error": "reel edit requires a session and items"}
        return {"ok": True, "reel": self.library.save_reel(session_id, items, user_edited=True)}

    def _reconcile_audio(self) -> None:
        if self.fake or not self.audio_pid or time.monotonic() < self.audio_retry_at:
            return
        self.audio_retry_at = time.monotonic() + 3
        try:
            route = audio.ensure_game_route(self.audio_pid)
            self.audio_status = {"state": "ready" if route["streams"] else "waiting",
                                 "reason": "" if route["streams"] else "Waiting for game sound.",
                                 "streams": route["streams"]}
        except audio.AudioError as error:
            self.audio_status = {"state": "error", "reason": redact_recorder_text(str(error))}

    def _stop_capture(self) -> None:
        try:
            self.capture.stop()
        except Exception:
            pass
        self.capture_region = ""
        self.source_confirmed = False
        if not self.fake:
            audio.cleanup_owned_routes()
        self.audio_pid = 0
        self.audio_retry_at = 0
        self.audio_status = {"state": "off", "reason": ""}

    def _refresh_capture_geometry(self) -> None:
        if self.fake or not self.enabled or self._arming or not self.capture.alive() or not self.capture_region:
            return
        windows = identity.game_windows()
        target = next((item for item in windows if item.get("address") == self.capture_address), None)
        if not self.capture_address:
            target = windows[0] if windows else None
        if not self._reframing and target and window_region(target) == self.capture_region:
            return
        # GSR region capture has no resize command. Stop accepting new saves,
        # let already dispatched saves finish against their original recorder,
        # then restart with current bounds and fresh replay coverage.
        self._reframing = True
        self.source_confirmed = False
        self.state = "starting"
        self.reason = "Updating capture to the game window."
        for interval in self.scheduler.pending:
            for marker_id in interval.marker_ids:
                self._note_marker(marker_id, stage="missed", reason="game window changed; replay buffer restarted")
        self.scheduler.pending.clear()
        self._collect_media_results()
        if self.media.busy():
            return
        self._stop_capture()
        self.state = "ready"

    def _new_epoch(self, reason: str) -> None:
        now = monotonic_ms()
        self.scheduler.seal_all(now)
        self._enqueue_due(now)
        self.capture_epoch = new_id()
        self.scheduler.reset_epoch(self.capture_epoch, now)
        self.reason = reason

    def _expire_if_needed(self, now: float) -> None:
        if identity.lock_state() == "locked" and self.capture.alive():
            self._stop_capture()
            self.arm_held = True
            self.state = "interrupted"
            self.reason = "The session is locked."
            self.recovery = "Unlock, then Resume highlights."
            return
        if self.last_heartbeat and now - self.last_heartbeat > ELIGIBILITY_EXPIRE_SECONDS * 1000:
            self._session_end({"messageId": new_id(), "sessionId": self.session_id, "documentEpoch": self.document_epoch})
        if self.lease_until and time.monotonic() > self.lease_until:
            self.lease_until = 0.0
            self._stop_capture()
            self.arm_held = True
            if self.enabled:
                self.state = "interrupted"
                self.reason = "The companion lease expired."
                self.recovery = "Open Dispatch and Resume highlights."
            return
        if not self.fake and not identity.game_windows() and self.capture.alive():
            self._stop_capture()
            self.source_confirmed = False
            self.state = "ready"
            self.reason = "Waiting for the game."
            self.recovery = ""
            return
        if not self.fake and not self.capture.alive() and self.state in {"starting", "buffering", "capturing"} and not self._arming:
            self.state = "ready"
            self.reason = "Waiting for the game."
            self.recovery = ""

    def tick(self) -> None:
        now = monotonic_ms()
        self._expire_if_needed(now)
        self._refresh_capture_geometry()
        if self.capture.alive() and not self._arming:
            self._reconcile_audio()
        self._enqueue_due(now)
        if (
            self.enabled and not self.arm_held and not self.fake
            and self.lease_until > time.monotonic()
            and self.state not in {"interrupted", "error", "off", "storage-full"}
            and time.monotonic() >= self.audio_retry_at
            and identity.game_windows() and not self.capture.alive() and not self._arming
        ):
            self.arm_capture()
        self.library.prune()
        self.library.expire_trash()


def _title(key: str) -> str:
    return {
        "round-win": "Round win",
        "triple-kill": "Triple kill",
        "double-kill": "Double kill",
        "paperwork-delivered": "Paperwork delivered",
        "last-second-steal": "Last-second steal",
        "launcher-escape": "Launcher escape",
        "spectacular-launch": "Paperwork in orbit",
        "local-chaos-death": "Local chaos",
        "visible-pileup": "Pile-up",
        "manual-save": "Saved moment",
        "paperwork-in-orbit": "Paperwork in orbit",
    }.get(key, "Highlight")


def peer_uid(sock: socket.socket) -> int | None:
    try:
        creds = sock.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12)
        import struct
        _pid, uid, _gid = struct.unpack("3I", creds)
        return uid
    except OSError:
        return None


def serve(service: HighlightsService, *, idle_exit_seconds: float = LEASE_TTL_SECONDS) -> None:
    paths.prepare_runtime()
    sock_path = paths.control_socket()
    if sock_path.exists() or sock_path.is_symlink():
        sock_path.unlink()
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(str(sock_path))
    os.chmod(sock_path, 0o600)
    server.listen(8)
    server.settimeout(0.5)
    last_request_at = time.monotonic()
    try:
        while not service.stop_event.is_set():
            try:
                client, _ = server.accept()
            except socket.timeout:
                service.tick()
                now = time.monotonic()
                export_busy = any(job["status"] in {"queued", "running"} for job in service.exports.jobs)
                if (
                    now - last_request_at >= idle_exit_seconds
                    and service.lease_until <= now
                    and not service.capture.alive()
                    and not service.media.busy()
                    and not export_busy
                ):
                    break
                continue
            with client:
                last_request_at = time.monotonic()
                uid = peer_uid(client)
                data = b""
                while b"\n" not in data and len(data) < 16 * 1024:
                    chunk = client.recv(4096)
                    if not chunk:
                        break
                    data += chunk
                line = data.split(b"\n", 1)[0]
                response = service.handle(line, peer_uid=uid)
                try:
                    client.sendall((json.dumps(response) + "\n").encode("utf-8"))
                except OSError:
                    pass
    finally:
        try:
            service._stop_capture()
            audio.cleanup_owned_routes()
            service.media.stop()
        except Exception:
            pass
        try:
            service.exports.stop()
        except Exception:
            pass
        try:
            server.close()
        except OSError:
            pass
        try:
            sock_path.unlink()
        except OSError:
            pass

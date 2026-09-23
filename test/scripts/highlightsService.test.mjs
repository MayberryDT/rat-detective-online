import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync, mkdirSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const repo = path.resolve(import.meta.dirname, '../..');
const scripts = path.join(repo, 'omarchy/plugin/scripts');

function runPython(env, body) {
  const result = spawnSync('python3', ['-c', body], {encoding: 'utf8', env: {...process.env, ...env}});
  if (result.status !== 0) throw new Error((result.stderr || '') + result.stdout);
  return result.stdout.trim();
}

function fixtureEnv() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'rat-hl-'));
  const home = path.join(root, 'home');
  mkdirSync(home, {recursive: true});
  return {
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_DATA_HOME: path.join(home, '.local/share'),
    XDG_STATE_HOME: path.join(home, '.local/state'),
    XDG_CACHE_HOME: path.join(home, '.cache'),
    XDG_RUNTIME_DIR: path.join(root, 'run'),
    PYTHONPATH: scripts,
  };
}

test('duplicate helper start fails the instance lock', () => {
  const env = fixtureEnv();
  mkdirSync(env.XDG_RUNTIME_DIR, {recursive: true});
  const out = runPython(env, `
import fcntl, os
from highlights import paths
paths.prepare_runtime()
lock = paths.instance_lock().open("a+")
fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
try:
    other = paths.instance_lock().open("a+")
    fcntl.flock(other.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    print("unlocked")
except BlockingIOError:
    print("locked")
`);
  assert.equal(out, "locked");
});

test('fresh helper stays off until enable, then waits for the game', () => {
  const env = fixtureEnv();
  const out = runPython(env, `
from highlights.service import HighlightsService
svc = HighlightsService(fake=True)
snap = svc.snapshot()
print(snap["state"], snap["enabled"])
print(svc.enable()["state"])
print(svc.confirm_setup({"sourceType":"window","sourceLabel":"Rat Detective"})["sourceConfirmed"])
`);
  assert.match(out, /^off False/m);
  assert.match(out, /ready/);
});

// Lifecycle failure modes: a lost shell lease must stop owned capture, the
// same tick must not immediately re-arm it, and an off/unused helper must not
// survive indefinitely after the plugin disappears. A short shell reload is
// still allowed to reconnect by making another request inside the grace time.
test('expired companion lease stops capture and requires an explicit resume', () => {
  const env = fixtureEnv();
  const out = runPython(env, `
import time
from highlights.clock import monotonic_ms
from highlights.service import HighlightsService
svc = HighlightsService(fake=True)
svc.enable()
svc._helper({"type":"lease-renew","payload":{}})
svc.capture.forced_source={"sourceKind":"region","matchesGameWindow":True,"label":"game"}
svc.arm_capture()
assert svc.capture.alive()
svc.lease_until = time.monotonic() - 1
svc._expire_if_needed(monotonic_ms())
print(svc.capture.alive(), svc.arm_held, svc.state, svc.snapshot()["leaseMs"])
svc.tick()
print(svc.capture.alive())
svc.media.stop()
svc.exports.stop()
`);
  assert.match(out, /^False True interrupted 0\nFalse$/);
});

test('unused helper exits after its reload grace window', () => {
  const env = fixtureEnv();
  const out = runPython(env, `
import json, socket, threading, time
from highlights import paths
from highlights.service import HighlightsService, serve

svc = HighlightsService(fake=True)
thread = threading.Thread(target=serve, args=(svc,), kwargs={"idle_exit_seconds": .2})
thread.start()
deadline = time.monotonic() + 2
while not paths.control_socket().exists() and time.monotonic() < deadline:
    time.sleep(.01)
assert paths.control_socket().exists()

def status():
    client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    client.connect(str(paths.control_socket()))
    client.sendall(b'{"version":1,"type":"status"}\\n')
    reply = b''
    while b'\\n' not in reply:
        reply += client.recv(4096)
    client.close()
    return json.loads(reply)

assert status()["state"] == "off"
time.sleep(.12)
assert status()["state"] == "off", "a request inside the grace window should retain the helper"
thread.join(1)
print(thread.is_alive(), paths.control_socket().exists())
`);
  assert.equal(out, 'False False');
});

test('duplicate browser message ids are not saved twice and observers are rejected', () => {
  const env = fixtureEnv();
  const out = runPython(env, `
import json
from highlights.service import HighlightsService
from highlights.protocol import PROTOCOL_VERSION
svc = HighlightsService(fake=True)
svc.enable()
svc.capture.forced_source={"sourceKind":"window","matchesGameWindow":True,"label":"Rat Detective"}
svc.confirm_setup({"sourceType":"window","sourceLabel":"Rat Detective"})
hello = {"version":1,"channel":"browser","type":"hello","messageId":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","sequence":0}
print(svc.handle(json.dumps(hello).encode())["status"])
print(svc.handle(json.dumps(hello).encode())["status"])
start = {"version":1,"channel":"browser","type":"session-start","messageId":"bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee","sequence":1,"sessionId":"cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee","documentEpoch":"dddddddd-bbbb-cccc-dddd-eeeeeeeeeeee","origin":"https://ratdetective.online","joined":True,"observing":True}
print(svc.handle(json.dumps(start).encode())["status"])
`);
  assert.match(out, /accepted/);
  assert.match(out, /duplicate/);
  assert.match(out, /rejected/);
});

test('scheduler merges overlapping markers and respects the duration cap', () => {
  const env = fixtureEnv();
  const out = runPython(env, `
from highlights.scheduler import IntervalScheduler
s = IntervalScheduler()
s.reset_epoch("epoch", 45_000)
print(s.accept(now_ms=45_000, event_ms=40_000, pre_ms=10000, post_ms=5000, score=70, title_key="double-kill", kind="double-kill", marker_id="m1"))
print(s.accept(now_ms=45_000, event_ms=41_000, pre_ms=10000, post_ms=5000, score=90, title_key="triple-kill", kind="triple-kill", marker_id="m2"))
print(len(s.pending), s.pending[0].kind, s.pending[0].score)
print(s.accept(now_ms=45_000, event_ms=10_000, pre_ms=10000, post_ms=25000, score=50, title_key="visible-pileup", kind="visible-pileup", marker_id="m3"))
print(len(s.pending))
`);
  assert.match(out, /accepted/);
  assert.match(out, /1 triple-kill 90/);
});

test('library trash, favorites and quota pin sources', () => {
  const env = fixtureEnv();
  const out = runPython(env, `
from pathlib import Path
from highlights.library import Library
from highlights import paths
lib = Library()
staging = paths.staging_dir() / "clip.mp4"
staging.write_bytes(b"0" * 64)
clip = lib.publish_clip(staging=staging, session_id="s", epoch="e", duration_ms=1500,
    requested_start_ms=0, requested_end_ms=1500, actual_start_ms=0, actual_end_ms=1500,
    profile="normal", score=70, title="Double kill", title_key="double-kill", kind="double-kill",
    detector_version=1, truncated=False, uncertainty_ms=0, marker_ids=["m1"], event_ms=10)
lib.set_favorite(clip["id"], True)
lib.delete(clip["id"])
print(lib.get_clip(clip["id"])["status"])
lib.undo_delete(clip["id"])
print(lib.get_clip(clip["id"])["status"], lib.get_clip(clip["id"])["favorite"])
print(lib.can_reserve(1))
`);
  assert.match(out, /trash/);
  assert.match(out, /ready 1/);
});

test('reel ranking is deterministic and drops overlapping moments', () => {
  const env = fixtureEnv();
  const out = runPython(env, `
from highlights.reel import ReelCandidate, build_reel
items = build_reel([
    ReelCandidate("c2", ("m2",), "e", 70, 2000, 0, 8000, "double-kill", 8000),
    ReelCandidate("c1", ("m1",), "e", 70, 1000, 0, 8000, "double-kill", 8000),
    ReelCandidate("c3", ("m1",), "e", 90, 1100, 0, 8000, "triple-kill", 8000),
    ReelCandidate("c4", ("m4",), "e2", 60, 1000, 0, 8000, "spectacular-launch", 8000),
])
print([item.clip_id for item in items])
`);
  assert.match(out, /c3/);
  assert.match(out, /c4/);
  assert.doesNotMatch(out, /c1/);
});

for (const geometry of [{width:1920,height:1080,x:0,y:0}, {width:986,height:1080,x:900,y:30}]) {
  test(`capture follows resized or moved game bounds ${JSON.stringify(geometry)}`, () => {
    runPython(fixtureEnv(), `
from unittest.mock import patch
from highlights.service import HighlightsService
from highlights.capture import window_region
svc = HighlightsService(fake=True)
svc.enabled = True
svc._helper({"type":"lease-renew","payload":{}})
windows = [{"address":"game-a", "pid":1, "width":986, "height":1080, "x":20, "y":30}]
svc.capture.forced_source={"sourceKind":"region","matchesGameWindow":True,"label":"game"}
svc._confirm_active_source(windows,"game",window="region",keep_running=True)
old_region = svc.capture._owned_region
svc.fake = False
# Keep the real timer/restart decision; replace only OS and recorder boundaries.
def arm():
    svc.fake = True
    try:
        return svc._confirm_active_source(windows,"game",window="region",keep_running=True)
    finally:
        svc.fake = False
svc.arm_capture = arm
with patch("highlights.service.identity.game_windows", side_effect=lambda:windows), patch("highlights.service.identity.lock_state", return_value="unlocked"), patch("highlights.service.audio.ensure_game_route", return_value={"source":"rat-detective-highlights.monitor","streams":0}), patch("highlights.service.audio.cleanup_owned_routes"):
    svc.tick()
    assert svc.capture._owned_region == old_region
    windows[0].update(${JSON.stringify(geometry)})
    svc.tick()
    assert svc.capture._owned_region == window_region(windows[0]), (svc.capture._owned_region, windows)
    assert svc.source_confirmed
svc.media.stop()
svc.exports.stop()
`);
  });
}

test('resize drains the old recorder, cancels unfinished intervals and starts fresh coverage on the same window', () => {
  runPython(fixtureEnv(), `
import threading, time
from unittest.mock import patch
from highlights.service import HighlightsService
from highlights.capture import GsrCapture, window_region
from highlights.clock import monotonic_ms
svc = HighlightsService(fake=True)
svc.enabled = True
svc._helper({"type":"lease-renew","payload":{}})
svc.capture.inspect_source = lambda windows: GsrCapture.inspect_source(svc.capture, windows)
window = {"address":"game-a", "pid":1, "width":986, "height":1080, "x":20, "y":30}
windows = [window]
svc._confirm_active_source(windows,"game",window="region",keep_running=True)
old_epoch = svc.capture_epoch
old_region = svc.capture._owned_region
svc.session_id = "session"
svc.library.create_session("session",old_epoch)
now = monotonic_ms()
svc.scheduler.coverage_start_ms = now - 30_000
svc.scheduler.accept(now_ms=now,event_ms=now-5000,pre_ms=1000,post_ms=0,score=70,
    title_key="double-kill",kind="double-kill",marker_id="saving",session_id="session",capture_epoch=old_epoch)
started, release = threading.Event(), threading.Event()
original_save = svc.capture.save_replay
saved_regions = []
def slow_save(seconds, staging):
    saved_regions.append(svc.capture._owned_region)
    started.set()
    assert release.wait(2)
    assert svc.capture._owned_region == old_region
    return original_save(seconds,staging)
svc.capture.save_replay = slow_save
svc._enqueue_due(now)
assert started.wait(1)
svc.scheduler.accept(now_ms=now,event_ms=now,pre_ms=1000,post_ms=6000,score=70,
    title_key="double-kill",kind="double-kill",marker_id="unfinished")
window.update(width=1920,height=1080,x=0,y=0)
# A second app appearing first must not steal the capture on restart.
windows.insert(0,{"address":"game-b","pid":2,"width":800,"height":600,"x":50,"y":50})
svc.fake = False
try:
    with patch("highlights.service.identity.game_windows",side_effect=lambda:list(windows)), patch("highlights.service.identity.lock_state",return_value="unlocked"), patch("highlights.service.audio.ensure_game_route",return_value={"source":"rat-detective-highlights.monitor","streams":0}):
        before = time.monotonic()
        svc.tick()
        assert time.monotonic() - before < .5
        assert svc.capture.alive() and not svc.source_confirmed
        assert svc.capture._owned_region == old_region
        assert not svc.scheduler.pending
        assert svc.library.get_marker("unfinished")["stage"] == "missed"
        # No additional old-buffer job may dispatch while the save drains.
        svc._enqueue_due(now + 10_000)
        assert svc.scheduler.in_flight == 1
        release.set()
        svc.drain_media(timeout=2)
        assert svc.library.get_marker("saving")["stage"] == "saved"
        svc.tick()
        deadline = time.monotonic()+2
        while svc._arming and time.monotonic()<deadline:
            time.sleep(.01)
        assert svc.source_confirmed
        assert svc.capture._owned_region == window_region(window)
        assert svc.capture_address == "game-a"
        assert svc.capture_epoch != old_epoch
        assert svc.scheduler.coverage_start_ms >= now
        assert svc.scheduler.in_flight == 0
        assert saved_regions == [old_region]
        # The first new clip cannot claim buildup from the discarded buffer.
        fresh = svc.scheduler.coverage_start_ms
        svc.scheduler.accept(now_ms=fresh+1000,event_ms=fresh+1000,pre_ms=10000,post_ms=1000,score=70,
            title_key="double-kill",kind="double-kill",marker_id="fresh")
        assert svc.scheduler.pending[0].start_ms == fresh
        assert svc.scheduler.pending[0].truncated_start
        epoch = svc.capture_epoch
        svc.tick()
        assert svc.capture_epoch == epoch, "unchanged dimensions must not restart"
finally:
    release.set()
    svc.capture.stop()
    svc.media.stop()
    svc.exports.stop()
`);
});

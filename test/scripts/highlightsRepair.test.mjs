import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync, mkdirSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const scripts = path.resolve(import.meta.dirname, '../../omarchy/plugin/scripts');

function fixtureEnv() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'rat-hl-repair-'));
  const home = path.join(root, 'home');
  mkdirSync(home, {recursive: true});
  mkdirSync(path.join(root, 'run'), {recursive: true});
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

function runPython(env, body) {
  const result = spawnSync('python3', ['-c', body], {encoding: 'utf8', env: {...process.env, ...env}});
  if (result.status !== 0) throw new Error((result.stderr || '') + result.stdout);
  return result.stdout.trim();
}

test('setup without portal evidence does not arm capture or leave the recorder running', () => {
  const out = runPython(fixtureEnv(), `
from highlights.service import HighlightsService
svc = HighlightsService(fake=True)
svc.enable()
snap = svc.confirm_setup({"sourceType":"window","sourceLabel":"Rat Detective"})
print(snap.get("sourceConfirmed"), svc.capture.alive(), svc.session_id)
`);
  assert.equal(out, 'False False None');
});

test('stale markers and session-end cannot stop the active session', () => {
  const out = runPython(fixtureEnv(), `
import json
from highlights.service import HighlightsService
from highlights.protocol import new_id
from highlights.clock import monotonic_ms
svc = HighlightsService(fake=True)
svc.enable()
svc.capture.forced_source={"sourceKind":"window","matchesGameWindow":True,"label":"Rat Detective"}
svc.confirm_setup({"sourceType":"window","sourceLabel":"Rat Detective"})
def send(message_type, **payload):
    msg={"version":1,"channel":"browser","messageId":new_id(),"sequence":payload.pop("sequence", 1),"type":message_type,
         "sessionId":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","documentEpoch":"11111111-2222-3333-4444-555555555555",**payload}
    return svc.handle(json.dumps(msg).encode())
print(send("session-start", origin="https://ratdetective.online", joined=True, observing=False)["status"])
svc.clock.offset_ms = 0
stale = send("marker", sessionId="bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee", documentEpoch="99999999-8888-7777-6666-555555555555",
             id=new_id(), roundId="round-1aa", kind="double-kill", score=70, preMs=1000, postMs=5000, presentedAtMs=monotonic_ms())
ended = send("session-end", sessionId="bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee", documentEpoch="99999999-8888-7777-6666-555555555555")
print(stale["status"], ended["status"], svc.session_id is not None)
`);
  assert.match(out, /accepted/);
  assert.match(out, /rejected rejected True/);
});

test('unknown helper operations are rejected without crashing', () => {
  const out = runPython(fixtureEnv(), `
from highlights.service import HighlightsService
svc = HighlightsService(fake=True)
print(svc.handle(b'{"version":1,"type":"bogus"}').get("status"))
`);
  assert.equal(out, 'rejected');
});

test('disable restores owned audio routes', () => {
  const out = runPython(fixtureEnv(), `
from unittest.mock import patch
from highlights.service import HighlightsService
calls=[]
svc = HighlightsService(fake=True)
svc.enable()
with patch("highlights.service.audio.cleanup_owned_routes", side_effect=lambda: calls.append(1)):
    svc.disable()
print(len(calls))
`);
  assert.equal(out, '1');
});

test('list_clips includes a playable path and reels keep separated events', () => {
  const out = runPython(fixtureEnv(), `
from highlights.library import Library
from highlights import paths
lib = Library()
ids=[]
for i, event in enumerate([100000, 200000, 300000]):
    staging = paths.staging_dir() / f"{i}.mp4"
    staging.write_bytes(b"fixture-not-real-media")
    clip = lib.publish_clip(staging=staging, session_id="session-a", epoch="epoch-a", duration_ms=15000,
        requested_start_ms=event-10000, requested_end_ms=event+5000, actual_start_ms=10000, actual_end_ms=15000,
        profile="normal", score=70+i, title=f"Moment {i}", title_key="double-kill", kind="double-kill",
        detector_version=1, truncated=False, uncertainty_ms=0, marker_ids=[f"marker-{i}aa"], event_ms=event,
        event_offset_ms=10000, capture_start_ms=event-10000, capture_end_ms=event+5000)
    ids.append(clip)
print(all("path" in clip and clip["path"].startswith("file:") for clip in lib.list_clips()))
reel = lib.generate_reel("session-a")
print(len(reel["items"]), reel["items"][0]["trim_in_ms"], reel["items"][0]["trim_out_ms"])
`);
  assert.match(out, /True/);
  assert.match(out, /3 /);
});

test('CLI setup omits portalEvidence and inspect_source wins over fabricated evidence', () => {
  const out = runPython(fixtureEnv(), `
import json, os, time
from pathlib import Path
from unittest.mock import patch
import importlib.util
scripts = Path(${JSON.stringify(scripts)})
spec = importlib.util.spec_from_file_location('desktop', scripts / 'rat-detective-desktop.py')
desktop = importlib.util.module_from_spec(spec); spec.loader.exec_module(desktop)
windows = [{'pid': 12345, 'class': 'co.animasai.rat-detective', 'title': 'Rat Detective'}]
requests = []
with patch.object(desktop, 'game_windows', return_value=windows), \\
     patch.object(desktop, 'highlights_request', side_effect=lambda payload, timeout=8: requests.append(payload) or {'ok': True}), \\
     patch.object(desktop, 'print_json', return_value=0):
    desktop.highlights_setup(type('A', (), {'prefer_focused': False})())
payload = requests[0]
print('portalEvidence' in payload, payload.get('type'))
from highlights.service import HighlightsService
from highlights.protocol import new_id
svc = HighlightsService(fake=True)
svc.enable()
svc.capture.forced_source = {'sourceKind': 'monitor', 'matchesGameWindow': False, 'label': 'Test monitor'}
fabricated = dict(payload)
fabricated['portalEvidence'] = {'sourceKind': 'window', 'matchesGameWindow': True, 'userConfirmed': True}
result = svc.confirm_setup(fabricated)
print(result.get('sourceConfirmed'), svc.capture.alive())
svc.capture.forced_source = {'sourceKind': 'window', 'matchesGameWindow': True, 'label': 'Rat Detective'}
armed = svc.confirm_setup({'sourceType': 'window', 'sourceLabel': 'Rat Detective'})
print(armed.get('sourceConfirmed'), svc.capture.alive())
svc._stop_capture()
svc.source_confirmed = False
svc.capture.forced_source = {'sourceKind': 'monitor', 'matchesGameWindow': False, 'label': 'Test monitor'}
start = svc.handle(json.dumps({
    'version': 1, 'channel': 'browser', 'type': 'session-start', 'messageId': new_id(),
    'sessionId': new_id(), 'documentEpoch': new_id(), 'sequence': 1,
    'origin': 'https://ratdetective.online', 'joined': True, 'observing': False,
}).encode())
print(start.get('status'), svc.capture.status().get('ready'))
`);
  assert.match(out, /False arm-capture/);
  assert.match(out, /False False/);
  assert.match(out, /True True/);
  assert.match(out, /accepted False/);
});

test('last session id survives helper restart and exports do not block status', () => {
  const out = runPython(fixtureEnv(), `
import json, time
from unittest.mock import patch
from highlights.service import HighlightsService
from highlights.protocol import new_id
from highlights import paths
svc = HighlightsService(fake=True)
svc.enable()
svc.capture.forced_source = {'sourceKind': 'window', 'matchesGameWindow': True, 'label': 'Rat Detective'}
svc.confirm_setup({'sourceType': 'window', 'sourceLabel': 'Rat Detective'})
session = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
epoch = '11111111-2222-3333-4444-555555555555'
svc.handle(json.dumps({'version':1,'channel':'browser','type':'session-start','messageId':new_id(),'sessionId':session,'documentEpoch':epoch,'sequence':1,'origin':'https://ratdetective.online','joined':True,'observing':False}).encode())
svc.handle(json.dumps({'version':1,'channel':'browser','type':'session-end','messageId':new_id(),'sessionId':session,'documentEpoch':epoch,'sequence':2}).encode())
print(svc.last_session_id == session)
svc.library.close()
svc2 = HighlightsService(fake=True)
print(svc2.last_session_id == session)
staging = paths.staging_dir() / 'clip.mp4'
staging.write_bytes(b'fixture')
clip = svc2.library.publish_clip(staging=staging, session_id=session, epoch='epoch', duration_ms=1500,
    requested_start_ms=0, requested_end_ms=1500, actual_start_ms=0, actual_end_ms=1500,
    profile='normal', score=70, title='Saved moment', title_key='manual-save', kind='manual-save',
    detector_version=1, truncated=False, uncertainty_ms=0, marker_ids=['m1aaaaaa'], event_ms=10)
destination = paths.videos_root() / 'Exports' / 'clip.mp4'
destination.parent.mkdir(parents=True, exist_ok=True)
def slow(source, dest, a, b, progress=None):
    time.sleep(0.8)
    dest.write_bytes(b'x')
    return {'durationMs': 1000, 'codec': 'h264'}
started = time.monotonic()
with patch('highlights.service.export_clip', side_effect=slow):
    result = svc2._export_clip({'clipId': clip['id'], 'destination': str(destination)})
    elapsed = time.monotonic() - started
    status = svc2.handle(b'{"version":1,"type":"status"}')
    print(result.get('queued'), elapsed < 0.4, status.get('ok'), (status.get('job') or {}).get('status') in {'queued','running','done'})
    time.sleep(1.0)
svc2.exports.stop()
svc2.library.close()
`);
  assert.match(out, /True/);
  assert.match(out, /True True True True/);
});

test('four GiB of unprotected clips can be pruned to reserve a new save', () => {
  const out = runPython(fixtureEnv(), `
from highlights.library import Library
from highlights import paths
from highlights.tuning import STORAGE_BUDGET_BYTES, LOW_SPACE_RESERVE_BYTES
lib = Library()
ids=[]
for i in range(3):
    staging = paths.staging_dir() / f"{i}.mp4"
    staging.write_bytes(b"x")
    clip = lib.publish_clip(staging=staging, session_id="s", epoch="e", duration_ms=1000,
        requested_start_ms=0, requested_end_ms=1000, actual_start_ms=0, actual_end_ms=1000,
        profile="normal", score=10, title="Old", title_key="double-kill", kind="double-kill",
        detector_version=1, truncated=False, uncertainty_ms=0, marker_ids=[f"m{i}aaaaaa"], event_ms=0)
    ids.append(clip["id"])
lib.conn.execute("UPDATE clips SET bytes=?", (STORAGE_BUDGET_BYTES-LOW_SPACE_RESERVE_BYTES,))
print(lib.can_reserve(1), len(lib.prune(need_bytes=1)), lib.can_reserve(1))
`);
  assert.match(out, /False 3 True/);
});

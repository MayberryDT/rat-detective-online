import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync, mkdirSync, writeFileSync} from 'node:fs';
import os from 'os';
import path from 'path';
import {spawnSync} from 'node:child_process';

const repo = path.resolve(import.meta.dirname, '../..');
const scripts = path.join(repo, 'omarchy/plugin/scripts');

function fixtureEnv() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'rat-hl-pipe-'));
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

const helperPrelude = `
import json, time
from highlights.service import HighlightsService
from highlights.protocol import new_id, validate_browser_envelope, ProtocolError
from highlights.capture import CaptureError, parse_first_frame_ts
from highlights.clock import monotonic_ms

def ready(svc):
    svc.enable()
    svc.capture.forced_source={"sourceKind":"window","matchesGameWindow":True,"label":"Rat Detective"}
    svc.confirm_setup({"sourceType":"window","sourceLabel":"Rat Detective"})
    return svc

def send(svc, t, sid, de, seq, **p):
    msg={"version":1,"channel":"browser","type":t,"messageId":new_id(),"sequence":seq,
         "sessionId":sid,"documentEpoch":de, **p}
    return svc.handle(json.dumps(msg).encode())
`;

for (const closed of [true, false]) {
  test(`new document saves a highlight after twelve hours (${closed ? 'closed' : 'replaced'} session)`, () => {
    const out = runPython(fixtureEnv(), helperPrelude + `
from unittest.mock import patch
svc = ready(HighlightsService(fake=True))
old_sid, old_de, sid, de = [new_id() for _ in range(4)]
now = monotonic_ms()
with patch("highlights.service.monotonic_ms", side_effect=lambda: now):
    send(svc,"session-start",old_sid,old_de,1,origin="https://ratdetective.online",joined=True,presentedAtMs=1000)
    for seq in range(2, 5):
        send(svc,"ping",old_sid,old_de,seq,presentedAtMs=1000)
    if ${closed ? 'True' : 'False'}:
        send(svc,"session-end",old_sid,old_de,5)
    now += 12 * 60 * 60 * 1000
    # The deployed bridge probes before starting, then may flush markers as
    # soon as session-start is acknowledged, before the next ping arrives.
    send(svc,"ping",None,de,1,presentedAtMs=1000)
    start = send(svc,"session-start",sid,de,2,origin="https://ratdetective.online",joined=True,presentedAtMs=1000)
    assert start["status"] == "accepted", start
    now += 20_000
    mid = new_id()
    result = send(svc,"marker",sid,de,3,id=mid,roundId="capture:"+de,kind="round-win",titleKey="round-win",
                  score=100,preMs=12000,postMs=6000,presentedAtMs=21_000)
    assert result["status"] == "accepted", result
    row = svc.library.get_marker(mid)
    assert abs(row["event_helper_ms"] - now) < 1, row
    # Advance through the aftermath using the actual heartbeat/save path.
    now += 6000
    assert send(svc,"heartbeat",sid,de,4,presentedAtMs=27_000)["status"] == "accepted"
    svc.drain_media(timeout=2)
    row = svc.library.get_marker(mid)
    assert row["stage"] == "saved", row
    clip = svc.library.conn.execute("select * from clips where session_id=?", (sid,)).fetchone()
    assert clip is not None and clip["kind"] == "round-win"
    assert abs(clip["event_offset_ms"] - 12000) <= 1, dict(clip)
    print("saved", clip["duration_ms"], clip["event_offset_ms"])
svc.media.stop()
svc.exports.stop()
`);
    assert.match(out, /saved 18000 12000/);
  });
}

test('foreign and unscoped pings cannot change the active document clock; same-document retries preserve it', () => {
  const out = runPython(fixtureEnv(), helperPrelude + `
from unittest.mock import patch
svc = ready(HighlightsService(fake=True))
sid, de = new_id(), new_id()
now = monotonic_ms()
with patch("highlights.service.monotonic_ms", return_value=now):
    send(svc,"session-start",sid,de,1,origin="https://ratdetective.online",joined=True,presentedAtMs=1000)
    send(svc,"ping",sid,de,2,presentedAtMs=1000)
    calibration = svc.clock
    before = list(calibration.samples)
    for other_sid, other_de in [(new_id(),new_id()), (sid,new_id()), (new_id(),de), (None,None)]:
        result = send(svc,"ping",other_sid,other_de,3,presentedAtMs=40_000_000)
        assert result["status"] == "rejected", result
        assert svc.clock.samples == before
    send(svc,"session-start",sid,de,4,origin="https://ratdetective.online",joined=True,presentedAtMs=1000)
    assert svc.clock is calibration and svc.clock.samples == before
    assert send(svc,"heartbeat",sid,de,5,presentedAtMs=1000)["status"] == "accepted"
    print("isolated and stable")
svc.media.stop()
svc.exports.stop()
`);
  assert.match(out, /isolated and stable/);
});

test('clock refresh expires old zero-latency samples instead of retaining them forever', () => {
  const out = runPython(fixtureEnv(), `
from highlights.clock import ClockMap
clock = ClockMap()
for _ in range(8):
    clock.observe(100_000, 1000, 100_000)
clock.observe(200_000, 101_100, 200_020)
assert abs(clock.to_helper(101_100)[0] - 200_010) < 1, clock
assert len(clock.samples) == 1, clock.samples
print("fresh calibration")
`);
  assert.equal(out, 'fresh calibration');
});

test('A01/A02 actual detector-shaped round ids match the python validator', () => {
  const env = fixtureEnv();
  const out = runPython(env, `
from highlights.protocol import validate_browser_envelope, ProtocolError, ID_RE
good = "11111111-2222-3333-4444-555555555555"
capture = "capture:11111111-2222-3333-4444-555555555555"
def marker(round_id):
    return {"version":1,"type":"marker","messageId":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            "sessionId":"11111111-2222-3333-4444-555555555555",
            "documentEpoch":"99999999-8888-7777-6666-555555555555","sequence":3,
            "id":"abcdef12-3456-7890-abcd-ef1234567890","roundId":round_id,"kind":"round-win",
            "titleKey":"round-win","score":100,"preMs":12000,"postMs":6000,"presentedAtMs":12.5}
print(validate_browser_envelope(marker(good))["roundId"])
print(validate_browser_envelope(marker(capture))["roundId"])
for bad in ("round","r1",""):
    try:
        validate_browser_envelope(marker(bad))
        print("accepted", bad)
    except ProtocolError as error:
        print("rejected", bad)
print("idre", bool(ID_RE.fullmatch(capture)))
`);
  assert.match(out, /11111111-2222-3333-4444-555555555555/);
  assert.match(out, /capture:11111111-2222-3333-4444-555555555555/);
  assert.match(out, /rejected round/);
  assert.match(out, /rejected r1/);
  assert.match(out, /idre True/);
});

test('F01 accepted marker plus failed save keeps a journal failure, not a silent empty catalog', () => {
  const env = fixtureEnv();
  const out = runPython(env, helperPrelude + `
svc = ready(HighlightsService(fake=True))
sid, de = new_id(), new_id()
print(send(svc,"session-start",sid,de,1,origin="https://ratdetective.online",joined=True,observing=False)["status"])
svc.clock.offset_ms = 0
svc.scheduler.coverage_start_ms = monotonic_ms() - 45_000
now = monotonic_ms()
mid = new_id()
marker = send(svc,"marker",sid,de,2,id=mid,roundId="round-1aa",kind="round-win",titleKey="round-win",
              score=100,preMs=10000,postMs=5000,presentedAtMs=now)
print("marker", marker["status"], "catalog", svc.library.conn.execute("select count(*) from markers").fetchone()[0],
      "journal", svc.library.get_marker(mid)["stage"])
def boom(seconds, staging):
    raise CaptureError("INJECTED save-replay failure")
svc.capture.save_replay = boom
for item in svc.scheduler.pending:
    item.end_ms = monotonic_ms() - 1
    item.start_ms = monotonic_ms() - 10_000
hb = send(svc,"heartbeat",sid,de,3,presentedAtMs=monotonic_ms())
saved = svc.drain_media(timeout=2)
row = svc.library.get_marker(mid)
print("heartbeat", hb["status"], "pending", len(svc.scheduler.pending),
      "clips", svc.library.conn.execute("select count(*) from clips").fetchone()[0],
      "pub_markers", svc.library.conn.execute("select count(*) from markers").fetchone()[0],
      "journal_stage", row["stage"], "journal_reason", row["reason"],
      "lastBrowser", svc.last_browser["type"], svc.last_browser["status"],
      "lastFail", svc.last_marker_failure["stage"],
      "saved", saved)
`);
  assert.match(out, /marker accepted catalog 0 journal scheduled/);
  assert.match(out, /heartbeat accepted pending 0 clips 0 pub_markers 0 journal_stage failed/);
  assert.match(out, /INJECTED save-replay failure/);
  assert.match(out, /lastBrowser heartbeat accepted/);
  assert.match(out, /lastFail failed/);
});

test('D01 tick dispatches a due interval without another gameplay message', () => {
  const env = fixtureEnv();
  const out = runPython(env, helperPrelude + `
svc = ready(HighlightsService(fake=True))
sid, de = new_id(), new_id()
send(svc,"session-start",sid,de,1,origin="https://ratdetective.online",joined=True,observing=False)
svc.clock.offset_ms = 0
svc.scheduler.coverage_start_ms = monotonic_ms() - 45_000
now = monotonic_ms()
mid = new_id()
send(svc,"marker",sid,de,2,id=mid,roundId="round-1aa",kind="double-kill",titleKey="double-kill",
     score=75,preMs=10000,postMs=5000,presentedAtMs=now)
for item in svc.scheduler.pending:
    item.end_ms = monotonic_ms() - 1
    item.start_ms = monotonic_ms() - 8_000
print("before", len(svc.scheduler.pending), svc.capture.saves)
svc.tick()
svc.drain_media(timeout=2)
print("after", len(svc.scheduler.pending), svc.capture.saves,
      svc.library.conn.execute("select count(*) from clips").fetchone()[0],
      svc.library.get_marker(mid)["stage"])
`);
  assert.match(out, /before 1 0/);
  assert.match(out, /after 0 1 1 saved/);
});

test('B04 a new document does not inherit the previous sequence floor', () => {
  const env = fixtureEnv();
  const out = runPython(env, helperPrelude + `
svc = ready(HighlightsService(fake=True))
svc.session_id = None
svc.document_epoch = None
svc.sequence = 100
sid, de = new_id(), new_id()
start = send(svc,"session-start",sid,de,1,origin="https://ratdetective.online",joined=True,observing=False)
hb = send(svc,"heartbeat",sid,de,2,presentedAtMs=monotonic_ms())
print(start["status"], hb["status"], hb.get("reason") or "ok", svc.sequence)
`);
  assert.match(out, /accepted accepted ok 2/);
});

test('C04 sidecar header rows parse and tiny non-fake media cannot publish', () => {
  const env = fixtureEnv();
  const out = runPython(env, helperPrelude + `
text = "monotonic_microsec realtime_microsec\\n12345678 1789960000000000\\n"
print(parse_first_frame_ts(text))
svc = ready(HighlightsService(fake=True))
svc.require_real_media = True
sid, de = new_id(), new_id()
send(svc,"session-start",sid,de,1,origin="https://ratdetective.online",joined=True,observing=False)
svc.clock.offset_ms = 0
svc.scheduler.coverage_start_ms = monotonic_ms() - 45_000
now = monotonic_ms()
mid = new_id()
send(svc,"marker",sid,de,2,id=mid,roundId="round-1aa",kind="round-win",titleKey="round-win",
     score=100,preMs=10000,postMs=0,presentedAtMs=now)
for item in svc.scheduler.pending:
    item.end_ms = monotonic_ms() - 1
    item.start_ms = monotonic_ms() - 8_000
svc.tick()
svc.drain_media(timeout=2)
row = svc.library.get_marker(mid)
print("stage", row["stage"], "clips", svc.library.conn.execute("select count(*) from clips").fetchone()[0])
`);
  assert.match(out, /\(12345678, 1789960000000000\)/);
  assert.match(out, /stage failed clips 0/);
});

test('C01 accepted transport while capture is off journals the failed eligibility predicate', () => {
  const env = fixtureEnv();
  const out = runPython(env, helperPrelude + `
svc = HighlightsService(fake=True)
svc.enable()
sid, de = new_id(), new_id()
start = send(svc,"session-start",sid,de,1,origin="https://ratdetective.online",joined=True,observing=False)
svc.clock.offset_ms = 0
mid = new_id()
marker = send(svc,"marker",sid,de,2,id=mid,roundId="round-1aa",kind="round-win",titleKey="round-win",
              score=100,preMs=10000,postMs=5000,presentedAtMs=monotonic_ms())
print(start["status"], marker["status"], marker.get("reason"), svc.library.get_marker(mid)["eligibility"], svc._eligible())
`);
  assert.match(out, /accepted rejected/);
  assert.match(out, /source not confirmed/);
});

test('D03 a slow save does not block heartbeat handling', () => {
  const env = fixtureEnv();
  const out = runPython(env, helperPrelude + `
svc = ready(HighlightsService(fake=True))
sid, de = new_id(), new_id()
send(svc,"session-start",sid,de,1,origin="https://ratdetective.online",joined=True,observing=False)
svc.clock.offset_ms = 0
svc.scheduler.coverage_start_ms = monotonic_ms() - 45_000
original = svc.capture.save_replay
def slow(seconds, staging):
    time.sleep(0.4)
    return original(seconds, staging)
svc.capture.save_replay = slow
now = monotonic_ms()
send(svc,"marker",sid,de,2,id=new_id(),roundId="round-1aa",kind="double-kill",titleKey="double-kill",
     score=75,preMs=10000,postMs=0,presentedAtMs=now)
for item in svc.scheduler.pending:
    item.end_ms = monotonic_ms() - 1
    item.start_ms = monotonic_ms() - 8_000
svc._enqueue_due(monotonic_ms())
t0 = time.monotonic()
hb = send(svc,"heartbeat",sid,de,3,presentedAtMs=monotonic_ms())
elapsed = time.monotonic() - t0
svc.drain_media(timeout=2)
print(hb["status"], round(elapsed, 3), svc.library.conn.execute("select count(*) from clips").fetchone()[0])
`);
  const lines = out.split('\n');
  const last = lines[lines.length - 1].split(' ');
  assert.equal(last[0], 'accepted');
  assert.ok(Number(last[1]) < 0.25, `heartbeat blocked for ${last[1]}s`);
  assert.equal(last[2], '1');
});

test('save-replay sends an integer second count, matching installed gsr-cli', () => {
  const env = fixtureEnv();
  const out = runPython(env, `
from types import SimpleNamespace
from pathlib import Path
from highlights.capture import GsrCapture, replay_save_seconds, CaptureError
print(replay_save_seconds(18.34), replay_save_seconds(11.96), replay_save_seconds(0.4), replay_save_seconds(45.9))
g = GsrCapture()
g.process = SimpleNamespace(poll=lambda: None)
seen = []
g._cli = lambda args, timeout=30: seen.append(list(args)) or SimpleNamespace(returncode=1, stderr="expected integer", stdout="")
try:
    g.save_replay(18.34, Path("/tmp/rd-hl-replay.mp4"))
except CaptureError:
    pass
print(*seen[0])
`);
  assert.equal(out.split('\n')[0], '19 12 1 45');
  assert.equal(out.split('\n')[1], 'save-replay 19');
});

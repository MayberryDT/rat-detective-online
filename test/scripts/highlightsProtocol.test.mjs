import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '../..');
const py = (module, expr) => {
  const result = spawnSync('python3', ['-c', `
import sys
sys.path.insert(0, ${JSON.stringify(path.join(repo, 'omarchy/plugin/scripts'))})
from highlights.protocol import *
from highlights.framing import *
from highlights.redact import *
${expr}
`], {encoding: 'utf8'});
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
};

test('rejects unknown versions, oversized payloads and bad markers', () => {
  const out = py('protocol', `
import json
try:
    validate_browser_envelope({"version": 99, "type": "hello", "messageId": "aaaaaaaa", "sequence": 1})
    print("nope")
except ProtocolError as error:
    print(error.code, error.reason)
try:
    parse_json_bytes(b"x" * (16 * 1024 + 1))
    print("nope-size")
except ProtocolError as error:
    print("size", error.reason)
print(redact_recorder_text("restore_token=abc123deadbeef"))
`);
  assert.match(out, /incompatible/);
  assert.match(out, /size message too large/);
  assert.match(out, /\[redacted\]/);
});

test('hello and ping do not require a session id', () => {
  const out = py('protocol', `
hello = validate_browser_envelope({"version": 1, "type": "hello", "messageId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "sequence": 0})
ping = validate_browser_envelope({"version": 1, "type": "ping", "messageId": "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee", "sequence": 1, "presentedAtMs": 12})
print(hello["type"], ping["type"])
`);
  assert.match(out, /hello ping/);
});

test('accepts a well-formed marker and clamps intervals', () => {
  const out = py('protocol', `
marker = validate_browser_envelope({
    "version": 1, "type": "marker", "messageId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "sessionId": "11111111-2222-3333-4444-555555555555",
    "documentEpoch": "99999999-8888-7777-6666-555555555555",
    "sequence": 3, "id": "abcdef12-3456-7890-abcd-ef1234567890",
    "roundId": "round-1aa", "kind": "double-kill", "titleKey": "double-kill",
    "score": 75, "preMs": 10000, "postMs": 5000, "presentedAtMs": 12.5
})
print(marker["kind"], clamp_interval(40000, 40000))
`);
  assert.match(out, /double-kill/);
  assert.match(out, /30000/);
});

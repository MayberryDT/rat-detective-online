import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';

test('connector attaches only recognized HUD modes to session metadata', () => {
  let onMessage, mode = 'chain-of-custody';
  const sent = [];
  const window = {location: {origin: 'https://ratdetective.online'}, postMessage() {}, addEventListener(type, callback) { onMessage = callback; }};
  const document = {querySelector(selector) { assert.equal(selector, '.assignment-ledger[data-mode]'); return mode ? {dataset: {mode}} : null; }};
  const chrome = {runtime: {sendMessage(message) { sent.push(message); }}};
  vm.runInNewContext(readFileSync(new URL('../../omarchy/extension/content.js', import.meta.url), 'utf8'), {window, document, chrome});
  const send = (type, origin = window.location.origin) => onMessage({source: window, origin, data: {channel: 'rat-detective-highlights', payload: {type, gameMode: 'spoofed'}}});
  send('session-start');
  assert.equal(sent.at(-1).payload.gameMode, 'chain-of-custody');
  mode = 'jurisdiction'; send('heartbeat');
  assert.equal(sent.at(-1).payload.gameMode, 'jurisdiction');
  mode = 'unknown'; send('heartbeat');
  assert.equal(sent.at(-1).payload.gameMode, null);
  mode = null; send('heartbeat');
  assert.equal(sent.at(-1).payload.gameMode, null);
  send('heartbeat', 'https://unrelated.example');
  assert.equal(sent.length, 4);
});

test('session mode migration preserves history and accepted messages persist unique modes', () => {
  const result = spawnSync('python3', ['-c', `
import tempfile,os,sys,json
from pathlib import Path
with tempfile.TemporaryDirectory() as root:
    os.environ.update({key:root+'/'+key for key in ['HOME','XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_STATE_HOME','XDG_CACHE_HOME','XDG_RUNTIME_DIR']})
    sys.path.insert(0,'omarchy/plugin/scripts')
    from highlights.library import Library
    from highlights.service import HighlightsService
    lib=Library();lib.create_session('old-session','old-epoch')
    original=lib.list_sessions()[0]['started_at']
    lib.conn.execute('DROP TABLE session_modes')
    lib.conn.execute('DELETE FROM schema_migrations WHERE version=5')
    lib.close()
    svc=HighlightsService(fake=True);svc.enable()
    old=svc.library.list_sessions()[0]
    assert old['started_at']==original and old['game_modes']==[]
    msg=dict(version=1,channel='browser',type='session-start',messageId='message-0001',sequence=1,sessionId='session-test',documentEpoch='document-test',origin='https://ratdetective.online',joined=True,presentedAtMs=100,gameMode='chain-of-custody')
    assert svc.handle(json.dumps(msg).encode())['status']=='accepted'
    for sequence,mode in enumerate(['chain-of-custody','jurisdiction','invalid',None],2):
        msg.update(type='heartbeat',messageId='message-'+str(sequence).zfill(4),sequence=sequence,gameMode=mode)
        assert svc.handle(json.dumps(msg).encode())['status']=='accepted'
    msg.update(messageId='message-stale',sequence=10,documentEpoch='stale-document',gameMode='closing-time')
    assert svc.handle(json.dumps(msg).encode())['status']=='rejected'
    svc.library.record_session_mode('session-test',{})
    svc.library.record_session_mode('absent-session','closing-time')
    assert svc.library.list_sessions()[0]['game_modes']==['chain-of-custody','jurisdiction']
    other=Library()
    assert other.list_sessions()[0]['game_modes']==['chain-of-custody','jurisdiction']
    other.close();svc._stop_capture();svc.exports.stop();svc.media.stop();svc.library.close()
`], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr + result.stdout);
});

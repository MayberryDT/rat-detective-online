import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repo = path.resolve(import.meta.dirname, '../..');
const helper = path.join(repo, 'omarchy/plugin/scripts/rat-detective-desktop.py');
const installer = path.join(repo, 'omarchy/plugin/scripts/install-webapp.sh');
const uninstaller = path.join(repo, 'omarchy/plugin/scripts/uninstall-webapp.sh');

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'rat-desktop-'));
  const home = path.join(root, 'home');
  const bin = path.join(root, 'bin');
  mkdirSync(home, {recursive: true});
  mkdirSync(bin, {recursive: true});
  const calls = path.join(root, 'calls');
  const clients = path.join(root, 'clients.json');
  const binds = path.join(root, 'binds.json');
  writeFileSync(clients, '[]\n');
  writeFileSync(binds, '[]\n');
  const stub = (name, body) => {
    const target = path.join(bin, name);
    writeFileSync(target, `#!/usr/bin/env bash\nset -eu\n${body}\n`);
    chmodSync(target, 0o755);
    return target;
  };
  stub('hyprctl', `printf 'hyprctl' >>"$RAT_TEST_CALLS"; printf ' <%s>' "$@" >>"$RAT_TEST_CALLS"; printf '\\n' >>"$RAT_TEST_CALLS"
if [[ \${1:-} == clients ]]; then cat "$RAT_TEST_CLIENTS"; fi
if [[ \${1:-} == binds ]]; then cat "$RAT_TEST_BINDS"; exit "\${RAT_TEST_BINDS_EXIT:-0}"; fi
if [[ \${1:-} == configerrors && \${RAT_TEST_CONFIG_ERROR:-0} == 1 ]]; then printf 'bad config\\n'; fi`);
  stub('omarchy', `printf 'omarchy' >>"$RAT_TEST_CALLS"; printf ' <%s>' "$@" >>"$RAT_TEST_CALLS"; printf '\\n' >>"$RAT_TEST_CALLS"
if [[ -n \${RAT_TEST_CLIENT_ON_LAUNCH:-} && \${1:-} == launch ]]; then printf '%s\\n' "$RAT_TEST_CLIENT_ON_LAUNCH" >"$RAT_TEST_CLIENTS"; fi
exit "\${RAT_TEST_OMARCHY_EXIT:-0}"`);
  stub('omarchy-shell', `if [[ \${1:-} == lock && \${2:-} == isLocked ]]; then printf '%s\\n' "\${RAT_TEST_LOCK_OUTPUT:-false}"; exit "\${RAT_TEST_LOCK_EXIT:-0}"; fi; exit 1`);
  stub('omarchy-hyprland-session-locked', `exit "\${RAT_TEST_SESSION_LOCK_EXIT:-1}"`);
  stub('wl-copy', `payload=$(cat); printf 'wl-copy <%s>\\n' "$payload" >>"$RAT_TEST_CALLS"`);
  stub('xdg-open', `printf 'xdg-open <%s>\\n' "$1" >>"$RAT_TEST_CALLS"`);
  const env = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_DATA_HOME: path.join(home, '.local/share'),
    XDG_STATE_HOME: path.join(home, '.local/state'),
    PATH: `${bin}:${process.env.PATH}`,
    RAT_TEST_CALLS: calls,
    RAT_TEST_CLIENTS: clients,
    RAT_TEST_BINDS: binds,
    RAT_DETECTIVE_WINDOW_WAIT_SECONDS: '0',
    RAT_DETECTIVE_PROC_NAMES: '',
    RAT_DETECTIVE_BROWSER_DESKTOP: 'brave-origin.desktop',
  };
  return {root, home, bin, calls, clients, binds, env};
}

function invoke(fx, args, extraEnv = {}) {
  const result = spawnSync('python3', [helper, ...args], {env: {...fx.env, ...extraEnv}, encoding: 'utf8'});
  const payload = JSON.parse(result.stdout || '{}');
  return {result, payload};
}

function calls(fx) {
  try { return readFileSync(fx.calls, 'utf8'); } catch { return ''; }
}

test('return focuses an exact Rat Detective app identity and ignores a matching title', () => {
  const fx = fixture();
  writeFileSync(fx.clients, JSON.stringify([
    {address: '0xaaa', class: 'org.editor', title: 'Rat Detective', workspace: {name: '2'}, focusHistoryID: 0},
    {address: '0xabc', class: 'co.animasai.rat-detective', title: 'Rat Detective', workspace: {name: '7'}, focusHistoryID: 3},
  ]));
  const {payload} = invoke(fx, ['return']);
  assert.equal(payload.action, 'focused');
  assert.match(calls(fx), /hyprctl <dispatch> <hl\.dsp\.focus\(\{ window = "address:0xabc" \}\)>/);
  assert.doesNotMatch(calls(fx), /omarchy <launch>/);
});

test('return launches canonical app through an argv-safe adapter', async () => {
  const fx = fixture();
  const {payload} = invoke(fx, ['return']);
  assert.equal(payload.action, 'pending');
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.match(calls(fx), /omarchy <launch> <webapp> <https:\/\/ratdetective\.online\/>/);
  assert.doesNotMatch(calls(fx), /--class/);
});

test('optional workspace and fullscreen settings apply only to the observed game window', () => {
  const fx = fixture();
  invoke(fx, ['preferences', '--workspace', '8', '--fullscreen', 'true']);
  const appeared = JSON.stringify([
    {address: '0xdef', class: 'co.animasai.rat-detective', title: 'Rat Detective', workspace: {name: '1'}, focusHistoryID: 0},
  ]);
  const {payload} = invoke(fx, ['return'], {
    RAT_DETECTIVE_WINDOW_WAIT_SECONDS: '1',
    RAT_TEST_CLIENT_ON_LAUNCH: appeared,
  });
  assert.equal(payload.windowObserved, true);
  assert.match(calls(fx), /hl\.dsp\.window\.move\(\{ workspace = "8", follow = false, window = "address:0xdef" \}\)/);
  assert.match(calls(fx), /hl\.dsp\.focus\(\{ window = "address:0xdef" \}\)/);
  assert.match(calls(fx), /hyprctl <dispatch> <hl\.dsp\.window\.fullscreen\(\{ mode = "fullscreen", action = "set", window = "address:0xdef" \}\)>/);
});

test('join opens a separate validated invitation and rejects command-shaped rooms', async () => {
  const fx = fixture();
  writeFileSync(fx.clients, JSON.stringify([
    {address: '0xabc', class: 'co.animasai.rat-detective', title: 'Rat Detective', workspace: {name: '7'}, focusHistoryID: 0},
  ]));
  const room = 'public-live-v2-123e4567-e89b-42d3-a456-426614174000';
  const appeared = JSON.stringify([
    {address: '0xbeef', class: 'co.animasai.rat-detective.join-test', title: 'Rat Detective', workspace: {name: '7'}, focusHistoryID: 0},
  ]);
  const joined = invoke(fx, ['join', room], {RAT_TEST_CLIENT_ON_LAUNCH: appeared, RAT_DETECTIVE_WINDOW_WAIT_SECONDS: '1'});
  assert.equal(joined.payload.action, 'join-launched');
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.match(calls(fx), new RegExp(`omarchy <launch> <webapp> <https://ratdetective\\.online/\\?preferred=${room}>`));
  assert.doesNotMatch(calls(fx), /focuswindow/);
  const rejected = invoke(fx, ['join', 'public-live-v2;touch /tmp/nope']);
  assert.equal(rejected.result.status, 1);
  assert.match(rejected.payload.error, /published public/);
});

test('launch failures are reported and the recent pending guard prevents duplicates', async () => {
  const failedFx = fixture();
  const failed = invoke(failedFx, ['return'], {RAT_TEST_OMARCHY_EXIT: '7', RAT_DETECTIVE_WINDOW_WAIT_SECONDS: '0.2'});
  assert.equal(failed.result.status, 1);
  assert.equal(failed.payload.action, 'launch-failed');
  assert.equal(failed.payload.exitCode, 7);

  const guardedFx = fixture();
  assert.equal(invoke(guardedFx, ['return']).payload.action, 'pending');
  assert.equal(invoke(guardedFx, ['return']).payload.action, 'pending');
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal((calls(guardedFx).match(/omarchy <launch>/g) || []).length, 1);
});

test('launcher repair writes canonical durable entry and backs up the legacy launcher', () => {
  const fx = fixture();
  const applications = path.join(fx.env.XDG_DATA_HOME, 'applications');
  mkdirSync(applications, {recursive: true});
  const desktop = path.join(applications, 'Rat Detective.desktop');
  writeFileSync(desktop, 'Exec=omarchy-launch-webapp "https://rat-detective.animasai.co"\n');
  execFileSync('bash', [installer], {env: fx.env});
  const text = readFileSync(desktop, 'utf8');
  assert.match(text, /rat-detective\/rat-detective-desktop\.py" return/);
  assert.match(text, /StartupWMClass=brave-ratdetective\.online__-Default/);
  assert.doesNotMatch(text, /animasai\.co/);
  assert.match(readFileSync(path.join(fx.env.XDG_DATA_HOME, 'rat-detective/rat-detective-desktop.py'), 'utf8'), /APP_URL = "https:\/\/ratdetective\.online\/"/);
  const state = invoke(fx, ['status']).payload.launcher;
  assert.deepEqual({installed: state.installed, canonical: state.canonical, durable: state.durable}, {installed: true, canonical: true, durable: true});
  const backups = execFileSync('find', [applications, '-name', '*.rat-detective-backup-*'], {encoding: 'utf8'}).trim().split('\n').filter(Boolean);
  assert.equal(backups.length, 1);
});

test('direct helper install supports fresh setup, idempotence and durable-helper upgrade backup', () => {
  const fx = fixture();
  const icon = path.join(repo, 'omarchy/plugin/icon.png');
  const fresh = invoke(fx, ['install-launcher', '--icon', icon]);
  assert.equal(fresh.result.status, 0, fresh.result.stderr);
  const durable = path.join(fx.env.XDG_DATA_HOME, 'rat-detective/rat-detective-desktop.py');
  assert.equal(readFileSync(durable, 'utf8'), readFileSync(helper, 'utf8'));
  assert.equal(fresh.payload.helperBackup, null);

  const repeated = invoke(fx, ['install-launcher', '--icon', icon]);
  assert.equal(repeated.result.status, 0);
  assert.equal(repeated.payload.helperBackup, null);

  writeFileSync(durable, '#!/usr/bin/env python3\nAPP_URL = "https://old.example/"\n');
  const upgraded = invoke(fx, ['install-launcher', '--icon', icon]);
  assert.equal(upgraded.result.status, 0);
  assert.match(upgraded.payload.helperBackup, /rat-detective-desktop\.py\.previous$/);
  assert.equal(readFileSync(`${durable}.previous`, 'utf8'), '#!/usr/bin/env python3\nAPP_URL = "https://old.example/"\n');
  assert.equal(readFileSync(durable, 'utf8'), readFileSync(helper, 'utf8'));
});

test('launcher health distinguishes canonical direct entries from stale durable helpers', () => {
  const directFx = fixture();
  const applications = path.join(directFx.env.XDG_DATA_HOME, 'applications');
  mkdirSync(applications, {recursive: true});
  writeFileSync(path.join(applications, 'Rat Detective.desktop'), '[Desktop Entry]\nExec=omarchy-launch-webapp "https://ratdetective.online/"\n');
  const direct = invoke(directFx, ['status']).payload.launcher;
  assert.equal(direct.canonical, true);
  assert.equal(direct.durable, false);

  const staleFx = fixture();
  execFileSync('bash', [installer], {env: staleFx.env});
  const durableHelper = path.join(staleFx.env.XDG_DATA_HOME, 'rat-detective/rat-detective-desktop.py');
  writeFileSync(durableHelper, readFileSync(durableHelper, 'utf8').replace('APP_URL = "https://ratdetective.online/"', 'APP_URL = "https://old.example/"'));
  const stale = invoke(staleFx, ['status']).payload.launcher;
  assert.equal(stale.durable, true);
  assert.equal(stale.canonical, false);
});

test('explicit launcher removal also removes its shortcut and keeps backups recoverable', () => {
  const fx = fixture();
  execFileSync('bash', [installer], {env: fx.env});
  const bindings = path.join(fx.env.XDG_CONFIG_HOME, 'hypr/bindings.lua');
  mkdirSync(path.dirname(bindings), {recursive: true});
  writeFileSync(bindings, '-- before\n-- rat-detective-dispatch: shortcut start\no.bind("SUPER + SHIFT + R", "Rat Detective", "helper return")\n-- rat-detective-dispatch: shortcut end\n');
  execFileSync('bash', [uninstaller], {env: fx.env});
  assert.doesNotMatch(readFileSync(bindings, 'utf8'), /rat-detective-dispatch/);
  assert.equal(spawnSync('test', ['-e', path.join(fx.env.XDG_DATA_HOME, 'applications/Rat Detective.desktop')]).status, 1);
  assert.equal(spawnSync('test', ['-e', path.join(fx.env.XDG_DATA_HOME, 'rat-detective/rat-detective-desktop.py')]).status, 1);
});

test('shortcut install refuses conflicts and validates a new current-syntax o.bind', () => {
  const fx = fixture();
  const bindings = path.join(fx.env.XDG_CONFIG_HOME, 'hypr/bindings.lua');
  mkdirSync(path.dirname(bindings), {recursive: true});
  writeFileSync(bindings, 'o.bind("SUPER + R", "Existing", "thing")\n');
  mkdirSync(path.join(fx.env.XDG_DATA_HOME, 'rat-detective'), {recursive: true});
  writeFileSync(path.join(fx.env.XDG_DATA_HOME, 'rat-detective/rat-detective-desktop.py'), '#!/bin/sh\n');
  const conflict = invoke(fx, ['shortcut-install', 'SUPER + R']);
  assert.equal(conflict.result.status, 1);
  assert.match(conflict.payload.error, /already bound/);
  const installed = invoke(fx, ['shortcut-install', 'SUPER + SHIFT + R']);
  assert.equal(installed.result.status, 0, installed.result.stderr);
  assert.match(readFileSync(bindings, 'utf8'), /o\.bind\("SUPER \+ SHIFT \+ R", "Rat Detective"/);
  assert.match(calls(fx), /hyprctl <reload>/);
  assert.match(calls(fx), /hyprctl <configerrors>/);
});

test('shortcut install refuses inherited live bindings and unavailable compositor state', () => {
  const inheritedFx = fixture();
  const bindings = path.join(inheritedFx.env.XDG_CONFIG_HOME, 'hypr/bindings.lua');
  mkdirSync(path.dirname(bindings), {recursive: true});
  writeFileSync(bindings, '-- no local collision\n');
  mkdirSync(path.join(inheritedFx.env.XDG_DATA_HOME, 'rat-detective'), {recursive: true});
  writeFileSync(path.join(inheritedFx.env.XDG_DATA_HOME, 'rat-detective/rat-detective-desktop.py'), '#!/bin/sh\n');
  writeFileSync(inheritedFx.binds, JSON.stringify([{modmask: 69, key: 'R', description: 'Inherited reminder'}]));
  const inherited = invoke(inheritedFx, ['shortcut-install', 'SUPER + CTRL + SHIFT + R']);
  assert.equal(inherited.result.status, 1);
  assert.match(inherited.payload.error, /already active in Hyprland \(Inherited reminder\)/);
  assert.equal(readFileSync(bindings, 'utf8'), '-- no local collision\n');

  const unavailableFx = fixture();
  const unavailableBindings = path.join(unavailableFx.env.XDG_CONFIG_HOME, 'hypr/bindings.lua');
  mkdirSync(path.dirname(unavailableBindings), {recursive: true});
  writeFileSync(unavailableBindings, '-- unchanged\n');
  mkdirSync(path.join(unavailableFx.env.XDG_DATA_HOME, 'rat-detective'), {recursive: true});
  writeFileSync(path.join(unavailableFx.env.XDG_DATA_HOME, 'rat-detective/rat-detective-desktop.py'), '#!/bin/sh\n');
  const unavailable = invoke(unavailableFx, ['shortcut-install', 'SUPER + SHIFT + R'], {RAT_TEST_BINDS_EXIT: '3'});
  assert.equal(unavailable.result.status, 1);
  assert.match(unavailable.payload.error, /could not read Hyprland's active shortcuts/);
  assert.equal(readFileSync(unavailableBindings, 'utf8'), '-- unchanged\n');
});

test('shortcut validation failure restores the previous bindings', () => {
  const fx = fixture();
  const bindings = path.join(fx.env.XDG_CONFIG_HOME, 'hypr/bindings.lua');
  mkdirSync(path.dirname(bindings), {recursive: true});
  writeFileSync(bindings, '-- original\n');
  mkdirSync(path.join(fx.env.XDG_DATA_HOME, 'rat-detective'), {recursive: true});
  writeFileSync(path.join(fx.env.XDG_DATA_HOME, 'rat-detective/rat-detective-desktop.py'), '#!/bin/sh\n');
  const attempted = invoke(fx, ['shortcut-install', 'SUPER + SHIFT + R'], {RAT_TEST_CONFIG_ERROR: '1'});
  assert.equal(attempted.result.status, 1);
  assert.equal(readFileSync(bindings, 'utf8'), '-- original\n');
});

test('record controls never toggle an existing recorder and never enable microphone audio', () => {
  const fx = fixture();
  const existing = invoke(fx, ['record-start'], {RAT_DETECTIVE_PROC_NAMES: 'gpu-screen-recorder'});
  assert.equal(existing.payload.action, 'already-recording');
  assert.equal(calls(fx), '');
  const configured = invoke(fx, ['preferences', '--desktop-audio', 'true']);
  assert.equal(configured.payload.preferences.desktopAudio, true);
  const started = invoke(fx, ['record-start']);
  assert.equal(started.payload.action, 'started');
  assert.match(calls(fx), /omarchy <capture> <screenrecording> <--fullscreen> <--with-desktop-audio>/);
  assert.doesNotMatch(calls(fx), /microphone/);
});

test('status reports window, lock, DND, recording, launcher and preferences', () => {
  const fx = fixture();
  writeFileSync(fx.clients, JSON.stringify([
    {address: '0xabc', class: 'brave-rat-detective.animasai.co__-Default', title: 'Rat Detective', workspace: {name: '7'}, focusHistoryID: 0},
  ]));
  mkdirSync(path.join(fx.env.XDG_STATE_HOME, 'omarchy'), {recursive: true});
  writeFileSync(path.join(fx.env.XDG_STATE_HOME, 'omarchy/notifications.json'), '{"version":3,"dnd":true}\n');
  const {payload} = invoke(fx, ['status'], {RAT_DETECTIVE_PROC_NAMES: 'gpu-screen-recorder', RAT_TEST_LOCK_OUTPUT: 'true'});
  assert.equal(payload.locked, true);
  assert.equal(payload.lockState, 'locked');
  assert.equal(payload.dnd, 'on');
  assert.equal(payload.recording, true);
  assert.equal(payload.windowOpen, true);
  assert.equal(payload.focused, true);
  assert.equal(payload.launcher.installed, false);
  assert.deepEqual(payload.preferences, {workspace: null, fullscreen: false, desktopAudio: false});
});

test('lock observation falls back to compositor session state and preserves unknown', () => {
  const lockedFx = fixture();
  const locked = invoke(lockedFx, ['status'], {RAT_TEST_LOCK_EXIT: '1', RAT_TEST_SESSION_LOCK_EXIT: '0'}).payload;
  assert.equal(locked.lockState, 'locked');
  assert.equal(locked.locked, true);

  const unknownFx = fixture();
  const unknown = invoke(unknownFx, ['status'], {RAT_TEST_LOCK_EXIT: '1', RAT_TEST_SESSION_LOCK_EXIT: '2'}).payload;
  assert.equal(unknown.lockState, 'unknown');
  assert.equal(unknown.locked, false);
});

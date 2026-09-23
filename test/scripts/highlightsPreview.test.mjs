import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync, readFileSync, statSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

test('edit frames preserve time, reuse cache, and never modify the recording', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'highlights-preview-'));
  const run = (program, args, env = process.env) => {
    const result = spawnSync(program, args, {env, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr + result.stdout);
    return result.stdout;
  };
  try {
    const source = path.join(root, 'source with spaces.mp4');
    run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=60:duration=2', '-c:v', 'libx264', '-g', '120', source]);
    const original = readFileSync(source);
    const env = {...process.env, XDG_CACHE_HOME: path.join(root, 'cache')};
    const args = ['omarchy/plugin/scripts/highlights-preview.py', pathToFileURL(source).href];
    const preview = JSON.parse(run('python3', args, env));
    assert.equal(preview.count, 120);
    assert.equal(preview.fps, 60);
    const frame = new URL('000060.jpg', preview.url);
    const modified = statSync(frame).mtimeMs;
    const reference = path.join(root, 'reference.jpg');
    run('ffmpeg', ['-v', 'error', '-threads', '2', '-i', source, '-vf', 'fps=60,scale=854:480:force_original_aspect_ratio=decrease,select=eq(n\\,60)', '-frames:v', '1', '-q:v', '4', '-threads', '2', reference]);
    assert.deepEqual(readFileSync(frame), readFileSync(reference), 'one-second preview is the exact decoded frame');
    assert.deepEqual(JSON.parse(run('python3', args, env)), preview);
    assert.equal(statSync(frame).mtimeMs, modified, 'reopen uses already decoded frames');
    const cut = JSON.parse(run('python3', [...args, '850', '1750'], env));
    const info = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', new URL(cut.playback).pathname]));
    assert.ok(Math.abs(Number(info.format.duration) - 0.9) < 0.04, 'normal playback file contains only the saved 900ms');
    assert.deepEqual(JSON.parse(run('python3', [...args, '850', '1750'], env)), cut);
    assert.deepEqual(readFileSync(source), original);
  } finally { rmSync(root, {recursive: true, force: true}); }
});

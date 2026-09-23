import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync, mkdirSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const repo = path.resolve(import.meta.dirname, '../..');
const scripts = path.join(repo, 'omarchy/plugin/scripts');

function ffmpeg(...args) {
  const result = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], {encoding: 'utf8'});
  if (result.status !== 0) throw new Error(result.stderr || 'ffmpeg failed');
}

test('ffmpeg trim and reel concat produce playable h264/aac mp4', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'rat-media-'));
  const a = path.join(root, 'a.mp4');
  const b = path.join(root, 'b.mp4');
  ffmpeg('-f', 'lavfi', '-i', 'color=c=red:s=64x64:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', a);
  ffmpeg('-f', 'lavfi', '-i', 'color=c=blue:s=80x48:d=1', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=1', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', b);
  const env = {
    ...process.env,
    HOME: path.join(root, 'home'),
    XDG_CONFIG_HOME: path.join(root, 'home/.config'),
    XDG_DATA_HOME: path.join(root, 'home/.local/share'),
    XDG_STATE_HOME: path.join(root, 'home/.local/state'),
    XDG_CACHE_HOME: path.join(root, 'home/.cache'),
    XDG_RUNTIME_DIR: path.join(root, 'run'),
    PYTHONPATH: scripts,
  };
  mkdirSync(env.XDG_RUNTIME_DIR, {recursive: true});
  const dest = path.join(root, 'out.mp4');
  const reel = path.join(root, 'reel.mp4');
  const result = spawnSync('python3', ['-c', `
from pathlib import Path
from highlights.export import export_clip, export_reel, probe
from highlights.library import Library
info = export_clip(Path(${JSON.stringify(a)}), Path(${JSON.stringify(dest)}), 200, 800)
print(info["codec"], info["audioCodec"], info["durationMs"] > 400)
lib = Library()
# Reel exporter needs catalog rows; copy the two fixtures as ready sources.
from highlights import paths
import shutil, os
clips=[]
for i, src in enumerate([${JSON.stringify(a)}, ${JSON.stringify(b)}]):
    staging = paths.staging_dir() / f"m{i}.mp4"
    shutil.copy2(src, staging)
    clip = lib.publish_clip(staging=staging, session_id="session-media", epoch="epoch-media", duration_ms=1000,
        requested_start_ms=i*2000, requested_end_ms=i*2000+1000, actual_start_ms=200, actual_end_ms=800,
        profile="normal", score=70, title="Moment", title_key="double-kill", kind="double-kill",
        detector_version=1, truncated=False, uncertainty_ms=0, marker_ids=[f"media-{i}aa"], event_ms=i*2000+200,
        event_offset_ms=200, capture_start_ms=i*2000, capture_end_ms=i*2000+1000)
    clips.append(clip)
reel_info = export_reel(lib, [{"clip_id": clips[0]["id"], "trim_in_ms": 0, "trim_out_ms": 400}, {"clip_id": clips[1]["id"], "trim_in_ms": 0, "trim_out_ms": 400}], Path(${JSON.stringify(reel)}))
print("reel", reel_info["codec"], reel_info["durationMs"] > 500)
`], {encoding: 'utf8', env});
  if (result.status !== 0) throw new Error(result.stderr + result.stdout);
  assert.match(result.stdout, /h264 aac True/);
  assert.match(result.stdout, /reel h264/);
});

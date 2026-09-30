#!/usr/bin/env node
// How the game runs on players' machines, from the `perf` facts in the city map mirror (docs/city-map.md).
// Usage: node scripts/city-mirror.mjs && node scripts/perf-report.mjs [--db=output/city/city.db] [--room=public-live-v2]
//        [--since=ISO] [--until=ISO] [--json=out.json]
// Actors are numbered per round, so a session is one machine (os, browser, GPU, screen) in one room with no gap
// over 90 s between its reports. Percentiles cannot be pooled across windows: a session's p50 is frame-weighted,
// its p95/p99 the median of its windows, its worst the worst of them.
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const db = new DatabaseSync(arg('db', 'output/city/city.db'), { readOnly: true });
const room = arg('room', undefined), since = Date.parse(arg('since', '2000-01-01')), until = Date.parse(arg('until', '2100-01-01'));
const GAP_MS = 90_000;

const reports = db.prepare("select data from facts where type = 'perf' and t between ? and ? order by t").all(since, until)
  .map(r => JSON.parse(r.data)).filter(f => room === undefined || f.room === room);
if (!reports.length) { console.log('No perf facts in the mirror for this range. Run node scripts/city-mirror.mjs first.'); process.exit(0); }

const backend = gpu => /Direct3D11|D3D11/i.test(gpu) ? 'D3D11' : /Direct3D9|D3D9/i.test(gpu) ? 'D3D9' : /Vulkan/i.test(gpu) ? 'Vulkan'
  : /Metal/i.test(gpu) ? 'Metal' : /OpenGL/i.test(gpu) ? 'OpenGL' : '?';
const machine = f => [f.os ?? '?', `${f.browser ?? '?'}${f.browserMajor ? ` ${f.browserMajor}` : ''}`, f.gpu ?? '?', `${f.w}x${f.h}`, f.dpr, f.pr, f.cores, f.memGb].join('|');
const median = xs => { const s = xs.filter(x => x !== undefined).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : undefined; };
const sum = (xs, fn) => xs.reduce((t, x) => t + (fn(x) ?? 0), 0);
const r1 = n => n === undefined ? '–' : (Math.round(n * 10) / 10).toString();

const open = new Map(), sessions = [];
for (const f of reports) {
  const key = `${f.room}|${machine(f)}`, s = open.get(key);
  if (s && f.t - s.last <= GAP_MS + f.ms) { s.reports.push(f); s.last = f.t; continue; }
  const next = { room: f.room, machine: f, reports: [f], first: f.t - f.ms, last: f.t };
  open.set(key, next); sessions.push(next);
}

const summarize = rs => {
  const frames = sum(rs, r => r.frames), ms = sum(rs, r => r.ms);
  return { reports: rs.length, minutes: ms / 60_000, frames, fps: frames * 1000 / ms, p50: sum(rs, r => r.p50 * r.frames) / frames,
    p95: median(rs.map(r => r.p95)), p99: median(rs.map(r => r.p99)), worst: Math.max(...rs.map(r => r.worst)),
    over33: sum(rs, r => r.over33) / frames, hitchesPerMin: sum(rs, r => r.over100) / (ms / 60_000),
    cpu50: median(rs.map(r => r.cpu50)), cpu95: median(rs.map(r => r.cpu95)), heapMb: Math.max(0, ...rs.map(r => r.heapMb ?? 0)) || undefined,
    quality: [...new Set(rs.map(r => r.quality && `${r.quality}${r.scale ? `@${r.scale}` : ''}`).filter(Boolean))].join(',') || undefined };
};
const row = s => `${r1(s.minutes).padStart(5)} min  ${r1(s.fps).padStart(5)} fps  p50 ${r1(s.p50).padStart(5)}  p95 ${r1(s.p95).padStart(5)}  p99 ${r1(s.p99).padStart(6)}  worst ${r1(s.worst).padStart(6)} ms  `
  + `>33 ms ${(s.over33 * 100).toFixed(1).padStart(4)}%  hitches ${r1(s.hitchesPerMin).padStart(4)}/min  cpu p50/p95 ${r1(s.cpu50)}/${r1(s.cpu95)} ms`
  + `${s.heapMb ? `  heap ${Math.round(s.heapMb)} MB` : ''}${s.quality ? `  quality ${s.quality}` : ''}`;

console.log(`# Perf: ${reports.length} reports, ${sessions.length} sessions, ${new Date(reports[0].t).toISOString()} to ${new Date(reports.at(-1).t).toISOString()}`);
console.log('\n## Sessions');
const out = sessions.map(s => ({ room: s.room, start: new Date(s.first).toISOString(), os: s.machine.os, browser: s.machine.browser, browserMajor: s.machine.browserMajor,
  gpu: s.machine.gpu, backend: backend(s.machine.gpu ?? ''), w: s.machine.w, h: s.machine.h, dpr: s.machine.dpr, pr: s.machine.pr, cores: s.machine.cores, memGb: s.machine.memGb,
  ...summarize(s.reports) }));
for (const s of out) {
  console.log(`\n${s.start}  ${s.room}  ${s.os ?? '?'} · ${s.browser ?? '?'} ${s.browserMajor ?? ''} · ${s.backend} · ${s.w}x${s.h} (dpr ${s.dpr}, render ${s.pr}) · ${s.cores ?? '?'} cores · ${s.memGb ?? '?'} GB`);
  console.log(`  ${s.gpu ?? 'GPU unknown'}`);
  console.log(`  ${row(s)}`);
}

for (const [title, keyOf] of [['OS', r => r.os ?? '?'], ['OS and GPU', r => `${r.os ?? '?'} · ${r.gpu ?? '?'}`]]) {
  console.log(`\n## By ${title}`);
  const groups = new Map();
  for (const r of reports) { const k = keyOf(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  for (const [k, rs] of [...groups].sort((a, b) => sum(b[1], r => r.ms) - sum(a[1], r => r.ms))) console.log(`${k}\n  ${row(summarize(rs))}`);
}

const json = arg('json', undefined);
if (json) writeFileSync(json, JSON.stringify({ sessions: out }, null, 2));

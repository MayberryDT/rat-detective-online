#!/usr/bin/env node
// Tyler's admin controls for the canonical room (docs/live-service.md, "Admin controls").
// Usage: node scripts/admin.mjs [--base=https://ratdetective.online] <command>
//   status                      the room: round, mode, next mode, leader, incident, rats
//   end-round                   end the round now; the current leader wins (normal results and lineup)
//   next-mode <id>              the next round's mode: chain-of-custody, excessive-force or jurisdiction
//   incident [<id>]             roll an incident now (a chosen one, or the ordinary draw)
//   incident end                end the incident rolling or under way
//   reset-case                  send the case back to a fresh spot
// Key: ADMIN_TOKEN, or ~/.config/rat-detective/admin-token (the Worker secret of the same name). Never printed.
// Every command but status is recorded as an `admin` city fact.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { base: { type: 'string', default: 'https://ratdetective.online' } } });
const base = values.base.replace(/\/$/, '');
const [name, arg] = positionals;
const usage = () => { process.stderr.write('Usage: node scripts/admin.mjs [--base=URL] status | end-round | next-mode <id> | incident [<id>|end] | reset-case\n'); process.exit(2); };
const request = name === 'status' ? { path: 'status' }
  : name === 'end-round' || name === 'reset-case' ? { path: name, body: {} }
  : name === 'next-mode' && arg ? { path: 'next-mode', body: { mode: arg } }
  : name === 'incident' ? arg === 'end' ? { path: 'end-incident', body: {} } : { path: 'incident', body: arg ? { incident: arg } : {} }
  : usage();
if (positionals.length > (name === 'next-mode' || name === 'incident' ? 2 : 1)) usage();

let token = process.env.ADMIN_TOKEN?.trim();
if (!token) {
  try { token = readFileSync(`${homedir()}/.config/rat-detective/admin-token`, 'utf8').trim(); }
  catch { process.stderr.write('No admin key: set ADMIN_TOKEN or write it to ~/.config/rat-detective/admin-token\n'); process.exit(1); }
}

const response = await fetch(`${base}/api/admin/v1/${request.path}`, {
  method: request.body ? 'POST' : 'GET',
  headers: { authorization: `Bearer ${token}`, ...(request.body ? { 'content-type': 'application/json' } : {}) },
  ...(request.body ? { body: JSON.stringify(request.body) } : {}),
  signal: AbortSignal.timeout(15_000),
});
const text = await response.text();
let result;
try { result = JSON.parse(text); } catch { process.stderr.write(`HTTP ${response.status}: ${text.slice(0, 200)}\n`); process.exit(1); }
if (result.error) { process.stderr.write(`HTTP ${response.status}: ${result.error}\n`); process.exit(1); }
const s = result.status;
if (name !== 'status') process.stdout.write(`${result.ok ? 'OK' : 'NOT DONE'}: ${result.message}\n`);
if (s) {
  const incident = s.incident.phase === 'ready' ? 'none' : `${s.incident.id ?? '?'} ${s.incident.phase}${s.incident.leftMs ? ` (${Math.ceil(s.incident.leftMs / 1000)} s left)` : ''}`;
  process.stdout.write([
    `room      ${s.room}`, `round     ${s.phase === 'won' ? 'results' : s.mode ?? 'starting'}`, `next      ${s.nextMode ?? 'shuffle'}`,
    `leader    ${s.leader ?? 'nobody'}`, `incident  ${incident}`, `rats      ${s.humans} human, ${s.bots} bot`, `incidents ${s.incidents.join(', ')}`,
  ].join('\n') + '\n');
}
process.exit(result.ok ? 0 : 1);

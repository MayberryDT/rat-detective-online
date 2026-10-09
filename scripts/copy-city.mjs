// The public room's move (docs/live-service.md, "The public room"): copies the old public room's city history
// (aggregates, packs, the last 30 days of events) into the new one, a few seconds a call, until done. Resumable: the
// room keeps the place it reached, so a run can stop and start again; a finished copy answers done at once.
// node scripts/copy-city.mjs https://rat-detective-staging.mayberrydt.workers.dev
// Token: CITY_TOKEN, or ~/.config/rat-detective/city-token.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const base = (process.argv[2] ?? 'https://ratdetective.online').replace(/\/$/, '');
const token = process.env.CITY_TOKEN ?? readFileSync(`${homedir()}/.config/rat-detective/city-token`, 'utf8').trim();
const started = Date.now();
for (;;) {
  const response = await fetch(`${base}/api/city/v1/copy`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`copy: ${response.status} ${await response.text()}`);
  const progress = await response.json();
  console.log(`${Math.round((Date.now() - started) / 1000)}s  ${progress.step ?? 'done'}  ${progress.copied} rows`);
  if (progress.done) break;
}

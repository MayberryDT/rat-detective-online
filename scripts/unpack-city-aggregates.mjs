// The rollback step for packed city aggregates (docs/live-service.md, "Rolling back past packed aggregates"). Every
// GameRoom keeps its own aggregates, so this drains each one: it lists every GameRoom object that holds storage (the
// Cloudflare API) or takes the ids it is given, then calls POST /api/city/v1/unpack?id=<id> until each says `left` 0,
// then sweeps every object once more so nothing written meanwhile is missed. Needs the deploy in
// CITY_AGGREGATES=rows (a 409 stops it) and the city token.
// Usage: node scripts/unpack-city-aggregates.mjs --base <origin> (--env production|staging | --ids <id,id,…>) [--output file.json]
//        node scripts/unpack-city-aggregates.mjs --env production|staging --list   (read-only: the object ids it would drain)
//   CITY_TOKEN, or ~/.config/rat-detective/city-token; for --env, CLOUDFLARE_API_TOKEN (else wrangler's login) and
//   optionally CLOUDFLARE_ACCOUNT_ID.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { base: { type: 'string' }, env: { type: 'string' }, ids: { type: 'string' }, output: { type: 'string' }, list: { type: 'boolean', default: false } } });
const SCRIPTS = { production: 'rat-detective-preview', staging: 'rat-detective-staging' };
if ((!values.base && !values.list) || (!values.ids && !SCRIPTS[values.env])) {
  console.error('Usage: node scripts/unpack-city-aggregates.mjs --base <origin> (--env production|staging | --ids <id,id,…>) [--output file.json] | --env <env> --list');
  process.exit(2);
}
const tokenFile = join(homedir(), '.config/rat-detective/city-token');
const cityToken = process.env.CITY_TOKEN ?? (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '');
if (!cityToken) throw new Error('No CITY_TOKEN');

/** Every GameRoom object with stored data in the environment's namespace. */
async function listObjects(env) {
  const wranglerConfig = join(homedir(), '.config/.wrangler/config/default.toml');
  const apiToken = process.env.CLOUDFLARE_API_TOKEN ?? (existsSync(wranglerConfig) ? readFileSync(wranglerConfig, 'utf8').match(/^oauth_token = "([^"]+)"/m)?.[1] : undefined);
  if (!apiToken) throw new Error('No CLOUDFLARE_API_TOKEN or wrangler login');
  const api = async path => {
    const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, { headers: { authorization: `Bearer ${apiToken}` } });
    const body = await response.json();
    if (!body.success) throw new Error(`${path}: ${JSON.stringify(body.errors)}`);
    return body;
  };
  const account = process.env.CLOUDFLARE_ACCOUNT_ID ?? (await api('/accounts')).result[0].id;
  const namespaces = (await api(`/accounts/${account}/workers/durable_objects/namespaces?per_page=1000`)).result;
  const namespace = namespaces.find(n => n.script === SCRIPTS[env] && n.class === 'GameRoom');
  if (!namespace) throw new Error(`No GameRoom namespace for ${SCRIPTS[env]}`);
  const ids = [];
  let cursor;
  do {
    const page = await api(`/accounts/${account}/workers/durable_objects/namespaces/${namespace.id}/objects?limit=1000${cursor ? `&cursor=${cursor}` : ''}`);
    for (const o of page.result) if (o.hasStoredData) ids.push(o.id);
    cursor = page.result_info?.cursor && page.result.length ? page.result_info.cursor : undefined;
  } while (cursor);
  return ids;
}

async function unpack(id) {
  const response = await fetch(`${values.base}/api/city/v1/unpack?id=${id}`, { method: 'POST', headers: { authorization: `Bearer ${cityToken}` } });
  const body = await response.json();
  if (response.status === 409) throw new Error(`${id}: ${body.message} Deploy with CITY_AGGREGATES=rows first.`);
  if (!response.ok) throw new Error(`${id}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

const ids = values.ids ? values.ids.split(',').filter(Boolean) : await listObjects(values.env);
if (values.list) { console.log(JSON.stringify({ env: values.env, rooms: ids.length, ids }, null, 2)); process.exit(0); }
const rooms = {};
for (const id of ids) {
  const room = rooms[id] = { calls: 0, packs: 0, counts: 0, left: -1 };
  do { const r = await unpack(id); room.calls++; room.packs += r.packs; room.counts += r.counts; room.left = r.left; } while (room.left > 0);
}
// A second sweep: every room must still read 0 packs.
const sweep = {};
for (const id of ids) sweep[id] = (await unpack(id)).left;
const leftover = Object.entries(sweep).filter(([, left]) => left !== 0);
const result = { at: new Date().toISOString(), base: values.base, rooms: ids.length, packsMoved: Object.values(rooms).reduce((t, r) => t + r.packs, 0),
  countsMoved: Object.values(rooms).reduce((t, r) => t + r.counts, 0), drained: leftover.length === 0, perRoom: rooms, sweep };
if (values.output) writeFileSync(values.output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, perRoom: undefined, sweep: undefined }, null, 2));
if (leftover.length) { console.error(`Packs left in ${leftover.length} room(s): ${leftover.map(([id]) => id).join(', ')}`); process.exit(1); }

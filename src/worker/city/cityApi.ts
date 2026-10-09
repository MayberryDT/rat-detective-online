import { DEFAULT_ROOM_NAME } from '../../shared/networkProtocol';
import { cityModel, type CityModel } from '../../shared/city/model';
import { heatRange } from '../HeatMap';
import { verifyBearerToken } from '../auth';
import { cityDigest } from './digest';
import { BUILD_NAME, type Filter } from './CityStore';

/** The city map's agent surfaces (docs/city-map.md, "Agent surfaces"). Aggregates are public;
 * discrete events and the raw archive need the CITY_TOKEN bearer token. */
export type CityEnv = Env & { CITY_TOKEN?: string };
const PUBLIC = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: PUBLIC });
let model: CityModel | undefined;
/** About this much packed JSON moves per unpack call (a few tens of thousands of per-key rows). */
const UNPACK_BYTES = 1024 * 1024;
/** The public room before the move to Chicago (9 October); it sleeps with its history as a backup. */
export const PREVIOUS_ROOM_NAME = 'public-live-v2';
const COPY_BUDGET_MS = 8_000;

function filterOf(params: URLSearchParams): Filter | null {
  const mode = params.get('mode'), layout = params.get('layout'), build = params.get('build');
  if (mode !== null && !/^[a-z-]{1,40}$/.test(mode)) return null;
  if (layout !== null && !/^\d{1,4}$/.test(layout)) return null;
  if (build !== null && !BUILD_NAME.test(build)) return null;
  return { ...(mode ? { mode } : {}), ...(layout ? { layout: Number(layout) } : {}), ...(build ? { build } : {}) };
}

/** Handles `/api/heat/v1` and `/api/city/v1/*`; null for any other path. */
export async function cityApi(request: Request, url: URL, env: CityEnv): Promise<Response | null> {
  const path = url.pathname;
  if (path !== '/api/heat/v1' && !path.startsWith('/api/city/v1/')) return null;
  const unpack = path === '/api/city/v1/unpack', copy = path === '/api/city/v1/copy';
  if (request.method !== (unpack || copy ? 'POST' : 'GET')) return json({ error: 'Method not allowed' }, 405);
  const room = env.GAME_ROOM.getByName(DEFAULT_ROOM_NAME), now = Date.now();
  const range = heatRange(url.searchParams, now), filter = filterOf(url.searchParams);
  const badRange = () => json({ error: 'Use days=1-3650, days=all, or from and to as YYYY-MM-DD; mode, layout and build are optional' }, 400);
  switch (path) {
    case '/api/heat/v1':
      if (!range || !filter) return badRange();
      return json({ room: DEFAULT_ROOM_NAME, ...await room.cityHeat(range, filter) });
    case '/api/city/v1/model':
      model ??= cityModel();
      return json(model);
    case '/api/city/v1/places':
      if (!range || !filter) return badRange();
      return json({ room: DEFAULT_ROOM_NAME, ...await room.cityPlaces(range, filter) });
    case '/api/city/v1/flows':
      if (!range || !filter) return badRange();
      return json({ room: DEFAULT_ROOM_NAME, ...await room.cityFlows(range, filter) });
    case '/api/city/v1/digest': {
      if (!range || !filter) return badRange();
      model ??= cityModel();
      const places = await room.cityPlaces(range, filter), flows = await room.cityFlows(range, filter);
      const text = cityDigest({ range, ...(filter.build ? { build: filter.build } : {}), days: places.days, places: model.places, counts: places.places, modes: places.modes, flows: flows.flows, minds: places.minds });
      return new Response(text, { headers: { ...PUBLIC, 'content-type': 'text/markdown; charset=utf-8' } });
    }
  }
  // Private surfaces below.
  if (!await verifyBearerToken(request.headers.get('authorization'), env.CITY_TOKEN)) return json({ error: 'Unauthorized' }, 401);
  // The rollback step (docs/live-service.md): moves a batch of packed aggregates into the per-key tables; repeat until
  // `left` is 0. Every GameRoom keeps its own aggregates (overflow and private rooms too), so `id=<object id>` addresses
  // any of them; without it, the canonical room.
  if (unpack) {
    const id = url.searchParams.get('id');
    if (id !== null && !/^[0-9a-f]{64}$/.test(id)) return json({ error: 'Bad object id' }, 400);
    let target = room;
    if (id !== null) {
      try { target = env.GAME_ROOM.get(env.GAME_ROOM.idFromString(id)); } catch { return json({ error: 'Not a GameRoom object id' }, 400); }
    }
    const result = await target.cityUnpack(UNPACK_BYTES);
    return json(result, result.ok ? 200 : 409);
  }
  // The public room's move (docs/live-service.md, "The public room"): copies the old room's history into the new one
  // for a few seconds a call; repeat until `done` (`scripts/copy-city.mjs`).
  if (copy) return json(await room.cityCopy(PREVIOUS_ROOM_NAME, COPY_BUDGET_MS));
  if (path === '/api/city/v1/events') {
    const type = url.searchParams.get('type'), round = url.searchParams.get('round'), since = url.searchParams.get('since'), limit = Number(url.searchParams.get('limit') ?? 1000);
    if ((type && !/^[a-z-]{1,20}$/.test(type)) || (round && !/^[\w-]{1,80}$/.test(round)) || (since && !/^\d{1,16}$/.test(since)) || !(limit >= 1 && limit <= 10_000)) return json({ error: 'Bad event filter' }, 400);
    return json(await room.cityEvents({ ...(type ? { type } : {}), ...(round ? { round } : {}), ...(since ? { since: Number(since) } : {}), limit }));
  }
  if (path === '/api/city/v1/archive') {
    const prefix = url.searchParams.get('prefix') ?? 'city/raw/v1/', cursor = url.searchParams.get('cursor') ?? undefined;
    if (!prefix.startsWith('city/raw/v1/')) return json({ error: 'Bad prefix' }, 400);
    const list = await env.CITY_ARCHIVE.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    return json({ objects: list.objects.map(o => ({ key: o.key, size: o.size, uploaded: o.uploaded })), ...(list.truncated ? { cursor: list.cursor } : {}) });
  }
  if (path.startsWith('/api/city/v1/archive/')) {
    const key = decodeURIComponent(path.slice('/api/city/v1/archive/'.length));
    if (!key.startsWith('city/raw/v1/') || key.includes('..')) return json({ error: 'Bad key' }, 400);
    const object = await env.CITY_ARCHIVE.get(key);
    return object ? new Response(object.body, { headers: { 'content-type': 'application/gzip', 'cache-control': 'no-store' } }) : json({ error: 'Not found' }, 404);
  }
  return json({ error: 'Not found' }, 404);
}

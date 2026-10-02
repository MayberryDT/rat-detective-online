import { DEFAULT_ROOM_NAME } from '../shared/networkProtocol';
import { parseAdminCommand } from '../shared/messageValidation';
import { verifyBearerToken } from './auth';

/** Tyler's admin controls over HTTP (docs/live-service.md, "Admin controls"): `GET /api/admin/v1/status` and
 * `POST /api/admin/v1/<command>` with a small JSON body (`{"mode":…}`, `{"incident":…}`), bearer `ADMIN_TOKEN`
 * (a Worker secret; unset means every request is refused). Commands act on the canonical room. */
export type AdminEnv = Env & { ADMIN_TOKEN?: string };
const PREFIX = '/api/admin/v1/';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

/** Handles `/api/admin/v1/*`; null for any other path. */
export async function adminApi(request: Request, url: URL, env: AdminEnv): Promise<Response | null> {
  if (!url.pathname.startsWith(PREFIX)) return null;
  if (!await verifyBearerToken(request.headers.get('authorization'), env.ADMIN_TOKEN)) return json({ error: 'Unauthorized' }, 401);
  const name = url.pathname.slice(PREFIX.length);
  if (request.method !== (name === 'status' ? 'GET' : 'POST')) return json({ error: 'Method not allowed' }, 405);
  let body: unknown = {};
  if (request.method === 'POST') {
    const text = await request.text();
    if (text.length > 1024) return json({ error: 'Body too large' }, 413);
    try { body = text ? JSON.parse(text) : {}; } catch { return json({ error: 'Body is not JSON' }, 400); }
  }
  const command = parseAdminCommand(typeof body === 'object' && body !== null ? { ...body, command: name } : null);
  if (!command) return json({ error: 'Unknown admin command or argument' }, 400);
  const room = env.GAME_ROOM.getByName(DEFAULT_ROOM_NAME);
  await room.enableMatchmaking(DEFAULT_ROOM_NAME);
  const result = await room.admin(command);
  return json(result, result.ok ? 200 : 409);
}

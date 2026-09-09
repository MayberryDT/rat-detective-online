import { DurableObject } from 'cloudflare:workers';
import { DEFAULT_ROOM_NAME } from '../shared/networkProtocol';

/** Admission directory only: gameplay sockets and all simulation stay in GameRoom. */
export class Matchmaker extends DurableObject<Env> {
  private turn: Promise<unknown> = Promise.resolve();
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS rooms (name TEXT PRIMARY KEY, checked INTEGER NOT NULL DEFAULT 0, slots INTEGER NOT NULL DEFAULT 0)`);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket required', {status:400});
    // Serializes admission only, never a game tick or a live socket. A failed
    // attempt releases the queue; the room independently reserves each slot.
    const previous = this.turn;
    let release!: () => void;
    this.turn = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try { return await this.assign(request); } finally { release(); }
  }

  async refresh(name: string): Promise<void> {
    const slots = await this.env.GAME_ROOM.getByName(name).occupiedSlots();
    // A stale availability hint can only cause an extra probe: GameRoom owns
    // admission and never trusts the directory count to grant a slot.
    this.ctx.storage.sql.exec('UPDATE rooms SET checked = 0, slots = ? WHERE name = ?',slots,name);
  }

  async retire(name: string, pool: string): Promise<void> {
    if (name === pool) return; // Keep the canonical room/world identity.
    const previous = this.turn;
    let release!: () => void;
    this.turn = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try {
      if (await this.env.GAME_ROOM.getByName(name).occupiedSlots() === 0) this.ctx.storage.sql.exec('DELETE FROM rooms WHERE name = ?',name);
    } finally { release(); }
  }

  private async assign(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pool = url.searchParams.get('room') || DEFAULT_ROOM_NAME;
    if (pool !== DEFAULT_ROOM_NAME && !/^graybox-benchmark-match-[a-z0-9-]{1,40}$/.test(pool)) return new Response('Unknown pool',{status:404});
    this.ctx.storage.sql.exec('INSERT OR IGNORE INTO rooms(name) VALUES (?)', pool);
    const preferred = url.searchParams.get('preferred');
    const known = preferred && this.ctx.storage.sql.exec<{name:string}>('SELECT name FROM rooms WHERE name = ?',preferred).toArray()[0];
    // Full rooms are revisited after five seconds. Available rooms are always
    // first; probing is bounded when a large number of rooms are full.
    const candidates = this.ctx.storage.sql.exec<{name:string}>(
      'SELECT name FROM rooms WHERE checked <= ? ORDER BY slots DESC, rowid LIMIT 16', Date.now()-5000).toArray().map(row=>row.name);
    if (known) candidates.unshift(known.name);
    for (const name of new Set(candidates)) {
      const response = await this.tryRoom(request, name, pool);
      if (response.status === 101) return response;
      if (response.status !== 503) return response;
      this.ctx.storage.sql.exec('UPDATE rooms SET checked = ? WHERE name = ?',Date.now(),name);
    }
    const name = `${pool}-${crypto.randomUUID()}`;
    this.ctx.storage.sql.exec('INSERT INTO rooms(name) VALUES (?)',name);
    return this.tryRoom(request,name,pool);
  }

  private async tryRoom(request: Request, name: string, pool: string): Promise<Response> {
    const room = this.env.GAME_ROOM.getByName(name);
    await room.enableMatchmaking(name,pool);
    const url = new URL(request.url); url.searchParams.set('room',name);
    const response = await room.fetch(new Request(url,request));
    if (response.status === 101) this.ctx.storage.sql.exec('UPDATE rooms SET checked = 0, slots = ? WHERE name = ?',Number(response.headers.get('x-rat-slots')) || 0,name);
    return response;
  }
}

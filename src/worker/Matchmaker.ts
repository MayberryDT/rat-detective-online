import { DurableObject } from 'cloudflare:workers';
import { DEFAULT_ROOM_NAME } from '../shared/networkProtocol';
import {
  COMPANION_SCHEMA_VERSION,
  isCompanionRoomPublication,
  isPublicCompanionRoom,
  COMPANION_FRESHNESS_MS,
  COMPANION_MAX_PAGE_SIZE,
  type CompanionRoom,
  type CompanionRoomPublication,
  type CompanionStatusEnvelope,
} from '../shared/companionStatus';

const COMPANION_TOMBSTONE_RETENTION_MS = 24 * 60 * 60_000;

/** Admission directory only: gameplay sockets and all simulation stay in GameRoom. */
export class Matchmaker extends DurableObject<Env> {
  private turn: Promise<unknown> = Promise.resolve();
  private queued = 0;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS rooms (name TEXT PRIMARY KEY, checked INTEGER NOT NULL DEFAULT 0, slots INTEGER NOT NULL DEFAULT 0)`);
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS rooms_available ON rooms(slots DESC, name) WHERE checked = 0');
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS rooms_cooldown ON rooms(checked) WHERE checked > 0');
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS companion_summaries (
      name TEXT PRIMARY KEY,
      pool TEXT NOT NULL,
      generation INTEGER NOT NULL,
      revision INTEGER NOT NULL,
      observed_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      payload TEXT NOT NULL
    )`);
    const summaryColumns = ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info(companion_summaries)').toArray();
    if (!summaryColumns.some(column => column.name === 'active')) {
      ctx.storage.sql.exec('ALTER TABLE companion_summaries ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
    }
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS companion_fresh ON companion_summaries(pool, active, expires_at, name)');
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket required', {status:400});
    const url=new URL(request.url);
    if(url.searchParams.get('prepare')==='1') {
      // Title visitors may warm the canonical transport, never create overflow
      // rooms or compete for player reservations before pressing Enter City.
      const pool=url.searchParams.get('room')||DEFAULT_ROOM_NAME;
      if(pool!==DEFAULT_ROOM_NAME&&!/^graybox-benchmark-match-[a-z0-9-]{1,40}$/.test(pool))return new Response('Unknown pool',{status:404});
      const room=this.env.GAME_ROOM.getByName(pool);
      await room.enableMatchmaking(pool);
      await room.prepareEntry();
      return room.fetch(request);
    }
    if (url.searchParams.get('resume') === '1') {
      const pool=url.searchParams.get('room')||DEFAULT_ROOM_NAME;
      if(pool!==DEFAULT_ROOM_NAME&&!/^graybox-benchmark-match-[a-z0-9-]{1,40}$/.test(pool))return new Response('Unknown pool',{status:404});
      const preferred=url.searchParams.get('preferred');
      const known=preferred && this.ctx.storage.sql.exec<{name:string}>('SELECT name FROM rooms WHERE name = ?',preferred).toArray()[0];
      // A canonical title join need not have registered the directory yet.
      const name=known ? known.name : pool;
      const room=this.env.GAME_ROOM.getByName(name);
      await room.enableMatchmaking(name,pool);
      const routed=new URL(request.url);routed.searchParams.set('room',name);
      return room.fetch(new Request(routed,{method:request.method,headers:request.headers}));
    }
    if (this.queued >= 64) return new Response('Admission busy; retry shortly', {status:503});
    this.queued++;
    const deadline = Date.now() + 5_000;
    // Serializes admission only, never a game tick or a live socket. A failed
    // attempt releases the queue; the room independently reserves each slot.
    const previous = this.turn;
    let release!: () => void;
    this.turn = new Promise<void>(resolve => { release = resolve; });
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const work = (async () => {
      await previous;
      try {
        if (expired || Date.now() >= deadline) return new Response('Admission timed out', {status:503});
        const response = await this.assign(request, deadline);
        if (expired || Date.now() >= deadline) {
          // A late successful reservation must be closed, never orphaned by a
          // timeout race. GameRoom additionally checks the deadline before accept.
          if (response.webSocket) { response.webSocket.accept();response.webSocket.close(1001,'Admission expired'); }
          return new Response('Admission timed out', {status:503});
        }
        return response;
      } finally { this.queued--;release(); }
    })();
    this.ctx.waitUntil(work.then(()=>{},()=>{}));
    try {
      return await Promise.race([work,new Promise<Response>(resolve=>{
        timer=setTimeout(()=>{expired=true;resolve(new Response('Admission timed out',{status:503}));},5_000);
      })]);
    } finally { if(timer)clearTimeout(timer); }
  }

  async refresh(name: string): Promise<void> {
    const slots = await this.env.GAME_ROOM.getByName(name).occupiedSlots();
    // A stale availability hint can only cause an extra probe: GameRoom owns
    // admission and never trusts the directory count to grant a slot.
    this.ctx.storage.sql.exec('UPDATE rooms SET checked = 0, slots = ? WHERE name = ?',slots,name);
  }

  /** Public GameRooms publish here; companion reads never fan out to gameplay DOs. */
  async publishCompanion(publication: CompanionRoomPublication): Promise<boolean> {
    const now = Date.now();
    if (!isCompanionRoomPublication(publication) || publication.pool !== DEFAULT_ROOM_NAME ||
        !isPublicCompanionRoom(publication.room, DEFAULT_ROOM_NAME) ||
        publication.expiresAt !== publication.observedAt + COMPANION_FRESHNESS_MS ||
        publication.observedAt > now + 5_000 || publication.expiresAt <= now) return false;
    const payload = JSON.stringify(publication);
    this.ctx.storage.sql.exec(
      `INSERT INTO companion_summaries(name,pool,generation,revision,observed_at,expires_at,active,payload)
       VALUES (?,?,?,?,?,?,1,?)
       ON CONFLICT(name) DO UPDATE SET
         pool=excluded.pool,generation=excluded.generation,revision=excluded.revision,
         observed_at=excluded.observed_at,expires_at=excluded.expires_at,
         active=1,payload=excluded.payload
       WHERE excluded.generation > companion_summaries.generation
          OR (excluded.generation = companion_summaries.generation
              AND excluded.revision > companion_summaries.revision)`,
      publication.room, publication.pool, publication.generation, publication.revision,
      publication.observedAt, publication.expiresAt, payload,
    );
    const stored = this.ctx.storage.sql.exec<{ generation: number; revision: number; active: number }>(
      'SELECT generation,revision,active FROM companion_summaries WHERE name = ?', publication.room,
    ).one();
    const accepted = stored.active === 1 && stored.generation === publication.generation &&
      stored.revision === publication.revision;
    if (accepted) this.ctx.storage.sql.exec('INSERT OR IGNORE INTO rooms(name) VALUES (?)', publication.room);
    return accepted;
  }

  /** Tombstones retain the ordering stamp so a delayed publication cannot resurrect a room. */
  removeCompanion(name: string, generation: number, revision: number): void {
    if (!isPublicCompanionRoom(name, DEFAULT_ROOM_NAME) || !Number.isSafeInteger(generation) ||
        generation < 1 || !Number.isSafeInteger(revision) || revision < 1) return;
    this.ctx.storage.sql.exec(
      `INSERT INTO companion_summaries(name,pool,generation,revision,observed_at,expires_at,active,payload)
       VALUES (?,?,?,?,?,0,0,'{}')
       ON CONFLICT(name) DO UPDATE SET
         pool=excluded.pool,generation=excluded.generation,revision=excluded.revision,
         observed_at=excluded.observed_at,expires_at=0,active=0,payload='{}'
       WHERE excluded.generation > companion_summaries.generation
          OR (excluded.generation = companion_summaries.generation
              AND excluded.revision >= companion_summaries.revision)`,
      name, DEFAULT_ROOM_NAME, generation, revision, Date.now(),
    );
  }

  companionStatus(cursor: string | null, limit: number, observedAt = Date.now()): CompanionStatusEnvelope {
    const pageLimit = Number.isSafeInteger(limit) ?
      Math.max(1, Math.min(COMPANION_MAX_PAGE_SIZE, limit)) : 1;
    this.ctx.storage.sql.exec(
      `DELETE FROM companion_summaries
       WHERE (active = 0 AND observed_at < ?) OR (active = 1 AND expires_at <= ?)`,
      observedAt - COMPANION_TOMBSTONE_RETENTION_MS, observedAt,
    );
    const rows = this.ctx.storage.sql.exec<{ name: string; payload: string }>(
      `SELECT name,payload FROM companion_summaries
       WHERE pool = ? AND active = 1 AND expires_at > ? AND name > ?
       ORDER BY name LIMIT ?`,
      DEFAULT_ROOM_NAME, observedAt, cursor ?? '', pageLimit + 1,
    ).toArray();
    const hasMore = rows.length > pageLimit;
    const page = hasMore ? rows.slice(0, pageLimit) : rows;
    const rooms: CompanionRoom[] = [];
    for (const row of page) {
      try {
        const publication: unknown = JSON.parse(row.payload);
        if (!isCompanionRoomPublication(publication) || publication.pool !== DEFAULT_ROOM_NAME) continue;
        const { pool: _pool, ...room } = publication;
        rooms.push(room);
      } catch { /* Ignore damaged rows; a live room republishes authoritatively. */ }
    }
    return {
      schemaVersion: COMPANION_SCHEMA_VERSION,
      observedAt,
      rooms,
      nextCursor: hasMore ? page[page.length - 1]?.name ?? null : null,
    };
  }

  async retire(name: string, pool: string, generation?: number, revision?: number): Promise<void> {
    if (name === pool) return; // Keep the canonical room/world identity.
    const previous = this.turn;
    let release!: () => void;
    this.turn = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try {
      if (await this.env.GAME_ROOM.getByName(name).occupiedSlots() === 0) {
        this.ctx.storage.sql.exec('DELETE FROM rooms WHERE name = ?',name);
        if (generation !== undefined && revision !== undefined) this.removeCompanion(name, generation, revision);
      }
    } finally { release(); }
  }

  private async assign(request: Request, deadline: number): Promise<Response> {
    const url = new URL(request.url);
    const pool = url.searchParams.get('room') || DEFAULT_ROOM_NAME;
    if (pool !== DEFAULT_ROOM_NAME && !/^graybox-benchmark-match-[a-z0-9-]{1,40}$/.test(pool)) return new Response('Unknown pool',{status:404});
    this.ctx.storage.sql.exec('INSERT OR IGNORE INTO rooms(name) VALUES (?)', pool);
    const preferred = url.searchParams.get('preferred');
    const known = preferred && this.ctx.storage.sql.exec<{name:string}>('SELECT name FROM rooms WHERE name = ?',preferred).toArray()[0];
    // Full rooms are revisited after five seconds. Available rooms are always
    // first; probing is bounded when a large number of rooms are full.
    this.ctx.storage.sql.exec('UPDATE rooms SET checked = 0 WHERE checked > 0 AND checked <= ?',Date.now()-5000);
    const candidates = this.ctx.storage.sql.exec<{name:string}>(
      'SELECT name FROM rooms WHERE checked = 0 ORDER BY slots DESC, name LIMIT 16').toArray().map(row=>row.name);
    if (known) candidates.unshift(known.name);
    for (const name of new Set(candidates)) {
      const response = await this.tryRoom(request, name, pool, deadline);
      if (response.status === 101) return response;
      if (response.status !== 503) return response;
      this.ctx.storage.sql.exec('UPDATE rooms SET checked = ? WHERE name = ?',Date.now(),name);
    }
    if(Date.now()>=deadline)return new Response('Admission timed out',{status:503});
    const name = `${pool}-${crypto.randomUUID()}`;
    this.ctx.storage.sql.exec('INSERT INTO rooms(name) VALUES (?)',name);
    return this.tryRoom(request,name,pool,deadline);
  }

  private async tryRoom(request: Request, name: string, pool: string, deadline: number): Promise<Response> {
    if (Date.now() >= deadline) return new Response('Admission timed out',{status:408});
    const room = this.env.GAME_ROOM.getByName(name);
    await room.enableMatchmaking(name,pool);
    if (Date.now() >= deadline) return new Response('Admission timed out',{status:408});
    const url = new URL(request.url); url.searchParams.set('room',name);
    const headers = new Headers(request.headers);headers.set('x-rat-admission-deadline',String(deadline));
    const response = await room.fetch(new Request(url,{method:request.method,headers}));
    if (response.status === 101) this.ctx.storage.sql.exec('UPDATE rooms SET checked = 0, slots = ? WHERE name = ?',Number(response.headers.get('x-rat-slots')) || 0,name);
    return response;
  }
}

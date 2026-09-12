import { DurableObject } from 'cloudflare:workers';
import { DEFAULT_ROOM_NAME } from '../shared/networkProtocol';

/** Admission directory only: gameplay sockets and all simulation stay in GameRoom. */
export class Matchmaker extends DurableObject<Env> {
  private turn: Promise<unknown> = Promise.resolve();
  private queued = 0;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS rooms (name TEXT PRIMARY KEY, checked INTEGER NOT NULL DEFAULT 0, slots INTEGER NOT NULL DEFAULT 0)`);
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS rooms_available ON rooms(slots DESC, name) WHERE checked = 0');
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS rooms_cooldown ON rooms(checked) WHERE checked > 0');
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

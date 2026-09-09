import { cp, mkdir, mkdtemp, readFile, writeFile, symlink, readdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const PRIVATE_WORKER = 'rat-detective-capacity-test';
export function replaceOnce(text, before, after) {
  if (text.split(before).length !== 2) throw new Error(`Capacity fixture anchor changed: ${before.slice(0, 90)}`);
  return text.replace(before, after);
}
export async function prepareFixture(out, { hosted = false, expiresAt = 0, window = 4, serverBots = 11, checkpointControl = false } = {}) {
  if(!Number.isInteger(serverBots)||serverBots<11||serverBots>99)throw Error('Fixture serverBots must be 11–99');
  await mkdir(out, { recursive: true });
  const stage = await mkdtemp(join(out, 'runtime-'));
  for (const name of ['src', 'worker-configuration.d.ts', 'tsconfig.json', 'package.json']) await cp(join(projectRoot, name), join(stage, name), { recursive: true });
  await cp(join(projectRoot, 'dist'), join(stage, 'dist'), { recursive: true });
  await symlink(join(projectRoot, 'node_modules'), join(stage, 'node_modules'), 'dir');
  const sourceHashes = {};
  async function hashTree(relative) {
    for (const entry of (await readdir(join(stage, relative), { withFileTypes: true })).sort((a,b)=>a.name.localeCompare(b.name))) {
      const name = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await hashTree(name);
      else if (entry.isFile()) sourceHashes[name] = createHash('sha256').update(await readFile(join(stage,name))).digest('hex');
    }
  }
  await hashTree('src');
  const controlHash=createHash('sha256').update(await readFile(join(projectRoot,'scripts/fixtures/ApprovedSnapshotBuffer.ts'))).digest('hex');
  const fixtureId = createHash('sha256').update(JSON.stringify({ version: 8, checkpointControl, controlHash, window, seed: 341283204, serverBots, sourceHashes })).digest('hex');
  async function patch(name, before, after) { const path=join(stage,name); await writeFile(path,replaceOnce(await readFile(path,'utf8'),before,after)); }
  if(checkpointControl){
    if(!hosted)throw Error('Checkpoint control is hosted-private only');
    await patch('src/worker/GameRoom.ts','CHECKPOINT_MS = 2_500;','CHECKPOINT_MS = 10_000;');
    await patch('src/worker/GameRoom.ts','now-this.chaosSavedAt>=1000','now-this.chaosSavedAt>=10_000');
  }
  if(![4,8].includes(window))throw Error('Benchmark window must be 4 or 8');
  await patch('src/worker/ChaosDelivery.ts','MAX_CHAOS_IN_FLIGHT=4;',`MAX_CHAOS_IN_FLIGHT=${window};`);
  await patch('src/worker/GameRoom.ts', "this.send(ws, { type: 'pong', sentAt: message.sentAt, receivedAt: this.now() });", "ws.send(JSON.stringify({type:'pong',sentAt:message.sentAt,receivedAt:this.now(),capacityDelivery:{coalesced:this.chaosDelivery.get(ws)?.coalesced??0,inFlight:this.chaosDelivery.get(ws)?.inFlight??0}}));");
  await patch('src/shared/networkProtocol.ts', 'export const MAX_PLAYERS = 24;', 'export const MAX_PLAYERS = 100;');
  await patch('src/shared/ChaosSimulation.ts', '    private activate(owner?:string){', "    benchmarkIncident():void { this.dispatch={phase:'active',started:this.now,until:this.now+25000,serial:this.dispatch.serial+1,incident:'scattershot'}; }\n    private activate(owner?:string){");
  await patch('src/worker/GameRoom.ts', 'this.world = { ...createWorldSpec(), version: GRAYBOX_VERSION };', 'this.world = { ...createWorldSpec(341283204), version: GRAYBOX_VERSION };');
  await patch('src/worker/GameRoom.ts', '  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {', '  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {\n    if(raw===\'{"type":"benchmarkIncident","incident":"scattershot"}\' && this.getPlayerId(ws)){this.chaos?.benchmarkIncident();return;}');
  // Private AI workload uses the production controller with a deterministic
  // eleven-rat roster. Only explicit benchmark-ai rooms enable it.
  await patch('src/shared/botRoster.ts', 'names.map((name, i)', `Array.from({length:${serverBots}},(_,i)=>names[i%names.length]).map((name, i)`);
  await patch('src/shared/botRoster.ts', 'const count = MIN_PERSISTENT_BOTS + Math.floor(random() * (MAX_PERSISTENT_BOTS - MIN_PERSISTENT_BOTS + 1));', 'const count = MAX_PERSISTENT_BOTS;');
  await patch('src/worker/index.ts', 'if (roomName === DEFAULT_ROOM_NAME) await room.ensurePersistentBots();', "if (roomName === DEFAULT_ROOM_NAME || roomName.startsWith('graybox-benchmark-ai-')) await room.ensurePersistentBots();");
  if(hosted){
    await patch('src/worker/GameRoom.ts', '  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {', `  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
      if(typeof raw==='string'&&raw.length<160&&raw.startsWith('{"type":"benchmarkEcho",')&&this.getPlayerId(ws)){
        try{const m=JSON.parse(raw);if(Number.isFinite(m.sentAt)&&this.rateLimiter.allow('echo:'+this.getPlayerId(ws),2,1000,this.now()))ws.send(JSON.stringify({type:'pong',sentAt:m.sentAt,receivedAt:this.now(),capacityEcho:true}));}catch{}return;
      }`);
    await patch('src/worker/GameRoom.ts','  async ensurePersistentBots(): Promise<void> {', `  async benchmarkStop():Promise<void>{
      this.serverBots?.dispose();this.serverBots=null;this.persistentBots=false;
      this.writeRoomState(PERSISTENT_BOTS_KEY,'false');
      for(const bot of this.botRoster)this.removePlayerById(bot.id);
      this.botRoster=[];if(this.chaosTimer)clearInterval(this.chaosTimer);this.chaosTimer=null;
      await this.ctx.storage.deleteAlarm();
    }
    async ensurePersistentBots(): Promise<void> {`);
    await patch('src/worker/capacityTest.ts', "    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });", `    if(url.pathname==='/cleanup'&&request.method==='POST'){
      const room=url.searchParams.get('room')??'';
      if(!/^graybox-benchmark-ai-[a-z0-9-]{1,80}$/.test(room))return new Response('Not found',{status:404});
      await (env.GAME_ROOM.getByName(room) as unknown as {benchmarkStop():Promise<void>}).benchmarkStop();
      return Response.json({ok:true});
    }
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });`);
    await patch('src/worker/GameRoom.ts', '  async alarm(): Promise<void> {', `  async alarm(): Promise<void> {\n    if(Date.now()>=${expiresAt})return;`);
    await patch('src/worker/GameRoom.ts', '      if(!this.chaos)return;', `      if(Date.now()>=${expiresAt}){for(const ws of this.ctx.getWebSockets())ws.close(1001,'Private fixture expired');clearInterval(this.chaosTimer!);this.chaosTimer=null;return;}\n      if(!this.chaos)return;`);
  }
  if (!hosted) await patch('src/worker/index.ts','    const url = new URL(request.url);',"    const url = new URL(request.url);\n    if(url.hostname!=='127.0.0.1')return new Response('Local benchmark only',{status:403});");
  const config = hosted ? JSON.parse(await readFile(join(projectRoot, 'wrangler.capacity-test.jsonc'), 'utf8')) : {
    name:'rat-detective-local-benchmark', main:'src/worker/index.ts', compatibility_date:'2026-07-08', compatibility_flags:['nodejs_compat'], workers_dev:false, preview_urls:false, routes:[], assets:{directory:'./dist',binding:'ASSETS'}, durable_objects:{bindings:[{name:'GAME_ROOM',class_name:'GameRoom'}]}, migrations:[{tag:'v1',new_sqlite_classes:['GameRoom']}], observability:{enabled:true},
  };
  if (hosted) {
    if (config.name !== PRIVATE_WORKER || config.routes.length || config.durable_objects.bindings.some(b => b.script_name)) throw new Error('Private namespace configuration changed');
    config.vars = { CAPACITY_FIXTURE_ID: fixtureId, CAPACITY_EXPIRES_AT: String(expiresAt) };
  }
  const configPath = join(stage, 'wrangler.jsonc');
  await writeFile(configPath, JSON.stringify(config, null, 2));
  const validator = join(stage, 'validator.mjs');
  await cp(join(projectRoot,'scripts/fixtures/ApprovedSnapshotBuffer.ts'),join(stage,'approved-buffer.ts'));
  await build({ stdin:{contents:"export * from './src/shared/chaosWire.ts'; export {SnapshotBuffer,BotSnapshotBuffer} from './src/shared/SnapshotBuffer.ts'; export {SnapshotBuffer as ApprovedSnapshotBuffer} from './approved-buffer.ts';",resolveDir:stage}, outfile:validator, bundle:true, platform:'node', format:'esm' });
  const manifest = { createdAt:new Date().toISOString(), fixtureId, sourceHashes, controlHash, hosted, expiresAt, window, serverBots, checkpointControl,
    overrides:[...(checkpointControl?['DIAGNOSTIC ONLY: copied periodic player and chaos checkpoint intervals 10 seconds; forced writes unchanged']:[]),'copied MAX_PLAYERS=100, MAX_CONNECTIONS=108', 'fixed city seed 341283204', 'copied 25-second Scattershot control', `private AI rooms use ${serverBots} production-controller bots, with hosted expiry`], stage, validator, configPath };
  await writeFile(join(out,'fixture.json'), JSON.stringify(manifest,null,2));
  return manifest;
}

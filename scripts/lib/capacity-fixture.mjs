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
export async function prepareFixture(out, { hosted = false, expiresAt = 0, window = 8, serverBots = 11, maxPlayers = 100, fullLobby = false, checkpointControl = false, botExperiments = false, assignment, firstAssignment } = {}) {
  if(firstAssignment!==undefined&&(!hosted||assignment!==undefined||!['closing-time','chain-of-custody','excessive-force','jurisdiction'].includes(firstAssignment)))throw Error('First assignment requires a known hosted mode and cannot be pinned');
  if(assignment!==undefined&&(!hosted||!['closing-time','chain-of-custody','excessive-force','jurisdiction'].includes(assignment)))throw Error('Assignment override requires a known mode in a hosted private fixture');
  if(!Number.isInteger(serverBots)||serverBots<8||serverBots>99)throw Error('Fixture serverBots must be 8–99');
  const minimumCap=10;
  if(!Number.isInteger(maxPlayers)||maxPlayers<minimumCap||maxPlayers>100||serverBots>maxPlayers||serverBots===maxPlayers&&!fullLobby)throw Error(`Fixture cap must be ${minimumCap}–100; a full bot roster requires fullLobby`);
  if(fullLobby&&(!hosted||serverBots!==maxPlayers))throw Error('Full lobby requires hosted expiry and bots equal to cap');
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
  const fixtureId = createHash('sha256').update(JSON.stringify({ version: 15, botExperiments, assignment, firstAssignment, maxPlayers, fullLobby, checkpointControl, controlHash, window, seed: 341283204, serverBots, sourceHashes })).digest('hex');
  async function patch(name, before, after) { const path=join(stage,name); await writeFile(path,replaceOnce(await readFile(path,'utf8'),before,after)); }
  if(botExperiments){
    if(!hosted)throw Error('Bot experiments require a hosted private fixture');
    await patch('src/worker/GameRoom.ts', "import { ChaosDelivery } from './ChaosDelivery';", `import { ChaosDelivery } from './ChaosDelivery';
function privateBotExperiment(pool:string):import('../shared/BotExperiments').BotExperiment {
  const value=/^graybox-benchmark-(?:ai|match)-bot-(maneuvers|commitment|attention|combined)(?:-|$)/.exec(pool)?.[1];
  return value==='maneuvers'||value==='commitment'||value==='attention'||value==='combined'?value:'baseline';
}`);
    await patch('src/worker/GameRoom.ts','      });\n  }\n\n  private activatePersistentBots()', '      },privateBotExperiment(this.matchPool??""));\n  }\n\n  private activatePersistentBots()');
  }
  if(firstAssignment)await patch('src/worker/GameRoom.ts','    const id=nextAssignment(this.assignmentRotation);',`    // Private first cycle; following cycles use the normal shuffled playlist.
    if(!this.assignmentRotation.last)this.assignmentRotation.remaining=[${JSON.stringify(firstAssignment)},...ASSIGNMENT_IDS.filter(id=>id!==${JSON.stringify(firstAssignment)})];
    const id=nextAssignment(this.assignmentRotation);`);
  if(assignment)await patch('src/worker/GameRoom.ts','    const id=nextAssignment(this.assignmentRotation);',`    this.assignmentRotation.forced=${JSON.stringify(assignment)};\n    const id=nextAssignment(this.assignmentRotation);`);
  if(checkpointControl){
    if(!hosted)throw Error('Checkpoint control is hosted-private only');
    await patch('src/worker/GameRoom.ts','CHECKPOINT_MS = 2_500;','CHECKPOINT_MS = 10_000;');
    await patch('src/worker/GameRoom.ts','now-this.chaosSavedAt>=1000','now-this.chaosSavedAt>=10_000');
  }
  if(![4,8].includes(window))throw Error('Benchmark window must be 4 or 8');
  await patch('src/worker/ChaosDelivery.ts','MAX_CHAOS_IN_FLIGHT=8;',`MAX_CHAOS_IN_FLIGHT=${window};`);
  await patch('src/worker/GameRoom.ts', "this.send(ws, { type: 'pong', sentAt: message.sentAt, receivedAt: this.now() });", "this.safeSend(ws,JSON.stringify({type:'pong',sentAt:message.sentAt,receivedAt:this.now(),capacityDelivery:{coalesced:this.chaosDelivery.get(ws)?.coalesced??0,inFlight:this.chaosDelivery.get(ws)?.inFlight??0}}));");
  await patch('src/shared/networkProtocol.ts', 'export const MAX_PLAYERS = 10;', `export const MAX_PLAYERS = ${maxPlayers};`);
  await patch('src/shared/ChaosSimulation.ts', '    private activate(owner?:string|null){', "    benchmarkIncident(incident:import('./incidentCatalog').IncidentId):void { this.dispatch={phase:'active',started:this.now,until:this.now+25000,serial:this.dispatch.serial+1,incident};this.lastSurgePulse=0;this.dispatchActivator=null; }\n    private activate(owner?:string|null){");
  await patch('src/worker/GameRoom.ts', 'this.world = { ...createWorldSpec(), version: GRAYBOX_VERSION };', 'this.world = { ...createWorldSpec(341283204), version: GRAYBOX_VERSION };');
  // Matchmaking enables version 2 before fetch(), so fixing only fetch's seed
  // left new automatic pools with random cities. Fix initialization in the copy.
  const roomSourcePath=join(stage,'src/worker/GameRoom.ts');
  await writeFile(roomSourcePath,(await readFile(roomSourcePath,'utf8')).replaceAll('createWorldSpec()','createWorldSpec(341283204)'));
  await patch('src/worker/GameRoom.ts', '  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {', '  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {\n    if(typeof raw===\'string\'&&raw.length<128&&raw.startsWith(\'{"type":"benchmarkIncident",\')&&this.getPlayerId(ws)){try{const m=JSON.parse(raw);if(INCIDENTS.some(i=>i.id===m.incident))this.chaos?.benchmarkIncident(m.incident);}catch{}return;}');
  await patch('src/worker/GameRoom.ts', "import { ChaosDelivery } from './ChaosDelivery';", "import { ChaosDelivery } from './ChaosDelivery';\nimport { INCIDENTS } from '../shared/incidentCatalog';");
  // Private AI workload uses the production controller with a deterministic
  // eleven-rat roster. Only explicit benchmark-ai rooms enable it.
  await patch('src/shared/botRoster.ts', 'names.slice(0,MAX_PLAYERS-1).map((name, i)', `Array.from({length:${serverBots}},(_,i)=>names[i%names.length]).map((name, i)`);
  await patch('src/shared/botRoster.ts', 'const count = MIN_PERSISTENT_BOTS + Math.floor(random() * (MAX_PERSISTENT_BOTS - MIN_PERSISTENT_BOTS + 1));', 'const count = MAX_PERSISTENT_BOTS;');
  await patch('src/worker/index.ts', '        return respond(await room.fetch(request));', "        if (roomName.startsWith('graybox-benchmark-ai-')) await room.ensurePersistentBots();\n        return respond(await room.fetch(request));");
  if(fullLobby){
    // Only the copied private Worker runs bots before humans arrive. Existing
    // admission and join code performs the actual bot-to-human replacement.
    await patch('src/worker/index.ts', "if (roomName.startsWith('graybox-benchmark-ai-')) await room.ensurePersistentBots();", "if (roomName.startsWith('graybox-benchmark-ai-')) await room.enableMatchmaking(roomName);");
    await patch('src/worker/GameRoom.ts', 'const desired = humans ? Math.max(0, 8 - humans) : 0;', "const desired = this.matchRoom?.startsWith('graybox-benchmark-ai-') ? Math.max(0, MAX_PLAYERS - humans) : humans ? Math.max(0, 8 - humans) : 0;");
    await patch('src/worker/GameRoom.ts', 'roster.splice(humans ? Math.max(0, 8 - humans) : 0);', "roster.splice(this.matchRoom?.startsWith('graybox-benchmark-ai-') ? Math.max(0, MAX_PLAYERS - humans) : humans ? Math.max(0, 8 - humans) : 0);");
    await patch('src/worker/GameRoom.ts', 'if (humans) { if (rosterChanged || !this.serverBots)', 'if (humans || desired) { if (rosterChanged || !this.serverBots)');
    await patch('src/worker/GameRoom.ts', '    if (this.matchRoom && !this.humanSlots()) return;', "    if (this.matchRoom && !this.matchRoom.startsWith('graybox-benchmark-ai-') && !this.humanSlots()) return;");
    await patch('src/worker/GameRoom.ts', "      if(this.matchRoom && !retainedHuman){this.rebalanceBots();return;}", "      if(this.matchRoom && !this.matchRoom.startsWith('graybox-benchmark-ai-') && !retainedHuman){this.rebalanceBots();return;}");
    await patch('src/worker/GameRoom.ts', '      if (!this.humanSlots() && this.matchPool) this.retireFromMatchmaker();', "      if (!this.humanSlots() && this.matchPool && !this.matchRoom?.startsWith('graybox-benchmark-ai-')) this.retireFromMatchmaker();");
    await patch('src/worker/capacityTest.ts', "    if (url.pathname === '/health')", `    if(url.pathname==='/lobby-status'){
      const name=url.searchParams.get('room')??'';
      if(!/^graybox-benchmark-ai-[a-z0-9-]{1,80}$/.test(name))return new Response('Not found',{status:404});
      const room=env.GAME_ROOM.getByName(name);await room.enableMatchmaking(name);
      return Response.json({room:name,...await room.status()},{headers:{'cache-control':'no-store'}});
    }
    if (url.pathname === '/health')`);
  }
  if(hosted){
    await patch('src/worker/GameRoom.ts', '  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {', `  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
      if(typeof raw==='string'&&raw.length<160&&raw.startsWith('{"type":"benchmarkEcho",')&&this.getPlayerId(ws)){
        try{const m=JSON.parse(raw);if(Number.isFinite(m.sentAt)&&this.rateLimiter.allow(this.getPlayerId(ws)+':echo',2,1000,this.now()))this.safeSend(ws,JSON.stringify({type:'pong',sentAt:m.sentAt,receivedAt:this.now(),capacityEcho:true}));}catch{}return;
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
    name:'rat-detective-local-benchmark', main:'src/worker/index.ts', compatibility_date:'2026-07-08', compatibility_flags:['nodejs_compat'], workers_dev:false, preview_urls:false, routes:[], assets:{directory:'./dist',binding:'ASSETS'}, durable_objects:{bindings:[{name:'GAME_ROOM',class_name:'GameRoom'},{name:'MATCHMAKER',class_name:'Matchmaker'}]}, migrations:[{tag:'v1',new_sqlite_classes:['GameRoom']},{tag:'v2-matchmaking',new_sqlite_classes:['Matchmaker']}], observability:{enabled:true},
  };
  if (hosted) {
    if (config.name !== PRIVATE_WORKER || config.routes.length || config.durable_objects.bindings.some(b => b.script_name)) throw new Error('Private namespace configuration changed');
    config.vars = { CAPACITY_FIXTURE_ID: fixtureId, CAPACITY_EXPIRES_AT: String(expiresAt) };
  }
  const configPath = join(stage, 'wrangler.jsonc');
  await writeFile(configPath, JSON.stringify(config, null, 2));
  const validator = join(stage, 'validator.mjs');
  await cp(join(projectRoot,'scripts/fixtures/ApprovedSnapshotBuffer.ts'),join(stage,'approved-buffer.ts'));
  await build({ stdin:{contents:"export * from './src/shared/chaosWire.ts'; export {DeliveryDecoder} from './src/shared/deliveryWire.ts'; export {PROTOCOL_VERSION} from './src/shared/networkProtocol.ts'; export {TOUCH_SHOT_INTERVAL_MS} from './src/shared/shotTiming.ts'; export {INCIDENTS} from './src/shared/incidentCatalog.ts'; export {SnapshotBuffer,BotSnapshotBuffer} from './src/shared/SnapshotBuffer.ts'; export {SnapshotBuffer as ApprovedSnapshotBuffer} from './approved-buffer.ts';",resolveDir:stage}, outfile:validator, bundle:true, platform:'node', format:'esm' });
  const manifest = { createdAt:new Date().toISOString(), fixtureId, sourceHashes, controlHash, hosted, expiresAt, window, serverBots, maxPlayers, fullLobby, checkpointControl, botExperiments, assignment, firstAssignment,
    overrides:[...(firstAssignment?[`private first assignment ${firstAssignment}, then playlist rotation`]:[]),...(botExperiments?['private bot variants selected by explicit bot-baseline/maneuvers/commitment/attention/combined room names; normal match pools retain eight participants']:[]),...(assignment?[`private assignment pinned to ${assignment}`]:[]),...(checkpointControl?['DIAGNOSTIC ONLY: copied periodic player and chaos checkpoint intervals 10 seconds; forced writes unchanged']:[]),...(fullLobby?['private full lobby stays active until expiry; bots fill cap and yield to human joins']:[]),`copied MAX_PLAYERS=${maxPlayers}, MAX_CONNECTIONS=${maxPlayers+8}`, 'fixed city seed 341283204', 'copied 25-second controls for all ten incidents', `private AI rooms use ${serverBots} production-controller bots, with hosted expiry`], stage, validator, configPath };
  await writeFile(join(out,'fixture.json'), JSON.stringify(manifest,null,2));
  return manifest;
}

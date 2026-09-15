import { parseTcpStats } from '../../scripts/lib/capacity-tcp.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hostedOptions, checkReceipt } from '../../scripts/benchmark-hosted.mjs';
import { validateClientTarget } from '../../scripts/lib/capacity-clients.mjs';
import { prepareFixture, replaceOnce } from '../../scripts/lib/capacity-fixture.mjs';
const token='a'.repeat(64);
test('hosted runner requires ascending bounded levels and a private deployment receipt',()=>{
  assert.deepEqual(hostedOptions(['--deployment=/tmp/receipt.json']).players,[2,8,12,24,32,50,75,100]);
  assert.equal(hostedOptions(['--deployment=/tmp/receipt.json']).quality,'both');
  for(const args of [[],['--deployment=/x','--players=8,2'],['--deployment=/x','--target=https://example.com'],['--deployment=/x','--players=101']])assert.throws(()=>hostedOptions(args));
  const receipt={worker:'rat-detective-capacity-test',hosted:true,fixtureId:'b'.repeat(64),expiresAt:200,url:'https://rat-detective-capacity-test.owner.workers.dev'};
  assert.doesNotThrow(()=>checkReceipt(receipt,token,100));
  for(const patch of [{url:'https://ratdetective.online'}, {url:'http://rat-detective-capacity-test.owner.workers.dev'}, {url:receipt.url+'.evil.test'}, {expiresAt:99}, {fixtureId:'missing'}, {worker:'rat-detective-preview'}])assert.throws(()=>checkReceipt({...receipt,...patch},token,100));
  assert.throws(()=>checkReceipt(receipt,'',100));
  assert.doesNotThrow(()=>validateClientTarget(new URL('ws://127.0.0.1:1234/ws?room=graybox-benchmark-2'),undefined));
  assert.throws(()=>validateClientTarget(new URL('wss://ratdetective.online/ws?room=graybox-benchmark-2'),token));
});
test('fixture patches fail closed when source anchors change',()=>{
  assert.equal(replaceOnce('before','before','after'),'after');
  assert.throws(()=>replaceOnce('gone','before','after'));
  assert.throws(()=>replaceOnce('before before','before','after'));
});
test('hosted fixture has copied capacity, deterministic seed and isolated namespace',async()=>{
  const out=await mkdtemp(join(tmpdir(),'rat-capacity-test-'));
  try{
    const fixture=await prepareFixture(out,{hosted:true,expiresAt:123456,serverBots:49});
    assert.equal(fixture.serverBots,49);
    assert.equal(fixture.window,8);
    assert.match(await readFile(join(fixture.stage,'src/shared/botRoster.ts'),'utf8'),/length:49/);
    const config=JSON.parse(await readFile(fixture.configPath,'utf8'));
    assert.equal(config.name,'rat-detective-capacity-test');
    assert.deepEqual(config.routes,[]);
    assert.equal(config.durable_objects.bindings[0].script_name,undefined);
    assert.equal(config.vars.CAPACITY_FIXTURE_ID,fixture.fixtureId);
    assert.equal(config.vars.CAPACITY_EXPIRES_AT,'123456');
    assert.match(await readFile(join(fixture.stage,'src/shared/networkProtocol.ts'),'utf8'),/MAX_PLAYERS = 100;/);
    const room=await readFile(join(fixture.stage,'src/worker/GameRoom.ts'),'utf8');
    assert.match(room,/createWorldSpec\(341283204\)/);
    assert.match(room,/this\.chaos\?\.benchmarkIncident\(m\.incident\)/);
    assert.doesNotMatch(await readFile(join(fixture.stage,'src/worker/index.ts'),'utf8'),/Local benchmark only/);
  }finally{await rm(out,{recursive:true,force:true});}
});

test('TCP diagnostics retain only aggregate counters for the owning generator',()=>{
 const sample='ESTAB users:(("node",pid=123,fd=1))\n cubic bytes_received:300 bytes_retrans:20 rcv_ooopack:4 retrans:0/2\nESTAB users:(("other",pid=1234,fd=2))\n cubic bytes_received:999 bytes_retrans:900\n';
 assert.deepEqual(parseTcpStats(sample,123),{available:true,sockets:1,bytesReceived:300,bytesRetransmitted:20,outOfOrderPackets:4,retransmissions:2});
});

for(const capacity of [10,12,16])test(`${capacity}-rat full-lobby fixture fills all slots while retaining human replacement and expiry`,async()=>{
 const out=await mkdtemp(join(tmpdir(),'rat-full-lobby-test-'));
 try{
  await assert.rejects(prepareFixture(out,{hosted:true,serverBots:24,maxPlayers:24}),/fullLobby/);
  await assert.rejects(prepareFixture(out,{fullLobby:true,serverBots:24,maxPlayers:24}),/hosted expiry/);
  await assert.rejects(prepareFixture(out,{hosted:true,fullLobby:true,serverBots:9,maxPlayers:9}),/cap must be 10/);
  await assert.rejects(prepareFixture(out,{hosted:true,serverBots:8,maxPlayers:9}),/cap must be 10/);
  const fixture=await prepareFixture(out,{hosted:true,expiresAt:123456,fullLobby:true,serverBots:capacity,maxPlayers:capacity});
  assert.equal(fixture.fullLobby,true);
  assert.match(await readFile(join(fixture.stage,'src/shared/networkProtocol.ts'),'utf8'),new RegExp(`MAX_PLAYERS = ${capacity};`));
  const room=await readFile(join(fixture.stage,'src/worker/GameRoom.ts'),'utf8');
  assert.match(room,/const desired = this.matchRoom\?\.startsWith\('graybox-benchmark-ai-'\) \? Math.max\(0, MAX_PLAYERS - humans\)/);
  assert.match(room,/roster.splice\(this.matchRoom\?\.startsWith\('graybox-benchmark-ai-'\) \? Math.max\(0, MAX_PLAYERS - humans\)/);
  assert.match(room,/if \(this.matchRoom && this.players.size >= MAX_PLAYERS && this.botRoster.length\)/);
  assert.match(room,/Private fixture expired/);
  assert.doesNotMatch(room,/if \(this.matchRoom && !this.humanSlots\(\)\) return/);
  assert.match(await readFile(join(fixture.stage,'src/worker/capacityTest.ts'),'utf8'),/lobby-status/);
 }finally{await rm(out,{recursive:true,force:true});}
});

test('bot experiments are isolated to explicit private room names and keep normal eight-participant backfill',async()=>{
 const out=await mkdtemp(join(tmpdir(),'rat-bot-experiments-'));
 try{
  const f=await prepareFixture(out,{hosted:true,expiresAt:Date.now()+60000,serverBots:10,maxPlayers:10,fullLobby:true,botExperiments:true});
  const room=await readFile(join(f.stage,'src/worker/GameRoom.ts'),'utf8');
  const resolver=room.slice(room.indexOf('function privateBotExperiment'),room.indexOf('\n}',room.indexOf('function privateBotExperiment'))+2);
  const js=resolver.replace(/:import\('[^']+'\)\.BotExperiment/,'').replace('pool:string','pool');
  const resolve=new Function(`${js};return privateBotExperiment;`)();
  for(const variant of ['maneuvers','commitment','attention','combined']){
   assert.equal(resolve(`graybox-benchmark-ai-bot-${variant}-r1`),variant);
   assert.equal(resolve(`graybox-benchmark-match-bot-${variant}-r1`),variant);
   assert.equal(resolve(`public-live-v2-bot-${variant}`),'baseline');
  }
  assert.equal(resolve('graybox-benchmark-match-bot-baseline-r1'),'baseline');
  assert.match(room,/privateBotExperiment\(this.matchPool/);
  assert.match(room,/MAX_PLAYERS - humans\) : humans \? Math.max\(0, 8 - humans\) : 0/);
  assert.doesNotMatch(await readFile(new URL('../../src/worker/GameRoom.ts',import.meta.url),'utf8'),/privateBotExperiment/);
 }finally{await rm(out,{recursive:true,force:true});}
});

test('private first assignment starts a playlist without pinning later rounds',async()=>{
 const out=await mkdtemp(join(tmpdir(),'rat-first-assignment-'));
 try{
  await assert.rejects(prepareFixture(out,{firstAssignment:'chain-of-custody'}));
  await assert.rejects(prepareFixture(out,{hosted:true,firstAssignment:'invalid'}));
  await assert.rejects(prepareFixture(out,{hosted:true,firstAssignment:'chain-of-custody',assignment:'jurisdiction'}));
  const fixture=await prepareFixture(out,{hosted:true,firstAssignment:'chain-of-custody'});
  assert.equal(fixture.firstAssignment,'chain-of-custody');
  const source=await readFile(join(fixture.stage,'src/worker/GameRoom.ts'),'utf8');
  const start=source.indexOf('    // Private first cycle;');
  const end=source.indexOf('    const id=nextAssignment(this.assignmentRotation);',start);
  assert(start>0&&end>start);
  // Execute the generated first-cycle initializer repeatedly, using the actual
  // game's rotation function to consume and refill its playlist.
  const assignmentSource=await readFile(new URL('../../src/shared/assignments.ts',import.meta.url),'utf8');
  const {transpile}=await import('typescript');
  const declaration=assignmentSource.slice(assignmentSource.indexOf('export function nextAssignment'),assignmentSource.indexOf('/** The server shuffles'));
  const ASSIGNMENT_IDS=['closing-time','chain-of-custody','excessive-force','jurisdiction'];
  const nextAssignment=new Function('ASSIGNMENT_IDS',transpile(declaration.replace('export ',''))+';return nextAssignment;')(ASSIGNMENT_IDS);
  const initialize=new Function('ASSIGNMENT_IDS',source.slice(start,end));
  const room={assignmentRotation:{remaining:[]}};
  const rounds=[];
  for(let i=0;i<8;i++){initialize.call(room,ASSIGNMENT_IDS);rounds.push(nextAssignment(room.assignmentRotation,()=>.3));}
  assert.equal(rounds[0],'chain-of-custody');
  assert.equal(new Set(rounds.slice(0,4)).size,4);
  assert.equal(new Set(rounds.slice(4)).size,4);
  assert(rounds.every((id,i)=>!i||id!==rounds[i-1]));
  assert.equal(room.assignmentRotation.forced,undefined);
 }finally{await rm(out,{recursive:true,force:true});}
});

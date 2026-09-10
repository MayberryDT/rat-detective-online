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

test('full-lobby fixture fills all slots while retaining human replacement and expiry',async()=>{
 const out=await mkdtemp(join(tmpdir(),'rat-full-lobby-test-'));
 try{
  await assert.rejects(prepareFixture(out,{hosted:true,serverBots:24,maxPlayers:24}),/fullLobby/);
  await assert.rejects(prepareFixture(out,{fullLobby:true,serverBots:24,maxPlayers:24}),/hosted expiry/);
  const fixture=await prepareFixture(out,{hosted:true,expiresAt:123456,fullLobby:true,serverBots:16,maxPlayers:16});
  assert.equal(fixture.fullLobby,true);
  const room=await readFile(join(fixture.stage,'src/worker/GameRoom.ts'),'utf8');
  assert.match(room,/const desired = Math.max\(0, MAX_PLAYERS - humans\)/);
  assert.match(room,/roster.splice\(Math.max\(0, MAX_PLAYERS - humans\)\)/);
  assert.match(room,/if \(this.matchRoom && this.players.size >= MAX_PLAYERS && this.botRoster.length\)/);
  assert.match(room,/Private fixture expired/);
  assert.doesNotMatch(room,/if \(this.matchRoom && !this.humanSlots\(\)\) return/);
  assert.match(await readFile(join(fixture.stage,'src/worker/capacityTest.ts'),'utf8'),/lobby-status/);
 }finally{await rm(out,{recursive:true,force:true});}
});

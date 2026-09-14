import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareFixture,projectRoot} from '../../scripts/lib/capacity-fixture.mjs';
test('pins Jurisdiction only in the frozen hosted copy, preserving production source',async()=>{
 const out=await mkdtemp(join(tmpdir(),'jurisdiction-fixture-'));
 const source=await readFile(join(projectRoot,'src/worker/GameRoom.ts'),'utf8');
 try{
  await assert.rejects(prepareFixture(out,{assignment:'jurisdiction'}),/hosted private/);
  await assert.rejects(prepareFixture(out,{hosted:true,assignment:'invalid'}),/known mode/);
  const f=await prepareFixture(out,{hosted:true,expiresAt:Date.now()+60000,serverBots:11,maxPlayers:16,assignment:'jurisdiction'});
  const stage=await readFile(join(f.stage,'src/worker/GameRoom.ts'),'utf8');
  assert.match(stage,/this.assignmentRotation.forced="jurisdiction"/);
  assert.equal(await readFile(join(projectRoot,'src/worker/GameRoom.ts'),'utf8'),source);
  assert.equal(f.assignment,'jurisdiction');assert.equal(f.fullLobby,false);assert.equal(f.checkpointControl,false);
  assert.match(stage,/const desired = humans \? Math.max\(0, 8 - humans\) : 0/);
 }finally{await rm(out,{recursive:true,force:true});}
});

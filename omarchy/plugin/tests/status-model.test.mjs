import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

async function loadModel(){
  const source=await readFile(new URL('../StatusModel.js',import.meta.url),'utf8');
  const context={module:{exports:{}},Date,JSON,Math,Number,String,Array,Object,isFinite};
  vm.runInNewContext(source,context,{filename:'StatusModel.js'});
  return context.module.exports;
}

const paperRoom={
  room:'public-live-v2',generation:1,revision:7,roundId:'round-paper',
  observedAt:1_000_000,expiresAt:1_060_000,players:8,humans:3,
  assignment:{id:'chain-of-custody',title:'PAPER CHASE',phase:'active',remainingMs:null,clockRunning:false,
    objectiveTarget:3,objectiveUnit:'deliveries',destination:{id:'records',label:'RECORDS BUREAU'},zone:null,nextZone:null,zoneRemainingMs:null},
  scores:[{id:'a',name:'Ada',kills:1,deaths:1,objectiveScore:2},{id:'b',name:'Basil',kills:3,deaths:2,objectiveScore:1}],
  holderName:'Ada',result:null
};

test('normalizes assignment status and preserves objective ordering',async()=>{
  const model=await loadModel();
  const status=model.normalizeV1({schemaVersion:1,observedAt:1_000_000,rooms:[paperRoom]},1_000_100);
  assert.equal(status.rooms.length,1);
  assert.equal(status.rooms[0].players,8);
  assert.equal(status.rooms[0].assignment.id,'chain-of-custody');
  assert.equal(status.rooms[0].assignment.objectiveRows[0].name,'Ada');
  assert.equal(model.objectiveLine(status.rooms[0],1_000_500,true),'Deliver to RECORDS BUREAU');
  assert.deepEqual({...model.totals(status)},{rooms:1,players:8,humans:3});
  assert.equal(model.publicRoomLabel('public-live-v2-12345678-1234-4234-9234-123456789abc',1),'City 12345678');
});

test('merges paginated rooms by generation and revision without duplicates',async()=>{
  const model=await loadModel();
  const first=model.normalizeV1({schemaVersion:1,observedAt:1_000_000,nextCursor:'page-2',rooms:[paperRoom]},1_000_000);
  const changed={...paperRoom,generation:2,revision:8,players:9,humans:4};
  const overflow={...paperRoom,room:'public-live-v2-overflow-1',generation:2,revision:1,roundId:'round-zone'};
  const second=model.normalizeV1({schemaVersion:1,observedAt:1_000_010,rooms:[changed,overflow]},1_000_010);
  const merged=model.mergePages(first,second);
  assert.equal(merged.rooms.length,2);
  assert.equal(model.roomById(merged,'public-live-v2').players,9);
  assert.equal(merged.nextCursor,'');
  const olderGeneration=model.normalizeV1({schemaVersion:1,observedAt:1_000_020,rooms:[{...paperRoom,generation:1,revision:999,players:2}]},1_000_020);
  assert.equal(model.mergePages(merged,olderGeneration).rooms.find(room=>room.id==='public-live-v2').players,9);
  assert.equal(model.roomById(merged,'retired-room'),null);
});

test('distinguishes loading, live, empty, stale and unavailable',async()=>{
  const model=await loadModel();
  assert.equal(model.connectionState(null,0,1000,500,false),'loading');
  assert.equal(model.connectionState(null,0,1000,500,true),'unavailable');
  const live=model.normalizeV1({schemaVersion:1,observedAt:1000,rooms:[{...paperRoom,observedAt:1000}]},1000);
  assert.equal(model.connectionState(live,1000,1200,500,false),'live');
  assert.equal(model.connectionState(live,1000,1600,500,false),'stale');
  assert.equal(model.connectionState(live,1000,1200,500,true),'stale');
  const empty=model.normalizeV1({schemaVersion:1,observedAt:1000,rooms:[]},1000);
  assert.equal(model.connectionState(empty,1000,1200,500,false),'empty');
});

test('countdowns advance only while fresh and running, never below zero',async()=>{
  const model=await loadModel();
  assert.equal(model.displayRemaining(10_000,1000,4000,true,true),7000);
  assert.equal(model.displayRemaining(10_000,1000,4000,true,false),10_000);
  assert.equal(model.displayRemaining(10_000,1000,4000,false,true),10_000);
  assert.equal(model.displayRemaining(1000,1000,4000,true,true),0);
  assert.equal(model.formatClock(65_000),'1:05');
});

test('server timestamps are anchored to local receipt time despite clock skew',async()=>{
  const model=await loadModel();
  const serverNow=9_000_000;
  const localNow=2_000;
  const status=model.normalizeV1({schemaVersion:1,observedAt:serverNow,rooms:[{...paperRoom,observedAt:serverNow-500,expiresAt:serverNow+74_500,assignment:{...paperRoom.assignment,id:'closing-time',title:'CLOSING TIME',remainingMs:10_000,clockRunning:true,objectiveTarget:null,objectiveUnit:'last-holder',destination:null}}]},localNow);
  const room=status.rooms[0];
  assert.equal(room.localObservedAt,1500);
  assert.equal(model.objectiveLine(room,4500,true),'0:07 remaining');
  assert.equal(model.roomFresh(room,76_400),true);
  assert.equal(model.roomFresh(room,76_600),false);
});

test('legacy status stays explicitly limited',async()=>{
  const model=await loadModel();
  const status=model.normalizeLegacy({room:'public',players:2,phase:'playing',scores:[{name:'Marlowe',kills:4,deaths:3}]},1000);
  assert.equal(status.limited,true);
  assert.equal(status.rooms[0].assignment.id,'');
  assert.equal(status.rooms[0].scores[0].kills,4);
  assert.equal(model.connectionState(status,1000,75_999,90_000,false),'live');
});

test('alerts baseline, suppressions, thresholds, dedupe and cooldown are deterministic',async()=>{
  const model=await loadModel();
  const previous=model.normalizeV1({schemaVersion:1,observedAt:1000,rooms:[{...paperRoom,humans:1}]},1000);
  const current=model.normalizeV1({schemaVersion:1,observedAt:2000,rooms:[paperRoom]},2000);
  const settings={alertsEnabled:true,alertHumanThreshold:2,quietStartHour:0,quietEndHour:0};
  assert.equal(model.alertEvents(null,current,settings,2_000,{fresh:true}).length,0);
  const events=model.alertEvents(previous,current,settings,2_000,{fresh:true});
  assert.equal(events.length,1);
  assert.equal(model.alertEvents(previous,current,settings,2_000,{fresh:true,gameFocused:true}).length,0);
  assert.equal(model.alertEvents(previous,current,settings,2_000,{fresh:true,dnd:true}).length,0);
  const accepted=model.filterAlertReceipts(events,{},2_000,60_000);
  assert.equal(accepted.events.length,1);
  assert.equal(model.filterAlertReceipts(events,accepted.receipts,3_000,60_000).events.length,0);
});

test('Jurisdiction hides the next zone until warning and freezes stale countdowns',async()=>{
  const model=await loadModel();
  const base={...paperRoom,observedAt:1000,expiresAt:76000,roundId:'zone-round',assignment:{id:'jurisdiction',title:'JURISDICTION',phase:'active',remainingMs:null,clockRunning:false,objectiveTarget:60,objectiveUnit:'seconds',destination:null,zone:{id:'icebox',label:'THE ICEBOX'},nextZone:null,zoneRemainingMs:10_000}};
  const quiet=model.normalizeV1({schemaVersion:1,observedAt:1000,rooms:[base]},1000).rooms[0];
  assert.equal(model.objectiveLine(quiet,4000,true),'Hold the case in THE ICEBOX');
  const warning=model.normalizeV1({schemaVersion:1,observedAt:1000,rooms:[{...base,assignment:{...base.assignment,nextZone:{id:'sluice',label:'WEST SLUICE'}}}]},1000).rooms[0];
  assert.equal(model.objectiveLine(warning,4000,true),'Relocating to WEST SLUICE in 0:07');
  assert.equal(model.objectiveLine(warning,4000,false),'Relocating to WEST SLUICE in 0:10');
});

test('bundled static previews cover all assignments and connectivity reports',async()=>{
  const model=await loadModel();
  const bundle=JSON.parse(await readFile(new URL('../fixtures/dispatch.json',import.meta.url),'utf8'));
  const assignments=new Set();
  for(const name of ['paper','jurisdiction','excessive','closing','stale']){
    const status=model.normalizeV1(bundle.fixtures[name],10_000);
    assert.equal(status.rooms.length,1,name);
    assignments.add(status.rooms[0].assignment.id);
  }
  assert.deepEqual([...assignments].sort(),['chain-of-custody','closing-time','excessive-force','jurisdiction']);
  assert.equal(model.normalizeV1(bundle.fixtures.empty,10_000).rooms.length,0);
});

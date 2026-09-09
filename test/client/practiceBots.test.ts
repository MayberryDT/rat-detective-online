import {describe,it,expect} from 'vitest';
import {PracticeBotBrain,PracticeLifeCycle,addPracticePlayers,practiceBotCount,practiceSpawnPoints,cityPracticeSpawnPoints,practiceRespawnPoint,PRACTICE_RESPAWN_MS} from '../../src/prototype/PracticeBots';
import * as C from 'cannon-es';
import {grayboxBoxes,isRampOpening} from '../../src/shared/grayboxLayout';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import {createSeededRandom} from '../../src/shared/worldSpec';

const player=(id:string,x=0)=>createPlayer(id,id,DEFAULT_APPEARANCE,{x,y:0,z:0});
describe('local practice bots',()=>{
 it('adds exactly eleven AI alongside the human, with valid distinct spawns',()=>{
  expect(practiceBotCount('?bots=11')).toBe(11);expect(practiceBotCount('')).toBe(0);expect(practiceBotCount('?bots=100')).toBe(11);
  const players=new Map([['local',player('local')]]),points=practiceSpawnPoints({x:-10,y:0,z:-27});
  expect(points.length).toBeGreaterThan(33);
  const ids=addPracticePlayers(players,practiceBotCount('?bots=11'),points);
  expect(ids).toHaveLength(11);expect(players.size).toBe(12);
  expect(new Set(ids.map(id=>`${players.get(id)!.x}:${players.get(id)!.z}`)).size).toBe(11);
 });
 it('spreads eleven initial bots across the city on clear supported street positions',()=>{
  const human={x:-10,y:0,z:-27},points=cityPracticeSpawnPoints(human);
  expect(points).toHaveLength(32);
  const players=new Map([['local',createPlayer('local','You',DEFAULT_APPEARANCE,human)]]);
  const ids=addPracticePlayers(players,11,points),bots=ids.map(id=>players.get(id)!);
  expect(Math.max(...bots.map(p=>p.x))-Math.min(...bots.map(p=>p.x))).toBeGreaterThan(260);
  expect(Math.max(...bots.map(p=>p.z))-Math.min(...bots.map(p=>p.z))).toBeGreaterThan(260);
  for(let i=0;i<bots.length;i++)for(let j=i+1;j<bots.length;j++)expect(Math.hypot(bots[i].x-bots[j].x,bots[i].z-bots[j].z)).toBeGreaterThan(65);
  const world=new C.World();
  for(const box of grayboxBoxes()){
   const body=new C.Body({mass:0,position:new C.Vec3(box.x,box.y,box.z),shape:new C.Box(new C.Vec3(box.w/2,box.h/2,box.d/2))});
   body.quaternion.setFromEuler(box.rx,0,box.rz);body.updateAABB();world.addBody(body);
  }
  for(const p of points){
   expect(isRampOpening(p.x,p.z)).toBe(false);
   const bounds=new C.AABB({lowerBound:new C.Vec3(p.x-1.19,.51,p.z-1.19),upperBound:new C.Vec3(p.x+1.19,4.39,p.z+1.19)});
   expect(world.bodies.some(body=>body.aabb.overlaps(bounds))).toBe(false);
   const floor=new C.RaycastResult();world.raycastClosest(new C.Vec3(p.x,.49,p.z),new C.Vec3(p.x,-1,p.z),{},floor);
   expect(floor.hasHit).toBe(true);expect(floor.hitPointWorld.y).toBeCloseTo(0);
  }
 });
 it('respawns into free city space while local regroup points remain an explicit separate choice',()=>{
  const points=cityPracticeSpawnPoints({x:-10,y:0,z:-27});
  const players=new Map([['local',player('local')]]);const ids=addPracticePlayers(players,11,points);
  const chosen=practiceRespawnPoint(points,players.values(),ids[0]);
  expect(points).toContain(chosen);
  for(const p of players.values())if(p.id!==ids[0])expect(Math.hypot(p.x-chosen.x,p.z-chosen.z)).toBeGreaterThan(55);
  const local=practiceSpawnPoints({x:-10,y:0,z:-27});
  expect(local.every(p=>Math.hypot(p.x+10,p.z+27)<=52)).toBe(true);
  expect(points.some(p=>Math.hypot(p.x+10,p.z+27)>200)).toBe(true);
 });
 it('scores real hits and independently respawns the human and AI without a match ending',()=>{
  const players=new Map([['local',player('local')],['bot-1',player('bot-1',10)]]),life=new PracticeLifeCycle(players);
  expect(life.hit('bot-1','local',3,100).killed).toBe(true);
  expect(players.get('local')!.hp).toBe(0);expect(players.get('bot-1')!.kills).toBe(1);
  // Posthumous projectiles are still dangerous, with kill credit retained.
  expect(life.hit('local','bot-1',3,500).killed).toBe(true);
  expect(life.due(100+PRACTICE_RESPAWN_MS)).toEqual(['local']);
  life.respawn('local',{x:10,y:2,z:20});expect(players.get('local')!.hp).toBe(3);
  expect(players.get('local')!.deaths).toBe(1);expect(players.get('local')!.kills).toBe(1);
  expect(life.due(500+PRACTICE_RESPAWN_MS)).toEqual(['bot-1']);
  life.respawn('bot-1',{x:20,y:2,z:20});expect(life.respawns.size).toBe(0);
 });
 it('produces finite walking, jumping and imperfect shots while respecting visibility and death',()=>{
  const brain=new PracticeBotBrain(createSeededRandom(42)),self=player('bot-1'),target=player('local',15);
  let shots=0,jumps=0;
  for(let now=0;now<10000;now+=100){const action=brain.step(now,self,[self,target],()=>true,false,true);
   expect(Number.isFinite(action.x+action.z+action.facing)).toBe(true);
   if(action.shoot){shots++;expect(Number.isFinite(action.shoot.x+action.shoot.y+action.shoot.z)).toBe(true);}if(action.jump)jumps++;
  }
  expect(shots).toBeGreaterThan(3);expect(jumps).toBeGreaterThan(1);
  expect(brain.step(20000,self,[self,target],()=>false,false,true).shoot).toBeUndefined();
  self.hp=0;expect(brain.step(21000,self,[self,target],()=>true,false,true)).toMatchObject({x:0,z:0,jump:false});
 });
});

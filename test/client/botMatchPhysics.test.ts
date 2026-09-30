import {afterEach,expect,it,vi} from 'vitest';
import {ServerBotController} from '../../src/worker/ServerBotController';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import {createAssignment} from '../../src/shared/assignments';
import {seededRandom} from '../../src/shared/bots/random';
import {JURISDICTION_ZONES} from '../../src/shared/jurisdictionZones';
afterEach(()=>vi.restoreAllMocks());
it.each([8,10])('real movement, shots, damage and case scoring with %s participants',population=>{
 const now=1_000_000,spec={seed:341283204,version:2},start=JURISDICTION_ZONES['records-forecourt'].posts[0];
 vi.spyOn(Date,'now').mockReturnValue(now);vi.spyOn(Math,'random').mockImplementation(seededRandom(81));
 const players=new Map(Array.from({length:population},(_,i)=>{
  const angle=i/(population-1)*Math.PI*2;
  const p=createPlayer(i===population-1?'human':`bot-${i}`,'Rat',DEFAULT_APPEARANCE,i?{x:start.x+Math.sin(angle)*9,y:.3,z:start.z+Math.cos(angle)*8}:start);
  return[p.id,p] as const;
 }));
 let shots=0,damage=0,recoveries=0,peakShots=0;
 const respawns=new Map<string,number>();let at=now;
 const sim=new ChaosSimulation(players,hit=>{
  const p=players.get(hit.victim);if(!p||p.hp<=0)return;
  const applied=Math.min(p.hp,hit.damage);damage+=applied;p.hp-=applied;
  if(p.hp<=0){p.deaths++;sim.death(p,hit.incoming,hit.owner);respawns.set(p.id,at+3000);}
 },undefined,spec);
 const a=createAssignment('jurisdiction',now,'comparison',()=>.3);a.phase='active';a.liveAt=now;
 a.jurisdiction!.index=a.jurisdiction!.order.indexOf('records-forecourt');a.jurisdiction!.serial=a.jurisdiction!.index;
 sim.setAssignment(a);sim.caseBody.position.set(start.x,start.y+.8,start.z);sim.caseBody.velocity.setZero();sim.step(0,now);
 expect(sim.caseHolderId).toBe('bot-0');
 const ids=[...players.keys()].filter(id=>id!=='human');
 const controller=new ServerBotController(spec,ids,{
  move:(id,p,facing)=>Object.assign(players.get(id)!,p,{meshQy:Math.sin(facing/2),meshQw:Math.cos(facing/2)}),
  shoot:(id,origin,direction)=>{sim.shoot(id,{shotId:`shot-${shots++}`,origin,direction});},recover:()=>{recoveries++;},
 });
 try{
  for(let frame=1;frame<=720;frame++){
   at=now+frame*1000/60;
   for(const [id,deadline] of respawns)if(at>=deadline){
    const p=players.get(id)!;Object.assign(p,{hp:3,x:start.x-10,y:.3,z:start.z+5});respawns.delete(id);controller.reset(id,p);
   }
   controller.step(1/60,at,players,sim.snapshot(false),true);sim.step(1/60,at);
   peakShots=Math.max(peakShots,sim.snapshot(false).shots.length);
  }
  for(const p of players.values())expect([p.x,p.y,p.z].every(Number.isFinite)).toBe(true);
  expect(shots).toBeGreaterThan(20);expect(damage).toBeGreaterThan(0);expect(recoveries).toBe(0);expect(peakShots).toBeLessThanOrEqual(256);
  // An exposed carrier can be disarmed in under a second.
  expect(Object.values(sim.assignmentState!.jurisdiction!.heldMs).reduce((sum,v)=>sum+v,0)).toBeGreaterThan(0);
 }finally{controller.dispose();}
},30000);

it.each(Object.keys(JURISDICTION_ZONES) as Array<keyof typeof JURISDICTION_ZONES>)('holding retains real scoring and support in %s',id=>{
 const now=1_000_000,spec={seed:341283204,version:2};vi.spyOn(Date,'now').mockReturnValue(now);vi.spyOn(Math,'random').mockReturnValue(.3);
 const zone=JURISDICTION_ZONES[id],start=zone.posts[1],bot=createPlayer('bot','Bot',DEFAULT_APPEARANCE,start),players=new Map([[bot.id,bot]]);
 const sim=new ChaosSimulation(players,()=>{},undefined,spec),a=createAssignment('jurisdiction',now,'quiet',()=>.3);a.phase='active';a.liveAt=now;
 a.jurisdiction!.index=a.jurisdiction!.order.indexOf(id);a.jurisdiction!.serial=a.jurisdiction!.index;sim.setAssignment(a);
 sim.caseBody.position.set(start.x,start.y+.8,start.z);sim.caseBody.velocity.setZero();sim.step(0,now);
 let recoveries=0,quietShots=0;
 const controller=new ServerBotController(spec,['bot'],{move:(_id,p)=>Object.assign(bot,p),shoot:()=>{quietShots++;},recover:()=>{recoveries++;}});
 try{
  for(let frame=1;frame<=900;frame++){const t=now+frame*1000/60;controller.step(1/60,t,players,sim.snapshot(false),true);sim.step(1/60,t);}
  expect(sim.assignmentState!.jurisdiction!.heldMs.bot,id).toBeGreaterThan(14500);expect(recoveries,id).toBe(0);expect(quietShots,id).toBe(0);
 }finally{controller.dispose();}
},30000);

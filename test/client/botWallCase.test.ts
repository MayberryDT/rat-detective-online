import {afterEach,expect,it,vi} from 'vitest';
import {ServerBotController} from '../../src/worker/ServerBotController';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import {seededRandom} from '../../src/shared/bots/random';
import {createAssignment} from '../../src/shared/assignments';
import {grayboxBoxes} from '../../src/shared/grayboxLayout';
afterEach(()=>vi.restoreAllMocks());
it.each([
 [-36,-35.9,0,1],[-35,-35.9,0,1],[-36,-82.1,0,-1],[-35,-82.1,0,-1],
 [17.1,-68,1,0],[17.1,-67,1,0],[-49.1,-68,-1,0],[-49.1,-67,-1,0],
] as const)('collects the real case beside a wall at %s,%s',(x,z,dx,dz)=>{
 vi.spyOn(Math,'random').mockImplementation(seededRandom(81));const now=1_000_000,spec={seed:341283204,version:2};
 const bot=createPlayer('bot','Bot',DEFAULT_APPEARANCE,{x:x+dx*8,y:.3,z:z+dz*8}),players=new Map([[bot.id,bot]]);
 const sim=new ChaosSimulation(players,()=>{},undefined,spec),a=createAssignment('jurisdiction',now,'wall',()=>.3);a.phase='active';a.liveAt=now;sim.setAssignment(a);
 sim.caseBody.position.set(x,.8,z);sim.caseBody.velocity.setZero();sim.caseBody.angularVelocity.setZero();
 const ctl=new ServerBotController(spec,[bot.id],{move:(_id,p)=>Object.assign(bot,p),shoot:()=>{},recover:()=>{}});

 try{
 for(let i=0;i<900&&!sim.caseHolderId;i++){
  const at=now+i*1000/60,s=sim.snapshot(false);s.pickups=[];ctl.step(1/60,at,players,s,true);sim.step(1/60,at);
 }
 expect(sim.caseHolderId,JSON.stringify({p:{x:bot.x,y:bot.y,z:bot.z},case:sim.snapshot(false).case.p})).toBe(bot.id);
 }finally{ctl.dispose();}
},30000);

it.each(['bin','crate','dumpster'] as const)('gets along the curb past a real city %s: over it, or tightly round the wide dumpster',kind=>{
 vi.spyOn(Math,'random').mockImplementation(seededRandom(81));const now=1_000_000,spec={seed:341283204,version:2};
 const obstacle=grayboxBoxes(spec).find(b=>b.debris===kind)!;
 const bot=createPlayer('bot','Bot',DEFAULT_APPEARANCE,{x:obstacle.x-3.5,y:.3,z:obstacle.z}),players=new Map([[bot.id,bot]]);
 const sim=new ChaosSimulation(players,()=>{},undefined,spec);sim.caseBody.position.set(obstacle.x+3.5,.6,obstacle.z);sim.caseBody.velocity.setZero();
 const ctl=new ServerBotController(spec,[bot.id],{move:(_id,p)=>Object.assign(bot,p),shoot:()=>{},recover:()=>{}});
 let crossed=false,wide=0,ticks=0;
 try{for(;ticks<900&&!sim.caseHolderId;ticks++){const at=now+ticks*1000/60,s=sim.snapshot(false);s.pickups=[];ctl.step(1/60,at,players,s,true);sim.step(1/60,at);wide=Math.max(wide,Math.abs(bot.z-obstacle.z));if(Math.abs(bot.x-obstacle.x)<.65&&Math.abs(bot.z-obstacle.z)<obstacle.d/2+.58&&bot.y>obstacle.h-.05)crossed=true;}
 // At a player's pace a rat that lands from its spawn is already beside the 2.8-unit dumpster, so a corner
 // hugging its end is as good as a hop; the small bin and crate are always hopped.
 expect(crossed||kind==='dumpster'&&wide<obstacle.d/2+2,JSON.stringify({obstacle,p:{x:bot.x,y:bot.y,z:bot.z},wide,holder:sim.caseHolderId})).toBe(true);
 expect(sim.caseHolderId).toBe(bot.id);expect(ticks).toBeLessThan(180);
 }finally{ctl.dispose();}
},30000);

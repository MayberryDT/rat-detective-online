import {afterEach,expect,it,vi} from 'vitest';
import {ServerBotController} from '../../src/worker/ServerBotController';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import {combatRandom} from '../../src/shared/BotCombat';
import {createAssignment} from '../../src/shared/assignments';
import {grayboxBoxes} from '../../src/shared/grayboxLayout';
afterEach(()=>vi.restoreAllMocks());
it.each([
 [-36,-35.9,0,1],[-35,-35.9,0,1],[-36,-82.1,0,-1],[-35,-82.1,0,-1],
 [17.1,-68,1,0],[17.1,-67,1,0],[-49.1,-68,-1,0],[-49.1,-67,-1,0],
] as const)('collects the real case beside a wall at %s,%s',(x,z,dx,dz)=>{
 vi.spyOn(Math,'random').mockImplementation(combatRandom(81));const now=1_000_000,spec={seed:341283204,version:2};
 const bot=createPlayer('bot','Bot',DEFAULT_APPEARANCE,{x:x+dx*8,y:.3,z:z+dz*8}),players=new Map([[bot.id,bot]]);
 const sim=new ChaosSimulation(players,()=>{},undefined,spec),a=createAssignment('jurisdiction',now,'wall',()=>.3);a.phase='active';a.liveAt=now;sim.setAssignment(a);
 sim.caseBody.position.set(x,.8,z);sim.caseBody.velocity.setZero();sim.caseBody.angularVelocity.setZero();
 const ctl=new ServerBotController(spec,[bot.id],{move:(_id,p)=>Object.assign(bot,p),shoot:()=>{},recover:()=>{}},'combined');

 try{
 for(let i=0;i<900&&!sim.caseHolderId;i++){
  const at=now+i*1000/60,s=sim.snapshot(false);s.pickups=[];ctl.step(1/60,at,players,s,true);sim.step(1/60,at);
 }
 expect(sim.caseHolderId,JSON.stringify({p:{x:bot.x,y:bot.y,z:bot.z},case:sim.snapshot(false).case.p})).toBe(bot.id);
 }finally{ctl.dispose();}
},30000);

it.each(['bin','crate','dumpster'] as const)('jumps along the curb over a real city %s',kind=>{
 vi.spyOn(Math,'random').mockImplementation(combatRandom(81));const now=1_000_000,spec={seed:341283204,version:2};
 const obstacle=grayboxBoxes(spec).find(b=>b.debris===kind)!;
 const bot=createPlayer('bot','Bot',DEFAULT_APPEARANCE,{x:obstacle.x-3.5,y:.3,z:obstacle.z}),players=new Map([[bot.id,bot]]);
 const sim=new ChaosSimulation(players,()=>{},undefined,spec);sim.caseBody.position.set(obstacle.x+3.5,.6,obstacle.z);sim.caseBody.velocity.setZero();
 const ctl=new ServerBotController(spec,[bot.id],{move:(_id,p)=>Object.assign(bot,p),shoot:()=>{},recover:()=>{}},'combined');
 let crossed=false;
 try{for(let i=0;i<900&&!sim.caseHolderId;i++){const at=now+i*1000/60,s=sim.snapshot(false);s.pickups=[];ctl.step(1/60,at,players,s,true);sim.step(1/60,at);if(Math.abs(bot.x-obstacle.x)<.65&&Math.abs(bot.z-obstacle.z)<obstacle.d/2+.58&&bot.y>obstacle.h-.05)crossed=true;}
 expect(crossed,JSON.stringify({obstacle,p:{x:bot.x,y:bot.y,z:bot.z},holder:sim.caseHolderId})).toBe(true);expect(sim.caseHolderId).toBe(bot.id);
 }finally{ctl.dispose();}
},30000);

import {afterEach,expect,it,vi} from 'vitest';
import {ServerBotController} from '../../src/worker/ServerBotController';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import {BotNavigation} from '../../src/shared/BotNavigation';
import {combatRandom} from '../../src/shared/BotCombat';
import type {GrayboxBox} from '../../src/shared/grayboxLayout';
const fixture=vi.hoisted(()=>({boxes:[] as GrayboxBox[]}));
vi.mock('../../src/shared/grayboxLayout',async original=>({...await original<typeof import('../../src/shared/grayboxLayout')>(),grayboxBoxes:()=>fixture.boxes}));
afterEach(()=>vi.restoreAllMocks());
const box=(x:number,y:number,z:number,w:number,h:number,d:number):GrayboxBox=>({x,y,z,w,h,d,rx:0,rz:0,color:0});
it.each([.1,.3,.5,.7,.9,1.1,1.3,1.5,1.7,1.9])('wall pickup at grid offset %s',offset=>{
 vi.spyOn(Math,'random').mockImplementation(combatRandom(81));
 fixture.boxes=[box(0,-.5,0,100,1,100),box(offset-.1,5,0,.2,10,16)];
 const bot=createPlayer('bot','Bot',DEFAULT_APPEARANCE,{x:offset+3,y:.3,z:10}),players=new Map([[bot.id,bot]]),spec={seed:341283204,version:2};
 const sim=new ChaosSimulation(players,()=>{},undefined,spec);sim.caseBody.position.set(offset+.25,.55,1);sim.caseBody.velocity.setZero();
 const ctl=new ServerBotController(spec,[bot.id],{move:(_id,p)=>Object.assign(bot,p),shoot:()=>{},recover:()=>{}},'combined');
 try{for(let i=0;i<600&&!sim.caseHolderId;i++){const at=1_000_000+i*1000/60,s=sim.snapshot(false);s.pickups=[];ctl.step(1/60,at,players,s,true);sim.step(1/60,at);}
 expect(sim.caseHolderId,JSON.stringify({bot,case:sim.snapshot(false).case.p})).toBe(bot.id);
 }finally{ctl.dispose();}
});
it.each([1.25,1.65,2].flatMap(height=>[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dz])=>({height,dx,dz}))))('jumps over $height-unit obstacle toward ($dx,$dz)',({height,dx,dz})=>{
 vi.spyOn(Math,'random').mockImplementation(combatRandom(81));
 fixture.boxes=[box(30,-.5,30,80,1,80),box(30+dx*3,height/2,30+dz*3,dx?1.5:6,height,dz?1.5:6)];
 const bot=createPlayer('bot','Bot',DEFAULT_APPEARANCE,{x:30,y:.3,z:30}),players=new Map([[bot.id,bot]]),spec={seed:341283204,version:2};
 const sim=new ChaosSimulation(players,()=>{},undefined,spec);sim.caseBody.position.set(30+dx*7,.6,30+dz*7);sim.caseBody.velocity.setZero();
 const ctl=new ServerBotController(spec,[bot.id],{move:(_id,p)=>Object.assign(bot,p),shoot:()=>{},recover:()=>{}},'combined');
 let crossed=false;
 try{for(let i=0;i<600&&!sim.caseHolderId;i++){const at=1_000_000+i*1000/60,s=sim.snapshot(false);s.pickups=[];ctl.step(1/60,at,players,s,true);sim.step(1/60,at);if(Math.abs((bot.x-30)*dx+(bot.z-30)*dz-3)<.8&&Math.abs((bot.x-30)*dz-(bot.z-30)*dx)<2.8&&bot.y>=height-.05)crossed=true;}
 expect(crossed,JSON.stringify({x:bot.x,y:bot.y,z:bot.z,holder:sim.caseHolderId})).toBe(true);
 expect(sim.caseHolderId).toBe(bot.id);
 }finally{ctl.dispose();}
});
it('collects a wall case through a body-wide gap with no centered grid node',()=>{
 vi.spyOn(Math,'random').mockImplementation(combatRandom(81));
 fixture.boxes=[box(0,-.5,0,80,1,80),box(-1,5,0,2,10,30),box(2.4,1,0,2,2,10)];
 const bot=createPlayer('bot','Bot',DEFAULT_APPEARANCE,{x:.8,y:.3,z:8}),players=new Map([[bot.id,bot]]),spec={seed:341283204,version:2};
 const sim=new ChaosSimulation(players,()=>{},undefined,spec);sim.caseBody.position.set(.38,.55,0);sim.caseBody.velocity.setZero();
 const ctl=new ServerBotController(spec,[bot.id],{move:(_id,p)=>Object.assign(bot,p),shoot:()=>{},recover:()=>{}},'combined');
 const samples:unknown[]=[];
 try{for(let i=0;i<600&&!sim.caseHolderId;i++){const at=1_000_000+i*1000/60,s=sim.snapshot(false);s.pickups=[];ctl.step(1/60,at,players,s,true);sim.step(1/60,at);if(i%60===0)samples.push({x:bot.x,y:bot.y,z:bot.z,case:s.case.p});}
 expect(sim.caseHolderId,JSON.stringify(samples)).toBe(bot.id);
 }finally{ctl.dispose();}
});

it.each(['wall','ceiling','missing-landing','open-floor'] as const)('rejects unsafe or unnecessary jump: %s',kind=>{
 const floor=box(30,-.5,30,80,1,80),obstacle=box(30,.8,33,6,1.6,1.5);
 fixture.boxes=kind==='missing-landing'?[box(30,-.5,30,80,1,5),obstacle]:[floor,...(kind==='open-floor'?[]:[kind==='wall'?box(30,5,33,6,10,1.5):obstacle]),...(kind==='ceiling'?[box(30,6,33,20,.4,20)]:[])];
 const nav=new BotNavigation({seed:341283204,version:2});
 expect(nav.jumpStep({x:30,y:0,z:30},{x:30,y:0,z:37})).toBeUndefined();
});

import {expect,it} from 'vitest';
import {ServerBotController} from '../../src/worker/ServerBotController';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import {createWorldSpec} from '../../src/shared/worldSpec';
import type {ChaosState} from '../../src/shared/chaosState';

it('keeps eleven dispersed rats pursuing one carrier through real city geometry',()=>{
 const starts=[[-187,-57],[10,-47],[52,132],[-103,-108],[140,-44],[-172,-184],[160,-138],[162,160],[-92,28],[-52,140],[4,-172]];
 const bots=starts.map(([x,z],i)=>createPlayer(`rd-ai-${i}`,'Bot',DEFAULT_APPEARANCE,{x,y:0,z}));
 const carrier=createPlayer('carrier','Carrier',DEFAULT_APPEARANCE,{x:69,y:0,z:6});
 const players=new Map([...bots,carrier].map(p=>[p.id,p]));let shots=0,rescues=0;
 const state:ChaosState={time:1000,case:{owner:carrier.id,previousOwner:null,pickupAfter:0,returningUntil:0,p:{x:69,y:.52,z:6},v:{x:0,y:0,z:0},q:{x:0,y:0,z:0,w:1},spin:{x:0,y:0,z:0}},dispatch:{phase:'cooldown',started:0,until:60000,serial:1},possession:{},corpses:[],shots:[],impacts:[],notice:{serial:0,text:''}};
 const ctl=new ServerBotController({...createWorldSpec(341283204),version:2},bots.map(b=>b.id),{move:(id,p)=>Object.assign(players.get(id)!,p),shoot:()=>shots++,recover:()=>rescues++});
 try{
  for(let i=0;i<2400;i++){
   ctl.step(1/60,1000+i*1000/60,players,state,true);
   if(i===599)expect(bots.filter((b,n)=>Math.hypot(b.x-starts[n][0],b.z-starts[n][1])>10).length).toBeGreaterThanOrEqual(9);
  }
  for(let n=0;n<bots.length;n++)expect(Math.hypot(bots[n].x-69,bots[n].z-6),`bot ${n}`).toBeLessThan(Math.hypot(starts[n][0]-69,starts[n][1]-6)*.55);
  expect(shots).toBeGreaterThan(200);expect(rescues).toBe(0);
 }finally{ctl.dispose();}
},30000);

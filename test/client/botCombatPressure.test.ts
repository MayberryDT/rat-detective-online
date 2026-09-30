import {badRound} from '../../src/shared/shotPattern';
import {it,expect,vi} from 'vitest';
import {RatBot} from '../../src/shared/bots/ratBot';
import type {MotorNavigation} from '../../src/shared/bots/motor';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {CHAOS_TUNING} from '../../src/shared/chaosState';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import {worldIntent} from './botControls';
vi.mock('../../src/shared/grayboxLayout',()=>({CITY_BOUNDS:{min:-196,max:166},grayboxBoxes:()=>[]}));
it.each(['scattershot','bad-ammunition'] as const)('keeps fresh human fire admitted during seven-bot %s bursts',incident=>{
 const now=Date.now(),human=createPlayer('human','Human',DEFAULT_APPEARANCE,{x:0,y:200,z:30});
 const bots=Array.from({length:7},(_,i)=>createPlayer(`bot-${i}`,'Bot',DEFAULT_APPEARANCE,{x:i,y:200,z:0}));
 const players=new Map([...bots,human].map(p=>[p.id,p]));
 const initial=new ChaosSimulation(players,()=>{}),saved=initial.snapshot(false);
 saved.dispatch={phase:'active',started:now,until:now+25000,serial:1,incident};
 const sim=new ChaosSimulation(players,()=>{},saved);
 // Bots that stand still and fire at the visible human.
 const nav:MotorNavigation={route:()=>[],explorationTargets:()=>[]};
 const brains=bots.map((_,i)=>new RatBot(nav,i,()=>.5));
 let triggers=0;
 for(let frame=0;frame<600;frame++){
  const t=now+frame*1000/60,state=sim.snapshot(false);
  bots.forEach((bot,i)=>{const shot=worldIntent(brains[i].step(t,bot,[human],state,()=>true,false,true),bot).shoot;if(!shot)return;
   triggers++;sim.shoot(bot.id,{shotId:`${i}-${frame}`,origin:{x:bot.x,y:200.9,z:0},direction:{x:shot.x-bot.x,y:shot.y-200.9,z:shot.z}});
  });
  sim.step(1/60,t);
  if(frame%60===0){
   let id=`human-${frame}`;for(let n=0;badRound(id).round!=='crooked';n++)id=`human-${frame}-${n}`;
   sim.shoot(human.id,{shotId:id,origin:{x:0,y:210,z:30},direction:{x:0,y:0,z:-1}});
   const shots=sim.snapshot(false).shots;expect(shots.length).toBeLessThanOrEqual(CHAOS_TUNING.maxShots);
   expect(shots.some(s=>s.id===id&&s.owner===human.id)).toBe(true);
  }
 }
 expect(triggers).toBeGreaterThan(140);
});

import {it,expect,vi} from 'vitest';
import {BotOpportunisticFire} from '../../src/shared/BotOpportunisticFire';
import {combatRandom} from '../../src/shared/BotCombat';
import {ObjectiveBotBrain} from '../../src/shared/ObjectiveBotBrain';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import {DISPATCH_STATIONS,type ChaosState} from '../../src/shared/chaosState';
const self={x:0,y:0,z:0};
it('fires sporadic groups with no opponents, with bounded cadence and no catch-up volleys',()=>{
 const fire=new BotOpportunisticFire(combatRandom(30)),shots:number[]=[];
 for(let now=0;now<60000;now+=17)if(fire.step(now,self,0,undefined,true,true))shots.push(now);
 expect(shots.length).toBeGreaterThan(110);expect(shots.length).toBeLessThan(170);
 expect(shots[0]).toBeGreaterThanOrEqual(800);
 for(let i=1;i<shots.length;i++)expect(shots[i]-shots[i-1]).toBeGreaterThanOrEqual(220);
 expect(shots.some((t,i)=>i>0&&t-shots[i-1]>=1200)).toBe(true);
 // A suspended frame expires the active window rather than replaying it.
 const stalled=new BotOpportunisticFire(()=>.5);stalled.step(0,self,0,undefined,true,true);
 expect(stalled.step(1800,self,0,undefined,true,true)).toBeDefined();
 expect(stalled.step(100000,self,0,undefined,true,true)).toBeUndefined();
 expect(stalled.step(100000,self,0,undefined,true,true)).toBeUndefined();
});
it('mixes corridor and oblique wall directions while following downhill routes',()=>{
 const fire=new BotOpportunisticFire(combatRandom(13)),angles:number[]=[],heights:number[]=[];
 for(let now=0;now<60000;now+=17){const shot=fire.step(now,self,0,{x:0,y:-7,z:20},true,true);if(shot){angles.push(Math.abs(Math.atan2(shot.x,shot.z)));heights.push(shot.y);}}
 expect(angles.some(a=>a<.2)).toBe(true);expect(angles.some(a=>a>.3)).toBe(true);
 expect(angles.every(a=>a<.9)).toBe(true);expect(heights.every(y=>y<self.y+.9)).toBe(true);
});
it('cancels speculative groups for visible combat or Dispatch and honors the shared trigger gate',()=>{
 const fire=new BotOpportunisticFire(()=>.5);fire.step(0,self,0,undefined,true,true);
 expect(fire.step(1500,self,0,undefined,true,false)).toBeUndefined();
 expect(fire.step(1500,self,0,undefined,true,true)).toBeDefined();
 const heading=fire.facing(1500);expect(heading).toBeDefined();expect(fire.facing(1800)).toBe(heading);
 expect(fire.step(1900,self,0,undefined,false,true)).toBeUndefined();expect(fire.facing(1900)).toBeUndefined();
 expect(fire.step(1910,self,0,undefined,true,true)).toBeUndefined();
 fire.reset();expect(fire.step(4000,self,0,undefined,true,true)).toBeUndefined();
});
it('shoots while following the case with nobody in sight without changing navigation or movement',()=>{
 const nav={route:vi.fn((_from:unknown,to:{x:number;y:number;z:number})=>[to]),explorationTargets:()=>[]};
 const brain=new ObjectiveBotBrain(nav,4,()=>.5),bot=createPlayer('bot','Bot',DEFAULT_APPEARANCE,self);
 const state:ChaosState={time:0,case:{owner:null,previousOwner:null,pickupAfter:0,returningUntil:0,p:{x:0,y:0,z:400},q:{x:0,y:0,z:0,w:1},v:self,spin:self},dispatch:{phase:'cooldown',started:0,until:60000,serial:0},possession:{},corpses:[],shots:[],impacts:[],notice:{serial:0,text:''}};
 let shots=0;
 for(let now=0;now<10000;now+=17){const intent=brain.step(now,bot,[bot],state,()=>false,false,true);
  expect(brain.objective).toBe('case');expect(intent.x).toBe(0);expect(intent.z).toBe(12);if(intent.shoot)shots++;bot.z+=intent.z*.017;
 }
 expect(shots).toBeGreaterThan(5);expect(nav.route).toHaveBeenCalledTimes(1);
 bot.hp=0;expect(brain.step(20000,bot,[bot],state,()=>false,false,true).shoot).toBeUndefined();
 bot.hp=3;brain.reset();expect(brain.step(20001,bot,[bot],state,()=>false,false,true).shoot).toBeUndefined();
 // A ready visible Dispatch target still takes priority over a speculative group.
 const target=DISPATCH_STATIONS[0].target;bot.x=target.x;bot.z=target.z+12;state.dispatch.phase='ready';
 let dispatchShot;
 for(let now=22000;now<24000;now+=17){const intent=brain.step(now,bot,[bot],state,()=>false,false,true,()=>true);
  if(intent.shoot){dispatchShot=intent.shoot;break;}
 }
 expect(dispatchShot).toEqual({x:target.x,y:target.y,z:target.z});
});

import {expect,it,vi} from 'vitest';
import {ObjectiveBotBrain} from '../../src/shared/ObjectiveBotBrain';
import {BOT_LAUNCH_LINKS} from '../../src/shared/BotLaunchRoutes';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import type {ChaosState} from '../../src/shared/chaosState';

function fixture(){
 const link=BOT_LAUNCH_LINKS[0],self=createPlayer('bot','Bot',DEFAULT_APPEARANCE,link.machine.pad),human=createPlayer('human','Human',DEFAULT_APPEARANCE,link.landing);
 const state:ChaosState={time:1000,case:{owner:human.id,previousOwner:null,pickupAfter:0,returningUntil:0,p:link.landing,q:{x:0,y:0,z:0,w:1},v:{x:0,y:0,z:0},spin:{x:0,y:0,z:0}},dispatch:{phase:'cooldown',started:0,until:5000,serial:0},possession:{},shots:[],corpses:[],impacts:[],notice:{serial:0,text:''}};
 const route=vi.fn(()=>[{...link.machine.pad,launch:link},{...link.landing}]);
 const brain=new ObjectiveBotBrain({route,explorationTargets:()=>[]},0,()=>.5);
 return {brain,link,self,human,state,route};
}
it('holds the pad, respects cooldown/occlusion and waits for the real launch before steering',()=>{
 const {brain,link,self,human,state}=fixture();
 const step=(at:number,grounded=true,clear=true)=>{state.time=at;return brain.step(at,self,[human],state,()=>false,true,grounded,()=>clear);};
 state.pressure={serial:0,until:3000,launches:[],cooldowns:{[link.machine.id]:3000}};
 expect(step(1000)).toMatchObject({x:0,z:0,jump:false,shoot:undefined});
 expect(step(3100,true,false).shoot).toBeUndefined();
 expect(step(3200).shoot).toBeDefined();
 // More than the ordinary stuck-route interval: deliberate waiting must not
 // trigger its recovery jump, abandon the route or pretend launch succeeded.
 expect(step(3600)).toMatchObject({x:0,z:0,jump:false});
 state.pressure.launches=[{id:'real',playerId:self.id,machineId:link.machine.id,at:3610,velocity:{x:0,y:90,z:0}}];
 self.y=10;expect(step(3620,false)).toMatchObject({x:0,z:0,jump:false});
 self.y=60;const flight=step(4100,false);
 expect(flight.x).toBeGreaterThan(0);expect(flight.z).toBeLessThan(0);expect(flight.shoot).toBeUndefined();
 expect(Math.hypot(flight.x,flight.z)).toBeLessThanOrEqual(12+1e-9);
 Object.assign(self,link.landing);expect(step(4400,false)).toMatchObject({x:0,z:0});
});
it('abandons a blocked launcher within a bounded wait and reset discards stale flight/events',()=>{
 const {brain,link,self,human,state}=fixture();
 for(let now=1000;now<=10000;now+=250){state.time=now;brain.step(now,self,[human],state,()=>false,false,true,()=>false);}
 expect(brain.goalKey).not.toBe('carrier:human');
 brain.reset();state.pressure={serial:1,until:12000,launches:[{id:'old',playerId:self.id,machineId:link.machine.id,at:1000,velocity:{x:0,y:90,z:0}}]};
 state.time=11000;const after=brain.step(11000,self,[human],state,()=>false,false,true,()=>false);
 expect(after).toMatchObject({x:0,z:0,jump:false});
 self.hp=0;expect(brain.step(11010,self,[human],state,()=>true,true,true)).toMatchObject({x:0,z:0,jump:false});
});

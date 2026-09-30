import {PRESSURE_TUNING} from '../../src/shared/chaosState';
import {expect,it,vi} from 'vitest';
import {RatBot} from '../../src/shared/bots/ratBot';
import {BOT_LAUNCH_LINKS} from '../../src/shared/BotLaunchRoutes';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import type {ChaosState} from '../../src/shared/chaosState';
import {worldIntent} from './botControls';

/** Keys at rest (idle keys may read as a signed zero in world terms). */
const STOPPED={x:expect.closeTo(0),z:expect.closeTo(0)};

function fixture(){
 const link=BOT_LAUNCH_LINKS[0],self=createPlayer('bot','Bot',DEFAULT_APPEARANCE,link.machine.pad),human=createPlayer('human','Human',DEFAULT_APPEARANCE,link.landing);
 const state:ChaosState={time:1000,case:{owner:human.id,previousOwner:null,pickupAfter:0,returningUntil:0,p:link.landing,q:{x:0,y:0,z:0,w:1},v:{x:0,y:0,z:0},spin:{x:0,y:0,z:0}},dispatch:{phase:'cooldown',started:0,until:5000,serial:0},possession:{},shots:[],corpses:[],impacts:[],notice:{serial:0,text:''}};
 const route=vi.fn(()=>[{...link.machine.pad,launch:link},{...link.landing}]);
 const brain=new RatBot({route,explorationTargets:()=>[]},0,()=>.5);
 return {brain,link,self,human,state,route};
}
it('holds the pad, respects cooldown/occlusion and waits for the real launch before steering',()=>{
 const {brain,link,self,human,state}=fixture();
 const step=(at:number,grounded=true,clear=true)=>{state.time=at;return worldIntent(brain.step(at,self,[human],state,()=>false,true,grounded,()=>clear),self);};
 // Fired at 2000: cooling until 3000.
 state.pressure={serial:0,levels:{},launches:[],fired:{[link.machine.id]:3000-PRESSURE_TUNING.cooldownMs}};
 // Waiting out the cooldown on the pad, the gun swings onto the trigger without firing.
 for(let at=1000;at<=1600;at+=20){const held=step(at);expect(held).toMatchObject({...STOPPED,jump:false});expect(held.shoot).toBeUndefined();}
 expect(step(3100,true,false).shoot).toBeUndefined();
 let fired=false;for(let at=3120;at<3500&&!fired;at+=20)fired=!!step(at).shoot;
 expect(fired).toBe(true);
 // More than the ordinary stuck-route interval: deliberate waiting must not
 // trigger its recovery jump, abandon the route or pretend launch succeeded.
 expect(step(3600)).toMatchObject({...STOPPED,jump:false});
 state.pressure!.launches=[{id:'real',playerId:self.id,machineId:link.machine.id,at:3610,velocity:{x:0,y:90,z:0}}];
 self.y=10;expect(step(3620,false)).toMatchObject({...STOPPED,jump:false});
 self.y=60;const flight=step(4100,false);
 expect(flight.x).toBeGreaterThan(0);expect(flight.z).toBeLessThan(0);expect(flight.shoot).toBeUndefined();
 expect(Math.hypot(flight.x,flight.z)).toBeLessThanOrEqual(12+1e-9);
 Object.assign(self,link.landing);expect(step(4400,false)).toMatchObject(STOPPED);
});
it('abandons a blocked launcher within a bounded wait and reset discards stale flight/events',()=>{
 const {brain,link,self,human,state}=fixture();
 for(let now=1000;now<=14000;now+=250){state.time=now;brain.step(now,self,[human],state,()=>false,false,true,()=>false);}
 expect(brain.goalKey).not.toBe('carrier:human');
 brain.reset();state.pressure={serial:1,levels:{},launches:[{id:'old',playerId:self.id,machineId:link.machine.id,at:1000,velocity:{x:0,y:90,z:0}}]};
 state.time=15000;const after=worldIntent(brain.step(15000,self,[human],state,()=>false,false,true,()=>false),self);
 expect(after).toMatchObject({...STOPPED,jump:false});
 self.hp=0;expect(worldIntent(brain.step(15010,self,[human],state,()=>true,true,true),self)).toMatchObject({...STOPPED,jump:false});
});

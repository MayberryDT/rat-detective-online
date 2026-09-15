import {describe,it,expect,vi} from 'vitest';
import {NormalGameBots,normalGameBotCount,type BotTransport} from '../../src/session/NormalGameBots';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import type {ClientMessage,ServerMessage} from '../../src/shared/networkProtocol';
import {PROTOCOL_VERSION} from '../../src/shared/networkProtocol';
import {createWorldSpec} from '../../src/shared/worldSpec';
import type {ChaosState} from '../../src/shared/chaosState';
vi.mock('../../src/shared/grayboxLayout',async original=>{
 const actual=await original<typeof import('../../src/shared/grayboxLayout')>();
 return {...actual,grayboxBoxes:()=>[{x:0,y:-1,z:0,w:1000,h:2,d:1000,rx:0,rz:0}]};
});
class Transport implements BotTransport{
 state='playing';onMessage:((m:ServerMessage)=>void)|null=null;
 messages:ClientMessage[]=[];name='';destroyed=false;
 connect(name:string){this.name=name;}send(m:ClientMessage){this.messages.push(m);return true;}
 destroy(){this.destroyed=true;}
}
const spec={...createWorldSpec(42),version:2};
function fixture(){
 const transports:Transport[]=[];
 const human=createPlayer('human','You',DEFAULT_APPEARANCE,{x:0,y:0,z:0});
 const navigation={supported:(from:{y:number})=>Math.abs(from.y)<.65,route:vi.fn((_from:{x:number;y:number;z:number},to:{x:number;y:number;z:number})=>[to]),explorationTargets:()=>[{x:80,y:0,z:80}],update:vi.fn()};
 const coordinator=new NormalGameBots(spec,{human},{createTransport:()=>{const t=new Transport();transports.push(t);return t;},muzzle:()=>({x:8,y:1.4,z:0}),navigation});
 const joined=(i:number)=>{
  const player=createPlayer(`bot${i}`,transports[i].name,DEFAULT_APPEARANCE,{x:8+i*8,y:0,z:0});
  transports[i].onMessage?.({type:'welcome',id:player.id,player,players:{human,[player.id]:player},round:{phase:'playing'},world:spec,protocolVersion:PROTOCOL_VERSION,serverTime:0});
  return player;
 };
 return {coordinator,transports,joined,navigation};
}
describe('ordinary local practice match clients',()=>{
 it('only permits eleven bots in an explicitly local private practice room',()=>{
  expect(normalGameBotCount({hostname:'127.0.0.1',search:'?room=graybox-practice-rounds&bots=11'})).toBe(11);
  for(const location of [{hostname:'game.example',search:'?room=graybox-practice-rounds&bots=11'},{hostname:'localhost',search:'?room=public&bots=11'},{hostname:'localhost',search:'?room=graybox-practice-rounds'},{hostname:'localhost',search:'?room=graybox-other&bots=11'}])expect(normalGameBotCount(location)).toBe(0);
 });
 it('connects eleven named clients and waits for authoritative welcome positions',()=>{
  const {coordinator,transports,joined}=fixture();
  expect(coordinator.count).toBe(11);expect(new Set(transports.map(t=>t.name)).size).toBe(11);
  coordinator.step(1/60,0);expect(transports.every(t=>!t.messages.length)).toBe(true);
  for(let i=0;i<11;i++)joined(i);
  const bodies=coordinator.world.bodies.filter(b=>b.mass>0);expect(bodies).toHaveLength(11);
  expect(bodies.map(b=>b.position.x)).toEqual(Array.from({length:11},(_,i)=>8+i*8));
  coordinator.dispose();expect(transports.every(t=>t.destroyed&&t.onMessage===null)).toBe(true);expect(coordinator.world.bodies).toHaveLength(0);
 });
 it('sends normal movement and muzzle-origin shooting, never client-awarded damage',()=>{
  const {coordinator,transports,joined}=fixture();joined(0);coordinator.step(1/60,1000);
  for(let now=1017;now<=1600;now+=17)coordinator.step(1/60,now);
  const shot=transports[0].messages.find(m=>m.type==='shoot');expect(shot).toBeDefined();
  const shotIndex=transports[0].messages.findIndex(m=>m.type==='shoot');
  expect(transports[0].messages[shotIndex-1]?.type).toBe('updateMovement');
  if(shot?.type==='shoot'){expect(shot.origin).toEqual({x:8,y:1.4,z:0});expect(Math.hypot(shot.direction.x,shot.direction.y,shot.direction.z)).toBeCloseTo(1);}
  expect(transports[0].messages.some(m=>m.type==='updateMovement')).toBe(true);
  expect(transports[0].messages.some(m=>m.type==='hit')).toBe(false);coordinator.dispose();
 });
 it('waits indefinitely for server respawn rather than reviving bots itself',()=>{
  const {coordinator,transports,joined}=fixture();joined(0);
  coordinator.receive({type:'playerDied',victimId:'bot0',killerId:'human',killerName:'You',victimName:'Bot',respawnAt:5000});
  coordinator.step(1/60,100000);expect(transports[0].messages).toHaveLength(0);
  coordinator.receive({type:'playerRespawn',id:'bot0',x:70,y:0,z:80,hp:3});
  const body=coordinator.world.bodies.find(b=>b.mass>0)!;expect(body.position.x).toBe(70);expect(body.position.z).toBe(80);
  coordinator.step(1/60,100040);expect(transports[0].messages.some(m=>m.type==='updateMovement')).toBe(true);coordinator.dispose();
 });
 it('freezes every bot for any winner and resumes only after the server reset',()=>{
  const {coordinator,transports,joined}=fixture();joined(0);
  coordinator.receive({type:'gameWon',winnerId:'bot0',winnerName:'Bot',kills:20,resetAt:6000});
  coordinator.step(1/60,7000);expect(transports[0].messages).toHaveLength(0);
  coordinator.receive({type:'gameReset',round:{phase:'playing'}});coordinator.step(1/60,7040);
  expect(transports[0].messages.some(m=>m.type==='updateMovement')).toBe(true);coordinator.dispose();
 });
 it('feeds the shared authoritative case objective to every bot within one shared route budget',()=>{
  const {coordinator,joined,navigation}=fixture();for(let i=0;i<11;i++)joined(i);
  const state:ChaosState={time:1000,case:{owner:null,previousOwner:null,pickupAfter:0,returningUntil:0,p:{x:-100,y:0,z:-100},q:{x:0,y:0,z:0,w:1},v:{x:0,y:0,z:0},spin:{x:0,y:0,z:0}},dispatch:{phase:'ready',started:0,until:0,serial:0},possession:{},corpses:[],shots:[],impacts:[],notice:{serial:0,text:''}};
  coordinator.receive({type:'chaos',state});coordinator.step(1/60,1000);
  expect(navigation.route).toHaveBeenCalledTimes(1);expect(navigation.route.mock.calls[0][1]).toEqual(state.case.p);
  coordinator.step(1/60,1000);expect(navigation.route).toHaveBeenCalledTimes(1);expect(navigation.update).toHaveBeenCalledTimes(1);
  coordinator.dispose();
 });
});

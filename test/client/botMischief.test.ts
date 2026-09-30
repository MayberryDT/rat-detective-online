import {describe,expect,it} from 'vitest';
import {RatBot} from '../../src/shared/bots/ratBot';
import type {MotorNavigation} from '../../src/shared/bots/motor';
import type {Personality} from '../../src/shared/bots/intent';
import {LAUNCH_MACHINES,type ChaosState} from '../../src/shared/chaosState';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import type {PlayerData,Vec3Data} from '../../src/shared/networkProtocol';

const player=(id:string,x:number,z:number):PlayerData=>createPlayer(id,id,DEFAULT_APPEARANCE,{x,y:0,z});
const nav:MotorNavigation={route:(_from,to)=>[{...to}],localStep:()=>undefined,explorationTargets:()=>[{x:0,y:0,z:0}]};
const machine=LAUNCH_MACHINES[0];
/** Every other rat wears Ironclad, so nobody takes an ordinary shot at them and corner fire stays off:
 * any shot is the gremlin's mischief. */
function state(others:readonly PlayerData[],extra:Partial<ChaosState>={}):ChaosState {
    const pose={q:{x:0,y:0,z:0,w:1},v:{x:0,y:0,z:0},spin:{x:0,y:0,z:0}};
    return {time:0,case:{owner:null,previousOwner:null,pickupAfter:0,returningUntil:0,p:{x:-200,y:0,z:0},...pose},
        dispatch:{phase:'cooldown',started:0,until:1e9,serial:0},possession:{},corpses:[],shots:[],impacts:[],notice:{serial:0,text:''},
        buffs:Object.fromEntries(others.map(p=>[p.id,{ironcladUntil:1e9}])),...extra};
}
const counterfeit=(p:Vec3Data):ChaosState['extraCases']=>[{id:'evidence-1',fake:true,owner:null,previousOwner:null,pickupAfter:0,returningUntil:0,p,q:{x:0,y:0,z:0,w:1},v:{x:0,y:0,z:0},spin:{x:0,y:0,z:0}}];
/** Shots over three seconds from a rat that stands still. */
function shots(personality:Personality,self:PlayerData,others:PlayerData[],s:ChaosState):Vec3Data[] {
    const bot=new RatBot(nav,0,()=>.5,{personality}),out:Vec3Data[]=[];
    for(let now=0;now<3000;now+=20){
        const intent=bot.step(now,self,[self,...others],s,()=>true,false,true);
        self.meshQy=Math.sin(intent.facing/2);self.meshQw=Math.cos(intent.facing/2);
        if(intent.shoot)out.push(intent.shoot);
    }
    return out;
}
const near=(a:Vec3Data,b:Vec3Data,r:number)=>Math.hypot(a.x-b.x,a.z-b.z)<r;

describe('gremlin mischief fire',()=>{
    it('shoots a counterfeit with another rat beside it, from a safe distance',()=>{
        const fake={x:0,y:.25,z:20},bait=player('bait',3,20);
        const s=state([bait],{extraCases:counterfeit(fake)});
        expect(shots('gremlin',player('me',0,0),[bait],s).filter(p=>near(p,fake,3.5)).length).toBeGreaterThan(0);
        expect(shots('tryhard',player('me',0,0),[bait],s)).toEqual([]);
    });

    it('leaves a counterfeit alone when it is close to itself or nobody is near it',()=>{
        const close={x:0,y:.25,z:8},bait=player('bait',3,8);
        expect(shots('gremlin',player('me',0,0),[bait],state([bait],{extraCases:counterfeit(close)}))).toEqual([]);
        const lonely={x:0,y:.25,z:20},far=player('far',30,-30);
        expect(shots('gremlin',player('me',0,0),[far],state([far],{extraCases:counterfeit(lonely)}))).toEqual([]);
    });

    it('shoots a launch trigger while another rat stands on its pad, never while the machine cools',()=>{
        const rider=player('rider',machine.pad.x,machine.pad.z),me=()=>player('me',machine.target.x-20,machine.target.z);
        const ready=state([rider],{pressure:{serial:0,levels:{},launches:[],fired:{}}});
        expect(shots('gremlin',me(),[rider],ready).filter(p=>near(p,machine.target,3)).length).toBeGreaterThan(0);
        const cooling=state([rider],{pressure:{serial:0,levels:{},launches:[],fired:{[machine.id]:-200}}});
        expect(shots('gremlin',me(),[rider],cooling)).toEqual([]);
        const empty=player('elsewhere',machine.pad.x+40,machine.pad.z);
        expect(shots('gremlin',me(),[empty],state([empty],{pressure:{serial:0,levels:{},launches:[],fired:{}}}))).toEqual([]);
    });
});

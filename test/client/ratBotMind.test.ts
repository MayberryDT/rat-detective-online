import {expect,it} from 'vitest';
import {RatBot} from '../../src/shared/bots/ratBot';
import type {MotorNavigation} from '../../src/shared/bots/motor';
import type {GoalContext} from '../../src/shared/bots/goals';
import type {Mind} from '../../src/shared/bots/intent';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import type {ChaosState} from '../../src/shared/chaosState';

const player=(id:string,x:number,z=0)=>createPlayer(id,id,DEFAULT_APPEARANCE,{x,y:0,z});
const nav:MotorNavigation={route:(_from,to)=>[{...to}],localStep:(_from,to)=>to,explorationTargets:()=>[{x:10,y:0,z:0},{x:14,y:0,z:0}]};
function state():ChaosState {
    return {time:1000,case:{owner:null,previousOwner:null,pickupAfter:0,returningUntil:0,p:{x:-40,y:0,z:0},q:{x:0,y:0,z:0,w:1},v:{x:0,y:0,z:0},spin:{x:0,y:0,z:0}},dispatch:{phase:'cooldown',started:0,until:1e9,serial:0},possession:{},corpses:[],shots:[],impacts:[],notice:{serial:0,text:''}};
}

it('falls back to the code mind whenever the mind has no fresh answer',()=>{
    const silent:Mind<GoalContext>={answer:()=>undefined};
    const coded=new RatBot(nav,3,()=>.5),quiet=new RatBot(nav,3,()=>.5,silent);
    const a=player('me',0),b=player('me',0),rival=player('rival',6,6),s=state();
    for(let now=1000;now<4000;now+=50){
        expect(quiet.step(now,b,[b,rival],s,()=>true,false,true)).toEqual(coded.step(now,a,[a,rival],s,()=>true,false,true));
        expect(quiet.goalKey).toBe(coded.goalKey);
    }
    expect(quiet.decision?.answer.source).toBe('code');
});

it('follows the mind\'s goal scores and place choice over the ladder',()=>{
    // Code alone takes the loose case; this mind prefers to roam, to the nearer of the two spots.
    const roamer:Mind<GoalContext>={answer:ctx=>ctx.offered.includes('roam')?{source:'jev',scores:{roam:4,'take-case':0},places:{roam:'explore:0'}}:undefined};
    const coded=new RatBot(nav,0,()=>.5),minded=new RatBot(nav,0,()=>.5,roamer),s=state();
    coded.step(1000,player('me',0),[],s,()=>true,false,true);
    minded.step(1000,player('me',0),[],s,()=>true,false,true);
    expect(coded.objective).toBe('case');
    expect(minded.objective).toBe('explore');expect(minded.goalKey).toBe('explore:0');
    expect(minded.decision).toMatchObject({plan:{goal:'roam',destination:{x:10,y:0,z:0}},answer:{source:'jev'}});
});

it('shoots the mind\'s preferred rat when it is visible, not the nearest',()=>{
    const self=player('me',0),near=player('near',0,8),far=player('far',15,15);
    const angleTo=(shot:{x:number;z:number},rat:{x:number;z:number})=>Math.abs(Math.atan2(Math.sin(Math.atan2(shot.x,shot.z)-Math.atan2(rat.x,rat.z)),Math.cos(Math.atan2(shot.x,shot.z)-Math.atan2(rat.x,rat.z))));
    const firstShotAfter=(bot:RatBot,from:number)=>{
        for(let now=0;now<6000;now+=20){
            const intent=bot.step(now,self,[self,near,far],undefined,()=>true,false,true);
            self.meshQy=Math.sin(intent.facing/2);self.meshQw=Math.cos(intent.facing/2);
            if(intent.shoot&&now>=from)return intent.shoot;
        }
    };
    const picky:Mind<GoalContext>={answer:()=>({source:'jev',scores:{hunt:4},target:'far'})};
    const shot=firstShotAfter(new RatBot(nav,0,()=>.5,picky),600)!;
    expect(angleTo(shot,far)).toBeLessThan(angleTo(shot,near));
    Object.assign(self,{x:0,z:0,meshQy:0,meshQw:1});
    const coded=firstShotAfter(new RatBot(nav,0,()=>.5),600)!;
    expect(angleTo(coded,near)).toBeLessThan(angleTo(coded,far));
});

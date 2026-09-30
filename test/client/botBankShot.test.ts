import {describe,expect,it} from 'vitest';
import {BANK,bankShot,type RayCast} from '../../src/shared/bots/motor/bankShot';
import {RatBot} from '../../src/shared/bots/ratBot';
import type {MotorNavigation} from '../../src/shared/bots/motor';
import {BASE_SKILL,type Personality} from '../../src/shared/bots/intent';
import {BALL_GRAVITY,BALL_RADIUS,BALL_RESTITUTION,BALL_SPEED} from '../../src/shared/ballTuning';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import type {PlayerData,Vec3Data} from '../../src/shared/networkProtocol';
import type {ChaosState} from '../../src/shared/chaosState';

interface Box {min:Vec3Data;max:Vec3Data}
const box=(x0:number,x1:number,z0:number,z1:number,y1=6):Box=>({min:{x:x0,y:0,z:z0},max:{x:x1,y:y1,z:z1}});
const AXES=['x','y','z'] as const;
/** Slab test: the nearest box face the segment enters, with its outward normal. */
function rayWorld(boxes:readonly Box[],count={n:0}):RayCast {
    return (from,to)=>{
        count.n++;
        let best:{t:number;point:Vec3Data;normal:Vec3Data}|undefined;
        for(const b of boxes){
            let enter=0,exit=1,axis:typeof AXES[number]|undefined,sign=0;
            for(const a of AXES){
                const d=to[a]-from[a];
                if(Math.abs(d)<1e-9){if(from[a]<b.min[a]||from[a]>b.max[a]){enter=2;break;}continue;}
                let t0=(b.min[a]-from[a])/d,t1=(b.max[a]-from[a])/d,s=-1;
                if(t0>t1){[t0,t1]=[t1,t0];s=1;}
                if(t0>enter){enter=t0;axis=a;sign=s;}
                exit=Math.min(exit,t1);
            }
            if(!axis||enter>exit||enter>1)continue;
            if(!best||enter<best.t)best={t:enter,point:{x:from.x+(to.x-from.x)*enter,y:from.y+(to.y-from.y)*enter,z:from.z+(to.z-from.z)*enter},normal:{x:0,y:0,z:0,[axis]:sign}};
        }
        return best&&{point:best.point,normal:best.normal};
    };
}
/** A real cheese ball: gravity, mirror bounces off any box with the game's restitution, the rat's three
 * body spheres as the hitbox. True when it reaches the rat standing at `feet`. */
function lands(boxes:readonly Box[],from:Vec3Data,aim:Vec3Data,feet:Vec3Data):boolean {
    const p={...from},length=Math.hypot(aim.x-from.x,aim.y-from.y,aim.z-from.z);
    const v={x:(aim.x-from.x)/length*BALL_SPEED,y:(aim.y-from.y)/length*BALL_SPEED,z:(aim.z-from.z)/length*BALL_SPEED};
    const body=[[.6,.6],[1.3,.45],[1.9,.28]] as const,dt=.0002;
    const inside=(q:Vec3Data)=>boxes.find(b=>AXES.every(a=>q[a]>b.min[a]-BALL_RADIUS&&q[a]<b.max[a]+BALL_RADIUS));
    for(let t=0;t<1.5;t+=dt){
        v.y+=BALL_GRAVITY*dt;
        const next={x:p.x+v.x*dt,y:p.y+v.y*dt,z:p.z+v.z*dt},wall=inside(next);
        if(wall){
            // Reflect on the axis the ball crossed into the box on.
            for(const a of AXES)if(p[a]<=wall.min[a]-BALL_RADIUS||p[a]>=wall.max[a]+BALL_RADIUS){v[a]=-v[a];}
            for(const a of AXES)v[a]*=BALL_RESTITUTION;
            continue;
        }
        Object.assign(p,next);
        if(body.some(([y,r])=>Math.hypot(p.x-feet.x,p.y-feet.y-y,p.z-feet.z)<r+BALL_RADIUS))return true;
    }
    return false;
}

// Me at the origin, the rat 20 units ahead behind a crate, a long wall to the east.
const crate=box(-3,3,9,11),eastWall=box(6,7,-5,30);
const eye={x:0,y:1.376,z:0},feet={x:0,y:0,z:20},chest={x:0,y:.9,z:20};

describe('the bank-shot solver',()=>{
    it('finds a one-bounce shot off a nearby wall that reaches a rat behind cover',()=>{
        const boxes=[crate,eastWall],count={n:0},ray=rayWorld(boxes,count);
        expect(ray(eye,chest)).toBeDefined();
        const aim=bankShot(eye,chest,ray)!;
        expect(aim).toBeDefined();
        expect(aim.x).toBeGreaterThan(5);
        expect(lands(boxes,eye,aim,feet)).toBe(true);
        expect(count.n).toBeLessThanOrEqual(BANK.rays);
    });

    it('never shoots through walls: no shot when every bounce is blocked, or at a rat boxed in',()=>{
        // A pillar on the way back from the wall.
        const pillar=box(2,5,13,16);
        const blocked=rayWorld([crate,eastWall,pillar]),aim=bankShot(eye,chest,blocked);
        if(aim)expect(lands([crate,eastWall,pillar],eye,aim,feet)).toBe(true);
        const room=[box(-2.5,2.5,17,17.5),box(-2.5,2.5,22.5,23),box(-2.5,-2,17,23),box(2,2.5,17,23)];
        expect(bankShot(eye,chest,rayWorld([crate,eastWall,...room]))).toBeUndefined();
        expect(bankShot(eye,chest,rayWorld([crate]))).toBeUndefined();
    });

    it('stays within its ray budget in a cluttered street',()=>{
        const clutter=Array.from({length:40},(_,i)=>box(-20+(i%8)*5,-18+(i%8)*5,-10+Math.floor(i/8)*8,-8+Math.floor(i/8)*8));
        for(const target of [chest,{x:12,y:.9,z:14},{x:-15,y:.9,z:-9}]){
            const count={n:0};bankShot(eye,target,rayWorld([...clutter,crate,eastWall],count));
            expect(count.n).toBeLessThanOrEqual(BANK.rays);
        }
    });
});

describe('bank shots in play',()=>{
    const player=(id:string,x:number,z:number):PlayerData=>createPlayer(id,id,DEFAULT_APPEARANCE,{x,y:0,z});
    // A loose case close by keeps speculative corner fire off, so every shot after the rat hides is aimed.
    const state=():ChaosState=>({time:0,case:{owner:null,previousOwner:null,pickupAfter:0,returningUntil:0,p:{x:-12,y:0,z:0},q:{x:0,y:0,z:0,w:1},v:{x:0,y:0,z:0},spin:{x:0,y:0,z:0}},dispatch:{phase:'cooldown',started:0,until:1e9,serial:0},possession:{},corpses:[],shots:[],impacts:[],notice:{serial:0,text:''}});
    /** The rat is in sight for a second, then steps behind the crate. Shots after it vanished, and rays. */
    function play(personality:Personality) {
        const count={n:0},ray=rayWorld([crate,eastWall],count),self=player('me',0,0),rival=player('rival',0,20),s=state();
        const navigation:MotorNavigation={route:(_from,to)=>[{...to}],localStep:()=>undefined,explorationTargets:()=>[{x:0,y:0,z:0}],ray};
        const bot=new RatBot(navigation,0,()=>.5,{personality,skill:{...BASE_SKILL,aimWanderRadians:0,flickError:0}});
        let hidden=false;const shots:Array<{now:number;aim:Vec3Data}>=[];const rays:number[]=[];
        for(let now=0;now<4000;now+=20){
            hidden=now>=1000;
            const before=count.n;
            const intent=bot.step(now,self,[self,rival],s,p=>!hidden||p!==rival&&Math.hypot(p.x-rival.x,p.z-rival.z)>.5,false,true);
            rays.push(count.n-before);
            self.meshQy=Math.sin(intent.facing/2);self.meshQw=Math.cos(intent.facing/2);
            if(hidden&&intent.shoot)shots.push({now,aim:intent.shoot});
        }
        return {shots,rays,self};
    }

    it('lets a maverick bank at a rat that just went behind cover, and a code-mind tryhard never',()=>{
        const maverick=play('maverick'),tryhard=play('tryhard');
        const banked=maverick.shots.filter(s=>s.aim.x>5);
        expect(banked.length).toBeGreaterThan(0);
        for(const shot of banked)expect(lands([crate,eastWall],{x:maverick.self.x,y:maverick.self.y+1.376,z:maverick.self.z},shot.aim,feet)).toBe(true);
        // Memory fades: no bank shot once the sighting is too old.
        expect(banked.every(s=>s.now<=1000+BANK.memoryMs+BANK.holdMs)).toBe(true);
        expect(tryhard.shots.some(s=>s.aim.x>5)).toBe(false);
        expect(tryhard.rays.every(n=>n===0)).toBe(true);
        // At most one bounded attempt per interval.
        for(let i=0;i<maverick.rays.length;i++){
            const window=maverick.rays.slice(i,i+Math.floor(BANK.attemptMs/20)).reduce((a,b)=>a+b,0);
            expect(window).toBeLessThanOrEqual(BANK.rays);
        }
    });
});

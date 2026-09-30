import {expect,it,vi} from 'vitest';
import {BALL_GRAVITY,BALL_LIFETIME,BALL_RADIUS,BALL_RESTITUTION} from '../../src/shared/ballTuning';
import {INCIDENT_TUNING as I,type ChaosShot} from '../../src/shared/chaosState';
import {bounceShot,bounces,cheeseBounce,cheeseDamage,shotGravity} from '../../src/shared/shotBallistics';
import {MAX_HP} from '../../src/shared/networkProtocol';
import {RAT_BODY} from '../../src/shared/rat/ratBody';
import {ShotSpacing} from '../../src/shared/shotTiming';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {RatBot} from '../../src/shared/bots/ratBot';
import type {MotorNavigation} from '../../src/shared/bots/motor';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import {worldIntent} from './botControls';
vi.mock('../../src/shared/grayboxLayout',()=>({CITY_BOUNDS:{min:-196,max:166},SEWER_FLOOR:-7,grayboxBoxes:()=>[]}));

const MAX=I.cheeseRadii[I.cheeseRadii.length-1];
const nav:MotorNavigation={route:(_f,to)=>[to],localStep:(_f,to)=>to,explorationTargets:()=>[{x:50,y:0,z:50}]};

it('spaces every rat\'s shots by the one Big Cheese interval, and only during Big Cheese',()=>{
    const spacing=new ShotSpacing(),gap=I.cheeseShotIntervalMs;
    for(const rat of ['human','bot']){
        expect(spacing.allow(rat,'big-cheese',0)).toBe(true);
        expect(spacing.allow(rat,'big-cheese',gap-1)).toBe(false);
        // A refused press records nothing: the next is timed from the last real shot.
        expect(spacing.allow(rat,'big-cheese',gap)).toBe(true);
    }
    // The room admits a shot a little early for network jitter, never earlier.
    expect(spacing.allow('human','big-cheese',2*gap-I.cheeseShotSlackMs-1,I.cheeseShotSlackMs)).toBe(false);
    expect(spacing.allow('human','big-cheese',2*gap-I.cheeseShotSlackMs,I.cheeseShotSlackMs)).toBe(true);
    expect(spacing.allow('bot','scattershot',gap+1)).toBe(true);
    expect(spacing.allow('bot',undefined,gap+2)).toBe(true);
});

it('holds a fighting bot\'s trigger for the Big Cheese interval',()=>{
    const self=createPlayer('self','self',DEFAULT_APPEARANCE,{x:0,y:0,z:0}),target=createPlayer('enemy','enemy',DEFAULT_APPEARANCE,{x:0,y:0,z:20});
    const state=new ChaosSimulation(new Map([self,target].map(p=>[p.id,p])),()=>{}).snapshot(false);
    state.case.owner=null;state.case.returningUntil=1e12;state.pickups=[];
    state.dispatch={phase:'active',incident:'big-cheese',serial:1,started:0,until:1e12};
    const brain=new RatBot(nav,0,()=>.5),shots:number[]=[];
    for(let now=0;now<9000;now+=20){
        state.time=now;
        const intent=worldIntent(brain.step(now,self,[target],state,()=>true,false,true),self);
        self.meshQy=Math.sin(intent.facing/2);self.meshQw=Math.cos(intent.facing/2);
        if(intent.shoot)shots.push(now);
    }
    expect(shots.length).toBeGreaterThan(1);
    for(let i=1;i<shots.length;i++)expect(shots[i]!-shots[i-1]!).toBeGreaterThanOrEqual(I.cheeseShotIntervalMs);
});

it('bounces ordinary balls as before and heavy ones with a thud, a small hop and a roll',()=>{
    const ordinary={x:30,y:-40,z:5},n={x:0,y:1,z:0};
    expect(bounceShot(ordinary,n,BALL_RADIUS)).toBe(40);
    expect(ordinary).toEqual({x:30*BALL_RESTITUTION,y:40*BALL_RESTITUTION,z:5*BALL_RESTITUTION});
    expect(shotGravity(BALL_RADIUS)).toBe(BALL_GRAVITY);
    const heavy={x:30,y:-40,z:0};
    expect(bounceShot(heavy,n,MAX)).toBe(40);
    expect(heavy.y).toBeCloseTo(40*I.cheeseRestitution);expect(heavy.x).toBeCloseTo(30*I.cheeseTangent);
    expect(shotGravity(MAX)).toBeCloseTo(BALL_GRAVITY*I.cheeseGravity);
    // A slow contact is rolling: it only stops the ball sinking, and is no bounce.
    const rolling={x:30,y:-I.cheeseBounceMin*.5,z:0},speed=bounceShot(rolling,n,MAX);
    expect(rolling).toEqual({x:30,y:0,z:0});
    expect(bounces(speed,MAX)).toBe(false);expect(bounces(speed,BALL_RADIUS)).toBe(true);
});

it('grows a Big Cheese ball a step per real bounce up to the largest, adding life up to the cap',()=>{
    const shot:ChaosShot={id:'s',owner:null,p:{x:0,y:0,z:0},v:{x:0,y:0,z:0},age:0,radius:I.cheeseStartRadius};
    cheeseBounce(shot);
    expect(shot.radius).toBe(I.cheeseRadii[I.cheeseRadii.indexOf(I.cheeseStartRadius)+1]);expect(shot.life).toBe(BALL_LIFETIME+I.cheeseBounceLife);
    for(let i=0;i<12;i++)cheeseBounce(shot);
    expect(shot.radius).toBe(MAX);expect(shot.life).toBe(I.cheeseMaxLife);
});

it('hits for double from the muzzle, one more per size step, and is at least rat-sized once it is lethal',()=>{
    expect(cheeseDamage(BALL_RADIUS,MAX_HP)).toBe(1);
    const shot:ChaosShot={id:'s',owner:null,p:{x:0,y:0,z:0},v:{x:0,y:0,z:0},age:0,radius:.3};
    expect(cheeseDamage(shot.radius!,MAX_HP)).toBe(2);
    shot.radius=I.cheeseStartRadius;
    const seen=[cheeseDamage(shot.radius,MAX_HP)];
    while(seen[seen.length-1]!<MAX_HP){cheeseBounce(shot);seen.push(cheeseDamage(shot.radius!,MAX_HP));}
    expect(seen).toEqual([2,3,4,5]);
    const ratHeight=Math.max(...RAT_BODY.spheres.map(s=>s.y+s.radius));
    expect(2*shot.radius!).toBeGreaterThanOrEqual(ratHeight);
    for(let i=0;i<12;i++)cheeseBounce(shot);
    expect(cheeseDamage(shot.radius!,MAX_HP)).toBe(MAX_HP);
});

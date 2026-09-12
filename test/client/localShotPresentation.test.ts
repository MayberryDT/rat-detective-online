import {describe,it,expect,vi} from 'vitest';
import {LocalShotPresentation,type ShotTrace} from '../../src/shared/LocalShotPresentation';
import {resolveShotPattern} from '../../src/shared/shotPattern';
import {BALL_SPEED} from '../../src/shared/ballTuning';
import type {ChaosState,ChaosShot} from '../../src/shared/chaosState';
import type {ServerMessage,ShotDescriptor} from '../../src/shared/networkProtocol';
import type {IncidentId} from '../../src/shared/incidentCatalog';

const descriptor:ShotDescriptor={shotId:'trigger',origin:{x:0,y:20,z:0},direction:{x:1,y:0,z:0}};
const state=(time:number,shots:ChaosShot[]=[])=>({time,shots,dispatch:{phase:'ready'}} as ChaosState);
const birth=(incident?:IncidentId):Extract<ServerMessage,{type:'playerShot'}>=>({type:'playerShot',shooterId:'owner',...descriptor,
    launch:{at:1000,balls:resolveShotPattern(descriptor,incident)}});
const authoritative=(age:number):ChaosShot=>({id:'trigger',owner:'owner',p:{x:BALL_SPEED*age,y:20-25*age*(age+1/60)/2,z:0},v:{x:175,y:-25*age,z:0},age});

describe('immediate single-ID local ball presentation',()=>{
    it.each([50,150,400])('responds before a %s ms confirmation and never rewinds or duplicates the shot',latency=>{
        const view=new LocalShotPresentation();view.fire('owner',descriptor,undefined,0);
        let balls=view.render([],8);expect(balls).toHaveLength(1);expect(balls[0].p).toEqual(descriptor.origin);
        let previous=0;
        for(let now=24;now<=latency;now+=16){
            view.apply(state(900),now);balls=view.render([],now);
            expect(balls).toHaveLength(1);expect(balls[0].p.x-previous).toBeCloseTo(2.8);previous=balls[0].p.x;
        }
        expect(view.confirm(birth(),latency)).toBe(true);
        const snapshot=authoritative((latency/2)/1000);view.apply(state(1000+latency/2,[snapshot]),latency);
        balls=view.render([snapshot],latency+16);expect(balls).toHaveLength(1);expect(balls[0].id).toBe('trigger');
        expect(balls[0].p.x).toBeGreaterThan(previous);expect(balls[0].p.x-previous).toBeLessThan(6);
        view.apply(state(1000+latency),latency+32);expect(view.render([],latency+32)).toHaveLength(0);
        expect(view.confirm(birth(),latency+40)).toBe(true);expect(view.render([snapshot],latency+40)).toHaveLength(0);
    });
    it('shows close-range flight before the server has time to report its hit',()=>{
        const view=new LocalShotPresentation();view.fire('owner',descriptor,undefined,0);
        expect(view.render([],0)[0].p.x).toBe(0);expect(view.render([],16)[0].p.x).toBeCloseTo(2.8);
        view.confirm(birth(),150);view.apply(state(1100),150);
        expect(view.render([],150)).toHaveLength(0);
    });
    it.each([undefined,'bad-ammunition','scattershot'] as const)('uses exactly the authority volley for %s before and after confirmation',incident=>{
        const view=new LocalShotPresentation(),expected=resolveShotPattern(descriptor,incident);view.fire('owner',descriptor,incident,0);
        let balls=view.render([],0);expect(balls.map(b=>({id:b.id,velocity:b.v}))).toEqual(expected);
        view.render([],16);expect(view.confirm(birth(incident),100)).toBe(true);
        balls=view.render([],116);expect(balls.map(b=>b.id)).toEqual(expected.map(b=>b.id));
        expect(new Set(balls.map(b=>b.id)).size).toBe(balls.length);
        if(incident==='bad-ammunition')for(const b of balls)expect(Math.abs(b.p.z)).toBeGreaterThan(.1);
    });
    it('corrects an incident boundary without retaining stale volley members',()=>{
        const view=new LocalShotPresentation();view.fire('owner',descriptor,'scattershot',0);expect(view.render([],0)).toHaveLength(5);
        view.confirm(birth(),100);expect(view.render([],116)).toHaveLength(1);
    });
    it('bounces on local scenery, while rat contacts never cause damage or speculative hit feedback',()=>{
        const trace:ShotTrace=(from,to)=>from.x<5&&to.x>=5?{p:{x:5,y:20,z:0},n:{x:-1,y:0,z:0},rat:false}:undefined;
        const view=new LocalShotPresentation(trace);view.fire('owner',descriptor,undefined,0);view.render([],0);
        const ball=view.render([],40)[0];expect(ball.p.x).toBeLessThan(5);expect(ball.v.x).toBeCloseTo(-157.5);
        const targetTrace=vi.fn<ShotTrace>(()=>({p:{x:2,y:20,z:0},n:{x:-1,y:0,z:0},rat:true}));
        const close=new LocalShotPresentation(targetTrace);close.fire('owner',descriptor,undefined,0);expect(close.render([],0)).toHaveLength(1);
        expect(close.render([],16)).toHaveLength(0);expect(targetTrace).toHaveBeenCalledOnce();
    });
    it('handles rate-limited/unacknowledged input and reconnect without resurrecting old shots',()=>{
        const view=new LocalShotPresentation();view.fire('owner',descriptor,undefined,0);view.render([],0);
        expect(view.render([],751)).toHaveLength(0);view.confirm(birth(),800);expect(view.render([authoritative(.1)],816)).toHaveLength(0);
        view.clear();view.fire('owner',descriptor,undefined,900);expect(view.render([],900)).toHaveLength(1);
    });
    it('keeps a ball alive for contact telemetry and retires it on a terminal result',()=>{
        const view=new LocalShotPresentation();view.fire('owner',descriptor,undefined,0);view.render([],0);
        const base={type:'shotResult' as const,shotId:'trigger',ballId:'trigger',at:1010,tick:2,epoch:'round'};
        view.result({...base,outcome:'world-bounce',point:{x:2,y:20,z:0},normal:{x:-1,y:0,z:0}});
        expect(view.render([],16)).toHaveLength(1);
        view.result({...base,outcome:'rat-body',victimId:'victim',damage:1});
        expect(view.render([authoritative(.1)],32)).toHaveLength(0);
    });
    it('keeps delayed-reaction shots stopped until an authoritative unstuck sample arrives',()=>{
        const trace:ShotTrace=(from,to)=>from.x<5&&to.x>=5?{p:{x:5,y:20,z:0},n:{x:-1,y:0,z:0},rat:false}:undefined;
        const view=new LocalShotPresentation(trace);view.fire('owner',descriptor,'delayed-reaction',0);view.render([],0);
        expect(view.render([],40)[0].p.x).toBe(4.95);expect(view.render([],100)[0].p.x).toBe(4.95);
        view.confirm(birth('delayed-reaction'),100);
        const released={...authoritative(.1),p:{x:4,y:20,z:0},v:{x:-157.5,y:0,z:0},wallBounced:true,delayed:true};
        view.apply(state(1100,[released]),100);expect(view.render([],116)[0].p.x).toBeLessThan(4.95);
    });
});

describe('shared shot pattern',()=>{
    it.each([[0,1],[.69999,1],[.7,2],[.89999,2],[.9,3],[.99999,3]])('preserves Bad Ammunition count boundary %s', (roll,count)=>{
        let first=true;const random=()=>{if(first){first=false;return roll;}return .5;};
        expect(resolveShotPattern(descriptor,'bad-ammunition',random)).toHaveLength(count);
    });
    it('keeps all volley IDs within the wire limit and repeats exactly across independent calls',()=>{
        for(let i=0;i<200;i++){
            const shot={...descriptor,shotId:String(i).padStart(64,'a')};
            for(const incident of ['scattershot','bad-ammunition'] as const){
                const a=resolveShotPattern(shot,incident),b=resolveShotPattern(shot,incident);expect(a).toEqual(b);
                expect(new Set(a.map(x=>x.id)).size).toBe(a.length);
                for(const ball of a){expect(ball.id.length).toBeLessThanOrEqual(64);expect(Math.hypot(ball.velocity.x,ball.velocity.y,ball.velocity.z)).toBeCloseTo(175);}
            }
        }
    });
});

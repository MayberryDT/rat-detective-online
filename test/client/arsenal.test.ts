import {afterEach,describe,expect,it,vi} from 'vitest';
import {ChaosSimulation,type ChaosHit,type PickupEvent} from '../../src/shared/ChaosSimulation';
import {PICKUP_KINDS,WEAPON_TUNING as W,type WeaponKind} from '../../src/shared/pickups';
import {CITY_PREVIEW_SEED,GRAYBOX_VERSION} from '../../src/shared/grayboxLayout';
import {MAX_HP,type PlayerData,type Vec3Data} from '../../src/shared/networkProtocol';
import {createPlayer} from '../../src/worker/gameState';
import {laserPath,type LaserCast} from '../../src/shared/laser';
import {resolveShotPattern,tommyCone,tommyHeat} from '../../src/shared/shotPattern';
import {ShotSpacing} from '../../src/shared/shotTiming';
import {INCIDENT_TUNING} from '../../src/shared/chaosState';
import {BALL_RADIUS} from '../../src/shared/ballTuning';

afterEach(()=>vi.restoreAllMocks());
const appearance={hatType:'fedora' as const,hatColor:1,coatColor:2,furColor:3};
// An open stretch of the x 70 avenue (clear 30 units north and south).
const STREET={x:70,y:0,z:-46};
function fixture(){
    const now=Date.now();
    const a=createPlayer('a','A',appearance,{...STREET}),b=createPlayer('b','B',appearance,{x:STREET.x,y:0,z:STREET.z+10});
    const players=new Map([a,b].map(p=>[p.id,p]));
    const hits:ChaosHit[]=[];
    const sim=new ChaosSimulation(players,hit=>{hits.push(hit);const v=players.get(hit.victim)!;v.hp=Math.max(0,v.hp-hit.damage);},undefined,{seed:CITY_PREVIEW_SEED,version:GRAYBOX_VERSION});
    sim.step(0,now);
    return {sim,players,a,b,hits,now};
}
/** Hand `kind` over through the reward draw (full health: every kind but Quick Fix). */
function arm(sim:ChaosSimulation,id:string,kind:typeof PICKUP_KINDS[number]){
    const kinds:readonly string[]=PICKUP_KINDS.filter(k=>k!=='quick-fix'),spy=vi.spyOn(Math,'random').mockReturnValue((kinds.indexOf(kind)+.5)/kinds.length);
    sim.rewardSupply(id,'dispatch');spy.mockRestore();
}
const stand=(p:PlayerData,at:Vec3Data)=>{p.x=at.x;p.y=at.y;p.z=at.z;};
const chest=(p:PlayerData)=>({x:p.x,y:p.y+1.3,z:p.z});
const aim=(from:Vec3Data,to:Vec3Data)=>{const d={x:to.x-from.x,y:to.y-from.y,z:to.z-from.z},l=Math.hypot(d.x,d.y,d.z);return{x:d.x/l,y:d.y/l,z:d.z/l};};
let serial=0;
const fire=(sim:ChaosSimulation,p:PlayerData,at:Vec3Data,viewAt?:number)=>
    sim.shoot(p.id,{shotId:`shot-${++serial}`,origin:chest(p),direction:aim(chest(p),at),...(viewAt===undefined?{}:{viewAt})});
const weaponOf=(sim:ChaosSimulation,id:string):WeaponKind|undefined=>sim.snapshot(false).buffs?.[id]?.weapon;

describe('the weapon slot',()=>{
    it('holds one weapon: a new one replaces it, death clears it',()=>{
        const {sim,a,now}=fixture();
        arm(sim,'a','tommy-gun');expect(weaponOf(sim,'a')).toBe('tommy-gun');
        arm(sim,'a','mousetrap');expect(weaponOf(sim,'a')).toBe('mousetrap');
        expect(sim.snapshot(false).buffs?.a?.weaponUntil).toBeUndefined();
        a.hp=0;sim.step(1/60,now+16);
        expect(weaponOf(sim,'a')).toBeUndefined();
    });
});

describe('the Tommy Gun',()=>{
    it('replaces any incident pattern with one ball in a cone that blooms while held, the same on every machine',()=>{
        const shot={shotId:'tommy-1',origin:{x:0,y:1,z:0},direction:{x:0,y:0,z:1}};
        for(const incident of ['scattershot','bad-ammunition','big-cheese'] as const){
            const balls=resolveShotPattern(shot,incident,{kind:'tommy-gun',heat:W.tommyBloomShots});
            expect(balls).toHaveLength(1);
            const v=balls[0]!.velocity,off=Math.acos(v.z/Math.hypot(v.x,v.y,v.z));
            expect(off).toBeLessThanOrEqual(tommyCone(W.tommyBloomShots)+1e-9);
            expect(balls).toEqual(resolveShotPattern(shot,incident,{kind:'tommy-gun',heat:W.tommyBloomShots}));
        }
        expect(resolveShotPattern(shot,undefined,{kind:'laser'})).toEqual([]);
        expect(resolveShotPattern(shot,undefined,{kind:'mousetrap'})).toEqual([]);
        expect(tommyHeat(3,1000,1000+W.tommyHeatMs)).toBe(4);
        expect(tommyHeat(3,1000,1001+W.tommyHeatMs)).toBe(0);
    });
    it('is not held to the Big Cheese interval, while the Laser always is',()=>{
        const spacing=new ShotSpacing();
        expect(spacing.allow('t',undefined,0,0,'tommy-gun')).toBe(true);
        expect(spacing.allow('t','big-cheese',W.tommyIntervalMs,0,'tommy-gun')).toBe(true);
        expect(spacing.allow('l',undefined,0,0,'laser')).toBe(true);
        expect(spacing.allow('l',undefined,INCIDENT_TUNING.cheeseShotIntervalMs-1,0,'laser')).toBe(false);
        expect(spacing.allow('l',undefined,INCIDENT_TUNING.cheeseShotIntervalMs,0,'laser')).toBe(true);
    });
    it('fires plain balls during Big Cheese: they never grow, in flight or on a bounce, and deal one damage',()=>{
        const {sim:first,players,a,b,now}=fixture(),saved=first.snapshot(false);
        saved.dispatch={phase:'active',incident:'big-cheese',serial:1,started:now,until:now+25000};
        const hits:ChaosHit[]=[],sim=new ChaosSimulation(players,h=>hits.push(h),saved,{seed:CITY_PREVIEW_SEED,version:GRAYBOX_VERSION});
        arm(sim,'a','tommy-gun');
        // One ball at b's chest, one into the street just ahead.
        fire(sim,a,chest(b));fire(sim,a,{x:a.x,y:0,z:a.z+3});
        const radii=new Set<number>();
        for(let i=1;i<=60;i++){sim.step(1/60,now+i*1000/60);for(const s of sim.snapshot(false).shots)radii.add(s.radius??BALL_RADIUS);}
        expect([...radii]).toEqual([BALL_RADIUS]);
        expect(hits).toMatchObject([{victim:'b',damage:1,weapon:'tommy-gun'}]);
    });
});

describe('the Laser',()=>{
    it('reflects off walls at most twice, then stops',()=>{
        // Two parallel walls at x = ±1: the beam zigzags between them.
        const cast=(from:{x:number;y:number;z:number},to:{x:number;y:number;z:number}):LaserCast|undefined=>{
            const dx=to.x-from.x;if(Math.abs(dx)<1e-9)return;
            const wall=dx>0?1:-1,t=(wall-from.x)/dx;if(t<=0||t>1)return;
            const length=Math.hypot(to.x-from.x,to.y-from.y,to.z-from.z);
            return{distance:t*length,point:{x:wall,y:from.y+(to.y-from.y)*t,z:from.z+(to.z-from.z)*t},normal:{x:-wall,y:0,z:0},on:'world'};
        };
        const points=laserPath({x:0,y:0,z:0},{x:1,y:0,z:1},cast);
        expect(points).toHaveLength(W.laserBounces+2);
        expect(points.slice(1).map(p=>p.on)).toEqual(['world','world','world']);
        expect(points.map(p=>Math.round(p.x))).toEqual([0,1,-1,1]);
    });
    it('hits the rat where the shooter saw it, rewound no more than 250 ms',()=>{
        const {sim,a,b,hits,now}=fixture();
        const seen={x:STREET.x,y:0,z:STREET.z+10};
        // b stands at `seen` at `now`, then steps 3 units aside.
        sim.step(1/60,now+60);stand(b,{...seen,x:seen.x+3});sim.step(1/60,now+70);sim.step(1/60,now+200);
        arm(sim,'a','laser');
        fire(sim,a,chest(b),now+200);expect(hits).toHaveLength(1);
        hits.length=0;b.hp=MAX_HP;
        // Aiming where b was 200 ms ago, with that view time, lands.
        fire(sim,a,{...seen,y:1.3},now);
        expect(hits).toMatchObject([{owner:'a',victim:'b',damage:W.laserDamage,weapon:'laser',compensated:true}]);
        hits.length=0;b.hp=MAX_HP;
        // 330 ms later the same view time is clamped to 250 ms back, when b had already moved.
        sim.step(1/60,now+330);
        fire(sim,a,{...seen,y:1.3},now);
        expect(hits).toEqual([]);
        expect(sim.snapshot(false).beams?.length).toBe(3);
    });
    it('kills with a headshot and bounces off an Ironclad coat without harm',()=>{
        const {sim,a,b,hits}=fixture();
        arm(sim,'a','laser');
        const eye={x:a.x,y:a.y+1.9,z:a.z};
        sim.shoot('a',{shotId:'head-1',origin:eye,direction:aim(eye,{x:b.x,y:b.y+1.9,z:b.z})});
        expect(hits).toMatchObject([{victim:'b',damage:MAX_HP,headshot:true,weapon:'laser'}]);
        hits.length=0;b.hp=MAX_HP;arm(sim,'b','ironclad');
        fire(sim,a,chest(b));
        expect(hits).toEqual([]);
        expect(sim.snapshot(false).beams?.at(-1)?.points[1]?.on).toBe('armor');
    });
});
describe('the Mousetrap',()=>{
    const traps=(sim:ChaosSimulation)=>sim.snapshot(false).traps??[];
    const setDown=(sim:ChaosSimulation,p:PlayerData,direction={x:0,y:0,z:1})=>{arm(sim,p.id,'mousetrap');return sim.placeTrap(p.id,direction);};
    it('is set down ahead, never kills its owner, and snaps any other rat, coat or not, for its owner',()=>{
        const {sim,a,b,hits,now}=fixture();
        expect(setDown(sim,a)).toBe(true);
        const [trap]=traps(sim);
        expect(trap).toMatchObject({owner:'a',hp:W.trapHp});
        expect(Math.hypot(trap!.x-a.x,trap!.z-(a.z+W.trapReach))).toBeLessThan(1);
        expect(weaponOf(sim,'a')).toBeUndefined();
        stand(a,trap!);sim.step(1/60,now+16);
        expect(hits).toEqual([]);
        arm(sim,'b','ironclad');stand(b,{x:trap!.x+.8,y:trap!.y,z:trap!.z});sim.step(1/60,now+32);
        expect(hits).toMatchObject([{owner:'a',victim:'b',damage:MAX_HP,weapon:'mousetrap'}]);
        expect(hits[0]!.incoming.y).toBeGreaterThan(0);
    });
    it('keeps one trap per rat, and the trap outlives its owner',()=>{
        const {sim,a,now}=fixture();
        setDown(sim,a);const first=traps(sim)[0]!.id;
        stand(a,{x:STREET.x,y:0,z:STREET.z+6});setDown(sim,a);
        expect(traps(sim).map(t=>t.id)).not.toContain(first);
        expect(traps(sim)).toHaveLength(1);
        a.hp=0;sim.step(1/60,now+16);
        expect(traps(sim)).toHaveLength(1);
    });
    it('stays in paw when there is no room ahead',()=>{
        const {sim,a}=fixture();
        // A wall stands about 10 units west of the avenue's middle.
        stand(a,{x:STREET.x-7,y:0,z:STREET.z});
        expect(setDown(sim,a,{x:-1,y:0,z:0})).toBe(false);
        expect(sim.placeTrap('a',{x:0,y:1,z:0})).toBe(false);
        expect(weaponOf(sim,'a')).toBe('mousetrap');
        expect(traps(sim)).toEqual([]);
    });
    it('is not set down on another living rat, only clear of it',()=>{
        const {sim,a,b,hits,now}=fixture();
        stand(b,{x:a.x,y:a.y,z:a.z+W.trapReach});
        expect(setDown(sim,a)).toBe(false);
        expect(weaponOf(sim,'a')).toBe('mousetrap');
        sim.step(1/60,now+16);expect(hits).toEqual([]);
        // A rat on the floor below is no obstacle, nor is a dead one.
        stand(b,{x:a.x,y:a.y-W.trapHeight-1,z:a.z+W.trapReach});
        expect(sim.placeTrap('a',{x:0,y:0,z:1})).toBe(true);
        arm(sim,'a','mousetrap');stand(b,{x:a.x,y:a.y,z:a.z-W.trapReach});b.hp=0;
        expect(sim.placeTrap('a',{x:0,y:0,z:-1})).toBe(true);
    });
    it('breaks after its hits: eight balls, or three laser hits; the breaker is recorded',()=>{
        const {sim,a,b,now}=fixture();
        setDown(sim,a);const trap=traps(sim)[0]!,target={x:trap.x,y:trap.y+.3,z:trap.z};
        stand(b,{x:trap.x,y:0,z:trap.z+6});
        let t=now;
        for(let i=1;i<=W.trapHp;i++){
            fire(sim,b,target);for(let s=0;s<6;s++)sim.step(1/60,t+=16);
            expect(traps(sim)[0]?.hp??0,`after ${i}`).toBe(W.trapHp-i);
        }
        expect(traps(sim)[0]?.brokenAt).toBeDefined();
        const events=sim.drainPickupEvents().filter((e):e is Extract<PickupEvent,{kind:'trap'}>=>e.kind==='trap');
        expect(events.at(-1)).toMatchObject({what:'break',by:'b',playerId:'a'});
        sim.step(1/60,t+W.trapBrokenMs+16);
        expect(traps(sim)).toEqual([]);
        setDown(sim,a);arm(sim,'b','laser');
        const fresh=traps(sim)[0]!;
        for(let i=0;i<Math.ceil(W.trapHp/W.laserTrapHits);i++)fire(sim,b,{x:fresh.x,y:fresh.y+.3,z:fresh.z});
        expect(traps(sim)[0]?.brokenAt).toBeDefined();
    });
});

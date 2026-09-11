import {afterEach,describe,expect,it,vi} from 'vitest';
import * as C from 'cannon-es';
import {ChaosSimulation,type ChaosHit} from '../../src/shared/ChaosSimulation';
import {PICKUP_ANCHORS,PICKUP_TUNING} from '../../src/shared/pickups';
import {MAX_HP} from '../../src/shared/networkProtocol';
import {parseServerMessage} from '../../src/shared/messageValidation';
import {CITY_PREVIEW_SEED,GRAYBOX_VERSION} from '../../src/shared/grayboxLayout';
import {createPlayer} from '../../src/worker/gameState';
import type {PlayerData,Vec3Data} from '../../src/shared/networkProtocol';

afterEach(()=>vi.restoreAllMocks());
const appearance={hatType:'fedora' as const,hatColor:1,coatColor:2,furColor:3};
const spec={seed:CITY_PREVIEW_SEED,version:GRAYBOX_VERSION};

function fixture(){
    const now=Date.now();
    const a=createPlayer('a','A',appearance,{x:0,y:2,z:0});
    const b=createPlayer('b','B',appearance,{x:0,y:2,z:0});
    const players=new Map([a,b].map(p=>[p.id,p]));
    const hits:ChaosHit[]=[];
    const sim=new ChaosSimulation(players,hit=>hits.push(hit),undefined,spec);
    sim.step(0,now);
    return {sim,players,a,b,hits,now};
}
const stand=(player:PlayerData,p:Vec3Data)=>{player.x=p.x;player.y=p.y;player.z=p.z;};
const sites=(sim:ChaosSimulation)=>sim.snapshot(false).pickups!;
const site=(sim:ChaosSimulation,kind:string)=>sites(sim).find(p=>p.kind===kind);

describe('pickup system',()=>{
    it('resolves every authored site onto supported, distinct street pavement',()=>{
        const {sim}=fixture();
        const pickups=sites(sim);
        expect(pickups.length).toBe(PICKUP_ANCHORS.length);
        expect(new Set(pickups.map(p=>p.id)).size).toBe(pickups.length);
        expect(new Set(pickups.map(p=>p.kind)).size).toBe(3);
        for(const pickup of pickups){
            expect(PICKUP_ANCHORS.some(a=>a.id===pickup.id)).toBe(true);
            expect(pickup.y).toBeGreaterThan(0);
            expect(sim.world.raycastClosest(new C.Vec3(pickup.x,pickup.y+.2,pickup.z),new C.Vec3(pickup.x,pickup.y-1.8,pickup.z),{collisionFilterMask:1})).toBe(true);
        }
    });
    it('credits a contested pickup to exactly one claimant',()=>{
        const {sim,a,b,now}=fixture();
        const target=site(sim,'ironclad')!;
        stand(a,target);stand(b,target);
        sim.step(1/60,now+16);
        const buffs=sim.snapshot(false).buffs??{};
        expect(Object.keys(buffs)).toHaveLength(1);
        expect(buffs[a.id]?.ironcladUntil).toBeGreaterThan(now);
        expect(buffs[b.id]).toBeUndefined();
    });
    it('quick fix fills a living rat to normal HP and waits at full health',()=>{
        const {sim,a,b,now}=fixture();
        const target=site(sim,'quick-fix')!;stand(a,target);
        a.hp=MAX_HP;sim.step(1/60,now+16);
        expect(sites(sim).some(p=>p.id===target.id)).toBe(true);
        expect(sim.drainPickupEvents()).toHaveLength(0);
        a.hp=1;sim.step(1/60,now+32);
        expect(a.hp).toBe(MAX_HP);
        expect(sites(sim).some(p=>p.id===target.id)).toBe(false);
        expect(sim.drainPickupEvents()).toContainEqual({kind:'healed',playerId:a.id,hp:MAX_HP});
        // No overheal and no resurrection path; the other rat is untouched.
        expect(b.hp).toBe(MAX_HP);
    });
    it('refreshes the same benefit to full duration instead of stacking it',()=>{
        const {sim,a,now}=fixture();
        const [first,second]=sites(sim).filter(p=>p.kind==='hustle');
        stand(a,first);sim.step(1/60,now);
        const base=sim.snapshot(false).buffs![a.id].hustleUntil!;
        stand(a,second);sim.step(1/60,now+PICKUP_TUNING.hustleMs/2);
        const refreshed=sim.snapshot(false).buffs![a.id].hustleUntil!;
        expect(refreshed).toBeCloseTo(now+PICKUP_TUNING.hustleMs/2+PICKUP_TUNING.hustleMs,0);
        expect(refreshed).toBeGreaterThan(base);
        // One entry only: a single timer, never a multiplied effect.
        expect(Object.keys(sim.snapshot(false).buffs![a.id])).toEqual(['hustleUntil']);
    });
    it('expires a benefit on its own timer and drops it on death',()=>{
        const {sim,a,now}=fixture();
        stand(a,site(sim,'ironclad')!);sim.step(1/60,now);
        expect(sim.snapshot(false).buffs![a.id]).toBeDefined();
        sim.step(1/60,now+PICKUP_TUNING.ironcladMs+1);
        expect(sim.snapshot(false).buffs?.[a.id]).toBeUndefined();
        stand(a,site(sim,'ironclad')!);sim.step(1/60,now+PICKUP_TUNING.ironcladMs+2);
        expect(sim.snapshot(false).buffs![a.id]).toBeDefined();
        a.hp=0;sim.step(1/60,now+PICKUP_TUNING.ironcladMs+3);
        expect(sim.snapshot(false).buffs?.[a.id]).toBeUndefined();
    });
    it('returns a claimed site after its respawn delay and clears effects on reset',()=>{
        const {sim,a,now}=fixture();
        const target=site(sim,'ironclad')!;stand(a,target);sim.step(1/60,now);
        expect(sites(sim).some(p=>p.id===target.id)).toBe(false);
        a.x=0;a.z=0;
        sim.step(1/60,now+PICKUP_TUNING.respawnMs-1);
        expect(sites(sim).some(p=>p.id===target.id)).toBe(false);
        sim.step(1/60,now+PICKUP_TUNING.respawnMs+1);
        expect(sites(sim).some(p=>p.id===target.id)).toBe(true);
        sim.reset();
        expect(sim.snapshot(false).buffs).toEqual({});
        expect(sites(sim).length).toBe(PICKUP_ANCHORS.length);
    });
    it('round-trips pickups and buffs through shared validation',()=>{
        const {sim,a,now}=fixture();
        stand(a,site(sim,'ironclad')!);sim.step(1/60,now);
        const state=sim.snapshot(false);
        expect(parseServerMessage({type:'chaos',state})).not.toBeNull();
        expect(parseServerMessage({type:'chaos',state:{...state,pickups:[{id:'not-a-site',kind:'ironclad',x:0,y:0,z:0}]}})).toBeNull();
        expect(parseServerMessage({type:'chaos',state:{...state,buffs:{[a.id]:{ironcladUntil:Number.NaN}}}})).toBeNull();
        expect(parseServerMessage({type:'chaos',state:{...state,buffs:{[a.id]:{ironcladUntil:now+1000,armor:3}}}})).toBeNull();
        expect(parseServerMessage({type:'chaos',state:{...state,buffs:{[a.id]:{hustleUntil:now+1000}}}})).not.toBeNull();
    });
});

describe('Ironclad Alibi',()=>{
    it('reflects a body shot instead of absorbing it, and never damages the wearer',()=>{
        const {sim,a,b,hits,now}=fixture();
        stand(a,site(sim,'ironclad')!);sim.step(1/60,now);
        expect(sim.snapshot(false).buffs?.[a.id]?.ironcladUntil).toBeGreaterThan(now);
        a.x=0;a.y=59.2;a.z=0;b.x=-4;b.y=59.2;b.z=0;
        sim.shoot(b.id,{shotId:'coat',origin:{x:-4,y:60.5,z:0},direction:{x:1,y:0,z:0}});
        sim.step(.05,now+50);
        expect(hits.some(h=>h.victim===a.id)).toBe(false);
        const shots=sim.snapshot(false).shots;
        // Reflection, not absorption, and not a wall bounce for incident purposes.
        expect(shots.some(s=>s.v.x<0)).toBe(true);
        expect(shots.some(s=>s.wallBounced)).toBe(false);
    });
    it('leaves the genuine case independently shootable while the coat is active',()=>{
        const {sim,a,b,now}=fixture();
        stand(a,site(sim,'ironclad')!);sim.step(1/60,now);
        expect(sim.snapshot(false).buffs?.[a.id]?.ironcladUntil).toBeGreaterThan(now);
        // The coat is a rat-only surface: it never blankets the case. Park the
        // wearer clear of the line so the shot can only resolve against the case.
        a.x=200;a.y=59;a.z=200;
        sim.caseBody.position.set(0,60,0);sim.caseBody.velocity.setZero();sim.caseBody.angularVelocity.setZero();
        sim.shoot(b.id,{shotId:'case',origin:{x:-3,y:60,z:0},direction:{x:1,y:0,z:0}});
        sim.step(.05,now+50);
        expect(Math.hypot(sim.caseBody.velocity.x,sim.caseBody.velocity.y,sim.caseBody.velocity.z)).toBeGreaterThan(1);
    });
});

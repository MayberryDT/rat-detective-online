import {afterEach,describe,expect,it,vi} from 'vitest';
import * as C from 'cannon-es';
import {ChaosSimulation,type ChaosHit} from '../../src/shared/ChaosSimulation';
import {PICKUP_ANCHORS,PICKUP_TUNING} from '../../src/shared/pickups';
import {LANDMARK_FURNISHINGS} from '../../src/shared/landmarkLayout';
import {SEWER_PIPE_ENTRANCES,sewerPipePoint} from '../../src/shared/sewerLayout';
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
const sites=(sim:ChaosSimulation)=>{const s=sim.snapshot(false);return s.pickups!.filter(p=>(p.availableAt??0)<=s.time);};
const site=(sim:ChaosSimulation,kind:string)=>sites(sim).find(p=>p.kind===kind);

describe('pickup system',()=>{
    it('places Icebox armor outside its racks and speed packs six units in front of every portal',()=>{
        const {sim}=fixture(),all=sites(sim),armor=all.find(p=>p.id==='alibi-icebox-upper')!;
        expect(armor).toMatchObject({x:116,y:8.7,z:-84});
        for(const f of LANDMARK_FURNISHINGS){
            const foot=armor.y-.7;
            if(foot+2<f.y-f.h/2||foot>f.y+f.h/2)continue;
            expect(Math.hypot(Math.max(0,Math.abs(armor.x-f.x)-f.w/2),Math.max(0,Math.abs(armor.z-f.z)-f.d/2))).toBeGreaterThan(1);
        }
        for(const entry of SEWER_PIPE_ENTRANCES){
            const front=sewerPipePoint(entry,-6);
            expect(all.some(p=>p.kind==='hustle'&&Math.hypot(p.x-front.x,p.z-front.z)<.01)).toBe(true);
        }
    });

    it('publishes an authoritative empty-site deadline for late join and room restoration',()=>{
        const {sim,a,players,now}=fixture();const target=site(sim,'hustle')!;
        stand(a,target);sim.step(1/60,now);stand(a,{x:0,y:0,z:0});
        const saved=sim.snapshot(false),empty=saved.pickups!.find(p=>p.id===target.id)!;
        expect(empty.availableAt).toBe(now+45_000);
        expect(saved.pickups).toHaveLength(PICKUP_ANCHORS.length);
        expect(parseServerMessage({type:'chaos',state:saved})).not.toBeNull();
        const restored=new ChaosSimulation(players,()=>{},saved,spec);
        expect(restored.snapshot(false).pickups!.find(p=>p.id===target.id)?.availableAt).toBe(empty.availableAt);
        restored.step(0,now+44_999);expect(sites(restored).some(p=>p.id===target.id)).toBe(false);
        restored.step(0,now+45_000);expect(sites(restored).some(p=>p.id===target.id)).toBe(true);
        for(const bad of [-1,Infinity,NaN,'soon']){
            const invalid=structuredClone(saved);(invalid.pickups![0] as any).availableAt=bad;
            expect(parseServerMessage({type:'chaos',state:invalid})).toBeNull();
        }
    });

    it('resolves every authored reward onto its supported floor',()=>{
        const {sim}=fixture();
        const pickups=sites(sim);
        expect(pickups.length).toBe(PICKUP_ANCHORS.length);
        expect(new Set(pickups.map(p=>p.id)).size).toBe(pickups.length);
        expect(new Set(pickups.map(p=>p.kind)).size).toBe(3);
        for(const pickup of pickups){
            expect(PICKUP_ANCHORS.some(a=>a.id===pickup.id)).toBe(true);
            const anchor=PICKUP_ANCHORS.find(a=>a.id===pickup.id)!;
            expect(pickup.y).toBeCloseTo(anchor.y??.7);
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
        const impacts=sim.snapshot(false).impacts;
        expect(impacts.some(i=>i.cue==='armor-clang')).toBe(true);
        expect(impacts.some(i=>i.cue==='case-hit'||i.foley==='case-bounce')).toBe(false);
        expect(parseServerMessage({type:'chaos',state:sim.snapshot(false)})).not.toBeNull();
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

it('keeps upper-floor rewards unavailable to a rat directly below them',()=>{
    const {sim,a,now}=fixture();const upper=sites(sim).find(p=>p.id==='alibi-records-upper')!;
    stand(a,{...upper,y:0});sim.step(1/60,now+20);
    expect(sites(sim).some(p=>p.id===upper.id)).toBe(true);
    expect(sim.snapshot(false).buffs?.[a.id]?.ironcladUntil).toBeUndefined();
    stand(a,{...upper,y:8});sim.step(1/60,now+40);
    expect(sites(sim).some(p=>p.id===upper.id)).toBe(false);
});
it('has four contested street medkits, four tunnel speed sites and no street armor',()=>{
    const {sim}=fixture(),all=sites(sim);
    expect(all.filter(p=>p.kind==='quick-fix')).toHaveLength(4);
    expect(all.filter(p=>p.kind==='hustle')).toHaveLength(4);
    expect(all.filter(p=>p.kind==='ironclad')).toHaveLength(10);
    expect(all.filter(p=>p.kind==='ironclad').every(p=>p.y>8||p.y<0)).toBe(true);
});

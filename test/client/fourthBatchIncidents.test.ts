import {afterEach,describe,expect,it,vi} from 'vitest';
import {ChaosSimulation,type ChaosHit} from '../../src/shared/ChaosSimulation';
import {CHAOS_TUNING as T,INCIDENT_TUNING as I} from '../../src/shared/chaosState';
import {createAssignment} from '../../src/shared/assignments';
import {CITY_PREVIEW_SEED,GRAYBOX_VERSION} from '../../src/shared/grayboxLayout';
import {MAX_HP,type PlayerData} from '../../src/shared/networkProtocol';
import {createPlayer,spawnForWorld} from '../../src/worker/gameState';
import type {IncidentId} from '../../src/shared/incidentCatalog';

afterEach(()=>vi.restoreAllMocks());
const appearance={hatType:'fedora' as const,hatColor:1,coatColor:2,furColor:3};
const spec={seed:CITY_PREVIEW_SEED,version:GRAYBOX_VERSION};
const now=1_000_000;
const hits:ChaosHit[]=[];
function active(incident:IncidentId,ids=['a','b','c']){
    hits.length=0;
    vi.spyOn(Date,'now').mockReturnValue(now);
    const rats=ids.map((id,i)=>createPlayer(id,id.toUpperCase(),appearance,{x:i*3,y:0,z:0}));
    const players=new Map(rats.map(p=>[p.id,p]));
    const initial=new ChaosSimulation(players,()=>{},undefined,spec);initial.step(0,now);
    const saved=initial.snapshot(false);saved.dispatch={phase:'active',incident,started:now,until:now+T.activeMs,serial:7};
    const sim=new ChaosSimulation(players,hit=>hits.push(hit),saved,spec);
    return {sim,players,rats};
}
const stand=(p:PlayerData,x:number,y:number,z:number)=>{p.x=x;p.y=y;p.z=z;};

describe('fourth-batch incidents',()=>{
    it('Clean Bill heals every living rat once as it starts, never the dead',()=>{
        const {sim,rats:[a,b,c]}=active('clean-bill');a!.hp=1;b!.hp=0;c!.hp=MAX_HP;
        sim.step(1/60,now+16);
        expect([a!.hp,b!.hp,c!.hp]).toEqual([MAX_HP,0,MAX_HP]);
        expect(sim.drainPickupEvents()).toEqual([{kind:'healed',playerId:'a',hp:MAX_HP,cause:'incident'}]);
        a!.hp=2;sim.step(1/60,now+32);expect(a!.hp).toBe(2);
    });

    it('Rat Race makes every living rat hustle until the incident ends, including a respawned one',()=>{
        const {sim,rats:[a,b]}=active('rat-race');b!.hp=0;
        sim.step(1/60,now+16);
        expect(sim.snapshot(false).buffs?.a?.hustleUntil).toBe(now+T.activeMs);
        expect(sim.snapshot(false).buffs?.b).toBeUndefined();
        b!.hp=MAX_HP;sim.step(1/60,now+32);
        expect(sim.snapshot(false).buffs?.b?.hustleUntil).toBe(now+T.activeMs);
        expect(a!.hp).toBe(MAX_HP);
    });

    it('Most Wanted targets the assignment leader; the killer collects a heal and Hot Pursuit, then the next leader is wanted',()=>{
        const {sim,rats:[a,b,c]}=active('most-wanted');
        const assignment=createAssignment('chain-of-custody',now);assignment.phase='active';assignment.liveAt=now;
        assignment.deliveries={b:2,c:1};sim.setAssignment(assignment);
        sim.step(1/60,now+16);
        expect(sim.snapshot(false).dispatch.wanted).toBe('b');
        a!.hp=1;b!.hp=0;sim.death(b!,{x:1,y:0,z:0},'a');
        expect(a!.hp).toBe(MAX_HP);
        expect(sim.snapshot(false).buffs?.a?.hustleUntil).toBeGreaterThan(now);
        expect(sim.drainPickupEvents()).toContainEqual({kind:'healed',playerId:'a',hp:MAX_HP,cause:'bounty'});
        sim.step(1/60,now+32);
        expect(sim.snapshot(false).dispatch.wanted).toBe('c');
        // A self-inflicted death pays no bounty.
        c!.hp=0;const before={...sim.snapshot(false).buffs};sim.death(c!,{x:1,y:0,z:0},'c');
        expect(sim.snapshot(false).buffs?.c).toEqual(before.c);
    });

    it('Malpractice kits hop away from a close rat, stay near home, and go home when it ends',()=>{
        const {sim,players,rats:[a]}=active('malpractice',['a']);
        a!.hp=2;
        const kit=sim.snapshot(false).pickups!.find(p=>p.kind==='quick-fix')!;
        const home={x:kit.x,z:kit.z};
        // Stand just off the kit, outside its claim reach.
        stand(a!,kit.x+2.5,kit.y-.7,kit.z);
        sim.step(1/60,now+16);
        const moved=sim.snapshot(false).pickups!.find(p=>p.id===kit.id)!;
        expect(Math.hypot(moved.x-home.x,moved.z-home.z)).toBeGreaterThan(1);
        expect(Math.hypot(moved.x-a!.x,moved.z-a!.z)).toBeGreaterThan(2.5);
        for(let i=2;i<120;i++){stand(a!,moved.x+2.5,moved.y-.7,moved.z);sim.step(1/60,now+i*16);}
        for(const p of sim.snapshot(false).pickups!.filter(p=>p.id===kit.id))expect(Math.hypot(p.x-home.x,p.z-home.z)).toBeLessThanOrEqual(I.malpracticeLeash+1e-6);
        const ended=sim.snapshot(false);ended.dispatch={phase:'cooldown',started:now,until:now+T.cooldownMs,serial:7};
        const after=new ChaosSimulation(players,()=>{},ended,spec);after.step(1/60,now+4000);
        const back=after.snapshot(false).pickups!.find(p=>p.id===kit.id)!;
        expect({x:back.x,z:back.z}).toEqual(home);
    });

    it('a Malpractice kit that explodes does not heal',()=>{
        const {sim,rats:[a]}=active('malpractice',['a']);a!.hp=1;
        const kit=sim.snapshot(false).pickups!.find(p=>p.kind==='quick-fix')!;
        vi.spyOn(Math,'random').mockReturnValue(0);
        // It bolts as you arrive; catch it before its next hop.
        stand(a!,kit.x+3,kit.y-.7,kit.z);sim.step(1/60,now+16);
        const fled=sim.snapshot(false).pickups!.find(p=>p.id===kit.id)!;
        stand(a!,fled.x,fled.y-.7,fled.z);sim.step(1/60,now+32);
        expect(a!.hp).toBe(1);
        expect(sim.snapshot(false).pickups!.find(p=>p.id===kit.id)!.availableAt).toBeGreaterThan(now);
        // The blast is neutral cheese that catches the rat who opened the bag.
        expect(hits.some(hit=>hit.victim==='a'&&hit.owner===null)).toBe(true);
    });

    it('All Units respawns the fallen beside the real case instead of far from everyone',()=>{
        const {sim,players}=active('all-units');
        sim.step(1/60,now+16);
        const target=sim.allUnitsTarget!;expect(target).toBeDefined();
        for(let i=0;i<20;i++){
            const spawn=spawnForWorld(spec,Math.random,players.values(),'a',undefined,target);
            const d=Math.hypot(spawn.x-target.x,spawn.z-target.z);
            expect(d).toBeGreaterThanOrEqual(10);expect(d).toBeLessThanOrEqual(30);
        }
        const quiet=active('scattershot');quiet.sim.step(1/60,now+16);
        expect(quiet.sim.allUnitsTarget).toBeUndefined();
    });
});

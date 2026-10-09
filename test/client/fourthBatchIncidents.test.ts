import {afterEach,describe,expect,it,vi} from 'vitest';
import {ChaosSimulation,type ChaosHit} from '../../src/shared/ChaosSimulation';
import {CHAOS_TUNING as T,INCIDENT_TUNING as I,type ChaosState} from '../../src/shared/chaosState';
import {createAssignment} from '../../src/shared/assignments';
import {CITY_PREVIEW_SEED,GRAYBOX_VERSION} from '../../src/shared/grayboxLayout';
import {MAX_HP} from '../../src/shared/networkProtocol';
import {createPlayer,spawnForWorld} from '../../src/worker/gameState';
import type {IncidentId} from '../../src/shared/incidentCatalog';
import {parseServerMessage} from '../../src/shared/messageValidation';

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

describe('fourth-batch incidents',()=>{
    it('Most Wanted follows whoever is winning, moves within a second of a lead change, and swings at once off a fallen leader',()=>{
        const {sim,rats:[a,b,c]}=active('most-wanted');
        const wanted=()=>sim.snapshot(false).dispatch.wanted;
        const assignment=createAssignment('chain-of-custody',now);assignment.phase='active';assignment.liveAt=now;
        assignment.deliveries={b:2,c:1};sim.setAssignment(assignment);
        sim.step(1/60,now+16);
        expect(wanted()).toBe('b');
        assignment.deliveries={b:2,c:3};sim.setAssignment(assignment);
        sim.step(1/60,now+500);expect(wanted()).toBe('b');
        sim.step(1/60,now+16+I.wantedEveryMs+20);expect(wanted()).toBe('c');
        // Level again: the light stays where it is rather than flickering to the lower id.
        assignment.deliveries={b:3,c:3};sim.setAssignment(assignment);
        sim.step(1/60,now+16+2*I.wantedEveryMs+40);expect(wanted()).toBe('c');
        c!.hp=0;sim.step(1/60,now+16+2*I.wantedEveryMs+60);expect(wanted()).toBe('b');
        // The takedown pays a random supply through the ordinary reward, and everyone is told who claimed it.
        sim.drainPickupEvents();b!.hp=0;sim.death(b!,{x:1,y:0,z:0},'a');
        const reward=sim.drainPickupEvents().find(e=>e.kind==='rewarded');
        expect(reward).toMatchObject({playerId:'a',why:'bounty'});
        expect(sim.snapshot(false).dispatch.bounty).toMatchObject({hunter:'a',target:'b',pickup:reward?.kind==='rewarded'?reward.pickup:undefined});
        // A self-inflicted death of the wanted rat pays nobody.
        sim.step(1/60,now+16+2*I.wantedEveryMs+80);expect(wanted()).toBe('a');
        a!.hp=0;sim.death(a!,{x:1,y:0,z:0},'a');
        expect(sim.drainPickupEvents().some(e=>e.kind==='rewarded')).toBe(false);
    });

    it('a stored room still running Big Cheese, Cheddar Shower, Act of God or Code Violation runs Crossfire',()=>{
        const {sim}=active('crossfire',['a']);
        for(const incident of ['big-cheese','cheddar-shower','act-of-god','code-violation']){
            const legacy={...sim.snapshot(false),dispatch:{phase:'active',incident,started:now,until:now+T.activeMs,serial:7}} as unknown as ChaosState;
            expect(parseServerMessage({type:'chaos',state:legacy})).toMatchObject({state:{dispatch:{incident:'crossfire'}}});
        }
    });

    it('All Units respawns the fallen beside the real case instead of far from everyone',()=>{
        const {sim,players}=active('all-units');
        sim.step(1/60,now+16);
        const target=sim.allUnitsTarget!;expect(target).toBeDefined();
        // Wherever the case is (street or sewer), the respawn is among the closest supported spots.
        const ordinary=spawnForWorld(spec,()=>.5,players.values(),'a');
        for(let i=0;i<20;i++){
            const spawn=spawnForWorld(spec,Math.random,players.values(),'a',undefined,target);
            const d=Math.hypot(spawn.x-target.x,spawn.z-target.z);
            expect(d).toBeGreaterThanOrEqual(10);expect(d).toBeLessThan(45);
            expect(d).toBeLessThan(Math.max(45,Math.hypot(ordinary.x-target.x,ordinary.z-target.z)));
        }
        const quiet=active('scattershot');quiet.sim.step(1/60,now+16);
        expect(quiet.sim.allUnitsTarget).toBeUndefined();
    });

    it('clients accept the remaining heal causes and refuse retired ones',()=>{
        for(const cause of ['pickup','case-kill'] as const)
            expect(parseServerMessage({type:'playerHealed',id:'a',hp:MAX_HP,cause})).toMatchObject({cause});
        for(const cause of ['incident','bounty','magic'])expect(parseServerMessage({type:'playerHealed',id:'a',hp:MAX_HP,cause})).toBeNull();
    });
});

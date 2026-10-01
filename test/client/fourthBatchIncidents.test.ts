import {afterEach,describe,expect,it,vi} from 'vitest';
import {ChaosSimulation,type ChaosHit} from '../../src/shared/ChaosSimulation';
import {CHAOS_TUNING as T,INCIDENT_TUNING as I} from '../../src/shared/chaosState';
import {createAssignment} from '../../src/shared/assignments';
import {CITY_PREVIEW_SEED,GRAYBOX_VERSION} from '../../src/shared/grayboxLayout';
import {MAX_HP,type PlayerData} from '../../src/shared/networkProtocol';
import {applyHit,createPlayer,spawnForWorld} from '../../src/worker/gameState';
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
const stand=(p:PlayerData,x:number,y:number,z:number)=>{p.x=x;p.y=y;p.z=z;};

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

    it('Code Violation supplies hop away from a close rat, stay near home, and go home when it ends',()=>{
        const {sim,players,rats:[a]}=active('code-violation',['a']);
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
        for(const p of sim.snapshot(false).pickups!.filter(p=>p.id===kit.id))expect(Math.hypot(p.x-home.x,p.z-home.z)).toBeLessThanOrEqual(I.violationLeash+1e-6);
        const ended=sim.snapshot(false);ended.dispatch={phase:'cooldown',started:now,until:now+T.cooldownMs,serial:7};
        const after=new ChaosSimulation(players,()=>{},ended,spec);after.step(1/60,now+4000);
        const back=after.snapshot(false).pickups!.find(p=>p.id===kit.id)!;
        expect({x:back.x,z:back.z}).toEqual(home);
    });

    it('a Code Violation supply that explodes does not heal, and its blast is the city\'s',()=>{
        const {sim,rats:[a]}=active('code-violation',['a']);a!.hp=1;
        const kit=sim.snapshot(false).pickups!.find(p=>p.kind==='quick-fix')!;
        vi.spyOn(Math,'random').mockReturnValue(0);
        // It bolts as you arrive; catch it before its next hop.
        stand(a!,kit.x+3,kit.y-.7,kit.z);sim.step(1/60,now+16);
        const fled=sim.snapshot(false).pickups!.find(p=>p.id===kit.id)!;
        stand(a!,fled.x,fled.y-.7,fled.z);sim.step(1/60,now+32);
        expect(a!.hp).toBe(1);
        expect(sim.snapshot(false).pickups!.find(p=>p.id===kit.id)!.availableAt).toBeGreaterThan(now);
        // The blast is neutral cheese that catches the rat who opened the bag, a malfunction nobody is credited for.
        expect(hits.some(hit=>hit.victim==='a'&&hit.owner===null&&hit.cause==='malfunction')).toBe(true);
    });

    it('a meteor flattens the rat under its shadow for nobody\'s credit, counts its death, and only shoves the rat beside it',()=>{
        const {sim,players,rats:[a,b]}=active('act-of-god',['a','b']);
        // Every meteor is aimed straight at the first living rat.
        vi.spyOn(Math,'random').mockReturnValue(0);
        sim.step(1/60,now+16);sim.step(1/60,now+700);
        const meteor=sim.snapshot(false).meteors![0]!;
        stand(a!,meteor.x,meteor.y+1,meteor.z);stand(b!,meteor.x+I.meteorRadius+4,meteor.y+1,meteor.z);
        const kills=b!.kills;
        sim.step(1/60,meteor.at+1);
        const flattened=hits.filter(hit=>hit.victim==='a');
        expect(flattened[0]).toMatchObject({owner:null,cause:'meteor',damage:MAX_HP});
        expect(hits.some(hit=>hit.victim==='b')).toBe(false);
        expect(sim.drainIncidentEvents()).toContainEqual(expect.objectContaining({kind:'meteor',flattened:['a'],shoved:1}));
        // The room applies it as it does any city hit: the victim dies, nobody scores.
        const result=applyHit(players,flattened[0]!.owner,'a',flattened[0]!.damage,true);
        expect(result).toMatchObject({applied:true,killed:true,roundWon:false});
        expect(a!.deaths).toBe(1);expect(b!.kills).toBe(kills);
    });

    it('meteor bursts never push the ball count past the cap, and a rat\'s own shot still gets in',()=>{
        const {sim,players}=active('act-of-god',['a','b','c']);
        // A busy sky: four meteors landing in the same step (480 balls of burst), well away from every rat.
        const saved=sim.snapshot(false);
        saved.meteors=[0,1,2,3].map(i=>({id:`meteor-7-${i}`,x:40+i*8,y:0,z:40,born:now,at:now+100}));
        const busy=new ChaosSimulation(players,()=>{},saved,spec);
        busy.step(1/60,now+120);
        expect(busy.drainIncidentEvents().filter(e=>e.kind==='meteor')).toHaveLength(4);
        expect(busy.snapshot(false).shots).toHaveLength(T.maxShots);
        busy.shoot('a',{shotId:'own-shot',origin:{x:0,y:30,z:0},direction:{x:1,y:0,z:0}});
        const shots=busy.snapshot(false).shots;
        expect(shots).toHaveLength(T.maxShots);
        expect(shots.some(s=>s.id==='own-shot')).toBe(true);
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

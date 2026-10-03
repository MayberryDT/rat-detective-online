import {afterEach,describe,expect,it,vi} from 'vitest';
import {ChaosSimulation,type ChaosHit} from '../../src/shared/ChaosSimulation';
import {CHAOS_TUNING as T,DISPATCH_STATIONS,INCIDENT_TUNING as I,type ChaosState} from '../../src/shared/chaosState';
import {createAssignment} from '../../src/shared/assignments';
import {CITY_BOUNDS,CITY_PREVIEW_SEED,GRAYBOX_VERSION} from '../../src/shared/grayboxLayout';
import {MAX_HP,type PlayerData,type Vec3Data} from '../../src/shared/networkProtocol';
import {createPlayer,spawnForWorld} from '../../src/worker/gameState';
import type {IncidentId} from '../../src/shared/incidentCatalog';
import {parseServerMessage} from '../../src/shared/messageValidation';
import {FAULTY_KINDS,type FaultyKind} from '../../src/shared/pickups';
import {overWater} from '../../src/shared/city/kit/city';

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
        for(const p of sim.snapshot(false).pickups!.filter(p=>p.id===kit.id))expect(Math.hypot(p.x-home.x,p.z-home.z)).toBeLessThanOrEqual(I.violationFixLeash+1e-6);
        const ended=sim.snapshot(false);ended.dispatch={phase:'cooldown',started:now,until:now+T.cooldownMs,serial:7};
        const after=new ChaosSimulation(players,()=>{},ended,spec);after.step(1/60,now+4000);
        const back=after.snapshot(false).pickups!.find(p=>p.id===kit.id)!;
        expect({x:back.x,z:back.z}).toEqual(home);
    });

    /** Catch the `kind` supply the way a rat does: it bolts as you arrive, so run onto where it fled before its next hop. */
    const claim=(sim:ChaosSimulation,a:PlayerData,kind:string)=>{
        const kit=sim.snapshot(false).pickups!.find(p=>p.kind===kind)!;
        stand(a,kit.x+3,kit.y-.7,kit.z);sim.step(1/60,now+16);
        const fled=sim.snapshot(false).pickups!.find(p=>p.id===kit.id)!;
        stand(a,fled.x,fled.y-.7,fled.z);sim.step(1/60,now+32);
        return sim.drainPickupEvents().find(e=>e.kind==='collected');
    };

    it('during Code Violation a caught Quick Fix still heals fully, with no dud',()=>{
        const {sim,rats:[a]}=active('code-violation',['a']);a!.hp=1;
        vi.spyOn(Math,'random').mockReturnValue(0);
        expect(claim(sim,a!,'quick-fix')).toMatchObject({pickup:'quick-fix',playerId:'a'});
        expect(a!.hp).toBe(MAX_HP);
        expect(sim.snapshot(false).buffs?.a).toBeUndefined();
        expect(hits).toEqual([]);
    });

    it.each(FAULTY_KINDS)('a %s claimed during Code Violation is a harmless dud that wears off and dies with the rat',kind=>{
        const {sim,rats:[a]}=active('code-violation',['a']);
        vi.spyOn(Math,'random').mockReturnValue(0);
        expect(claim(sim,a!,kind)).toMatchObject({pickup:kind,playerId:'a',faulty:true});
        const entry=sim.snapshot(false).buffs!.a!;
        // The bad version only: none of the supply's real effect, and nothing hurts.
        expect(entry).toMatchObject({faulty:kind});
        expect(entry.ironcladUntil??entry.hustleUntil??entry.stakeoutUntil??entry.weapon).toBeUndefined();
        expect(a!.hp).toBe(MAX_HP);expect(hits).toEqual([]);
        expect(sim.drainIncidentEvents()).toContainEqual(expect.objectContaining({kind:'malfunction',what:'faulty',playerId:'a',pickup:kind}));
        // It runs out on its own.
        sim.step(1/60,entry.faultyUntil!+1);
        expect(sim.snapshot(false).buffs?.a).toBeUndefined();
        // A fresh one dies with the rat.
        const again=active('code-violation',['a']);claim(again.sim,again.rats[0]!,kind);
        expect(again.sim.snapshot(false).buffs?.a?.faulty).toBe(kind);
        again.rats[0]!.hp=0;again.sim.step(1/60,now+48);
        expect(again.sim.snapshot(false).buffs?.a).toBeUndefined();
    });

    /** Where a thrown rat standing at `p` could come down at worst: its sideways speed for the whole fall to the water. */
    const landing=(p:Vec3Data,v:Vec3Data)=>{const t=(v.y+Math.sqrt(v.y*v.y+2*25*(p.y+2)))/25;return {x:p.x+v.x*t,z:p.z+v.z*t};};
    const dry=(l:{x:number;z:number})=>!overWater(l.x,l.z)&&l.x>CITY_BOUNDS.min&&l.x<CITY_BOUNDS.max&&l.z>CITY_BOUNDS.min&&l.z<CITY_BOUNDS.max;

    it('Code Violation never throws a rat into the harbour: the quay pillar clangs rats along the quay, not into the water',()=>{
        const {sim,rats:[a]}=active('code-violation',['a']);
        // On the harbour side of the quay pillar: straight away from it is out over the water.
        const quay=DISPATCH_STATIONS.find(s=>s.id==='quay')!,spot={x:quay.x,y:quay.y,z:quay.z-3.5};
        const seen=new Map<string,Vec3Data>();
        for(let t=16;t<60_000;t+=100){
            stand(a!,spot.x,spot.y,spot.z);sim.step(.1,now+t);
            for(const shove of sim.snapshot(false).pressure?.shoves??[])if(shove.playerId==='a')seen.set(shove.id,shove.velocity);
        }
        expect(seen.size).toBeGreaterThan(3);
        for(const v of seen.values())expect(dry(landing(spot,v))).toBe(true);
        expect(hits).toEqual([]);
    });

    it('a Backfire facing away from the water still throws its rat along dry ground',()=>{
        const {sim,rats:[a]}=active('code-violation',['a']);
        // At the quay edge facing the street: backwards is the harbour.
        const spot={x:80,y:0,z:-162};stand(a!,spot.x,spot.y,spot.z);Object.assign(a!,{meshQx:0,meshQy:1,meshQz:0,meshQw:0});
        // The dud itself, reached directly: no supply site stands at the quay edge to claim it from.
        const room=sim as unknown as {faultyClaim(p:PlayerData,k:FaultyKind,site:string,at:Vec3Data,t:number):void};
        room.faultyClaim(a!,'tommy-gun','test',spot,now);
        const shove=sim.snapshot(false).pressure?.shoves?.find(s=>s.playerId==='a');
        expect(shove).toBeDefined();
        expect(dry(landing(spot,shove!.velocity))).toBe(true);
        expect(hits).toEqual([]);
    });

    it('a stored room still running Big Cheese, Cheddar Shower or Act of God runs Crossfire',()=>{
        const {sim}=active('crossfire',['a']);
        for(const incident of ['big-cheese','cheddar-shower','act-of-god']){
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

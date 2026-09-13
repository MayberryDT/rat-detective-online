import {afterEach,describe,expect,it,vi} from 'vitest';
import {ChaosSimulation,type ChaosHit} from '../../src/shared/ChaosSimulation';
import {CHAOS_TUNING,type ChaosState} from '../../src/shared/chaosState';
import {createAssignment} from '../../src/shared/assignments';
import {applyHit,createPlayer} from '../../src/worker/gameState';
import {parseServerMessage} from '../../src/shared/messageValidation';
import {ChaosEncoder,ChaosDecoder} from '../../src/shared/chaosWire';
import {serializeServerMessage} from '../../src/worker/serializeServerMessage';

const NOW=1_000_000,appearance={hatType:'fedora' as const,hatColor:1,coatColor:2,furColor:3};
afterEach(()=>vi.restoreAllMocks());
function fixture(incident:'planted-evidence'|'improper-disposal',protectedOwner=false){
    vi.spyOn(Date,'now').mockReturnValue(NOW);
    const owner=createPlayer('owner','Owner',appearance,{x:-3,y:59,z:0});
    const victim=createPlayer('victim','Victim',appearance,{x:0,y:59.05,z:0});
    const players=new Map([owner,victim].map(p=>[p.id,p])),hits:ChaosHit[]=[];
    const seed=new ChaosSimulation(players,()=>{}).snapshot(false);
    seed.dispatch={phase:'active',started:NOW,until:NOW+25_000,serial:1,incident};
    delete seed.extraCases;
    seed.assignment=createAssignment('excessive-force',NOW-3000);seed.assignment.phase='active';
    let sim:ChaosSimulation;
    const hit=(h:ChaosHit)=>{
        hits.push(h);
        const result=applyHit(players,h.owner,h.victim,h.damage,true,null,true,h.explosive===true);
        if(result.killed){
            if(h.owner!==h.victim)sim.creditCaseKill(h.owner);
            sim.death(players.get(h.victim)!,h.incoming,h.owner);
        }
    };
    sim=new ChaosSimulation(players,hit,seed);
    if(protectedOwner){
        const site=sim.snapshot(false).pickups!.find(p=>p.kind==='ironclad')!;
        Object.assign(owner,{x:site.x,y:site.y-.8,z:site.z});
        expect(sim.claimInteraction(owner.id,'pickup',site.id,site.availableAt??0,NOW).accepted).toBe(true);
        Object.assign(owner,{x:-3,y:59,z:0});
    }
    const burst=()=>{
        victim.hp=0;
        if(incident==='improper-disposal')sim.death(victim,{x:1,y:0,z:0},owner.id);
        else {
            const [fake]=[...sim.targets].find(([,t])=>t.kind==='case'&&t.caseId!=='primary')!;
            fake.position.set(0,60,0);fake.updateAABB();
            sim.shoot(owner.id,{shotId:'trigger',origin:{x:-2,y:60,z:0},direction:{x:1,y:0,z:0}});
            sim.step(.02,NOW+20);
        }
    };
    const restore=(saved:ChaosState)=>{sim=new ChaosSimulation(players,hit,saved);return sim;};
    return {get sim(){return sim;},owner,victim,hits,burst,restore};
}

describe('explosive debris self damage',()=>{
    it.each(['planted-evidence','improper-disposal'] as const)('%s can kill its initiator without awarding self kills or objective credit',incident=>{
        const f=fixture(incident);f.owner.hp=1;f.owner.kills=19;
        f.burst();
        for(let i=1;i<=20;i++)f.sim.step(1/120,NOW+20+i*1000/120);
        expect(f.hits.some(h=>h.owner===f.owner.id&&h.victim===f.owner.id&&h.explosive)).toBe(true);
        expect(f.owner.hp).toBe(0);expect(f.owner.deaths).toBe(1);expect(f.owner.kills).toBe(19);
        expect(f.sim.assignmentState!.caseKills).toEqual({});expect(f.sim.assignmentState!.result).toBeUndefined();
        expect(f.sim.snapshot(false).shots.length).toBeLessThanOrEqual(CHAOS_TUNING.maxShots);
    });
    it.each(['planted-evidence','improper-disposal'] as const)('%s still reflects from the initiating rat’s Ironclad coat',incident=>{
        const f=fixture(incident,true);f.burst();
        for(let i=1;i<=20;i++)f.sim.step(1/120,NOW+20+i*1000/120);
        expect(f.owner.hp).toBe(3);expect(f.hits.filter(h=>h.victim===f.owner.id)).toEqual([]);
        expect(f.sim.snapshot(false).impacts.some(i=>i.cue==='armor-clang')).toBe(true);
    });
    it('retains explosion eligibility and attribution through a durable restore, with valid visual frames',()=>{
        const f=fixture('improper-disposal');f.burst();
        const saved=JSON.parse(JSON.stringify(f.sim.snapshot(false))) as ChaosState;
        expect(saved.shots).toHaveLength(120);expect(saved.shots.every(s=>s.explosive&&s.owner==='owner')).toBe(true);
        expect(parseServerMessage({type:'chaos',state:saved})).not.toBeNull();
        const legacy=serializeServerMessage({type:'chaos',state:saved});
        expect(legacy).not.toContain('explosive');expect(parseServerMessage(legacy)).not.toBeNull();
        expect(saved.shots.every(s=>s.explosive)).toBe(true);
        const decoded=new ChaosDecoder().read(new ChaosEncoder().encode(saved).payload);
        expect(decoded?.message.type).toBe('chaos');
        // Provenance is authority-only; compact visual payloads need no new bit.
        if(decoded?.message.type==='chaos')expect(decoded.message.state.shots.every(s=>s.explosive===undefined)).toBe(true);
        f.restore(saved);
        for(let i=1;i<=20;i++)f.sim.step(1/120,NOW+i*1000/120);
        expect(f.owner.hp).toBeLessThan(3);
    });
    it('keeps an ordinary round harmless to its owner',()=>{
        const f=fixture('improper-disposal');f.victim.hp=0;
        f.sim.shoot(f.owner.id,{shotId:'ordinary',origin:{x:-6,y:60,z:0},direction:{x:1,y:0,z:0}});
        for(let i=1;i<=20;i++)f.sim.step(1/120,NOW+i*1000/120);
        expect(f.hits).toEqual([]);expect(f.owner.hp).toBe(3);
    });
});

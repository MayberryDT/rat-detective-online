import {afterEach,describe,expect,it,vi} from 'vitest';
import * as C from 'cannon-es';
import {ChaosSimulation,type ChaosHit} from '../../src/shared/ChaosSimulation';
import {CHAOS_TUNING as T,COUNTERFEIT_IDS,EXTRA_CASE_IDS} from '../../src/shared/chaosState';
import {createAssignment} from '../../src/shared/assignments';
import {CITY_PREVIEW_SEED,GRAYBOX_VERSION} from '../../src/shared/grayboxLayout';
import {ObjectiveBotBrain} from '../../src/shared/ObjectiveBotBrain';
import {parseServerMessage} from '../../src/shared/messageValidation';
import {createPlayer} from '../../src/worker/gameState';

afterEach(()=>vi.restoreAllMocks());
const appearance={hatType:'fedora' as const,hatColor:1,coatColor:2,furColor:3};
const spec={seed:CITY_PREVIEW_SEED,version:GRAYBOX_VERSION};
const fakeBodies=(sim:ChaosSimulation)=>[...sim.targets].filter(([,t])=>t.kind==='case'&&t.caseId!=='primary');

function fixture(incident:'planted-evidence'|'evidence-tampering'='planted-evidence'){
    const now=Date.now();
    const shooter=createPlayer('shooter','Shooter',appearance,{x:-40,y:2,z:0});
    const victim=createPlayer('victim','Victim',appearance,{x:40,y:2,z:0});
    const players=new Map([shooter,victim].map(p=>[p.id,p]));
    const hits:ChaosHit[]=[];
    const initial=new ChaosSimulation(players,hit=>hits.push(hit),undefined,spec);
    initial.setAssignment(createAssignment('excessive-force',now));
    initial.step(0,now);
    const state=initial.snapshot(false);
    state.dispatch={phase:'active',started:now,until:now+T.activeMs,serial:1,incident};
    // A synthetic incident start has no saved batch yet.
    delete state.extraCases;
    const sim=new ChaosSimulation(players,hit=>hits.push(hit),state,spec);
    if(incident==='evidence-tampering')sim.evidenceMode='classic';
    sim.step(0,now);
    return {sim,players,shooter,victim,hits,now};
}
/** Park one counterfeit and the actors in clear air so only the tested rule matters. */
function park(target:C.Body,y=60){
    target.position.set(0,y,0);target.velocity.setZero();target.angularVelocity.setZero();target.updateAABB();
}

describe('Planted Evidence',()=>{
    it('plants ten counterfeits and never the retired missile batch',()=>{
        const {sim}=fixture();
        expect(fakeBodies(sim)).toHaveLength(COUNTERFEIT_IDS.length);
        expect(COUNTERFEIT_IDS.length).toBe(10);
        const state=sim.snapshot(false);
        expect(state.extraCases).toHaveLength(10);
        expect(state.extraCases!.every(c=>c.fake===true)).toBe(true);
        expect(state.extraCases!.some(c=>EXTRA_CASE_IDS.some(id=>id===c.id))).toBe(false);
        expect(parseServerMessage({type:'chaos',state})).not.toBeNull();
    });
    it('keeps the genuine case collectible and the assignment live',()=>{
        const {sim,shooter,now}=fixture();
        sim.step(1/60,now+3000);
        expect(sim.assignmentState?.phase).toBe('active');
        const p=sim.caseBody.position;
        shooter.x=p.x;shooter.y=p.y;shooter.z=p.z;
        sim.step(1/60,now+3016);
        expect(sim.caseHolderId).toBe(shooter.id);
        expect(sim.assignmentState?.phase).toBe('active');
    });
    it('detonates once on a shot with the initiating attribution and no missile state',()=>{
        const {sim,shooter,hits,now}=fixture();
        const [body]=fakeBodies(sim)[0];
        park(body);
        const before=sim.snapshot(false).shots.length;
        sim.shoot(shooter.id,{shotId:'fake-shot',origin:{x:-4,y:60,z:0},direction:{x:1,y:0,z:0}});
        sim.step(.05,now+50);
        const state=sim.snapshot(false);
        expect(state.extraCases).toHaveLength(9);
        expect(state.shots.length).toBeGreaterThan(before);
        expect(state.shots.every(s=>s.owner===shooter.id)).toBe(true);
        expect(state.shots.length-before).toBeLessThanOrEqual(T.maxShots);
        // This shooter is far from the blast; ownership still records the initiator.
        expect(hits.some(h=>h.victim===shooter.id)).toBe(false);
        sim.step(1/60,now+67);
        expect(sim.snapshot(false).extraCases).toHaveLength(9);
        const restored=new ChaosSimulation(new Map(),()=>{},sim.snapshot(false),spec);
        restored.step(0,now+67);
        expect(restored.snapshot(false).extraCases).toHaveLength(9);
    });
    it('uses the full Improper Disposal eruption, with the same count, speed and directions',()=>{
        const {sim,shooter,now}=fixture();const [body]=fakeBodies(sim)[0];park(body);
        sim.shoot(shooter.id,{shotId:'full-burst',origin:{x:-4,y:60,z:0},direction:{x:1,y:0,z:0}});
        sim.step(.05,now+50);
        const planted=sim.snapshot(false).shots;
        const corpseState=sim.snapshot(false);corpseState.shots=[];corpseState.extraCases=[];
        corpseState.dispatch={phase:'active',started:now,until:now+25000,serial:5,incident:'improper-disposal'};
        const disposal=new ChaosSimulation(new Map(),()=>{},corpseState,spec);
        disposal.death({...shooter,x:0,y:59.05,z:0},{x:1,y:0,z:0},shooter.id);
        const exploded=disposal.snapshot(false).shots;
        expect(planted).toHaveLength(120);expect(exploded).toHaveLength(120);
        // The explosion created during shot stepping receives the remaining step;
        // compare horizontal directions and finite ownership, without gravity drift.
        expect(planted.map(s=>[s.v.x,s.v.z,s.owner,s.original])).toEqual(exploded.map(s=>[s.v.x,s.v.z,s.owner,s.original]));
    });
    it('kills the rat that walks onto a counterfeit once, even behind Ironclad',()=>{
        const {sim,shooter,hits,now}=fixture();
        // Claim the coat first, then step onto a counterfeit at full protection.
        shooter.x=sim.snapshot(false).pickups!.find(p=>p.kind==='ironclad')!.x;
        shooter.z=sim.snapshot(false).pickups!.find(p=>p.kind==='ironclad')!.z;
        shooter.y=sim.snapshot(false).pickups!.find(p=>p.kind==='ironclad')!.y-.7;sim.step(1/60,now+16);
        expect(sim.snapshot(false).buffs?.[shooter.id]?.ironcladUntil).toBeGreaterThan(now);
        const [body]=fakeBodies(sim)[0];
        body.position.set(120,60,120);body.updateAABB();
        shooter.x=120;shooter.y=59.2;shooter.z=120;
        sim.step(1/60,now+32);
        const deaths=hits.filter(h=>h.victim===shooter.id);
        expect(deaths).toHaveLength(1);
        expect(deaths[0].owner).toBeNull();
        expect(deaths[0].damage).toBe(3);
        // One trap, one detonation: the fake is gone and cannot re-trigger.
        sim.step(1/60,now+48);
        expect(hits.filter(h=>h.victim===shooter.id)).toHaveLength(1);
    });
    it('throws a shot-triggered burst through nearby rat height instead of entirely overhead',()=>{
        const {sim,shooter,victim,hits,now}=fixture();
        const [body]=fakeBodies(sim)[0];park(body);
        vi.spyOn(Math,'random').mockReturnValue(.5);
        // The eastward burst ball should cross a rat three units from the case.
        victim.x=3*Math.cos(.175);victim.y=59;victim.z=3*Math.sin(.175);
        sim.shoot(shooter.id,{shotId:'burst-nearby',origin:{x:-4,y:60,z:0},direction:{x:1,y:0,z:0}});
        for(let i=1;i<=12;i++)sim.step(1/120,now+i*1000/120);
        expect(hits.some(hit=>hit.victim===victim.id&&hit.owner===shooter.id)).toBe(true);
    });
    it('cleans up surviving counterfeits at expiry without a parting explosion',()=>{
        const {sim,now}=fixture();
        const state=sim.snapshot(false);
        const shots=state.shots.length;
        sim.step(0,now+T.activeMs);
        expect(fakeBodies(sim)).toHaveLength(0);
        expect(sim.snapshot(false).extraCases).toEqual([]);
        expect(sim.snapshot(false).shots.length).toBe(shots);
    });
    it('leaves the real case, holder progress and buffs untouched by cleanup',()=>{
        const {sim,shooter,now}=fixture();
        const p=sim.caseBody.position;
        shooter.x=p.x;shooter.y=p.y;shooter.z=p.z;
        sim.step(1/60,now+16);
        expect(sim.caseHolderId).toBe(shooter.id);
        sim.step(1/60,now+T.activeMs);
        expect(sim.caseHolderId).toBe(shooter.id);
        expect(sim.assignmentState?.phase).toBe('active');
    });
    it('restores the retired missile incident and its objective suspension only in classic mode',()=>{
        const {sim,now}=fixture('evidence-tampering');
        expect(fakeBodies(sim)).toHaveLength(EXTRA_CASE_IDS.length);
        expect(sim.snapshot(false).extraCases!.some(c=>c.fake)).toBe(false);
        expect(sim.assignmentState?.phase).toBe('suspended');
        sim.step(1/60,now+16);
        expect(sim.assignmentState?.phase).toBe('suspended');
    });
    it('treats a counterfeit as a hazard, never as a bot objective',()=>{
        const {sim,shooter,now}=fixture();
        const state=sim.snapshot(false);
        const brain=new ObjectiveBotBrain({route:()=>[],explorationTargets:()=>[]});
        const clear=()=>true;
        // Counterfeits are hazards: the bot may still chase the genuine case, but it
        // must never adopt a counterfeit as a collectible objective.
        for(let i=0;i<12;i++)brain.step(now+i*400,shooter,[],state,clear,false,true);
        expect(brain.goalKey.includes('fake')).toBe(false);
    });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChaosSimulation } from '../../src/shared/ChaosSimulation';
import { createAssignment, destinationPoint, destinationContains, CHAIN_ROUTE, ASSIGNMENT_DESTINATIONS, type AssignmentId, type DestinationId } from '../../src/shared/assignments';
import { applyHit, createPlayer } from '../../src/worker/gameState';
import { CHAOS_TUNING, type ChaosState } from '../../src/shared/chaosState';
import type { PlayerData } from '../../src/shared/networkProtocol';

const NOW=1_000_000;
const appearance={hatType:'fedora' as const,hatColor:1,coatColor:2,furColor:3};
beforeEach(()=>{vi.spyOn(Date,'now').mockReturnValue(NOW);vi.spyOn(Math,'random').mockReturnValue(.12);});
afterEach(()=>vi.restoreAllMocks());
function fixture(id:AssignmentId,saved?:ChaosState){
    const a=createPlayer('a','Inspector Brie',appearance,{x:-90,y:.3,z:-100});
    const b=createPlayer('b','Detective Rind',appearance,{x:50,y:.3,z:-100});
    const players=new Map([a,b].map(p=>[p.id,p]));
    const sim=new ChaosSimulation(players,hit=>{const result=applyHit(players,hit.owner,hit.victim,hit.damage,true,null,true);if(result.killed){sim.creditCaseKill(hit.owner);sim.death(players.get(hit.victim)!,hit.incoming,hit.owner);}},saved,{seed:1,version:2});
    if(!saved){const state=createAssignment(id,NOW);if(id==='chain-of-custody')state.destinations=[...CHAIN_ROUTE];state.liveAt=NOW;state.phase='active';sim.setAssignment(state);}
    return {sim,a,b,players};
}
function pickup(sim:ChaosSimulation,p:PlayerData,x:number,z:number,at=NOW){
    Object.assign(p,{x:x-.74,y:.3,z:z-.02});sim.caseBody.position.set(x,1.1,z);sim.caseBody.velocity.setZero();
    sim.step(0,at);expect(sim.caseHolderId).toBe(p.id);
}
function carriedEntry(sim:ChaosSimulation,p:PlayerData,id:DestinationId,at:number){
    const outside=destinationPoint(id),inside=destinationPoint(id,false);
    Object.assign(p,outside);sim.step(0,at);
    Object.assign(p,inside);sim.step(0,at+1);
    expect(destinationContains(id,p)).toBe(true);
}
function frames(sim:ChaosSimulation,count:number,from=NOW){
    for(let i=1;i<=count;i++)sim.step(1/60,from+i*1000/60);
}
describe('assignments in the real city case simulation',()=>{
    it('finishes Closing Time for a living holder, before a later resolved disarm',()=>{
        const {sim,a,b}=fixture('closing-time');pickup(sim,a,-16,-30);
        sim.assignmentState!.remainingMs=1;
        const p=sim.caseBody.position;
        sim.shoot(b.id,{shotId:'late-disarm',origin:{x:p.x,y:p.y,z:p.z+1.5},direction:{x:0,y:0,z:-1}});
        sim.step(1/60,NOW+1000/60);
        expect(sim.assignmentState!.result).toMatchObject({winnerId:'a',method:'held'});
    });
    it('a disarm resolved first pauses the remaining countdown until a legitimate steal',()=>{
        const {sim,a,b}=fixture('closing-time');pickup(sim,a,-16,-30);
        sim.assignmentState!.remainingMs=100;
        const p=sim.caseBody.position;
        sim.shoot(b.id,{shotId:'early-disarm',origin:{x:p.x,y:p.y,z:p.z+1.5},direction:{x:0,y:0,z:-1}});
        sim.step(1/60,NOW+1000/60);expect(sim.caseHolderId).toBeNull();
        const remaining=sim.assignmentState!.remainingMs;frames(sim,10,NOW+1000/60);
        expect(sim.assignmentState!.remainingMs).toBeCloseTo(remaining);expect(sim.assignmentState!.result).toBeUndefined();
        Object.assign(a,{x:100,z:100});pickup(sim,b,-16,-30,NOW+1000);frames(sim,10,NOW+1000);
        expect(sim.assignmentState!.result?.winnerId).toBe('b');
    });
    it('visits all six whole landmarks and lets a thief finish the final stop',()=>{
        const {sim,a,b}=fixture('chain-of-custody');pickup(sim,a,130,-25);
        for(const [i,id] of CHAIN_ROUTE.slice(0,-1).entries()){
            carriedEntry(sim,a,id,NOW+100+i*10);expect(sim.assignmentState!.stamps).toBe(i+1);
        }
        sim.release(a.id);Object.assign(a,{x:100,z:100});
        pickup(sim,b,-16,-30,NOW+300);carriedEntry(sim,b,CHAIN_ROUTE.at(-1)!,NOW+400);
        expect(sim.assignmentState!.result).toMatchObject({winnerId:'b',method:'carried'});
    });
    it('does not stamp a loose case or file a fully stamped loose case in Chain',()=>{
        const {sim}=fixture('chain-of-custody');
        sim.caseBody.position.set(130,1.3,-29);sim.caseBody.velocity.set(0,0,-30);frames(sim,12);
        expect(sim.assignmentState!.stamps).toBe(0);
        sim.assignmentState!.stamps=5;sim.caseBody.position.set(-16,1.3,-34);sim.caseBody.velocity.set(0,0,-30);frames(sim,12,NOW+1000);
        expect(sim.assignmentState!.result).toBeUndefined();
    });
    it.each([true,false])('uses possession at a real projectile kill, held at impact=%s',heldAtImpact=>{
        const {sim,a,b}=fixture('excessive-force');Object.assign(b,{x:-16,y:.3,z:-30,hp:1});
        if(!heldAtImpact)pickup(sim,a,-30,-15);
        sim.shoot(a.id,{shotId:'delayed-kill',origin:{x:-16,y:1.2,z:-15},direction:{x:0,y:0,z:-1}});
        expect(sim.snapshot(false).shots).toHaveLength(1);expect(a.kills).toBe(0);
        if(heldAtImpact)pickup(sim,a,-30,-15);else {sim.release(a.id);sim.caseBody.position.set(50,2,50);}
        frames(sim,40);
        expect(a.kills).toBe(1);expect(b.hp).toBe(0);
        expect(sim.assignmentState!.caseKills.a??0).toBe(heldAtImpact?1:0);
    });
    it('retains case kills after a real disarm, death and reacquisition',()=>{
        const {sim,a,b}=fixture('excessive-force');pickup(sim,a,-16,-30);sim.creditCaseKill(a.id);
        const p=sim.caseBody.position;
        sim.shoot(b.id,{shotId:'disarm',origin:{x:p.x,y:p.y,z:p.z+1.5},direction:{x:0,y:0,z:-1}});
        frames(sim,1);expect(sim.caseHolderId).toBeNull();expect(sim.creditCaseKill(a.id)).toBe(false);
        a.hp=0;sim.death(a,{x:1,y:0,z:0},b.id);expect(sim.assignmentState!.caseKills.a).toBe(1);
        a.hp=3;pickup(sim,a,-30,-15,NOW+5000);expect(sim.creditCaseKill(a.id)).toBe(true);
        expect(sim.assignmentState!.caseKills.a).toBe(2);
    });
    it('a carried or missile case entering the old intake cannot win Excessive Force',()=>{
        const {sim,a,b}=fixture('excessive-force');pickup(sim,a,-16,-30);carriedEntry(sim,a,'records',NOW+1);
        expect(sim.assignmentState!.result).toBeUndefined();sim.release(a.id);Object.assign(a,{x:100,z:100});
        sim.caseBody.position.set(-16,1.3,-31);sim.caseBody.velocity.setZero();
        sim.shoot(b.id,{shotId:'old-filing',origin:{x:-16,y:1.3,z:-29},direction:{x:0,y:0,z:-1}});frames(sim,45,NOW+10);
        expect(sim.assignmentState!.result).toBeUndefined();expect(sim.assignmentState!.caseKills).toEqual({});
    });
    it('restoring held processing or expired Tampering never credits time while the room was asleep',()=>{
        const {sim,a}=fixture('closing-time');pickup(sim,a,-16,-30);frames(sim,60);
        const saved=sim.snapshot(false),remaining=saved.assignment!.remainingMs;
        vi.mocked(Date.now).mockReturnValue(NOW+60_000);
        const restored=fixture('closing-time',saved);restored.sim.step(0,NOW+60_000);
        expect(restored.sim.assignmentState!.remainingMs).toBe(remaining);
        saved.assignment!.phase='suspended';saved.dispatch={phase:'active',incident:'evidence-tampering',serial:1,started:NOW,until:NOW+25_000};
        saved.case.owner=null;saved.case.p={x:-16,y:1.3,z:-37};
        const expired=fixture('closing-time',saved);expired.sim.step(0,NOW+60_000);
        expect(expired.sim.assignmentState).toMatchObject({phase:'active',remainingMs:remaining});
        expect(expired.sim.snapshot(false).extraCases).toHaveLength(0);
    });
    it('pauses at actual Tampering activation, keeps eight hazards and restores progress outside the intake',()=>{
        const initial=fixture('chain-of-custody');initial.sim.assignmentState!.stamps=5;
        const saved=initial.sim.snapshot(false);saved.dispatch={phase:'rolling',incident:'evidence-tampering',serial:1,started:NOW,until:NOW+100};
        const {sim}=fixture('chain-of-custody',saved);
        sim.step(0,NOW+99);expect(sim.assignmentState!.phase).toBe('active');
        sim.step(0,NOW+100);expect(sim.assignmentState!.phase).toBe('suspended');expect(sim.snapshot(false).extraCases).toHaveLength(7);
        sim.caseBody.position.set(-16,1.3,-45);sim.caseBody.velocity.setZero();
        sim.step(0,NOW+100+CHAOS_TUNING.activeMs);
        expect(sim.assignmentState).toMatchObject({phase:'active',stamps:5});expect(sim.assignmentState!.result).toBeUndefined();
        expect(sim.snapshot(false).extraCases).toEqual([]);expect(sim.caseBody.position.z).toBeGreaterThan(-33);
    });
    it.each(CHAIN_ROUTE)('Tampering expiry cannot award an edge-overlapping %s case to a waiting carrier',id=>{
        const initial=fixture('chain-of-custody');initial.sim.assignmentState!.destinations=[...CHAIN_ROUTE.filter(d=>d!==id),id];
        initial.sim.assignmentState!.stamps=5;
        const saved=initial.sim.snapshot(false);saved.dispatch={phase:'rolling',incident:'evidence-tampering',serial:1,started:NOW,until:NOW+100};
        const {sim,a}=fixture('chain-of-custody',saved);sim.step(0,NOW+100);
        const b=ASSIGNMENT_DESTINATIONS[id].bounds,inside=destinationPoint(id,false);
        Object.assign(a,{x:b.xmin+.15,y:inside.y,z:ASSIGNMENT_DESTINATIONS[id].center.z});
        sim.caseBody.position.set(b.xmin-.1,inside.y+.9,a.z);sim.caseBody.velocity.setZero();
        expect(destinationContains(id,sim.caseBody.position)).toBe(false);
        sim.step(0,NOW+100+CHAOS_TUNING.activeMs);
        expect(sim.assignmentState).toMatchObject({phase:'active',stamps:5});expect(sim.assignmentState!.result).toBeUndefined();
        expect(sim.caseHolderId).toBeNull();expect(sim.caseBody.position.x).toBeCloseTo(destinationPoint(id).x);
        const at=NOW+200+CHAOS_TUNING.activeMs,outside=destinationPoint(id);
        Object.assign(a,outside);sim.caseBody.position.set(outside.x,outside.y+.8,outside.z);sim.step(0,at);
        expect(sim.caseHolderId).toBe(a.id);carriedEntry(sim,a,id,at+10);
        expect(sim.assignmentState!.result?.winnerId).toBe(a.id);
    });
    it('counts the held portion before activation and never counts the incident interval',()=>{
        const initial=fixture('closing-time');pickup(initial.sim,initial.a,-16,-30);
        const saved=initial.sim.snapshot(false);saved.dispatch={phase:'rolling',incident:'evidence-tampering',serial:1,started:NOW,until:NOW+10};
        const {sim}=fixture('closing-time',saved);
        sim.step(.02,NOW+20);
        expect(sim.assignmentState!.remainingMs).toBe(119_990);expect(sim.caseHolderId).toBeNull();
        frames(sim,5,NOW+20);expect(sim.assignmentState!.remainingMs).toBe(119_990);
    });
    it('recovery preserves investigation progress, retains case kills, and cannot finish',()=>{
        for(const id of ['closing-time','chain-of-custody','excessive-force'] as const){
            const {sim}=fixture(id);
            if(id==='closing-time')sim.assignmentState!.remainingMs=100;
            if(id==='chain-of-custody')sim.assignmentState!.stamps=5;
            if(id==='excessive-force')sim.assignmentState!.caseKills.b=4;
            const before={points:structuredClone(sim.assignmentState!.caseKills),remaining:sim.assignmentState!.remainingMs,stamps:sim.assignmentState!.stamps};
            expect(sim.recoverLooseCase()).toBe(true);sim.step(0,NOW+CHAOS_TUNING.recoverMs);
            expect(sim.assignmentState).toMatchObject({remainingMs:before.remaining,stamps:before.stamps,caseKills:before.points});
            expect(sim.assignmentState!.result).toBeUndefined();
        }
    });
    it('reset clears case kills, shots, corpses and objective identity',()=>{
        const {sim,a}=fixture('excessive-force');sim.assignmentState!.caseKills.a=4;a.hp=0;sim.death(a,{x:1,y:0,z:0});
        const old=sim.assignmentState!.roundId;sim.reset();sim.setAssignment(createAssignment('closing-time',NOW+100));
        frames(sim,5,NOW+100);
        const state=sim.snapshot(false);expect(state.assignment!.roundId).not.toBe(old);
        expect(state.shots).toEqual([]);expect(state.corpses).toEqual([]);expect(state.assignment!.caseKills).toEqual({});expect(state.assignment!.result).toBeUndefined();
    });
});

it('suspends all Excessive Force scoring during eight-case Tampering and resumes the retained score',()=>{
    const initial=fixture('excessive-force');pickup(initial.sim,initial.a,-16,-30);initial.sim.creditCaseKill('a');
    const saved=initial.sim.snapshot(false);saved.dispatch={phase:'rolling',incident:'evidence-tampering',serial:1,started:NOW,until:NOW+100};
    const {sim,a}=fixture('excessive-force',saved);sim.step(0,NOW+100);
    expect(sim.caseHolderId).toBeNull();expect(sim.snapshot(false).extraCases).toHaveLength(7);
    expect(sim.creditCaseKill('a')).toBe(false);expect(sim.assignmentState!.caseKills).toEqual({a:1});
    sim.caseBody.position.set(-16,1.3,-37);sim.step(0,NOW+100+CHAOS_TUNING.activeMs);
    expect(sim.assignmentState).toMatchObject({id:'excessive-force',phase:'active',caseKills:{a:1}});
    expect(sim.assignmentState!.result).toBeUndefined();expect(sim.snapshot(false).extraCases).toEqual([]);
    pickup(sim,a,-30,-15,NOW+500+CHAOS_TUNING.activeMs);sim.creditCaseKill('a');
    expect(sim.assignmentState!.caseKills.a).toBe(2);
});

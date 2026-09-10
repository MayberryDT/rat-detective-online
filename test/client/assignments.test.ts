import { describe, expect, it } from 'vitest';
import { AssignmentRules } from '../../src/shared/AssignmentRules';
import { ASSIGNMENT_IDS, ASSIGNMENT_TUNING, CHAIN_ROUTE, destinationPoint, destinationContains, ASSIGNMENT_DESTINATIONS, createAssignment, nextAssignment, parseAssignment, restoreAssignment, type AssignmentId, type AssignmentRotation } from '../../src/shared/assignments';
import { applyHit, createPlayer } from '../../src/worker/gameState';
import { ChaosEncoder, ChaosDecoder } from '../../src/shared/chaosWire';
import { ChaosSimulation } from '../../src/shared/ChaosSimulation';
import { parseServerMessage } from '../../src/shared/messageValidation';

const appearance={hatType:'fedora' as const,hatColor:1,coatColor:2,furColor:3};
function fixture(id:AssignmentId){
    const first=createPlayer('a','Inspector Brie',appearance,{x:0,y:0,z:0});
    const second=createPlayer('b','Detective Rind',appearance,{x:10,y:0,z:0});
    const players=new Map([first,second].map(p=>[p.id,p]));
    const state=createAssignment(id,0);state.liveAt=0;state.phase='active';
    return {first,second,players,state,rules:new AssignmentRules(state,players)};
}
describe('Dispatch assignment rules',()=>{
    it('plays each assignment once per shuffled cycle, without a boundary repeat',()=>{
        for(const rng of [()=>0,()=>.5,()=>.999999]){
            const bag:AssignmentRotation={remaining:[]};
            const sequence=Array.from({length:18},()=>nextAssignment(bag,rng));
            for(let i=0;i<sequence.length;i+=3)expect(new Set(sequence.slice(i,i+3))).toEqual(new Set(ASSIGNMENT_IDS));
            for(let i=1;i<sequence.length;i++)expect(sequence[i]).not.toBe(sequence[i-1]);
        }
    });
    it('restores a partially consumed cycle and permits explicit repeated selection',()=>{
        const bag:AssignmentRotation={remaining:[]};nextAssignment(bag,()=>.1);
        const restored=JSON.parse(JSON.stringify(bag)) as AssignmentRotation;
        expect(nextAssignment(restored)).toBe(bag.remaining[0]);
        restored.forced='closing-time';
        expect(nextAssignment(restored)).toBe('closing-time');expect(nextAssignment(restored)).toBe('closing-time');
        delete restored.forced;restored.remaining=[];
        expect(nextAssignment(restored,()=>.9)).not.toBe('closing-time');
    });
    it('counts only living held time and keeps the final instant available to a thief',()=>{
        const {rules,state,first,second}=fixture('closing-time');
        rules.advance(0,119_999,first.id);expect(state.remainingMs).toBe(1);
        rules.advance(119_999,130_000,null);expect(state.remainingMs).toBe(1);
        first.hp=0;rules.advance(130_000,140_000,first.id);expect(state.remainingMs).toBe(1);
        rules.advance(140_000,140_001,second.id);
        expect(state.result).toMatchObject({winnerId:second.id,at:140_001,method:'held'});
        rules.advance(140_001,150_000,first.id);expect(state.result?.winnerId).toBe(second.id);
    });
    it('does not count briefing, suspended time, or time without a participant',()=>{
        const {rules,state}=fixture('closing-time');state.liveAt=2400;
        rules.setPhase(0,false);rules.advance(0,2400,'a');expect(state.remainingMs).toBe(ASSIGNMENT_TUNING.processingMs);
        rules.setPhase(2400,false);rules.advance(2400,3400,'a');
        rules.setPhase(3400,true);rules.advance(3400,30_000,'a');expect(state.remainingMs).toBe(119_000);
        rules.setPhase(30_000,false);rules.advance(30_000,31_000,'disconnected');expect(state.remainingMs).toBe(119_000);
    });
    it('keeps the shuffled route through theft and accepts a zero-kill final carrier',()=>{
        const {rules,state}=fixture('chain-of-custody'),route=[...state.destinations];
        expect(rules.visit('a',destinationPoint(route[1],false),1)).toBe('none');
        for(let i=0;i<route.length;i++){
            const point=destinationPoint(route[i],false);
            expect(rules.visit(null,point,2+i*3)).toBe('carry-required');
            rules.setPhase(3+i*3,true);expect(rules.visit('a',point,3+i*3)).toBe('none');
            rules.setPhase(4+i*3,false);
            expect(rules.visit(i===route.length-1?'b':'a',point,4+i*3)).toBe(i===route.length-1?'closed':'verified');
            expect(state.stamps).toBe(i+1);expect(state.destinations).toEqual(route);
            expect(rules.visit('a',point,5+i*3)).toBe('none');
        }
        expect(state.result?.winnerId).toBe('b');
    });
    it('requires a living carrier inside every landmark, including the final stop',()=>{
        const {rules,state,first}=fixture('chain-of-custody');first.hp=0;
        for(let i=0;i<state.destinations.length;i++){
            state.stamps=i;expect(rules.visit('a',destinationPoint(state.destinations[i],false),10)).toBe('carry-required');
        }
        expect(state.result).toBeUndefined();
    });
    it('shuffles all six unique landmarks, including the last, and preserves the order on decode/restore',()=>{
        const orders=new Set<string>(),finals=new Set<string>();
        let seed=123;
        const rng=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
        for(let i=0;i<100;i++){
            const state=createAssignment('chain-of-custody',0,`round-${i}`,rng);
            expect(new Set(state.destinations)).toEqual(new Set(CHAIN_ROUTE));
            expect(parseAssignment(state)).toEqual(state);expect(restoreAssignment(state,5000)).toEqual(state);
            orders.add(state.destinations.join(','));finals.add(state.destinations.at(-1)!);
        }
        expect(orders.size).toBeGreaterThan(70);expect(finals.size).toBe(6);
        const state=createAssignment('chain-of-custody',0);
        expect(parseAssignment({...state,destinations:[...state.destinations.slice(0,5),state.destinations[0]]})).toBeNull();
        expect(parseAssignment({...state,destinations:[...state.destinations.slice(0,5),'unknown']})).toBeNull();
    });
    it('scores exactly once at kill resolution, retains personal progress through death and theft',()=>{
        const {rules,state,first}=fixture('excessive-force');
        // A launched attack has no objective effect: only its attributed kill matters.
        expect(rules.kill('a',null,1)).toBe(false);
        expect(rules.kill('a','a',2)).toBe(true);expect(state.caseKills.a).toBe(1);
        first.hp=0;expect(rules.kill('a','a',3)).toBe(false);
        first.hp=3;expect(rules.kill('a','b',4)).toBe(false);
        rules.kill('b','b',5);rules.kill('a','a',6);
        expect(state.caseKills).toEqual({a:2,b:1});
        for(let i=0;i<8;i++)rules.kill('a','a',7+i);
        expect(state.result).toMatchObject({winnerId:'a',method:'kills',posthumous:false});
        expect(rules.kill('b','b',20)).toBe(false);expect(state.caseKills.a).toBe(10);
    });
    it('suspends case kills without banking incident kills or awarding a cleanup point',()=>{
        const {rules,state}=fixture('excessive-force');rules.kill('a','a',1);rules.setPhase(2,true);
        expect(rules.kill('a','a',3)).toBe(false);rules.setPhase(4,false);
        expect(state.caseKills).toEqual({a:1});expect(state.result).toBeUndefined();
        expect(rules.visit('a',destinationPoint('records',false),5)).toBe('none');
        expect(rules.visit(null,destinationPoint('records',false),6)).toBe('none');
        rules.kill('a','a',7);expect(state.caseKills.a).toBe(2);
    });
    it('records actual kills and never ends an assignment at the legacy kill limit',()=>{
        const {first,second,players}=fixture('closing-time');first.kills=19;
        const result=applyHit(players,first.id,second.id,3,false,first.id,true);
        expect(result).toMatchObject({killed:true,roundWon:false});expect(first.kills).toBe(20);
    });
    it('counts the whole interior at any entrance or floor, but excludes roofs, exterior and wrong layers',()=>{
        for(const id of CHAIN_ROUTE){
            const b=ASSIGNMENT_DESTINATIONS[id].bounds;
            for(const x of [b.xmin+.1,b.xmax-.1])for(const z of [b.zmin+.1,b.zmax-.1]){
                expect(destinationContains(id,{x,y:b.ymin+.3,z})).toBe(true);
                expect(destinationContains(id,{x,y:b.ymax-.1,z})).toBe(true);
            }
            const p=destinationPoint(id,false);
            expect(destinationContains(id,p)).toBe(true);
            for(const bad of [{...p,x:b.xmin-1},{...p,z:b.zmax+1},{...p,y:b.ymax},{...p,y:b.ymin-1},{...p,x:Infinity},{...p,z:NaN}])expect(destinationContains(id,bad)).toBe(false);
        }
        expect(destinationContains('maintenance',{x:65,y:.3,z:-36})).toBe(false);
        expect(destinationContains('records',{x:-16,y:-6.7,z:-59})).toBe(false);
    });
    it('validates objective variants and strips unrelated state',()=>{
        const {state}=fixture('excessive-force');
        expect(parseAssignment({...state,unexpected:'discard'})).toEqual(state);
        for(const bad of [{remainingMs:Infinity},{stamps:3},{destinations:['records-intake','records-intake']},{phase:'closed'},{caseKills:{a:11}},{caseKills:{a:-1}},{caseKills:{a:NaN}},{caseKills:{a:10}},{id:'misfiled-evidence'},{id:'deathmatch'}])expect(parseAssignment({...state,...bad})).toBeNull();
    });
    it('upgrades only persisted old assignments and preserves already accumulated held time',()=>{
        const {caseKills:_,...old}=createAssignment('closing-time',0);
        const legacy={...old,phase:'active',remainingMs:40_000,claimant:null};
        expect(parseAssignment(legacy)).toBeNull();
        expect(restoreAssignment(legacy,5000)).toMatchObject({id:'closing-time',remainingMs:115_000,caseKills:{}});
        expect(restoreAssignment({...legacy,id:'misfiled-evidence',remainingMs:0},5000)).toMatchObject({id:'excessive-force',phase:'briefing',caseKills:{},destinations:[]});
    });
    it('round-trips every assignment over both compact modes and ordinary snapshots',()=>{
        const sim=new ChaosSimulation(new Map(),()=>{});
        for(const id of ASSIGNMENT_IDS){
            const {state}=fixture(id);sim.setAssignment(state);
            const snapshot=sim.snapshot(false);
            expect(parseServerMessage({type:'chaos',state:snapshot})).toMatchObject({state:{assignment:state}});
            for(const delta of [false,true]){
                const encoder=new ChaosEncoder('assignment-wire',delta),decoder=new ChaosDecoder();
                expect(decoder.read(encoder.encode(snapshot).payload)?.message).toMatchObject({state:{assignment:state}});
                delete snapshot.assignment;
                expect(decoder.read(encoder.encode(snapshot).payload)?.message).toMatchObject({type:'chaos'});
                const decoded=decoder.read(encoder.encode(snapshot).payload)?.message;
                if(decoded?.type==='chaos')expect(decoded.state.assignment).toBeUndefined();
                snapshot.assignment=state;
            }
        }
    });
});

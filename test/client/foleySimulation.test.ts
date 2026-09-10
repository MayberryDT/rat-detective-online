import {expect,it,vi} from 'vitest';
import * as C from 'cannon-es';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {ChaosEncoder,ChaosDecoder} from '../../src/shared/chaosWire';
import {parseServerMessage} from '../../src/shared/messageValidation';
import {createPlayer} from '../../src/worker/gameState';
import {WORLD_FOLEY_CUES} from '../../src/shared/foleyEvents';
import {MAX_SERVER_MESSAGE_BYTES} from '../../src/shared/networkProtocol';
import {BALL_SPEED} from '../../src/shared/ballTuning';
vi.mock('../../src/shared/grayboxLayout',()=>({CITY_BOUNDS:{min:-196,max:166},grayboxBoxes:()=>[
    {x:0,y:-.5,z:0,w:50,h:1,d:50,rx:0,rz:0},
    {x:10,y:10,z:0,w:1,h:20,d:50,rx:0,rz:0},
]}));
function fixture(){
    const appearance={hatType:'fedora' as const,hatColor:1,furColor:2,coatColor:3};
    const players=new Map(['a','b'].map((id,i)=>[id,createPlayer(id,id,appearance,{x:-40+i*3,y:0,z:0})]));
    const hit=vi.fn(),sim=new ChaosSimulation(players,hit);const now=Date.now();sim.step(0,now);
    return {sim,players,hit,now};
}
it('emits real case floor contacts without changing the physical bounce or health',()=>{
    const {sim,hit,now}=fixture();sim.caseBody.position.set(0,4,0);sim.caseBody.velocity.set(1,-10,0);
    const events=[];let bounced=false;
    for(let i=1;i<=40;i++){sim.step(1/60,now+i*1000/60);bounced ||= sim.caseBody.velocity.y>1;events.push(...sim.snapshot().impacts);}
    expect(bounced).toBe(true);expect(events.some(e=>e.foley==='case-bounce'&&e.audioOnly&&e.energy!>2)).toBe(true);expect(hit).not.toHaveBeenCalled();
});
it('emits shared corpse contacts and shot kicks, retains shooter attribution and finite motion',()=>{
    const {sim,players,now}=fixture();const victim=players.get('b')!;victim.x=0;victim.y=4;victim.hp=0;
    sim.death(victim,{x:0,y:-1,z:0},'a');const body=[...sim.targets].find(([,t])=>t.kind==='corpse')![0];
    const events=[];
    for(let i=1;i<=30;i++){sim.step(1/60,now+i*1000/60);events.push(...sim.snapshot().impacts);}
    expect(events.some(e=>e.foley==='corpse-bounce')).toBe(true);expect(Number.isFinite(body.position.y)).toBe(true);
    expect(sim.snapshot(false).corpses[0].owner).toBe('a');
    body.position.set(0,4,0);body.velocity.setZero();body.angularVelocity.setZero();body.quaternion.set(0,0,0,1);
    sim.shoot('a',{shotId:'kick',origin:{x:-2,y:4,z:0},direction:{x:1,y:0,z:0}});sim.step(.01,now+600);
    expect(sim.snapshot().impacts.some(e=>e.foley==='corpse-kick')).toBe(true);
});
it.each(['big-cheese','crossfire','ricochet-racket','delayed-reaction'] as const)('marks %s events while retaining normal speed and incident physics',incident=>{
    const {sim:initial,players,now}=fixture(),saved=initial.snapshot();saved.dispatch={phase:'active',incident,serial:1,started:now,until:now+25000};
    const sim=new ChaosSimulation(players,()=>{},saved);
    sim.shoot('a',{shotId:'event',origin:{x:8,y:4,z:0},direction:{x:1,y:0,z:0}});
    expect(sim.snapshot(false).shots[0].v.x).toBe(BALL_SPEED);sim.step(.015,now+15);
    const state=sim.snapshot();
    if(incident==='delayed-reaction'){
        expect(state.impacts.some(i=>i.cue==='thud')).toBe(true);sim.step(.001,now+1500);expect(sim.snapshot().impacts.some(i=>i.foley==='unstick')).toBe(true);
    }else expect(state.impacts.some(i=>i.foley===({'big-cheese':'grow',crossfire:'charge','ricochet-racket':'split'} as const)[incident])).toBe(true);
});
it('validates every additive sound annotation through full and compact frames and rejects malformed data',()=>{
    const {sim}=fixture(),state=sim.snapshot();
    state.impacts=WORLD_FOLEY_CUES.map(foley=>({p:{x:1,y:2,z:3},n:{x:0,y:1,z:0},surface:false,foley,audioOnly:true,energy:45}));
    expect(parseServerMessage({type:'chaos',state})).not.toBeNull();
    const {payload}=new ChaosEncoder().encode(state),decoded=new ChaosDecoder().read(payload);
    expect(decoded?.message.type==='chaos'&&decoded.message.state.impacts).toEqual(state.impacts);
    for(const fields of [{foley:'invented'},{energy:NaN},{energy:301},{energy:-1},{audioOnly:'yes'}]){
        const bad=structuredClone(state);Object.assign(bad.impacts[0],fields);expect(parseServerMessage({type:'chaos',state:bad})).toBeNull();
    }
});
it('reserves the existing 64-impact budget for visual cues and drains cosmetic events',()=>{
    const {sim}=fixture();const internals=sim as any;
    internals.impacts=Array.from({length:64},()=>({p:{x:0,y:0,z:0},n:{x:0,y:1,z:0},surface:true,cue:'pop'}));
    for(let i=0;i<100;i++)internals.sound('burst',new C.Vec3(i,0,0));
    expect(internals.audioImpacts).toHaveLength(16);const state=sim.snapshot();
    expect(state.impacts).toHaveLength(64);expect(state.impacts.every(e=>e.cue==='pop')).toBe(true);expect(sim.snapshot().impacts).toHaveLength(0);
    state.shots=Array.from({length:256},(_,i)=>({id:'shot-'+i,owner:'a',p:{x:100,y:20,z:100},v:{x:175,y:-25,z:0},age:2}));
    const payload=new ChaosEncoder().encode(state).payload;expect(new TextEncoder().encode(payload).byteLength).toBeLessThan(MAX_SERVER_MESSAGE_BYTES);expect(new ChaosDecoder().read(payload)).not.toBeNull();
});

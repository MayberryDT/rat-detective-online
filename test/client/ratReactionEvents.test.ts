import {expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {RatReactionEvents} from '../../src/prototype/RatReactionEvents';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import type {RatEntity} from '../../src/entities/RatEntity';
import {createAssignment} from '../../src/shared/assignments';

function setup(){
    const one={dead:false,hp:3,mesh:{position:new THREE.Vector3()},playReaction:vi.fn()} as unknown as RatEntity;
    const two={dead:false,hp:3,mesh:{position:new THREE.Vector3(10,0,0)},playReaction:vi.fn()} as unknown as RatEntity;
    const events=new RatReactionEvents(id=>id==='one'?one:id==='two'?two:undefined);
    const state=new ChaosSimulation(new Map(),()=>{}).snapshot(false);
    state.time=1000;state.tick=1;state.epoch='test';state.case.owner=null;
    state.assignment=createAssignment('chain-of-custody',0,'round');events.apply(state);
    const next=()=>{state.time+=33;state.tick!++;events.apply(state);};
    return {one,two,events,state,next};
}
it('reacts only to confirmed ownership transitions and prefers delivery over a loss reaction',()=>{
    const {one,two,state,next,events}=setup();
    state.case.owner='one';next();expect(one.playReaction).toHaveBeenCalledExactlyOnceWith('case-pickup');
    events.apply(state);expect(one.playReaction).toHaveBeenCalledTimes(1);
    state.case.owner='two';next();expect(one.playReaction).toHaveBeenLastCalledWith('case-loss');
    expect(two.playReaction).toHaveBeenCalledExactlyOnceWith('case-pickup');
    state.case.owner=null;state.assignment!.deliverySerial=1;
    state.assignment!.lastDelivery={playerId:'two',playerName:'Two',at:state.time};next();
    expect(two.playReaction).toHaveBeenCalledTimes(2);expect(two.playReaction).toHaveBeenLastCalledWith('delivery');
});
it('does not replay historical reactions after reconnect, epoch/round change, death or a duplicate launch',()=>{
    const {one,state,next,events}=setup();
    state.pressure={serial:1,until:5000,launches:[{id:'launch',playerId:'one',at:1000,velocity:{x:0,y:90,z:0}}]};
    next();next();expect(one.playReaction).toHaveBeenCalledExactlyOnceWith('launch');
    state.time+=2000;state.case.owner='one';next();expect(one.playReaction).toHaveBeenCalledTimes(1);
    events.reset();next();expect(one.playReaction).toHaveBeenCalledTimes(1);
    state.epoch='new';state.case.owner=null;next();expect(one.playReaction).toHaveBeenCalledTimes(1);
    state.case.owner='one';one.dead=true;next();expect(one.playReaction).toHaveBeenCalledTimes(1);
});
it('targets exact reflected-shot outcomes and suppresses duplicates and ambiguous broadcast contacts',()=>{
    const {one,two,state,next,events}=setup();
    const outcome={type:'shotResult' as const,shotId:'s',ballId:'s',outcome:'ironclad-reflect' as const,at:1033,tick:2,epoch:'test',victimId:'one'};
    events.shotResult(outcome);events.shotResult(outcome);
    expect(one.playReaction).toHaveBeenCalledExactlyOnceWith('reflect');
    state.buffs={one:{ironcladUntil:5000},two:{ironcladUntil:5000}};
    state.impacts=[{p:{x:0,y:1,z:0},n:{x:1,y:0,z:0},surface:false,cue:'armor-clang'}];
    next();expect(one.playReaction).toHaveBeenCalledTimes(2);
    two.mesh.position.set(0,0,0);next();expect(one.playReaction).toHaveBeenCalledTimes(2);expect(two.playReaction).not.toHaveBeenCalled();
});

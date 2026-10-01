import {describe,expect,it} from 'vitest';
import {Cast,CAST,completeAnswer} from '../../src/shared/bots/cast';
import {seededRandom} from '../../src/shared/bots/random';
import type {Goal,GoalScores,MindAnswer,Personality} from '../../src/shared/bots/intent';

const code=(scores:GoalScores):MindAnswer=>({source:'code',scores});
const jev=(scores:GoalScores):MindAnswer=>({source:'jev',scores});
const never=()=>{throw new Error('a deliberate code cast must not sample');};

function shares(personality:Personality,scores:GoalScores,seed:number,n=4000):Partial<Record<Goal,number>> {
    const cast=new Cast(seededRandom(seed)),offered=Object.keys(scores) as Goal[],counts:Partial<Record<Goal,number>>={};
    for(let i=0;i<n;i++){const first=cast.rank(personality,code(scores),offered,i*300,'event').ranked[0];counts[first]=(counts[first]??0)+1;}
    for(const goal of offered)counts[goal]=(counts[goal]??0)/n;
    return counts;
}

describe('the cast',()=>{
    it('ranks a code answer by score alone for a bot with no archetype: no randomness, no hysteresis',()=>{
        const cast=new Cast(never),offered:Goal[]=['take-case','hunt','roam'];
        expect(cast.rank(undefined,code({'take-case':3,hunt:4,roam:1}),offered,0,'beat')).toEqual({ranked:['hunt','take-case','roam'],weighted:{'take-case':3,hunt:4,roam:1}});
        cast.took('hunt');
        // A code answer switches the moment another goal leads, even by a hair and on a beat.
        expect(cast.rank(undefined,code({'take-case':4.01,hunt:4,roam:1}),offered,200,'beat').ranked[0]).toBe('take-case');
        // Ties keep the offered order.
        expect(cast.rank(undefined,code({'take-case':2,hunt:2,roam:2}),offered,400,'beat').ranked).toEqual(offered);
        // A camper is deliberate too: its weighted best, never a draw.
        expect(cast.rank('camper',code({'take-case':3,hunt:3.3,roam:1}),offered,600,'beat').ranked[0]).toBe('take-case');
    });

    it('lets snipers and gremlins sample: usually the best goal, sometimes another, never a senseless one',()=>{
        const scores:GoalScores={'take-case':4,hunt:3,ambush:2,mischief:2,roam:1,flee:0};
        const sniper=shares('sniper',scores,1),gremlin=shares('gremlin',scores,2);
        for(const share of [sniper,gremlin]){
            expect(share.flee).toBe(0);
            for(const goal of ['take-case','hunt','ambush','mischief','roam'] as const)expect(share[goal]).toBeGreaterThan(0);
        }
        expect(sniper['take-case']).toBeGreaterThan(.4);expect(sniper['take-case']).toBeLessThan(.9);
        expect(sniper['take-case']).toBeGreaterThan(sniper.hunt!);
        // Each archetype leans its own way on the same answer.
        expect(sniper.ambush).toBeGreaterThan(gremlin.ambush!);
        expect(gremlin.mischief).toBeGreaterThan(sniper.mischief!);
        expect(gremlin.mischief).toBeGreaterThan(gremlin.ambush!);
    });

    it('samples the same way from the same seed',()=>{
        const run=()=>{const cast=new Cast(seededRandom(7));return Array.from({length:50},(_,i)=>cast.rank('gremlin',code({hunt:3,roam:2.5,mischief:2}),['hunt','roam','mischief'],i*300,'event').ranked[0]);};
        expect(run()).toEqual(run());
    });

    it('holds a sampled goal between beats and draws afresh on an event',()=>{
        const cast=new Cast(seededRandom(3)),offered:Goal[]=['take-case','roam'];
        cast.took('roam');cast.rank('hose',code({'take-case':4,roam:.5}),offered,0,'event');cast.took('roam');
        for(let now=100;now<CAST.commitMs;now+=250)expect(cast.rank('hose',code({'take-case':4,roam:.5}),offered,now,'beat').ranked[0]).toBe('roam');
        const redrawn=Array.from({length:40},(_,i)=>{cast.took('roam');return cast.rank('hose',code({'take-case':4,roam:.5}),offered,100+i,'event').ranked[0];});
        expect(redrawn).toContain('take-case');
    });

    it('keeps a deliberate Jev rat on its goal unless another wins by a clear margin or an event fires',()=>{
        const cast=new Cast(never),offered:Goal[]=['take-case','hunt','roam'];
        cast.rank(undefined,jev({hunt:2.5,'take-case':2,roam:1}),offered,0,'beat');cast.took('hunt');
        expect(cast.rank(undefined,jev({hunt:2.5,'take-case':2.5+CAST.margin*.8,roam:1}),offered,300,'beat').ranked[0]).toBe('hunt');
        expect(cast.rank(undefined,jev({hunt:2.5,'take-case':2.5+CAST.margin*.8,roam:1}),offered,600,'event').ranked[0]).toBe('take-case');
        cast.took('hunt');
        expect(cast.rank(undefined,jev({hunt:2.5,'take-case':2.5+CAST.margin*1.2,roam:1}),offered,900,'beat').ranked[0]).toBe('take-case');
        // A current goal that is no longer offered never holds.
        cast.took('hunt');
        expect(cast.rank(undefined,jev({'take-case':1,roam:2}),['take-case','roam'],1200,'beat').ranked[0]).toBe('roam');
    });

    it('fills what a mind left out with the code mind\'s scores, and ignores goals not offered',()=>{
        const offered:Goal[]=['take-case','hunt','roam'],coded=code({'take-case':4,hunt:3,roam:2});
        const partial=completeAnswer({source:'jev',scores:{hunt:4,heal:3},target:'r2'},offered,()=>coded);
        expect(partial).toMatchObject({source:'jev',target:'r2'});
        expect(partial.scores).toMatchObject({'take-case':4,hunt:4,roam:2});
        expect(new Cast(never).rank(undefined,partial,offered,0,'event').weighted).toEqual({'take-case':4,hunt:4,roam:2});
        // Nothing offered was scored (a stale answer): the code mind answers instead.
        expect(completeAnswer({source:'jev',scores:{heal:4},places:{flee:'flee:3'}},offered,()=>coded)).toBe(coded);
        expect(completeAnswer(undefined,offered,()=>coded)).toBe(coded);
    });
});

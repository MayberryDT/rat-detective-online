import {describe,expect,it} from 'vitest';
import {ARCHETYPE_SKILL,BASE_SKILL,PERSONALITIES} from '../../src/shared/bots/intent';

describe('archetype dials',()=>{
    it('are never sharper than the base tier',()=>{
        for(const archetype of PERSONALITIES){
            const skill=ARCHETYPE_SKILL[archetype];
            // No quicker to react or notice, no quicker to track; no steadier hand, no closer call up close, no faster
            // fire; and no truer lead (the share of a moving rat's lead applied, 1 being exact).
            for(const key of ['reactionMs','sideMs','rearMs','trackingMs'] as const)for(const i of [0,1])expect(skill[key][i],`${archetype} ${key}`).toBeGreaterThanOrEqual(BASE_SKILL[key][i]);
            for(const key of ['aimWanderRadians','flickError','pointBlankMiss','fireGapMs'] as const)expect(skill[key],`${archetype} ${key}`).toBeGreaterThanOrEqual(BASE_SKILL[key]);
            for(const i of [0,1])expect(Math.abs(1-skill.lead[i]),`${archetype} lead`).toBeGreaterThanOrEqual(Math.abs(1-BASE_SKILL.lead[i]));
        }
    });
});

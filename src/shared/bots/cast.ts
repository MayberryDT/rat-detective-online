import type {Goal,GoalScores,MindAnswer,Personality} from './intent';

/** Each personality's multipliers on a mind's goal scores (absent: 1). A multiplier never makes a senseless
 * (0) goal sensible, and the same answer serves every personality, so a personality costs no extra calls. */
export const CAST_WEIGHTS:Record<Personality,GoalScores>={
    tryhard:{},
    // Wins its own way: waits where the carrier must pass, and hunts (with bank shots, in the motor).
    maverick:{ambush:1.6,hunt:1.15},
    // Causes chaos: rings alarm pillars, wanders, fights, and cares less about holding the case.
    gremlin:{mischief:1.8,roam:1.25,hunt:1.1,'keep-case':.85},
};
/** Sampling temperature on weighted scores: one level ahead is picked about three times as often. How far
 * another goal must lead a Jev tryhard's current one to take over: one level of five. How long a sampled
 * goal holds between beats. */
export const CAST={temperature:.75,margin:1,commitMs:2500} as const;

/** A mind's answer made whole for the goals offered now. Offered goals it did not score take the code
 * mind's score; an answer that scored none of them (stale, or about another moment) gives way to the code
 * mind's answer entirely, as does no answer. */
export function completeAnswer(answer:MindAnswer|undefined,offered:readonly Goal[],code:()=>MindAnswer):MindAnswer {
    if(!answer||!offered.some(goal=>answer.scores[goal]!==undefined))return code();
    if(offered.every(goal=>answer.scores[goal]!==undefined))return answer;
    const fallback=code().scores,scores:GoalScores={...answer.scores};
    for(const goal of offered)scores[goal]??=fallback[goal];
    return {...answer,scores};
}

/** Between a mind's answer and the plan: weights the scores for the rat's personality and ranks the offered
 * goals, best first. A tryhard on the code mind takes the top score, exactly as the old priority ladder did.
 * A Jev tryhard keeps its goal until another leads by `margin` or an event fires. Mavericks and gremlins
 * sample from their weighted scores (a softmax), and hold a sample for `commitMs` unless an event fires. */
export class Cast {
    private goal?:Goal;
    private until=0;
    constructor(private readonly random:()=>number){}
    reset():void{this.goal=undefined;this.until=0;}
    /** The goal whose plan was taken: the one hysteresis and commitment hold on to. */
    took(goal:Goal):void{this.goal=goal;}

    rank(personality:Personality,answer:MindAnswer,offered:readonly Goal[],now:number,trigger:'beat'|'event'):{ranked:Goal[];weighted:GoalScores} {
        const weights=CAST_WEIGHTS[personality],weighted:GoalScores={};
        for(const goal of offered){const score=answer.scores[goal];if(score!==undefined)weighted[goal]=score*(weights[goal]??1);}
        const ranked=[...offered].sort((a,b)=>(weighted[b]??0)-(weighted[a]??0));
        if(personality==='tryhard'&&answer.source==='code')return {ranked,weighted};
        const current=this.goal&&trigger==='beat'&&offered.includes(this.goal)?this.goal:undefined;
        let first:Goal;
        if(personality==='tryhard')first=current&&(weighted[ranked[0]]??0)<=(weighted[current]??0)+CAST.margin?current:ranked[0];
        else if(current&&now<this.until)first=current;
        else {first=this.sample(ranked,weighted);this.until=now+CAST.commitMs;}
        return {ranked:[first,...ranked.filter(goal=>goal!==first)],weighted};
    }

    private sample(ranked:readonly Goal[],weighted:GoalScores):Goal {
        const sensible=ranked.filter(goal=>(weighted[goal]??0)>0),pool=sensible.length?sensible:ranked;
        const top=weighted[pool[0]]??0,odds=pool.map(goal=>Math.exp(((weighted[goal]??0)-top)/CAST.temperature));
        let roll=this.random()*odds.reduce((a,b)=>a+b,0);
        for(let i=0;i<pool.length;i++){roll-=odds[i];if(roll<0)return pool[i];}
        return pool[pool.length-1];
    }
}

import type {Goal,GoalScores,Mind,MindAnswer,Personality,Stance} from './intent';
import type {GoalContext} from './goals';

/** Where the plan each goal would make now stands on the old brain's priority ladder: supply trip, armour
 * trip, alarm pillar, case, intercept, carrier, zone, delivery, combat, explore. Flee and ambush were
 * never on it. Supplies close by are the pickup reflex's (goals.ts `REFLEX`), never a goal. */
function ladderRank(goal:Goal,ctx:GoalContext):number|undefined {
    switch(goal){
    case 'heal':return 0;
    case 'arm-up':return ctx.pickup&&ctx.pickup.kind!=='quick-fix'?0:1;
    case 'mischief':return 2;
    case 'take-case':return 3;
    case 'chase-carrier':return ctx.intercept?4:5;
    case 'keep-case':return ctx.zone?6:ctx.delivery?7:8;
    case 'hunt':return 10;
    case 'roam':return 11;
    default:return undefined;
    }
}
const LADDER_SCORES=[4,3,2,1.5];

/** Free and instant: the old priority ladder as goal scores. The ladder's choice scores 4, the next candidates
 * 3, 2, 1.5, then 1; goals off the ladder 0.5, so the argmax is always the old choice. */
export const codeMind={
    answer(ctx){
        const scores:GoalScores={};
        const ranked=ctx.offered.flatMap(goal=>{const rank=ladderRank(goal,ctx);return rank===undefined?[]:[{goal,rank}];}).sort((a,b)=>a.rank-b.rank);
        for(const goal of ctx.offered)scores[goal]=.5;
        ranked.forEach(({goal},i)=>{scores[goal]=LADDER_SCORES[i]??1;});
        return {source:'code',scores};
    },
} satisfies Mind<GoalContext> as {answer(ctx:GoalContext):MindAnswer};

/** Goals a steady rat keeps to rather than fighting rats on the way: the case, the zone, getting healed or armed,
 * getting away. Snipers, campers and a bot with no archetype are steady; hoses, joyriders and gremlins fight
 * whatever they are doing, except while keeping the case: every carrier keeps to it, so the case moves on. */
const FOCUSED:Partial<Record<Goal,true>>={'take-case':true,'keep-case':true,'hold-zone':true,heal:true,'arm-up':true,flee:true};
const STEADY:Partial<Record<Personality,true>>={sniper:true,camper:true};
/** The code mind's stance for a chosen goal, when the mind's answer gave none. */
export function codeStance(goal:Goal,personality:Personality|undefined):Stance {
    return goal==='keep-case'||goal==='hold-zone'||(!personality||STEADY[personality])&&FOCUSED[goal]?'focus':'fight';
}

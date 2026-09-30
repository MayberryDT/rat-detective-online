import type {Goal,GoalScores,Mind} from './intent';
import type {GoalContext} from './goals';

/** Where the plan each goal would make now stands on the old brain's priority ladder: on-route pickup,
 * armour trip, alarm pillar, case, intercept, carrier, zone, delivery, evade, combat, explore. Flee and
 * ambush were never on it. */
function ladderRank(goal:Goal,ctx:GoalContext):number|undefined {
    switch(goal){
    case 'heal':return 0;
    case 'arm-up':return ctx.pickup&&ctx.pickup.kind!=='quick-fix'?0:1;
    case 'mischief':return 2;
    case 'take-case':return 3;
    case 'chase-carrier':return ctx.intercept?4:5;
    case 'keep-case':return ctx.zone?6:ctx.delivery?7:ctx.escape?8:9;
    case 'hunt':return 10;
    case 'roam':return 11;
    default:return undefined;
    }
}
const LADDER_SCORES=[4,3,2,1.5];

/** Free and instant: the tryhard's old priority ladder as goal scores. The ladder's choice scores 4, the
 * next candidates 3, 2, 1.5, then 1; goals off the ladder 0.5, so the argmax is always the old choice. */
export const codeMind:Mind<GoalContext>={
    answer(ctx){
        const scores:GoalScores={};
        const ranked=ctx.offered.flatMap(goal=>{const rank=ladderRank(goal,ctx);return rank===undefined?[]:[{goal,rank}];}).sort((a,b)=>a.rank-b.rank);
        for(const goal of ctx.offered)scores[goal]=.5;
        ranked.forEach(({goal},i)=>{scores[goal]=LADDER_SCORES[i]??1;});
        return {source:'code',scores};
    },
};

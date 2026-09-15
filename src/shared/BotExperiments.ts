/** Maneuvers are the accepted public policy. Other variants are explicit
 * comparisons, selected only by the isolated hosted fixture. */
export type BotExperiment = 'baseline' | 'maneuvers' | 'commitment' | 'attention' | 'combined';
export const DEFAULT_BOT_EXPERIMENT:BotExperiment='maneuvers';

/** Resolve once per brain. Combined composes the tested policies without
 * changing assignment priorities, shared planner budgets or individual tuning. */
export function botBehaviors(experiment:BotExperiment){
    return {
        maneuvers:experiment==='maneuvers'||experiment==='combined',
        commitment:experiment==='commitment'||experiment==='combined',
        attention:experiment==='attention'||experiment==='combined',
    } as const;
}

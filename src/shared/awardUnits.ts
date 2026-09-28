import type {Award,AwardId} from './networkProtocol';

/** Suffix for an award's value on placards and the results board. */
const AWARD_UNITS:Record<AwardId,string>={'top-gun':'KILLS','most-cheesed':'HITS TAKEN','butterfingers':'DROPS','sewer-dweller':'SEC IN THE SEWER',
    'high-flier':'M HIGH','sharpshooter':'% ACCURACY','headhunter':'HEADSHOTS','long-shot':'M KILL','case-keeper':'SEC ON THE CASE',
    'frequent-flier':'FLIGHTS','supply-run':'PICKUPS','legwork':'M ON FOOT','dispatcher':'CALLS'};
/** An award's value with its unit, for placards and the Case File: `41% ACCURACY`, `4 HEADSHOTS`. */
export function awardValue(award:Pick<Award,'id'|'value'>):string {
    const unit=AWARD_UNITS[award.id];
    return `${award.value}${unit.startsWith('%')?'':' '}${unit}`;
}

/** Direct sight policy shared by objective observation and motor refresh. Evidence and memory have their own lifetimes. */
import type {ChaosState} from '../chaosState';
import {incidentInfo} from '../incidentCatalog';
import {FLASHLIGHT_REACH,FOG_REACH} from '../rat/ratBody';
export function botSight(state:ChaosState|undefined):{rats:number;looseCase:number} {
    const incident=state?.dispatch.phase==='active'?incidentInfo(state.dispatch.incident).id:undefined;
    const rats=incident==='blackout'?FLASHLIGHT_REACH:80;
    return {rats,looseCase:Math.min(60,rats,incident==='pea-souper'?FOG_REACH:Infinity)};
}

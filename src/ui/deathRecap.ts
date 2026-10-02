import type {EnvironmentCause,ServerMessage} from '../shared/networkProtocol';
import type {IncidentId} from '../shared/incidentCatalog';
import type {WeaponKind} from '../shared/pickups';

/** The death screen's recap: who got you and with what. */
export interface DeathRecap {killer:string;how:string}

const WEAPONS:Record<WeaponKind,string>={'tommy-gun':'TOMMY GUN',laser:'LASER',mousetrap:'MOUSETRAP'};
const CITY:Record<EnvironmentCause,string>={drowned:'DROWNED IN THE HARBOUR',meteor:'A CHEESE METEOR','evidence-tampering':'A RUNAWAY CASE'};
/** Incidents that change the cheese gun's ball; a special weapon replaces them. */
const SHOT_PATTERNS:Partial<Record<IncidentId,string>>={'big-cheese':'BIG CHEESE',scattershot:'SCATTERSHOT',crossfire:'RED-HOT RICOCHET','bad-ammunition':'BAD AMMUNITION'};

/** Who got you and with what, from your `playerDied` and the incident running when it came. */
export function deathRecap(death:Extract<ServerMessage,{type:'playerDied'}>,myId:string,incident?:IncidentId):DeathRecap {
    const killer=death.killerId===null?'THE CITY':death.killerId===myId?'YOURSELF':(death.killerName??'SOMEBODY').toUpperCase();
    const weapon=death.blast?'AN EXPLOSION':death.weapon?WEAPONS[death.weapon]:death.killerId===null&&death.cause?CITY[death.cause]
        :(incident&&SHOT_PATTERNS[incident])??'CHEESE GUN';
    return {killer,how:death.headshot?`${weapon} · HEADSHOT`:weapon};
}

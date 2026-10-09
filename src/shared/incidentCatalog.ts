/** Shared copy and stable IDs for authoritative Dispatch results. */
export const INCIDENTS = [
    {id:'improper-disposal',title:'Improper Disposal',description:'Dead rats become ricocheting corpse missiles and burst into cheese.'},
    {id:'pressure-surge',title:'Pressure Surge',description:'Every launcher fires at once. Mind your step.'},
    {id:'evidence-tampering',title:'Evidence Tampering',description:'Runaway case missiles! Dodge them or shoot them back.'},
    {id:'crossfire',title:'Crossfire',description:'Off the first wall the cheese catches fire and doubles its speed.'},
    {id:'scattershot',title:'Scattershot',description:'Every shot is a five-ball fan, and every ball knocks rats flying.'},
    {id:'blackout',title:'Blackout',description:'The power is out. Every rat has a flashlight.'},
    {id:'most-wanted',title:'Most Wanted',description:'Whoever is winning is in the searchlight. Take them down for a supply.'},
    {id:'all-units',title:'All Units',description:'The fallen respawn as backup, right beside the action.'},
] as const;
export type IncidentId = typeof INCIDENTS[number]['id'];
export const isIncidentId = (value: unknown): value is IncidentId => INCIDENTS.some(incident => incident.id === value);
/** Retired IDs that stored rooms may still hold; each maps to a live incident. */
export const LEGACY_INCIDENTS = {
    'kickback':'scattershot','after-hours-collection':'crossfire','return-to-sender':'crossfire',
    // Retired 1 October (protocol 27): stored rooms may still hold them.
    'delayed-reaction':'crossfire','clean-bill':'most-wanted','rat-race':'all-units','malpractice':'crossfire',
    'cheesequake':'crossfire','ricochet-racket':'scattershot','popcorn-panic':'scattershot',
    // Renamed after Tyler's playtest (1 October, "nothing about God"), then removed with Cheddar Shower and Big Cheese.
    'act-of-god':'crossfire',
    // Removed after the four-human playtest (1 October evening, protocol 28).
    'planted-evidence':'improper-disposal','bobbleheads':'crossfire',
    // Removed after the clarity playtest (2 October, protocol 29): its meteor bursts filled the ball cap (lag).
    'cheddar-shower':'crossfire',
    // Removed after the three-human playtest (2 October, protocol 31): one shot a second for everyone slowed play.
    'big-cheese':'crossfire',
    // Removed 9 October (protocol 41, Tyler: "I hate code violation ... everyone always complains about it").
    'code-violation':'crossfire',
    // Removed 9 October (Tyler: "bad ammunition's not good ... five different reworks ... none of them are good").
    'bad-ammunition':'crossfire',
} as const satisfies Record<string,IncidentId>;
export type LegacyIncidentId = keyof typeof LEGACY_INCIDENTS;
export const isLegacyIncidentId = (value: unknown): value is LegacyIncidentId => typeof value === 'string' && Object.prototype.hasOwnProperty.call(LEGACY_INCIDENTS, value);
/** Which Dispatch roster the room runs. The retired missile incident, Evidence Tampering,
 * stays available only behind the private classic mode toggle. */
export type EvidenceMode = 'standard' | 'classic';
export const isEvidenceMode = (value: unknown): value is EvidenceMode => value === 'standard' || value === 'classic';
/** Dispatch choices for a room (Evidence Tampering only in classic mode), limited to `only` when given. */
export function incidentRoster(mode: EvidenceMode = 'standard', only?: readonly IncidentId[]): typeof INCIDENTS[number][] {
    return INCIDENTS.filter(incident => (mode === 'classic' || incident.id !== 'evidence-tampering') && (!only?.length || only.includes(incident.id)));
}
/** A deploy's comma-separated incident allow-list (the `INCIDENTS` var, staging playtests only); unknown ids are dropped. */
export const parseIncidentList = (value?: string): IncidentId[] => (value ?? '').split(',').map(id => id.trim()).filter(isIncidentId);
export function incidentInfo(id?:IncidentId|LegacyIncidentId){
    const live=isLegacyIncidentId(id)?LEGACY_INCIDENTS[id]:id;
    // Old active snapshots only contained Improper Disposal.
    return INCIDENTS.find(incident=>incident.id===live)??INCIDENTS[0];
}

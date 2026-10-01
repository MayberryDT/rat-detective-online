/** Shared copy and stable IDs for authoritative Dispatch results. */
export const INCIDENTS = [
    {id:'improper-disposal',title:'Improper Disposal',description:'Dead rats become ricocheting corpse missiles and burst into cheese.'},
    {id:'bad-ammunition',title:'Bad Ammunition',description:'Every cartridge has a mind of its own. They still go roughly where you aim.'},
    {id:'pressure-surge',title:'Pressure Surge',description:'Every launcher fires at once. Mind your step.'},
    {id:'evidence-tampering',title:'Evidence Tampering',description:'Runaway case missiles! Dodge them or shoot them back.'},
    {id:'crossfire',title:'Crossfire',description:'Bounced cheese turns red-hot. One hit, lights out.'},
    {id:'scattershot',title:'Scattershot',description:'Every shot is a five-ball fan, and every ball knocks rats flying.'},
    {id:'big-cheese',title:'Big Cheese',description:'Heavy cheese. Slow trigger. Every rebound makes it bigger.'},
    {id:'planted-evidence',title:'Planted Evidence',description:'Fake cases explode. The real case still counts.'},
    {id:'blackout',title:'Blackout',description:'The power is out. Every rat has a flashlight.'},
    {id:'code-violation',title:'Code Violation',description:'Every machine in the city is out of order.'},
    {id:'most-wanted',title:'Most Wanted',description:'Whoever is winning is in the searchlight. Take them down for a supply.'},
    {id:'all-units',title:'All Units',description:'The fallen respawn as backup, right beside the action.'},
    {id:'bobbleheads',title:'Bobbleheads',description:'Every head is huge, and a headshot always kills. Aim high.'},
    {id:'act-of-god',title:'Act of God',description:'The sky is falling. It is cheese.'},
] as const;
export type IncidentId = typeof INCIDENTS[number]['id'];
export const isIncidentId = (value: unknown): value is IncidentId => INCIDENTS.some(incident => incident.id === value);
/** Retired IDs that stored rooms may still hold; each maps to a live incident. */
export const LEGACY_INCIDENTS = {
    'kickback':'scattershot','after-hours-collection':'crossfire','return-to-sender':'crossfire',
    // Retired 1 October (protocol 27): stored rooms may still hold them.
    'delayed-reaction':'crossfire','clean-bill':'most-wanted','rat-race':'all-units','malpractice':'code-violation',
    'cheesequake':'big-cheese','ricochet-racket':'scattershot','popcorn-panic':'scattershot',
} as const satisfies Record<string,IncidentId>;
export type LegacyIncidentId = keyof typeof LEGACY_INCIDENTS;
export const isLegacyIncidentId = (value: unknown): value is LegacyIncidentId => typeof value === 'string' && Object.prototype.hasOwnProperty.call(LEGACY_INCIDENTS, value);
/** Which evidence incident the room runs. The retired missile behavior stays
 * available behind the classic mode toggle rather than being deleted outright. */
export type EvidenceMode = 'planted' | 'classic';
export const isEvidenceMode = (value: unknown): value is EvidenceMode => value === 'planted' || value === 'classic';
/** Dispatch choices for a room, excluding whichever evidence incident is retired, and limited to `only` when given. */
export function incidentRoster(mode: EvidenceMode = 'planted', only?: readonly IncidentId[]): typeof INCIDENTS[number][] {
    const retired: IncidentId = mode === 'classic' ? 'planted-evidence' : 'evidence-tampering';
    return INCIDENTS.filter(incident => incident.id !== retired && (!only?.length || only.includes(incident.id)));
}
/** A deploy's comma-separated incident allow-list (the `INCIDENTS` var, staging playtests only); unknown ids are dropped. */
export const parseIncidentList = (value?: string): IncidentId[] => (value ?? '').split(',').map(id => id.trim()).filter(isIncidentId);
export function incidentInfo(id?:IncidentId|LegacyIncidentId){
    const live=isLegacyIncidentId(id)?LEGACY_INCIDENTS[id]:id;
    // Old active snapshots only contained Improper Disposal.
    return INCIDENTS.find(incident=>incident.id===live)??INCIDENTS[0];
}

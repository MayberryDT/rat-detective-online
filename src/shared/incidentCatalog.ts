/** Shared copy and stable IDs for authoritative Dispatch results. */
export const INCIDENTS = [
    {id:'improper-disposal',title:'Improper Disposal',description:'Dead rats become ricocheting corpse missiles and burst into cheese.'},
    {id:'bad-ammunition',title:'Bad Ammunition',description:'Unreliable cartridges produce crooked, uneven volleys.'},
    {id:'pressure-surge',title:'Pressure Surge',description:'All launchers discharge together in recurring surges.'},
    {id:'evidence-tampering',title:'Evidence Tampering',description:'All cases are weaponized. Pickup is prohibited until the incident ends.'},
    {id:'crossfire',title:'Crossfire',description:'The first wall bounce turns a ball into a red-hot one-hit threat.'},
    {id:'scattershot',title:'Scattershot',description:'Every shot becomes a five-ball fan.'},
    {id:'delayed-reaction',title:'Delayed Reaction',description:'Balls stick at their first wall impact, then release and ricochet normally.'},
    {id:'big-cheese',title:'Big Cheese',description:'Rebounds turn ordinary shots into enormous cheese balls.'},
    {id:'ricochet-racket',title:'Ricochet Racket',description:'The first wall bounce splits a shot three ways.'},
    {id:'popcorn-panic',title:'Popcorn Panic',description:'Original balls periodically pop into smaller balls. Their children cannot pop.'},
] as const;
export type IncidentId = typeof INCIDENTS[number]['id'];
export type LegacyIncidentId = 'after-hours-collection'|'kickback'|'return-to-sender'|'cheesequake';
export function incidentInfo(id?:IncidentId|LegacyIncidentId){
    if(id==='kickback')return INCIDENTS[5];
    if(id==='after-hours-collection')return INCIDENTS[4];
    if(id==='return-to-sender')return INCIDENTS[6];
    if(id==='cheesequake')return INCIDENTS[7];
    // Old active snapshots only contained Improper Disposal.
    return INCIDENTS.find(incident=>incident.id===id)??INCIDENTS[0];
}

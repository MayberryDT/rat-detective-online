/** Shared copy and stable IDs for authoritative Dispatch results. */
export const INCIDENTS = [
    {id:'improper-disposal',title:'Improper Disposal',description:'Dead rats become missiles. Expect a cheese explosion.'},
    {id:'bad-ammunition',title:'Bad Ammunition',description:'Every pistol shot fires two cheese balls.'},
    {id:'pressure-surge',title:'Pressure Surge',description:'Every launcher fires together every three seconds.'},
    {id:'evidence-tampering',title:'Evidence Tampering',description:'Three extra Hot Cases appear. Shoot any case to send it ricocheting as a deadly missile.'},
    {id:'crossfire',title:'Crossfire',description:'Wall-bounced balls glow red and kill in one hit.'},
    {id:'scattershot',title:'Scattershot',description:'Every trigger fires a five-ball fan of cheese.'},
    {id:'return-to-sender',title:'Return to Sender',description:'Cheese balls reverse direction once after a short flight.'},
    {id:'cheesequake',title:'Cheesequake',description:'Every three seconds, all flying cheese balls leap upward.'},
    {id:'ricochet-racket',title:'Ricochet Racket',description:'The first wall bounce splits each shot into three cheese balls.'},
    {id:'popcorn-panic',title:'Popcorn Panic',description:'Survive a cheese ball hit and get launched skyward.'},
] as const;
export type IncidentId = typeof INCIDENTS[number]['id'];
export function incidentInfo(id?:IncidentId|'after-hours-collection'|'kickback'){
    if(id==='kickback')return INCIDENTS[5];
    if(id==='after-hours-collection')return INCIDENTS[4];
    // Old active snapshots only contained Improper Disposal.
    return INCIDENTS.find(incident=>incident.id===id)??INCIDENTS[0];
}

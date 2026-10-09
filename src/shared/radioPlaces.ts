import type {Vec3Data} from './networkProtocol';
import {ASSIGNMENT_DESTINATIONS,destinationContains,type DestinationId} from './assignments';
import {districtAt,type District} from './city/frame';

/** Where a point is, as the papers and the police radio say it (the Evening Edition, the scanner): inside a landmark,
 * just outside one, in the sewers, up on the roofs, or the part of town. Coarse on purpose: a radio call, not a map pin. */
const AT:Record<DestinationId,{at:string;near:string}>={
    icebox:{at:'AT THE ICEBOX',near:'OUTSIDE THE ICEBOX'},maintenance:{at:'IN THE SEWERS',near:'IN THE SEWERS'},
    pump:{at:'AT THE PUMP STATION',near:'BY THE PUMP STATION'},needleworks:{at:'AT THE NEEDLEWORKS',near:'OUTSIDE THE NEEDLEWORKS'},
    sluice:{at:'AT THE WEST SLUICE',near:'BY THE WEST SLUICE'},records:{at:'AT RECORDS',near:'OUTSIDE RECORDS'},
    'harbour-master':{at:'AT PIER 9',near:'ON THE DOCKS'},precinct:{at:'AT THE PRECINCT',near:'OUTSIDE THE PRECINCT'},
};
const DISTRICT:Record<District,string>={'north-west':'ON THE NORTH-WEST SIDE',north:'ON THE NORTH SIDE','north-east':'ON THE NORTH-EAST SIDE',
    west:'ON THE WEST SIDE',centre:'DOWNTOWN',east:'IN THE EAST END','south-west':'ON THE SOUTH-WEST SIDE',south:'ON THE SOUTH SIDE','south-east':'ON THE SOUTH-EAST SIDE'};
export function placePhrase(p:Vec3Data):string {
    if(p.y< -2)return 'IN THE SEWERS';
    let near:DestinationId|undefined,best=40;
    for(const id of Object.keys(ASSIGNMENT_DESTINATIONS) as DestinationId[]){
        if(destinationContains(id,p))return AT[id].at;
        const c=ASSIGNMENT_DESTINATIONS[id].center,d=Math.hypot(c.x-p.x,c.z-p.z);
        if(d<best){best=d;near=id;}
    }
    const ground=near?AT[near].near:DISTRICT[districtAt(p.x,p.z)];
    return p.y>8?`ON THE ROOFS, ${ground}`:ground;
}


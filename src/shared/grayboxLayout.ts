import {relocateStreetLamps} from './streetLampLayout';
import {streetDebris,type DebrisKind} from './streetDebris';
import {CENTRAL_BUILDINGS,skylineMasses} from './skyline';
import { generateBuildingLayout } from './worldSpec';
import { cityStreetBuildings, landmarkReservation } from './cityPlan';
import { landmarkBoxes } from './landmarkLayout';
import { vehicleBoxes } from './vehicleLayout';
import { sewerBoxes, sewerGroundOpening, SEWER_ENTRIES } from './sewerLayout';
export const GRAYBOX_VERSION = 2;
export const SEWER_FLOOR = -7;
export const CITY_BOUNDS = {min:-196,max:166};
export const CITY_PREVIEW_SEED = 20260907;
export const originalCityBuildingAllowed=(x:number,z:number)=>!landmarkReservation(x,z) && !(Math.abs(x)<65&&Math.abs(z)<75);
export const BLOCKS = CENTRAL_BUILDINGS.map(b=>[b.cx,b.cz,b.bw,b.bd,b.bh]);
export const STREET_LAMPS=relocateStreetLamps([[-50,-29],[-5,-31],[25,-29],[-5,23],[50,22],[-48,35],[30,35],[-151,0],[143,0],[0,143],[-54,-95],[85,-95],[-58,72],[58,125],[-100,-31],[-5,112],[57,90],[103,85],[152,91],[96,121],[151,142]],cityStreetBuildings([]));
export const ENTRIES=SEWER_ENTRIES;
export const GRAYBOX_SPAWNS = [
    {x:-10,y:2,z:-27},{x:22,y:2,z:-28},{x:82,y:2,z:-24},{x:-55,y:2,z:25},
    {x:-166,y:2,z:35},{x:130,y:2,z:-24},{x:15,y:2,z:135},{x:-75,y:2,z:-87},
    {x:77,y:2,z:75},{x:-16,y:2,z:-48},{x:-105,y:2,z:120},{x:46,y:2,z:53},
];
export interface GrayboxBox {debris?:DebrisKind;x:number;y:number;z:number;w:number;h:number;d:number;color:number;rx:number;rz:number;building?:boolean;hidden?:boolean;original?:boolean}
export const isRampOpening=sewerGroundOpening;
export function grayboxBoxes(spec={seed:CITY_PREVIEW_SEED,version:GRAYBOX_VERSION}):GrayboxBox[] {
    const boxes:GrayboxBox[]=[];
    const box=(x:number,y:number,z:number,w:number,h:number,d:number,color=0x28222f,rx=0,rz=0,building=false)=>boxes.push({x,y,z,w,h,d,color,rx,rz,building});
    for(let z=CITY_BOUNDS.min;z<CITY_BOUNDS.max;z+=2){let start=CITY_BOUNDS.min;for(let x=CITY_BOUNDS.min;x<=CITY_BOUNDS.max;x+=2){if(x===CITY_BOUNDS.max||isRampOpening(x+1,z+1)){if(x>start)box((start+x)/2,-.5,z+1,x-start,1,2,0x25222c);start=x+2;}}}
    boxes.push(...sewerBoxes(),...landmarkBoxes(),...vehicleBoxes());
    for(const edge of [CITY_BOUNDS.min,CITY_BOUNDS.max]){box(edge,4,-15,1,8,362,0x19141e);box(-15,4,edge,362,8,1,0x19141e);}
    for(const b of CENTRAL_BUILDINGS)for(const m of skylineMasses(b)){
        box(m.x,m.y,m.z,m.w,m.h,m.d,0x25212e,0,0,true);
        boxes[boxes.length-1].original=true; // CityGenerator supplies the detailed visible tower and local collider.
    }
    // Reconstructed skyline masses: stepped civic tower, twin cold-store stacks,
    // factory clock tower/chimneys, and a central municipal reservoir.
    box(-16,53,-70,34,34,18,0x292531,0,0,true);
    box(-16,81,-70,24,22,16,0x302a36,0,0,true);
    box(-16,98,-70,16,12,12,0x39313d);box(-16,107,-70,7,6,7,0x423846);
    box(130,45,-81,30,18,12,0x26323b,0,0,true);
    for(const x of [114,146]){box(x,55,-79,10,38,10,0x273841,0,0,true);boxes[boxes.length-1].hidden=true;box(x,79,-79,13,10,13,0x39494f);}
    box(-74,65,100,12,58,12,0x382932,0,0,true);box(-74,98,100,15,8,15,0x47323b);box(-74,105,100,7,6,7,0x55414c);
    for(const x of [-133,-125]){box(x,63,66,3.4,54,3.4,0x392c32);boxes[boxes.length-1].hidden=true;}
    box(125,39,112,17,6,15,0x283c36,0,0,true);
    box(125,49,112,20,14,20,0x354b41);boxes[boxes.length-1].hidden=true;
    box(125,57,112,21,2,21,0x4c5b4e);
    box(105,51.5,105,5,31,5,0x293831,0,0,true);
    for(const x of [117,133]){box(x,20,118,1.2,1.2,32,0x415750);boxes[boxes.length-1].hidden=true;}
    // New gate pylons and the street-level civic/factory portals.
    for(const z of [-22,22]){
        box(-137,10,z,18,20,20,0x282730,0,0,true);
        box(-137,32,z,16,24,18,0x302d38,0,0,true);
        box(-137,51,z,12,14,14,0x39333e,0,0,true);
        box(-137,60,z,15,4,17,0x49414b);
    }
    box(-137,24,0,16,6,62,0x292630);box(-137,28,0,18,2,64,0x443e47);
    for(const x of [-40,-29,-3,8]){box(x,10,-35.6,1.7,20,1.7,0x514751);boxes[boxes.length-1].hidden=true;}
    box(-16,21,-35.6,54,2,3,0x514751);
    box(130,7.8,-30,22,.6,4,0x42505a);
    for(const x of [121,139])box(x,3.7,-30.4,1.1,7.4,1.1,0x51606a);
    box(-105,9,110,62,.6,5,0x44323d);for(const x of [-136,-74])box(x,4.5,110,.8,9,.8,0x58424d);
    for(const x of [118,132])box(x,6,137.4,1.4,12,1.4,0x4a554b);
    box(125,12.4,137.4,16,.8,2,0x56604f);
    box(-128,2,117.5,8,4,1.8,0x252331);boxes[boxes.length-1].hidden=true;
    for(const b of cityStreetBuildings(generateBuildingLayout({...spec,version:1}))){box(b.cx,b.bh/2,b.cz,b.bw,b.bh,b.bd,0x25212e,0,0,true);boxes[boxes.length-1].original=true;}
    for(const [x,z] of STREET_LAMPS){box(x,2.5,z,.16,5,.16,0x17131d);box(x,5,z,.65,.8,.65,0xffd087);boxes[boxes.length-1].hidden=true;}
    boxes.push(...streetDebris(boxes,isRampOpening));
    return boxes;
}

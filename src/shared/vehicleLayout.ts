import type { GrayboxBox } from './grayboxLayout';

/** Uniform scale shared by rendering and static cover. Shape dimensions stay in model units. */
export const VEHICLE_SCALE = 2;

export type VehicleKind = 'reefer' | 'van' | 'sedan' | 'pickup';
export interface ParkedVehicle {
    id: string;
    kind: VehicleKind;
    x: number;
    z: number;
    /** Quarter turns about +Y, matching THREE.Group.rotation.y. Nose points +Z at zero. */
    heading: 0 | 1 | 2 | 3;
    color: number;
}
export interface VehiclePart {
    role: 'chassis' | 'cargo' | 'cab' | 'hood' | 'bed';
    x: number; y: number; z: number; w: number; h: number; d: number;
}
export interface VehicleShape {
    w: number; d: number; h: number;
    parts: VehiclePart[];
    /** Wheels rotate around local X. Their centers and envelope also define the collision boxes. */
    wheels: { x: number; y: number; z: number; radius: number; width: number }[];
}
const part = (role: VehiclePart['role'],y:number,z:number,w:number,h:number,d:number):VehiclePart => ({role,x:0,y,z,w,h,d});
function wheels(track:number, radius:number, rear:number, front:number, width=.32) {
    return [-1,1].flatMap(side=>[rear,front].map(z=>({x:side*track,y:radius,z,radius,width})));
}

/** All primary visible volumes are shared with the static cover proxies. The renderer
 * may add trim/glass, but should construct the body from these parts to keep cover truthful. */
export const VEHICLE_SHAPES: Record<VehicleKind, VehicleShape> = {
    reefer: { w:3.2,d:7.5,h:3.8,
        parts:[part('chassis',.66,0,2.65,.38,7.3),part('cargo',2.3,-1.05,3.2,3,5.4),part('cab',1.72,2.7,2.9,2.15,2.1)],
        wheels:wheels(1.42,.56,-2.55,2.6,.36) },
    van: { w:2.8,d:6,h:2.9,
        parts:[part('chassis',.59,0,2.35,.32,5.85),part('cargo',1.82,-.8,2.7,2.16,4.4),part('cab',1.57,2.05,2.65,1.9,1.85)],
        wheels:wheels(1.24,.48,-1.95,1.95) },
    sedan: { w:2.6,d:5.5,h:1.94,
        parts:[part('chassis',.78,0,2.5,.78,5.5),part('cab',1.46,-.2,2.15,.96,2.65)],
        wheels:wheels(1.14,.43,-1.72,1.72) },
    pickup: { w:2.6,d:5.8,h:2.38,
        parts:[part('chassis',.72,0,2.4,.58,5.8),part('bed',1.08,-1.4,2.5,.48,2.9),part('cab',1.6,.72,2.4,1.56,1.6),part('hood',1.1,2.2,2.35,.55,1.3)],
        wheels:wheels(1.14,.49,-1.9,1.95) },
};

export const PARKED_VEHICLES: ParkedVehicle[] = [
    {id:'icebox-loading-reefer',kind:'reefer',x:126.5,z:-67,heading:0,color:0x51616a},
    {id:'icebox-cold-room-van',kind:'van',x:142,z:-75,heading:0,color:0x71786e},
    {id:'icebox-curb-reefer',kind:'reefer',x:144,z:-22,heading:1,color:0x4d656c},
    {id:'records-delivery',kind:'van',x:-30,z:-86,heading:1,color:0x464352},
    {id:'needleworks-delivery',kind:'van',x:-83,z:119,heading:1,color:0x62515c},
    {id:'pump-maintenance',kind:'pickup',x:155,z:129,heading:0,color:0x4b6254},
    {id:'avenue-sedan',kind:'sedan',x:74,z:50,heading:0,color:0x4b323e},
    {id:'west-curb-sedan',kind:'sedan',x:-178,z:-65,heading:2,color:0x303e4a},
];

/** Exact cardinal transform avoids floating-point rotation noise in shared AABBs. */
export function vehicleWorldPart(vehicle:ParkedVehicle, p:{x:number;y:number;z:number;w:number;h:number;d:number}):GrayboxBox {
    const {heading:q}=vehicle;
    const x=q===0?p.x:q===1?p.z:q===2?-p.x:-p.z;
    const z=q===0?p.z:q===1?-p.x:q===2?-p.z:p.x;
    return {x:vehicle.x+x*VEHICLE_SCALE,y:p.y*VEHICLE_SCALE,z:vehicle.z+z*VEHICLE_SCALE,
        w:(q%2?p.d:p.w)*VEHICLE_SCALE,h:p.h*VEHICLE_SCALE,d:(q%2?p.w:p.d)*VEHICLE_SCALE,
        color:vehicle.color,rx:0,rz:0,hidden:true};
}

export function vehicleBoxes(vehicles:readonly ParkedVehicle[]=PARKED_VEHICLES):GrayboxBox[] {
    return vehicles.flatMap(vehicle=>{
        const shape=VEHICLE_SHAPES[vehicle.kind];
        return [...shape.parts,...shape.wheels.map(w=>({x:w.x,y:w.y,z:w.z,w:w.width,h:w.radius*2,d:w.radius*2}))]
            .map(p=>vehicleWorldPart(vehicle,p));
    });
}

const vehicleRestSurfaces=PARKED_VEHICLES.flatMap(vehicle=>
    VEHICLE_SHAPES[vehicle.kind].parts.map(p=>vehicleWorldPart(vehicle,p)));

// The current 16-unit jump under gravity 25 rises 5.12 units. Leave a margin
// for the discrete physics step instead of treating enlarged truck roofs as jumpable.
const MAX_REACHABLE_ROOF = 4.8;

/** A resting case may be collected from these jumpable roofs. Check the highest
 * actual body surface at the position, so chassis surfaces inside cargo bodies
 * and the open space underneath a vehicle never count as accessible roofs. */
export function isReachableVehiclePosition(x:number,y:number,z:number):boolean {
    let top=-Infinity;
    for(const p of vehicleRestSurfaces){
        if(Math.abs(x-p.x)<=p.w/2+.45 && Math.abs(z-p.z)<=p.d/2+.45)
            top=Math.max(top,p.y+p.h/2);
    }
    // The case's widest resting orientation, including its handle, fits this tolerance.
    return Number.isFinite(top) && top<=MAX_REACHABLE_ROOF && y>=top-.1 && y<=top+.7;
}

import { describe, expect, it } from 'vitest';
import { GRAYBOX_SPAWNS, grayboxBoxes, isRampOpening, type GrayboxBox } from '../../src/shared/grayboxLayout';
import { PARKED_VEHICLES, VEHICLE_SCALE, VEHICLE_SHAPES, vehicleBoxes, vehicleWorldPart, isReachableVehiclePosition } from '../../src/shared/vehicleLayout';

const intersects=(a:GrayboxBox,b:GrayboxBox)=>Math.abs(a.x-b.x)<(a.w+b.w)/2-.001
    && Math.abs(a.y-b.y)<(a.h+b.h)/2-.001 && Math.abs(a.z-b.z)<(a.d+b.d)/2-.001;
const key=(b:GrayboxBox)=>JSON.stringify(b);

describe('parked vehicle cover',()=>{
    it('keeps cases on jumpable car and pickup roofs but recovers cases on doubled truck roofs',()=>{
        expect(isReachableVehiclePosition(74,4.18,50)).toBe(true);
        expect(isReachableVehiclePosition(155,5.06,130)).toBe(true);
        expect(isReachableVehiclePosition(128,7.9,-69)).toBe(false);
        expect(isReachableVehiclePosition(142,6.1,-77)).toBe(false);
        expect(isReachableVehiclePosition(74,8,50)).toBe(false);
        expect(isReachableVehiclePosition(128,.2,-68)).toBe(false);
        expect(isReachableVehiclePosition(128,2,-68)).toBe(false);
        expect(isReachableVehiclePosition(136,4.1,-68)).toBe(false);
    });
    it('shares cardinal body and wheel volumes with the renderer without filling the underbody gap',()=>{
        for(const vehicle of PARKED_VEHICLES){
            const boxes=vehicleBoxes([vehicle]);
            const shape=VEHICLE_SHAPES[vehicle.kind];
            expect(boxes).toHaveLength(shape.parts.length+4);
            expect(boxes.every(b=>b.hidden && b.rx===0 && b.rz===0)).toBe(true);
            expect(boxes.every(b=>b.y-b.h/2>=0)).toBe(true);
            expect(boxes.some(b=>b.y-b.h/2>.2)).toBe(true);
        }
        expect(VEHICLE_SCALE).toBe(2);
        const body={x:.5,y:1,z:2,w:3,h:2,d:5};
        expect(vehicleWorldPart({...PARKED_VEHICLES[0],x:10,z:20,heading:1},body))
            .toMatchObject({x:14,y:2,z:19,w:10,h:4,d:6});
    });

    it('places static cover clear of existing walls, furniture, stairs, drains and spawns',()=>{
        const vehicles=vehicleBoxes();
        const vehicleKeys=new Set(vehicles.map(key));
        const existing=grayboxBoxes().filter(b=>!vehicleKeys.has(key(b)));
        for(const vehicle of PARKED_VEHICLES){
            for(const body of vehicleBoxes([vehicle])){
                const obstruction=existing.find(b=>intersects(body,b));
                expect(obstruction,`${vehicle.id} intersects ${obstruction?key(obstruction):''}`).toBeUndefined();
                for(const spawn of GRAYBOX_SPAWNS){
                    const player={...spawn,y:1.7,w:2.6,h:3.4,d:2.6,color:0,rx:0,rz:0};
                    expect(intersects(body,player),`${vehicle.id} blocks spawn`).toBe(false);
                }
                for(const x of [body.x-body.w/2,body.x,body.x+body.w/2]){
                    for(const z of [body.z-body.d/2,body.z,body.z+body.d/2]){
                        expect(isRampOpening(x,z),`${vehicle.id} covers drain`).toBe(false);
                    }
                }
            }
        }
        // Main doorway-to-doorway loading lane retains an unblocked six-unit strip.
        const iceboxThroughRoute={x:132.8,y:2,z:-61,w:6,h:4,d:59,color:0,rx:0,rz:0};
        expect(vehicles.some(b=>intersects(b,iceboxThroughRoute))).toBe(false);
    });
});

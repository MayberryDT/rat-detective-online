import {describe,expect,it} from 'vitest';
import {CITY_SPAWN_CLEARANCES,CITY_STREETS,cityStreetBuildings} from '../../src/shared/cityPlan';
import {GRAYBOX_SPAWNS} from '../../src/shared/grayboxLayout';
import {LANDMARK_INTERIORS} from '../../src/shared/landmarkLayout';
import type {BuildingFootprint} from '../../src/shared/worldSpec';
import {CENTRAL_BUILDINGS,neighborhoodHeight} from '../../src/shared/skyline';

const original:BuildingFootprint[]=Array.from({length:144},(_,i)=>({
    cx:(Math.floor(i/12)-6)*30,cz:(i%12-6)*30,bw:11,bd:11,bh:40,
}));
const buildings=cityStreetBuildings(original);
function overlaps(b:BuildingFootprint,x:number,z:number,w:number,d:number,padding=0){
    return Math.abs(b.cx-x)<(b.bw+w)/2+padding-1e-6
        &&Math.abs(b.cz-z)<(b.bd+d)/2+padding-1e-6;
}

describe('dense city frontages',()=>{
    it('preserves avenues, landmark footprints, shared spawns, and both forecourts',()=>{
        expect(CITY_SPAWN_CLEARANCES).toEqual(GRAYBOX_SPAWNS.map(p=>[p.x,p.z]));
        for(const b of buildings){
            for(const street of CITY_STREETS){
                expect(overlaps(b,street.x,street.z,street.w,street.d,1),`street at ${street.x},${street.z}; building ${b.cx},${b.cz}`).toBe(false);
            }
            for(const hall of LANDMARK_INTERIORS){
                expect(overlaps(b,hall.cx,hall.cz,hall.w,hall.d,3),hall.id).toBe(false);
            }
            for(const spawn of GRAYBOX_SPAWNS){
                expect(overlaps(b,spawn.x,spawn.z,0,0,2),`spawn ${spawn.x},${spawn.z}`).toBe(false);
            }
            expect(overlaps(b,-15.5,-29.5,31,13)).toBe(false);
            expect(overlaps(b,130,-19.5,32,21)).toBe(false);
        }
    });

    it('keeps short shops and a varied skyline with a taller downtown trend',()=>{
        const central=Array.from({length:30},(_,i)=>neighborhoodHeight(i-15,20,42,i));
        const edge=Array.from({length:30},(_,i)=>neighborhoodHeight(i-15,180,42,i));
        const average=(a:number[])=>a.reduce((n,h)=>n+h,0)/a.length;
        expect(average(central)).toBeGreaterThan(average(edge)+35);
        expect(new Set(central).size).toBeGreaterThan(10);
        expect(neighborhoodHeight(0,0,12,0)).toBe(12);
        expect(Math.max(...CENTRAL_BUILDINGS.map(b=>b.bh))).toBe(170);
        expect(CENTRAL_BUILDINGS.every(b=>b.bh>100)).toBe(true);
    });

    it('leaves the ramp wells, surrounding parapets, and upper approaches clear',()=>{
        const clearances=[
            [-54,52,10,28,2],[0,124,10,28,2],[126,0,28,10,2],[-126,0,28,10,2],
            [-54,72,10,8,0],[0,146,10,8,0],[146,0,8,10,0],[-146,0,8,10,0],
        ];
        for(const b of buildings)for(const [x,z,w,d,padding] of clearances){
            expect(overlaps(b,x,z,w,d,padding),`ramp/approach ${x},${z}`).toBe(false);
        }
    });

    it('adds continuous frontages across the map without overlapping or multiplying small colliders',()=>{
        const area=buildings.reduce((sum,b)=>sum+b.bw*b.bd,0);
        // The previous layout with this same fixture covered 8,794 square units.
        expect(area).toBeGreaterThan(8794*3);
        expect(buildings.length).toBeLessThanOrEqual(220);
        expect(buildings.filter(b=>b.bh<=16).length).toBeGreaterThanOrEqual(16);
        let attached=0;
        buildings.forEach((b,i)=>{
            expect(Math.min(b.bw,b.bd)).toBeGreaterThanOrEqual(8);
            expect(b.cx-b.bw/2).toBeGreaterThanOrEqual(-190);
            expect(b.cz-b.bd/2).toBeGreaterThanOrEqual(-190);
            expect(b.cx+b.bw/2).toBeLessThanOrEqual(160);
            expect(b.cz+b.bd/2).toBeLessThanOrEqual(160);
            for(const other of buildings.slice(i+1)){
                expect(overlaps(b,other.cx,other.cz,other.bw,other.bd)).toBe(false);
                if(Math.abs(Math.abs(b.cx-other.cx)-(b.bw+other.bw)/2)<1e-6
                    && Math.abs(b.cz-other.cz)<(b.bd+other.bd)/2)attached++;
            }
        });
        expect(attached).toBeGreaterThanOrEqual(12);
        for(const sx of [-1,1])for(const sz of [-1,1]){
            const district=buildings.filter(b=>Math.sign(b.cx+15)===sx && Math.sign(b.cz+15)===sz);
            expect(district.reduce((sum,b)=>sum+b.bw*b.bd,0),`district ${sx},${sz}`).toBeGreaterThan(3500);
        }
        expect(cityStreetBuildings(original)).toEqual(buildings);
    });
});

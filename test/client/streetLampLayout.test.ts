import {describe,expect,it} from 'vitest';
import {CITY_STREETS,cityStreetBuildings} from '../../src/shared/cityPlan';
import {STREET_LAMPS,grayboxBoxes,CITY_PREVIEW_SEED} from '../../src/shared/grayboxLayout';
import {generateBuildingLayout} from '../../src/shared/worldSpec';
import {generatedStreetLamps} from '../../src/shared/streetLampLayout';
import {SEWER_ENTRIES,SEWER_MANHOLE} from '../../src/shared/sewerLayout';

const layout=cityStreetBuildings(generateBuildingLayout({seed:CITY_PREVIEW_SEED,version:1}));
const generated=generatedStreetLamps(layout,STREET_LAMPS);
const all=[...STREET_LAMPS,...generated];
describe('street lamp clearance',()=>{
    it('places every pole beside a real curb, outside every intersecting street and building',()=>{
        expect(STREET_LAMPS.length).toBeGreaterThan(8);
        expect(generated.length).toBeGreaterThan(15);
        for(const [x,z] of all){
            expect(CITY_STREETS.some(r=>Math.abs(x-r.x)<r.w/2+.3&&Math.abs(z-r.z)<r.d/2+.3),`pole ${x},${z} in street`).toBe(false);
            expect(CITY_STREETS.some(r=>Math.abs(x-r.x)<=r.w/2+1&&Math.abs(z-r.z)<=r.d/2+1)).toBe(true);
            expect(layout.some(b=>Math.abs(x-b.cx)<b.bw/2+.35&&Math.abs(z-b.cz)<b.bd/2+.35),`pole ${x},${z} inside facade`).toBe(false);
        }
    });
    it('keeps pipe approaches and the manhole clear, including the previously blocked Gate mouth',()=>{
        expect(all.some(([x,z])=>Math.abs(x+151)<1&&Math.abs(z)<1)).toBe(false);
        for(const [x,z] of all){
            expect(Math.hypot(x-SEWER_MANHOLE.x,z-SEWER_MANHOLE.z)).toBeGreaterThanOrEqual(7);
            for(const entry of SEWER_ENTRIES){
                const direction=entry.axis==='x'?Math.sign(entry.x):1;
                const along=((entry.axis==='x'?x:z)-entry[entry.axis])*direction;
                const across=Math.abs((entry.axis==='x'?z:x)-(entry.axis==='x'?entry.z:entry.x));
                expect(along>-28&&along<16&&across<9,`pole ${x},${z} blocks ${entry.name}`).toBe(false);
            }
        }
    });
    it('moves the physical prototype poles with their shared glow/light coordinates and avoids duplicate props',()=>{
        const poles=grayboxBoxes().filter(b=>b.w===.16&&b.d===.16&&b.h===5);
        expect(poles.map(b=>[b.x,b.z])).toEqual(STREET_LAMPS);
        for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
            expect(Math.hypot(all[i][0]-all[j][0],all[i][1]-all[j][1])).toBeGreaterThan(8);
        }
    });
});

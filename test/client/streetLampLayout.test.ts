import {describe,expect,it} from 'vitest';
import {CITY_STREETS,cityStreetBuildings} from '../../src/shared/cityPlan';
import {STREET_LAMPS,grayboxBoxes,CITY_PREVIEW_SEED} from '../../src/shared/grayboxLayout';
import {generateBuildingLayout} from '../../src/shared/worldSpec';
import {generatedStreetLamps} from '../../src/shared/streetLampLayout';
import {SEWER_ENTRIES,SEWER_MANHOLE} from '../../src/shared/sewerLayout';
import {kitCity} from '../../src/shared/city/kit/city';

const layout=cityStreetBuildings(generateBuildingLayout({seed:CITY_PREVIEW_SEED,version:1}));
const generated=generatedStreetLamps(layout,STREET_LAMPS);
const all=[...STREET_LAMPS,...generated];
const kit=kitCity({visuals:false}).lamps;
describe('street lamp clearance',()=>{
    it('places every pole outside every street and building, kerb poles beside a real curb and kit poles on a deck',()=>{
        expect(STREET_LAMPS.length).toBeGreaterThan(50);
        expect(generated.length).toBeGreaterThan(40);
        const boxes=grayboxBoxes();
        for(const [x,z] of all){
            expect(CITY_STREETS.some(r=>Math.abs(x-r.x)<r.w/2+.3&&Math.abs(z-r.z)<r.d/2+.3),`pole ${x},${z} in street`).toBe(false);
            expect(layout.some(b=>Math.abs(x-b.cx)<b.bw/2+.35&&Math.abs(z-b.cz)<b.bd/2+.35),`pole ${x},${z} inside facade`).toBe(false);
            // A part's own lamps (pier heads, the breakwater, the precinct grounds) stand where the part puts them.
            if(kit.some(([kx,kz])=>kx===x&&kz===z))expect(boxes.some(b=>!b.rx&&!b.ry&&!b.rz&&Math.abs(b.y+b.h/2)<.6&&Math.abs(x-b.x)<b.w/2&&Math.abs(z-b.z)<b.d/2),`kit pole ${x},${z} on a deck`).toBe(true);
            else expect(CITY_STREETS.some(r=>Math.abs(x-r.x)<=r.w/2+1&&Math.abs(z-r.z)<=r.d/2+1),`pole ${x},${z} beside a curb`).toBe(true);
        }
    });
    it('keeps pipe approaches and the manhole clear, including the previously blocked Gate mouth',()=>{
        expect(all.some(([x,z])=>Math.abs(x+151)<1&&Math.abs(z)<1)).toBe(false);
        for(const [x,z] of all){
            expect(Math.hypot(x-SEWER_MANHOLE.x,z-SEWER_MANHOLE.z)).toBeGreaterThanOrEqual(7);
            for(const entry of SEWER_ENTRIES){
                const along=((entry.axis==='x'?x:z)-entry[entry.axis])*entry.direction;
                const across=Math.abs((entry.axis==='x'?z:x)-(entry.axis==='x'?entry.z:entry.x));
                expect(along>-28&&along<16&&across<9,`pole ${x},${z} blocks ${entry.name}`).toBe(false);
            }
        }
    });
    it('moves the physical prototype poles with their shared glow/light coordinates and avoids duplicate props',()=>{
        const poles=grayboxBoxes().filter(b=>b.w===.16&&b.d===.16&&b.h===9);
        expect(poles.map(b=>[b.x,b.z])).toEqual(all);
        for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
            expect(Math.hypot(all[i][0]-all[j][0],all[i][1]-all[j][1])).toBeGreaterThan(8);
        }
    });
});

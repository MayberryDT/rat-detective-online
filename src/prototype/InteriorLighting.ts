import {LANDMARK_INTERIORS,landmarkBoxes} from '../shared/landmarkLayout';
import type {OverheadLight,LightRoom} from './StreetLightPool';

export interface InteriorFixture extends OverheadLight {
    room:LightRoom;
    floor:number;
    style:'pendant'|'strip'|'utility';
    ceiling:number;
}

export const LIGHT_ROOMS:readonly LightRoom[]=[
    ...LANDMARK_INTERIORS.map(h=>({id:h.id,xmin:h.cx-h.w/2,xmax:h.cx+h.w/2,zmin:h.cz-h.d/2,zmax:h.cz+h.d/2,ymin:-.5,ymax:24})),
    {id:'sluice',xmin:-146,xmax:-128,zmin:-32,zmax:32,ymin:-.5,ymax:24},
    {id:'maintenance',xmin:60,xmax:70,zmin:-42,zmax:-30,ymin:-7.5,ymax:-1},
];

/** Fixtures follow the existing counters, aisles and galleries. They add no
 * collision geometry; floor slabs filter placements over open atriums. */
export function interiorFixtures():InteriorFixture[] {
    const slabs=landmarkBoxes().filter(b=>!b.hidden&&!b.rx&&!b.rz&&Math.abs(b.h-.6)<.001);
    const floors=slabs.filter(b=>b.y<20);
    const fixtures:InteriorFixture[]=[];
    const plans:Record<string,{color:number;style:InteriorFixture['style'];points:readonly number[][]}>={
        records:{color:0xe9bd83,style:'pendant',points:[[-36,-43],[4,-43],[-38,-58],[6,-58],[-36,-74],[4,-74],[-16,-58],[-16,-74]]},
        icebox:{color:0xa2cbd9,style:'strip',points:[[130,-37],[130,-54],[130,-73],[144,-59],[144,-76],[114,-36],[114,-74],[114,-86],[140,-86]]},
        needleworks:{color:0xd8b19a,style:'pendant',points:[[-135,63],[-118,62],[-94,63],[-74,87],[-93,82],[-134,99],[-112,100],[-88,103]]},
        pump:{color:0xa8c1b3,style:'utility',points:[[125,132],[125,117],[125,103],[108,104],[108,134],[144,104],[144,119],[144,133]]},
    };
    for(const hall of LANDMARK_INTERIORS){
        const room=LIGHT_ROOMS.find(r=>r.id===hall.id)!,plan=plans[hall.id];
        for(const floor of hall.levels)for(const [x,z] of plan.points){
            if(!floors.some(b=>Math.abs(b.y+.3-floor)<.01&&Math.abs(x-b.x)<b.w/2&&Math.abs(z-b.z)<b.d/2))continue;
            const ceiling=Math.min(...slabs.filter(b=>b.y-.3>floor+4&&Math.abs(x-b.x)<b.w/2&&Math.abs(z-b.z)<b.d/2).map(b=>b.y-.3));
            fixtures.push({x,y:floor+5.8,z,color:plan.color,intensity:75,distance:12,angle:.85,room,floor,ceiling:Number.isFinite(ceiling)?ceiling:24,style:plan.style});
        }
    }
    const sluice=LIGHT_ROOMS.find(r=>r.id==='sluice')!;
    for(const z of [-6,6])fixtures.push({x:-137,y:5.8,z,color:0xcbb78e,intensity:65,distance:12,angle:.85,room:sluice,floor:0,ceiling:21,style:'utility'});
    const maintenance=LIGHT_ROOMS.find(r=>r.id==='maintenance')!;
    for(const z of [-33,-39])fixtures.push({x:65,y:-2.2,z,color:0xb7c6b1,intensity:32,distance:8,angle:.85,room:maintenance,floor:-7,ceiling:-1.2,style:'strip'});
    return fixtures;
}

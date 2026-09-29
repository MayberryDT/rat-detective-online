import { describe, expect, it } from 'vitest';
import { BotNavigation } from '../../src/shared/BotNavigation';
import { CITY_PREVIEW_SEED, GRAYBOX_VERSION } from '../../src/shared/grayboxLayout';
import { LANDMARK_INTERIORS } from '../../src/shared/landmarkLayout';
import { CASE_SPAWNS } from '../../src/shared/chaosState';
import { PICKUP_ANCHORS } from '../../src/shared/pickups';
import { JURISDICTION_ZONES } from '../../src/shared/jurisdictionZones';
import { BANK_WALLS } from '../../src/shared/city/kit/parts/bankWalls';
import type { Vec3Data } from '../../src/shared/networkProtocol';

const nav=new BotNavigation({seed:CITY_PREVIEW_SEED,version:GRAYBOX_VERSION});
function reachable(from:Vec3Data,to:Vec3Data){
    let route=nav.route(from,to);
    for(let i=0;i<600&&!route.length;i++){nav.update(20);route=nav.route(from,to);}
    const end=route.at(-1);
    return !!end&&Math.hypot(end.x-to.x,end.z-to.z)<2.9&&Math.abs(end.y-to.y)<.6;
}
/** Just outside each street door (the openings cut in the landmark shells). */
const DOORS:Record<string,Vec3Data[]>={
    records:[{x:-16,y:0,z:-33},{x:-16,y:0,z:-85},{x:-52,y:0,z:-59}],
    icebox:[{x:130,y:0,z:-27},{x:158,y:0,z:-48},{x:130,y:0,z:-95}],
    needleworks:[{x:-105,y:0,z:112},{x:-63,y:0,z:82},{x:-105,y:0,z:52}],
    pump:[{x:125,y:0,z:141},{x:154,y:0,z:118},{x:125,y:0,z:95}],
};

/** A known open spot on each playable floor, away from the wall. */
const FLOORS:Record<string,Vec3Data[]>={
    records:[{x:-16,y:0,z:-44},{x:-16,y:8,z:-46},{x:-16,y:16,z:-46},{x:-40,y:8,z:-78},{x:8,y:16,z:-78}],
    icebox:[{x:120,y:0,z:-80},{x:142,y:0,z:-58},{x:116,y:8,z:-84},{x:114,y:8,z:-60}],
    needleworks:[{x:-130,y:0,z:100},{x:-80,y:0,z:62},{x:-100,y:8,z:95},{x:-130,y:8,z:62},{x:-100,y:16,z:95},{x:-80,y:16,z:62}],
    pump:[{x:106,y:0,z:104},{x:146,y:0,z:132},{x:144,y:8,z:118},{x:106,y:8,z:132}],
};

describe('landmark bank walls',()=>{
    it.each(BANK_WALLS.map(w=>[w.id,w] as const))('%s keeps every door, floor, supply, case spawn and zone post in reach',(_id,wall)=>{
        const hall=LANDMARK_INTERIORS.find(h=>h.id===wall.landmark)!;
        const inside=(p:{x:number;z:number})=>Math.abs(p.x-hall.cx)<hall.w/2&&Math.abs(p.z-hall.cz)<hall.d/2;
        const goals:Vec3Data[]=[
            ...FLOORS[wall.landmark]!,
            ...PICKUP_ANCHORS.filter(inside).map(a=>({x:a.x,y:(a.y??.7)-.7,z:a.z})),
            ...CASE_SPAWNS.filter(inside).map(c=>({x:c.x,y:c.y-1.3,z:c.z})),
            ...Object.values(JURISDICTION_ZONES).flatMap(z=>z.posts.filter(inside).map(p=>({x:p.x,y:p.y-.3,z:p.z}))),
        ];
        const doors=DOORS[wall.landmark]!;
        for(const door of doors){
            for(const other of doors)if(other!==door)expect(reachable(door,other),`${JSON.stringify(door)} → ${JSON.stringify(other)}`).toBe(true);
            for(const goal of goals)expect(reachable(door,goal),`${JSON.stringify(door)} → ${JSON.stringify(goal)}`).toBe(true);
        }
    },60000);
});

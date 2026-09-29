import { describe, expect, it } from 'vitest';
import * as C from 'cannon-es';
import { BotNavigation } from '../../src/shared/BotNavigation';
import { ChaosSimulation } from '../../src/shared/ChaosSimulation';
import { CASE_SPAWNS, DISPATCH_STATIONS } from '../../src/shared/chaosState';
import { PICKUP_ANCHORS } from '../../src/shared/pickups';
import { JURISDICTION_ZONES, JURISDICTION_ZONE_IDS } from '../../src/shared/jurisdictionZones';
import { ASSIGNMENT_DESTINATIONS, destinationContains, type DestinationId } from '../../src/shared/assignments';
import { worldSpawnPoints } from '../../src/shared/playerSpawns';
import { districtAt, type District } from '../../src/shared/city/frame';
import { DOCKS_JOBS } from '../../src/shared/city/kit/parts/docks';
import type { Vec3Data } from '../../src/shared/networkProtocol';

// Failure modes: a region left with nothing to do in some assignment; a slot spliced in from a
// kit part that sits inside geometry, floats, or cannot be walked to from where rats spawn.
const spec={seed:341283204,version:2};
const DISTRICTS:District[]=['north-west','north','north-east','west','centre','east','south-west','south','south-east'];

describe('jobs in every region',()=>{
    // The case, the supplies and Dispatch run in every assignment; Jurisdiction adds its zones.
    it.each(DISTRICTS)('%s has a case spawn, a supply site, a Dispatch pillar and a Jurisdiction zone',district=>{
        const here=(p:{x:number;z:number})=>districtAt(p.x,p.z)===district;
        expect(CASE_SPAWNS.some(here),'case spawn').toBe(true);
        expect(PICKUP_ANCHORS.some(here),'supply').toBe(true);
        expect(DISPATCH_STATIONS.some(here),'pillar').toBe(true);
        expect(JURISDICTION_ZONE_IDS.some(id=>here(JURISDICTION_ZONES[id].posts[0]!)),'zone').toBe(true);
    });
});

describe('spliced slots in the real city',()=>{
    it('rests every case spawn on a floor, clear of every wall, at the loose case size',()=>{
        const sim=new ChaosSimulation(new Map(),()=>{},undefined,spec);
        const walls=[...sim.targets].filter(([,t])=>t.kind==='world').map(([body])=>{body.updateAABB();return body.aabb;});
        for(const p of CASE_SPAWNS){
            for(const x of [-.95,0,.95])for(const z of [-.5,0,.5]){
                const hit=new C.RaycastResult();
                sim.world.raycastClosest(new C.Vec3(p.x+x,p.y+.2,p.z+z),new C.Vec3(p.x+x,p.y-1.8,p.z+z),{collisionFilterMask:1},hit);
                expect.soft(hit.hasHit,`floor under ${JSON.stringify(p)}`).toBe(true);
            }
            const blocking=walls.filter(({lowerBound:a,upperBound:b})=>b.y>p.y-.35&&a.y<p.y+.65&&b.x>p.x-.95&&a.x<p.x+.95&&b.z>p.z-.5&&a.z<p.z+.5);
            expect.soft(blocking.map(({lowerBound:a,upperBound:b})=>[a.x,a.y,a.z,b.x,b.y,b.z].map(v=>+v.toFixed(2))),`walls at ${JSON.stringify(p)}`).toEqual([]);
        }
    });

    // One navigator, as in the game. Each target is walked to from the nearest street spawn at least 20 units off.
    const nav=new BotNavigation(spec);
    const street=worldSpawnPoints(spec).map(p=>({x:p.x,y:0,z:p.z}));
    const from=(to:Vec3Data)=>street.filter(p=>Math.hypot(p.x-to.x,p.z-to.z)>=20)
        .reduce((best,p)=>Math.hypot(p.x-to.x,p.z-to.z)<Math.hypot(best.x-to.x,best.z-to.z)?p:best);
    const zoneStops=(id:'the-quay'|'gate-lane'|'south-crossing'|'pier9-floor')=>[...JURISDICTION_ZONES[id].posts,...JURISDICTION_ZONES[id].approaches]
        .map((p,i)=>({name:`${id} ${i<JURISDICTION_ZONES[id].posts.length?'post':'approach'} ${i}`,at:{...p,y:JURISDICTION_ZONES[id].floorY}}));
    const pillarSide=(id:string)=>{const s=DISPATCH_STATIONS.find(d=>d.id===id)!;return {name:`pillar ${id}`,at:{x:s.x+2,y:s.y,z:s.z}};};
    const places=[
        ...DOCKS_JOBS.caseSpawns.map((s,i)=>({name:`docks case spawn ${i}`,at:{x:s.x,y:s.y-1.3,z:s.z}})),
        ...DOCKS_JOBS.pickups.map(s=>({name:s.id,at:{x:s.x,y:(s.y??.7)-.7,z:s.z}})),
        {name:'Gate Lane case spawn',at:{x:-137,y:0,z:-40}},
        ...(['the-quay','gate-lane','south-crossing','pier9-floor'] as const).flatMap(zoneStops),
        pillarSide('quay'),pillarSide('south-avenue'),
        ...(['harbour-master','precinct'] as const).map(id=>({name:`${id} approach`,at:ASSIGNMENT_DESTINATIONS[id].approach})),
    ];
    it.each(places)('walks from a street spawn to $name',({name,at})=>{
        expect(nav.supported(at),name).toBe(true);
        const start=from(at);
        let path=nav.route(start,at);
        for(let i=0;i<600&&!path.length;i++){nav.update(20);path=nav.route(start,at);}
        const end=path.at(-1),evidence=JSON.stringify({start,end});
        expect(end,evidence).toBeDefined();
        expect(Math.hypot(end!.x-at.x,end!.z-at.z),evidence).toBeLessThanOrEqual(2.9);
        expect(Math.abs(end!.y-at.y),evidence).toBeLessThan(.5);
    });

    it.each(Object.keys(ASSIGNMENT_DESTINATIONS) as DestinationId[])('enters %s from its approach, and counts only inside',id=>{
        const d=ASSIGNMENT_DESTINATIONS[id];
        expect(destinationContains(id,d.arrival)).toBe(true);expect(destinationContains(id,d.approach)).toBe(false);
        let path=nav.route(d.approach,d.arrival);
        for(let i=0;i<600&&!path.length;i++){nav.update(20);path=nav.route(d.approach,d.arrival);}
        const end=path.at(-1);
        expect(end&&Math.hypot(end.x-d.arrival.x,end.z-d.arrival.z)<=2.9&&destinationContains(id,{...end,y:d.arrival.y}),JSON.stringify(end)).toBe(true);
    });
});

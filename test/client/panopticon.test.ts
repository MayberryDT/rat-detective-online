import { describe, expect, it } from 'vitest';
import * as C from 'cannon-es';
import * as THREE from 'three';
import { BotNavigation } from '../../src/shared/BotNavigation';
import { ChaosSimulation, type ChaosHit } from '../../src/shared/ChaosSimulation';
import { CITY_PREVIEW_SEED, GRAYBOX_VERSION } from '../../src/shared/grayboxLayout';
import { StaticCityBroadphase, addCityBody, cityBoxBody } from '../../src/shared/StaticCityBroadphase';
import { SpatialRayQuery } from '../../src/shared/SpatialRayQuery';
import { CITY_BARS_GROUP } from '../../src/shared/boxFrame';
import { worldSpawnPoints } from '../../src/shared/playerSpawns';
import { createPlayer } from '../../src/worker/gameState';
import { kitCity } from '../../src/shared/city/kit/city';
import { PRECINCT_RING } from '../../src/shared/city/kit/northPlan';
import { PRECINCT_JOBS, PRECINCT_LINEUP, PRECINCT_LOOKOUT_Y } from '../../src/shared/city/kit/parts/precinct';
import { PoliceLineup } from '../../src/feel/PoliceLineup';
import type { Vec3Data } from '../../src/shared/networkProtocol';

// Failure modes: cell bars stop cheese or let a rat through; the ring wall throws a glancing
// ball back into the yard; a floor, flight or bridge a bot cannot walk; a live rat reaching
// the lineup room, or its wall hiding the round-end lineup; the lookout blind to a cell.
const spec={seed:CITY_PREVIEW_SEED,version:GRAYBOX_VERSION};
const appearance={hatType:'fedora' as const,hatColor:1,furColor:2,coatColor:3};
const {x:CX,z:CZ}=PRECINCT_RING,DEG=Math.PI/180;
/** A point on the ring: angle in degrees (0 = east, counter-clockwise from above), radius, height. */
const ring=(deg:number,r:number,y:number)=>({x:CX+Math.cos(deg*DEG)*r,y,z:CZ-Math.sin(deg*DEG)*r});
const radius=(p:Vec3Data)=>Math.hypot(p.x-CX,p.z-CZ);
/** Floor 8, slot 1 (18°): a closed cell, bars all across its front. */
const CLOSED_CELL=18;

/** The static kit city as one Cannon world (colliders only). */
function kitWorld(){
    const world=new C.World();world.broadphase=new StaticCityBroadphase(world);world.gravity.set(0,-30,0);
    for(const b of kitCity({visuals:false}).boxes)addCityBody(world,cityBoxBody(b));
    return world;
}
function solve(nav:BotNavigation,from:Vec3Data,to:Vec3Data) {
    let route=nav.route(from,to);
    for(let i=0;i<600&&!route.length;i++){nav.update(20);route=nav.route(from,to);}
    return route;
}

describe('the Panopticon precinct',()=>{
    it('lets a server ball through cell bars into the rat behind them',()=>{
        const shooter=createPlayer('shooter','Shooter',appearance,ring(CLOSED_CELL,12,8));
        const victim=createPlayer('victim','Victim',appearance,ring(CLOSED_CELL,17.4,8));
        const hits:ChaosHit[]=[];
        const sim=new ChaosSimulation(new Map([shooter,victim].map(p=>[p.id,p])),hit=>hits.push(hit),undefined,spec);
        let now=1_000_000;sim.step(0,now);
        sim.shoot(shooter.id,{shotId:'through-bars',origin:ring(CLOSED_CELL,12.8,9.3),direction:{x:Math.cos(CLOSED_CELL*DEG),y:0,z:-Math.sin(CLOSED_CELL*DEG)}});
        for(let i=0;i<30&&!hits.length;i++){now+=1000/60;sim.step(1/60,now);}
        expect(hits).toContainEqual(expect.objectContaining({victim:victim.id,shotId:'through-bars'}));
    });

    it.each([['a player (default filter)',1,-1],['a bot',2,1|CITY_BARS_GROUP]] as const)('stops %s running into cell bars',(_,group,mask)=>{
        const world=kitWorld();
        const start=ring(CLOSED_CELL,12.5,8.05);
        const rat=new C.Body({mass:5,fixedRotation:true,collisionFilterGroup:group,collisionFilterMask:mask,position:new C.Vec3(start.x,start.y,start.z)});
        rat.addShape(new C.Sphere(.6),new C.Vec3(0,.6,0));rat.addShape(new C.Sphere(.45),new C.Vec3(0,1.3,0));
        world.addBody(rat);
        let closest=0;
        for(let i=0;i<180;i++){
            rat.velocity.x=Math.cos(CLOSED_CELL*DEG)*6;rat.velocity.z=-Math.sin(CLOSED_CELL*DEG)*6;
            world.step(1/60);closest=Math.max(closest,radius(rat.position));
        }
        // It ran the gallery up to the bars (at r 15.2) and no further; it never fell off the floor.
        expect(closest).toBeGreaterThan(14);
        expect(closest).toBeLessThan(15.2-.4);
        expect(rat.position.y).toBeGreaterThan(7.5);
    });

    it('carries a ball fired along the inside of the ring wall round the curve',()=>{
        const shooter=createPlayer('shooter','Shooter',appearance,ring(90,12,8));
        const sim=new ChaosSimulation(new Map([[shooter.id,shooter]]),()=>{},undefined,spec);
        let now=1_000_000;sim.step(0,now);
        // Counter-clockwise along the wall, turned 6° into it.
        const from=100,turn=6*DEG,a=from*DEG;
        const tangent={x:-Math.sin(a),z:-Math.cos(a)},out={x:Math.cos(a),z:-Math.sin(a)};
        sim.shoot(shooter.id,{shotId:'glance',origin:ring(from,18.3,9.8),
            direction:{x:tangent.x*Math.cos(turn)+out.x*Math.sin(turn),y:0,z:tangent.z*Math.cos(turn)+out.z*Math.sin(turn)}});
        // A glancing ball rides the curve as a string of chords: out in the cells, never back
        // across the bars (r 15.2) into the gallery, until it has come a long way round.
        let travelled=0,last=from,bounces=0,outward=true;
        for(let i=0;i<30;i++){
            now+=1000/120;sim.step(1/120,now);
            const shot=sim.snapshot(false).shots.find(s=>s.id==='glance');
            expect(shot,`ball gone after ${i} steps`).toBeDefined();
            const p=shot!.p,r=radius(p),deg=(Math.atan2(-(p.z-CZ),p.x-CX)/DEG+360)%360;
            expect(r,`step ${i}`).toBeGreaterThan(15.7);expect(r,`step ${i}`).toBeLessThan(19.05);
            travelled+=(deg-last+540)%360-180;last=deg;
            const radial=(shot!.v.x*(p.x-CX)+shot!.v.z*(p.z-CZ))/r;
            if(outward&&radial<0)bounces++;outward=radial>=0;
        }
        expect(travelled).toBeGreaterThan(90);
        expect(bounces).toBeGreaterThanOrEqual(2);
    });

    // One navigator for the whole precinct, as in the game.
    const nav=new BotNavigation(spec);
    const street={x:-105,y:0,z:-100};
    const places=[
        {name:'the front desk',at:{...PRECINCT_JOBS.destination.arrival,y:0}},
        {name:'the radio room (Dispatch)',at:{...PRECINCT_JOBS.dispatch,x:PRECINCT_JOBS.dispatch.x+2}},
        ...PRECINCT_JOBS.supplies.map(s=>({name:s.near,at:{x:s.x,y:s.y-.7,z:s.z}})),
        ...PRECINCT_JOBS.caseSpawns.map((s,i)=>({name:`case spawn ${i}`,at:{x:s.x,y:s.y-1.3,z:s.z}})),
        {name:'the house roof',at:{x:-95,y:24,z:-115}},
        {name:'gallery 8',at:ring(90,12.6,8)},
        {name:'gallery 16',at:ring(180,12.6,16)},
        {name:'the ring roof',at:ring(0,15,24)},
        {name:'the tower lookout',at:{x:CX-1,y:PRECINCT_LOOKOUT_Y,z:CZ}},
    ];
    it.each(places)('walks from the -102 street to $name',({name,at})=>{
        expect(nav.supported(at),name).toBe(true);
        const path=solve(nav,street,at),evidence=JSON.stringify(path.filter((_,i)=>i%6===0));
        expect(path.length,evidence).toBeGreaterThan(3);
        expect(Math.hypot(path.at(-1)!.x-at.x,path.at(-1)!.z-at.z),evidence).toBeLessThanOrEqual(2.9);
        expect(path.at(-1)!.y,evidence).toBeCloseTo(at.y,1);
        for(let i=1;i<path.length;i++)expect(Math.abs(path[i]!.y-path[i-1]!.y),evidence).toBeLessThan(1.2);
    });

    const L=PRECINCT_LINEUP;
    const inLineupRoom=(p:{x:number;z:number})=>Math.abs(p.x-L.x)<L.halfWidth&&p.z>L.wallZ&&p.z<L.wallZ+L.depth;
    it('keeps every live rat out of the closed lineup room',()=>{
        expect(worldSpawnPoints(spec).filter(inLineupRoom)).toEqual([]);
        const stage={x:L.x,y:L.y,z:L.wallZ+1.3};
        expect(nav.supported(stage)).toBe(true);
        const path=solve(nav,street,stage);
        expect(path.some(p=>inLineupRoom(p)),JSON.stringify(path)).toBe(false);
    });

    it('frames five lineup rats from inside the room with nothing in the way',()=>{
        const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(60,16/9,.1,500),light=new THREE.SpotLight();
        scene.add(light,light.target);
        const lineup=new PoliceLineup(scene,undefined,()=>{});
        lineup.start([0,1,2,3,4].map(i=>({id:`r${i}`,name:`Rat ${i}`,appearance:{},winner:i===0})));
        const room=scene.getObjectByName('police-lineup')!,rats=room.children.filter(c=>c instanceof THREE.Group);
        expect(rats).toHaveLength(5);
        const sight=new SpatialRayQuery(kitWorld());sight.refresh();
        const eye=new C.Vec3(),chest=new C.Vec3(),seen=new THREE.Vector3();
        for(let t=0;t<2.6;t+=.2){
            lineup.update(.2,camera,light);scene.updateMatrixWorld(true);
            for(const p of [camera.position,light.position]){
                expect(inLineupRoom(p),`${p.x},${p.z} at ${t}s`).toBe(true);
                expect(p.y).toBeGreaterThan(L.y);expect(p.y).toBeLessThan(L.height);
            }
            for(const rat of rats){
                rat.getWorldPosition(seen);
                expect(Math.abs(seen.y-L.y)).toBeLessThan(.4);
                eye.set(camera.position.x,camera.position.y,camera.position.z);chest.set(seen.x,seen.y+1.2,seen.z);
                expect(sight.closest(eye,chest,1).hasHit,`rat at ${seen.x.toFixed(1)} hidden at ${t}s`).toBe(false);
                const ndc=seen.clone().setY(seen.y+1).project(camera);
                expect(Math.abs(ndc.x)).toBeLessThan(1);expect(Math.abs(ndc.y)).toBeLessThan(1);
            }
        }
        lineup.dispose();
    });

    it('lets the lookout see into every cell on the upper tiers',()=>{
        const sight=new SpatialRayQuery(kitWorld());sight.refresh();
        const from=new C.Vec3(),to=new C.Vec3(),blind:string[]=[];
        const eyes=Array.from({length:32},(_,i)=>ring(i*11.25,3.1,PRECINCT_LOOKOUT_Y+1.6));
        for(const floor of [8,16])for(let slot=0;slot<20;slot++){
            // Somewhere inside the cell, at a rat's chest: across its width and depth.
            const inside=[-5,0,5].flatMap(d=>[16,17,18].map(r=>ring(slot*18+d,r,floor+1.2)));
            const seen=inside.some(p=>{to.set(p.x,p.y,p.z);return eyes.some(e=>{from.set(e.x,e.y,e.z);return !sight.closest(from,to,1).hasHit;});});
            if(!seen)blind.push(`${floor}:${slot}`);
        }
        expect(blind).toEqual([]);
    });
});

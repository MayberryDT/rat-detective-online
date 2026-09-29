import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Neighborhood } from '../../src/prototype/Neighborhood';
import { RatController } from '../../src/player/RatController';
import { StaticCityBroadphase } from '../../src/shared/StaticCityBroadphase';
import { ChaosSimulation } from '../../src/shared/ChaosSimulation';
import { BotNavigation } from '../../src/shared/BotNavigation';
import { CITY_PREVIEW_SEED, GRAYBOX_VERSION } from '../../src/shared/grayboxLayout';
import { NEEDLEWORKS_CHUTES, chuteFoot } from '../../src/shared/city/kit/parts/chute';

afterEach(()=>vi.restoreAllMocks());
const DT=1/60;
/** Needleworks' north wall (outer face): anything north of it has left the factory. */
const NORTH_FACE=56;

function clientWorld(){
    const world=new CANNON.World({gravity:new CANNON.Vec3(0,-25,0)});
    world.broadphase=new StaticCityBroadphase(world);world.broadphase.useBoundingBoxes=true;
    world.collisionMatrix=new CANNON.ObjectCollisionMatrix() as unknown as CANNON.ArrayCollisionMatrix;
    world.collisionMatrixPrevious=new CANNON.ObjectCollisionMatrix() as unknown as CANNON.ArrayCollisionMatrix;
    world.defaultContactMaterial.friction=0;world.defaultContactMaterial.restitution=.05;
    return world;
}

describe('Needleworks fabric chutes',()=>{
    it.each(NEEDLEWORKS_CHUTES.map(c=>[c.floor,c] as const))('carries a rat who steps in on floor %i down to the street, with no key held',(_floor,chute)=>{
        const scene=new THREE.Scene(),world=clientWorld(),stage=new Neighborhood(scene,world);
        const rat=new RatController(scene,world,new THREE.PerspectiveCamera(),'',{},new THREE.Vector3(chute.mouthX,chute.floor+.05,60));
        // Two steps north into the hatch (the default camera looks south), then let go:
        // off a chute the controller brakes to a stop, so only the ride can carry the rat out.
        let street=Infinity;
        for(let i=0;i<Math.round(5/DT);i++){
            rat.prepareMovement(DT,i<Math.round(.3/DT)?{KeyS:true}:{});world.step(DT);rat.syncAfterPhysics(DT);
            const p=rat.entity.body.position;
            if(street===Infinity&&p.y<.5&&p.z<NORTH_FACE)street=i*DT;
        }
        const p=rat.entity.body.position;
        expect(street).toBeLessThan(3.5);
        // At rest on the pavement beyond the runout, not wedged in the chute's mouth.
        expect(p.y).toBeLessThan(.5);expect(p.y).toBeGreaterThan(-.3);
        expect(p.z).toBeLessThan(chuteFoot(chute).z+.5);
        expect(rat.entity.body.velocity.length()).toBeLessThan(1);
        rat.dispose();stage.dispose();
    },20000);

    it('slides a loose case that falls in on floor 16 out to the street, where it can be picked up',()=>{
        const now=1_000_000;vi.spyOn(Date,'now').mockReturnValue(now);
        const sim=new ChaosSimulation(new Map(),()=>{},undefined,{seed:CITY_PREVIEW_SEED,version:GRAYBOX_VERSION});
        const chute=NEEDLEWORKS_CHUTES.find(c=>c.floor===16)!,body=sim.caseBody;
        sim.step(0,now);
        // Knocked into the hatch: it tumbles in just past the wall's inner face (z 57.2) with nothing to push it.
        body.position.set(chute.mouthX,chute.floor+1,56.6);body.velocity.setZero();body.angularVelocity.setZero();body.wakeUp();
        let street=Infinity;
        for(let i=1;i<=Math.round(6/DT);i++){
            sim.step(DT,now+i*DT*1000);
            if(street===Infinity&&body.position.y<1.5&&body.position.z<NORTH_FACE)street=i*DT;
        }
        expect(street).toBeLessThan(3.5);
        expect(sim.snapshot(false).case.returningUntil).toBe(0);
        expect(body.position.y).toBeLessThan(1.5);
        expect(body.position.z).toBeLessThan(chuteFoot(chute).z+.5);
    });

    it('never routes a bot through a chute: from the hatch landing to the street it takes the stairs',()=>{
        const nav=new BotNavigation({seed:CITY_PREVIEW_SEED,version:GRAYBOX_VERSION});
        for(const chute of NEEDLEWORKS_CHUTES){
            const from={x:chute.mouthX,y:chute.floor,z:59},to={x:chute.mouthX,y:0,z:chuteFoot(chute).z-3};
            let route=nav.route(from,to);
            for(let i=0;i<400&&!route.length;i++){nav.update(20);route=nav.route(from,to);}
            expect(route.length).toBeGreaterThan(0);
            // No waypoint is ever airborne outside the factory's north wall.
            for(const p of route)if(p.z<NORTH_FACE+1.2)expect(p.y,`${p.x},${p.y},${p.z}`).toBeLessThan(1.2);
        }
    });
});

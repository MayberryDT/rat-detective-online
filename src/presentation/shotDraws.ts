import * as THREE from 'three';
import {instanceGeometry} from '../utils/instanceGeometry';
import {disposeMeshResources} from '../utils/disposeMeshResources';
import {createCheeseBallGeometry,createCheeseBallMaterial} from '../weapons/CheeseProjectileModel';

/** Instanced shot draws: balls, Crossfire balls and glows, danger rims and trails, the case
 * missile's trail. Instance colours exist from the start, as play will need them, so the
 * programs never change. The title warm-up builds a one-instance set as a stand-in; the
 * welcome's full set then links nothing. */
export function createShotDraws(capacity:number){
    const ballGeometry=createCheeseBallGeometry(),glowGeometry=new THREE.SphereGeometry(.17,24,16);
    const glow=(color:number,opacity:number)=>new THREE.MeshBasicMaterial({color,side:THREE.BackSide,transparent:true,opacity,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
    const trail=(radius:number,segments:number,rings:number,color:number,opacity:number,count:number)=>
        new THREE.InstancedMesh(new THREE.SphereGeometry(radius,segments,rings),new THREE.MeshBasicMaterial({color,transparent:true,opacity,toneMapped:false,depthWrite:false}),count);
    // The second pool of each shape draws a geometry view of its own over the same buffers (see instanceGeometry).
    const draws={root:new THREE.Group(),
        bullets:new THREE.InstancedMesh(ballGeometry,createCheeseBallMaterial(),capacity),
        chargedBullets:new THREE.InstancedMesh(instanceGeometry(ballGeometry),createCheeseBallMaterial(true),capacity),
        // White: each Crossfire glow takes its heat's colour per instance.
        chargedGlow:new THREE.InstancedMesh(glowGeometry,glow(0xffffff,.96),capacity),
        dangerGlow:new THREE.InstancedMesh(instanceGeometry(glowGeometry),glow(0xff4822,.9),capacity),
        dangerTrails:trail(.1,8,6,0xffffff,.65,capacity),
        missileTrail:trail(.18,8,8,0xff2a12,.42,12),
        dispose(){draws.root.removeFromParent();disposeMeshResources(draws.root);for(const mesh of meshes)mesh.dispose();}};
    const meshes=[draws.bullets,draws.chargedBullets,draws.chargedGlow,draws.dangerGlow,draws.dangerTrails,draws.missileTrail];
    const names=['cheese-balls','crossfire-balls','crossfire-glow','danger-cheese-rims','danger-cheese-trails','case-missile-trail'];
    meshes.forEach((mesh,i)=>{mesh.count=0;mesh.frustumCulled=false;mesh.name=names[i]!;draws.root.add(mesh);});
    // Every ball pool carries instance colours from the start (the clarity batch dims non-threats through them).
    for(const mesh of [draws.bullets,draws.chargedBullets,draws.chargedGlow,draws.dangerGlow,draws.dangerTrails])mesh.setColorAt(0,new THREE.Color(1,1,1));
    return draws;
}

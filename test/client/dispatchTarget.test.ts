import {it,expect} from 'vitest';
import * as THREE from 'three';
import {buildDispatchModel} from '../../src/prototype/DispatchModel';
import {DISPATCH_STATIONS} from '../../src/shared/chaosState';
import {disposeMeshResources} from '../../src/utils/disposeMeshResources';
it('matches the enlarged red target to its authoritative shooting hitbox',()=>{
 const station=DISPATCH_STATIONS[0],root=new THREE.Group(),texture=new THREE.Texture();
 root.position.set(station.box.x,station.box.y,station.box.z);
 const {switchHandle}=buildDispatchModel(root,texture);root.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(switchHandle),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 expect(size.x).toBeCloseTo(station.target.w);expect(size.y).toBeCloseTo(station.target.h);expect(size.z).toBeCloseTo(station.target.d);
 expect(center.x).toBeCloseTo(station.target.x);expect(center.y).toBeCloseTo(station.target.y);expect(center.z).toBeCloseTo(station.target.z);
 disposeMeshResources(root);texture.dispose();
});

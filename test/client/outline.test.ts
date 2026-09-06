import { expect, it } from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RatController } from '../../src/player/RatController';

it('aligns the glow on spawn, in the same frame as turning, and on respawn', () => {
  const scene = new THREE.Scene();
  const controller = new RatController(scene, new CANNON.World(), new THREE.PerspectiveCamera(),
    'Rat', {}, new THREE.Vector3(15, 2, -10));
  const entity = controller.entity;
  const glow = scene.children.find(child => child instanceof THREE.Group && child !== entity.mesh)!;
  const expectAligned = () => {
    expect(glow.position.toArray()).toEqual(entity.mesh.position.toArray());
    expect(glow.quaternion.toArray()).toEqual(entity.mesh.quaternion.toArray());
    expect(glow.scale.toArray()).toEqual([1.08, 1.08, 1.08]);
  };
  expectAligned();
  for (const turn of [250, -500, 100]) {
    controller.onMouseMove(turn, 0);
    controller.update(1 / 60, {});
    expectAligned();
  }
  entity.takeDamage(3, new THREE.Vector3(10, 0, 0));
  controller.update(1 / 60, {});
  expectAligned();
  entity.respawn({ x: -15, y: 2, z: 20, hp: 3 });
  expectAligned();
  entity.dispose();
});

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
    expect(glow.scale.toArray()).toEqual([1, 1, 1]);
  };
  expectAligned();
  // Check the actual shell, not just the root transform: every part stays
  // anchored and expands by 2.5cm along its normals, including shared ears/eyes.
  const modelParts: THREE.Mesh[] = [];
  const glowParts: THREE.Mesh[] = [];
  entity.mesh.traverse(child => { if (child instanceof THREE.Mesh) modelParts.push(child); });
  glow.traverse(child => { if (child instanceof THREE.Mesh) glowParts.push(child); });
  expect(glowParts).toHaveLength(modelParts.length);
  modelParts.forEach((part, index) => {
    const outline = glowParts[index];
    expect(outline.position.toArray()).toEqual(part.position.toArray());
    expect(outline.scale.toArray()).toEqual(part.scale.toArray());
    expect(outline.quaternion.toArray()).toEqual(part.quaternion.toArray());
    const original = part.geometry.getAttribute('position');
    const normals = part.geometry.getAttribute('normal');
    const expanded = outline.geometry.getAttribute('position');
    for (let i = 0; i < original.count; i++) {
      for (const axis of ['getX', 'getY', 'getZ'] as const) {
        expect(expanded[axis](i)).toBeCloseTo(original[axis](i) + normals[axis](i) * 0.025, 6);
      }
    }
  });
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

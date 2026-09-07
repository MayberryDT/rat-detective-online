import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RatEntity } from '../../src/entities/RatEntity';

describe('character resource ownership', () => {
  it('releases all owned resources exactly once without disposing another player', () => {
    const scene = new THREE.Scene();
    const world = new CANNON.World();
    const first = new RatEntity(scene, world, new THREE.Vector3(), 'Leaving', {});
    const owned = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
    scene.traverse(child => {
      if (child instanceof THREE.Mesh) {
        owned.add(child.geometry);
        for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
          owned.add(material);
        }
      }
    });
    owned.add(first.billboard.sprite.material);
    owned.add(first.billboard.sprite.material.map!);
    const disposal = [...owned].map(resource => vi.spyOn(resource, 'dispose'));

    const second = new RatEntity(scene, world, new THREE.Vector3(4, 0, 0), 'Staying', {});
    const secondGeometry = (second.mesh.getObjectByProperty('isMesh', true) as THREE.Mesh).geometry;
    const secondDispose = vi.spyOn(secondGeometry, 'dispose');
    const spriteGeometryDispose = vi.spyOn(second.billboard.sprite.geometry, 'dispose');

    first.dispose();
    first.dispose();
    for (const dispose of disposal) expect(dispose).toHaveBeenCalledTimes(1);
    expect(secondDispose).not.toHaveBeenCalled();
    expect(spriteGeometryDispose).not.toHaveBeenCalled();
    expect(world.bodies).toEqual([second.body]);
    expect(scene.children).toHaveLength(3); // second model, outline, billboard
    second.update(1 / 60);
    expect(second.mesh.parent).toBe(scene);
    second.dispose();
    expect(world.bodies).toHaveLength(0);
    expect(scene.children).toHaveLength(0);
  });
});

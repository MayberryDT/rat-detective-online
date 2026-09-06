import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RatEntity } from '../../src/entities/RatEntity';

describe('respawn after ragdoll', () => {
  it.each([false, true])('restores alive physics and UI (remote=%s)', (isRemote) => {
    const scene = new THREE.Scene();
    const world = new CANNON.World();
    const entity = new RatEntity(scene, world, new THREE.Vector3(), 'Rat', {}, isRemote);
    // Run two lifecycles to catch stale death timers/phase state.
    for (let cycle = 0; cycle < 2; cycle++) {
      entity.takeDamage(3, new THREE.Vector3(30, 0, 0));
      expect(entity.dead).toBe(true);
      expect(entity.body.type).toBe(CANNON.Body.DYNAMIC);
      expect(entity.body.mass).toBe(2);
      expect(entity.billboard.sprite.parent).toBeNull();
      entity.update(0.8);
      entity.update(1);
      entity.update(0.7);
      expect(entity.body.sleepState).toBe(CANNON.Body.SLEEPING);

      entity.respawn({ x: 15, y: 2, z: -15, hp: 3 });
      expect(entity.dead).toBe(false);
      expect(entity.hp).toBe(3);
      expect(entity.body.mass).toBe(isRemote ? 0 : 5);
      expect(entity.body.type).toBe(isRemote ? CANNON.Body.KINEMATIC : CANNON.Body.DYNAMIC);
      expect(entity.body.fixedRotation).toBe(true);
      expect(entity.body.linearDamping).toBe(isRemote ? 0 : 0.01);
      expect(entity.body.angularDamping).toBe(isRemote ? 0 : 0.01);
      expect(entity.body.sleepState).toBe(CANNON.Body.AWAKE);
      expect(entity.body.position.toArray()).toEqual([15, 2, -15]);
      expect(entity.body.velocity.toArray()).toEqual([0, 0, 0]);
      expect(entity.body.angularVelocity.toArray()).toEqual([0, 0, 0]);
      expect(entity.body.quaternion.toArray()).toEqual([0, 0, 0, 1]);
      expect(entity.mesh.position.toArray()).toEqual([15, 2, -15]);
      expect(entity.mesh.quaternion.toArray()).toEqual([0, 0, 0, 1]);
      expect(entity.billboard.sprite.parent).toBe(scene);
      expect(entity.billboard.sprite.visible).toBe(true);
      expect(entity.mesh.visible).toBe(true);
    }
    entity.dispose();
  });
});

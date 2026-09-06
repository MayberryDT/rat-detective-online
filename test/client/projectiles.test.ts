import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CheeseGun } from '../../src/weapons/CheeseGun';
import { RatEntity } from '../../src/entities/RatEntity';

function setup() {
  const scene = new THREE.Scene();
  const world = new CANNON.World();
  const owner = new RatEntity(scene, world, new THREE.Vector3(), 'Shooter', {});
  const gun = new CheeseGun(scene, world, {} as THREE.AudioListener);
  const projectiles = () => scene.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
  return { scene, world, owner, gun, projectiles };
}

describe('projectile behavior', () => {
  it('shares GPU resources across shots and retains them until gun disposal', () => {
    const { gun, owner, projectiles } = setup();
    gun.shoot(owner, new THREE.Vector3(100, 1.45, 0));
    const first = projectiles()[0];
    const geometryDispose = vi.spyOn(first.geometry, 'dispose');
    const materialDispose = vi.spyOn(first.material as THREE.Material, 'dispose');
    gun.update(4.99);
    for (let i = 0; i < 100; i++) gun.shoot(owner, new THREE.Vector3(100, 1.45, 0));
    gun.update(0.02);
    expect(projectiles()).toHaveLength(100);
    expect(new Set(projectiles().map(ball => ball.geometry)).size).toBe(1);
    expect(new Set(projectiles().map(ball => ball.material)).size).toBe(1);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    gun.dispose();
    gun.dispose();
    expect(projectiles()).toHaveLength(0);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    gun.shoot(owner, new THREE.Vector3(100, 1.45, 0));
    expect(projectiles()).toHaveLength(0);
  });

  it('keeps camera-based aim convergence rather than aiming at the supplied fallback', () => {
    const { gun, owner, scene, projectiles } = setup();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 4, 10);
    camera.lookAt(0, 4, 0);
    camera.updateMatrixWorld();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 1), new THREE.MeshBasicMaterial());
    wall.position.set(0, 4, -10);
    scene.add(wall);
    scene.updateMatrixWorld(true);
    gun.setPlayer(camera, owner);
    gun.shoot(owner, new THREE.Vector3(100, 1.45, 0));
    const ball = projectiles().find(mesh => mesh !== wall)!;
    const expectedDirection = new THREE.Vector3(0, 4 - 1.45, -9.5).normalize();
    const expectedOrigin = new THREE.Vector3(0, 1.45, 0).addScaledVector(expectedDirection, 0.6);
    expect(ball.position.distanceTo(expectedOrigin)).toBeLessThan(1e-12);
  });

  it('preserves launch offset, speed, gravity, and five-second lifetime', () => {
    const { gun, owner, projectiles } = setup();
    gun.shoot(owner, new THREE.Vector3(100, 1.45, 0));
    const ball = projectiles()[0];
    expect(ball.position.toArray()).toEqual([0.6, 1.45, 0]);
    gun.update(0.02);
    expect(ball.position.x).toBeCloseTo(4.1, 12);
    expect(ball.position.y).toBeCloseTo(1.44, 12);
    gun.update(0.02);
    expect(ball.position.x).toBeCloseTo(7.6, 12);
    expect(ball.position.y).toBeCloseTo(1.42, 12);
    gun.update(4.96);
    expect(projectiles()).toHaveLength(1);
    gun.update(0.001);
    expect(projectiles()).toHaveLength(0);
  });

  it('keeps wall ricochets at 90% speed and clears ray results between shots', () => {
    const { gun, owner, world, projectiles } = setup();
    const wall = new CANNON.Body({ mass: 0 });
    wall.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 10, 10)));
    wall.position.set(4, 0, 0);
    world.addBody(wall);
    gun.shoot(owner, new THREE.Vector3(100, 1.45, 0));
    const ball = projectiles()[0];
    gun.update(0.02);
    expect(ball.position.x).toBeCloseTo(3.45, 12);
    gun.update(0.01);
    expect(ball.position.x).toBeCloseTo(1.875, 12);
    // An opposite-direction shot must not inherit the preceding ray's hit.
    gun.shoot(owner, new THREE.Vector3(-100, 1.45, 0));
    const other = projectiles()[1];
    gun.update(0.01);
    expect(other.position.x).toBeCloseTo(-2.35, 12);
  });

  it.each([{ height: 1.3, damage: 1 }, { height: 1.9, damage: 3 }])(
    'preserves damage for hits at height $height', ({ height, damage }) => {
      const { gun, owner, world, scene, projectiles } = setup();
      const victim = new RatEntity(scene, world, new THREE.Vector3(3, 0, 0), 'Target', {});
      owner.mesh.position.y = height - 1.45;
      const hit = vi.fn();
      gun.onHitEntity = hit;
      gun.shoot(owner, new THREE.Vector3(100, height, 0));
      gun.update(0.02);
      expect(victim.hp).toBe(3 - damage);
      expect(hit).toHaveBeenCalledWith(victim, damage);
      expect(projectiles()).toHaveLength(0);
    },
  );

  it('does not apply local damage for a remote shooter', () => {
    const { gun, owner, world, scene, projectiles } = setup();
    owner.isRemote = true;
    const victim = new RatEntity(scene, world, new THREE.Vector3(3, 0, 0), 'Target', {});
    const hit = vi.fn();
    gun.onHitEntity = hit;
    gun.shoot(owner, new THREE.Vector3(100, 1.45, 0));
    gun.update(0.02);
    expect(victim.hp).toBe(3);
    expect(hit).not.toHaveBeenCalled();
    expect(projectiles()).toHaveLength(1);
  });

  it('reports remote victim hits without locally changing their health', () => {
    const { gun, owner, world, scene } = setup();
    const victim = new RatEntity(scene, world, new THREE.Vector3(3, 0, 0), 'Target', {}, true);
    const hit = vi.fn();
    gun.onHitEntity = hit;
    gun.shoot(owner, new THREE.Vector3(100, 1.45, 0));
    gun.update(0.02);
    expect(victim.hp).toBe(3);
    expect(hit).toHaveBeenCalledWith(victim, 1);
  });
});

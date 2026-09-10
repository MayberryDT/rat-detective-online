import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CheeseGun } from '../../src/weapons/CheeseGun';
import { RatEntity } from '../../src/entities/RatEntity';
import { RatController } from '../../src/player/RatController';

function setup() {
  const scene = new THREE.Scene();
  const world = new CANNON.World();
  const owner = new RatEntity(scene, world, new THREE.Vector3(), 'Shooter', {});
  const gun = new CheeseGun(scene, world, {} as THREE.AudioListener);
  const projectiles = () => scene.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
  return { scene, world, owner, gun, projectiles };
}

describe('projectile behavior', () => {
  it('keeps immediate gun feedback but never draws a guessed straight ball during Bad Ammunition', () => {
    const {gun,owner,projectiles}=setup();gun.authoritative=true;
    gun.setIncident('bad-ammunition');
    const animate=vi.spyOn(owner,'playShootAnimation');
    const shot=gun.shoot(owner,new THREE.Vector3(100,1.45,0))!;
    expect(animate).toHaveBeenCalledOnce();expect(gun.fireCue).toBe('malfunction');
    expect(owner.mesh.getObjectByName('rat-muzzle-flash')!.visible).toBe(true);
    gun.predictShot(owner,shot);gun.update(1/60);
    expect(projectiles()).toHaveLength(0);expect(gun.predictedBallCount).toBe(0);
    // Ordinary/centered shots become immediate again at incident expiry.
    gun.setIncident();expect(gun.fireCue).toBe('normal');
    gun.predictShot(owner,{...shot,shotId:'after-expiry'});expect(projectiles()).toHaveLength(1);
    gun.dispose();owner.dispose();
  });

  it('clears pending straight previews when Bad Ammunition starts, preserving other incident predictions', () => {
    const {gun,owner,projectiles}=setup();gun.authoritative=true;
    const shot={shotId:'pending',origin:{x:0,y:2,z:0},direction:{x:1,y:0,z:0}};
    gun.setIncident('scattershot');gun.predictShot(owner,shot);expect(projectiles()).toHaveLength(1);
    gun.setIncident('bad-ammunition');expect(projectiles()).toHaveLength(0);
    gun.setIncident('popcorn-panic');gun.predictShot(owner,shot);expect(projectiles()).toHaveLength(1);
    gun.dispose();owner.dispose();
  });

  it('shows an authoritative local shot at the muzzle immediately and hands off by shot ID', () => {
    const {gun,owner,projectiles}=setup();gun.authoritative=true;
    const shot=gun.shoot(owner,new THREE.Vector3(100,1.45,0))!;
    expect(projectiles()).toHaveLength(0);
    gun.predictShot(owner,shot);gun.predictShot(owner,shot);
    expect(projectiles()).toHaveLength(1);
    expect(projectiles()[0].position.toArray()).toEqual([shot.origin.x,shot.origin.y,shot.origin.z]);
    gun.update(1/60);
    expect(projectiles()[0].position.x).toBeCloseTo(shot.origin.x+shot.direction.x*175/60);
    gun.reconcilePredictedShots([{id:'other-shot'}]);expect(projectiles()).toHaveLength(1);
    gun.reconcilePredictedShots([{id:shot.shotId}]);expect(projectiles()).toHaveLength(0);
    gun.dispose();owner.dispose();
  });

  it('never applies damage or sends a hit for a visual prediction', () => {
    const {gun,owner,world,scene,projectiles}=setup();gun.authoritative=true;
    const victim=new RatEntity(scene,world,new THREE.Vector3(3,0,0),'Target',{});
    const hit=vi.fn();gun.onHitEntity=hit;
    gun.predictShot(owner,{shotId:'prediction',origin:{x:1,y:1.45,z:0},direction:{x:1,y:0,z:0}});
    gun.update(.02);
    expect(victim.hp).toBe(3);expect(hit).not.toHaveBeenCalled();expect(projectiles()).toHaveLength(0);
    gun.dispose();owner.dispose();victim.dispose();
  });

  it('bounds pending prediction memory and removes unconfirmed shots after half a second', () => {
    const {gun,owner,projectiles}=setup();gun.authoritative=true;
    for(let i=0;i<100;i++)gun.predictShot(owner,{shotId:`pending-${i}`,origin:{x:10,y:10,z:10},direction:{x:1,y:0,z:0}});
    expect(projectiles()).toHaveLength(32);
    gun.update(.51);expect(projectiles()).toHaveLength(0);
    gun.dispose();owner.dispose();
  });

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
    wall.userData.aimTarget = true;
    scene.add(wall);
    scene.updateMatrixWorld(true);
    gun.setPlayer(camera, owner);
    const shot = gun.shoot(owner, new THREE.Vector3(100, 1.45, 0))!;
    const ball = projectiles().find(mesh => mesh !== wall)!;
    expect(ball.position.distanceTo(owner.getMuzzlePosition())).toBeLessThan(1e-12);
    const direction = new THREE.Vector3(shot.direction.x, shot.direction.y, shot.direction.z);
    const convergence = ball.position.clone().addScaledVector(direction, (-9.5 - ball.position.z) / direction.z);
    expect(convergence.distanceTo(new THREE.Vector3(0, 4, -9.5))).toBeLessThan(1e-10);
  });

  it.each([0, 1.2, 3])('converges on the reticle after a shoulder-camera update without rendering (rear wall: %s)', rearWall => {
    const scene = new THREE.Scene(), world = new CANNON.World();
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 600);
    const material = new THREE.MeshBasicMaterial();
    if (rearWall) {
      const obstruction = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 1), material);
      obstruction.position.set(0, 5, -rearWall);
      obstruction.userData.aimTarget = true;
      scene.add(obstruction);
    }
    const player = new RatController(scene, world, camera, '', {}, new THREE.Vector3());
    player.updateView();
    // Compute the expected screen center independently without refreshing the
    // real camera matrix. This recreates firing before the renderer sees it.
    const expectedCamera = camera.clone();
    expectedCamera.updateMatrixWorld(true);
    const viewRay = new THREE.Raycaster();
    viewRay.setFromCamera(new THREE.Vector2(), expectedCamera);
    const target = viewRay.ray.at(25, new THREE.Vector3());
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), material);
    wall.position.copy(target);
    wall.quaternion.copy(expectedCamera.quaternion);
    wall.userData.aimTarget = true;
    scene.add(wall);
    scene.updateMatrixWorld(true);
    const gun = new CheeseGun(scene, world, {} as THREE.AudioListener);
    gun.authoritative = true;
    gun.setPlayer(camera, player.entity);
    const shot = gun.shoot(player.entity, new THREE.Vector3(100, 0, 0))!;
    const ray = new THREE.Ray(new THREE.Vector3(shot.origin.x, shot.origin.y, shot.origin.z),
      new THREE.Vector3(shot.direction.x, shot.direction.y, shot.direction.z));
    const convergence = ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(viewRay.ray.direction, target), new THREE.Vector3())!;
    expect(convergence.distanceTo(target)).toBeLessThan(1e-9);
    const screen = convergence.project(expectedCamera);
    expect(Math.abs(screen.x)).toBeLessThan(1e-9);
    expect(Math.abs(screen.y)).toBeLessThan(1e-9);
    gun.dispose(); player.dispose();
    scene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
    material.dispose();
  });

  it('launches from the pistol and preserves speed, gravity, and five-second lifetime', () => {
    const { gun, owner, projectiles } = setup();
    const shot = gun.shoot(owner, new THREE.Vector3(100, 1.45, 0))!;
    const ball = projectiles()[0];
    expect(ball.position.distanceTo(owner.getMuzzlePosition())).toBeLessThan(1e-12);
    const origin = ball.position.clone();
    const direction = new THREE.Vector3(shot.direction.x, shot.direction.y, shot.direction.z);
    gun.update(0.02);
    expect(ball.position.distanceTo(origin.clone().addScaledVector(direction, 3.5).add(new THREE.Vector3(0, -0.01, 0)))).toBeLessThan(1e-10);
    gun.update(0.02);
    expect(ball.position.distanceTo(origin.clone().addScaledVector(direction, 7).add(new THREE.Vector3(0, -0.03, 0)))).toBeLessThan(1e-10);
    gun.update(4.96);
    expect(projectiles()).toHaveLength(1);
    gun.update(0.001);
    expect(projectiles()).toHaveLength(0);
  });

  it('keeps wall ricochets at 90% speed and clears ray results between shots', () => {
    const { gun, owner, world, scene, projectiles } = setup();
    const wall = new CANNON.Body({ mass: 0 });
    wall.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 10, 10)));
    wall.position.set(4, 0, 0);
    world.addBody(wall);
    gun.replayShot(owner, { shotId: 'bounce', origin: { x: 0.6, y: 1.45, z: 0 }, direction: { x: 1, y: 0, z: 0 } });
    const ball = projectiles()[0];
    gun.update(0.02);
    expect(ball.position.x).toBeCloseTo(3.45, 12);
    const effects = scene.getObjectByName('cheese-impact-effects')!;
    expect((effects.children[0] as THREE.InstancedMesh).count).toBe(7);
    expect((effects.children[1] as THREE.InstancedMesh).count).toBe(1);
    gun.update(0.01);
    expect(ball.position.x).toBeCloseTo(1.875, 12);
    // An opposite-direction shot must not inherit the preceding ray's hit.
    gun.replayShot(owner, { shotId: 'opposite', origin: { x: -0.6, y: 1.45, z: 0 }, direction: { x: -1, y: 0, z: 0 } });
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
    const shot = gun.shoot(owner, new THREE.Vector3(100, 1.45, 0))!;
    gun.update(0.02);
    expect(victim.hp).toBe(3);
    expect(hit).not.toHaveBeenCalled();
    expect(projectiles()).toHaveLength(1);
    expect(projectiles()[0].position.x).toBeCloseTo(shot.origin.x + shot.direction.x * 3.5);
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
  it('replays the resolved origin/direction despite a different interpolated owner position', () => {
    const local = setup();
    const remote = setup();
    remote.owner.isRemote = true;
    remote.owner.mesh.position.set(50, 20, -30);
    const shot = local.gun.shoot(local.owner, new THREE.Vector3(100, 4, 10))!;
    remote.gun.replayShot(remote.owner, shot);
    expect(remote.projectiles()[0].position.toArray()).toEqual(local.projectiles()[0].position.toArray());
    for (let i = 0; i < 60; i++) {
      local.gun.update(1 / 60); remote.gun.update(1 / 60);
      expect(remote.projectiles()[0].position.toArray()).toEqual(local.projectiles()[0].position.toArray());
    }
    local.gun.clearProjectiles(); remote.gun.clearProjectiles();
    expect(local.projectiles()).toHaveLength(0);
    expect(remote.projectiles()).toHaveLength(0);
    local.gun.dispose(); remote.gun.dispose(); local.owner.dispose(); remote.owner.dispose();
  });

  it('does not let cosmetic geometry change camera aim convergence', () => {
    const { gun, owner, scene } = setup();
    const camera = new THREE.PerspectiveCamera(60, 1, .1, 100);
    camera.position.set(0, 4, 10); camera.lookAt(0, 4, 0); camera.updateMatrixWorld();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 1), new THREE.MeshBasicMaterial());
    wall.position.set(0, 4, -10); wall.userData.aimTarget = true; scene.add(wall);
    scene.updateMatrixWorld(true); gun.setPlayer(camera, owner);
    const first = gun.shoot(owner, new THREE.Vector3())!;
    const decoration = new THREE.Mesh(new THREE.SphereGeometry(2), new THREE.MeshBasicMaterial({ transparent: true, opacity: .06 }));
    decoration.position.set(0, 4, 5); scene.add(decoration); scene.updateMatrixWorld(true);
    const next = gun.shoot(owner, new THREE.Vector3())!;
    expect(next.origin).toEqual(first.origin);
    expect(next.direction).toEqual(first.direction);
    gun.dispose(); owner.dispose(); wall.geometry.dispose(); (wall.material as THREE.Material).dispose();
    decoration.geometry.dispose(); (decoration.material as THREE.Material).dispose();
  });

});

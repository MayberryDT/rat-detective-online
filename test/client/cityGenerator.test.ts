import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CityGenerator } from '../../src/world/CityGenerator';
import {
  DEFAULT_CITY_OPTIONS,
  createWorldSpec,
  generateBuildingLayout,
} from '../../src/shared/worldSpec';

function makeCity(seed = 42, options = DEFAULT_CITY_OPTIONS) {
  const scene = new THREE.Scene();
  const world = new CANNON.World();
  const spec = createWorldSpec(seed);
  const city = new CityGenerator(scene, world, options, spec);
  city.generate();
  return { scene, world, spec, city };
}

describe('city generator', () => {
  it('builds static colliders that match the shared layout', () => {
    const { city, spec } = makeCity(42);
    const layout = generateBuildingLayout(spec);
    const bodies = city.getBuildingBodies();
    expect(bodies).toHaveLength(layout.length);
    for (let i = 0; i < layout.length; i++) {
      const building = layout[i];
      const body = bodies[i];
      const box = body.shapes[0] as CANNON.Box;
      expect(body.type).toBe(CANNON.Body.STATIC);
      expect(body.mass).toBe(0);
      expect(body.position.x).toBeCloseTo(building.cx);
      expect(body.position.y).toBeCloseTo(building.bh / 2);
      expect(body.position.z).toBeCloseTo(building.cz);
      expect(box.halfExtents.x).toBeCloseTo(building.bw / 2);
      expect(box.halfExtents.y).toBeCloseTo(building.bh / 2);
      expect(box.halfExtents.z).toBeCloseTo(building.bd / 2);
    }
  });

  it('keeps decoration independent from collider layout', () => {
    const spec = createWorldSpec(21);
    const layout = generateBuildingLayout(spec);
    const first = makeCity(21);
    const second = makeCity(21);
    expect(first.city.getCounts().buildings).toBe(layout.length);
    expect(first.city.getCounts().rooftops).toBe(second.city.getCounts().rooftops);
    expect(first.city.getCounts().lampPoles).toBe(second.city.getCounts().lampPoles);
    expect(first.city.getBuildingBodies().map(body => body.position.toArray()))
      .toEqual(second.city.getBuildingBodies().map(body => body.position.toArray()));
    first.city.dispose();
    second.city.dispose();
  });

  it('batches repeated dashes and opaque lamps while keeping cone meshes', () => {
    const { city } = makeCity(3);
    const counts = city.getCounts();
    expect(counts.buildings).toBe(144);
    expect(counts.roadMeshes).toBe(24);
    expect(counts.dashInstances).toBe(1008);
    expect(counts.dashBatches).toBe(24);
    expect(counts.lampPoles).toBe(counts.lampHeads);
    expect(counts.lampCones).toBe(counts.lampPoles);
    expect(counts.sceneObjects).toBeLessThan(700);
    expect(counts.geometries).toBeLessThan(400);
    expect(counts.materials).toBeLessThan(200);
    city.dispose();
  });

  it('disposes owned scenery twice without touching later objects', () => {
    const { scene, world, city } = makeCity(8);
    const owned = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
    scene.traverse(child => {
      if (child instanceof THREE.Mesh) {
        owned.add(child.geometry);
        for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
          owned.add(material);
          const standard = material as THREE.MeshStandardMaterial;
          if (standard.emissiveMap) owned.add(standard.emissiveMap);
          if (standard.map) owned.add(standard.map);
        }
      }
    });
    const spies = [...owned].map(resource => vi.spyOn(resource, 'dispose'));
    const leftover = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    scene.add(leftover);
    const leftoverGeo = vi.spyOn(leftover.geometry, 'dispose');

    city.dispose();
    city.dispose();
    for (const dispose of spies) expect(dispose).toHaveBeenCalledTimes(1);
    expect(leftoverGeo).not.toHaveBeenCalled();
    expect(world.bodies).toHaveLength(0);
    expect(scene.children).toEqual([leftover]);

    city.generate();
    expect(city.getCounts().buildings).toBe(144);
    expect(world.bodies).toHaveLength(144);
    city.dispose();
    leftover.geometry.dispose();
    leftover.material.dispose();
  });

  it('animates only decorations without adding bodies or changing collision layout', () => {
    const {city, world, scene} = makeCity(20260905);
    const poses = world.bodies.map(body => body.position.toArray());
    const count = scene.children.length;
    const camera = new THREE.PerspectiveCamera();
    for (let frame = 0; frame < 350; frame++) city.update(0.1, camera);
    expect(world.bodies.map(body => body.position.toArray())).toEqual(poses);
    expect(scene.children).toHaveLength(count);
    city.dispose(); city.update(1, camera);
    expect(scene.children).toHaveLength(0);
  });

  it('accepts a custom numeric city for tests and benchmarks', () => {
    const tiny = {
      gridSize: 2,
      blockSpacing: 24,
      streetWidth: 10,
      minHeight: 8,
      maxHeight: 10,
      buildingWidthMin: 4,
      buildingWidthMax: 5,
    };
    const { city, spec } = makeCity(5, tiny);
    expect(generateBuildingLayout(spec, tiny)).toHaveLength(4);
    expect(city.getCounts().buildings).toBe(4);
    expect(city.getCounts().roadMeshes).toBe(4);
    city.dispose();
  });
});

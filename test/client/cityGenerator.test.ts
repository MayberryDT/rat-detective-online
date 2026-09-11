import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CityGenerator } from '../../src/world/CityGenerator';
import {CENTRAL_BUILDINGS,skylineMasses} from '../../src/shared/skyline';
import {grayboxBoxes} from '../../src/shared/grayboxLayout';
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
  it('can yield between buildings while preserving the complete synchronous city',()=>{
    const reference=makeCity(42),scene=new THREE.Scene(),world=new CANNON.World();
    const incremental=new CityGenerator(scene,world,DEFAULT_CITY_OPTIONS,reference.spec);
    const steps=incremental.generateSteps();expect(steps.next().done).toBe(false);
    expect(world.bodies.length).toBeLessThan(reference.world.bodies.length);
    for(const _step of steps) { /* Each next call represents a separate preparation slice. */ }
    expect(incremental.getCounts()).toEqual(reference.city.getCounts());
    expect(world.bodies.map(b=>b.position.toArray())).toEqual(reference.world.bodies.map(b=>b.position.toArray()));
    incremental.dispose();reference.city.dispose();
  });
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
    const lanterns=scene.children.filter((o):o is THREE.InstancedMesh=>o instanceof THREE.InstancedMesh
      &&o.material instanceof THREE.MeshStandardMaterial&&o.material.emissiveIntensity>2.9);
    expect(lanterns.length).toBeGreaterThan(0);
    const emission=()=>lanterns.map(o=>({power:(o.material as THREE.MeshStandardMaterial).emissiveIntensity,colors:o.instanceColor?.array.slice()}));
    const steady=emission();
    for (let frame = 0; frame < 350; frame++) {city.update(0.1, camera);expect(emission()).toEqual(steady);}
    expect(world.bodies.map(body => body.position.toArray())).toEqual(poses);
    expect(scene.children).toHaveLength(count);
    city.dispose(); city.update(1, camera);
    expect(scene.children).toHaveLength(0);
  });

  it('animates room uniforms without texture uploads or additional scene objects', () => {
    const {city, scene} = makeCity(17);
    const materials: THREE.MeshStandardMaterial[] = [];
    scene.traverse(object => {
      if (object instanceof THREE.Mesh && object.userData.aimTarget) materials.push(object.material as THREE.MeshStandardMaterial);
    });
    const textures = materials.map(material => material.emissiveMap!);
    const versions = textures.map(texture => texture.version);
    const initialCount = scene.children.length;
    const uniformValues: {value: number}[] = [];
    for (const material of materials) {
      const shader = {uniforms: {} as Record<string, {value: unknown}>,
        vertexShader: '', fragmentShader: '#include <common>\n#include <emissivemap_fragment>'};
      material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
      expect(shader.fragmentShader).toContain('roomLight5');
      expect(shader.fragmentShader).toContain('totalEmissiveRadiance *= occupancy');
      expect(shader.fragmentShader).toContain('diffuseColor.rgb = mix');
      const lower = shader.uniforms.roomRect0.value as THREE.Vector4;
      expect(lower.toArray()).toEqual([0,0,.5,1/3]);
      uniformValues.push(shader.uniforms.roomLight0 as {value: number});
    }
    expect(uniformValues).toHaveLength(materials.length);
    for (let frame = 0; frame < 170; frame++) city.update(0.1);
    expect(uniformValues.some(uniform => uniform.value < 0.5)).toBe(true);
    expect(textures.map(texture => texture.version)).toEqual(versions);
    expect(scene.children.length).toBe(initialCount);
    city.dispose();
  });

  it('renders all six downtown towers with the exact shared physical setbacks', () => {
    const scene=new THREE.Scene(),world=new CANNON.World();
    const city=new CityGenerator(scene,world,DEFAULT_CITY_OPTIONS,createWorldSpec(42));
    city.generate(CENTRAL_BUILDINGS,true);
    const expected=CENTRAL_BUILDINGS.flatMap(skylineMasses);
    const bodies=city.getBuildingBodies();
    expect(bodies).toHaveLength(18);
    const server=grayboxBoxes();
    bodies.forEach((body,i)=>{
      const m=expected[i],half=(body.shapes[0] as CANNON.Box).halfExtents;
      expect(body.position.toArray()).toEqual([m.x,m.y,m.z]);
      expect(half.toArray()).toEqual([m.w/2,m.h/2,m.d/2]);
      expect(server.some(box=>box.original&&box.x===m.x&&box.y===m.y&&box.z===m.z&&box.w===m.w&&box.h===m.h&&box.d===m.d)).toBe(true);
    });
    const targets=scene.children.filter(o=>o.userData.aimTarget) as THREE.Mesh[];
    expect(targets).toHaveLength(18);
    targets.forEach((mesh,i)=>expect(mesh.position.toArray()).toEqual([expected[i].x,expected[i].y,expected[i].z]));
    city.dispose();
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

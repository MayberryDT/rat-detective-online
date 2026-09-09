import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Neighborhood } from '../../src/prototype/Neighborhood';
import { LANDMARK_INTERIORS } from '../../src/shared/landmarkLayout';

// Isolate the prototype's real hall geometry and lighting from unrelated city decoration.
vi.mock('../../src/world/CityGenerator', () => ({
  CityGenerator: class { generate() {} update() {} dispose() {} },
}));
vi.mock('../../src/utils/RatModel', async () => {
  const THREE = await import('three');
  return { createRatMesh: () => new THREE.Group() };
});

describe('steady landmark illumination and sewer-only moving lights', () => {
  let neighborhood: Neighborhood;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  beforeAll(() => { neighborhood = new Neighborhood(scene, new CANNON.World()); });
  afterAll(() => neighborhood.dispose());

  it('keeps actual upper-floor surfaces readable, including the rear of every landmark', () => {
    for (const hall of LANDMARK_INTERIORS) for (const level of hall.levels) {
      let litVertices = 0;
      let rearVertices = 0;
      for (const mesh of scene.children) {
        if (!(mesh instanceof THREE.Mesh) || !mesh.visible) continue;
        const positions = mesh.geometry.getAttribute('position');
        const light = mesh.geometry.getAttribute('fixedIllumination');
        if (!light) continue;
        const point = new THREE.Vector3();
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
          if (Math.abs(point.y - level) > .1
            || Math.abs(point.x - hall.cx) >= hall.w / 2 - 1
            || Math.abs(point.z - hall.cz) >= hall.d / 2 - 1) continue;
          expect(light.getY(i), `${hall.id} level ${level}`).toBeGreaterThanOrEqual(.015);
          litVertices++;
          if (point.z < hall.cz) rearVertices++;
        }
      }
      expect(litVertices, `${hall.id} level ${level} floor`).toBeGreaterThan(10);
      expect(rearVertices, `${hall.id} level ${level} rear`).toBeGreaterThan(2);
    }
  });

  it('uses no moving lights above ground, and only underground sources in the sewer', () => {
    const lights = scene.children.filter((child): child is THREE.PointLight => child instanceof THREE.PointLight);
    expect(lights).toHaveLength(8);
    for (const point of [[-30, 20, -70], [146, 12, 112], [-85, 20, 75], [20, 4, 20]]) {
      camera.position.set(...point as [number, number, number]);
      neighborhood.update(.016, camera);
      expect(lights.every(light => light.intensity === 0)).toBe(true);
    }
    camera.position.set(0, -3, 0);
    neighborhood.update(.016, camera);
    expect(lights.every(light => light.intensity > 0 && light.position.y < 0)).toBe(true);
  });

  it('keeps the rendered ceiling and gallery at the same positions as their simple aim proxies', () => {
    scene.updateMatrixWorld(true);
    const blockers=scene.children.filter(object=>object.userData.aimTarget===true);
    const ray=new THREE.Raycaster();
    for(const [x,dy,expectedY] of [[-16,1,24],[-36,-1,16]]){
      ray.set(new THREE.Vector3(x,20,-59),new THREE.Vector3(0,dy,0));
      ray.far=30;
      const hit=ray.intersectObjects(blockers,true)[0];
      expect(hit.point.y).toBeCloseTo(expectedY,5);
      expect((hit.object as THREE.Mesh).geometry.index?.count).toBe(36);
    }
  });
});

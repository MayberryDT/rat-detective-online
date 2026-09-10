import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Neighborhood } from '../../src/prototype/Neighborhood';
import { LANDMARK_INTERIORS } from '../../src/shared/landmarkLayout';
import { STREET_LAMPS } from '../../src/shared/grayboxLayout';
import { SEWER_MANHOLE, SEWER_PIPE_ENTRANCES, sewerPipePoint } from '../../src/shared/sewerLayout';
import { SEWER_PORTAL_LIGHTS } from '../../src/prototype/SewerLighting';

// Isolate the prototype's real hall geometry and lighting from unrelated city decoration.
vi.mock('../../src/world/CityGenerator', () => ({
  CityGenerator: class { generate() {} *generateSteps() {} update() {} dispose() {} },
}));
vi.mock('../../src/utils/RatModel', async () => {
  const THREE = await import('three');
  return { createRatMesh: () => new THREE.Group() };
});

it('lights the authored street poles as well as supplemental lamps in the trial',()=>{
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
  const neighborhood=new Neighborhood(scene,new CANNON.World(),undefined,'pools');
  const [x,z]=STREET_LAMPS[1];camera.position.set(x,3,z);neighborhood.update(.016,camera);
  const lights=scene.children.filter((o):o is THREE.SpotLight=>o instanceof THREE.SpotLight);
  expect(lights).toHaveLength(4);
  expect(lights.some(l=>l.position.x===x&&l.position.z===z&&l.position.y===9&&l.intensity>0)).toBe(true);
  neighborhood.dispose();expect(scene.children.some(o=>o instanceof THREE.SpotLight)).toBe(false);
});

it('releases partially prepared city resources when the page closes',async()=>{
  const scene=new THREE.Scene(),world=new CANNON.World(),page=new AbortController();page.abort();
  await expect(Neighborhood.prepare(scene,world,{seed:1,version:2},page.signal)).rejects.toMatchObject({name:'AbortError'});
  expect(scene.children).toHaveLength(0);expect(world.bodies).toHaveLength(0);
});

describe('steady landmark illumination and sewer-only moving lights', () => {
  let neighborhood: Neighborhood;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  beforeAll(() => { neighborhood = new Neighborhood(scene, new CANNON.World(),undefined,'classic'); });
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

  it('keeps sewer lights off away from entrances and uses underground sources in the main sewer', () => {
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

  it('lights every entrance and the complete descending throat with the same eight lights',()=>{
    const lights=scene.children.filter((child):child is THREE.PointLight=>child instanceof THREE.PointLight);
    expect(lights).toHaveLength(8);
    for(const entry of SEWER_PIPE_ENTRANCES)for(const distance of [-5,0,6,14,22,30]){
      const point=sewerPipePoint(entry,distance);
      const anchor={x:point.x,y:point.floorY+.3,z:point.z};
      camera.position.set(point.x,point.floorY+5,point.z);
      neighborhood.update(.016,camera,anchor);
      const nearby=lights.filter(l=>l.intensity>0&&l.position.distanceTo(new THREE.Vector3(point.x,point.floorY+1,point.z))<l.distance);
      expect(nearby.length,`${entry.name} at ${distance}`).toBeGreaterThan(0);
      expect(nearby.some(l=>SEWER_PORTAL_LIGHTS.some(s=>s.x===l.position.x&&s.y===l.position.y&&s.z===l.position.z))).toBe(true);
      expect(lights.every(l=>!l.castShadow)).toBe(true);
    }
    expect(scene.children.filter(o=>o instanceof THREE.PointLight)).toHaveLength(8);
  });

  it('lights the open shaft and shuts entrance lighting off above rooftops',()=>{
    const lights=scene.children.filter((child):child is THREE.PointLight=>child instanceof THREE.PointLight);
    camera.position.set(SEWER_MANHOLE.x,6,SEWER_MANHOLE.z);
    neighborhood.update(.016,camera,{x:SEWER_MANHOLE.x,y:.3,z:SEWER_MANHOLE.z});
    expect(lights.some(l=>l.intensity>0&&l.position.y===-.9)).toBe(true);
    neighborhood.update(.016,camera,{x:SEWER_MANHOLE.x,y:10,z:SEWER_MANHOLE.z});
    expect(lights.every(l=>l.intensity===0)).toBe(true);
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

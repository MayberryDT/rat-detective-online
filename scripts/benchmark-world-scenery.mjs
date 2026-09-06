import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmpDir = resolve(root, '.wrangler/tmp-world-scenery');
const outfile = resolve(tmpDir, 'city-generator.mjs');

globalThis.document = {
  createElement: (tag) => {
    if (tag !== 'canvas') return {};
    return {
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: '',
        fillRect() {},
        clearRect() {},
        strokeText() {},
        fillText() {},
      }),
    };
  },
};

mkdirSync(tmpDir, { recursive: true });
const entry = resolve(tmpDir, 'entry.ts');
writeFileSync(entry, `export { CityGenerator } from '../../src/world/CityGenerator.ts';
export { DEFAULT_CITY_OPTIONS, createWorldSpec } from '../../src/shared/worldSpec.ts';
`);

await build({
  absWorkingDir: root,
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  packages: 'external',
  logLevel: 'silent',
});

// Execute the actual reference revision instead of trusting recorded constants.
const referenceSource = execFileSync('git', ['show', '08e8005:src/world/CityGenerator.ts'], { cwd: root, encoding: 'utf8' });
const referenceEntry = resolve(tmpDir, 'reference.ts');
const referenceOut = resolve(tmpDir, 'reference.mjs');
writeFileSync(referenceEntry, referenceSource);
await build({ entryPoints: [referenceEntry], outfile: referenceOut, bundle: true, format: 'esm',
  platform: 'neutral', packages: 'external', logLevel: 'silent' });
function measure(scene, world) {
  const geometry = new Set(), materials = new Set(), textures = new Set();
  let meshes = 0, instances = 0;
  scene.traverse(object => {
    if (!object.isMesh) return;
    meshes++; if (object.isInstancedMesh) instances++;
    geometry.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      if (material.map) textures.add(material.map);
      if (material.emissiveMap) textures.add(material.emissiveMap);
    }
  });
  return { sceneChildren: scene.children.length, meshes, instancedMeshes: instances,
    uniqueGeometries: geometry.size, uniqueMaterials: materials.size,
    uniqueTextures: textures.size, physicsBodies: world.bodies.length };
}
function seeded(seed) {
  let t = seed;
  return () => { t += 0x6d2b79f5; let n = Math.imul(t ^ (t >>> 15), 1 | t);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n); return ((n ^ (n >>> 14)) >>> 0) / 4294967296; };
}

try {
  const { CityGenerator, DEFAULT_CITY_OPTIONS, createWorldSpec } = await import(pathToFileURL(outfile).href);

  const reference = await import(pathToFileURL(referenceOut).href);
  const referenceScene = new THREE.Scene();
  const referenceWorld = new CANNON.World();
  const originalRandom = Math.random;
  try {
    Math.random = seeded(1);
    new reference.CityGenerator(referenceScene, referenceWorld, DEFAULT_CITY_OPTIONS).generate();
  } finally { Math.random = originalRandom; }
  const before = measure(referenceScene, referenceWorld);
  const scene = new THREE.Scene();
  const world = new CANNON.World();
  const city = new CityGenerator(scene, world, DEFAULT_CITY_OPTIONS, createWorldSpec(1));
  city.generate();

  const geos = new Set();
  const mats = new Set();
  const texs = new Set();
  let meshes = 0;
  let instanced = 0;
  scene.traverse((obj) => {
    if (obj.isMesh) {
      meshes += 1;
      if (obj.isInstancedMesh) instanced += 1;
      geos.add(obj.geometry);
      for (const material of Array.isArray(obj.material) ? obj.material : [obj.material]) {
        mats.add(material);
        if (material.map) texs.add(material.map);
        if (material.emissiveMap) texs.add(material.emissiveMap);
      }
    }
  });

  const after = {
    sceneChildren: scene.children.length,
    meshes,
    instancedMeshes: instanced,
    uniqueGeometries: geos.size,
    uniqueMaterials: mats.size,
    uniqueTextures: texs.size,
    physicsBodies: world.bodies.length,
    counts: city.getCounts(),
  };

  const report = {
    scenario: 'Default 12x12 noir city, seed 1, no players; actual reference revision 08e8005',
    before,
    after,
    reductions: {
      sceneChildren: before.sceneChildren - after.sceneChildren,
      uniqueGeometries: before.uniqueGeometries - after.uniqueGeometries,
      uniqueMaterials: before.uniqueMaterials - after.uniqueMaterials,
    },
    notes:
      'Before executes reference08e8005 with seeded Math.random. After separates layout/decor RNG, so procedural layouts differ; these are scene resource counts, not identical-view frame-time comparisons. Dashes remain1008 instances in24batches. Transparent cones remain individual meshes sharing resources.',
  };

  const outDir = resolve(root, 'docs/verification');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'world-scenery-benchmark.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  city.dispose();
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

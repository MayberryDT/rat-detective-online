import * as THREE from 'three';
import { createStage } from '../../src/session/createStage';
import { CityGenerator } from '../../src/world/CityGenerator';
import { createWorldSpec, DEFAULT_CITY_OPTIONS } from '../../src/shared/worldSpec';
import { RatEntity } from '../../src/entities/RatEntity';

const stage = createStage(new THREE.WebGLRenderer({ antialias: true }));
stage.renderer.setPixelRatio(1);
stage.renderer.setSize(780, 493);
stage.camera.aspect = 780 / 493;
stage.camera.updateProjectionMatrix();
stage.camera.position.set(15, 3.6, 23);
stage.camera.lookAt(15, 1.3, 15);
stage.flashlight.position.set(15, 5, 22);
stage.flashlight.target.position.set(15, 1.2, 15);
const city = new CityGenerator(stage.scene, stage.world, DEFAULT_CITY_OPTIONS, createWorldSpec(20260905));
city.generate();
for (const [i, hatType] of (['fedora', 'trilby', 'porkpie'] as const).entries()) {
    new RatEntity(stage.scene, stage.world, new THREE.Vector3(12.6 + i * 2.4, 1, 15), hatType,
        { hatType, hatColor: 0xa73bc8, furColor: 0xc8a078, coatColor: 0x223377 }, true).update(0);
}
// Expand only the already-generated batches: geometry, materials and transforms stay identical.
const batches = stage.scene.children.filter((object): object is THREE.InstancedMesh => object instanceof THREE.InstancedMesh);
const expanded: THREE.Mesh[] = [];
for (const batch of batches) {
    for (let i = 0; i < batch.count; i++) {
        const mesh = new THREE.Mesh(batch.geometry, batch.material);
        batch.getMatrixAt(i, mesh.matrix);
        mesh.matrix.premultiply(batch.matrix);
        mesh.matrixAutoUpdate = false;
        mesh.castShadow = batch.castShadow;
        mesh.receiveShadow = batch.receiveShadow;
        mesh.layers.mask = batch.layers.mask;
        mesh.visible = false;
        stage.scene.add(mesh);
        expanded.push(mesh);
    }
}
const output = document.querySelector('#result') as HTMLPreElement;
const button = document.querySelector('#measure') as HTMLButtonElement;
function selectMode(batched: boolean) {
    batches.forEach(mesh => { mesh.visible = batched; });
    expanded.forEach(mesh => { mesh.visible = !batched; });
}
function percentile(values: number[], p: number) {
    const sorted = [...values].sort((a, b) => a - b);
    return Number(sorted[Math.floor((sorted.length - 1) * p)].toFixed(3));
}
async function measure(batched: boolean) {
    selectMode(batched);
    const frames: number[] = [], renderTimes: number[] = [];
    let previous = 0;
    for (let i = 0; i < 360; i++) {
        const now = await new Promise<number>(resolve => requestAnimationFrame(resolve));
        const start = performance.now();
        stage.renderer.render(stage.scene, stage.camera);
        const duration = performance.now() - start;
        if (i >= 60) { frames.push(now - previous); renderTimes.push(duration); }
        previous = now;
    }
    const info = stage.renderer.info;
    return { mode: batched ? 'instanced' : 'separate-meshes', samples: frames.length,
        frameMedianMs: percentile(frames, .5), frameP95Ms: percentile(frames, .95),
        renderCpuMedianMs: percentile(renderTimes, .5), renderCpuP95Ms: percentile(renderTimes, .95),
        calls: info.render.calls, triangles: info.render.triangles,
        geometries: info.memory.geometries, textures: info.memory.textures };
}
button.addEventListener('click', async () => {
    button.disabled = true;
    output.textContent = 'Measuring separate meshes (60 warm-up + 300 measured frames)…';
    const before = await measure(false);
    output.textContent = 'Measuring instanced scenery (60 warm-up + 300 measured frames)…';
    const after = await measure(true);
    output.textContent = JSON.stringify({ seed: 20260905, viewport: [780, 493], before, after,
        note: 'Equivalent mesh expansion isolates batching; this is not the old random world. CPU submission time is not GPU time. Frame timings depend on browser scheduling.' }, null, 2);
    button.disabled = false;
});
stage.renderer.render(stage.scene, stage.camera);

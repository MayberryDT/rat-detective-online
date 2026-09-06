import * as THREE from 'three';
import { RatEntity } from '../../src/entities/RatEntity';
import { createStage } from '../../src/session/createStage';
import { DEFAULT_CITY_OPTIONS, createWorldSpec } from '../../src/shared/worldSpec';
import { CityGenerator } from '../../src/world/CityGenerator';

const VIEWPORT = { width: 780, height: 493 };
const DEFAULT_SEED = 20260905;
const HATS = [
    { hatType: 'fedora' as const, hatColor: 0xdc4a3c, furColor: 0xe8b84d, coatColor: 0xbe4545, name: 'Fedora' },
    { hatType: 'trilby' as const, hatColor: 0x3498db, furColor: 0xc8c8d0, coatColor: 0x3a5f95, name: 'Trilby' },
    { hatType: 'porkpie' as const, hatColor: 0x2ecc71, furColor: 0xd4a06a, coatColor: 0x45945a, name: 'Porkpie' },
];
const POSITIONS = [
    new THREE.Vector3(12.6, 1, 15),
    new THREE.Vector3(15, 1, 15),
    new THREE.Vector3(17.4, 1, 15),
];

function mulberry32(seed: number): () => number {
    let t = seed >>> 0;
    return () => {
        t += 0x6d2b79f5;
        let n = Math.imul(t ^ (t >>> 15), 1 | t);
        n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
        return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
    };
}

function parseSeed(): number {
    const raw = new URLSearchParams(window.location.search).get('seed');
    const value = raw ? Number(raw) : DEFAULT_SEED;
    return Number.isFinite(value) ? value >>> 0 : DEFAULT_SEED;
}

const STATES = ['alive', 'turned', 'damaged', 'dead', 'respawn'] as const;
type FixtureState = typeof STATES[number];
function parseState(): FixtureState {
    const raw = new URLSearchParams(window.location.search).get('state');
    return STATES.includes(raw as FixtureState) ? raw as FixtureState : 'alive';
}

const seed = parseSeed();
const random = mulberry32(seed);
Math.random = random;

const renderer = new THREE.WebGLRenderer({ antialias: true });
const stage = createStage(renderer);
stage.renderer.setSize(VIEWPORT.width, VIEWPORT.height);
stage.renderer.setPixelRatio(1);
stage.camera.aspect = VIEWPORT.width / VIEWPORT.height;
stage.camera.updateProjectionMatrix();

const worldSpec = createWorldSpec(seed);
const city = new CityGenerator(stage.scene, stage.world, DEFAULT_CITY_OPTIONS, worldSpec);
city.generate();

let rats: RatEntity[] = [];
function resetRats() {
    rats.forEach(rat => rat.dispose());
    Math.random = mulberry32(seed);
    rats = HATS.map((appearance, index) => {
        const rat = new RatEntity(stage.scene, stage.world, POSITIONS[index].clone(), appearance.name, appearance, true);
        rat.mesh.rotation.y = Math.PI;
        rat.update(0);
        return rat;
    });
}

stage.flashlight.position.set(15, 5, 22);
stage.flashlight.target.position.set(15, 1.2, 15);
stage.camera.position.set(15, 3.6, 23);
stage.camera.lookAt(15, 1.3, 15);

const status = document.querySelector('#fixture-status') as HTMLOutputElement;
const buttons = Object.fromEntries(STATES.map(state => [state, document.querySelector(`#btn-${state}`) as HTMLButtonElement]));
let currentState: FixtureState = 'alive';
let ready = false;

function rendererStats() {
    const info = stage.renderer.info;
    return {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
    };
}

function writeStatus() {
    const stats = rendererStats();
    status.dataset.ready = ready ? 'true' : 'false';
    status.dataset.state = currentState;
    status.dataset.seed = String(seed);
    status.value = [
        `ready=${ready}`,
        `seed=${seed}`,
        `state=${currentState}`,
        `hats=fedora,trilby,porkpie`,
        `calls=${stats.calls} triangles=${stats.triangles} geometries=${stats.geometries} textures=${stats.textures}`,
    ].join('\n');
    for (const [name, button] of Object.entries(buttons)) {
        button.setAttribute('aria-pressed', name === currentState ? 'true' : 'false');
    }
}

function stepPhysics(ticks: number) {
    for (let tick = 0; tick < ticks; tick++) {
        stage.world.step(1 / 60);
        rats.forEach(rat => rat.update(1 / 60));
    }
}

function setState(state: FixtureState) {
    ready = false;
    currentState = state;
    writeStatus();
    resetRats();
    stage.camera.position.set(15, 3.6, 23);
    stage.camera.lookAt(15, 1.3, 15);
    stage.flashlight.position.set(15, 5, 22);
    stage.flashlight.target.position.set(15, 1.2, 15);
    if (state === 'turned') {
        rats.forEach((rat, index) => { rat.mesh.rotation.y = [0, Math.PI / 2, -Math.PI / 2][index]; rat.update(0); });
    } else if (state === 'damaged') {
        rats.forEach(rat => rat.takeDamage(1, new THREE.Vector3(1, 0, 0)));
        rats.forEach(rat => rat.update(0.05));
    } else if (state === 'dead' || state === 'respawn') {
        rats.forEach(rat => rat.takeDamage(3, new THREE.Vector3(1, 0, 0)));
        stepPhysics(180);
        if (state === 'dead') {
            const center = rats.reduce((sum, rat) => sum.add(rat.mesh.position), new THREE.Vector3()).multiplyScalar(1 / rats.length);
            stage.camera.position.set(center.x, 4.5, center.z + 8);
            stage.camera.lookAt(center.x, 0.5, center.z);
            stage.flashlight.position.set(center.x, 5, center.z + 7);
            stage.flashlight.target.position.set(center.x, 0.5, center.z);
        }
        if (state === 'respawn') {
            rats.forEach((rat, index) => {
                rat.respawn({ x: POSITIONS[index].x, y: POSITIONS[index].y, z: POSITIONS[index].z, hp: 3 });
                rat.mesh.rotation.y = Math.PI;
                rat.update(0);
            });
        }
    }
    stage.renderer.render(stage.scene, stage.camera);
    ready = true;
    writeStatus();
}

for (const state of STATES) buttons[state].addEventListener('click', () => setState(state));

window.addEventListener('resize', () => {
    stage.renderer.setSize(VIEWPORT.width, VIEWPORT.height);
    setState(currentState);
});

setState(parseState());

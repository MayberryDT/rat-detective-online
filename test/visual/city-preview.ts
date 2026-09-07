import * as THREE from 'three';
import { createStage } from '../../src/session/createStage';
import { CityGenerator } from '../../src/world/CityGenerator';
import { createWorldSpec, DEFAULT_CITY_OPTIONS } from '../../src/shared/worldSpec';
import { RatEntity } from '../../src/entities/RatEntity';

const stage = createStage(new THREE.WebGLRenderer({ antialias: true }));
const city = new CityGenerator(stage.scene, stage.world, DEFAULT_CITY_OPTIONS, createWorldSpec(20260905));
city.generate();
const rat = new RatEntity(stage.scene, stage.world, new THREE.Vector3(15, 0, 15), '', {hatType:'fedora', coatColor:0xbe4545, hatColor:0xdc4a3c,furColor:0xe8b84d}, true);
rat.mesh.rotation.y = 0.4; rat.billboard.sprite.visible = false;
stage.flashlight.position.set(15, 5, 23); stage.flashlight.target.position.set(15, 0, 15);
const target = new THREE.Vector3();
const eye = new THREE.Vector3();
let orbit = false, angle = 0;
function view(name: string) {
    if (name === 'skyline') { eye.set(62, 72, 85); target.set(0, 22, 0); }
    else if (name === 'props') { eye.set(-3,2.5,12); target.set(-3,1,6); }
    else if (name === 'corner') { eye.set(23, 7, 24); target.set(0, 9, 0); }
    else { eye.set(15, 4.2, 31); target.set(15, 7, -14); }
    angle = 0;
    for (const id of ['street','corner','props','skyline']) document.getElementById(id)!.setAttribute('aria-pressed', String(id === name));
}
for (const name of ['street','corner','props','skyline']) document.getElementById(name)!.onclick = () => view(name);
document.getElementById('orbit')!.onclick = () => {
    orbit = !orbit; document.getElementById('orbit')!.setAttribute('aria-pressed', String(orbit));
};
function resize() {
    stage.renderer.setSize(innerWidth, innerHeight);
    stage.camera.aspect = innerWidth / innerHeight; stage.camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize(); view('street');
let last = performance.now();
const offset = new THREE.Vector3();
stage.renderer.setAnimationLoop(now => {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (orbit) angle += dt * 0.14;
    offset.copy(eye).sub(target).applyAxisAngle(THREE.Object3D.DEFAULT_UP, angle);
    stage.camera.position.copy(target).add(offset); stage.camera.lookAt(target);
    rat.update(dt); city.update(dt, stage.camera); stage.renderer.render(stage.scene, stage.camera);
});
window.addEventListener('pagehide', () => {
    stage.renderer.setAnimationLoop(null); window.removeEventListener('resize',resize);
    rat.dispose(); city.dispose(); stage.dispose();
});

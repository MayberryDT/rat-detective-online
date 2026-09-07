import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RatEntity } from '../../src/entities/RatEntity';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x292531);
scene.fog = new THREE.Fog(0x292531, 10, 28);
scene.add(new THREE.HemisphereLight(0xfff4e8, 0x403645, 0.8));
const key = new THREE.DirectionalLight(0xffeee0, 1.8);
key.position.set(-3, 7, 5); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); key.shadow.normalBias = 0.02; scene.add(key);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x292531, roughness: 1 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.02; floor.receiveShadow = true; scene.add(floor);
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) });
const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(ground);
const rats = [
    { hatType: 'fedora' as const, hatColor: 0xdc4a3c, furColor: 0xe8b84d, coatColor: 0xbe4545 },
    { hatType: 'trilby' as const, hatColor: 0x3498db, furColor: 0xc8c8d0, coatColor: 0x3a5f95 },
    { hatType: 'porkpie' as const, hatColor: 0x2ecc71, furColor: 0xd4a06a, coatColor: 0x45945a },
].map((options) => new RatEntity(scene, world, new THREE.Vector3(0, 0, 0), '', options));
// Variants overlap in the studio; only collide with the floor, not each other.
rats.forEach(rat => { rat.body.collisionFilterGroup = 2; rat.body.collisionFilterMask = 1; });
let selectedHat = 0;
function selectHat() {
    rats.forEach((rat, index) => {
        rat.mesh.visible = index === selectedHat;
        rat.billboard.sprite.visible = false;
    });
    // Hide the matching outline root as well; only one hero is shown at a time.
    const outlines = scene.children.filter(child => child instanceof THREE.Group && !rats.some(rat => rat.mesh === child));
    outlines.forEach((outline, index) => { outline.visible = index === selectedHat; });
}
selectHat();
let moving = false;
let time = 0;
let view = 0;
let heading = 0;
let targetHeading = 0;
document.getElementById("turn")!.onclick = () => { targetHeading += Math.PI / 2; };
function resize() {
    const width = innerWidth > 800 ? innerWidth * 0.68 : innerWidth;
    renderer.setSize(width, innerHeight);
    camera.aspect = width / innerHeight;
    frameCamera();
}
function frameCamera() {
    camera.position.set(view === 1 ? -5 : view === 2 ? 0 : -2.5, 2.25, view === 1 ? 1.6 : view === 2 ? -5.5 : 5.5);
    const target = new THREE.Vector3(0, 1.15, -0.3);
    camera.position.sub(target).multiplyScalar(Math.max(1, 0.72 / camera.aspect)).add(target);
    camera.lookAt(target); camera.updateProjectionMatrix();
}
for (const id of ['idle', 'move']) document.getElementById(id)!.onclick = () => {
    moving = id === 'move';
    document.getElementById('idle')!.setAttribute('aria-pressed', String(!moving));
    document.getElementById('move')!.setAttribute('aria-pressed', String(moving));
};
document.getElementById('shoot')!.onclick = () => rats.forEach(rat => rat.playShootAnimation());
document.getElementById('hit')!.onclick = () => {
    const rat = rats[selectedHat];
    if (!rat.dead) {
        rat.hp = 3;
        rat.takeDamage(1, new THREE.Vector3(0, 0, -12));
    }
};
document.getElementById('defeat')!.onclick = () => {
    rats[selectedHat].takeDamage(3, new THREE.Vector3(0, 0, -12));
};
document.getElementById('respawn')!.onclick = () => {
    rats.forEach(rat => rat.respawn({ x: 0, y: 0, z: 0, hp: 3 }));
    time = 0; selectHat(); resize();
};
document.getElementById('view')!.onclick = () => { view = (view + 1) % 3; resize(); };
document.getElementById('hat')!.onclick = () => {
    selectedHat = (selectedHat + 1) % rats.length; selectHat();
    document.getElementById('hat')!.textContent = `Hat: ${['Fedora', 'Trilby', 'Porkpie'][selectedHat]}`;
};
window.addEventListener('resize', resize); resize();
let last = performance.now();
renderer.setAnimationLoop(now => {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (moving) time += dt;
    if (rats.some(rat => rat.dead)) world.step(1 / 60, dt, 3);
    heading = THREE.MathUtils.lerp(heading, targetHeading, 1 - Math.exp(-7 * dt));
    rats.forEach(rat => {
        if (!rat.dead) rat.mesh.rotation.y = heading;
        if (!rat.dead) {
            rat.body.position.y = 0;
            rat.body.velocity.set(0, 0, 0);
        }
        if (moving && !rat.dead) rat.body.position.z = Math.sin(time * 4) * 0.9;
        rat.update(dt);
    });
    // Follow the full launch so the existing exaggerated motion stays in view.
    frameCamera();
    if (rats[selectedHat].dead) {
        const center = rats[selectedHat].mesh.localToWorld(new THREE.Vector3(0, 0.95, 0));
        camera.position.sub(new THREE.Vector3(0, 1.15, -0.3)).add(center);
        camera.lookAt(center);
    }
    renderer.render(scene, camera);
});
window.addEventListener('pagehide', () => {
    renderer.setAnimationLoop(null); rats.forEach(rat => rat.dispose());
    floor.geometry.dispose(); (floor.material as THREE.Material).dispose(); key.shadow.dispose(); renderer.dispose();
});

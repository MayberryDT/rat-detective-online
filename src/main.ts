import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CityGenerator } from './world/CityGenerator';
import { RatController } from './player/RatController';
import { CheeseGun } from './weapons/CheeseGun';
import { TestRat } from './enemies/TestRat';
import { initEntitySounds } from './entities/RatEntity';

// ─── RENDERER ─────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// ─── SCENE ────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x150a20);
scene.fog = new THREE.FogExp2(0x150a20, 0.005);

// ─── CAMERA ───────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  600
);
camera.layers.enable(1); // Render layer 1 (billboard sprites) but raycasters stay on layer 0

// ─── AUDIO ────────────────────────────────────────────────────────
const listener = new THREE.AudioListener();
camera.add(listener);

// Initialize entity sound effects (rat hit, rat death, player hit)
initEntitySounds(listener);

const backgroundMusic = new THREE.Audio(listener);
const audioLoader = new THREE.AudioLoader();

let musicBufferReady = false;
let gameStarted = false; // Declared early for visibility in loader callback

/**
 * Robust helper to play background music once ready and context is live
 */
const playMusic = () => {
  if (musicBufferReady && !backgroundMusic.isPlaying) {
    if (listener.context.state === 'suspended') {
      listener.context.resume().then(() => {
        backgroundMusic.play();
        console.log("Audio context resumed and music started.");
      });
    } else {
      backgroundMusic.play();
      console.log("Music started (context already running).");
    }
  }
};

audioLoader.load('/music/main-theme.mp3', (buffer) => {
  backgroundMusic.setBuffer(buffer);
  backgroundMusic.setLoop(true);
  backgroundMusic.setVolume(0.4);
  musicBufferReady = true;
  // If the user already clicked start before loading finished
  if (gameStarted) {
    playMusic();
  }
});

// Global "prime" to unlock audio context on any first interaction
const unlockAudio = () => {
  if (listener.context.state === 'suspended') {
    listener.context.resume();
  }
  window.removeEventListener('click', unlockAudio);
  window.removeEventListener('mousedown', unlockAudio);
  window.removeEventListener('touchstart', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
};
window.addEventListener('click', unlockAudio);
window.addEventListener('mousedown', unlockAudio);
window.addEventListener('touchstart', unlockAudio);
window.addEventListener('keydown', unlockAudio);

// ─── LIGHTING ─────────────────────────────────────────────────────

// 1. Ambient — purple-grey wash so nothing is ever pitch black
const ambient = new THREE.AmbientLight(0x664488, 0.7);
scene.add(ambient);

// 1b. Hemisphere — sky/ground fill to ensure base visibility
const hemiLight = new THREE.HemisphereLight(0x8866aa, 0x222222, 1.2);
scene.add(hemiLight);

// 2. Directional — the Moon (pale blue)
const moonLight = new THREE.DirectionalLight(0xaaaaff, 1.2);
moonLight.position.set(50, 100, 50);
moonLight.target.position.set(0, 0, 0);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
moonLight.shadow.camera.near = 10;
moonLight.shadow.camera.far = 300;
moonLight.shadow.camera.left = -150;
moonLight.shadow.camera.right = 150;
moonLight.shadow.camera.top = 150;
moonLight.shadow.camera.bottom = -150;
moonLight.shadow.bias = -0.0005;
scene.add(moonLight);
scene.add(moonLight.target);

// 3. Player Flashlight — warm yellow cone that follows the rat
const flashlight = new THREE.SpotLight(0xfffebb, 2.0, 40, 0.6, 0.5, 1.2);
flashlight.castShadow = true;
flashlight.shadow.mapSize.set(512, 512);
flashlight.shadow.camera.near = 0.5;
flashlight.shadow.camera.far = 40;
scene.add(flashlight);
scene.add(flashlight.target);

// ─── PHYSICS WORLD ────────────────────────────────────────────────
const world = new CANNON.World({
  gravity: new CANNON.Vec3(0, -25, 0),
});
world.broadphase = new CANNON.NaiveBroadphase();
(world.solver as CANNON.GSSolver).iterations = 10;
world.defaultContactMaterial.friction = 0.0;
world.defaultContactMaterial.restitution = 0.05;

// Ground physics body
const groundBody = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC });
groundBody.addShape(new CANNON.Plane());
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

// ─── GROUND MESH ──────────────────────────────────────────────────
const groundGeo = new THREE.PlaneGeometry(800, 800);
const groundMat = new THREE.MeshStandardMaterial({
  color: 0x555555,
  roughness: 0.9,
  metalness: 0.05,
});
const groundMesh = new THREE.Mesh(groundGeo, groundMat);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

// ─── CITY ─────────────────────────────────────────────────────────
const city = new CityGenerator(scene, world, {
  gridSize: 12,
  blockSpacing: 30,
  streetWidth: 14,
  minHeight: 18,
  maxHeight: 85,
  buildingWidthMin: 8,
  buildingWidthMax: 14,
});
city.generate();

// ─── CHEESE GUN (Manager) ─────────────────────────────────────────
const cheeseGun = new CheeseGun(scene, world, listener);

// ─── PLAYER ───────────────────────────────────────────────────────
const rat = new RatController(scene, world, camera);

// Wire up the camera-based aiming for the player
cheeseGun.setPlayer(camera, rat.entity);

// Mark as player entity (for correct hit/death sounds)
rat.entity.isPlayer = true;

// Player billboard stays visible so you can see your name and health

// ─── ENEMIES (Spread Throughout City) ─────────────────────────────
const MAX_ENEMIES = 6;
const enemies: TestRat[] = [];

// Spawn NPCs at a reasonable distance from the player (40-100 units)
// so they're visible in the fog and reachable
function spawnEnemy(): void {
  const playerPos = rat.entity.mesh.position;

  // Random direction from player
  const angle = Math.random() * Math.PI * 2;
  const dist = 40 + Math.random() * 60; // 40-100 units from player

  const x = playerPos.x + Math.cos(angle) * dist;
  const z = playerPos.z + Math.sin(angle) * dist;

  const pos = new THREE.Vector3(x, 2, z);
  enemies.push(new TestRat(scene, world, pos, rat.entity, cheeseGun));
}

// Initial spawn
for (let i = 0; i < 4; i++) spawnEnemy();

// ─── INPUT ────────────────────────────────────────────────────────
const keys: Record<string, boolean> = {};
window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// ─── GAME STATE ───────────────────────────────────────────────────
// (gameStarted declared above in Audio section)

const entryScreen = document.getElementById('entry-screen');
const startButton = document.getElementById('start-prompt');

if (startButton && entryScreen) {
  startButton.addEventListener('click', (e) => {
    e.stopPropagation();
    gameStarted = true;
    renderer.domElement.requestPointerLock();
    entryScreen.classList.add('fade-out');

    // Resume Audio Context & Play Music
    playMusic();

    setTimeout(() => entryScreen.remove(), 1500);
  });
}

// Fallback click on body to request pointer lock ONLY if game started
document.addEventListener('click', () => {
  if (gameStarted) {
    renderer.domElement.requestPointerLock();
  }
});

let isPointerLocked = false;
document.addEventListener('pointerlockchange', () => {
  isPointerLocked = document.pointerLockElement === renderer.domElement;
});

document.addEventListener('mousemove', (e) => {
  if (!isPointerLocked) return;
  rat.onMouseMove(e.movementX, e.movementY);
});

// ─── FIRE (Left Mouse Button) ─────────────────────────────────────
document.addEventListener('mousedown', (e) => {
  // ★ GUARD: Don't fire if game hasn't started
  if (!gameStarted) return;

  // Only fire if pointer is locked (in-game)
  if (document.pointerLockElement !== renderer.domElement) return;

  // Respawn if dead
  if (rat.entity.dead) {
    console.log("Respawning Player...");
    rat.entity.dead = false;
    rat.entity.hp = 3;
    rat.entity.billboard.setHealth(3);
    rat.entity.mesh.visible = true;
    rat.entity.billboard.sprite.visible = true;
    rat.entity.mesh.userData.deathLogged = false;

    // Reset Physics
    const safeX = (Math.random() - 0.5) * 80;
    const safeZ = (Math.random() - 0.5) * 80;
    const spawnPos = new CANNON.Vec3(safeX, 5, safeZ);

    rat.entity.body.position.copy(spawnPos);
    rat.entity.body.velocity.set(0, 0, 0);
    rat.entity.body.angularVelocity.set(0, 0, 0);
    rat.entity.body.quaternion.set(0, 0, 0, 1);
    rat.entity.body.fixedRotation = true;
    rat.entity.body.updateMassProperties();
    rat.entity.body.wakeUp();

    rat.entity.mesh.position.copy(spawnPos as any);
    rat.entity.mesh.quaternion.set(0, 0, 0, 1);

    // Push enemies away from spawn
    enemies.forEach(npc => {
      const dist = npc.entity.mesh.position.distanceTo(spawnPos as any);
      if (dist < 10) {
        const dir = npc.entity.mesh.position.clone().sub(spawnPos as any).normalize();
        npc.entity.body.position.x += dir.x * 20;
        npc.entity.body.position.z += dir.z * 20;
        npc.entity.body.wakeUp();
      }
    });

    return;
  }

  if (e.button !== 0) return;

  // Aim where camera looks
  const cameraDir = new THREE.Vector3();
  camera.getWorldDirection(cameraDir);
  const target = camera.position.clone().add(cameraDir.multiplyScalar(200));

  cheeseGun.shoot(rat.entity, target);
});

// ─── GAME LOOP ────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  // Don't run game logic until started
  if (!gameStarted) {
    renderer.render(scene, camera);
    return;
  }

  // Physics
  world.step(1 / 60, dt, 3);

  // Player
  rat.update(dt, keys, cheeseGun);
  if (rat.entity.dead && !rat.entity.mesh.userData.deathLogged) {
    console.log("GAME OVER - Player is dead");
    rat.entity.mesh.userData.deathLogged = true;
  }

  // Cheese ball physics sync
  cheeseGun.update(dt);

  // ── Update enemies & cull dead ones ──
  for (let i = enemies.length - 1; i >= 0; i--) {
    const shouldRemove = enemies[i].update(dt);
    if (shouldRemove) {
      enemies.splice(i, 1);
    }
  }

  // ── Respawn: keep at least MAX_ENEMIES alive ──
  if (enemies.length < MAX_ENEMIES && Math.random() < 0.01) {
    spawnEnemy();
  }

  // ── Flashlight follows the rat ──
  const ratPos = rat.entity.mesh.position;
  const viewDir = new THREE.Vector3();
  camera.getWorldDirection(viewDir);

  flashlight.position.set(ratPos.x, ratPos.y + 2, ratPos.z);
  flashlight.target.position.set(
    ratPos.x + viewDir.x * 15,
    ratPos.y + viewDir.y * 15,
    ratPos.z + viewDir.z * 15
  );

  // Render
  renderer.render(scene, camera);
}

// ─── RESIZE ───────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CityGenerator } from './world/CityGenerator';
import { RatController } from './player/RatController';
import { CheeseGun } from './weapons/CheeseGun';
import { NetworkManager } from './network/NetworkManager';
import { initEntitySounds, playPlayerHitSound } from './entities/RatEntity';
import { HatType, RatOptions } from './utils/RatModel';

// ─── COLOR PALETTES (must match RatEntity.ts) ────────────────────
const HAT_COLORS = [0xDC4A3C, 0x3498DB, 0x2ECC71, 0xA855F7, 0xE67E22];
const FUR_COLORS = [0xE8B84D, 0xC8C8D0, 0xD4A06A, 0xCD6839, 0xF0E0C0];
const COAT_COLORS = [0xBE4545, 0x3A5F95, 0x45945A, 0xA08050, 0x7E4F99];
const HAT_TYPES: HatType[] = ['fedora', 'trilby', 'porkpie'];

function pickRandom<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function generateRandomAppearance(): RatOptions {
  return {
    hatType: pickRandom(HAT_TYPES),
    hatColor: pickRandom(HAT_COLORS),
    furColor: pickRandom(FUR_COLORS),
    coatColor: pickRandom(COAT_COLORS),
  };
}

function showWebGLError(error: unknown): void {
  const titleScreen = document.getElementById('title-screen');
  const message = error instanceof Error ? error.message : String(error);
  const escapedMessage = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  if (!titleScreen) {
    document.body.textContent = 'WebGL is unavailable in this browser.';
    return;
  }

  titleScreen.classList.add('webgl-error');
  titleScreen.innerHTML = `
    <div class="webgl-error-panel">
      <h1>WebGL Unavailable</h1>
      <p>Rat Detective needs WebGL to render the 3D city. Your browser reported that WebGL is disabled or blocked.</p>
      <p>Turn on hardware acceleration/WebGL, try another browser, or check <code>chrome://gpu</code> for the exact graphics status.</p>
      <p><code>${escapedMessage}</code></p>
    </div>
  `;
}

function createRenderer(): THREE.WebGLRenderer | null {
  try {
    return new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (error) {
    console.error('[Rat Detective] WebGL renderer failed to start', error);
    showWebGLError(error);
    return null;
  }
}

// ─── RENDERER ─────────────────────────────────────────────────────
const renderer = createRenderer();

if (!renderer) {
  await new Promise<never>(() => {});
}

const appRenderer = renderer as THREE.WebGLRenderer;
appRenderer.setSize(window.innerWidth, window.innerHeight);
appRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
appRenderer.shadowMap.enabled = true;
appRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
appRenderer.toneMapping = THREE.ACESFilmicToneMapping;
appRenderer.toneMappingExposure = 1.1;
appRenderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(appRenderer.domElement);

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
camera.layers.enable(1);

// ─── AUDIO ────────────────────────────────────────────────────────
const listener = new THREE.AudioListener();
camera.add(listener);

initEntitySounds(listener);

const backgroundMusic = new THREE.Audio(listener);
const audioLoader = new THREE.AudioLoader();

let musicBufferReady = false;
let gameStarted = false;

const playMusic = () => {
  if (musicBufferReady && !backgroundMusic.isPlaying) {
    if (listener.context.state === 'suspended') {
      listener.context.resume().then(() => {
        backgroundMusic.play();
      });
    } else {
      backgroundMusic.play();
    }
  }
};

audioLoader.load('/music/main-theme.mp3', (buffer) => {
  backgroundMusic.setBuffer(buffer);
  backgroundMusic.setLoop(true);
  backgroundMusic.setVolume(0.4);
  musicBufferReady = true;
  if (gameStarted) playMusic();
});

const unlockAudio = () => {
  if (listener.context.state === 'suspended') listener.context.resume();
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
const ambient = new THREE.AmbientLight(0x664488, 0.7);
scene.add(ambient);

const hemiLight = new THREE.HemisphereLight(0x8866aa, 0x222222, 1.2);
scene.add(hemiLight);

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

// ─── CHEESE GUN ───────────────────────────────────────────────────
const cheeseGun = new CheeseGun(scene, world, listener);

// ─── INPUT ────────────────────────────────────────────────────────
const keys: Record<string, boolean> = {};
window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// ─── MULTIPLAYER STATE ────────────────────────────────────────────
let rat: RatController | null = null;
let networkManager: NetworkManager | null = null;

// ─── UI ELEMENTS ──────────────────────────────────────────────────
const titleScreen = document.getElementById('title-screen')!;
const nameInput = document.getElementById('player-name') as HTMLInputElement;
const enterBtn = document.getElementById('enter-city-btn')!;
const scoreboardList = document.getElementById('scoreboard-list')!;
const scoreboardPanel = document.getElementById('scoreboard')!;
const killFeed = document.getElementById('kill-feed')!;
const victoryOverlay = document.getElementById('victory-overlay')!;
const victoryText = document.getElementById('victory-text')!;
const respawnOverlay = document.getElementById('respawn-overlay')!;
const respawnTimer = document.getElementById('respawn-timer')!;

// ─── TITLE SCREEN → ENTER CITY ────────────────────────────────────
let hasJoined = false; // Prevent double-click ghost players

enterBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (hasJoined) return; // ← Guard: only allow one join
  hasJoined = true;
  enterBtn.setAttribute('disabled', 'true');

  const playerName = nameInput.value.trim() || 'Anonymous Rat';

  gameStarted = true;
  appRenderer.domElement.requestPointerLock();
  titleScreen.classList.add('fade-out');
  playMusic();

  setTimeout(() => titleScreen.style.display = 'none', 1500);

  // Show scoreboard
  scoreboardPanel.style.display = 'block';

  // ── Generate random appearance (synced across all clients) ──
  const localAppearance = generateRandomAppearance();

  // ── Initialize Network ──
  networkManager = new NetworkManager(scene, world, cheeseGun);

  // ── Wire up CheeseGun hit → Network ──
  cheeseGun.onHitEntity = (victim, damage) => {
    if (networkManager && victim.isRemote) {
      const victimId = networkManager.getSocketIdForEntity(victim);
      if (victimId) {
        networkManager.sendHit(victimId, damage);
      }
    }
  };

  // ── Network Callbacks ──
  networkManager.onWelcome = (player) => {
    if (rat) return;

    const spawn = new THREE.Vector3(player.x, player.y, player.z);
    rat = new RatController(scene, world, camera, playerName, localAppearance, spawn);
    cheeseGun.setPlayer(camera, rat.entity);
    rat.entity.isPlayer = true;
    networkManager!.setLocalPlayer(rat.entity);
  };

  networkManager.onScoreboardUpdate = (scores) => {
    scoreboardList.innerHTML = scores.map((s, i) => `
      <li class="${s.id === networkManager!.myId ? 'you' : ''}">
        <span class="rank">#${i + 1}</span>
        <span class="name">${s.name}</span>
        <span class="stats">${s.kills}K / ${s.deaths}D</span>
      </li>
    `).join('');
  };

  networkManager.onPlayerDamaged = (data) => {
    if (data.id === networkManager!.myId && rat) {
      rat.entity.hp = data.hp;
      rat.entity.billboard.setHealth(data.hp);
      if (data.hp > 0) {
        rat.entity.flashColor(0xff0000);
        playPlayerHitSound();
      } else if (!rat.entity.dead) {
        const impactDir = new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          0,
          (Math.random() - 0.5) * 2
        ).normalize().multiplyScalar(50);
        rat.entity.takeDamage(0, false, impactDir);
      }
    }
  };

  networkManager.onLocalRespawn = (data) => {
    if (!rat) return;

    // ── Fully reset the entity state (undo everything die() changed) ──
    rat.entity.dead = false;
    rat.entity.hp = data.hp;
    rat.entity.billboard.setHealth(data.hp);
    rat.entity.mesh.visible = true;
    rat.entity.billboard.sprite.visible = true;
    scene.add(rat.entity.billboard.sprite);
    rat.entity.mesh.userData.deathLogged = false;

    // ── Restore physics body to alive state ──
    // die() changes: mass→2, fixedRotation→false, damping→low, body.sleep()
    // We must undo ALL of these:
    const body = rat.entity.body;
    body.mass = 5;                  // Restore original mass (die sets to 2)
    body.fixedRotation = true;      // Lock rotation (die unlocks it)
    body.linearDamping = 0.01;      // Default damping
    body.angularDamping = 0.01;
    body.type = CANNON.Body.DYNAMIC; // Ensure dynamic (not sleeping/static)
    body.updateMassProperties();

    // Set position
    body.position.set(data.x, data.y, data.z);
    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);
    body.quaternion.set(0, 0, 0, 1);
    body.wakeUp();                  // Crucial: body.sleep() is called during death!

    // Sync visuals
    rat.entity.mesh.position.set(data.x, data.y, data.z);
    rat.entity.mesh.quaternion.set(0, 0, 0, 1);
  };

  networkManager.onKillFeedMessage = (msg) => {
    const entry = document.createElement('div');
    entry.className = 'kill-entry';
    entry.textContent = msg;
    killFeed.appendChild(entry);

    // Fade out after 4 seconds
    setTimeout(() => {
      entry.classList.add('fade-out');
      setTimeout(() => entry.remove(), 500);
    }, 4000);

    // Keep only last 5 entries
    while (killFeed.children.length > 5) {
      killFeed.removeChild(killFeed.firstChild!);
    }
  };

  // ── Game Won ──
  networkManager.onGameWon = (data) => {
    victoryText.textContent = `🏆 ${data.winnerName} wins with ${data.kills} kills!`;
    victoryOverlay.style.display = 'flex';
  };

  // ── Game Reset ──
  networkManager.onGameReset = () => {
    victoryOverlay.style.display = 'none';
    // Local player will be respawned via the normal playerRespawn event
  };

  // ── Local player died — show respawn countdown ──
  networkManager.onPlayerDied = (data) => {
    if (data.victimId === networkManager!.myId && rat) {
      console.log('YOU DIED!');
      // Show 5-second countdown
      let countdown = 5;
      respawnTimer.textContent = String(countdown);
      respawnOverlay.style.display = 'flex';
      const interval = setInterval(() => {
        countdown--;
        if (countdown <= 0) {
          clearInterval(interval);
          respawnOverlay.style.display = 'none';
        } else {
          respawnTimer.textContent = String(countdown);
        }
      }, 1000);
    }
  };

  // Send the SAME appearance to the server so everyone sees the same colors
  networkManager.connect(playerName, localAppearance);
});
enterBtn.removeAttribute('disabled');

// ── Pointer lock fallback ──
document.addEventListener('click', () => {
  if (gameStarted) appRenderer.domElement.requestPointerLock();
});

let isPointerLocked = false;
document.addEventListener('pointerlockchange', () => {
  isPointerLocked = document.pointerLockElement === appRenderer.domElement;
});

document.addEventListener('mousemove', (e) => {
  if (!isPointerLocked || !rat) return;
  rat.onMouseMove(e.movementX, e.movementY);
});

// ─── FIRE (Left Mouse Button) ─────────────────────────────────────
document.addEventListener('mousedown', (e) => {
  if (!gameStarted || !rat) return;
  if (document.pointerLockElement !== appRenderer.domElement) return;

  // Respawn handled by server now — don't allow local respawn on click
  if (rat.entity.dead) return;

  if (e.button !== 0) return;

  const cameraDir = new THREE.Vector3();
  camera.getWorldDirection(cameraDir);
  const target = camera.position.clone().add(cameraDir.multiplyScalar(200));

  cheeseGun.shoot(rat.entity, target);

  // Tell network about the shot
  if (networkManager) {
    const origin = rat.entity.mesh.position.clone();
    origin.y += 1.45;
    networkManager.sendShoot(origin, target);
  }
});

// ─── GAME LOOP ────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (!gameStarted) {
    appRenderer.render(scene, camera);
    return;
  }

  // Physics
  world.step(1 / 60, dt, 3);

  // ── Local Player ──
  if (rat) {
    rat.update(dt, keys, cheeseGun);

    if (rat.entity.dead && !rat.entity.mesh.userData.deathLogged) {
      console.log("GAME OVER - Player is dead");
      rat.entity.mesh.userData.deathLogged = true;
    }

    // Send position to network
    if (networkManager && !rat.entity.dead) {
      networkManager.sendMovement(rat.entity);
    }
  }

  // ── Cheese ball physics ──
  cheeseGun.update(dt);

  // ── Update Remote Players (Interpolation) ──
  if (networkManager) {
    networkManager.updateRemoteRats(dt);
  }

  // ── Flashlight follows rat ──
  if (rat) {
    const ratPos = rat.entity.mesh.position;
    const viewDir = new THREE.Vector3();
    camera.getWorldDirection(viewDir);

    flashlight.position.set(ratPos.x, ratPos.y + 2, ratPos.z);
    flashlight.target.position.set(
      ratPos.x + viewDir.x * 15,
      ratPos.y + viewDir.y * 15,
      ratPos.z + viewDir.z * 15
    );
  }

  appRenderer.render(scene, camera);
}

// ─── RESIZE ───────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  appRenderer.setSize(window.innerWidth, window.innerHeight);
});

animate();

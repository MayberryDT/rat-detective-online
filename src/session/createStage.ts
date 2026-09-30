import { effectsOutput } from '../audio/PlayerAudioMix';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { StaticCityBroadphase } from '../shared/StaticCityBroadphase';
import {readLightingMode,type LightingMode} from './lightingMode';
import { previewMuted } from '../audio/previewMuted';
import { effectsAudioContext } from '../audio/effectsAudio';
import { CITY_BOUNDS } from '../shared/grayboxLayout';
import { ContactShadows, StaticMoonShadow, attachContactShadows, fitMoonShadow } from './shadows';
import { renderScale } from './graphicsQuality';
import { guardLightLoops } from '../utils/lightLoopGuard';
import { FLASHLIGHT_REACH } from '../shared/rat/ratBody';

export function createStage(appRenderer: THREE.WebGLRenderer,lighting:LightingMode=readLightingMode()) {
    guardLightLoops();
    let viewportWidth = window.innerWidth, viewportHeight = window.innerHeight;
    // Settings → Graphics (Auto by default) picks the drawing buffer's pixels per CSS pixel.
    let pixelRatio = renderScale(window.devicePixelRatio);
    appRenderer.setPixelRatio(pixelRatio);
    appRenderer.setSize(viewportWidth, viewportHeight);
    appRenderer.shadowMap.enabled = true;
    // Hard single-tap shadows: what the old PCFSoftShadowMap setting already drew (three r182
    // compiles its deprecated value as the basic filter), named for what it is.
    appRenderer.shadowMap.type = THREE.BasicShadowMap;
    appRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    appRenderer.toneMappingExposure = 1.1;
    appRenderer.outputColorSpace = THREE.SRGBColorSpace;
    document.body.appendChild(appRenderer.domElement);

    // ─── SCENE ────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    // The root never moves: without this, its per-frame local update forces every object's
    // world matrix to be recomputed, frozen scenery included.
    scene.matrixAutoUpdate = false;
    scene.background = new THREE.Color(0x100b19);
    scene.fog = new THREE.FogExp2(0x100b19, 0.008);

    // ─── CAMERA ───────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      600
    );
    camera.layers.enable(1);
    // Frame the real city behind the title screen before the player takes over.
    camera.position.set(23, 7, 24);
    camera.lookAt(0, 9, 0);

    // Preparation yields to the page before GameSession exists. Reconcile at
    // render time so a fullscreen/resize notification in that gap cannot be lost.
    // A graphics step changes only the drawing buffer; the CSS size, camera aspect
    // and every screen-space projection stay as they are.
    function syncViewport(): boolean {
      const width = window.innerWidth, height = window.innerHeight;
      const ratio = renderScale(window.devicePixelRatio);
      if (width <= 0 || height <= 0 ||
          (width === viewportWidth && height === viewportHeight && ratio === pixelRatio)) return false;
      if (ratio !== pixelRatio) appRenderer.setPixelRatio(ratio);
      appRenderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      viewportWidth = width; viewportHeight = height; pixelRatio = ratio;
      return true;
    }

    const existing = effectsAudioContext();
    if (existing) THREE.AudioContext.setContext(existing);
    const listener = new THREE.AudioListener();
    listener.gain.disconnect();listener.gain.connect(effectsOutput(listener.context));
    if (previewMuted()) void listener.context.suspend();
    // Panning uses StereoPannerNodes; nothing reads the Web Audio listener pose,
    // so skip three's nine per-frame AudioParam ramps and keep only the matrices.
    listener.updateMatrixWorld = function (force?: boolean) { THREE.Object3D.prototype.updateMatrixWorld.call(this, force); };
    camera.add(listener);
    // ─── LIGHTING ─────────────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(0x664488, lighting==='classic'?.38:.2);
    scene.add(ambient);

    const hemiLight = new THREE.HemisphereLight(0x776a9b, 0x17131c, lighting==='classic'?.65:.4);
    scene.add(hemiLight);

    // The moon shadow covers the whole city and is drawn once (StaticMoonShadow), so its one-off
    // map can be large: about the old 0.15 world units per texel over the whole city.
    const moonLight = new THREE.DirectionalLight(0x929cdb, lighting==='classic'?.85:.7);
    const moonFit = fitMoonShadow(new THREE.Vector3(-50, -100, -50), CITY_BOUNDS, .15, Math.min(4096, appRenderer.capabilities?.maxTextureSize ?? 4096));
    moonLight.position.copy(moonFit.position);
    moonLight.target.position.copy(moonFit.target);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(moonFit.width, moonFit.height);
    const moonCamera = moonLight.shadow.camera;
    moonCamera.near = moonFit.near; moonCamera.far = moonFit.far;
    moonCamera.left = moonFit.left; moonCamera.right = moonFit.right;
    moonCamera.top = moonFit.top; moonCamera.bottom = moonFit.bottom;
    moonCamera.updateProjectionMatrix();
    // The old bias was 0.15 world units of depth; keep that offset over the longer depth range.
    moonLight.shadow.bias = -.15 / (moonFit.far - moonFit.near);
    moonLight.shadow.normalBias = .04;
    scene.add(moonLight);
    scene.add(moonLight.target);
    const moonShadow = new StaticMoonShadow(moonLight, appRenderer.shadowMap);

    // Your rat's flashlight; in a Blackout it brightens and the street light pool carries other rats' copies of it.
    const flashlight = new THREE.SpotLight(0xfffebb, 2.0, FLASHLIGHT_REACH, 0.6, 0.5, 1.2);
    flashlight.castShadow = true;
    flashlight.shadow.mapSize.set(512, 512);
    flashlight.shadow.camera.near = 0.5;
    flashlight.shadow.camera.far = FLASHLIGHT_REACH;
    scene.add(flashlight);
    scene.add(flashlight.target);

    // ─── PHYSICS WORLD ────────────────────────────────────────────────
    const world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -25, 0),
    });
    // Match the playable city prototype: thousands of static wall/stair bodies
    // must not be compared against one another on every physics step.
    world.broadphase = new StaticCityBroadphase(world);
    world.collisionMatrix=new CANNON.ObjectCollisionMatrix() as unknown as CANNON.ArrayCollisionMatrix;
    world.collisionMatrixPrevious=new CANNON.ObjectCollisionMatrix() as unknown as CANNON.ArrayCollisionMatrix;
    world.broadphase.useBoundingBoxes = true;
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
      color: 0x25232d,
      roughness: 0.9,
      metalness: 0.05,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // Moving things drop no moon shadow; a soft contact disc grounds them instead.
    const contacts = new ContactShadows(world);
    attachContactShadows(scene, contacts);
    scene.onBeforeRender = () => {
      moonShadow.beforeRender(scene); contacts.update();
    };
    scene.onAfterRender = () => moonShadow.afterRender();


    groundMesh.userData.aimTarget = true;
    return { renderer: appRenderer, scene, camera, listener, world, flashlight, moonShadow, contacts, syncViewport, dispose() {
      groundGeo.dispose(); groundMat.dispose(); world.removeBody(groundBody);
      moonLight.shadow.dispose(); flashlight.shadow.dispose(); contacts.dispose();
      scene.clear(); appRenderer.dispose(); appRenderer.domElement.remove();
    } };
}

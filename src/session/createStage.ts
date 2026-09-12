import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { StaticCityBroadphase } from '../shared/StaticCityBroadphase';
import {readLightingMode,type LightingMode} from './lightingMode';
import { previewMuted } from '../audio/previewMuted';
import { effectsAudioContext } from '../audio/effectsAudio';

export function createStage(appRenderer: THREE.WebGLRenderer,lighting:LightingMode=readLightingMode()) {
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

    const existing = effectsAudioContext();
    if (existing) THREE.AudioContext.setContext(existing);
    const listener = new THREE.AudioListener();
    if (previewMuted()) void listener.context.suspend();
    camera.add(listener);
    // ─── LIGHTING ─────────────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(0x664488, lighting==='classic'?.38:.2);
    scene.add(ambient);

    const hemiLight = new THREE.HemisphereLight(0x776a9b, 0x17131c, lighting==='classic'?.65:.4);
    scene.add(hemiLight);

    const moonLight = new THREE.DirectionalLight(0x929cdb, lighting==='classic'?.85:.7);
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


    groundMesh.userData.aimTarget = true;
    return { renderer: appRenderer, scene, camera, listener, world, flashlight, dispose() {
      groundGeo.dispose(); groundMat.dispose(); world.removeBody(groundBody);
      moonLight.shadow.dispose(); flashlight.shadow.dispose();
      scene.clear(); appRenderer.dispose(); appRenderer.domElement.remove();
    } };
}

import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export function createStage(appRenderer: THREE.WebGLRenderer) {
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

    const listener = new THREE.AudioListener();
    camera.add(listener);
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


    groundMesh.userData.aimTarget = true;
    return { renderer: appRenderer, scene, camera, listener, world, flashlight, dispose() {
      groundGeo.dispose(); groundMat.dispose(); world.removeBody(groundBody);
      moonLight.shadow.dispose(); flashlight.shadow.dispose();
      scene.clear(); appRenderer.dispose(); appRenderer.domElement.remove();
    } };
}

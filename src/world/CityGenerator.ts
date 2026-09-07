import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
    createDecorationRandom,
    createWorldSpec,
    DEFAULT_CITY_OPTIONS,
    generateBuildingLayout,
    type BuildingFootprint,
    type CityOptions,
    type WorldSpec,
} from '../shared/worldSpec';

export type { CityOptions, WorldSpec };

export interface CityCounts {
    buildings: number;
    buildingBodies: number;
    rooftops: number;
    roadMeshes: number;
    dashBatches: number;
    dashInstances: number;
    lampCells: number;
    lampPoles: number;
    lampHeads: number;
    lampCones: number;
    sceneObjects: number;
    geometries: number;
    materials: number;
    textures: number;
    physicsBodies: number;
}

const LAMP_CELL_SIZE = 90;
const dummy = new THREE.Object3D();

/**
 * Procedural noir city using emissive materials for window glow.
 * Collision layout comes from WorldSpec; decoration uses an independent RNG stream.
 */
export class CityGenerator {
    private scene: THREE.Scene;
    private world: CANNON.World;
    private opts: CityOptions;
    private spec: WorldSpec;
    private objects: THREE.Object3D[] = [];
    private bodies: CANNON.Body[] = [];
    private geometries = new Set<THREE.BufferGeometry>();
    private materials = new Set<THREE.Material>();
    private textures = new Set<THREE.Texture>();
    private generated = false;
    private details = new Map<THREE.Material, THREE.Matrix4[]>();
    private animationTime = 0;
    private flickerHeads: THREE.InstancedMesh[] = [];
    private steam: {mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; x: number; z: number; phase: number}[] = [];
    private windowStates: {texture: THREE.CanvasTexture; x: number; y: number; color: string; on: boolean; phase: number}[] = [];
    private readonly lightColor = new THREE.Color();
    private counts: CityCounts = emptyCounts();

    constructor(scene: THREE.Scene, world: CANNON.World, opts: CityOptions = DEFAULT_CITY_OPTIONS, spec?: WorldSpec) {
        this.scene = scene;
        this.world = world;
        this.opts = { ...DEFAULT_CITY_OPTIONS, ...opts };
        this.spec = spec ?? createWorldSpec();
    }

    generate(): void {
        if (this.generated) this.dispose();
        const layout = generateBuildingLayout(this.spec, this.opts);
        const decorate = createDecorationRandom(this.spec);
        this.generateBuildings(layout, decorate);
        this.generateLampProps(decorate);
        this.generateRoadMarkings();
        this.flushDetails();
        this.generated = true;
        this.counts.sceneObjects = this.objects.length;
        this.counts.geometries = this.geometries.size;
        this.counts.materials = this.materials.size;
        this.counts.textures = this.textures.size;
        this.counts.physicsBodies = this.bodies.length;
        this.counts.buildingBodies = this.bodies.length;
    }

    update(dt: number, camera?: THREE.Camera): void {
        if (!this.generated || !Number.isFinite(dt) || dt < 0) return;
        this.animationTime += Math.min(dt, 0.1);
        this.flickerHeads.forEach((heads, i) => {
            const phase = (this.animationTime + i * 3.7) % 19;
            const brightness = phase > 8 && phase < 8.35 ? 0.2 + 0.8 * Math.abs(Math.sin(phase * 75)) : 1;
            heads.setColorAt(0, this.lightColor.setRGB(brightness, brightness, brightness));
            heads.instanceColor!.needsUpdate = true;
        });
        for (const window of this.windowStates) {
            const on = (this.animationTime + window.phase) % 31 < 25;
            if (on === window.on) continue;
            window.on = on;
            const ctx = window.texture.image.getContext('2d') as CanvasRenderingContext2D;
            ctx.fillStyle = on ? window.color : '#000000'; ctx.fillRect(window.x, window.y, 12, 16);
            ctx.fillStyle = '#000000'; ctx.fillRect(window.x + 5, window.y, 2, 16); ctx.fillRect(window.x, window.y + 8, 12, 1);
            window.texture.needsUpdate = true;
        }
        for (const puff of this.steam) {
            const phase = (this.animationTime * 0.2 + puff.phase) % 1;
            puff.mesh.position.set(puff.x + Math.sin(phase * 4 + puff.phase) * phase * 0.35, 0.12 + phase * 1.5, puff.z);
            puff.mesh.scale.setScalar(0.3 + phase * 0.8);
            puff.mesh.material.opacity = Math.sin(phase * Math.PI) * 0.09;
            if (camera) camera.getWorldQuaternion(puff.mesh.quaternion);
        }
    }

    getCounts(): CityCounts {
        return { ...this.counts };
    }

    getSpec(): WorldSpec {
        return this.spec;
    }

    getBuildingBodies(): CANNON.Body[] {
        return this.bodies.slice();
    }

    dispose(): void {
        for (const object of this.objects) {
            this.scene.remove(object);
            if (object instanceof THREE.InstancedMesh) object.dispose();
        }
        for (const body of this.bodies) {
            this.world.removeBody(body);
        }
        for (const geometry of this.geometries) geometry.dispose();
        for (const material of this.materials) material.dispose();
        for (const texture of this.textures) texture.dispose();
        this.details.clear(); this.flickerHeads = []; this.steam = []; this.windowStates = [];
        this.animationTime = 0;
        this.objects = [];
        this.bodies = [];
        this.geometries.clear();
        this.materials.clear();
        this.textures.clear();
        this.generated = false;
        this.counts = emptyCounts();
    }

    private trackGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
        this.geometries.add(geometry);
        return geometry;
    }

    private trackMaterial<T extends THREE.Material>(material: T): T {
        this.materials.add(material);
        return material;
    }

    private addObject(object: THREE.Object3D): void {
        this.scene.add(object);
        this.objects.push(object);
    }

    private generateBuildings(layout: BuildingFootprint[], random: () => number): void {
        this.counts.buildings = layout.length;
        const rooftopMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x34303f, roughness: 0.75 }));

        const trim = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x494350, roughness: 0.76 }));
        const dark = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x252c3d, roughness: 0.58, metalness: 0.3 }));
        const brass = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0xb78a57, metalness: 0.55, roughness: 0.4 }));
        const propRandom = createDecorationRandom({...this.spec, seed: this.spec.seed ^ 0x51f15e});
        const bin = this.trackMaterial(new THREE.MeshStandardMaterial({color: 0x293c39, roughness: 0.83, metalness: 0.3}));
        const wood = this.trackMaterial(new THREE.MeshStandardMaterial({color: 0x594431, roughness: 0.95}));
        for (const building of layout) {
            this.addBuilding(building, rooftopMat, random);
            const { cx, cz, bw, bd, bh } = building;
            // Cornices and stone plinths give the original box silhouettes depth.
            for (const y of [0.22, 3.4, bh - 0.35]) {
                this.boxDetail(trim, cx, y, cz, bw + 0.22, 0.18, bd + 0.22);
            }
            for (const x of [-1, 1]) for (const z of [-1, 1]) {
                this.boxDetail(trim, cx + x * (bw / 2 - 0.08), bh / 2, cz + z * (bd / 2 - 0.08), 0.2, bh, 0.2);
            }
            // Small service props hug the building edge, leaving street routes open.
            const serviceZ = cz + bd / 2 + 0.45;
            this.boxDetail(bin, cx - bw * 0.32, 0.48, serviceZ, 1.55, 0.88, 0.75);
            this.boxDetail(dark, cx - bw * 0.32, 0.95, serviceZ, 1.68, 0.12, 0.84);
            this.boxDetail(brass, cx - bw * 0.32, 0.63, serviceZ + 0.39, 0.42, 0.055, 0.055);
            this.boxDetail(dark, cx + bw * 0.33, 0.4, serviceZ, 0.55, 0.76, 0.55);
            this.boxDetail(trim, cx + bw * 0.33, 0.82, serviceZ, 0.62, 0.07, 0.62);
            if (propRandom() < 0.35) {
                const crateX = cx - bw * 0.32 + 1.25;
                this.boxDetail(wood, crateX, 0.36, serviceZ, 0.65, 0.65, 0.65);
                for (const offset of [-0.23, 0.23]) this.boxDetail(dark, crateX + offset, 0.36, serviceZ + 0.33, 0.055, 0.67, 0.035);
            }
            if (propRandom() < 0.2) {
                for (let level = 0; level < 3; level++) {
                    const y = 4.5 + level * 3;
                    this.boxDetail(dark, cx + bw / 2 + 0.45, y, cz, 0.9, 0.10, 2.4);
                    this.boxDetail(dark, cx + bw / 2 + 0.87, y + 0.7, cz, 0.055, 0.055, 2.4);
                    for (let post = -1; post <= 1; post++) this.boxDetail(dark, cx + bw / 2 + 0.87, y + 0.35, cz + post, 0.045, 0.7, 0.045);
                    for (const side of [-1,1]) this.boxDetail(dark, cx + bw / 2 + 0.45 + side * 0.3, y - 1.3, cz + 0.85, 0.05, 2.7, 0.055);
                    for (let rung = 0; rung < 8; rung++) this.boxDetail(dark, cx + bw / 2 + 0.45, y - rung * 0.36, cz + 0.85, 0.6, 0.04, 0.055);
                }
            }
            // Recessed double doors and a shallow metal canopy, on both street faces.
            for (const side of [-1, 1]) {
                this.boxDetail(dark, cx, 1.2, cz + side * (bd / 2 + 0.015), 1.65, 2.4, 0.06);
                this.boxDetail(brass, cx, 1.2, cz + side * (bd / 2 + 0.055), 0.055, 2.4, 0.035);
                this.boxDetail(dark, cx, 2.65, cz + side * (bd / 2 + 0.25), 2.3, 0.14, 0.65);
            }
        }
    }

    private addBuilding(building: BuildingFootprint, rooftopMat: THREE.Material, random: () => number): void {
        const { cx, cz, bw, bd, bh } = building;
        const { facade, glow } = this.createWindowTexture(Math.ceil(bw), Math.ceil(bh), random, Math.abs(cx) < 65 && Math.abs(cz) < 65);
        this.textures.add(facade); this.textures.add(glow);

        const mat = this.trackMaterial(new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(0.60 + random() * 0.12, 0.10 + random() * 0.08, 0.22 + random() * 0.09),
            map: facade,
            roughness: 0.8,
            metalness: 0.08,
            emissiveMap: glow,
            emissive: 0xffffff,
            emissiveIntensity: 1.65,
        }));

        const geo = this.trackGeometry(new THREE.BoxGeometry(bw, bh, bd));
        // Sample blank facade texels on the roof/foundation without adding draw calls.
        const uv = geo.getAttribute('uv');
        const indices = geo.getIndex()!;
        for (const group of geo.groups) if (group.materialIndex === 2 || group.materialIndex === 3) {
            for (let i = group.start; i < group.start + group.count; i++) uv.setXY(indices.getX(i), 0, 0);
        }
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(cx, bh / 2, cz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.aimTarget = true;
        this.addObject(mesh);

        if (random() < 0.4) {
            this.addRooftopDetail(cx, cz, bw, bd, bh, rooftopMat, random);
            this.counts.rooftops += 1;
        }

        const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC });
        body.addShape(new CANNON.Box(new CANNON.Vec3(bw / 2, bh / 2, bd / 2)));
        body.position.set(cx, bh / 2, cz);
        this.world.addBody(body);
        this.bodies.push(body);
    }

    private addRooftopDetail(
        cx: number,
        cz: number,
        bw: number,
        bd: number,
        bh: number,
        mat: THREE.Material,
        random: () => number,
    ): void {
        const dw = 1.5 + random() * 2;
        const dh = 1 + random() * 2.5;
        const dd = 1.5 + random() * 2;
        const geo = this.trackGeometry(new THREE.BoxGeometry(dw, dh, dd));
        const detail = new THREE.Mesh(geo, mat);
        detail.position.set(
            cx + (random() - 0.5) * bw * 0.4,
            bh + dh / 2,
            cz + (random() - 0.5) * bd * 0.4,
        );
        detail.castShadow = true;
        this.addObject(detail);
    }

    private boxDetail(material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number): void {
        dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
        const list = this.details.get(material) ?? [];
        list.push(dummy.matrix.clone()); this.details.set(material, list);
    }

    private flushDetails(): void {
        const geometry = this.trackGeometry(new THREE.BoxGeometry(1, 1, 1));
        for (const [material, matrices] of this.details) {
            const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
            matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
            // Main building masses cast shadows; thin trim and paint should not
            // produce large-map shadow acne or jagged crossing stripes.
            mesh.castShadow = false; mesh.receiveShadow = material.userData.receiveDetailShadow !== false;
            mesh.computeBoundingSphere(); this.addObject(mesh);
        }
        this.details.clear();
    }

    private createWindowTexture(widthUnits: number, heightUnits: number, random: () => number, animate: boolean) {
        const canvas = document.createElement('canvas'), emission = document.createElement('canvas');
        canvas.width = emission.width = Math.max(64, Math.ceil(widthUnits / 2.4) * 24);
        canvas.height = emission.height = Math.max(64, Math.ceil(heightUnits / 3) * 28);
        const ctx = canvas.getContext('2d')!, light = emission.getContext('2d')!;
        let animatedWindow: {x:number; y:number; color:string} | undefined;
        ctx.fillStyle = '#a5a1a2'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        light.fillStyle = '#000000'; light.fillRect(0, 0, canvas.width, canvas.height);
        for (let y = 0; y < canvas.height; y += 7) {
            ctx.fillStyle = y % 28 === 0 ? '#777582' : '#95919a';
            ctx.fillRect(0, y, canvas.width, 1);
        }
        for (let y = 12; y < canvas.height - 28; y += 28) for (let x = 6; x < canvas.width - 10; x += 24) {
            ctx.fillStyle = '#777079'; ctx.fillRect(x - 2, y - 2, 16, 20);
            ctx.fillStyle = '#202c3b'; ctx.fillRect(x, y, 12, 16);
            ctx.fillStyle = '#837985'; ctx.fillRect(x - 2, y + 16, 16, 2);
            if (random() < 0.32) {
                const palette = ['#ffd27a', '#ffc04b', '#ffe5a0', '#7fc9e8', '#e37754'];
                const selection = random();
                const color = palette[selection < 0.40 ? 0 : selection < 0.65 ? 1 : selection < 0.80 ? 2 : selection < 0.93 ? 3 : 4];
                if (animate && y >= canvas.height - 84 && !animatedWindow) animatedWindow = {x,y,color};
                ctx.fillStyle = color; light.fillStyle = color;
                ctx.fillRect(x, y, 12, 16); light.fillRect(x, y, 12, 16);
                // Mullions and occasional lowered blinds preserve window structure.
                light.fillStyle = '#000000'; ctx.fillStyle = '#484651';
                ctx.fillRect(x + 5, y, 2, 16); light.fillRect(x + 5, y, 2, 16);
                ctx.fillRect(x, y + 8, 12, 1); light.fillRect(x, y + 8, 12, 1);
                if (random() < 0.3) {
                    ctx.fillRect(x, y, 12, 5); light.fillRect(x, y, 12, 5);
                }
            }
        }
        const facade = new THREE.CanvasTexture(canvas), glow = new THREE.CanvasTexture(emission);
        facade.colorSpace = glow.colorSpace = THREE.SRGBColorSpace;
        facade.anisotropy = glow.anisotropy = 4;
        if (animatedWindow) this.windowStates.push({texture: glow, ...animatedWindow, on: true, phase: this.windowStates.length * 1.7});
        return { facade, glow };
    }

    private generateLampProps(random: () => number): void {
        const { gridSize, blockSpacing, streetWidth } = this.opts;
        const half = gridSize / 2;
        const offset = streetWidth / 2 + 1.5;
        const cells = new Map<string, THREE.Vector3[]>();

        for (let gx = -half; gx < half; gx++) {
            for (let gz = -half; gz < half; gz++) {
                const ix = (gx + 0.5) * blockSpacing;
                const iz = (gz + 0.5) * blockSpacing;
                if (random() < 0.6) this.pushLamp(cells, ix + offset, iz + offset);
                if (random() < 0.4) this.pushLamp(cells, ix - offset, iz - offset);
            }
        }

        if (cells.size === 0) return;

        const poleGeo = this.trackGeometry(new THREE.LatheGeometry([[0.25,0],[0.25,0.18],[0.18,0.25],[0.12,0.8],[0.09,5.7],[0.22,5.9],[0.22,6]].map(([r,y]) => new THREE.Vector2(r,y - 3)), 10));
        const poleMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x34333e, roughness: 0.7, metalness: 0.5 }));
        const headGeo = this.trackGeometry(new THREE.CylinderGeometry(0.32, 0.27, 0.65, 8));
        const headMat = this.trackMaterial(new THREE.MeshStandardMaterial({
            color: 0xffdfac,
            emissive: 0xffbd62,
            emissiveIntensity: 2.2,
            roughness: 0.2,
        }));
        headMat.onBeforeCompile = shader => {
            shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
                '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n totalEmissiveRadiance *= vColor;\n#endif');
        };
        headMat.customProgramCacheKey = () => 'lantern-instance-flicker-v1';
        const coneGeo = this.trackGeometry(new THREE.ConeGeometry(3.7, 6, 20, 1, true));
        const coneMat = this.trackMaterial(new THREE.MeshBasicMaterial({
            color: 0xffcc89,
            transparent: true,
            opacity: 0.009,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        }));

        const glowData = new Uint8Array(64 * 64 * 4);
        for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
            const radius = Math.hypot((x - 31.5) / 31.5, (y - 31.5) / 31.5);
            const index = (y * 64 + x) * 4;
            glowData[index] = glowData[index + 1] = glowData[index + 2] = 255;
            glowData[index + 3] = Math.round(Math.pow(Math.max(0, 1 - radius), 2) * 255);
        }
        const glowTexture = new THREE.DataTexture(glowData, 64, 64);
        glowTexture.needsUpdate = true; glowTexture.magFilter = THREE.LinearFilter;
        this.textures.add(glowTexture);
        const steamGeo = this.trackGeometry(new THREE.PlaneGeometry(2, 2)) as THREE.PlaneGeometry;
        for (const [x,z] of [[8.7,7],[-21.3,7],[8.7,-23]]) for (let i = 0; i < 2; i++) {
            const material = this.trackMaterial(new THREE.MeshBasicMaterial({color:0x898799, map:glowTexture, transparent:true, opacity:0, depthWrite:false, side:THREE.DoubleSide}));
            const mesh = new THREE.Mesh(steamGeo, material); mesh.position.set(x,0.2,z);
            this.steam.push({mesh,x,z,phase:i * 0.5}); this.addObject(mesh);
        }
        const poolGeo = this.trackGeometry(new THREE.PlaneGeometry(12, 12));
        const poolMat = this.trackMaterial(new THREE.MeshBasicMaterial({ color: 0xffbf76,
            map: glowTexture, transparent: true, opacity: 0.42, depthWrite: false,
            blending: THREE.AdditiveBlending }));
        for (const lamps of cells.values()) {
            const pools = new THREE.InstancedMesh(poolGeo, poolMat, lamps.length);
            lamps.forEach(({x,z}, i) => {
                dummy.position.set(x, 0.055, z); dummy.rotation.set(-Math.PI / 2, 0, 0);
                dummy.scale.set(1, 1, 1); dummy.updateMatrix(); pools.setMatrixAt(i, dummy.matrix);
                this.boxDetail(poleMat, x, 6.62, z, 0.95, 0.12, 0.95);
                this.boxDetail(poleMat, x, 5.85, z, 0.65, 0.1, 0.65);
                for (const side of [-1, 1]) {
                    this.boxDetail(poleMat, x + side * 0.24, 6.2, z, 0.055, 0.65, 0.055);
                    this.boxDetail(poleMat, x, 6.2, z + side * 0.24, 0.055, 0.65, 0.055);
                }
            });
            pools.computeBoundingSphere(); this.addObject(pools);
        }
        this.counts.lampCells = cells.size;
        for (const lamps of cells.values()) {
            this.addLampCell(lamps, poleGeo, poleMat, headGeo, headMat, coneGeo, coneMat);
        }
    }

    private pushLamp(cells: Map<string, THREE.Vector3[]>, x: number, z: number): void {
        const key = `${Math.floor((x + 180) / LAMP_CELL_SIZE)},${Math.floor((z + 180) / LAMP_CELL_SIZE)}`;
        const list = cells.get(key);
        const position = new THREE.Vector3(x, 0, z);
        if (list) list.push(position);
        else cells.set(key, [position]);
    }

    private addLampCell(
        lamps: THREE.Vector3[],
        poleGeo: THREE.BufferGeometry,
        poleMat: THREE.Material,
        headGeo: THREE.BufferGeometry,
        headMat: THREE.Material,
        coneGeo: THREE.BufferGeometry,
        coneMat: THREE.Material,
    ): void {
        const poles = new THREE.InstancedMesh(poleGeo, poleMat, lamps.length);
        const heads = new THREE.InstancedMesh(headGeo, headMat, lamps.length);
        for (let i = 0; i < lamps.length; i++) heads.setColorAt(i, new THREE.Color(1,1,1));
        this.flickerHeads.push(heads);
        poles.castShadow = true;
        heads.castShadow = false;
        poles.frustumCulled = true;
        heads.frustumCulled = true;

        for (let i = 0; i < lamps.length; i++) {
            const { x, z } = lamps[i];
            dummy.position.set(x, 3, z);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            poles.setMatrixAt(i, dummy.matrix);
            dummy.position.set(x, 6.2, z);
            dummy.updateMatrix();
            heads.setMatrixAt(i, dummy.matrix);

            const cone = new THREE.Mesh(coneGeo, coneMat);
            cone.position.set(x, 3, z);
            this.addObject(cone);
            this.counts.lampCones += 1;
        }

        poles.instanceMatrix.needsUpdate = true;
        heads.instanceMatrix.needsUpdate = true;
        poles.computeBoundingSphere();
        heads.computeBoundingSphere();
        this.addObject(poles);
        this.addObject(heads);
        this.counts.lampPoles += lamps.length;
        this.counts.lampHeads += lamps.length;
    }

    private generateRoadMarkings(): void {
        const { gridSize, blockSpacing, streetWidth } = this.opts;
        const half = gridSize / 2;
        const totalLen = gridSize * blockSpacing + blockSpacing;

        const roadCanvas = document.createElement('canvas'); roadCanvas.width = roadCanvas.height = 128;
        const roadCtx = roadCanvas.getContext('2d')!;
        const noise = createDecorationRandom(this.spec);
        for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
            const gray = 55 + Math.floor(noise() * 24);
            roadCtx.fillStyle = `rgb(${gray},${gray + 3},${gray + 9})`; roadCtx.fillRect(x,y,1,1);
        }
        const roadTexture = new THREE.CanvasTexture(roadCanvas);
        roadTexture.wrapS = roadTexture.wrapT = THREE.RepeatWrapping;
        roadTexture.repeat.set(totalLen / 5, streetWidth / 5);
        roadTexture.colorSpace = THREE.SRGBColorSpace; roadTexture.anisotropy = 4; this.textures.add(roadTexture);
        const asphaltMat = this.trackMaterial(new THREE.MeshStandardMaterial({
            color: 0x4d5261, map: roadTexture, emissive: 0x10101c, emissiveIntensity: 0.10,
            roughness: 0.68,
            metalness: 0.12,
        }));
        const lineMat = this.trackMaterial(new THREE.MeshBasicMaterial({
            color: 0xd6b777,
            transparent: true,
            opacity: 0.72,
        }));
        const horizRoadGeo = this.trackGeometry(new THREE.PlaneGeometry(totalLen, streetWidth));
        const vertRoadGeo = this.trackGeometry(new THREE.PlaneGeometry(streetWidth, totalLen));

        for (let gz = -half; gz < half; gz++) {
            const z = (gz + 0.5) * blockSpacing;
            const road = new THREE.Mesh(horizRoadGeo, asphaltMat);
            road.rotation.x = -Math.PI / 2;
            road.position.set(0, 0.01, z);
            road.receiveShadow = true;
            this.addObject(road);
            this.counts.roadMeshes += 1;
        }

        for (let gx = -half; gx < half; gx++) {
            const x = (gx + 0.5) * blockSpacing;
            const road = new THREE.Mesh(vertRoadGeo, asphaltMat);
            road.rotation.x = -Math.PI / 2;
            road.position.set(x, 0.012, 0);
            road.receiveShadow = true;
            this.addObject(road);
            this.counts.roadMeshes += 1;
        }

        const paving = document.createElement('canvas'); paving.width = paving.height = 128;
        const pavingCtx = paving.getContext('2d')!;
        pavingCtx.fillStyle = '#646778'; pavingCtx.fillRect(0,0,128,128);
        for (let y = 0; y < 128; y += 32) for (let x = 0; x < 128; x += 32) {
            pavingCtx.fillStyle = ['#9a9ba4','#8c909c','#a1a0a7'][Math.floor(noise() * 3)];
            pavingCtx.fillRect(x + 1, y + 1, 30, 30);
        }
        const pavingTexture = new THREE.CanvasTexture(paving);
        pavingTexture.wrapS = pavingTexture.wrapT = THREE.RepeatWrapping;
        pavingTexture.repeat.set(4, 4); pavingTexture.colorSpace = THREE.SRGBColorSpace;
        this.textures.add(pavingTexture);
        const sidewalk = this.trackMaterial(new THREE.MeshStandardMaterial({color: 0x4b4b5a, map: pavingTexture, roughness: 0.85}));
        const curb = this.trackMaterial(new THREE.MeshStandardMaterial({color: 0x55505e, roughness: 0.8}));
        const paint = this.trackMaterial(new THREE.MeshStandardMaterial({color: 0x77716f, roughness: 0.9}));
        paint.userData.receiveDetailShadow = false;
        const drain = this.trackMaterial(new THREE.MeshStandardMaterial({color: 0x202b38, roughness: 0.6, metalness: 0.5}));
        const block = blockSpacing - streetWidth;
        for (let gx = -half; gx < half; gx++) for (let gz = -half; gz < half; gz++) {
            const x = gx * blockSpacing, z = gz * blockSpacing;
            this.boxDetail(sidewalk, x, 0.005, z, block, 0.05, block);
            for (const side of [-1, 1]) {
                this.boxDetail(curb, x + side * block / 2, 0.025, z, 0.18, 0.08, block);
                this.boxDetail(curb, x, 0.025, z + side * block / 2, block, 0.08, 0.18);
            }
            const ix = x + blockSpacing / 2, iz = z + blockSpacing / 2;
            for (let stripe = -2; stripe <= 2; stripe++) for (const side of [-1, 1]) {
                this.boxDetail(paint, ix + stripe * 1.25, 0.023, iz + side * (streetWidth / 2 - 1.1), 0.65, 0.012, 1.8);
                this.boxDetail(paint, ix + side * (streetWidth / 2 - 1.1), 0.023, iz + stripe * 1.25, 1.8, 0.012, 0.65);
            }
            for (let slat = 0; slat < 5; slat++) {
                this.boxDetail(drain, ix - streetWidth / 2 + 0.5 + slat * 0.14, 0.022, iz - streetWidth / 2 - 1, 0.07, 0.015, 0.75);
            }
        }

        const dashLen = 2.5;
        const gapLen = 2.5;
        const dashW = 0.18;
        const horizDashGeo = this.trackGeometry(new THREE.PlaneGeometry(dashLen, dashW));
        const vertDashGeo = this.trackGeometry(new THREE.PlaneGeometry(dashW, dashLen));

        const vertRoadXs: number[] = [];
        for (let gx = -half; gx < half; gx++) vertRoadXs.push((gx + 0.5) * blockSpacing);
        const horizRoadZs: number[] = [];
        for (let gz = -half; gz < half; gz++) horizRoadZs.push((gz + 0.5) * blockSpacing);
        const halfSW = streetWidth / 2;

        for (let gz = -half; gz < half; gz++) {
            const z = (gz + 0.5) * blockSpacing;
            const xs: number[] = [];
            for (let d = -totalLen / 2; d < totalLen / 2; d += dashLen + gapLen) {
                const cx = d + dashLen / 2;
                if (vertRoadXs.some(vx => Math.abs(cx - vx) < halfSW)) continue;
                xs.push(cx);
            }
            this.addDashStrip(horizDashGeo, lineMat, xs.map(x => [x, z] as const));
        }

        for (let gx = -half; gx < half; gx++) {
            const x = (gx + 0.5) * blockSpacing;
            const zs: number[] = [];
            for (let d = -totalLen / 2; d < totalLen / 2; d += dashLen + gapLen) {
                const cz = d + dashLen / 2;
                if (horizRoadZs.some(hz => Math.abs(cz - hz) < halfSW)) continue;
                zs.push(cz);
            }
            this.addDashStrip(vertDashGeo, lineMat, zs.map(z => [x, z] as const));
        }
    }

    private addDashStrip(
        geometry: THREE.BufferGeometry,
        material: THREE.Material,
        positions: readonly (readonly [number, number])[],
    ): void {
        if (positions.length === 0) return;
        const mesh = new THREE.InstancedMesh(geometry, material, positions.length);
        mesh.frustumCulled = true;
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(1, 1, 1);
        for (let i = 0; i < positions.length; i++) {
            dummy.position.set(positions[i][0], 0.02, positions[i][1]);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        this.addObject(mesh);
        this.counts.dashBatches += 1;
        this.counts.dashInstances += positions.length;
    }
}

function emptyCounts(): CityCounts {
    return {
        buildings: 0,
        buildingBodies: 0,
        rooftops: 0,
        roadMeshes: 0,
        dashBatches: 0,
        dashInstances: 0,
        lampCells: 0,
        lampPoles: 0,
        lampHeads: 0,
        lampCones: 0,
        sceneObjects: 0,
        geometries: 0,
        materials: 0,
        textures: 0,
        physicsBodies: 0,
    };
}

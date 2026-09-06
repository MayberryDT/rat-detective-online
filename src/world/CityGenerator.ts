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
        this.generated = true;
        this.counts.sceneObjects = this.objects.length;
        this.counts.geometries = this.geometries.size;
        this.counts.materials = this.materials.size;
        this.counts.textures = this.textures.size;
        this.counts.physicsBodies = this.bodies.length;
        this.counts.buildingBodies = this.bodies.length;
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
        const rooftopMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x333338, roughness: 0.85 }));

        for (const building of layout) {
            this.addBuilding(building, rooftopMat, random);
        }
    }

    private addBuilding(building: BuildingFootprint, rooftopMat: THREE.Material, random: () => number): void {
        const { cx, cz, bw, bd, bh } = building;
        const windowTex = this.createWindowTexture(Math.ceil(bw), Math.ceil(bh), random);
        this.textures.add(windowTex);

        const mat = this.trackMaterial(new THREE.MeshStandardMaterial({
            color: 0x222222,
            roughness: 0.85,
            metalness: 0.08,
            emissiveMap: windowTex,
            emissive: 0xffdd44,
            emissiveIntensity: 2.0,
        }));

        const geo = this.trackGeometry(new THREE.BoxGeometry(bw, bh, bd));
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

    private createWindowTexture(widthUnits: number, heightUnits: number, random: () => number): THREE.CanvasTexture {
        const pxPerUnit = 4;
        const canvas = document.createElement('canvas');
        canvas.width = widthUnits * pxPerUnit;
        canvas.height = heightUnits * pxPerUnit;
        const ctx = canvas.getContext('2d')!;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const spacingX = 4;
        const spacingY = 4;
        const winW = 2;
        const winH = 2;
        const cols = Math.floor(canvas.width / spacingX);
        const rows = Math.floor(canvas.height / spacingY);

        for (let r = 1; r < rows; r++) {
            for (let c = 1; c < cols; c++) {
                if (random() > 0.32) continue;

                const style = random();
                if (style < 0.6) {
                    const brightness = 200 + Math.floor(random() * 55);
                    ctx.fillStyle = `rgb(${brightness}, ${Math.floor(brightness * 0.72)}, ${Math.floor(brightness * 0.15)})`;
                } else if (style < 0.82) {
                    const b = 160 + Math.floor(random() * 60);
                    ctx.fillStyle = `rgb(${Math.floor(b * 0.72)}, ${Math.floor(b * 0.82)}, ${b})`;
                } else {
                    ctx.fillStyle = `rgb(${210 + Math.floor(random() * 45)}, ${50 + Math.floor(random() * 40)}, ${30})`;
                }
                ctx.fillRect(c * spacingX, r * spacingY, winW, winH);
            }
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        return tex;
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

        const poleGeo = this.trackGeometry(new THREE.CylinderGeometry(0.1, 0.14, 6, 6));
        const poleMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.7, metalness: 0.5 }));
        const headGeo = this.trackGeometry(new THREE.CylinderGeometry(0.7, 0.35, 0.45, 8));
        const headMat = this.trackMaterial(new THREE.MeshStandardMaterial({
            color: 0xf0d060,
            emissive: 0xf0d060,
            emissiveIntensity: 3.5,
            roughness: 0.2,
        }));
        const coneGeo = this.trackGeometry(new THREE.ConeGeometry(2.5, 6, 8, 1, true));
        const coneMat = this.trackMaterial(new THREE.MeshBasicMaterial({
            color: 0xf0d060,
            transparent: true,
            opacity: 0.06,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        }));

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

        const asphaltMat = this.trackMaterial(new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 0.95,
            metalness: 0.0,
        }));
        const lineMat = this.trackMaterial(new THREE.MeshBasicMaterial({
            color: 0xccaa22,
            transparent: true,
            opacity: 0.6,
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
            road.position.set(x, 0.01, 0);
            road.receiveShadow = true;
            this.addObject(road);
            this.counts.roadMeshes += 1;
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

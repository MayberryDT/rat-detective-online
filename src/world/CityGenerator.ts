import { AUTHORED_LIGHT_GAIN } from '../session/lightingTuning';
import {beyondCut,buildingColliders,chamferFace,footprintBlocks,isCentralBuilding,skylineMasses,type ChamferFace} from '../shared/skyline';
import { WindowLightCycle } from './WindowLightCycle';
import {windowApertures,uncoveredWindowApertures,facadeWalls,wallApertures,type FacadeWall,type WindowPane,type FacadeMass} from './WindowApertures';
import {cornerEntrances,type CornerEntrance} from './cornerShops';
import type {SpillSource} from '../prototype/StreetReadability';
import {CITY_STREETS} from '../shared/cityPlan';
import { STREET_LAMPS, originalCityBuildingAllowed, isRampOpening } from '../shared/grayboxLayout';
import { generatedStreetLamps,STREET_LAMP_HEIGHT } from '../shared/streetLampLayout';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { addCityBody, cityBoxBody, removeCityBody } from '../shared/StaticCityBroadphase';
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
    readonly windowLights:SpillSource[]=[];
    readonly facadeOccluders:FacadeMass[]=[];
    private steam: {mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; x: number; z: number; phase: number}[] = [];
    private windowStates: {cycle: WindowLightCycle; uniform: {value: number}}[] = [];
    private counts: CityCounts = emptyCounts();
    /** The chamfered building whose details are being placed: trim stops at its cut faces. */
    private cut?: BuildingFootprint;

    constructor(scene: THREE.Scene, world: CANNON.World, opts: CityOptions = DEFAULT_CITY_OPTIONS, spec?: WorldSpec) {
        this.scene = scene;
        this.world = world;
        this.opts = { ...DEFAULT_CITY_OPTIONS, ...opts };
        this.spec = spec ?? createWorldSpec();
    }

    private extension = false;
    private extensionLayout:BuildingFootprint[]=[];
    generate(layoutOverride?:BuildingFootprint[], extension=false): void {
        for (const _step of this.generateSteps(layoutOverride, extension)) { /* Synchronous callers retain identical geometry. */ }
    }

    *generateSteps(layoutOverride?:BuildingFootprint[], extension=false): Generator<void> {
        this.extension=extension;
        if (this.generated) this.dispose();
        const layout = layoutOverride ?? generateBuildingLayout(this.spec, this.opts);
        this.extensionLayout=layout;
        const decorate = createDecorationRandom(this.spec);
        yield* this.generateBuildings(layout, decorate);
        this.generateLampProps(decorate);
        this.generateRoadMarkings();
        this.flushDetails();
        // Buildings, details and props never move: compute their matrices once
        // instead of every frame (thousands of objects). Steam puffs animate.
        const moving = new Set<THREE.Object3D>(this.steam.map(puff => puff.mesh));
        for (const object of this.objects) {
            if (moving.has(object)) continue;
            object.updateMatrixWorld(true); object.matrixAutoUpdate = false; object.matrixWorldAutoUpdate = false;
        }
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
        for (const window of this.windowStates) window.uniform.value = window.cycle.update(this.animationTime);
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
            removeCityBody(this.world, body);
        }
        for (const geometry of this.geometries) geometry.dispose();
        for (const material of this.materials) material.dispose();
        for (const texture of this.textures) texture.dispose();
        this.details.clear(); this.windowLights.length=0; this.facadeOccluders.length=0; this.steam = []; this.windowStates = [];
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

    private *generateBuildings(layout: BuildingFootprint[], random: () => number): Generator<void> {
        this.counts.buildings = layout.length;
        const rooftopMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x34303f, roughness: 0.75 }));

        const trim = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x494350, roughness: 0.76 }));
        const dark = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x252c3d, roughness: 0.58, metalness: 0.3 }));
        const brass = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0xb78a57, metalness: 0.55, roughness: 0.4 }));
        const propRandom = createDecorationRandom({...this.spec, seed: this.spec.seed ^ 0x51f15e});
        const bin = this.trackMaterial(new THREE.MeshStandardMaterial({color: 0x293c39, roughness: 0.83, metalness: 0.3}));
        const wood = this.trackMaterial(new THREE.MeshStandardMaterial({color: 0x594431, roughness: 0.95}));
        bin.userData.streetSurface=wood.userData.streetSurface='obstacle';
        const canvas = this.trackMaterial(new THREE.MeshStandardMaterial({color:0x443239,roughness:1}));
        const entrances=this.extension?cornerEntrances(layout):[];
        // Lit shop windows of the corner entrances: an ordinary lit material, no extra program; lit
        // glass takes no moon shadow (acne stripes across a small yawed pane).
        const glass=entrances.length?this.trackMaterial(new THREE.MeshStandardMaterial({color:0x2a1c12,emissive:0xe89a4a,
            emissiveIntensity:.24*AUTHORED_LIGHT_GAIN,roughness:.2,metalness:.2})):undefined;
        if(glass)glass.userData.receiveDetailShadow=false;
        for (const building of layout) {
            yield;
            const windowStart=this.windowLights.length,detailStart=this.facadeOccluders.length;
            const finishWindows=()=>{
                const visible=uncoveredWindowApertures(this.windowLights.slice(windowStart),this.facadeOccluders.slice(detailStart));
                this.windowLights.splice(windowStart,this.windowLights.length-windowStart,...visible);
            };
            this.addBuilding(building, rooftopMat, random);
            const { cx, cz, bw, bd, bh } = building;
            if(isCentralBuilding(building)){
                this.downtownDetails(building,trim,dark,brass);
                finishWindows();
                continue;
            }
            this.cut=building.chamfers?.length?building:undefined;
            // Cornices and stone plinths give the original box silhouettes depth.
            for (const y of [0.22, 3.4, bh - 0.35]) this.ringDetail(building, trim, y, 0.18, 0.11);
            for (const x of [-1, 1]) for (const z of [-1, 1]) {
                this.boxDetail(trim, cx + x * (bw / 2 - 0.08), bh / 2, cz + z * (bd / 2 - 0.08), 0.2, bh, 0.2);
            }
            const style = Math.abs(Math.round(cx * 13 + cz * 7)) % 3;
            // Low shops, sawtooth workshops and stepped tenements read as different roofs.
            if(this.extension && bh<=16){
                for(const side of [-1,1]){
                    this.boxDetail(trim,cx,bh+.35,cz+side*(bd/2-.3),bw,.7,.6);
                    this.boxDetail(trim,cx+side*(bw/2-.3),bh+.35,cz,.6,.7,bd);
                    this.boxDetail(dark,cx,3.05,cz+side*(bd/2+.35),Math.min(bw-2,12),.2,.8);
                }
                if(style===0){
                    this.boxDetail(trim,cx,bh+1,cz+bd/2-.35,bw*.52,2,.7);
                    this.boxDetail(trim,cx,bh+2.1,cz+bd/2-.35,bw*.55,.2,.82);
                    for(const side of [-1,1]){
                        this.boxDetail(canvas,cx,3.32,cz+side*(bd/2+.66),Math.min(bw-1,14),.26,1.35);
                        this.boxDetail(trim,cx,3.12,cz+side*(bd/2+1.3),Math.min(bw-1,14),.3,.1);
                        for(let i=-2;i<=2;i++)this.boxDetail(brass,cx+i*1.1,2,cz+side*(bd/2+.07),.06,1.7,.06);
                    }
                }else if(style===1){
                    const strip=bd/3;
                    for(let i=0;i<3;i++){
                        const rz=cz-bd/2+(i+.5)*strip;
                        this.boxDetail(dark,cx,bh+.9,rz,bw*.86,.16,strip*.94,.22);
                        this.boxDetail(trim,cx,bh+1.15,rz+strip*.42,bw*.86,.48,.14);
                        for(const x of [-.28,0,.28])this.boxDetail(dark,cx+bw*x,bh+1.1,rz,.1,.16,strip*.94,.22);
                    }
                }else{
                    this.boxDetail(dark,cx,bh+.85,cz,bw*.62,1.7,Math.min(bd*.5,7));
                    this.boxDetail(trim,cx,bh+1.8,cz,bw*.65,.18,Math.min(bd*.5,7)+.35);
                    for(const dx of [-.3,.3]){
                        this.boxDetail(trim,cx+bw*dx,bh+1.1,cz-bd*.25,.65,2.2,.65);
                        this.boxDetail(dark,cx+bw*dx,bh+2.25,cz-bd*.25,.9,.16,.9);
                    }
                }
            }
            // Restrained architectural families share the existing instance batches.
            // All relief is shallow; the original box remains the playable boundary.
            const capHeight = bh <= 16 ? 0.48 : 0.32;
            this.ringDetail(building, trim, bh - 0.65, capHeight, 0.19);
            this.ringDetail(building, dark, bh - 1.05, 0.16, 0.06);
            for (const side of [-1, 1]) {
                const faceZ = cz + side * (bd / 2 + 0.06);
                const faceX = cx + side * (bw / 2 + 0.06);
                // Framed entrance, glazed transom, handles, and a strong lintel.
                for (const offset of [-1.02, 1.02]) {
                    this.boxDetail(trim, cx + offset, 1.45, faceZ, 0.2, 2.9, 0.18);
                    this.boxDetail(brass, cx + offset * 0.25, 1.1, faceZ + side * 0.07, 0.035, 0.32, 0.08);
                }
                this.boxDetail(trim, cx, 2.98, faceZ, 2.24, 0.24, 0.22);
                this.boxDetail(dark, cx, 2.67, faceZ + side * 0.015, 1.82, 0.34, 0.06);
                this.boxDetail(brass, cx, 2.67, faceZ + side * 0.055, 0.035, 0.32, 0.04);
                // Masonry bays on every elevation, not just a decorated front.
                const bays = Math.max(2, Math.min(5, Math.floor(bw / 5)));
                for (let bay = 0; bay <= bays; bay++) {
                    const x = cx - bw / 2 + 0.3 + bay * (bw - 0.6) / bays;
                    if (style === 0) {
                        this.boxDetail(trim, x, 2, faceZ, 0.22, 3.5, 0.14);
                    } else {
                        this.boxDetail(style === 1 ? trim : dark, x, (bh + 3.6) / 2, faceZ,
                            style === 1 ? 0.26 : 0.16, Math.max(0.4, bh - 4.8), 0.13);
                    }
                }
                for (const offset of [-0.28, 0.28]) {
                    this.boxDetail(style === 1 ? trim : dark, faceX, (bh + 3.6) / 2, cz + bd * offset,
                        0.13, Math.max(0.4, bh - 4.8), 0.25);
                }
                if (style === 0 || bh <= 16) {
                    // Workshop side vent and horizontal lintels break up blank slabs.
                    this.boxDetail(dark, faceX, 2.2, cz, 0.08, 1.25, Math.min(3, bd * 0.35));
                    for (let slat = 0; slat < 4; slat++) this.boxDetail(trim, faceX + side * 0.045,
                        1.75 + slat * 0.27, cz, 0.04, 0.06, Math.min(2.8, bd * 0.32));
                    this.boxDetail(trim, cx, Math.min(6.4, bh - 2), faceZ, bw, 0.2, 0.18);
                } else if (style === 2) {
                    for (let y = 9; y < bh - 5; y += 12) this.ringDetail(building, trim, y, 0.15, 0.075);
                }
            }
            if (bh > 16) {
                // Rooftop service housing, louver slats, and paired exhaust caps.
                const roofW = Math.min(4.5, bw * 0.4), roofD = Math.min(3, bd * 0.35);
                this.boxDetail(dark, cx, bh + 0.75, cz, roofW, 1.5, roofD);
                this.boxDetail(trim, cx, bh + 1.55, cz, roofW + 0.25, 0.16, roofD + 0.25);
                for (let row = 0; row < 3; row++) this.boxDetail(trim, cx, bh + 0.4 + row * 0.3,
                    cz + roofD / 2 + 0.025, roofW * 0.8, 0.06, 0.04);
                for (const offset of [-0.25, 0.25]) {
                    this.boxDetail(dark, cx + bw * offset, bh + 0.6, cz - bd * 0.24, 0.35, 1.2, 0.35);
                    this.boxDetail(trim, cx + bw * offset, bh + 1.23, cz - bd * 0.24, 0.65, 0.12, 0.65);
                }
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
            // A fire escape is one piece: it stays whole or goes when it would hang over a cut.
            if (propRandom() < 0.2 && !building.chamfers?.some(k=>beyondCut(building,k,cx+bw/2+.95,cz+k.sz*1.3)>0)) {
                for (let level = 0; level < 3 && 5.3 + level * 3 < bh; level++) {
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
            this.cut=undefined;
            if(glass)for(const e of entrances)if(e.building===building)this.cornerEntrance(e,trim,dark,brass,glass);
            finishWindows();
        }
        if(entrances.length)this.cornerSigns(entrances);
    }

    private addBuilding(building: BuildingFootprint, rooftopMat: THREE.Material, random: () => number): void {
        const { cx, cz, bw, bh } = building;
        const { facade, glow, rooms, panes } = this.createWindowTexture(Math.ceil(bw), Math.ceil(bh), random);
        this.textures.add(facade); this.textures.add(glow);

        const mat = this.trackMaterial(new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(0.60 + random() * 0.12, 0.10 + random() * 0.08, 0.065 + random() * 0.025),
            map: facade,
            roughness: 0.8,
            metalness: 0.08,
            emissiveMap: glow,
            emissive: 0xffffff,
            emissiveIntensity: 1.1*AUTHORED_LIGHT_GAIN,
        }));

        // Six apartment/office sections share per-building uniforms. Whole groups
        // change occupancy visibly, with no new lights or per-frame texture uploads.
        const roomUniforms = rooms.map((room, i) => {
            const seed = this.spec.seed ^ Math.imul(Math.round(cx * 100), 73856093)
                ^ Math.imul(Math.round(cz * 100), 19349663) ^ Math.imul(i + 1, 83492791);
            const cycle = new WindowLightCycle(seed);
            const uniform = {value: cycle.brightness};
            this.windowStates.push({cycle, uniform});
            return {rect: {value: room}, light: uniform};
        });
        mat.onBeforeCompile = shader => {
            let declarations = '';
            // A cut face wraps the facade past u=1; rooms repeat with it.
            let emission = '#include <emissivemap_fragment>\nfloat occupancy = 1.0;\n#ifdef USE_EMISSIVEMAP\nvec2 roomUv = vec2(fract(vEmissiveMapUv.x), vEmissiveMapUv.y);\n#endif\n';
            roomUniforms.forEach((room, i) => {
                shader.uniforms[`roomRect${i}`] = room.rect;
                shader.uniforms[`roomLight${i}`] = room.light;
                declarations += `uniform vec4 roomRect${i};\nuniform float roomLight${i};\n`;
                emission += `\n#ifdef USE_EMISSIVEMAP\n{
                    vec2 insideRoom = step(roomRect${i}.xy, roomUv) * step(roomUv, roomRect${i}.zw);
                    occupancy *= mix(1.0, roomLight${i}, insideRoom.x * insideRoom.y);
                }\n#endif\n`;
            });
            emission += `\n#ifdef USE_EMISSIVEMAP\nfloat roomPixel = step(0.015, max(emissiveColor.r, max(emissiveColor.g, emissiveColor.b)));\ndiffuseColor.rgb = mix(diffuseColor.rgb, min(diffuseColor.rgb, vec3(0.018, 0.024, 0.032)), roomPixel * (1.0 - occupancy));\ntotalEmissiveRadiance *= occupancy;\n#endif\n`;
            shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + declarations)
                .replace('#include <emissivemap_fragment>', emission);
        };
        mat.customProgramCacheKey = () => `city-room-occupancy-v3-${roomUniforms.length}`;

        if(building.chamfers?.length){
            // A prism around the cut outline, the facade running on round every face.
            facade.wrapS = glow.wrapS = THREE.RepeatWrapping;
            const walls=facadeWalls(building);
            if(this.extension)this.windowLights.push(...wallApertures(panes,roomUniforms,walls,bh));
            const mesh = new THREE.Mesh(this.trackGeometry(prismGeometry(building,walls)), mat);
            mesh.position.set(cx,bh/2,cz);
            mesh.castShadow = true; mesh.receiveShadow = true;
            mesh.userData.aimTarget = true;
            this.addObject(mesh);
        }else for(const mass of skylineMasses(building)){
            if(this.extension)this.windowLights.push(...windowApertures(panes,roomUniforms,mass,bh));
            const geo = this.trackGeometry(new THREE.BoxGeometry(mass.w, mass.h, mass.d));
            const uv = geo.getAttribute('uv');
            const base = mass.y - mass.h / 2;
            for(let i=0;i<uv.count;i++)uv.setY(i,(base+uv.getY(i)*mass.h)/bh);
            // Roof/foundation sample blank texels rather than sideways windows.
            const indices = geo.getIndex()!;
            for (const group of geo.groups) if (group.materialIndex === 2 || group.materialIndex === 3) {
                for (let i = group.start; i < group.start + group.count; i++) uv.setXY(indices.getX(i), 0, 0);
            }
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(mass.x,mass.y,mass.z);
            mesh.castShadow = true; mesh.receiveShadow = true;
            mesh.userData.aimTarget = true;
            this.addObject(mesh);
        }
        // The same boxes the server gets as graybox `original` colliders.
        for(const collider of buildingColliders(building)){
            const body=cityBoxBody({...collider,rx:0,rz:0});
            addCityBody(this.world, body); this.bodies.push(body);
        }
        if (!isCentralBuilding(building) && random() < 0.4) {
            this.addRooftopDetail(building, rooftopMat, random);
            this.counts.rooftops += 1;
        }
    }

    /** Deeply articulated downtown towers, built around their real stepped masses. */
    private downtownDetails(b:BuildingFootprint,stone:THREE.Material,steel:THREE.Material,brass:THREE.Material):void {
        const style=Math.abs(Math.round(b.cx+b.cz))%3;
        for(const m of skylineMasses(b)){
            const bottom=m.y-m.h/2,top=m.y+m.h/2;
            // Setback cornices, recessed window bays, and continuous slender piers.
            this.boxDetail(stone,m.x,top-.3,m.z,m.w+.38,.6,m.d+.38);
            this.boxDetail(steel,m.x,top-1.05,m.z,m.w+.15,.24,m.d+.15);
            for(const side of [-1,1]){
                const z=m.z+side*(m.d/2+.07),x=m.x+side*(m.w/2+.07);
                for(let i=0;i<=Math.floor(m.w/4);i++){
                    const px=m.x-m.w/2+.22+i*(m.w-.44)/Math.floor(m.w/4);
                    this.boxDetail(style===2?steel:stone,px,m.y,z,.28,m.h-.65,.2);
                    if(style===0)this.boxDetail(brass,px,top-2.5,z+side*.11,.085,3,.04);
                }
                for(let i=0;i<=Math.floor(m.d/4);i++){
                    const pz=m.z-m.d/2+.22+i*(m.d-.44)/Math.floor(m.d/4);
                    this.boxDetail(style===2?steel:stone,x,m.y,pz,.2,m.h-.65,.28);
                }
                for(let y=bottom+6;y<top-3;y+=style===1?6:12){
                    this.boxDetail(style===1?stone:steel,m.x,y,z,m.w,.18,.18);
                    this.boxDetail(style===1?stone:steel,x,y,m.z,.18,.18,m.d);
                }
            }
        }
        // A grounded entrance and textured plinth at the original walkable boundary.
        for(const side of [-1,1]){
            const z=b.cz+side*(b.bd/2+.09);
            this.boxDetail(stone,b.cx,1.2,z,b.bw,2.4,.2);
            this.boxDetail(steel,b.cx,2,z+side*.13,3.8,4,.08);
            for(const x of [-2.2,2.2])this.boxDetail(stone,b.cx+x,2.2,z+side*.16,.48,4.4,.36);
            this.boxDetail(brass,b.cx,4.5,z+side*.16,5.1,.16,.42);
            this.boxDetail(steel,b.cx,4.78,z+side*.43,5.8,.25,1.1);
            for(const x of [-.9,0,.9])this.boxDetail(brass,b.cx+x,2,z+side*.2,.065,3.8,.065);
            for(const x of [-3.2,3.2])this.boxDetail(brass,b.cx+x,3.6,z+side*.22,.25,.75,.18);
        }
        const crown=skylineMasses(b)[2];
        this.boxDetail(steel,b.cx,b.bh+.7,b.cz,crown.w*.62,1.4,crown.d*.62);
        this.boxDetail(stone,b.cx,b.bh+1.5,b.cz,crown.w*.7,.2,crown.d*.7);
        for(const side of [-1,1])this.boxDetail(brass,b.cx+side*crown.w*.28,b.bh+2,b.cz,.13,2.5,.13);
    }

    private addRooftopDetail(building: BuildingFootprint, mat: THREE.Material, random: () => number): void {
        const { cx, cz, bw, bd, bh } = building;
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
        // Never over a cut corner's missing roof.
        if (building.chamfers?.some(k => beyondCut(building, k, detail.position.x + k.sx * dw / 2, detail.position.z + k.sz * dd / 2) > 0)) {
            detail.position.x = cx; detail.position.z = cz;
        }
        detail.castShadow = true;
        this.addObject(detail);
    }

    private boxDetail(material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, slope=0, yaw=0): void {
        const b=this.cut;
        if(b&&!yaw)for(const k of b.chamfers??[]){
            const over=beyondCut(b,k,x+k.sx*sx/2,z+k.sz*sz/2);
            if(over<=.02)continue;
            // Trim running along a wall stops at the cut; anything else in front of the face goes.
            if(sx>=2.5&&sx>=2*sz){sx-=over;x-=k.sx*over/2;}
            else if(sz>=2.5&&sz>=2*sx){sz-=over;z-=k.sz*over/2;}
            else return;
            if(sx<.3||sz<.3)return;
        }
        if(this.extension&&!slope){
            // A yawed piece occludes windows by its bounds (conservative).
            const c=Math.abs(Math.cos(yaw)),s=Math.abs(Math.sin(yaw));
            this.facadeOccluders.push({x,y,z,w:c*sx+s*sz,h:sy,d:s*sx+c*sz});
        }
        dummy.position.set(x, y, z); dummy.rotation.set(slope, yaw, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
        const list = this.details.get(material) ?? [];
        list.push(dummy.matrix.clone()); this.details.set(material, list);
    }

    /** Trim wrapping the whole footprint (cornices, caps, belts); on a chamfered one it follows the cuts. */
    private ringDetail(b: BuildingFootprint, material: THREE.Material, y: number, h: number, grow: number): void {
        if(!b.chamfers?.length){this.boxDetail(material, b.cx, y, b.cz, b.bw + grow * 2, h, b.bd + grow * 2);return;}
        const cut=this.cut;this.cut=undefined;
        for(const m of footprintBlocks(b))this.boxDetail(material, m.x, y, m.z, m.w + grow * 2, h, m.d + grow * 2);
        // Mitred into the side runs: the face grows by 2·grow·tan(22.5°).
        for(const k of b.chamfers){const f=chamferFace(b,k);this.faceDetail(f, material, 0, y, -.1, f.length + grow * .83, h, grow * 2 + .2);}
        this.cut=cut;
    }

    /** A detail on a cut face: `along` the face from its middle, `out` along its normal. */
    private faceDetail(f: ChamferFace, material: THREE.Material, along: number, y: number, out: number, w: number, h: number, d: number): void {
        const tx=(f.b.x-f.a.x)/f.length,tz=(f.b.z-f.a.z)/f.length;
        this.boxDetail(material, f.x+tx*along+f.nx*out, y, f.z+tz*along+f.nz*out, w, h, d, 0, Math.atan2(-tz,tx));
    }

    /** A corner business on a cut face: quoins where the cut meets the walls, plate glass either side of
     * a door, a canopy over it, and the boards and brackets of its fascia and blade signs. */
    private cornerEntrance({building: b, face: f}: CornerEntrance, trim: THREE.Material, dark: THREE.Material, brass: THREE.Material, glass: THREE.Material): void {
        const L=f.length;
        for(const p of [f.a,f.b])this.boxDetail(trim, p.x-f.nx*.1, b.bh/2, p.z-f.nz*.1, .26, b.bh, .26);
        // Stall riser, sill, plate glass and mullions under a transom bar.
        this.faceDetail(f, dark, 0, .42, .06, L-.5, .84, .14);
        this.faceDetail(f, trim, 0, .88, .1, L-.5, .08, .22);
        for(const s of [-1,1]){
            this.faceDetail(f, glass, s*2.5, 1.72, .03, 2.3, 1.6, .06);
            for(const a of [1.3,3.7])this.faceDetail(f, trim, s*a, 1.72, .07, .12, 1.72, .14);
            // Muntins split each window into a display pane under a transom row, and a café
            // curtain rod and a dark counter line break up the lit glass.
            this.faceDetail(f, trim, s*2.5, 1.72, .07, .07, 1.6, .1);
            this.faceDetail(f, trim, s*2.5, 2.2, .07, 2.3, .07, .1);
            this.faceDetail(f, dark, s*2.5, 1.32, .055, 2.26, .5, .03);
            this.faceDetail(f, brass, s*2.5, 1.6, .06, 2.3, .03, .04);
        }
        this.faceDetail(f, trim, 0, 2.66, .09, L-.5, .12, .18);
        // The door: frame, panel, its glass and a brass push bar.
        for(const s of [-1,1])this.faceDetail(f, trim, s*.95, 1.3, .08, .16, 2.6, .16);
        this.faceDetail(f, dark, 0, 1.15, .02, 1.6, 2.3, .06);
        this.faceDetail(f, glass, 0, 1.65, .05, .8, .85, .04);
        this.faceDetail(f, brass, 0, 1.08, .08, .7, .05, .05);
        // Sign board over the shopfront, and a canopy over the door on two brackets.
        this.faceDetail(f, dark, 0, 3.6, .05, L-.6, 1.05, .1);
        this.faceDetail(f, brass, 0, 3.05, .08, L-.6, .06, .08);
        this.faceDetail(f, dark, 0, 2.95, .72, 3.2, .12, 1.4);
        this.faceDetail(f, brass, 0, 2.93, 1.42, 3.2, .2, .05);
        for(const s of [-1,1])this.faceDetail(f, trim, s*1.45, 2.72, .6, .08, .42, 1.1);
        // The blade sign stands off the face on two arms.
        for(const y of [4.55,7.55])this.faceDetail(f, trim, 0, y, .45, .07, .07, .9);
        this.faceDetail(f, dark, 0, 6.05, 1.02, .1, 3.35, .95);
        if(this.extension&&b.bh<=16)this.faceDetail(f, trim, 0, b.bh+.35, -.3, L+.35, .7, .6);
    }

    /** Every corner sign from one canvas atlas: one material, one mesh. Neon glows; painted boards
     * only catch a little light. Fascias run 512×64 down the left half, blades 64×256 on the right. */
    private cornerSigns(entrances: readonly CornerEntrance[]): void {
        if(typeof document==='undefined')return;
        const color=document.createElement('canvas'),light=document.createElement('canvas');
        color.width=color.height=light.width=light.height=1024;
        const paint=color.getContext('2d')!,glow=light.getContext('2d')!;
        paint.fillStyle='#0d0a0c';paint.fillRect(0,0,1024,1024);glow.fillStyle='#000';glow.fillRect(0,0,1024,1024);
        const position:number[]=[],uv:number[]=[],index:number[]=[];
        const quad=(x:number,y:number,z:number,nx:number,nz:number,hw:number,hh:number,u0:number,v0:number,u1:number,v1:number)=>{
            const i=position.length/3,rx=nz*hw,rz=-nx*hw;
            position.push(x-rx,y-hh,z-rz, x+rx,y-hh,z+rz, x+rx,y+hh,z+rz, x-rx,y+hh,z-rz);
            uv.push(u0,v0,u1,v0,u1,v1,u0,v1);index.push(i,i+1,i+2,i,i+2,i+3);
        };
        const drawn=new Set<number>();
        entrances.forEach(({face:f,shop},i)=>{
            const slot=i%16,fy=slot*64,bx=512+slot%8*64,by=Math.floor(slot/8)*256;
            if(!drawn.has(slot)){
                drawn.add(slot);
                for(const [ctx,lit] of [[paint,false],[glow,true]] as const){
                    ctx.save();
                    if(!shop.neon&&!lit){ctx.fillStyle=slot%2?'#1f2a24':'#2c1c1a';ctx.fillRect(4,fy+4,504,56);ctx.fillRect(bx+4,by+4,56,248);}
                    ctx.strokeStyle=ctx.fillStyle=shop.ink;ctx.globalAlpha=lit&&!shop.neon?.22:1;
                    if(shop.neon){ctx.shadowColor=shop.ink;ctx.shadowBlur=lit?14:6;}
                    ctx.lineWidth=3;ctx.strokeRect(9,fy+9,494,46);ctx.strokeRect(bx+9,by+9,46,238);
                    ctx.textAlign='center';ctx.textBaseline='middle';
                    ctx.font='bold 34px Georgia, "Times New Roman", serif';ctx.fillText(shop.name,256,fy+33,470);
                    const letters=[...shop.blade],step=226/letters.length;
                    ctx.font=`bold ${Math.round(Math.min(38,step*.92))}px Georgia, "Times New Roman", serif`;
                    letters.forEach((letter,n)=>ctx.fillText(letter,bx+32,by+15+step*(n+.5)));
                    ctx.restore();
                }
            }
            quad(f.x+f.nx*.12,3.6,f.z+f.nz*.12,f.nx,f.nz,3.2,.4,0,1-(fy+64)/1024,.5,1-fy/1024);
            // Both faces of the blade, which stands along the face normal.
            const tx=(f.b.x-f.a.x)/f.length,tz=(f.b.z-f.a.z)/f.length;
            for(const s of [-1,1])quad(f.x+f.nx*1.02+tx*s*.056,6.05,f.z+f.nz*1.02+tz*s*.056,tx*s,tz*s,.4,1.6,bx/1024,1-(by+256)/1024,(bx+64)/1024,1-by/1024);
        });
        const map=new THREE.CanvasTexture(color),emissiveMap=new THREE.CanvasTexture(light);
        map.colorSpace=emissiveMap.colorSpace=THREE.SRGBColorSpace;map.anisotropy=emissiveMap.anisotropy=4;
        this.textures.add(map);this.textures.add(emissiveMap);
        const geometry=new THREE.BufferGeometry();
        geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
        geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
        geometry.setIndex(index);geometry.computeVertexNormals();
        const material=this.trackMaterial(new THREE.MeshStandardMaterial({map,emissiveMap,emissive:0xffffff,emissiveIntensity:1.25*AUTHORED_LIGHT_GAIN,roughness:.7}));
        const signs=new THREE.Mesh(this.trackGeometry(geometry),material);
        signs.name='corner-signs';this.addObject(signs);
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

    private createWindowTexture(widthUnits: number, heightUnits: number, random: () => number) {
        const panes:WindowPane[]=[];
        const canvas = document.createElement('canvas'), emission = document.createElement('canvas');
        canvas.width = emission.width = Math.max(64, Math.ceil(widthUnits / 2.4) * 24);
        canvas.height = emission.height = Math.max(64, Math.ceil(heightUnits / 3) * 28);
        const ctx = canvas.getContext('2d')!, light = emission.getContext('2d')!;
        ctx.fillStyle = '#49434f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        light.fillStyle = '#000000'; light.fillRect(0, 0, canvas.width, canvas.height);
        for (let y = 0; y < canvas.height; y += 7) {
            ctx.fillStyle = y % 28 === 0 ? '#302b37' : '#403947';
            ctx.fillRect(0, y, canvas.width, 1);
        }
        for (let y = 0; y < canvas.height; y += 7) {
            ctx.fillStyle = '#37323e';
            for (let x = (y / 7) % 2 === 0 ? 0 : 12; x < canvas.width; x += 24) ctx.fillRect(x, y, 1, 7);
        }
        // The street floor has a darker stone base, keeping bright rooms above it.
        ctx.fillStyle = '#332f3a'; ctx.fillRect(0, canvas.height - 26, canvas.width, 26);
        ctx.fillStyle = '#5a5260'; ctx.fillRect(0, canvas.height - 28, canvas.width, 2);
        for (let y = 12; y < canvas.height - 28; y += 28) for (let x = 6; x < canvas.width - 10; x += 24) {
            ctx.fillStyle = '#38303e'; ctx.fillRect(x - 2, y - 2, 16, 20);
            ctx.fillStyle = '#202c3b'; ctx.fillRect(x, y, 12, 16);
            ctx.fillStyle = '#45394b'; ctx.fillRect(x - 2, y + 16, 16, 2);
            if (random() < 0.32) {
                const palette = ['#ffd27a', '#ffc04b', '#ffe5a0', '#7fc9e8', '#e37754'];
                const selection = random();
                const color = palette[selection < 0.40 ? 0 : selection < 0.65 ? 1 : selection < 0.80 ? 2 : selection < 0.93 ? 3 : 4];
                ctx.fillStyle = color; light.fillStyle = color;
                ctx.fillRect(x, y, 12, 16); light.fillRect(x, y, 12, 16);
                // Mullions and occasional lowered blinds preserve window structure.
                light.fillStyle = '#000000'; ctx.fillStyle = '#484651';
                ctx.fillRect(x + 5, y, 2, 16); light.fillRect(x + 5, y, 2, 16);
                ctx.fillRect(x, y + 8, 12, 1); light.fillRect(x, y + 8, 12, 1);
                const blind=random()<.3;
                if (blind) {
                    ctx.fillRect(x, y, 12, 5); light.fillRect(x, y, 12, 5);
                }
                panes.push({u0:x/canvas.width,u1:(x+12)/canvas.width,
                    v0:1-(y+16)/canvas.height,v1:1-(y+(blind?5:0))/canvas.height,color:Number.parseInt(color.slice(1),16)});
            }
        }
        const facade = new THREE.CanvasTexture(canvas), glow = new THREE.CanvasTexture(emission);
        facade.colorSpace = glow.colorSpace = THREE.SRGBColorSpace;
        facade.anisotropy = glow.anisotropy = 4;
        const rooms:THREE.Vector4[]=[];
        for(let row=0;row<3;row++)for(let column=0;column<2;column++){
            rooms.push(new THREE.Vector4(column/2,row/3,(column+1)/2,(row+1)/3));
        }
        return { facade, glow, rooms, panes };
    }

    private generateLampProps(random: () => number): void {
        const { gridSize, blockSpacing, streetWidth } = this.opts;
        const half = gridSize / 2;
        const offset = streetWidth / 2 + 1.5;
        const cells = new Map<string, THREE.Vector3[]>();

        if(this.extension){
            for(const [x,z] of [...STREET_LAMPS,...generatedStreetLamps(this.extensionLayout,STREET_LAMPS)])this.pushLamp(cells,x,z);
        }else{
        for (let gx = -half; gx < half; gx++) {
            for (let gz = -half; gz < half; gz++) {
                const ix = (gx + 0.5) * blockSpacing;
                const iz = (gz + 0.5) * blockSpacing;
                if (random() < 0.6) this.pushLamp(cells, ix + offset, iz + offset);
                if (random() < 0.4) this.pushLamp(cells, ix - offset, iz - offset);
            }
        }

        }
        if (cells.size === 0) return;

        const poleGeo = this.trackGeometry(new THREE.LatheGeometry([[0.25,0],[0.25,0.18],[0.18,0.25],[0.12,0.8],[0.09,5.7],[0.22,5.9],[0.22,6]].map(([r,y]) => new THREE.Vector2(r,y - 3)), 10));
        const poleMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x34333e, roughness: 0.7, metalness: 0.5 }));
        const headGeo = this.trackGeometry(new THREE.CylinderGeometry(0.32, 0.27, 0.65, 8));
        const headMat = this.trackMaterial(new THREE.MeshStandardMaterial({
            color: 0xffdfac,
            emissive: 0xffbd62,
            emissiveIntensity: 2.2*AUTHORED_LIGHT_GAIN,
            roughness: 0.2,
        }));
        const coneGeo = this.trackGeometry(new THREE.ConeGeometry(5.7, STREET_LAMP_HEIGHT, 20, 1, true));
        const coneMat = this.trackMaterial(new THREE.MeshBasicMaterial({
            color: 0xffcc89,
            transparent: true,
            opacity: 0.009,
            side: THREE.DoubleSide,
            forceSinglePass: true,
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
            const material = this.trackMaterial(new THREE.MeshBasicMaterial({color:0x898799, map:glowTexture, transparent:true, opacity:0, depthWrite:false, side:THREE.DoubleSide, forceSinglePass:true}));
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
                this.boxDetail(poleMat, x, STREET_LAMP_HEIGHT+.62, z, 0.95, 0.12, 0.95);
                this.boxDetail(poleMat, x, STREET_LAMP_HEIGHT-.15, z, 0.65, 0.1, 0.65);
                for (const side of [-1, 1]) {
                    this.boxDetail(poleMat, x + side * 0.24, STREET_LAMP_HEIGHT+.2, z, 0.055, 0.65, 0.055);
                    this.boxDetail(poleMat, x, STREET_LAMP_HEIGHT+.2, z + side * 0.24, 0.055, 0.65, 0.055);
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
        const cones = new THREE.InstancedMesh(coneGeo, coneMat, lamps.length);
        poles.castShadow = true;
        heads.castShadow = false;
        poles.frustumCulled = true;
        heads.frustumCulled = true;

        for (let i = 0; i < lamps.length; i++) {
            const { x, z } = lamps[i];
            dummy.position.set(x, STREET_LAMP_HEIGHT/2, z);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(1, STREET_LAMP_HEIGHT/6, 1);
            dummy.updateMatrix();
            poles.setMatrixAt(i, dummy.matrix);
            dummy.position.set(x, STREET_LAMP_HEIGHT+.2, z);dummy.scale.set(1,1,1);
            dummy.updateMatrix();
            heads.setMatrixAt(i, dummy.matrix);

            dummy.position.set(x,STREET_LAMP_HEIGHT/2,z);dummy.updateMatrix();cones.setMatrixAt(i,dummy.matrix);
            this.counts.lampCones += 1;
        }

        poles.instanceMatrix.needsUpdate = true;
        heads.instanceMatrix.needsUpdate = true;
        cones.instanceMatrix.needsUpdate = true;cones.computeBoundingSphere();this.addObject(cones);
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
        asphaltMat.userData.streetSurface='ground';
        const lineMat = this.trackMaterial(new THREE.MeshBasicMaterial({
            color: 0xd6b777,
            transparent: true,
            opacity: 0.72,
        }));
        const horizRoadGeo = this.trackGeometry(new THREE.PlaneGeometry(totalLen, streetWidth));
        const vertRoadGeo = this.trackGeometry(new THREE.PlaneGeometry(streetWidth, totalLen));

        if(this.extension){
            const segmentGeo=this.trackGeometry(new THREE.PlaneGeometry(2,2));
            const positions: [number,number][]=[];
            for(let x=-195;x<166;x+=2)for(let z=-195;z<166;z+=2){
                if(isRampOpening(x,z))continue;
                if(CITY_STREETS.some(r=>Math.abs(x-r.x)<r.w/2 && Math.abs(z-r.z)<r.d/2))positions.push([x,z]);
            }
            this.addDashStrip(segmentGeo,asphaltMat,positions);
        }else{
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
        sidewalk.userData.streetSurface='ground';curb.userData.streetSurface='curb';
        const paint = this.trackMaterial(new THREE.MeshStandardMaterial({color: 0x77716f, roughness: 0.9}));
        paint.userData.receiveDetailShadow = false;
        const drain = this.trackMaterial(new THREE.MeshStandardMaterial({color: 0x202b38, roughness: 0.6, metalness: 0.5}));
        if(this.extension){
            for(const b of this.extensionLayout){
                this.boxDetail(sidewalk,b.cx,0.015,b.cz,b.bw+2,.06,b.bd+2);
                for(const side of [-1,1]){
                    this.boxDetail(curb,b.cx+side*(b.bw/2+1),.04,b.cz,.16,.08,b.bd+2);
                    this.boxDetail(curb,b.cx,.04,b.cz+side*(b.bd/2+1),b.bw+2,.08,.16);
                }
            }
            for(const r of CITY_STREETS){
                const horizontal=r.w>r.d,span=horizontal?r.w:r.d;
                for(let t=-span/2+4;t<span/2-4;t+=7){
                    const x=r.x+(horizontal?t:0),z=r.z+(horizontal?0:t);
                    if(isRampOpening(x,z))continue;
                    if(CITY_STREETS.some(other=>other!==r&&Math.abs(x-other.x)<other.w/2+2&&Math.abs(z-other.z)<other.d/2+2))continue;
                    this.boxDetail(paint,x,.035,z,horizontal?2.5:.12,.015,horizontal?.12:2.5);
                }
            }
            return;
        }
        const block = blockSpacing - streetWidth;
        for (let gx = -half; gx < half; gx++) for (let gz = -half; gz < half; gz++) {
            const x = gx * blockSpacing, z = gz * blockSpacing;
            if(this.extension && !originalCityBuildingAllowed(x,z))continue;
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
        if(this.extension)positions=positions.filter(([x,z])=>!isRampOpening(x,z));
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

/** Walls and roof of a chamfered building, centred like its BoxGeometry would be. The roof samples
 * the blank texel at (0,0), as a box's top does. */
function prismGeometry(b: BuildingFootprint, walls: readonly FacadeWall[]): THREE.BufferGeometry {
    const position:number[]=[],normal:number[]=[],uv:number[]=[],index:number[]=[],h=b.bh/2;
    for(const w of walls){
        const i=position.length/3,ax=w.a.x-b.cx,az=w.a.z-b.cz,bx=w.b.x-b.cx,bz=w.b.z-b.cz;
        position.push(ax,-h,az, bx,-h,bz, bx,h,bz, ax,h,az);
        for(let k=0;k<4;k++)normal.push(w.nx,0,w.nz);
        uv.push(w.u0,0,w.u1,0,w.u1,1,w.u0,1);
        index.push(i,i+1,i+2,i,i+2,i+3);
    }
    const roof=position.length/3;
    for(const w of walls){position.push(w.a.x-b.cx,h,w.a.z-b.cz);normal.push(0,1,0);uv.push(0,0);}
    for(let k=1;k<walls.length-1;k++)index.push(roof,roof+k,roof+k+1);
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geometry.setIndex(index);
    return geometry;
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

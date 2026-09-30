import { AUTHORED_LIGHT_GAIN } from '../session/lightingTuning';
import { yieldToPage } from '../session/yieldToPage';
import {CENTRAL_BUILDINGS} from '../shared/skyline';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DISPATCH_STATIONS, LAUNCH_MACHINES } from '../shared/chaosState';
import { SewerPortals } from './SewerPortals';
import { CityGrime } from './CityGrime';
import { ParkedVehicles } from './ParkedVehicles';
import { LandmarkArchitecture } from './LandmarkArchitecture';
import { KitArchitecture } from './KitArchitecture';
import { cityHarbourWater, type HarbourWater } from './HarbourWater';
import { kitCity } from '../shared/city/kit/city';
import { disposeMeshResources } from '../utils/disposeMeshResources';
import {StreetLightPool} from './StreetLightPool';
import {interiorFixtures,LIGHT_ROOMS,type InteriorFixture} from './InteriorLighting';
import {applyFixedIllumination,FixedLightField} from './FixedLighting';
import {readLightingMode,type LightingMode} from '../session/lightingMode';
import {generatedStreetLamps,STREET_LAMP_HEIGHT,type StreetLampPosition} from '../shared/streetLampLayout';
import {SPILL_ATLAS_BYTES,StreetReadability,streetReadabilityEnabled} from './StreetReadability';
import {bakeGeometry,parseCityBake,restoreGeometry,type BakedGeometry,type CityBakeRecord,type CityBakeShape,type CityBakeSource} from './CityBakeCache';

import { STREET_LAMPS, grayboxBoxes, CITY_PREVIEW_SEED, GRAYBOX_VERSION } from '../shared/grayboxLayout';
import {cityStreetBuildings} from '../shared/cityPlan';
import {landmarkStairDetails,LANDMARK_INTERIORS,LANDMARK_STAIR_LIGHTS} from '../shared/landmarkLayout';
import {SEWER_LIGHTS} from '../shared/sewerLayout';
import { SEWER_PORTAL_LIGHTS, sewerLightingActive } from './SewerLighting';
import {CityGenerator} from '../world/CityGenerator';
import {generateBuildingLayout, type WorldSpec} from '../shared/worldSpec';
import {addCityBody,cityBoxBody,removeCityBody} from '../shared/StaticCityBroadphase';
import {boxQuaternion} from '../shared/boxFrame';
export { BLOCKS, ENTRIES, isRampOpening } from '../shared/grayboxLayout';

/** Pooled sewer lamps (hidden above ground); program warm-up lights the stand-ins with this many. */
export const SEWER_LAMPS=8;
/** A build step at which `prepare` hands over the stored bake (read while the city generates). */
const BAKE_STEP='bake';
/** Graybox meshes merged into one draw: one material, 64-unit cell and shadow role. */
interface GrayboxGroup {material:THREE.MeshStandardMaterial|THREE.MeshBasicMaterial;meshes:THREE.Mesh[];label:string}
export class Neighborhood {
    private readonly streetFill = new THREE.AmbientLight(0x8995b5, 1.25);
    readonly solids: THREE.Mesh[] = [];
    private readonly objects: THREE.Object3D[] = [];
    private readonly bodies: CANNON.Body[] = [];
    private readonly materials = new Map<number,THREE.MeshStandardMaterial>();
    private readonly glowMaterials = new Map<number,THREE.MeshBasicMaterial>();
    private architecture!: LandmarkArchitecture;
    private kit!: KitArchitecture;
    private water?: HarbourWater;
    private vehicles!: ParkedVehicles;
    private grime!: CityGrime;
    private sewerPortals!: SewerPortals;
    private city!: CityGenerator;
    private readonly lampSources:THREE.PointLight[]=[];
    private readonly fixedLights:THREE.PointLight[]=[];
    private readonly lampPool:THREE.PointLight[]=[];
    /** Scratch for `syncLampPool`: the nearest sources and their squared distances, nearest first. */
    private readonly nearestLamps:THREE.PointLight[]=[];
    private readonly nearestDistances:number[]=[];
    /** The eight pooled sewer lamps. Hidden, not merely dark, away from the
     * sewers: every lit pixel loops over each visible light (-30% GPU time). */
    get sewerLights():readonly THREE.PointLight[] {return this.lampPool;}
    private overhead?:StreetLightPool;
    private readability?:StreetReadability;
    private readonly interiorSources=new Map<THREE.PointLight,InteriorFixture>();
    private readonly batches:THREE.Mesh[]=[];
    /** The stored bake for this build (unchecked), set by `prepare` at `BAKE_STEP`. */
    private bakeSource?:CityBakeSource;
    private bakeValue:unknown;
    /** A full build's record, written by `saveBake` once play has started. */
    private pendingBake?:()=>CityBakeRecord;
    constructor(private scene:THREE.Scene, private world:CANNON.World, spec:WorldSpec={seed:CITY_PREVIEW_SEED,version:GRAYBOX_VERSION},private readonly lighting:LightingMode=readLightingMode(), deferred=false) {
        if (!deferred) for (const _step of this.build(spec)) { /* Preserve synchronous fixtures and reconnects. */ }
    }
    /** Build over many turns. With `bake`, a whole matching record replaces the baking; any
     * other outcome is a full build, whose record `saveBake` stores later. */
    static async prepare(scene:THREE.Scene, world:CANNON.World, spec:WorldSpec, signal?:AbortSignal, bake?:CityBakeSource):Promise<Neighborhood> {
        const city = new Neighborhood(scene,world,spec,readLightingMode(),true);
        city.bakeSource=bake;
        let slice=performance.now();
        try { for (const step of city.build(spec)) {
            if(signal?.aborted)throw new DOMException('Page closed','AbortError');
            if(step===BAKE_STEP&&bake){city.bakeValue=await bake.record;slice=performance.now();}
            else if(performance.now()-slice>=8){await yieldToPage(signal);slice=performance.now();}
        } }
        catch (error) { city.dispose(); throw error; }
        return city;
    }
    /** Store a full build's bake, when the page is idle. Call once play has started. */
    saveBake():void {
        const record=this.pendingBake,store=this.bakeSource?.store;
        this.pendingBake=undefined;
        if(!record||!store)return;
        const write=()=>{
            if(this.batches.length===0)return; // disposed
            let value:CityBakeRecord;
            try {value=record();} catch {return;}
            void store.write(value);
        };
        if(typeof requestIdleCallback==='function')requestIdleCallback(write,{timeout:5000});else setTimeout(write,1000);
    }
    private *build(spec:WorldSpec):Generator<void|typeof BAKE_STEP> {
        const {scene,world,lighting}=this;
        const existingObjects=new Set(scene.children);
        this.streetFill.intensity=lighting==='classic'?1.25:.32;
        this.add(this.streetFill);
        for(const body of [...world.bodies]) if(body.shapes.some(shape=>shape instanceof CANNON.Plane)) {this.groundBodies.push(body);world.removeBody(body);}
        for(const obj of [...scene.children]) if(obj instanceof THREE.Mesh && obj.geometry instanceof THREE.PlaneGeometry) {this.groundMeshes.push(obj);scene.remove(obj);}
        this.city=new CityGenerator(scene,world,undefined,{...spec,version:1});
        const layout=[...cityStreetBuildings(generateBuildingLayout({...spec,version:1})),...CENTRAL_BUILDINGS];
        yield* this.city.generateSteps(layout,true);
        const boxes=grayboxBoxes(spec);
        let builtBoxes=0;
        for(const b of boxes){
            if (++builtBoxes % 40 === 0) yield;
            if(b.original)continue;
            const mesh=this.box(b.x,b.y,b.z,b.w,b.h,b.d,b.color,b.rx,b.rz,b.ry,b);
            if(b.hidden)mesh.visible=false;
            if(b.y+b.h/2<=.15&&b.y+b.h/2>=-.1)mesh.material.userData.streetSurface='ground';
            else if(b.rx||b.rz)mesh.material.userData.streetSurface='stairs';
        }
        for(const dispatch of [...DISPATCH_STATIONS.map(s=>s.box),...LAUNCH_MACHINES.map(s=>s.box)])
            this.box(dispatch.x,dispatch.y,dispatch.z,dispatch.w,dispatch.h,dispatch.d,0x182936).visible=false;
        if(lighting==='classic')for(const [x,y,z,color] of [[130,5,-30,0x9ddbea],[130,5,-40,0x91bbd8],[-16,4,-34,0xffc982],[-136,4,0,0xffc982],[-16,4,-55,0xffc982],[-30,4,-43,0x9fb5ce]]) {
            this.glow(x,y+.5,z,1.5,.2,.5,color);
            const light=new THREE.PointLight(color,65,20,1.5);light.position.set(x,y,z);this.add(light);
        }
        this.label(-137,7.8,0,'WEST SLUICE',0xffcd87);
        this.label(-16,18,-33.9,'RECORDS BUREAU',0xffcf94);
        this.label(130,6.4,-28.5,'ICEBOX · COLD STORAGE',0x9ddbea);
        this.label(-16,6.5,-81.6,'ARCHIVE RECEIVING',0xc9b890);
        this.label(150.6,6.7,118,'PUMP HALL',0x9dbfac);
        for(const b of landmarkStairDetails()){
            const material=this.material(b.color);material.userData.streetSurface='stairs';
            const tread=this.add(new THREE.Mesh(new THREE.BoxGeometry(b.w,b.h,b.d),material));
            const q=boxQuaternion(b);tread.position.set(b.x,b.y,b.z);tread.quaternion.set(q.x,q.y,q.z,q.w);tread.receiveShadow=true;
        }
        // Small pools at each stair landing and mid-flight preserve the dark interiors.
        for(const {x,y,z,color} of LANDMARK_STAIR_LIGHTS){
            this.glow(x,y,z,.55,.16,.55,color);
            const light=new THREE.PointLight(color,30,13,1.5);
            light.position.set(x,y,z);this.add(light);
        }
        for(const hall of LANDMARK_INTERIORS){
            const color=hall.id==='icebox'?0x86b4c5:hall.id==='needleworks'?0xc2979d:hall.id==='pump'?0x8bb6a7:0xc4ab80;
            if(lighting==='classic')for(const y of hall.levels){
                // Four steady corner lamps per level, including the rear lofts and top gallery.
                for(const side of [-1,1])for(const end of [-1,1]){
                    const x=hall.cx+side*(hall.w/2-5),z=hall.cz+end*(hall.d/2-5);
                    this.glow(x,y+5,z,1.2,.25,1.2,color);
                    const light=new THREE.PointLight(color,55,38,1.5);
                    light.position.set(x,y+4.6,z);this.add(light);
                }
            }
            this.label(hall.cx,3,hall.cz-hall.d/2+2,'EXIT · STREET',color);
        }
        this.label(125,10.5,138.5,'PUMPING STATION',0x9eb9a9);
        // A continuous utility trunk: the city remains overhead, and each bend/exit is lit.
        for(const {x,z} of SEWER_LIGHTS) {
            this.glow(x,-1.3,z,1.2,.2,.8,0x8fc0ad);
            const light=new THREE.PointLight(0x89bfac,35,32,1.5);light.position.set(x,-2,z);this.add(light);
        }
        for(const source of SEWER_PORTAL_LIGHTS){
            const light=new THREE.PointLight(source.color,source.intensity,source.distance,1.5);
            light.position.set(source.x,source.y,source.z);
            // Upper tunnel lamps are above street height, but must use the
            // sewer pool rather than being mistaken for a baked city light.
            this.lampSources.push(light);
        }
        // Pipe runs and repeated collars give the long sewer a municipal scale.
        for(const x of [-90,-54,-18,18,54,90]){
            const pipe=this.add(new THREE.Mesh(new THREE.CylinderGeometry(.3,.3,34,10),this.material(0x526457)));
            pipe.rotation.z=Math.PI/2;pipe.position.set(x,-2,4.05);
            for(const dx of [-14,-7,0,7,14]){
                const collar=this.add(new THREE.Mesh(new THREE.TorusGeometry(.32,.07,6,12),this.material(0x7b8170)));
                collar.rotation.y=Math.PI/2;collar.position.set(x+dx,-2,4.05);
            }
        }
        for(const z of [25,55,85,110]){
            this.glow(4.05,-2,z,.25,.5,24,0x526457);
            this.label(0,-3.5,z,'SOUTH DRAIN →',0x96c9b6);
        }
        for(const x of [-100,-60,60,100])this.label(x,-3.5,-3.9,x<0?'← GATE':'ICEBOX →',0x96c9b6);
        // Street-level signs identify destinations at the junctions without adding a minimap.
        for(const [x,z,text] of [[-60,-15,'← WEST GATE'],[65,-15,'ICEBOX →'],[0,65,'SOUTH DRAIN ↓'],[-16,-87,'RECORDS BUREAU ↓'],[80,118,'PUMP HALL →']] as const)this.label(x,4,z,text,0xd0b587);
        this.label(130,28,-30.7,'ICEBOX',0x9ddbea);
        this.label(-146.2,25,0,'WEST SLUICE',0xdac39b);
        this.label(-60,4,120,'← NEEDLEWORKS',0xc6939f);
        for(const [x,z] of [[-143,0],[143,0],[0,143]]){
            this.glow(x,5,z,1,.5,1,0xffd087);
            const light=new THREE.PointLight(0xffcd87,65,24,1.5);light.position.set(x,4.5,z);this.add(light);
        }
        this.label(-54,2,67,'NEEDLEWORKS · DRAIN ↓',0x91cec9);
        this.label(-54,-3.5,39,'↑ NEEDLEWORKS EXIT',0x91cec9);
        this.label(-80,-3.5,20,'WEST LOOP',0x91cec9);
        this.label(48,-3.5,-20,'MAINTENANCE',0x91cec9);
        this.label(-15,-3.5,-3.9,'← GATE',0x96c9b6);
        this.label(15,-3.5,-3.9,'ICEBOX →',0x96c9b6);
        this.label(0,-3.5,6,'ALLEY EXIT ↓',0x96c9b6);
        for(const [x,z] of STREET_LAMPS) {
            const light=new THREE.PointLight(0xffcd87,65,24,1.5);light.position.set(x,STREET_LAMP_HEIGHT,z);this.add(light);
        }
        const fixtures=lighting==='pools'?interiorFixtures():[];
        for(const fixture of fixtures)this.addInteriorFixture(fixture);
        // Kit fixtures outside any room (quay floodlights, precinct globes): baked outside rooms only, and actor spots.
        const outdoor=kitCity({visuals:false}).fixtures.filter(f=>!f.room),outdoorLights=new Set<THREE.PointLight>();
        for(const f of outdoor){const light=new THREE.PointLight(f.color,f.intensity,f.distance,1.5);light.position.set(f.x,f.y,f.z);this.add(light);outdoorLights.add(light);}
        // Every steady source is known: one field bakes the graybox and the kit alike.
        const field=new FixedLightField(this.fixedLights.map(light=>{
            const f=this.interiorSources.get(light);
            return {position:light.position,color:light.color,intensity:light.intensity,distance:light.distance,
                ...(f?{fixture:{room:f.room.id,floor:f.floor,angle:f.angle??.85}}:{}),...(outdoorLights.has(light)?{outdoor:true as const}:{})};
        }),LIGHT_ROOMS,lighting,LANDMARK_INTERIORS);
        this.architecture=new LandmarkArchitecture(scene,lighting==='classic');
        this.kit=new KitArchitecture(scene);
        yield BAKE_STEP;
        // The stored bake is used whole, only when it matches every draw this build makes.
        const groups=this.batchPlan(),readable=lighting==='pools'&&streetReadabilityEnabled();
        const shape:CityBakeShape={grayboxGroups:groups.map(g=>g.label),...this.kit.shape(),spill:readable,atlasBytes:SPILL_ATLAS_BYTES};
        const cached=this.bakeSource&&parseCityBake(this.bakeValue,this.bakeSource.key,shape);
        this.bakeValue=undefined;
        yield* this.kit.build(field,cached);
        this.water=cityHarbourWater(scene,kitCity());
        yield;
        this.vehicles=new ParkedVehicles(scene);
        yield;
        this.grime=new CityGrime(scene,spec);
        yield;
        this.sewerPortals=new SewerPortals(scene);
        if(cached)for(const material of this.materials.values())applyFixedIllumination(material);
        else yield* this.bakeFixedLighting(field);
        yield;
        this.batchStaticMeshes(groups,cached?.graybox);
        // The graybox city (boxes, pipes, batches and the hidden aim/camera
        // originals) never moves: compute matrices once, not every frame.
        for(const obj of this.objects){
            if(obj instanceof THREE.Light)continue;
            obj.updateMatrixWorld(true);obj.matrixAutoUpdate=false;obj.matrixWorldAutoUpdate=false;
        }
        yield;
        this.initLampPool();
        if(readable){
            this.readability=new StreetReadability(scene,layout,boxes,this.city.windowLights,this.city.facadeOccluders);
            yield* this.readability.build(cached?.spill??undefined);
            // Only this city's owned scenery: never mutate an existing rat,
            // projectile, stage light or a previous scene during replacement.
            for(const object of scene.children)if(!existingObjects.has(object))object.traverse(child=>{
                if(!(child instanceof THREE.Mesh))return;
                for(const material of Array.isArray(child.material)?child.material:[child.material]){
                    if(material instanceof THREE.MeshStandardMaterial)this.readability!.apply(material);
                }
            });
        }
        this.streetLamps=[...STREET_LAMPS,...generatedStreetLamps(layout,STREET_LAMPS)];
        if(this.bakeSource&&!cached){
            const {key}=this.bakeSource,kit=this.kit,readability=this.readability,batches=this.batches;
            this.pendingBake=()=>{
                const out=kit.bakeOutput(),spill=readability?.bakeOutput();
                if(!out)throw new Error('kit not baked');
                return {key,grayboxGroups:[...shape.grayboxGroups],graybox:batches.map(mesh=>bakeGeometry(mesh.geometry)),
                    kitMerged:[...shape.kitMerged],kitBatches:[...shape.kitBatches],kit:out.merged.map(bakeGeometry),kitColors:[...out.colors],signs:out.signs,
                    spill:spill?{atlas:spill.atlas,cells:[...spill.cells],beams:spill.geometries.map(bakeGeometry)}:null};
            };
        }
        if(lighting==='pools')this.overhead=new StreetLightPool(scene,[
            ...this.streetLamps
                .map(([x,z])=>({x,y:STREET_LAMP_HEIGHT,z,color:0xffcf96,intensity:260,distance:24,angle:.88,penumbra:.5})),
            ...(this.readability?.lights??[]),...fixtures,
            // Floodlights hang high and throw wide: they reach rats 18 below them, in a wider cone.
            ...outdoor.map(f=>({x:f.x,y:f.y,z:f.z,color:f.color,intensity:f.intensity*3,distance:f.distance*1.4,angle:Math.min(1.3,(f.angle??.9)+.25),penumbra:.5,above:18})),
        ],LIGHT_ROOMS);
        if(this.overhead)for(const object of scene.children)if(!existingObjects.has(object))object.traverse(child=>{
            if(!(child instanceof THREE.Mesh))return;
            for(const material of Array.isArray(child.material)?child.material:[child.material])
                if(material instanceof THREE.MeshStandardMaterial)this.overhead!.applyToScenery(material);
        });
    }
    /** Street lamp sites (for cosmetic city reactions). */
    streetLamps:StreetLampPosition[]=[];
    private readonly groundBodies:CANNON.Body[]=[];
    private readonly groundMeshes:THREE.Object3D[]=[];
    generate() {}
    update(_dt:number,camera?:THREE.Camera,anchor?:{x:number;y:number;z:number}) {
        this.city.update(_dt,camera);
        this.readability?.update();
        this.architecture.update(_dt);
        this.kit.update(_dt);
        this.water?.update(_dt);
        this.grime.update(_dt);
        // Outdoor bounce light supplies a visibility floor; existing sewer lighting stays intact.
        if(camera){this.streetFill.intensity=(this.lighting==='classic'?1.25:.32)*THREE.MathUtils.smoothstep(camera.position.y,-2,1);this.overhead?.update(camera,anchor);}
        this.syncLampPool(camera,anchor);
    }
    private addInteriorFixture(f:InteriorFixture):void {
        const {x,y,z,color,style,ceiling}=f;
        const mesh=(geometry:THREE.BufferGeometry,px:number,py:number,pz:number,finish=0x292a32)=>{
            const object=this.add(new THREE.Mesh(geometry,this.material(finish)));object.position.set(px,py,pz);return object;
        };
        // Simple municipal hardware, hung above all playable headroom.
        mesh(new THREE.CylinderGeometry(.045,.045,ceiling-y,6),x,(ceiling+y)/2,z);
        if(style==='pendant'){
            mesh(new THREE.CylinderGeometry(.28,.85,.42,12),x,y+.15,z,0x514334);
            this.glow(x,y-.08,z,1.25,.08,1.25,color);
        }else{
            const width=style==='strip'?3.2:1.1;
            mesh(new THREE.BoxGeometry(width+.25,.24,.65),x,y+.15,z);
            this.glow(x,y,z,width,.08,.4,color);
            for(const dx of [-1,1])mesh(new THREE.BoxGeometry(.08,.3,.75),x+dx*width*.4,y+.04,z);
        }
        const light=new THREE.PointLight(color,f.intensity,f.distance,1.5);light.position.set(x,y,z);
        // Even underground, these are baked fixtures, not extra live point lights.
        this.fixedLights.push(light);this.interiorSources.set(light,f);
    }
    private material(color:number) {
        if(!this.materials.has(color)) this.materials.set(color,new THREE.MeshStandardMaterial({color,roughness:0.95}));
        return this.materials.get(color)!;
    }
    private add<T extends THREE.Object3D>(obj:T):T {
        if(obj instanceof THREE.PointLight){
            (obj.position.y<0?this.lampSources:this.fixedLights).push(obj);return obj;
        }
        this.scene.add(obj);this.objects.push(obj);return obj;
    }
    /** Bake a modest diffuse contribution into static architecture. Unlike live point
     * lights this stays identical from every camera position, with no shader light limit. */
    private *bakeFixedLighting(field:FixedLightField):Generator<void> {
        const position=new THREE.Vector3(),normal=new THREE.Vector3(),light=new THREE.Color();
        const bounds=new THREE.Box3(),normalMatrix=new THREE.Matrix3();
        const owned=new Set<THREE.Material>(this.materials.values());
        for(const obj of this.objects){
            // Restrict the shader to our static masonry/props, never shared rat materials.
            if(!(obj instanceof THREE.Mesh)||!obj.visible||!(obj.material instanceof THREE.MeshStandardMaterial)||!owned.has(obj.material))continue;
            obj.updateMatrixWorld(true);
            bounds.setFromObject(obj);
            const sources=field.near(bounds),rooms=field.roomsNear(bounds);
            if(obj.geometry instanceof THREE.BoxGeometry && sources.length){
                const {width,height,depth}=obj.geometry.parameters;
                const geometry=new THREE.BoxGeometry(width,height,depth,Math.max(1,Math.ceil(width/3)),Math.max(1,Math.ceil(height/3)),Math.max(1,Math.ceil(depth/3)));
                obj.geometry.dispose();obj.geometry=geometry;
            }
            const vertices=obj.geometry.getAttribute('position'),normals=obj.geometry.getAttribute('normal');
            const colors=new Float32Array(vertices.count*3);
            normalMatrix.getNormalMatrix(obj.matrixWorld);
            for(let i=0;i<vertices.count;i++){
                position.fromBufferAttribute(vertices,i).applyMatrix4(obj.matrixWorld);
                normal.fromBufferAttribute(normals,i).applyNormalMatrix(normalMatrix);
                field.sample(position,normal,sources,rooms,light).toArray(colors,i*3);
            }
            obj.geometry.setAttribute('fixedIllumination',new THREE.BufferAttribute(colors,3));
            yield;
        }
        for(const material of this.materials.values())applyFixedIllumination(material);
    }
    private initLampPool() {
        for(let i=0;i<SEWER_LAMPS;i++){
            const light=new THREE.PointLight(0xffffff,0,1,1.5);
            light.name='sewer-pooled-light';light.visible=false;
            this.scene.add(light);this.lampPool.push(light);
        }
    }
    /** The graybox draws: every visible owned mesh, grouped by material, 64-unit XZ cell and
     * shadow role, in build order. Baking never changes a group, so this runs before it. */
    private batchPlan():GrayboxGroup[] {
        const groups=new Map<string,GrayboxGroup>();
        const owned=new Set<THREE.Material>([...this.materials.values(),...this.glowMaterials.values()]);
        for(const obj of this.objects){
            const material=obj instanceof THREE.Mesh?obj.material:undefined;
            if(!(obj instanceof THREE.Mesh)||!obj.visible||!(material instanceof THREE.MeshStandardMaterial||material instanceof THREE.MeshBasicMaterial)||!owned.has(material))continue;
            const cell=`${Math.floor(obj.position.x/64)}:${Math.floor(obj.position.z/64)}:${obj.castShadow?1:0}:${obj.receiveShadow?1:0}`;
            const key=`${material.uuid}:${cell}`;
            let group=groups.get(key);
            if(!group){group={material,meshes:[],label:`${material.type}:${material.color.getHex()}:${cell}`};groups.set(key,group);}
            group.meshes.push(obj);
        }
        for(const group of groups.values())group.label+=`:${group.meshes.length}`;
        return [...groups.values()];
    }
    /** Lit surfaces may contain thousands of bake vertices. Keep those triangles
     * out of camera/aim raycasts and merge the visible copies by local city cell
     * (or take the merged copies from `cached`, a checked record).
     * The original twelve-triangle boxes remain exact collision/aim silhouettes. */
    private batchStaticMeshes(groups:readonly GrayboxGroup[],cached?:readonly BakedGeometry[]) {
        const merged=groups.map(({meshes})=>{
            const parts:THREE.BufferGeometry[]=[];
            for(const obj of meshes){
                obj.updateMatrixWorld(true);
                const old=obj.geometry;
                if(!cached)parts.push(old.clone().applyMatrix4(obj.matrixWorld));
                if(obj.userData.aimTarget && old instanceof THREE.BoxGeometry){
                    // Unbaked (from the cache), it is still the plain box.
                    if(!cached){const {width,height,depth}=old.parameters;obj.geometry=new THREE.BoxGeometry(width,height,depth);old.dispose();}
                }else{
                    // Neither drawn nor hit: out of the scene, so no frame walks it.
                    obj.geometry=new THREE.BufferGeometry();
                    obj.raycast=()=>{};
                    old.dispose();
                    obj.removeFromParent();
                }
                obj.visible=false;
            }
            return parts;
        });
        groups.forEach(({material,meshes},i)=>{
            let geometry:THREE.BufferGeometry;
            if(cached)geometry=restoreGeometry(cached[i]);
            else{
                geometry=mergeGeometries(merged[i],false)!;
                for(const part of merged[i])part.dispose();
                geometry.computeBoundingBox();geometry.computeBoundingSphere();
            }
            const batch=this.add(new THREE.Mesh(geometry,material));
            batch.castShadow=meshes[0].castShadow;batch.receiveShadow=meshes[0].receiveShadow;
            batch.raycast=()=>{};
            this.batches.push(batch);
        });
    }
    private syncLampPool(camera?:THREE.Camera,anchor?:{x:number;y:number;z:number}) {
        if(!camera)return;
        // Only sewer lamps follow the player. Street and interior light is baked once.
        const p=anchor??camera.position;
        // All eight show or hide together: two shader variants, both compiled before entry.
        if(!sewerLightingActive(p)){for(const light of this.lampPool){light.intensity=0;light.visible=false;}return;}
        for(const light of this.lampPool)light.visible=true;
        const px=p.x,py=p.y,pz=p.z,count=this.lampPool.length,nearest=this.nearestLamps,distances=this.nearestDistances;
        // The nearest `count` sources, kept sorted by insertion; equal distances keep source order.
        let found=0;
        for(const source of this.lampSources){
            const dx=source.position.x-px,dy=source.position.y-py,dz=source.position.z-pz,d=dx*dx+dy*dy+dz*dz;
            if(found===count&&!(d<distances[count-1]))continue;
            let i=found<count?found++:count-1;
            for(;i>0&&distances[i-1]>d;i--){distances[i]=distances[i-1];nearest[i]=nearest[i-1];}
            distances[i]=d;nearest[i]=source;
        }
        for(let i=0;i<count;i++){
            const light=this.lampPool[i];
            if(i>=found){light.intensity=0;continue;}
            const source=nearest[i];
            light.position.copy(source.position);
            light.color.copy(source.color);
            light.intensity=source.intensity*AUTHORED_LIGHT_GAIN;
            light.distance=source.distance;
            light.decay=source.decay;
        }
    }
    private box(x:number,y:number,z:number,w:number,h:number,d:number,color:number,rx=0,rz=0,ry=0,flags:{passBalls?:true;slick?:true}={}) {
        const mesh=this.add(new THREE.Mesh(new THREE.BoxGeometry(w,h,d),this.material(color)));
        const q=boxQuaternion({rx,ry,rz});
        mesh.position.set(x,y,z);mesh.quaternion.set(q.x,q.y,q.z,q.w);mesh.receiveShadow=true;mesh.castShadow=true;
        // Bars stop rats, never aim or the camera.
        if(!flags.passBalls){mesh.userData.aimTarget=true;this.solids.push(mesh);}
        const body=cityBoxBody({x,y,z,w,h,d,rx,ry,rz,...(flags.passBalls?{passBalls:true as const}:{}),...(flags.slick?{slick:true as const}:{})});
        addCityBody(this.world,body);this.bodies.push(body);
        return mesh;
    }
    private glow(x:number,y:number,z:number,w:number,h:number,d:number,color:number) {
        if(!this.glowMaterials.has(color))this.glowMaterials.set(color,new THREE.MeshBasicMaterial({color}));
        const mesh=this.add(new THREE.Mesh(new THREE.BoxGeometry(w,h,d),this.glowMaterials.get(color)!));
        mesh.position.set(x,y,z);return mesh;
    }
    private label(_x:number,_y:number,_z:number,_text:string,_color:number) {
        // Navigation is expressed by architectural signs; floating map labels are retired.
    }
    dispose() {
        this.pendingBake=undefined;this.batches.length=0;
        this.readability?.dispose();
        this.overhead?.dispose();
        this.architecture?.dispose();this.kit?.dispose();this.water?.dispose();
        this.vehicles?.dispose();
        this.grime?.dispose();
        this.sewerPortals?.dispose();
        this.city?.dispose();
        for(const light of this.lampPool){this.scene.remove(light);light.dispose();}
        this.lampPool.length=0;
        for(const light of [...this.lampSources,...this.fixedLights])light.dispose();
        this.fixedLights.length=0;this.interiorSources.clear();
        this.lampSources.length=0;
        for(const body of this.bodies)removeCityBody(this.world,body);
        const sharedMaterials=new Set<THREE.Material>([...this.materials.values(),...this.glowMaterials.values()]);
        for(const obj of this.objects){this.scene.remove(obj);if(obj instanceof THREE.Group)disposeMeshResources(obj);if(obj instanceof THREE.Mesh)obj.geometry.dispose();if(obj instanceof THREE.Sprite)obj.material.map?.dispose();if(obj instanceof THREE.Mesh||obj instanceof THREE.Sprite){const m=obj.material as THREE.Material;if(!sharedMaterials.has(m))m.dispose();}}
        for(const mat of this.materials.values())mat.dispose();
        for(const mat of this.glowMaterials.values())mat.dispose();
        for(const body of this.groundBodies)this.world.addBody(body);
        for(const mesh of this.groundMeshes)this.scene.add(mesh);
    }
}

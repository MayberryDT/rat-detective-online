import {CENTRAL_BUILDINGS} from '../shared/skyline';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DISPATCH_STATIONS, LAUNCH_MACHINES } from '../shared/chaosState';
import { SewerPortals } from './SewerPortals';
import { CityGrime } from './CityGrime';
import { ParkedVehicles } from './ParkedVehicles';
import { LandmarkArchitecture } from './LandmarkArchitecture';
import { disposeMeshResources } from '../utils/disposeMeshResources';
import {StreetLightPool} from './StreetLightPool';
import {readLightingMode,type LightingMode} from '../session/lightingMode';
import {generatedStreetLamps} from '../shared/streetLampLayout';

import { STREET_LAMPS, grayboxBoxes, CITY_PREVIEW_SEED, GRAYBOX_VERSION } from '../shared/grayboxLayout';
import {cityStreetBuildings} from '../shared/cityPlan';
import {landmarkStairDetails,LANDMARK_INTERIORS,LANDMARK_STAIR_LIGHTS} from '../shared/landmarkLayout';
import {SEWER_LIGHTS} from '../shared/sewerLayout';
import {CityGenerator} from '../world/CityGenerator';
import {generateBuildingLayout, type WorldSpec} from '../shared/worldSpec';
export { BLOCKS, ENTRIES, isRampOpening } from '../shared/grayboxLayout';

export class Neighborhood {
    private readonly streetFill = new THREE.AmbientLight(0x8995b5, 1.25);
    readonly solids: THREE.Mesh[] = [];
    private readonly objects: THREE.Object3D[] = [];
    private readonly bodies: CANNON.Body[] = [];
    private readonly materials = new Map<number,THREE.MeshStandardMaterial>();
    private readonly glowMaterials = new Map<number,THREE.MeshBasicMaterial>();
    private readonly architecture:LandmarkArchitecture;
    private readonly vehicles:ParkedVehicles;
    private readonly grime:CityGrime;
    private readonly sewerPortals:SewerPortals;
    private readonly city:CityGenerator;
    private readonly lampSources:THREE.PointLight[]=[];
    private readonly fixedLights:THREE.PointLight[]=[];
    private readonly lampPool:THREE.PointLight[]=[];
    private readonly overhead?:StreetLightPool;
    constructor(private scene:THREE.Scene, private world:CANNON.World, spec:WorldSpec={seed:CITY_PREVIEW_SEED,version:GRAYBOX_VERSION},private readonly lighting:LightingMode=readLightingMode()) {
        this.streetFill.intensity=lighting==='classic'?1.25:.32;
        this.add(this.streetFill);
        for(const body of [...world.bodies]) if(body.shapes.some(shape=>shape instanceof CANNON.Plane)) {this.groundBodies.push(body);world.removeBody(body);}
        for(const obj of [...scene.children]) if(obj instanceof THREE.Mesh && obj.geometry instanceof THREE.PlaneGeometry) {this.groundMeshes.push(obj);scene.remove(obj);}
        this.city=new CityGenerator(scene,world,undefined,{...spec,version:1});
        const layout=[...cityStreetBuildings(generateBuildingLayout({...spec,version:1})),...CENTRAL_BUILDINGS];
        this.city.generate(layout,true);
        for(const b of grayboxBoxes(spec)){if(b.original)continue;const mesh=this.box(b.x,b.y,b.z,b.w,b.h,b.d,b.color,b.rx,b.rz);if(b.hidden)mesh.visible=false;}
        for(const dispatch of [...DISPATCH_STATIONS.map(s=>s.box),...LAUNCH_MACHINES.map(s=>s.box)])
            this.box(dispatch.x,dispatch.y,dispatch.z,dispatch.w,dispatch.h,dispatch.d,0x182936).visible=false;
        for(const [x,y,z,color] of [[130,5,-30,0x9ddbea],[130,5,-40,0x91bbd8],[-16,4,-34,0xffc982],[-136,4,0,0xffc982],[-16,4,-55,0xffc982],[-30,4,-43,0x9fb5ce]]) {
            this.glow(x,y+.5,z,1.5,.2,.5,color);
            const light=new THREE.PointLight(color,65,20,1.5);light.position.set(x,y,z);this.add(light);
        }
        this.label(-137,7.8,0,'WEST SLUICE',0xffcd87);
        this.label(-16,18,-33.9,'RECORDS BUREAU',0xffcf94);
        this.label(130,6.4,-28.5,'ICEBOX · COLD STORAGE',0x9ddbea);
        this.label(-16,6.5,-81.6,'ARCHIVE RECEIVING',0xc9b890);
        this.label(150.6,6.7,118,'PUMP HALL',0x9dbfac);
        for(const b of landmarkStairDetails()){
            const tread=this.add(new THREE.Mesh(new THREE.BoxGeometry(b.w,b.h,b.d),this.material(b.color)));
            tread.position.set(b.x,b.y,b.z);tread.rotation.set(b.rx,0,b.rz);tread.receiveShadow=true;
        }
        // Small pools at each stair landing and mid-flight preserve the dark interiors.
        for(const {x,y,z,color} of LANDMARK_STAIR_LIGHTS){
            this.glow(x,y,z,.55,.16,.55,color);
            const light=new THREE.PointLight(color,30,13,1.5);
            light.position.set(x,y,z);this.add(light);
        }
        for(const hall of LANDMARK_INTERIORS){
            const color=hall.id==='icebox'?0x86b4c5:hall.id==='needleworks'?0xc2979d:hall.id==='pump'?0x8bb6a7:0xc4ab80;
            for(const y of hall.levels){
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
            this.glow(x,5,z,0.65,0.8,0.65,0xffd087);
            const light=new THREE.PointLight(0xffcd87,Math.abs(z)>50?40:20,Math.abs(z)>50?28:20,1.5);light.position.set(x,4.5,z);this.add(light);
        }
        this.architecture=new LandmarkArchitecture(scene);
        this.vehicles=new ParkedVehicles(scene);
        this.grime=new CityGrime(scene,spec);
        this.sewerPortals=new SewerPortals(scene);
        if(lighting==='pools')this.overhead=new StreetLightPool(scene,[
            ...STREET_LAMPS.map(([x,z])=>({x,y:5,z,color:0xffcf96})),
            ...generatedStreetLamps(layout,STREET_LAMPS).map(([x,z])=>({x,y:6.2,z,color:0xffcf96})),
            // Interior fixtures stay steady in the baked city; their nearby
            // downward light also catches moving rats at the matching floor.
            ...this.fixedLights.filter(light=>light.position.y!==4.5).map(light=>({x:light.position.x,y:light.position.y,z:light.position.z,color:light.color.getHex()})),
        ]);
        this.bakeFixedLighting();
        this.batchStaticMeshes();
        this.initLampPool();
    }
    private readonly groundBodies:CANNON.Body[]=[];
    private readonly groundMeshes:THREE.Object3D[]=[];
    generate() {}
    update(_dt:number,camera?:THREE.Camera) {
        this.city.update(_dt,camera);
        this.architecture.update(_dt);
        this.grime.update(_dt);
        // Outdoor bounce light supplies a visibility floor; existing sewer lighting stays intact.
        if(camera){this.streetFill.intensity=(this.lighting==='classic'?1.25:.32)*THREE.MathUtils.smoothstep(camera.position.y,-2,1);this.overhead?.update(camera);}
        this.syncLampPool(camera);
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
    private bakeFixedLighting() {
        const position=new THREE.Vector3(),normal=new THREE.Vector3(),toward=new THREE.Vector3();
        const bounds=new THREE.Box3(),normalMatrix=new THREE.Matrix3();
        for(const obj of this.objects){
            if(!(obj instanceof THREE.Mesh)||!obj.visible||!(obj.material instanceof THREE.MeshStandardMaterial))continue;
            const material=obj.material as THREE.MeshStandardMaterial;
            // Restrict the shader to our static masonry/props, never shared rat materials.
            if(![...this.materials.values()].includes(material))continue;
            obj.updateMatrixWorld(true);
            bounds.setFromObject(obj);
            const sources=this.fixedLights.filter(light=>bounds.distanceToPoint(light.position)<light.distance);
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
                if(position.y<-.05)continue;
                let red=0,green=0,blue=0;
                // A restrained room-only bounce term keeps the unlit side of a stair
                // readable; it never raises the city-wide ambient or skyline brightness.
                const hall=LANDMARK_INTERIORS.find(h=>position.y>=-.05&&position.y<24
                    &&Math.abs(position.x-h.cx)<h.w/2-.3&&Math.abs(position.z-h.cz)<h.d/2-.3);
                if(hall){red=.014;green=.016;blue=.020;}
                for(const source of sources){
                    toward.copy(source.position).sub(position);
                    const distance=toward.length();
                    if(distance>=source.distance||distance<.001)continue;
                    const facing=Math.max(0,normal.dot(toward.multiplyScalar(1/distance)));
                    const falloff=1-distance/source.distance;
                    const amount=Math.min(.075,source.intensity*.08/(12+distance*distance))*falloff*facing;
                    red+=source.color.r*amount;green+=source.color.g*amount;blue+=source.color.b*amount;
                }
                colors[i*3]=Math.min(red,.12);colors[i*3+1]=Math.min(green,.12);colors[i*3+2]=Math.min(blue,.12);
            }
            obj.geometry.setAttribute('fixedIllumination',new THREE.BufferAttribute(colors,3));
        }
        for(const material of this.materials.values()){
            material.onBeforeCompile=shader=>{
                shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 fixedIllumination;\nvarying vec3 vFixedIllumination;')
                    .replace('#include <begin_vertex>','#include <begin_vertex>\nvFixedIllumination = fixedIllumination;');
                shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vFixedIllumination;')
                    .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance += vFixedIllumination;');
            };
            material.customProgramCacheKey=()=> 'neighborhood-fixed-illumination-v1';
            material.needsUpdate=true;
        }
    }
    private initLampPool() {
        for(let i=0;i<8;i++){
            const light=new THREE.PointLight(0xffffff,0,1,1.5);
            this.scene.add(light);this.lampPool.push(light);
        }
    }
    /** Lit surfaces may contain thousands of bake vertices. Keep those triangles
     * out of camera/aim raycasts and merge the visible copies by local city cell.
     * The original twelve-triangle boxes remain exact collision/aim silhouettes. */
    private batchStaticMeshes() {
        const groups=new Map<string,{material:THREE.Material;geometries:THREE.BufferGeometry[];cast:boolean;receive:boolean}>();
        const owned=new Set<THREE.Material>([...this.materials.values(),...this.glowMaterials.values()]);
        for(const obj of [...this.objects]){
            if(!(obj instanceof THREE.Mesh)||!obj.visible||Array.isArray(obj.material)||!owned.has(obj.material))continue;
            obj.updateMatrixWorld(true);
            const key=[obj.material.uuid,Math.floor(obj.position.x/64),Math.floor(obj.position.z/64),obj.castShadow,obj.receiveShadow].join(':');
            let group=groups.get(key);
            if(!group){group={material:obj.material,geometries:[],cast:obj.castShadow,receive:obj.receiveShadow};groups.set(key,group);}
            group.geometries.push(obj.geometry.clone().applyMatrix4(obj.matrixWorld));
            const old=obj.geometry;
            if(obj.userData.aimTarget && old instanceof THREE.BoxGeometry){
                const {width,height,depth}=old.parameters;
                obj.geometry=new THREE.BoxGeometry(width,height,depth);
            }else{
                obj.geometry=new THREE.BufferGeometry();
                obj.raycast=()=>{};
            }
            old.dispose();
            obj.visible=false;
        }
        for(const {material,geometries,cast,receive} of groups.values()){
            const merged=mergeGeometries(geometries,false)!;
            for(const geometry of geometries)geometry.dispose();
            merged.computeBoundingBox();merged.computeBoundingSphere();
            const batch=this.add(new THREE.Mesh(merged,material));
            batch.castShadow=cast;batch.receiveShadow=receive;
            batch.raycast=()=>{};
        }
    }
    private syncLampPool(camera?:THREE.Camera) {
        if(!camera)return;
        // Only sewer lamps follow the player. Street and interior light is baked once.
        if(camera.position.y>=0){for(const light of this.lampPool)light.intensity=0;return;}
        const px=camera.position.x,py=camera.position.y,pz=camera.position.z;
        const ranked=this.lampSources.map(source=>{
            const dx=source.position.x-px,dy=source.position.y-py,dz=source.position.z-pz;
            return {source,d:dx*dx+dy*dy+dz*dz};
        }).sort((a,b)=>a.d-b.d);
        for(let i=0;i<this.lampPool.length;i++){
            const light=this.lampPool[i],source=ranked[i]?.source;
            if(!source){light.intensity=0;continue;}
            light.position.copy(source.position);
            light.color.copy(source.color);
            light.intensity=source.intensity;
            light.distance=source.distance;
            light.decay=source.decay;
        }
    }
    private box(x:number,y:number,z:number,w:number,h:number,d:number,color:number,rx=0,rz=0) {
        const mesh=this.add(new THREE.Mesh(new THREE.BoxGeometry(w,h,d),this.material(color)));
        mesh.position.set(x,y,z);mesh.rotation.set(rx,0,rz);mesh.receiveShadow=true;mesh.castShadow=true;mesh.userData.aimTarget=true;
        this.solids.push(mesh);
        const body=new CANNON.Body({mass:0,shape:new CANNON.Box(new CANNON.Vec3(w/2,h/2,d/2))});
        body.position.set(x,y,z);body.quaternion.setFromEuler(rx,0,rz);body.updateAABB();this.world.addBody(body);this.bodies.push(body);
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
        this.overhead?.dispose();
        this.architecture.dispose();
        this.vehicles.dispose();
        this.grime.dispose();
        this.sewerPortals.dispose();
        this.city.dispose();
        for(const light of this.lampPool){this.scene.remove(light);light.dispose();}
        this.lampPool.length=0;
        for(const light of [...this.lampSources,...this.fixedLights])light.dispose();
        this.fixedLights.length=0;
        this.lampSources.length=0;
        for(const body of this.bodies)this.world.removeBody(body);
        const sharedMaterials=new Set<THREE.Material>([...this.materials.values(),...this.glowMaterials.values()]);
        for(const obj of this.objects){this.scene.remove(obj);if(obj instanceof THREE.Group)disposeMeshResources(obj);if(obj instanceof THREE.Mesh)obj.geometry.dispose();if(obj instanceof THREE.Sprite)obj.material.map?.dispose();if(obj instanceof THREE.Mesh||obj instanceof THREE.Sprite){const m=obj.material as THREE.Material;if(!sharedMaterials.has(m))m.dispose();}}
        for(const mat of this.materials.values())mat.dispose();
        for(const mat of this.glowMaterials.values())mat.dispose();
        for(const body of this.groundBodies)this.world.addBody(body);
        for(const mesh of this.groundMeshes)this.scene.add(mesh);
    }
}

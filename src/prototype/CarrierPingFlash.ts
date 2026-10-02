import * as THREE from 'three';
import {freezeStatic} from '../utils/freezeStatic';
import {RigidBatch} from '../utils/RigidMeshBatch';
import {reducedMotion} from '../ui/motion';
import type {RatEntity} from '../entities/RatEntity';
import {caseRimMaterial} from './CaseBeacon';
import {CASE_RED} from './caseRed';

/** The ping flash's look: the far stand-in keeps the carrier at least `minPixels` tall on screen (a rat stands about
 * `ratHeight` units, scaled about `centre` units up, where the case rides); each flash swells it `swell`× (none with
 * reduced motion). `silhouette` is the exact rat's peak opacity. */
export const PING_FLASH={minPixels:64,ratHeight:2.3,centre:1,swell:.15,strength:1.8,silhouette:.9} as const;

/** The hot case heartbeat seen by everyone else (Tyler, 2 October): at each ping the carrier's whole body flashes bright
 * red through walls, then fades to nothing (the case's own rim flashes with it, `CaseBeacon`). Close up the rat's exact
 * pose is drawn over the city from its own skinned buffers (like the Hunch sketch); far away, where the rat would be a
 * few pixels, a rim-lit stand-in of a rat in a fedora keeps it `PING_FLASH.minPixels` tall so it reads across the city.
 * No lights; nothing allocated per frame. Never shown for your own rat (the caller passes no carrier). */
export class CarrierPingFlash {
    private readonly proxy=new THREE.Group();
    private readonly proxyMaterial=caseRimMaterial();
    private readonly silhouetteMaterial=new THREE.MeshBasicMaterial({color:CASE_RED,transparent:true,opacity:0,blending:THREE.AdditiveBlending,
        depthTest:false,depthWrite:false,fog:false,toneMapped:false});
    /** The rat the silhouette is bound to, and the silhouette (the rat's batch buffers and skeleton, drawn without its tail). */
    private entity:RatEntity|null=null;
    private silhouette?:THREE.SkinnedMesh;
    constructor(private readonly scene:THREE.Scene){
        const sphere=new THREE.SphereGeometry(1,16,12),cylinder=new THREE.CylinderGeometry(1,1,1,20);
        // Rat-local parts (feet at 0): haunches, chest, head, ears and the fedora, the authority's body spheres.
        const parts:[THREE.BufferGeometry,number,number,number,number,number,number][]=[
            [sphere,0,.62,0,.6,.66,.54],[sphere,0,1.3,0,.45,.45,.42],[sphere,0,1.88,.04,.29,.27,.3],
            [sphere,-.2,2.04,0,.1,.12,.06],[sphere,.2,2.04,0,.1,.12,.06],
            [cylinder,0,2.12,0,.44,.035,.44],[cylinder,0,2.25,0,.24,.22,.24],
        ];
        for(const [geometry,x,y,z,sx,sy,sz] of parts){
            const mesh=new THREE.Mesh(geometry,this.proxyMaterial);
            mesh.position.set(x,y-PING_FLASH.centre,z);mesh.scale.set(sx,sy,sz);mesh.renderOrder=2001;mesh.raycast=()=>{};
            this.proxy.add(mesh);
        }
        this.proxy.name='carrier-ping-flash';this.proxy.visible=false;
        freezeStatic(this.proxy,[this.proxy]);scene.add(this.proxy);
    }

    /** Each frame: `carrier` is someone else's living carrier (null: none, or yours), `flash` its ping flash 0…1. */
    update(camera:THREE.Camera,carrier:RatEntity|null,flash:number):void {
        if(carrier!==this.entity){this.release();this.entity=carrier;}
        if(!carrier||carrier.dead||flash<=0){this.hide();return;}
        const p=carrier.mesh.position,distance=camera.position.distanceTo(p);
        const height=Math.max(1,window.innerHeight),projection=camera.projectionMatrix.elements[5];
        // How many times the rat must grow to stay `minPixels` tall: below 1 it is big enough as it is.
        const reach=PING_FLASH.minPixels*2*distance/(PING_FLASH.ratHeight*height*projection);
        const swell=reducedMotion()?1:1+PING_FLASH.swell*flash;
        const far=THREE.MathUtils.smoothstep(reach,.7,1.4),near=1-THREE.MathUtils.smoothstep(reach,1.5,3);
        this.proxy.visible=far>0;
        if(far>0){
            this.proxy.position.set(p.x,p.y+PING_FLASH.centre,p.z);this.proxy.quaternion.copy(carrier.mesh.quaternion);
            this.proxy.scale.setScalar(Math.max(1,reach)*swell);
            this.proxyMaterial.uniforms.strength.value=PING_FLASH.strength*flash*far;
            this.proxyMaterial.uniforms.heat.value=flash;
        }
        const silhouette=near>0?this.bind(carrier):undefined;
        if(this.silhouette)this.silhouette.visible=!!silhouette;
        this.silhouetteMaterial.opacity=PING_FLASH.silhouette*flash*near;
    }
    /** Nothing shows until the next flash. */
    hide():void {this.proxy.visible=false;if(this.silhouette)this.silhouette.visible=false;}

    dispose():void {
        this.release();this.proxy.removeFromParent();
        (this.proxy.children[0] as THREE.Mesh).geometry.dispose();(this.proxy.children[5] as THREE.Mesh).geometry.dispose();
        this.proxyMaterial.dispose();this.silhouetteMaterial.dispose();
    }

    /** The carrier's exact silhouette, built once per rat from its rigid batch (none without one). */
    private bind(entity:RatEntity):THREE.SkinnedMesh|undefined {
        if(this.silhouette)return this.silhouette;
        const batch=entity.mesh.getObjectByName('rat-rigid-batch');
        if(!(batch instanceof RigidBatch))return undefined;
        // Bones carry world matrices, so the silhouette lives at the scene root with an identity matrix.
        const geometry=new THREE.BufferGeometry();
        for(const [name,attribute] of Object.entries(batch.geometry.attributes))geometry.setAttribute(name,attribute);
        geometry.setIndex(batch.geometry.index);geometry.setDrawRange(0,batch.rigidIndexCount);
        const mesh=new THREE.SkinnedMesh(geometry,this.silhouetteMaterial);
        mesh.bind(batch.skeleton,batch.bindMatrix);
        mesh.name='carrier-ping-silhouette';mesh.renderOrder=2001;mesh.frustumCulled=false;mesh.raycast=()=>{};
        mesh.castShadow=mesh.receiveShadow=false;mesh.matrixAutoUpdate=false;
        this.scene.add(mesh);
        return this.silhouette=mesh;
    }
    /** Drops the silhouette: the buffers are the rat's (disposed with its rig), so only the draw state goes. */
    private release():void {
        const mesh=this.silhouette;if(!mesh)return;
        this.scene.remove(mesh);
        const geometry=mesh.geometry;for(const name of Object.keys(geometry.attributes))geometry.deleteAttribute(name);geometry.setIndex(null);geometry.dispose();
        this.silhouette=undefined;
    }
}

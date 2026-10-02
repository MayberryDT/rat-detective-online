import * as THREE from 'three';
import {freezeStatic} from '../utils/freezeStatic';
import {RigidBatch} from '../utils/RigidMeshBatch';
import {reducedMotion} from '../ui/motion';
import type {RatEntity} from '../entities/RatEntity';
import {caseRimMaterial} from './CaseBeacon';
import {CASE_RED} from './caseRed';

/** The ping flash's look: far away a flat rat-in-a-fedora sign keeps the carrier at least `minPixels` tall on screen (a
 * rat stands about `ratHeight` units); each flash swells it `swell`× (none with reduced motion). `silhouette` is the
 * exact rat's peak opacity. Scenery must stand `hiddenBy` units nearer than the rat (`signHiddenBy` than the sign's
 * feet) to count as hiding it, so a rat's own far arm or the street it stands on never does. */
export const PING_FLASH={minPixels:64,ratHeight:2.3,swell:.15,strength:1.8,silhouette:.9,hiddenBy:1.2,signHiddenBy:1.5} as const;

/** The sign's right half, feet at the origin, facing the camera: body, neck, head, an ear poking out under the fedora's
 * brim, the brim and a pinched crown; mirrored for the left. */
const SIGN_HALF:readonly (readonly [number,number])[]=[[0,0],[.5,0],[.6,.15],[.66,.45],[.62,.8],[.52,1.1],[.38,1.35],[.36,1.5],[.38,1.7],
    [.44,1.8],[.56,1.84],[.6,1.94],[.47,1.99],[.64,1.99],[.66,2.04],[.62,2.08],[.28,2.08],[.26,2.3],[.17,2.39],[0,2.34]];
/** The tail curling out to the sign's right: its outer edge out to the tip, then its inner edge back to the body. */
const SIGN_TAIL:readonly (readonly [number,number])[]=[[.56,.1],[.9,.12],[1.14,.3],[1.24,.6],[1.14,.92],[1.04,.9],[1.1,.62],[1.02,.4],[.84,.26],[.6,.26]];
/** The sign's height above its feet. */
const SIGN_TOP=2.39;

function signGeometry():THREE.BufferGeometry {
    const outline=[...SIGN_HALF,...SIGN_HALF.slice(1,-1).reverse().map(([x,y])=>[-x,y] as const)];
    const body=new THREE.Shape(outline.map(([x,y])=>new THREE.Vector2(x,y)));
    const tail=new THREE.Shape(SIGN_TAIL.map(([x,y])=>new THREE.Vector2(x,y)));
    return new THREE.ShapeGeometry([body,tail]);
}

/** The hot case heartbeat seen by everyone else (Tyler, 2 October): at each ping the carrier's whole body flashes bright
 * red where walls hide it, then fades to nothing (the case's own rim flashes with it, `CaseBeacon`); in plain sight the
 * rat's own hot look carries the ping. Close up the rat's exact pose is drawn from its own skinned buffers, only its
 * hidden parts (like the Hunch sketch); far away, where the rat would be a few pixels, a flat red sign of a rat in a
 * fedora keeps it `PING_FLASH.minPixels` tall so it reads across the city, shown where scenery stands in front of the
 * rat. No lights; nothing allocated per frame. Never shown for your own rat (the caller passes no carrier). */
export class CarrierPingFlash {
    private readonly sign:THREE.Mesh;
    private readonly signMaterial=caseRimMaterial(true,true,PING_FLASH.signHiddenBy);
    private readonly silhouetteMaterial=new THREE.MeshBasicMaterial({color:CASE_RED,transparent:true,opacity:0,blending:THREE.AdditiveBlending,
        depthFunc:THREE.GreaterDepth,depthWrite:false,fog:false,toneMapped:false});
    /** The rat the silhouette is bound to, and the silhouette (the rat's batch buffers and skeleton, drawn without its tail). */
    private entity:RatEntity|null=null;
    private silhouette?:THREE.SkinnedMesh;
    private signTop:number=PING_FLASH.ratHeight;
    constructor(private readonly scene:THREE.Scene){
        this.sign=new THREE.Mesh(signGeometry(),this.signMaterial);
        this.sign.name='carrier-ping-flash';this.sign.visible=false;this.sign.renderOrder=2001;this.sign.raycast=()=>{};
        freezeStatic(this.sign,[this.sign]);scene.add(this.sign);
        // Hidden parts only, as the Hunch: each vertex is moved `hiddenBy` nearer before the depth test.
        this.silhouetteMaterial.onBeforeCompile=shader=>{
            shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
                vec4 pingHidden=projectionMatrix*vec4(mvPosition.xy,min(mvPosition.z+${PING_FLASH.hiddenBy.toFixed(2)},-.2),1.);
                gl_Position.z=pingHidden.z/pingHidden.w*gl_Position.w;`);
        };
        this.silhouetteMaterial.customProgramCacheKey=()=>'carrier-ping-silhouette-v1';
    }
    /** How high above the carrier's feet the flash reaches now (world units): the HOT CASE tag sits above it. */
    get top():number {return this.signTop;}

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
        this.sign.visible=far>0;
        if(far>0){
            // Stands on the rat's feet and faces the camera, growing upward so it never reaches below the street.
            const scale=Math.max(1,reach)*swell;
            this.sign.position.copy(p);this.sign.quaternion.copy(camera.quaternion);this.sign.scale.setScalar(scale);
            this.signMaterial.uniforms.strength.value=PING_FLASH.strength*flash*far;
            this.signMaterial.uniforms.heat.value=flash;
            this.signTop=Math.max(PING_FLASH.ratHeight,SIGN_TOP*scale);
        }else this.signTop=PING_FLASH.ratHeight;
        const silhouette=near>0?this.bind(carrier):undefined;
        if(this.silhouette)this.silhouette.visible=!!silhouette;
        this.silhouetteMaterial.opacity=PING_FLASH.silhouette*flash*near;
    }
    /** Nothing shows until the next flash. */
    hide():void {this.sign.visible=false;this.signTop=PING_FLASH.ratHeight;if(this.silhouette)this.silhouette.visible=false;}

    dispose():void {
        this.release();this.sign.removeFromParent();this.sign.geometry.dispose();
        this.signMaterial.dispose();this.silhouetteMaterial.dispose();
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

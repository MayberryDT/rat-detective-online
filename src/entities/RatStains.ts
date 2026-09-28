import * as THREE from 'three';
import {COAT_PROFILE} from '../utils/RatCoatGeometry';
import {ratSpineWeights} from '../utils/RatModel';

const MAX_STAINS=8;
let sharedGeometry:THREE.ShapeGeometry|undefined;
let sharedMaterial:THREE.MeshStandardMaterial|undefined;
let owners=0;

/** Coat radius at a body-local height, from the accepted coat profile. */
function coatRadius(y:number):number {
    for(let i=1;i<COAT_PROFILE.length;i++){
        const [r0,y0]=COAT_PROFILE[i-1]!,[r1,y1]=COAT_PROFILE[i]!;
        if(y<=y1&&y1>y0)return THREE.MathUtils.lerp(r0,r1,(y-y0)/(y1-y0));
    }
    return COAT_PROFILE[COAT_PROFILE.length-2]![0]!;
}

/** Polish 6: cheese stains that build up on one rat's coat during a life. One
 * instanced draw per rat, parented to the animated body so they follow the
 * walk, flinch and ragdoll. Cleared on respawn. */
export class RatStains {
    private readonly mesh:THREE.InstancedMesh;
    private cursor=0;
    private readonly dummy=new THREE.Object3D();
    private readonly outward=new THREE.Vector3();
    /** Each stain's placement on the unbent coat and how much it follows the belly and chest (R1). */
    private readonly rest=Array.from({length:MAX_STAINS},()=>new THREE.Matrix4());
    private readonly follow=Array.from({length:MAX_STAINS},()=>({belly:0,chest:0}));
    private readonly blend=new THREE.Matrix4();
    private readonly chestInBody=new THREE.Matrix4();
    private readonly placed=new THREE.Matrix4();

    constructor(parent:THREE.Object3D){
        if(!sharedGeometry){
            const shape=new THREE.Shape();
            for(let i=0;i<24;i++){
                const angle=i/24*Math.PI*2,radius=(1+.25*Math.sin(angle*5)+.1*Math.cos(angle*7));
                if(i===0)shape.moveTo(Math.cos(angle)*radius,Math.sin(angle)*radius);else shape.lineTo(Math.cos(angle)*radius,Math.sin(angle)*radius);
            }
            sharedGeometry=new THREE.ShapeGeometry(shape);
            sharedMaterial=new THREE.MeshStandardMaterial({color:0xf2b634,emissive:0x8a5a08,emissiveIntensity:.35,roughness:.45,
                polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
        }
        owners++;
        this.mesh=new THREE.InstancedMesh(sharedGeometry,sharedMaterial!,MAX_STAINS);
        this.mesh.name='rat-cheese-stains';this.mesh.count=0;this.mesh.frustumCulled=false;
        this.mesh.visible=false; // an empty instanced mesh still costs a draw call
        parent.add(this.mesh);
    }

    /** Add a stain facing `angle` (radians around the body, 0 = the rat's front). */
    add(angle:number,seed:number):void {
        const y=.35+((seed*.618)%1)*.8,radius=coatRadius(y)+.012;
        this.outward.set(Math.sin(angle),0,Math.cos(angle));
        this.dummy.position.set(this.outward.x*radius,y,this.outward.z*radius);
        this.dummy.lookAt(this.outward.x*radius*2,y,this.outward.z*radius*2);
        Object.assign(this.follow[this.cursor%MAX_STAINS]!,ratSpineWeights(y));
        this.place(seed,1);
    }

    /** R1: keep the stains on a bent corpse coat. `belly` and `chest` are the spine joints
     * (children of the body this mesh hangs on); each stain takes the same blend of their
     * transforms as the coat under it, so it stays on the skinned surface. */
    bend(belly:THREE.Object3D,chest:THREE.Object3D):void {
        if(!this.mesh.count)return;
        belly.updateMatrix();chest.updateMatrix();
        this.chestInBody.multiplyMatrices(belly.matrix,chest.matrix);
        const b=belly.matrix.elements,c=this.chestInBody.elements,m=this.blend.elements;
        for(let i=0;i<this.mesh.count;i++){
            const w=this.follow[i]!,rest=1-w.belly-w.chest;
            for(let k=0;k<16;k++)m[k]=(k%5===0?rest:0)+b[k]!*w.belly+c[k]!*w.chest;
            this.mesh.setMatrixAt(i,this.placed.multiplyMatrices(this.blend,this.rest[i]!));
        }
        this.mesh.instanceMatrix.needsUpdate=true;
    }

    /** Juice T4: a stain on a sphere around the parent's origin (the head), `height` above its centre. */
    addOnSphere(angle:number,height:number,radius:number,seed:number,scale:number):void {
        const ring=Math.sqrt(Math.max(0,radius*radius-height*height));
        this.dummy.position.set(Math.sin(angle)*ring,height,Math.cos(angle)*ring);
        this.dummy.lookAt(this.dummy.position.x*2,this.dummy.position.y*2,this.dummy.position.z*2);
        const follow=this.follow[this.cursor%MAX_STAINS]!;follow.belly=follow.chest=0;
        this.place(seed,scale);
    }

    private place(seed:number,scale:number):void {
        this.dummy.rotateZ(seed*2.4);
        this.dummy.scale.setScalar((.09+((seed*.371)%1)*.07)*scale);
        this.dummy.updateMatrix();
        this.rest[this.cursor%MAX_STAINS]!.copy(this.dummy.matrix);
        this.mesh.setMatrixAt(this.cursor%MAX_STAINS,this.dummy.matrix);
        this.cursor++;
        this.mesh.count=Math.min(MAX_STAINS,this.cursor);this.mesh.visible=true;
        this.mesh.instanceMatrix.needsUpdate=true;
    }

    dispose():void {
        this.mesh.removeFromParent();this.mesh.dispose();
        if(--owners===0){sharedGeometry?.dispose();sharedMaterial?.dispose();sharedGeometry=undefined;sharedMaterial=undefined;}
    }
}

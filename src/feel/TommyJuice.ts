import * as THREE from 'three';
import type {Vec3Data} from '../shared/networkProtocol';
import {FEEL} from './feelTuning';

/** Muzzle height above the feet (`ratMuzzle`): casings land about here below the muzzle. */
const MUZZLE_HEIGHT=1.376;
const FLASHES=10;
const GRAVITY=-24;

/** A four-point star with a hot centre, for the Tommy's muzzle flash. */
function starTexture():THREE.DataTexture {
    const size=64,data=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1,r=Math.hypot(u,v),spike=Math.max(0,1-Math.abs(u*v)*14)*(1-r);
        const a=Math.min(1,Math.max(0,1-r*1.6)**1.5+spike*1.2),i=(y*size+x)*4;
        data[i]=255;data[i+1]=Math.round(200+55*Math.max(0,1-r*2));data[i+2]=Math.round(120+135*Math.max(0,1-r*3));data[i+3]=Math.round(a*255);
    }
    const texture=new THREE.DataTexture(data,size,size);texture.needsUpdate=true;return texture;
}

interface Casing {p:THREE.Vector3;v:THREE.Vector3;spin:THREE.Vector3;q:THREE.Quaternion;floor:number;age:number;alive:boolean;bounced:boolean}

/** W1: every Tommy Gun round, any rat's: a star flash at the muzzle and a brass casing flung out to the right,
 * tumbling, clinking down once and fading. Bounded pools; nothing allocated per frame. Emissive sprites, no lights. */
export class TommyJuice {
    private readonly root=new THREE.Group();
    private readonly texture=starTexture();
    private readonly flashes:{sprite:THREE.Sprite;age:number}[]=[];
    private nextFlash=0;
    private readonly casings:Casing[]=[];
    private nextCasing=0;
    private readonly brass:THREE.InstancedMesh;
    private readonly pose=new THREE.Object3D();
    private readonly right=new THREE.Vector3();
    private readonly up=new THREE.Vector3(0,1,0);
    private readonly euler=new THREE.Euler();
    private readonly turn=new THREE.Quaternion();
    constructor(scene:THREE.Scene){
        this.root.name='tommy-juice';scene.add(this.root);
        for(let i=0;i<FLASHES;i++){
            // Overbright (untonemapped) so the flash reads hot white-gold, not a dull smudge.
            const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.texture,color:new THREE.Color(2.6,1.9,1.1),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,toneMapped:false}));
            sprite.visible=false;sprite.renderOrder=4;sprite.raycast=()=>{};this.root.add(sprite);this.flashes.push({sprite,age:1});
        }
        const count=Math.max(1,Math.round(FEEL.tommyGun.params.casings));
        // A .45 casing, scaled up so it reads at rat size.
        const geometry=new THREE.CylinderGeometry(.035,.035,.11,8);
        this.brass=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({color:0xc9962e,metalness:.85,roughness:.3,emissive:0x3a2608}),count);
        this.brass.name='tommy-casings';this.brass.frustumCulled=false;this.brass.count=0;this.brass.raycast=()=>{};this.root.add(this.brass);
        for(let i=0;i<count;i++)this.casings.push({p:new THREE.Vector3(),v:new THREE.Vector3(),spin:new THREE.Vector3(),q:new THREE.Quaternion(),floor:0,age:0,alive:false,bounced:false});
    }
    /** A Tommy round left `origin` along `direction`. */
    fired(origin:Vec3Data,direction:Vec3Data):void {
        const p=FEEL.tommyGun.params;
        const flash=this.flashes[this.nextFlash]!;this.nextFlash=(this.nextFlash+1)%FLASHES;
        flash.sprite.position.set(origin.x+direction.x*.25,origin.y+direction.y*.25,origin.z+direction.z*.25);
        flash.sprite.material.rotation=Math.random()*Math.PI;flash.sprite.visible=true;flash.age=0;
        flash.sprite.scale.setScalar(p.flash*(1.1+Math.random()*.5));
        const casing=this.casings[this.nextCasing]!;this.nextCasing=(this.nextCasing+1)%this.casings.length;
        this.right.set(direction.x,0,direction.z).cross(this.up);
        if(this.right.lengthSq()<1e-6)this.right.set(1,0,0);
        this.right.normalize();
        casing.p.set(origin.x-direction.x*.2+this.right.x*.08,origin.y+.05,origin.z-direction.z*.2+this.right.z*.08);
        casing.v.copy(this.right).multiplyScalar(3+Math.random()*1.5).addScaledVector(this.up,3.2+Math.random()*1.4);
        casing.v.x-=direction.x*.8;casing.v.z-=direction.z*.8;
        casing.spin.set((Math.random()-.5)*30,(Math.random()-.5)*16,(Math.random()-.5)*30);
        casing.q.identity();casing.floor=origin.y-MUZZLE_HEIGHT+.035;casing.age=0;casing.alive=true;casing.bounced=false;
    }
    update(dt:number):void {
        if(!(dt>0))return;
        for(const flash of this.flashes){
            if(!flash.sprite.visible)continue;
            flash.age+=dt;
            if(flash.age>=.05){flash.sprite.visible=false;continue;}
            flash.sprite.material.opacity=1-flash.age/.05;
        }
        const life=FEEL.tommyGun.params.casingLife;let n=0;
        for(const casing of this.casings){
            if(!casing.alive)continue;
            casing.age+=dt;
            if(casing.age>=life){casing.alive=false;continue;}
            if(casing.p.y>casing.floor||casing.v.y>0){
                casing.v.y+=GRAVITY*dt;casing.p.addScaledVector(casing.v,dt);
                this.euler.set(casing.spin.x*dt,casing.spin.y*dt,casing.spin.z*dt);casing.q.multiply(this.turn.setFromEuler(this.euler));
                if(casing.p.y<=casing.floor){
                    casing.p.y=casing.floor;
                    // One lively clink, then it rolls to rest on its side.
                    if(!casing.bounced){casing.bounced=true;casing.v.set(casing.v.x*.4,-casing.v.y*.35,casing.v.z*.4);casing.spin.multiplyScalar(.5);}
                    else {casing.v.set(0,0,0);this.euler.set(0,0,Math.PI/2);casing.q.setFromEuler(this.euler);}
                }
            }
            this.pose.position.copy(casing.p);this.pose.quaternion.copy(casing.q);
            this.pose.scale.setScalar(Math.min(1,(life-casing.age)/.3));this.pose.updateMatrix();
            this.brass.setMatrixAt(n++,this.pose.matrix);
        }
        this.brass.count=n;if(n)this.brass.instanceMatrix.needsUpdate=true;
    }
    clear():void {
        for(const flash of this.flashes)flash.sprite.visible=false;
        for(const casing of this.casings)casing.alive=false;
        this.brass.count=0;
    }
    dispose():void {
        this.root.removeFromParent();
        for(const flash of this.flashes)flash.sprite.material.dispose();
        this.texture.dispose();this.brass.geometry.dispose();(this.brass.material as THREE.Material).dispose();this.brass.dispose();
    }
}

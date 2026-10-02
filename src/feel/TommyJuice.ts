import * as THREE from 'three';
import type {Vec3Data} from '../shared/networkProtocol';
import {FEEL} from './feelTuning';

/** Muzzle height above the feet (`ratMuzzle`): casings and crumbs land about here below the muzzle. */
const MUZZLE_HEIGHT=1.376;
/** Flash and puff sprites (one each a round; ten rounds a second outlive neither pool). */
const FLASHES=10;
/** Cheese crumbs in flight at once across every Tommy in range (clarity batch: 96 → 48). */
const CRUMBS=48;
const GRAVITY=-24;
/** Half a cheese-cube casing's edge (it rests on the floor on a face). */
const CUBE=.042;
const FLASH_LIFE=.05,PUFF_LIFE=.3,CRUMB_LIFE=.55;

/** A four-point star with a hot pale centre and cheese-yellow spikes, for the Tommy's muzzle flash. */
function starTexture():THREE.DataTexture {
    const size=64,data=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1,r=Math.hypot(u,v),spike=Math.max(0,1-Math.abs(u*v)*14)*(1-r);
        const a=Math.min(1,Math.max(0,1-r*1.6)**1.5+spike*1.2),i=(y*size+x)*4;
        data[i]=255;data[i+1]=Math.round(196+59*Math.max(0,1-r*2.2));data[i+2]=Math.round(30+200*Math.max(0,1-r*3.2));data[i+3]=Math.round(a*255);
    }
    const texture=new THREE.DataTexture(data,size,size);texture.needsUpdate=true;return texture;
}

/** A soft, lumpy cheese-yellow puff: dense at the heart, feathered at a wobbly edge. */
function puffTexture():THREE.DataTexture {
    const size=64,data=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1,r=Math.hypot(u,v),t=Math.atan2(v,u);
        const edge=.8+.09*Math.sin(t*5+.7)+.05*Math.sin(t*9+2.1),a=Math.max(0,Math.min(1,(edge-r)/.5))**1.3,hot=Math.max(0,1-r*1.8),i=(y*size+x)*4;
        data[i]=255;data[i+1]=Math.round(200+45*hot);data[i+2]=Math.round(60+120*hot);data[i+3]=Math.round(a*255);
    }
    const texture=new THREE.DataTexture(data,size,size);texture.magFilter=texture.minFilter=THREE.LinearFilter;texture.needsUpdate=true;return texture;
}

/** A cheese cube's face: yellow paste with round pores inside an orange rind edge. */
function cheeseTexture():THREE.DataTexture {
    const size=32,data=new Uint8Array(size*size*4),pores=[[9,10,3.4],[21,8,2.6],[15,20,3.8],[25,23,2.2],[7,24,2]];
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        const i=(y*size+x)*4;data[i+3]=255;
        if(Math.min(x,y,size-1-x,size-1-y)<3){data[i]=0xdc;data[i+1]=0x78;data[i+2]=0x1a;continue;}
        let pore=0;for(const [px,py,pr] of pores)pore=Math.max(pore,Math.min(1,(1-Math.hypot(x+.5-px!,y+.5-py!)/pr!)*3));
        const shade=1-.42*pore;data[i]=Math.round(0xf8*(1-.12*pore));data[i+1]=Math.round(0xca*shade);data[i+2]=Math.round(0x3c*shade);
    }
    const texture=new THREE.DataTexture(data,size,size);texture.magFilter=texture.minFilter=THREE.LinearFilter;
    texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;return texture;
}

interface Casing {p:THREE.Vector3;v:THREE.Vector3;spin:THREE.Vector3;q:THREE.Quaternion;floor:number;age:number;alive:boolean;bounced:boolean}
interface Crumb {p:THREE.Vector3;v:THREE.Vector3;q:THREE.Quaternion;size:number;floor:number;age:number;alive:boolean}
interface Puff {sprite:THREE.Sprite;v:THREE.Vector3;size:number;age:number}

/** W1: every Tommy Gun round, any rat's: a cheese-yellow star flash at the muzzle, a soft yellow puff that blooms and
 * drifts off, a spray of cheese crumbs thrown forward, and a cheese-cube casing flung out to the right, tumbling,
 * bouncing once and fading. Bounded pools; nothing allocated per frame. Emissive sprites and cheese, no lights. */
export class TommyJuice {
    private readonly root=new THREE.Group();
    private readonly texture=starTexture();
    private readonly puffMap=puffTexture();
    private readonly cheeseMap=cheeseTexture();
    private readonly flashes:{sprite:THREE.Sprite;age:number}[]=[];
    private nextFlash=0;
    private readonly puffs:Puff[]=[];
    private nextPuff=0;
    private readonly casings:Casing[]=[];
    private nextCasing=0;
    private readonly crumbs:Crumb[]=[];
    private nextCrumb=0;
    private readonly cheese:THREE.MeshStandardMaterial;
    private readonly cubes:THREE.InstancedMesh;
    private readonly bits:THREE.InstancedMesh;
    private readonly pose=new THREE.Object3D();
    private readonly right=new THREE.Vector3();
    private readonly up=new THREE.Vector3(0,1,0);
    private readonly euler=new THREE.Euler();
    private readonly turn=new THREE.Quaternion();
    constructor(scene:THREE.Scene){
        this.root.name='tommy-juice';scene.add(this.root);
        for(let i=0;i<FLASHES;i++){
            // Untonemapped, and every channel kept at or under 1: the canvas clamps each channel before blending, so an
            // overbright yellow saturates to a flat lemon that turns olive as it fades. These ratios stay cheese-warm.
            const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.texture,color:new THREE.Color(1,.86,.42),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,toneMapped:false}));
            sprite.visible=false;sprite.renderOrder=4;sprite.raycast=()=>{};this.root.add(sprite);this.flashes.push({sprite,age:1});
            const puff=new THREE.Sprite(new THREE.SpriteMaterial({map:this.puffMap,color:new THREE.Color(1,.8,.32),depthWrite:false,transparent:true,toneMapped:false}));
            puff.visible=false;puff.renderOrder=3;puff.raycast=()=>{};this.root.add(puff);this.puffs.push({sprite:puff,v:new THREE.Vector3(),size:1,age:1});
        }
        // Cheese glows a little of its own so a casing reads on a dark street.
        this.cheese=new THREE.MeshStandardMaterial({map:this.cheeseMap,emissiveMap:this.cheeseMap,emissive:new THREE.Color(.55,.55,.55),roughness:.6});
        const geometry=new THREE.BoxGeometry(CUBE*2,CUBE*2,CUBE*2);
        const count=Math.max(1,Math.round(FEEL.tommyGun.params.casings));
        this.cubes=new THREE.InstancedMesh(geometry,this.cheese,count);
        this.cubes.name='tommy-casings';this.cubes.frustumCulled=false;this.cubes.count=0;this.cubes.raycast=()=>{};this.root.add(this.cubes);
        for(let i=0;i<count;i++)this.casings.push({p:new THREE.Vector3(),v:new THREE.Vector3(),spin:new THREE.Vector3(),q:new THREE.Quaternion(),floor:0,age:0,alive:false,bounced:false});
        this.bits=new THREE.InstancedMesh(geometry,this.cheese,CRUMBS);
        this.bits.name='tommy-crumbs';this.bits.frustumCulled=false;this.bits.count=0;this.bits.raycast=()=>{};this.root.add(this.bits);
        for(let i=0;i<CRUMBS;i++)this.crumbs.push({p:new THREE.Vector3(),v:new THREE.Vector3(),q:new THREE.Quaternion(),size:1,floor:0,age:0,alive:false});
    }
    /** A Tommy round left `origin` along `direction`. */
    fired(origin:Vec3Data,direction:Vec3Data):void {
        const p=FEEL.tommyGun.params;
        const flash=this.flashes[this.nextFlash]!;this.nextFlash=(this.nextFlash+1)%FLASHES;
        flash.sprite.position.set(origin.x+direction.x*.25,origin.y+direction.y*.25,origin.z+direction.z*.25);
        flash.sprite.material.rotation=Math.random()*Math.PI;flash.sprite.visible=true;flash.age=0;
        flash.sprite.scale.setScalar(p.flash*(1.1+Math.random()*.5));
        const puff=this.puffs[this.nextPuff]!;this.nextPuff=(this.nextPuff+1)%FLASHES;
        puff.sprite.position.set(origin.x+direction.x*.4,origin.y+direction.y*.4,origin.z+direction.z*.4);
        puff.v.set(direction.x*1.8,direction.y*1.8+.6,direction.z*1.8);
        puff.sprite.material.rotation=Math.random()*Math.PI*2;puff.size=p.puff*(.8+Math.random()*.4);puff.age=0;puff.sprite.visible=true;
        puff.sprite.scale.setScalar(puff.size*.3);puff.sprite.material.opacity=.75;
        const floor=origin.y-MUZZLE_HEIGHT;
        for(let i=0,n=Math.round(p.crumbs);i<n;i++){
            const crumb=this.crumbs[this.nextCrumb]!;this.nextCrumb=(this.nextCrumb+1)%CRUMBS;
            crumb.p.set(origin.x+direction.x*.3,origin.y+direction.y*.3,origin.z+direction.z*.3);
            const speed=6+Math.random()*5;
            crumb.v.set(direction.x*speed+(Math.random()-.5)*4,direction.y*speed+(Math.random()-.2)*3,direction.z*speed+(Math.random()-.5)*4);
            crumb.q.setFromEuler(this.euler.set(Math.random()*6.3,Math.random()*6.3,Math.random()*6.3));
            crumb.size=.4+Math.random()*.4;crumb.floor=floor+CUBE*crumb.size;crumb.age=0;crumb.alive=true;
        }
        const casing=this.casings[this.nextCasing]!;this.nextCasing=(this.nextCasing+1)%this.casings.length;
        this.right.set(direction.x,0,direction.z).cross(this.up);
        if(this.right.lengthSq()<1e-6)this.right.set(1,0,0);
        this.right.normalize();
        casing.p.set(origin.x-direction.x*.2+this.right.x*.08,origin.y+.05,origin.z-direction.z*.2+this.right.z*.08);
        casing.v.copy(this.right).multiplyScalar(3+Math.random()*1.5).addScaledVector(this.up,3.2+Math.random()*1.4);
        casing.v.x-=direction.x*.8;casing.v.z-=direction.z*.8;
        casing.spin.set((Math.random()-.5)*30,(Math.random()-.5)*16,(Math.random()-.5)*30);
        casing.q.identity();casing.floor=floor+CUBE;casing.age=0;casing.alive=true;casing.bounced=false;
    }
    update(dt:number):void {
        if(!(dt>0))return;
        for(const flash of this.flashes){
            if(!flash.sprite.visible)continue;
            flash.age+=dt;
            if(flash.age>=FLASH_LIFE){flash.sprite.visible=false;continue;}
            flash.sprite.material.opacity=1-flash.age/FLASH_LIFE;
        }
        for(const puff of this.puffs){
            if(!puff.sprite.visible)continue;
            puff.age+=dt;
            if(puff.age>=PUFF_LIFE){puff.sprite.visible=false;continue;}
            // Blooms fast, then drifts and thins.
            const t=puff.age/PUFF_LIFE;
            puff.sprite.position.addScaledVector(puff.v,dt);
            puff.sprite.scale.setScalar(puff.size*(.3+.7*(1-(1-t)**3)));
            puff.sprite.material.opacity=.75*(1-t)**1.4;
        }
        let n=0;
        for(const crumb of this.crumbs){
            if(!crumb.alive)continue;
            crumb.age+=dt;
            if(crumb.age>=CRUMB_LIFE){crumb.alive=false;continue;}
            if(crumb.p.y>crumb.floor){
                crumb.v.y+=GRAVITY*dt;crumb.p.addScaledVector(crumb.v,dt);
                if(crumb.p.y<=crumb.floor){crumb.p.y=crumb.floor;crumb.v.set(0,0,0);}
            }
            this.pose.position.copy(crumb.p);this.pose.quaternion.copy(crumb.q);
            this.pose.scale.setScalar(crumb.size*Math.min(1,(CRUMB_LIFE-crumb.age)/.15));this.pose.updateMatrix();
            this.bits.setMatrixAt(n++,this.pose.matrix);
        }
        this.bits.count=n;if(n)this.bits.instanceMatrix.needsUpdate=true;
        const life=FEEL.tommyGun.params.casingLife;n=0;
        for(const casing of this.casings){
            if(!casing.alive)continue;
            casing.age+=dt;
            if(casing.age>=life){casing.alive=false;continue;}
            if(casing.p.y>casing.floor||casing.v.y>0){
                casing.v.y+=GRAVITY*dt;casing.p.addScaledVector(casing.v,dt);
                this.euler.set(casing.spin.x*dt,casing.spin.y*dt,casing.spin.z*dt);casing.q.multiply(this.turn.setFromEuler(this.euler));
                if(casing.p.y<=casing.floor){
                    casing.p.y=casing.floor;
                    // One lively bounce, then it settles flat on a face at its own angle.
                    if(!casing.bounced){casing.bounced=true;casing.v.set(casing.v.x*.4,-casing.v.y*.35,casing.v.z*.4);casing.spin.multiplyScalar(.5);}
                    else {casing.v.set(0,0,0);this.euler.set(0,casing.spin.y,0);casing.q.setFromEuler(this.euler);}
                }
            }
            this.pose.position.copy(casing.p);this.pose.quaternion.copy(casing.q);
            this.pose.scale.setScalar(Math.min(1,(life-casing.age)/.3));this.pose.updateMatrix();
            this.cubes.setMatrixAt(n++,this.pose.matrix);
        }
        this.cubes.count=n;if(n)this.cubes.instanceMatrix.needsUpdate=true;
    }
    clear():void {
        for(const flash of this.flashes)flash.sprite.visible=false;
        for(const puff of this.puffs)puff.sprite.visible=false;
        for(const casing of this.casings)casing.alive=false;
        for(const crumb of this.crumbs)crumb.alive=false;
        this.cubes.count=0;this.bits.count=0;
    }
    dispose():void {
        this.root.removeFromParent();
        for(const flash of this.flashes)flash.sprite.material.dispose();
        for(const puff of this.puffs)puff.sprite.material.dispose();
        this.texture.dispose();this.puffMap.dispose();this.cheeseMap.dispose();
        this.cubes.geometry.dispose();this.cheese.dispose();this.cubes.dispose();this.bits.dispose();
    }
}

import * as THREE from 'three';
import {metalReflection} from '../utils/metalReflection';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {disposeMeshResources} from '../utils/disposeMeshResources';
import {batchRigidMeshes} from '../utils/RigidMeshBatch';
import {PickupRespawnVisual} from './PickupRespawnVisual';
import type {PickupKind} from '../shared/pickups';

/** Warm tungsten from each supply's own lamp. */
const LAMP_COLOR=0xffd9a0;
/** Lamp head over the display, relative to the site floor. */
const LAMP_HEAD=new THREE.Vector3(0,2.75,0);
/** Malpractice hop duration (ms) and height. */
const HOP_MS=380, HOP_HEIGHT=1.5;

/** The display is lit by its own lamp, not by self-glow: surfaces facing up toward
 * the shade catch warm light and the sides fall off into the dark. Chained after
 * the batch's own palette so the per-part colors stay exact. */
function lightFromLamp(root:THREE.Group,strength:number):void {
    const batch=batchRigidMeshes(root);
    const materials=batch?[batch.material].flat():[];
    for(const material of materials){
        const compile=material.onBeforeCompile,key=material.customProgramCacheKey;
        material.onBeforeCompile=function(shader,renderer){
            compile.call(this,shader,renderer);
            shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>',`
                vec3 lampUp=normalize((viewMatrix*vec4(0.,1.,0.,0.)).xyz);
                reflectedLight.directDiffuse+=diffuseColor.rgb*vec3(1.,.86,.63)*(max(dot(normal,lampUp),0.)*.75+.18)*${strength.toFixed(2)};
                #include <aomap_fragment>`);
        };
        material.customProgramCacheKey=()=>`${key.call(material)}:supply-lamp-${strength.toFixed(2)}`;
        material.needsUpdate=true;
    }
}

/** Supplies as noir evidence displays: an iron-plated trench coat on a tailor's
 * dummy, a doctor's bag and a pair of red wingtips, each under a work lamp that
 * throws a cone and a pool of light. The lamp goes dark while the site restocks. */
export class PickupVisual {
    readonly root=new THREE.Group();
    private readonly item=new THREE.Group();
    private readonly lamp=new THREE.Group();
    private readonly glow:THREE.MeshBasicMaterial[]=[];
    private readonly bulb:THREE.MeshBasicMaterial;
    private availableAt=0;
    private pending=false;
    private lit=-1;
    /** Seconds left in the claim flicker, when the lamp stutters out. */
    private flicker=0;
    private lastUpdate=0;
    private wasEmpty=true;
    /** Malpractice: the kit's hop from `from` to the root's position, started at `hopAt` (ms). */
    private readonly from=new THREE.Vector3();
    private readonly to=new THREE.Vector3();
    private hopAt=-Infinity;
    private placed=false;
    private nervous=false;
    private restock?:PickupRespawnVisual;
    constructor(scene:THREE.Scene,private readonly kind:PickupKind){
        const iron=new THREE.MeshStandardMaterial({color:0x5d656f,metalness:.9,roughness:.36});
        const rivet=new THREE.MeshStandardMaterial({color:0x2d2b2e,metalness:.9,roughness:.4});
        const dark=new THREE.MeshStandardMaterial({color:0x1d191c,metalness:.35,roughness:.62});
        const wood=new THREE.MeshStandardMaterial({color:0x5a3a24,metalness:.05,roughness:.7});
        const brass=new THREE.MeshStandardMaterial({color:0xb38a3e,metalness:.85,roughness:.3});
        for(const material of [iron,rivet,brass]){material.envMap=metalReflection();material.envMapIntensity=.65;}
        const box=(parent:THREE.Group,w:number,h:number,d:number,x:number,y:number,z:number,material:THREE.Material,r=.04)=>{
            const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/2,h/2,d/2)),material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
        };
        const cylinder=(parent:THREE.Group,top:number,bottom:number,h:number,x:number,y:number,z:number,material:THREE.Material,segments=12)=>{
            const mesh=new THREE.Mesh(new THREE.CylinderGeometry(top,bottom,h,segments),material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
        };
        // Low evidence plinth.
        cylinder(this.root,.78,.84,.12,0,.06,0,dark,20);
        this.root.add(this.item);
        if(kind==='ironclad'){
            this.item.name='iron-trenchcoat-dummy';
            // Tailor's dummy: turned wooden stand, three feet, a neck knob above the coat.
            cylinder(this.item,.05,.05,.5,0,.25,0,wood,8);
            for(let i=0;i<3;i++){const foot=box(this.item,.5,.05,.07,Math.cos(i*2.1)*.2,.03,Math.sin(i*2.1)*.2,wood,.02);foot.rotation.y=-i*2.1;}
            cylinder(this.item,.09,.11,.16,0,1.66,0,wood,10);
            cylinder(this.item,.06,.06,.06,0,1.77,0,brass,8);
            // Riveted iron coat: chest, flared skirt, shoulder plates, lapels, belt and buckle.
            box(this.item,.82,.72,.4,0,1.2,0,iron,.08);
            const skirt=cylinder(this.item,.42,.56,.72,0,.62,0,iron,8);skirt.scale.z=.62;
            for(const sign of [-1,1]){
                const shoulder=box(this.item,.34,.12,.44,sign*.4,1.54,0,iron,.05);shoulder.rotation.z=sign*-.28;
                const arm=box(this.item,.2,.7,.26,sign*.5,1.12,0,iron,.07);arm.rotation.z=sign*.12;
                const lapel=box(this.item,.2,.44,.06,sign*.14,1.36,.21,iron,.02);lapel.rotation.z=sign*-.34;
                for(const y of [.64,.86,1.08,1.3])box(this.item,.05,.05,.04,sign*.3,y,.24,rivet,.02);
                for(const y of [.98,1.14,1.3])box(this.item,.05,.05,.04,sign*.13,y,.21,rivet,.02);
                box(this.item,.04,.66,.04,sign*.43,.62,.02,rivet,.015);
            }
            box(this.item,.86,.1,.44,0,.94,0,dark,.03);
            box(this.item,.16,.12,.05,0,.94,.23,brass,.02);
        }else if(kind==='hustle'){
            this.item.name='red-wingtips';
            const red=new THREE.MeshStandardMaterial({color:0xb3160f,metalness:.25,roughness:.28});
            red.envMap=metalReflection();red.envMapIntensity=.9;
            for(const sign of [-1,1]){
                const shoe=new THREE.Group();shoe.position.set(sign*.26,.12,sign*.06);shoe.rotation.y=sign*-.2;this.item.add(shoe);
                box(shoe,.36,.1,.82,0,.05,0,dark,.03);
                box(shoe,.34,.22,.78,0,.19,.02,red,.08);
                box(shoe,.32,.34,.36,0,.3,-.2,red,.07);
                box(shoe,.3,.05,.2,0,.49,-.2,dark,.02);
                box(shoe,.3,.03,.14,0,.31,.3,dark,.01);
                for(const z of [-.06,.04,.14]){const lace=box(shoe,.22,.02,.03,0,.34,z,brass,.01);lace.rotation.y=z*1.2;}
            }
        }else{
            this.item.name='doctors-bag';
            const leather=new THREE.MeshStandardMaterial({color:0x221613,metalness:.1,roughness:.55});
            const cream=new THREE.MeshStandardMaterial({color:0xe9e1cc,metalness:.02,roughness:.6});
            const green=new THREE.MeshStandardMaterial({color:0x2f9b5c,metalness:.05,roughness:.5});
            // Gladstone bag: wide base, sloped sides meeting at a brass frame, arched handle.
            box(this.item,1.1,.5,.56,0,.37,0,leather,.1);
            for(const sign of [-1,1]){const side=box(this.item,1.08,.34,.08,0,.72,sign*.17,leather,.03);side.rotation.x=sign*-.42;}
            box(this.item,1.12,.06,.1,0,.87,0,brass,.02);
            box(this.item,.12,.12,.08,0,.84,.08,brass,.03);
            const handle=new THREE.Mesh(new THREE.TorusGeometry(.18,.035,6,12,Math.PI),leather);handle.position.set(0,.9,0);this.item.add(handle);
            for(const x of [-.46,.46])for(const z of [-.2,.2])box(this.item,.07,.06,.07,x,.13,z,brass,.02);
            // Recognizable at a glance: a cream roundel with a green cross on both faces.
            for(const face of [-1,1]){
                const roundel=cylinder(this.item,.17,.17,.02,0,.4,face*.29,cream,16);roundel.rotation.x=Math.PI/2;
                box(this.item,.06,.2,.02,0,.4,face*.3,green,.01);
                box(this.item,.2,.06,.02,0,.4,face*.3,green,.01);
                const end=cylinder(this.item,.15,.15,.02,face*.56,.4,0,cream,16);end.rotation.z=Math.PI/2;
                box(this.item,.02,.18,.05,face*.57,.4,0,green,.01);
                box(this.item,.02,.05,.18,face*.57,.4,0,green,.01);
            }
        }
        // Work lamp: a stand beside the display with a shade hanging over it.
        this.lamp.name='supply-lamp';
        const standX=-.9,standZ=-.55;
        cylinder(this.lamp,.2,.24,.06,standX,.15,standZ,dark,12);
        cylinder(this.lamp,.03,.03,2.8,standX,1.55,standZ,dark,6);
        const arm=box(this.lamp,Math.hypot(standX,standZ)+.1,.05,.05,standX/2,2.93,standZ/2,dark,.02);
        arm.rotation.y=Math.atan2(standZ,-standX);
        const shade=cylinder(this.lamp,.1,.34,.3,LAMP_HEAD.x,LAMP_HEAD.y+.12,LAMP_HEAD.z,dark,14);shade.name='supply-lamp-shade';
        this.root.add(this.lamp);
        lightFromLamp(this.item,.6);batchRigidMeshes(this.lamp);
        // The bulb, its cone of light and the pool it throws: the only glowing parts.
        this.bulb=new THREE.MeshBasicMaterial({color:LAMP_COLOR,toneMapped:false});
        const bulb=new THREE.Mesh(new THREE.SphereGeometry(.09,10,8),this.bulb);bulb.position.copy(LAMP_HEAD);this.root.add(bulb);
        const cone=new THREE.Mesh(new THREE.CylinderGeometry(.3,1.05,LAMP_HEAD.y,20,1,true),this.glowMaterial(.075,false));
        cone.position.set(0,LAMP_HEAD.y/2,0);cone.name='supply-lamp-cone';cone.raycast=()=>{};this.root.add(cone);
        const pool=new THREE.Mesh(new THREE.CircleGeometry(1.35,28),this.glowMaterial(.3,true));
        pool.rotation.x=-Math.PI/2;pool.position.y=.13;pool.name='supply-lamp-pool';pool.raycast=()=>{};this.root.add(pool);
        this.root.name='pickup-'+kind;scene.add(this.root);
    }
    /** Additive warm light: a soft-edged cone, or a floor pool fading from the center. */
    private glowMaterial(opacity:number,pool:boolean):THREE.MeshBasicMaterial {
        const material=new THREE.MeshBasicMaterial({color:LAMP_COLOR,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending,
            side:pool?THREE.FrontSide:THREE.DoubleSide,toneMapped:false});
        material.onBeforeCompile=shader=>{
            shader.vertexShader='varying vec2 vLampUv;\n'+shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvLampUv=uv;');
            shader.fragmentShader='varying vec2 vLampUv;\n'+shader.fragmentShader.replace('#include <opaque_fragment>',pool
                ?'#include <opaque_fragment>\ngl_FragColor.a*=pow(max(0.,1.-length(vLampUv-.5)*2.),1.6);'
                :'#include <opaque_fragment>\ngl_FragColor.a*=smoothstep(0.,.35,vLampUv.y)*(.35+.65*vLampUv.y);');
        };
        material.customProgramCacheKey=()=>pool?'supply-lamp-pool':'supply-lamp-cone';
        this.glow.push(material);
        return material;
    }
    /** A kit that moves (Malpractice) hops there instead of teleporting. */
    setPosition(x:number,y:number,z:number):void {
        this.to.set(x,y-.7,z);
        if(!this.placed){this.placed=true;this.root.position.copy(this.to);return;}
        if(this.root.position.distanceToSquared(this.to)>.25&&!(performance.now()-this.hopAt<HOP_MS)){this.from.copy(this.root.position);this.hopAt=performance.now();}
        else if(!(performance.now()-this.hopAt<HOP_MS))this.root.position.copy(this.to);
    }
    /** Malpractice: kits fidget, ready to bolt. */
    setNervous(on:boolean):void {this.nervous=on;}
    setAvailableAt(at:number):void {this.availableAt=at;}
    /** A Quick Fix kit that can be claimed right now (for the last-hit-point beacons). */
    readyQuickFix(now:number):boolean {return this.kind==='quick-fix'&&now>=this.availableAt&&!this.pending;}
    setPending(pending:boolean):void {this.pending=pending;}
    /** Juice T2: at your last hit point, Quick Fix kits show a green outline through walls. */
    private xray?:THREE.Mesh;
    private xrayOn=false;
    setXray(on:boolean):void {
        if(this.kind!=='quick-fix')return;
        this.xrayOn=on;
        if(on&&!this.xray){
            const material=new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending,
                vertexShader:`varying vec3 n;varying vec3 eye;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);eye=-p.xyz;gl_Position=projectionMatrix*p;}`,
                fragmentShader:`varying vec3 n;varying vec3 eye;void main(){float rim=1.-abs(dot(normalize(n),normalize(eye)));gl_FragColor=vec4(.2,1.,.45,smoothstep(.3,.85,rim)*1.2);}`});
            this.xray=new THREE.Mesh(new RoundedBoxGeometry(1.35,1.05,.9,2,.12),material);
            this.xray.position.y=.6;this.xray.renderOrder=2000;this.xray.raycast=()=>{};this.root.add(this.xray);
        }
    }

    update(now:number,camera?:THREE.Camera):void {
        const unavailable=now<this.availableAt,empty=unavailable||this.pending;
        this.item.visible=!empty;
        if(this.xray)this.xray.visible=this.xrayOn&&!empty;
        // The lamp is out while the site restocks; on a claim it stutters out, and it snaps back on with the supply.
        const dt=this.lastUpdate?Math.min(.1,(now-this.lastUpdate)/1000):0;this.lastUpdate=now;
        // Only a claim (not a site first seen already restocking) stutters.
        if(empty&&!this.wasEmpty&&this.lit===1)this.flicker=.42;
        this.wasEmpty=empty;
        this.flicker=Math.max(0,this.flicker-dt);
        const lit=empty?(this.flicker>0&&Math.floor(this.flicker*16)%2===0?1:0):1;
        if(lit!==this.lit){
            this.lit=lit;
            this.bulb.color.setHex(lit?LAMP_COLOR:0x2a2320);
            for(const material of this.glow)material.visible=!!lit;
        }
        if(unavailable&&camera){
            if(!this.restock){this.restock=new PickupRespawnVisual(this.kind);this.root.add(this.restock.root);}
            this.restock.update(now,this.availableAt,camera);
        }
        if(this.restock)this.restock.root.visible=unavailable;
        const hop=(performance.now()-this.hopAt)/HOP_MS;
        if(hop>=0&&hop<1){
            this.root.position.lerpVectors(this.from,this.to,hop);this.root.position.y+=Math.sin(hop*Math.PI)*HOP_HEIGHT;
            this.item.scale.set(1+Math.sin(hop*Math.PI)*.12,1-Math.sin(hop*Math.PI)*.1,1+Math.sin(hop*Math.PI)*.12);
        }else if(hop>=1&&this.hopAt>-Infinity){this.root.position.copy(this.to);this.item.scale.setScalar(1);this.hopAt=-Infinity;}
        this.item.rotation.set(this.nervous&&!empty?Math.sin(now*.05)*.06:0,this.nervous&&!empty?Math.sin(now*.031)*.12:0,this.nervous&&!empty?Math.cos(now*.043)*.05:0);
    }
    dispose():void {this.restock?.dispose();this.root.removeFromParent();disposeMeshResources(this.root);}
}

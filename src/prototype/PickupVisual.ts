import * as THREE from 'three';
import {metalReflection} from '../utils/metalReflection';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {disposeMeshResources} from '../utils/disposeMeshResources';
import {batchRigidMeshes} from '../utils/RigidMeshBatch';
import {PickupRespawnVisual} from './PickupRespawnVisual';
import {TRAP_SCALE,TRAP_TALL,type PickupKind} from '../shared/pickups';
import {PartKit,mousetrap,rayGun,revolver,revolverCylinder,tommyGun,weaponFinish,type WeaponFinish} from '../utils/WeaponModel';
import {kickDust} from '../feel/Dust';
import {supplyCue} from '../feel/supplyCues';
import {freezeStatic} from '../utils/freezeStatic';

/** Warm tungsten from each supply's own lamp. */
const LAMP_COLOR=0xffd9a0;
/** Lamp head over the display, relative to the site floor. */
const LAMP_HEAD=new THREE.Vector3(0,2.75,0);
/** Malpractice hop duration (ms) and height. */
const HOP_MS=380, HOP_HEIGHT=1.5;
/** Each supply's own colour for the far beam and the outline that finds it from across the street. */
const KIND_COLOR:Record<PickupKind,number>={ironclad:0xc9dcf0,hustle:0xff4a32,'quick-fix':0x5dff95,stakeout:0x6fe2f4,'tommy-gun':0xff8a24,laser:0xc8ff3a,mousetrap:0xf2e6c8,persuader:0xffc94a};
/** Claim pop and restock drop (seconds); beacon fades in with distance (units). */
const POP=.32, DROP=.5, BEAM_HEIGHT=34;
/** Part shapes built once and shared by every display: the welcome builds two dozen displays of up
 * to fifty parts each, and rounding every box again was the largest share of that frame. A display's
 * dispose may release a shared shape's buffers; the next draw simply uploads them again. */
const PARTS=new Map<string,THREE.BufferGeometry>();
function part(key:string,make:()=>THREE.BufferGeometry):THREE.BufferGeometry {
    let geometry=PARTS.get(key);
    if(!geometry){geometry=make();PARTS.set(key,geometry);}
    return geometry;
}

/** Where a frame puts a model: at `x,y,z`, rolled `rz`, pitched `rx`, then turned `ry` (YXZ), scaled by `s`. */
function place(kit:PartKit,x:number,y:number,z:number,rx:number,ry:number,rz:number,s=1):void {
    kit.frame.compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz,'YXZ')),new THREE.Vector3(s,s,s));
}
/** A violin case's outline, lying along x (the neck toward +x). */
function violinCase():THREE.Shape {
    const s=new THREE.Shape();s.moveTo(.8,.11);s.lineTo(.36,.13);
    s.quadraticCurveTo(.3,.27,.12,.28);s.quadraticCurveTo(-.06,.28,-.12,.22);s.quadraticCurveTo(-.2,.37,-.42,.37);s.quadraticCurveTo(-.79,.36,-.79,0);
    s.quadraticCurveTo(-.79,-.36,-.42,-.37);s.quadraticCurveTo(-.2,-.37,-.12,-.22);s.quadraticCurveTo(-.06,-.28,.12,-.28);s.quadraticCurveTo(.3,-.27,.36,-.13);
    s.lineTo(.8,-.11);s.closePath();return s;
}
/** The four weapon displays, built on the shared weapon models: a Tommy Gun resting in an open violin case, a ray
 * gun on a brass cradle, the Persuader on an evidence box, and a set Mousetrap. Each starts with a polished part: the batch takes its reflection. */
function weaponDisplay(kind:'tommy-gun'|'laser'|'mousetrap'|'persuader',kit:PartKit,f:WeaponFinish):void {
    const flat=(depth:number)=>new THREE.ExtrudeGeometry(violinCase(),{depth,bevelEnabled:true,bevelThickness:.02,bevelSize:.02,bevelSegments:2,curveSegments:10});
    if(kind==='tommy-gun'){
        // The gun rests in the case on its stock, barrel raised, in profile: drum, grips and finned barrel read at range.
        place(kit,-.08,.7,.02,-.22,Math.PI/2,0);tommyGun(kit,f);
        kit.frame.identity();
        kit.add(flat(.2),f.leather,0,.12,0,-Math.PI/2);
        kit.add(flat(.02),f.velvet,0,.33,0,-Math.PI/2,0,0,.96,.96,1);
        for(const x of [-.5,.1])kit.box(.1,.08,.05,x,.26,.39,f.brass,.015);
        // The lid, open on its hinge along the back edge, velvet inside.
        const hinge=new THREE.Matrix4().makeTranslation(0,.34,-.37).multiply(new THREE.Matrix4().makeRotationX(1.2)).multiply(new THREE.Matrix4().makeTranslation(0,-.34,.37));
        kit.frame.copy(hinge);
        kit.add(flat(.07),f.leather,0,.34,-.74,-Math.PI/2);
        kit.add(flat(.02),f.velvet,0,.43,-.74,-Math.PI/2,0,0,.94,.94,1);
        kit.frame.identity();
    }else if(kind==='laser'){
        place(kit,0,.86,0,-.3,Math.PI/2,0,1.35);
        rayGun(kit,f);
        kit.frame.identity();
        // A turned stand with a brass post and cradle.
        kit.cylinder(.3,.36,.12,0,.18,0,f.walnut,20);
        kit.cylinder(.12,.16,.06,0,.27,0,f.brass,16);
        kit.cylinder(.03,.03,.44,0,.5,0,f.brass,8);
        for(const x of [-.26,.24]){kit.box(.04,.2,.18,x,.72,0,f.brass,.015);kit.box(.04,.04,.2,x,.63,0,f.brass,.015);}
        kit.box(.56,.04,.06,0,.62,0,f.brass,.015);
    }else if(kind==='persuader'){
        // The revolver, big, standing on its grip on an evidence box (walnut, a velvet top, brass trim, a tag): its side to the street.
        place(kit,.05,.68,0,0,Math.PI/2,.12,1.7);revolver(kit,f);revolverCylinder(kit,f);
        kit.frame.identity();
        kit.box(.95,.24,.62,0,.12,0,f.walnut,.04);
        kit.box(.88,.03,.56,0,.255,0,f.velvet,.01);
        for(const z of [-.31,.31])kit.box(.97,.05,.04,0,.25,z,f.brass,.012);
        kit.box(.18,.12,.012,.42,.18,.33,f.pine,.008,0,0,.3);
    }else{
        kit.box(.3,.16,.02,.42,.24,.62,f.brass,.01,-.3,.5);
        // The set trap a little bigger and taller than it once was, in the placed trap's proportions.
        place(kit,0,.12,0,0,.35,0,.66);kit.frame.scale(new THREE.Vector3(1,TRAP_TALL/TRAP_SCALE,1));mousetrap(()=>kit,f);
        kit.frame.identity();
    }
}

/** The display is lit by its own lamp, not by self-glow: surfaces facing up toward
 * the shade catch warm light and the sides fall off into the dark. Chained after
 * the batch's own palette so the per-part colors stay exact. */
function lightFromLamp(root:THREE.Group,strength:number,share:string):THREE.SkinnedMesh|undefined {
    const batch=batchRigidMeshes(root,share);
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
    return batch;
}

/** Supplies as noir evidence displays: an iron-plated trench coat on a tailor's
 * dummy, a doctor's bag, winged red wingtips on a shoeshine box and a brass
 * magnifying glass on a turned stand, each under a
 * work lamp that throws a cone and a pool of light. Never lost in the dark: the
 * props ignore fog, and from a distance a coloured beam rises from the site and an
 * outline picks out the prop, like the far-rat edge. They turn slowly on the
 * plinth, pop when claimed, and drop back in when the lamp clicks on again. */
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
    private readonly beam:THREE.MeshBasicMaterial;
    private readonly beamMesh:THREE.Mesh;
    private rim?:THREE.MeshBasicMaterial;
    private rimShell?:THREE.SkinnedMesh;
    private readonly rimReach={value:0};
    private readonly burst:THREE.MeshBasicMaterial;
    private readonly burstMesh:THREE.Mesh;
    /** Seconds since the claim pop / restock drop began (Infinity when idle). */
    private popAge=Infinity;
    private dropAge=Infinity;
    private spin=Math.random()*Math.PI*2;
    private readonly phase=Math.random()*10;
    private restock?:PickupRespawnVisual;
    /** No claim pop is playing, so a site whose next pickup was rolled can be rebuilt without cutting it short. */
    get settled():boolean {return this.popAge>=POP;}
    constructor(scene:THREE.Scene,readonly kind:PickupKind){
        const iron=new THREE.MeshStandardMaterial({color:0x5d656f,metalness:.9,roughness:.36});
        const rivet=new THREE.MeshStandardMaterial({color:0x2d2b2e,metalness:.9,roughness:.4});
        const dark=new THREE.MeshStandardMaterial({color:0x1d191c,metalness:.35,roughness:.62});
        const wood=new THREE.MeshStandardMaterial({color:0x5a3a24,metalness:.05,roughness:.7});
        const brass=new THREE.MeshStandardMaterial({color:0xb38a3e,metalness:.85,roughness:.3});
        for(const material of [iron,rivet,brass]){material.envMap=metalReflection();material.envMapIntensity=.65;}
        const box=(parent:THREE.Group,w:number,h:number,d:number,x:number,y:number,z:number,material:THREE.Material,r=.04)=>{
            const radius=Math.min(r,w/2,h/2,d/2),mesh=new THREE.Mesh(part(`b${w},${h},${d},${radius}`,()=>new RoundedBoxGeometry(w,h,d,2,radius)),material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
        };
        const cylinder=(parent:THREE.Group,top:number,bottom:number,h:number,x:number,y:number,z:number,material:THREE.Material,segments=12)=>{
            const mesh=new THREE.Mesh(part(`c${top},${bottom},${h},${segments}`,()=>new THREE.CylinderGeometry(top,bottom,h,segments)),material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
        };
        // Low evidence plinth, in its own copy of the lamp's finish: the lamp batch draws `dark` skinned, and one
        // material drawn both skinned and unskinned makes three re-select its program on every draw.
        cylinder(this.root,.78,.84,.12,0,.06,0,dark.clone(),20);
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
            const red=new THREE.MeshStandardMaterial({color:0xc01a10,metalness:.3,roughness:.26});
            const cream=new THREE.MeshStandardMaterial({color:0xefe6cf,metalness:.05,roughness:.5});
            red.envMap=metalReflection();red.envMapIntensity=.9;
            // A shoeshine box with a brass footrest, and a pair of winged red wingtips on top.
            box(this.item,1.05,.42,.8,0,.21,0,wood,.05);
            box(this.item,.9,.05,.6,0,.44,0,brass,.02);
            for(const sign of [-1,1]){
                const shoe=new THREE.Group();shoe.position.set(sign*.25,.47,0);shoe.rotation.y=sign*-.12;shoe.scale.setScalar(1.25);this.item.add(shoe);
                box(shoe,.3,.08,.7,0,.04,0,dark,.03);
                box(shoe,.28,.18,.66,0,.16,.02,red,.07);
                box(shoe,.27,.28,.3,0,.25,-.17,red,.06);
                box(shoe,.25,.04,.17,0,.41,-.17,dark,.02);
                box(shoe,.25,.025,.12,0,.26,.26,dark,.01);
                for(const z of [-.05,.03,.11]){const lace=box(shoe,.18,.02,.025,0,.29,z,brass,.01);lace.rotation.y=z*1.2;}
                // Mercury's wings on the heel: speed, at a glance.
                for(const [i,length] of [[0,.34],[1,.27],[2,.2]] as const){
                    const feather=box(shoe,.03,.07,length,sign*.17,.33-i*.07,-.3,cream,.02);feather.rotation.set(.5+i*.12,sign*.35,0);
                }
            }
        }else if(kind==='stakeout'){
            this.item.name='brass-magnifying-glass';
            const handleWood=new THREE.MeshStandardMaterial({color:0x3b2416,metalness:.1,roughness:.38});
            // Pale glass lit a touch from within so the disc reads in the dark; the glints catch the lamp.
            const glass=new THREE.MeshStandardMaterial({color:0xc4cfc4,emissive:0x3d3a2a,emissiveIntensity:.4,metalness:.2,roughness:.06});
            const glint=new THREE.MeshStandardMaterial({color:0xfff4d6,emissive:0xfff1c8,emissiveIntensity:.9,metalness:0,roughness:.2});
            // A turned wooden stand with a brass collar holding the glass up, leaning like it was just set down.
            cylinder(this.item,.26,.34,.14,0,.07,0,wood,16);
            cylinder(this.item,.09,.11,.1,0,.19,0,brass,10);
            const lens=new THREE.Group();lens.position.y=.2;lens.rotation.set(-.12,0,.2);this.item.add(lens);
            cylinder(lens,.07,.08,.62,0,.31,0,handleWood,10);
            cylinder(lens,.09,.09,.08,0,.66,0,brass,10);
            cylinder(lens,.05,.05,.12,0,.75,0,brass,8);
            const rim=new THREE.Mesh(part('t.44,.065',()=>new THREE.TorusGeometry(.44,.065,8,32)),brass);rim.position.y=1.24;lens.add(rim);
            const disc=cylinder(lens,.42,.42,.04,0,1.24,0,glass,32);disc.rotation.x=Math.PI/2;
            // A curved streak and a dot of light on both faces: a lens glinting, not a lamp.
            for(const face of [-1,1]){
                const streak=box(lens,.05,.26,.02,-.19,1.37,face*.025,glint,.01);streak.rotation.z=.62;
                box(lens,.05,.05,.02,-.06,1.47,face*.025,glint,.01);
            }
        }else if(kind==='tommy-gun'||kind==='laser'||kind==='mousetrap'||kind==='persuader'){
            this.item.name={'tommy-gun':'tommy-gun-violin-case',laser:'ray-gun-cradle',mousetrap:'set-mousetrap',persuader:'persuader-evidence-box'}[kind];
            const kit=new PartKit();weaponDisplay(kind,kit,weaponFinish());
            this.item.add(kit.build(this.item.name));
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
        // Readable through the noir fog at any distance.
        this.root.traverse(object=>{if(object instanceof THREE.Mesh)for(const m of [object.material].flat())m.fog=false;});
        const batch=lightFromLamp(this.item,.6,'supply-'+kind);batchRigidMeshes(this.lamp,'supply-lamp');
        if(batch)this.addRim(batch);
        // The bulb, its cone of light and the pool it throws: the only glowing parts.
        this.bulb=new THREE.MeshBasicMaterial({color:LAMP_COLOR,toneMapped:false});
        const bulb=new THREE.Mesh(new THREE.SphereGeometry(.09,10,8),this.bulb);bulb.position.copy(LAMP_HEAD);this.root.add(bulb);
        const cone=new THREE.Mesh(new THREE.CylinderGeometry(.3,1.15,LAMP_HEAD.y,20,1,true),this.glowMaterial(.15,false));
        cone.position.set(0,LAMP_HEAD.y/2,0);cone.name='supply-lamp-cone';cone.raycast=()=>{};this.root.add(cone);
        const pool=new THREE.Mesh(new THREE.CircleGeometry(1.5,28),this.glowMaterial(.5,true));
        pool.rotation.x=-Math.PI/2;pool.position.y=.13;pool.name='supply-lamp-pool';pool.raycast=()=>{};this.root.add(pool);
        // The far beacon: a soft coloured shaft rising from the site, faded in with distance.
        this.beam=new THREE.MeshBasicMaterial({color:KIND_COLOR[kind],transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,
            side:THREE.DoubleSide,forceSinglePass:true,fog:false,toneMapped:false});
        this.beam.onBeforeCompile=shader=>{
            shader.vertexShader='varying float vBeamV;\n'+shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvBeamV=uv.y;');
            shader.fragmentShader='varying float vBeamV;\n'+shader.fragmentShader.replace('#include <opaque_fragment>','#include <opaque_fragment>\ngl_FragColor.a*=pow(1.-vBeamV,1.4)*smoothstep(0.,.04,vBeamV);');
        };
        this.beam.customProgramCacheKey=()=>'supply-beacon-beam';
        this.beamMesh=new THREE.Mesh(new THREE.CylinderGeometry(.45,.7,BEAM_HEIGHT,16,1,true),this.beam);
        this.beamMesh.position.y=BEAM_HEIGHT/2+.1;this.beamMesh.name='supply-beacon';this.beamMesh.raycast=()=>{};this.root.add(this.beamMesh);
        // Claim and restock flash: a burst of the supply's colour.
        this.burst=new THREE.MeshBasicMaterial({color:KIND_COLOR[kind],transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,toneMapped:false});
        this.burstMesh=new THREE.Mesh(new THREE.SphereGeometry(.6,16,12),this.burst);this.burstMesh.position.y=.9;this.burstMesh.raycast=()=>{};
        // Left visible until the first update, so the title warm-up compiles its program.
        this.root.add(this.burstMesh);
        this.root.name='pickup-'+kind;scene.add(this.root);
        // Only the display turns, lifts and squashes: every other part is composed once, and the
        // site itself (placement, Malpractice hops) and the claim burst compose when they change.
        freezeStatic(this.root,[this.item]);
    }
    /** A kind-coloured outline shell on the prop, sharing the batch's geometry and bones. */
    private addRim(batch:THREE.SkinnedMesh):void {
        this.rim=new THREE.MeshBasicMaterial({color:KIND_COLOR[this.kind],transparent:true,opacity:0,side:THREE.BackSide,depthWrite:false,fog:false,toneMapped:false});
        this.rim.onBeforeCompile=shader=>{
            shader.uniforms.rimReach=this.rimReach;
            shader.vertexShader='uniform float rimReach;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed+=normal*rimReach;');
        };
        this.rim.customProgramCacheKey=()=>'supply-rim';
        // Culled with the batch's conservative bound: an uncullable shell drew every kit's
        // thousands of skinned triangles each frame from anywhere in the city.
        const shell=new THREE.SkinnedMesh(batch.geometry,this.rim);shell.bind(batch.skeleton,batch.bindMatrix);shell.boundingSphere=batch.boundingSphere;
        shell.raycast=()=>{};shell.name='supply-rim';this.item.add(shell);this.rimShell=shell;
    }
    /** Additive warm light: a soft-edged cone, or a floor pool fading from the center. */
    private glowMaterial(opacity:number,pool:boolean):THREE.MeshBasicMaterial {
        const material=new THREE.MeshBasicMaterial({color:LAMP_COLOR,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending,
            side:pool?THREE.FrontSide:THREE.DoubleSide,forceSinglePass:true,toneMapped:false});
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
        if(!this.placed){this.placed=true;this.root.position.copy(this.to);this.root.updateMatrix();return;}
        if(this.root.position.distanceToSquared(this.to)>.25&&!(performance.now()-this.hopAt<HOP_MS)){this.from.copy(this.root.position);this.hopAt=performance.now();}
        else if(!(performance.now()-this.hopAt<HOP_MS)&&!this.root.position.equals(this.to)){this.root.position.copy(this.to);this.root.updateMatrix();}
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
            this.xray.position.y=.6;this.xray.renderOrder=2000;this.xray.raycast=()=>{};freezeStatic(this.xray);this.root.add(this.xray);
        }
    }

    update(now:number,camera?:THREE.Camera):void {
        const unavailable=now<this.availableAt,empty=unavailable||this.pending;
        const dt=this.lastUpdate?Math.min(.1,(now-this.lastUpdate)/1000):0;this.lastUpdate=now;
        const world=this.root.position;
        // Claim: the lamp stutters out, the prop pops up and vanishes in a flash. Restock: the
        // lamp clicks on and the prop drops back onto the plinth. A site first seen empty does neither.
        if(this.lastUpdate&&dt>0){
            if(empty&&!this.wasEmpty&&this.lit===1){this.flicker=.42;this.popAge=0;this.flashBurst();supplyCue(this.root,'claim',{x:world.x,y:world.y+1,z:world.z});}
            if(!empty&&this.wasEmpty&&this.lit===0){this.dropAge=0;this.flashBurst();supplyCue(this.root,'restock',{x:world.x,y:world.y+1,z:world.z});}
        }
        this.wasEmpty=empty;
        this.popAge+=dt;this.dropAge+=dt;
        this.item.visible=!empty||this.popAge<POP;
        if(this.xray)this.xray.visible=this.xrayOn&&!empty;
        this.flicker=Math.max(0,this.flicker-dt);
        const lit=empty?(this.flicker>0&&Math.floor(this.flicker*16)%2===0?1:0):1;
        if(lit!==this.lit){
            this.lit=lit;
            this.bulb.color.setHex(lit?LAMP_COLOR:0x2a2320);
            for(const material of this.glow)material.visible=!!lit;
        }
        // A slow breath in the lamp light keeps a site alive from across the street.
        const breath=1+Math.sin(now*.0021+this.phase)*.12+Math.max(0,Math.sin(now*.0009+this.phase*3))**24*.5;
        this.glow[0]!.opacity=.15*breath;this.glow[1]!.opacity=.5*breath;
        if(camera){
            const distance=camera.position.distanceTo(world);
            const far=THREE.MathUtils.smoothstep(distance,10,40),edge=THREE.MathUtils.smoothstep(distance,6,22);
            // Transparent layers still draw (and fill) at zero opacity: hide them instead.
            this.beam.opacity=empty?0:.3*far*breath;this.beamMesh.visible=this.beam.opacity>0;
            if(this.rim&&this.rimShell){this.rim.opacity=empty?0:.85*edge;this.rimShell.visible=this.rim.opacity>0;this.rimReach.value=.025+Math.min(.22,distance*.0035);}
        }
        if(unavailable&&camera){
            if(!this.restock){this.restock=new PickupRespawnVisual(this.kind);this.root.add(this.restock.root);}
            this.restock.update(now,this.availableAt,camera);
        }
        if(this.restock)this.restock.root.visible=unavailable;
        const burst=this.popAge<this.dropAge?this.popAge:this.dropAge;
        this.burstMesh.visible=burst<.35;
        if(this.burstMesh.visible){this.burstMesh.scale.setScalar(.4+burst*6);this.burstMesh.updateMatrix();this.burst.opacity=.7*(1-burst/.35);}
        const hop=(performance.now()-this.hopAt)/HOP_MS;
        if(hop>=0&&hop<1){
            this.root.position.lerpVectors(this.from,this.to,hop);this.root.position.y+=Math.sin(hop*Math.PI)*HOP_HEIGHT;this.root.updateMatrix();
        }else if(hop>=1&&this.hopAt>-Infinity){this.root.position.copy(this.to);this.root.updateMatrix();this.hopAt=-Infinity;}
        // Scale and height: claim pop, restock drop with a bounce, Malpractice hop squash, or rest.
        let lift=0,scale=1,squash=0;
        if(this.popAge<POP){const t=this.popAge/POP;lift=Math.sin(t*Math.PI*.5)*.8;scale=t<.35?1+t*.9:Math.max(0,1.3*(1-(t-.35)/.65));}
        else if(this.dropAge<DROP){const t=this.dropAge/DROP;lift=t<.6?(1-t/.6)**2*2.4:Math.abs(Math.sin((t-.6)/.4*Math.PI))*.18*(1-t);squash=t>.58&&t<.72?.18:0;}
        if(hop>=0&&hop<1)squash=-Math.sin(hop*Math.PI)*.1;
        this.item.position.y=lift;
        this.item.scale.set(scale*(1+squash*.6),scale*(1-squash),scale*(1+squash*.6));
        // A slow turn on the plinth; Malpractice kits fidget instead.
        this.spin+=dt*.45;
        const fidget=this.nervous&&!empty;
        this.item.rotation.set(fidget?Math.sin(now*.05)*.06:0,fidget?Math.sin(now*.031)*.12:this.spin,fidget?Math.cos(now*.043)*.05:0);
    }
    /** An exhibit replay starting its clip again: the prop stays built, but forgets what it last showed, as a new one. */
    restart():void {
        this.availableAt=0;this.pending=false;this.nervous=false;this.lit=-1;this.flicker=0;this.lastUpdate=0;this.wasEmpty=true;
        this.hopAt=-Infinity;this.placed=false;this.popAge=this.dropAge=Infinity;this.burstMesh.visible=false;
    }
    /** A burst of the supply's colour and a puff of dust at the plinth. */
    private flashBurst():void {
        this.burst.opacity=.7;
        kickDust(this.root,this.root.position,.5);
    }
    dispose():void {this.restock?.dispose();this.root.removeFromParent();disposeMeshResources(this.root);}
}

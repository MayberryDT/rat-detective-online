import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {TRAP_SCALE,TRAP_TALL,type WeaponKind} from '../shared/pickups';
import {MUZZLE_REACH} from '../shared/rat/ratBody';
import {metalReflection} from '../utils/metalReflection';

/** The arsenal's finishes. Brass, cheese, pine and the laser's coil carry a little light of their own so a weapon
 * reads across a street at night: emissive surfaces only, never a light. */
export interface WeaponFinish {
    steel:THREE.MeshStandardMaterial; walnut:THREE.MeshStandardMaterial; brass:THREE.MeshStandardMaterial; cheese:THREE.MeshStandardMaterial;
    rind:THREE.MeshStandardMaterial; leather:THREE.MeshStandardMaterial; velvet:THREE.MeshStandardMaterial; chrome:THREE.MeshStandardMaterial;
    fin:THREE.MeshStandardMaterial; bakelite:THREE.MeshStandardMaterial; coil:THREE.MeshStandardMaterial; core:THREE.MeshStandardMaterial;
    pine:THREE.MeshStandardMaterial; grain:THREE.MeshStandardMaterial; crack:THREE.MeshStandardMaterial;
}
const finish=(color:number,roughness:number,metalness=0,glow=0,emissive=color):THREE.MeshStandardMaterial=>{
    const material=new THREE.MeshStandardMaterial({color,roughness,metalness,emissive,emissiveIntensity:glow,fog:false});
    if(metalness>.5){material.envMap=metalReflection();material.envMapIntensity=.8;}
    return material;
};
/** A fresh set of finishes; whoever builds with it owns (and disposes) them. */
export function weaponFinish():WeaponFinish {
    return {
        steel:finish(0x353a44,.36,.82,.35,0x161a22),walnut:finish(0x8a4a24,.5,.05,.35,0x3a1a08),
        brass:finish(0xd29a3a,.28,.85,.7,0x8a5a14),cheese:finish(0xf2b92c,.55,0,.55,0xb07400),rind:finish(0xb47a12,.6,0,.3),
        leather:finish(0x2e1c15,.62,.1,.3,0x140a06),velvet:finish(0x701422,.92,0,.25,0x2c040c),chrome:finish(0xc9d2dc,.18,.92,.25,0x40464e),
        fin:finish(0xd0301f,.35,.2,.45,0x5c0c04),bakelite:finish(0x2a1d18,.4,.1,.25,0x100804),
        coil:finish(0x84dc1c,.3,0,1.4,0x5cbc10),core:finish(0xffd23c,.22,0,1.5,0xe8a000),
        pine:finish(0xe6bb78,.66,0,.7,0x7a5018),grain:finish(0xa47038,.72,0,.42,0x3a2208),crack:finish(0x1c120a,.9,0,0),
    };
}

/** Collects a model's parts and merges them into one mesh per finish: a whole weapon in a handful of draws. */
export class PartKit {
    /** Applied to every part added: places a whole model inside a bigger one. */
    readonly frame=new THREE.Matrix4();
    private readonly parts=new Map<THREE.Material,THREE.BufferGeometry[]>();
    private readonly local=new THREE.Matrix4();
    private readonly euler=new THREE.Euler();
    private readonly rotation=new THREE.Quaternion();
    private readonly at=new THREE.Vector3();
    private readonly size=new THREE.Vector3();
    add(geometry:THREE.BufferGeometry,material:THREE.Material,x:number,y:number,z:number,rx=0,ry=0,rz=0,sx=1,sy=1,sz=1):void {
        const plain=geometry.index?geometry.toNonIndexed():geometry;
        if(plain!==geometry)geometry.dispose();
        plain.clearGroups();
        plain.applyMatrix4(this.local.compose(this.at.set(x,y,z),this.rotation.setFromEuler(this.euler.set(rx,ry,rz)),this.size.set(sx,sy,sz)).premultiply(this.frame));
        let list=this.parts.get(material);
        if(!list){list=[];this.parts.set(material,list);}
        list.push(plain);
    }
    box(w:number,h:number,d:number,x:number,y:number,z:number,material:THREE.Material,r=.02,rx=0,ry=0,rz=0):void {
        this.add(new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/2,h/2,d/2)),material,x,y,z,rx,ry,rz);
    }
    /** A cylinder along y (rotate to lay it down). */
    cylinder(top:number,bottom:number,h:number,x:number,y:number,z:number,material:THREE.Material,segments=12,rx=0,ry=0,rz=0):void {
        this.add(new THREE.CylinderGeometry(top,bottom,h,segments),material,x,y,z,rx,ry,rz);
    }
    /** A ring around z (rotate to turn it). */
    torus(radius:number,tube:number,x:number,y:number,z:number,material:THREE.Material,rx=0,ry=0,rz=0,arc=Math.PI*2):void {
        this.add(new THREE.TorusGeometry(radius,tube,8,20,arc),material,x,y,z,rx,ry,rz);
    }
    sphere(radius:number,x:number,y:number,z:number,material:THREE.Material,sx=1,sy=1,sz=1):void {
        this.add(new THREE.SphereGeometry(radius,14,10),material,x,y,z,0,0,0,sx,sy,sz);
    }
    /** One mesh per finish, named for the model. */
    build(name:string):THREE.Group {
        const group=new THREE.Group();group.name=name;
        for(const [material,list] of this.parts){
            const merged=mergeGeometries(list);for(const part of list)part.dispose();
            if(merged){merged.computeBoundingSphere();group.add(new THREE.Mesh(merged,material));}
        }
        this.parts.clear();
        return group;
    }
}

/** Where a held gun's barrel ends, in the pistol's frame: the muzzle moves there while it is held. */
export const WEAPON_MUZZLE:Readonly<Record<Exclude<WeaponKind,'mousetrap'>,THREE.Vector3>>={
    'tommy-gun':new THREE.Vector3(0,.106,.28+MUZZLE_REACH['tommy-gun']),laser:new THREE.Vector3(0,.106,.28+MUZZLE_REACH.laser),
    persuader:new THREE.Vector3(0,.106,.28+MUZZLE_REACH.persuader),
};
/** Barrel axis height in the pistol's frame (the house pistol's bore). */
const BORE=.106;

/** A drum-fed Thompson in the pistol's frame (the cuff on its grip, +z down the barrel): walnut stock and grips with
 * cheese inlays, a finned barrel with a cheese-wedge front sight, and a whole cheese wheel for a drum (rind band, holes,
 * a slice gone) hanging under it. About 1.45 units long. */
export function tommyGun(kit:PartKit,f:WeaponFinish):void {
    const B=BORE;
    // Receiver, its top rib, rear sight and the brass actuator knob.
    kit.box(.1,.15,.5,0,B,.01,f.steel,.025);
    kit.box(.05,.03,.42,0,B+.085,0,f.steel,.01);
    kit.box(.035,.05,.03,0,B+.11,-.17,f.steel,.008);
    kit.cylinder(.024,.024,.05,0,B+.1,.1,f.brass,10);
    // The finned barrel and the Cutts compensator, its front sight a little wedge of cheese (a three-sided prism, point up).
    kit.cylinder(.034,.034,.48,0,B,.49,f.steel,12,Math.PI/2);
    for(let i=0;i<6;i++)kit.cylinder(.054,.054,.022,0,B,.3+i*.045,f.steel,14,Math.PI/2);
    kit.box(.09,.09,.1,0,B+.005,.76,f.steel,.02);
    kit.cylinder(.045,.045,.03,0,B+.072,.74,f.cheese,3,-Math.PI/2,0,Math.PI/2);
    // Butt stock: a walnut wedge sloping down to a steel butt plate, a cheese wedge inlaid in each side.
    kit.box(.085,.15,.26,0,B-.01,-.35,f.walnut,.03,-.08);
    kit.box(.085,.23,.22,0,B-.06,-.55,f.walnut,.035,-.16);
    kit.box(.095,.26,.03,0,B-.08,-.665,f.steel,.01,-.16);
    for(const side of [-1,1])kit.cylinder(.06,.06,.006,side*.044,B-.06,-.54,f.cheese,3,Math.PI-.16,0,Math.PI/2);
    // Raked pistol grip with a cheese medallion each side, and the trigger guard.
    kit.box(.075,.21,.09,0,-.06,-.07,f.walnut,.03,.3);
    for(const side of [-1,1])kit.cylinder(.022,.022,.006,side*.039,-.07,-.075,f.cheese,12,0,0,Math.PI/2);
    kit.torus(.05,.011,0,B-.11,.0,f.steel,0,Math.PI/2);
    // The drum: a whole cheese wheel on its side with a rind band, holes in its faces, a slice cut out at the front
    // (its cut faces closed) and a brass winding key. Angles are in the face, from +z towards +y.
    const y=B-.21,z=.2,R=.186,H=.124,gap=-.55,cut=.9,start=gap+cut/2,arc=Math.PI*2-cut;
    kit.add(new THREE.CylinderGeometry(R,R,H,26,1,false,start,arc),f.cheese,0,y,z,0,0,Math.PI/2);
    kit.add(new THREE.CylinderGeometry(R+.006,R+.006,H-.004,26,1,true,start,arc),f.rind,0,y,z,0,0,Math.PI/2);
    for(const a of [gap-cut/2,gap+cut/2])kit.box(H,R,.006,0,y+Math.sin(a)*R/2,z+Math.cos(a)*R/2,f.cheese,.002,Math.PI/2-a);
    for(const side of [-1,1]){
        kit.cylinder(.045,.045,.03,side*.072,y,z,f.brass,10,0,0,Math.PI/2);
        for(const [a,r,s] of [[.4,.12,.026],[1.5,.11,.02],[2.5,.125,.03],[3.5,.1,.022],[4.4,.125,.025],[2,.07,.014]] as const)
            kit.cylinder(s,s,.012,side*.06,y+Math.sin(a)*r,z+Math.cos(a)*r,f.rind,8,0,0,Math.PI/2);
    }
    // Vertical foregrip with finger grooves and a cheese cap.
    kit.box(.07,.25,.085,0,B-.16,.56,f.walnut,.03,-.1);
    for(let i=0;i<3;i++)kit.box(.074,.014,.088,0,B-.12-i*.06,.56+.012*(i+1),f.steel,.005,-.1);
    kit.box(.078,.035,.092,0,B-.288,.573,f.cheese,.01,-.1);
}

/** The Persuader in the pistol's frame: a snub-nose revolver, chunky and cartoonish. A steel frame, a short fat barrel
 * with a cheese-wedge front sight, a brass cylinder whose six chambers each show a cheese slug's nose, the hammer
 * cocked back, a walnut grip with cheese medallions, and the trigger guard. About .8 units long; the cylinder is its own
 * part (`persuader-cylinder`) so it can turn a chamber each shot. */
export function revolver(kit:PartKit,f:WeaponFinish):void {
    const B=BORE;
    // Frame and top strap over the cylinder window, the barrel and its under-lug.
    kit.box(.09,.13,.3,0,B-.01,.16,f.steel,.025);
    kit.box(.06,.03,.24,0,B+.075,.25,f.steel,.01);
    kit.cylinder(.042,.042,.3,0,B,.53,f.steel,14,Math.PI/2);
    kit.box(.055,.05,.22,0,B-.05,.55,f.steel,.015);
    kit.cylinder(.05,.05,.03,0,B,.67,f.steel,14,Math.PI/2);
    kit.cylinder(.04,.04,.03,0,B+.06,.62,f.cheese,3,-Math.PI/2,0,Math.PI/2);
    // The hammer, cocked back over the frame, and the rear sight notch.
    kit.box(.04,.1,.05,0,B+.07,-.03,f.steel,.012,-.6);
    kit.box(.05,.025,.04,0,B+.12,-.07,f.steel,.008,-.6);
    // Raked walnut grip with a brass butt and a cheese medallion each side; the trigger and its guard.
    kit.box(.08,.26,.1,0,-.1,-.08,f.walnut,.035,.35);
    kit.box(.086,.04,.105,0,-.23,-.13,f.brass,.012,.35);
    for(const side of [-1,1])kit.cylinder(.026,.026,.006,side*.042,-.09,-.08,f.cheese,12,0,0,Math.PI/2);
    kit.torus(.05,.011,0,B-.11,.08,f.steel,0,Math.PI/2);
    kit.box(.016,.06,.016,0,B-.1,.08,f.steel,.004,.3);
}
export function revolverCylinder(kit:PartKit,f:WeaponFinish):void {
    const B=BORE;
    kit.cylinder(.1,.1,.15,0,B-.005,.24,f.brass,18,Math.PI/2);
    for(let i=0;i<6;i++){
        const a=i*Math.PI/3;
        kit.cylinder(.026,.026,.02,Math.sin(a)*.062,B-.005+Math.cos(a)*.062,.32,f.cheese,10,Math.PI/2);
        kit.box(.012,.04,.14,Math.sin(a+Math.PI/6)*.1,B-.005+Math.cos(a+Math.PI/6)*.1,.24,f.steel,.004,0,0,-(a+Math.PI/6));
    }
}

/** A pulp ray gun in the pistol's frame: a bulbous chrome body with red fins, a molten-cheese dome and a coil of
 * alternating molten-yellow and greasy-green rings round the barrel (the beam's colours) ending in a flared emitter
 * that drips melted cheese. About 1.05 units long. */
export function rayGun(kit:PartKit,f:WeaponFinish):void {
    const B=BORE;
    const body=new THREE.LatheGeometry([[0,-.33],[.05,-.32],[.1,-.26],[.135,-.15],[.142,-.04],[.122,.08],[.08,.18],[.05,.24],[0,.255]].map(([r,z])=>new THREE.Vector2(r,z)),20);
    kit.add(body,f.chrome,0,B,0,Math.PI/2);
    kit.torus(.14,.014,0,B,-.06,f.brass);
    kit.torus(.118,.012,0,B,.09,f.brass);
    // Three swept red fins at the tail and a ball on the end.
    for(const a of [0,2.1,-2.1]){kit.box(.026,.2,.24,Math.sin(a)*.15,B+Math.cos(a)*.15,-.22,f.fin,.012,.35*Math.cos(a),0,-a);}
    kit.sphere(.045,0,B,-.34,f.fin);
    kit.sphere(.065,0,B+.125,-.04,f.core,1,.8,1.2);
    // Barrel, the coil and the emitter dish with its molten core, two drips of cheese hanging off the dish's lip.
    kit.cylinder(.03,.03,.38,0,B,.42,f.chrome,12,Math.PI/2);
    for(let i=0;i<5;i++)kit.torus(.064,.02,0,B,.3+i*.06,i%2?f.coil:f.core);
    kit.cylinder(.105,.035,.1,0,B,.66,f.chrome,18,Math.PI/2);
    kit.cylinder(.08,.08,.014,0,B,.705,f.core,18,Math.PI/2);
    for(const [x,drop] of [[-.035,.06],[.05,.03]] as const){
        kit.sphere(.02,x,B-.1-drop/2,.705,f.core,1,1+drop*18,1);
        kit.sphere(.019,x,B-.105-drop,.705,f.core);
    }
    // Bakelite grip with a red pommel, and the trigger guard.
    kit.box(.075,.22,.09,0,-.05,-.07,f.bakelite,.03,.3);
    kit.sphere(.048,0,-.16,-.105,f.fin);
    kit.torus(.048,.011,0,B-.11,.02,f.chrome,0,Math.PI/2);
}

/** The Mousetrap's moving pieces, so the placed trap can snap, splinter and break apart. */
export const TRAP_PIECES=['boardLeft','boardRight','cornerFront','cornerBack','hinge','springLeft','springRight','bar','arm','bait','crack0','crack1','crack2'] as const;
export type TrapPiece=typeof TRAP_PIECES[number];
/** Each piece's pivot in trap space (floor at y 0, the bait end toward +z). */
export const TRAP_PIVOTS:Readonly<Record<TrapPiece,readonly [number,number,number]>>={
    boardLeft:[-.375,.08,0],boardRight:[.375,.08,0],cornerFront:[-.6,.08,1.1],cornerBack:[.6,.08,-1.1],hinge:[0,.2,0],
    springLeft:[-.42,.2,0],springRight:[.42,.2,0],bar:[0,.2,0],arm:[0,.2,-1.12],bait:[0,.2,.8],crack0:[0,0,0],crack1:[0,0,0],crack2:[0,0,0],
};
/** A giant spring trap in trap space, set: a pale pine board 2.5 long and 1.5 wide, the brass kill bar pulled back
 * over the rear half under the hold-down arm, two coil springs on the hinge and a wedge of cheese on the bait pedal.
 * `kit` gives the kit each piece is built into (one kit for a static copy). */
export function mousetrap(kit:(piece:TrapPiece)=>PartKit,f:WeaponFinish):void {
    const T=.16,top=T+.003;
    // The board, in two halves (it breaks along the grain) with a chip off two corners to lose.
    let k=kit('boardLeft');
    k.box(.75,T,2.2,-.375,T/2,-.15,f.pine,.02);k.box(.45,T,.3,-.225,T/2,1.1,f.pine,.02);
    for(const [x,z,length] of [[-.64,-.2,2.1],[-.47,.35,1.3],[-.3,-.55,1.2],[-.12,.1,2]] as const)k.box(.016,.006,length,x,top,z,f.grain,.003);
    k.box(.34,.006,.16,-.42,top,.62,f.fin,.003);
    k=kit('boardRight');
    k.box(.75,T,2.2,.375,T/2,.15,f.pine,.02);k.box(.45,T,.3,.225,T/2,-1.1,f.pine,.02);
    for(const [x,z,length] of [[.15,.3,2],[.33,-.4,1.4],[.5,.45,1.5],[.66,.1,2.1]] as const)k.box(.016,.006,length,x,top,z,f.grain,.003);
    kit('cornerFront').box(.3,T,.3,-.6,T/2,1.1,f.pine,.02);
    kit('cornerBack').box(.3,T,.3,.6,T/2,-1.1,f.pine,.02);
    // Hinge rod and the brass staples holding it, the arm and the pedal.
    k=kit('hinge');
    k.cylinder(.03,.03,1.44,0,.2,0,f.steel,8,0,0,Math.PI/2);
    for(const x of [-.7,-.2,.2,.7])k.box(.07,.09,.11,x,.19,0,f.brass,.015);
    k.box(.14,.07,.08,0,.19,-1.12,f.brass,.015);
    k.box(.12,.07,.08,0,.19,.55,f.brass,.015);
    // Two coil springs round the hinge, each with a leg on the board.
    for(const side of [-1,1] as const){
        k=kit(side<0?'springLeft':'springRight');
        for(let i=0;i<4;i++)k.torus(.11,.032,side*(.42+(i-1.5)*.075),.2,0,f.brass,0,Math.PI/2);
        k.box(.04,.04,.42,side*.3,.18,.2,f.brass,.015,.12);
    }
    // The kill bar, pulled back over the rear half (it snaps over the hinge onto the front).
    k=kit('bar');
    for(const x of [-.68,.68]){k.cylinder(.042,.042,1.06,x,.2,-.53,f.brass,10,Math.PI/2);k.sphere(.05,x,.2,-1.06,f.brass);}
    k.cylinder(.042,.042,1.36,0,.2,-1.06,f.brass,10,0,0,Math.PI/2);
    // The hold-down arm from its staple over the bar to the catch on the pedal.
    k=kit('arm');
    k.cylinder(.022,.022,1.74,0,.255,-.25,f.steel,6,Math.PI/2);
    k.box(.07,.05,.06,0,.24,.62,f.steel,.012);
    // Bait pedal and a big wedge of cheese, readable from across a street.
    k=kit('bait');
    k.box(.46,.035,.56,0,.18,.8,f.brass,.012);
    const wedge=new THREE.Shape();wedge.moveTo(-.32,0);wedge.lineTo(.32,0);wedge.lineTo(-.32,.38);wedge.closePath();
    k.add(new THREE.ExtrudeGeometry(wedge,{depth:.44,bevelEnabled:true,bevelThickness:.02,bevelSize:.02,bevelSegments:1}),f.cheese,.22,.2,.8,0,-Math.PI/2);
    for(const [z,y,r] of [[.66,.1,.05],[.88,.08,.035],[.72,.17,.03]] as const)for(const x of [-.245,.245])k.cylinder(r,r,.012,x,.2+y,z,f.rind,10,0,0,Math.PI/2);
    // Cracks that open as it is battered.
    kit('crack0').box(.03,.008,.5,.4,top,.75,f.crack,.004,0,.5);
    kit('crack0').box(.03,.008,.35,.52,top,.4,f.crack,.004,0,-.4);
    kit('crack1').box(.03,.008,.6,-.45,top,-.6,f.crack,.004,0,-.35);
    kit('crack1').box(.03,.008,.3,-.3,top,-.92,f.crack,.004,0,.6);
    kit('crack2').box(.03,.008,.7,.05,top,.3,f.crack,.004,0,1.2);
    kit('crack2').box(.03,.008,.4,-.32,top,.18,f.crack,.004,0,-.2);
}

/** A carried Mousetrap: the placed model (its gameplay size, `TRAP_SCALE`/`TRAP_TALL`) at this scale, held across
 * the chest in the rat's coat space. */
const HELD_TRAP_SCALE=.42;
const noRaycast=()=>{};
const HELD=new Map<WeaponKind,THREE.Group>();
let heldFinish:WeaponFinish|undefined;
/** A rat's copy of a held weapon: shared shapes and finishes (never disposed with a rat; detach it first), not
 * pickable. Guns sit in the pistol's frame; the Mousetrap in the chest's. */
export function heldWeaponModel(kind:WeaponKind):THREE.Group {
    let template=HELD.get(kind);
    if(!template){
        const f=heldFinish??=weaponFinish(),kit=new PartKit();
        if(kind==='mousetrap'){
            kit.frame.makeScale(HELD_TRAP_SCALE*TRAP_SCALE,HELD_TRAP_SCALE*TRAP_TALL,HELD_TRAP_SCALE*TRAP_SCALE);mousetrap(()=>kit,f);
            template=kit.build('rat-weapon-mousetrap');template.position.set(0,1.02,.74);template.rotation.set(0,Math.PI/2,.35);
        }else{
            if(kind==='tommy-gun')tommyGun(kit,f);else if(kind==='persuader')revolver(kit,f);else rayGun(kit,f);
            template=kit.build('rat-weapon-'+kind);
        }
        // Separate moving mechanisms. Draw-only animation leaves the canonical muzzle unchanged.
        if(kind==='tommy-gun'){
            const bolt=new PartKit();bolt.box(.13,.12,.28,.11,BORE+.025,.01,f.brass,.02);bolt.box(.23,.055,.055,.2,BORE+.025,-.075,f.steel,.01);
            template.add(bolt.build('tommy-bolt'));
            const feed=new PartKit();feed.box(.10,.13,.16,-.10,BORE-.08,.16,f.cheese,.02);feed.cylinder(.055,.055,.06,-.15,BORE-.13,.18,f.brass,10,0,0,Math.PI/2);template.add(feed.build('tommy-feed'));
        }
        if(kind==='persuader'){const cylinder=new PartKit();revolverCylinder(cylinder,f);template.add(cylinder.build('persuader-cylinder'));}
        if(kind==='laser'){
            for(let i=0;i<3;i++){
                const cell=new PartKit(),angle=i*Math.PI*2/3;
                cell.box(.09,.14,.44,Math.sin(angle)*.22,BORE+Math.cos(angle)*.22,.39,f.coil,.02,0,0,-angle);
                cell.torus(.105,.025,0,BORE,.31+i*.12,f.core);
                template.add(cell.build('laser-cell-'+i));
                const jaw=new PartKit();jaw.box(.10,.16,.18,Math.sin(angle)*.18,BORE+Math.cos(angle)*.18,.65,f.brass,.02,0,0,-angle);template.add(jaw.build('laser-jaw-'+i));
            }
        }
        HELD.set(kind,template);
    }
    const model=template.clone();
    model.traverse(part=>{if(part instanceof THREE.Mesh)part.raycast=noRaycast;});
    return model;
}

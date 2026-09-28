import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {LaunchMachine,LaunchMachineKind} from '../shared/chaosState';

/** Shared machine materials. The red trigger material is per machine (it pulses on its own). */
export interface MachineMaterials {
    iron:THREE.MeshStandardMaterial; steel:THREE.MeshStandardMaterial; brass:THREE.MeshStandardMaterial;
    dark:THREE.MeshStandardMaterial; wood:THREE.MeshStandardMaterial; green:THREE.MeshStandardMaterial;
    yellow:THREE.MeshStandardMaterial; hazard:THREE.MeshStandardMaterial; face:THREE.MeshStandardMaterial;
    glow:THREE.MeshBasicMaterial; outline:THREE.MeshBasicMaterial; cheese:THREE.MeshStandardMaterial;
}

/** One rebuilt launcher. `body` (machine beside the pad) shakes and swells with
 * pressure; `trigger` is its big red target; `parts` are the named moving pieces
 * each machine animates; `seams` are body-local points that leak steam. */
export interface MachineModel {
    machine:LaunchMachine;
    /** At the machine's base, facing the pad (+z toward the pad). */
    base:THREE.Group;
    body:THREE.Group;
    trigger:THREE.Group;
    triggerMaterial:THREE.MeshStandardMaterial;
    /** At the pad centre, turned like `base`. */
    pad:THREE.Group;
    parts:Record<string,THREE.Object3D>;
    needle?:THREE.Object3D;
    seams:THREE.Vector3[];
    /** A red pool under machine and pad that brightens in the danger stage. */
    glow:THREE.Mesh;
}

export function createMachineMaterials():MachineMaterials {
    const standard=(color:number,roughness:number,metalness=0,emissive=0,emissiveIntensity=0)=>
        new THREE.MeshStandardMaterial({color,roughness,metalness,emissive,emissiveIntensity});
    const stripes=document.createElement('canvas');stripes.width=stripes.height=64;
    const ctx=stripes.getContext('2d')!;ctx.fillStyle='#e0a81c';ctx.fillRect(0,0,64,64);ctx.fillStyle='#15171a';
    // Straight bands, turned 45° by the texture transform into chevron-style hazard stripes.
    for(let x=0;x<64;x+=32)ctx.fillRect(x,0,16,64);
    const hazardMap=new THREE.CanvasTexture(stripes);hazardMap.colorSpace=THREE.SRGBColorSpace;hazardMap.wrapS=hazardMap.wrapT=THREE.RepeatWrapping;
    hazardMap.repeat.set(3,1);hazardMap.center.set(.5,.5);hazardMap.rotation=Math.PI/4;
    const hazard=new THREE.MeshStandardMaterial({map:hazardMap,roughness:.6,emissive:0x2a1a00,emissiveIntensity:.25});
    hazard.addEventListener('dispose',()=>hazardMap.dispose());
    return {
        iron:standard(0x33383c,.55,.55,0x0d1012,.3),steel:standard(0x8a939a,.32,.75,0x1a1f22,.25),
        brass:standard(0xc9a557,.35,.6,0x5a3d12,.22),dark:standard(0x15191b,.85),wood:standard(0x93684a,.8,0,0x2a1a0c,.15),
        green:standard(0x2e5c3c,.7,.2,0x0c2012,.25),yellow:standard(0xe0a81c,.55,.1,0x3a2600,.3),hazard,
        face:standard(0xf2e8cf,.6,0,0x3a3428,.35),cheese:standard(0xe9b53a,.55,0,0x3a2400,.25),
        glow:new THREE.MeshBasicMaterial({color:0xff2a10,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,fog:false}),
        outline:new THREE.MeshBasicMaterial({color:0xff2010,side:THREE.BackSide,toneMapped:false,fog:false}),
    };
}

/** Collects many small parts and merges them into one mesh per material, so a
 * detailed machine body is still only a few draws. */
class Builder {
    private readonly parts=new Map<THREE.Material,THREE.BufferGeometry[]>();
    private readonly matrix=new THREE.Matrix4();
    private readonly euler=new THREE.Euler();
    private readonly quaternion=new THREE.Quaternion();
    add(geometry:THREE.BufferGeometry,material:THREE.Material,x:number,y:number,z:number,rx=0,ry=0,rz=0,sx=1,sy=1,sz=1):void {
        this.quaternion.setFromEuler(this.euler.set(rx,ry,rz));
        this.matrix.compose(new THREE.Vector3(x,y,z),this.quaternion,new THREE.Vector3(sx,sy,sz));
        const part=(geometry.index?geometry.toNonIndexed():geometry.clone()).applyMatrix4(this.matrix);
        for(const name of Object.keys(part.attributes))if(name!=='position'&&name!=='normal'&&name!=='uv')part.deleteAttribute(name);
        if(!this.parts.has(material))this.parts.set(material,[]);
        this.parts.get(material)!.push(part);
    }
    box(material:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number,rx=0,ry=0,rz=0):void {this.add(BOX,material,x,y,z,rx,ry,rz,w,h,d);}
    cylinder(material:THREE.Material,x:number,y:number,z:number,r:number,h:number,rx=0,ry=0,rz=0):void {this.add(CYLINDER,material,x,y,z,rx,ry,rz,r*2,h,r*2);}
    /** Merge everything into `into`; returns the created meshes. */
    build(into:THREE.Object3D,castShadow=true):THREE.Mesh[] {
        const meshes:THREE.Mesh[]=[];
        for(const [material,parts] of this.parts){
            const mesh=new THREE.Mesh(mergeGeometries(parts),material);
            for(const part of parts)part.dispose();
            mesh.castShadow=castShadow;mesh.receiveShadow=true;into.add(mesh);meshes.push(mesh);
        }
        this.parts.clear();
        return meshes;
    }
}
const BOX=new THREE.BoxGeometry(1,1,1);
const CYLINDER=new THREE.CylinderGeometry(.5,.5,1,20);
const SPHERE=new THREE.SphereGeometry(1,14,10);

/** Rivets around a vertical cylinder of radius `r` at height `y`. */
function rivets(b:Builder,m:THREE.Material,r:number,y:number,count:number,size=.05){
    for(let i=0;i<count;i++){const a=i/count*Math.PI*2;b.add(SPHERE,m,Math.sin(a)*r,y,Math.cos(a)*r,0,0,0,size,size,size);}
}
/** A coil spring standing at (x,y,z). */
function spring(b:Builder,m:THREE.Material,x:number,y:number,z:number,radius:number,height:number,turns=6){
    const coil=new THREE.TorusGeometry(radius,.04,5,14);
    for(let i=0;i<turns;i++)b.add(coil,m,x,y+i*height/turns,z,Math.PI/2+.12,0,0);
    coil.dispose();
}
/** A painted sign; its texture is owned by the returned material. */
function sign(text:string,background:string,ink:string,w:number,h:number):THREE.Mesh {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=Math.round(512*h/w);
    const ctx=canvas.getContext('2d')!;ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle=ink;
    const cw=canvas.width,ch=canvas.height;
    for(const [x,y,bw,bh] of [[8,8,cw-16,10],[8,ch-18,cw-16,10],[8,8,10,ch-16],[cw-18,8,10,ch-16]] as const)ctx.fillRect(x,y,bw,bh);ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`bold ${Math.round(canvas.height*.42)}px Impact, "Arial Black", sans-serif`;
    ctx.fillText(text,canvas.width/2,canvas.height/2+4,canvas.width-40);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.MeshStandardMaterial({map:texture,roughness:.7,emissive:0xffffff,emissiveMap:texture,emissiveIntensity:.18});
    material.addEventListener('dispose',()=>texture.dispose());
    return new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);
}

/** The big red trigger group: its parts in the pulsing red, each with a bright red back-face outline. */
function trigger(parts:(b:Builder,red:THREE.Material)=>void,red:THREE.MeshStandardMaterial,outline:THREE.Material):THREE.Group {
    const group=new THREE.Group();group.name='launcher-trigger';group.userData.noNoir=true;
    const b=new Builder();parts(b,red);
    for(const mesh of b.build(group)){
        // The outline: the same shape pushed out along its normals, drawn back-faces only.
        const shell=mesh.geometry.clone(),positions=shell.getAttribute('position'),normals=shell.getAttribute('normal');
        for(let i=0;i<positions.count;i++)positions.setXYZ(i,positions.getX(i)+normals.getX(i)*.07,positions.getY(i)+normals.getY(i)*.07,positions.getZ(i)+normals.getZ(i)*.07);
        const edge=new THREE.Mesh(shell,outline);edge.castShadow=false;edge.name='launcher-trigger-outline';group.add(edge);
    }
    return group;
}

/** Build one machine: body beside the pad, its trigger on top, and its pad mechanism. */
export function buildMachine(machine:LaunchMachine,m:MachineMaterials):MachineModel {
    const {pad:p,box}=machine;
    const yaw=Math.atan2(p.x-box.x,p.z-box.z);
    const base=new THREE.Group();base.name=`launcher-${machine.id}`;base.position.set(box.x,0,box.z);base.rotation.y=yaw;
    const body=new THREE.Group();base.add(body);
    const padRoot=new THREE.Group();padRoot.name=`launcher-pad-${machine.id}`;padRoot.position.set(p.x,0,p.z);padRoot.rotation.y=yaw;
    const red=new THREE.MeshStandardMaterial({color:0xff1a0a,roughness:.35,emissive:0xff1a0a,emissiveIntensity:.6});
    const parts:Record<string,THREE.Object3D>={};
    const b=new Builder(),pb=new Builder();
    const seams:THREE.Vector3[]=[];
    let needle:THREE.Object3D|undefined;
    // Every pad: a steel rim of hazard chevrons, the same footprint as before (walkable, flush).
    const rim=new THREE.RingGeometry(4.55,5.05,48,1);rim.rotateX(-Math.PI/2);
    pb.add(rim,m.hazard,0,.075,0);rim.dispose();
    const kind:LaunchMachineKind=machine.kind;
    let triggerGroup:THREE.Group;
    if(kind==='pressure'){
        // A riveted cast-iron boiler with a gauge, a brass whistle and a feed pipe into the pad.
        b.cylinder(m.iron,0,1.25,0,1.02,2.3);
        b.add(SPHERE,m.iron,0,2.4,0,0,0,0,1.02,.55,1.02);
        for(const y of [.35,1.25,2.15])b.cylinder(m.steel,0,y,0,1.07,.14);
        for(const y of [.55,1.05,1.55,1.95])rivets(b,m.brass,1.03,y,18,.045);
        b.cylinder(m.dark,0,.12,0,1.25,.24);
        b.cylinder(m.brass,.62,2.75,-.35,.1,.7);b.add(new THREE.ConeGeometry(.16,.28,12),m.brass,.62,3.18,-.35);
        b.cylinder(m.iron,0,.45,1.3,.28,1.1,Math.PI/2);b.cylinder(m.steel,0,.45,.95,.34,.12,Math.PI/2);
        // Gauge on the pad side.
        b.cylinder(m.brass,0,1.6,1.02,.46,.14,Math.PI/2);b.cylinder(m.face,0,1.6,1.1,.39,.03,Math.PI/2);
        const gauge=new THREE.Group();gauge.position.set(0,1.6,1.13);body.add(gauge);
        const hand=new THREE.Mesh(new THREE.BoxGeometry(.05,.34,.02).translate(0,.14,0),m.dark);gauge.add(hand);needle=gauge;
        // The red zone on the dial.
        const zone=new THREE.Mesh(new THREE.RingGeometry(.28,.37,24,1,-Math.PI*.25,Math.PI*.5),red);zone.position.set(0,1.6,1.126);body.add(zone);
        seams.push(new THREE.Vector3(.62,3.3,-.35),new THREE.Vector3(1.05,1.25,.2),new THREE.Vector3(-1.05,2.15,0),new THREE.Vector3(0,.45,1.85));
        triggerGroup=trigger((t,r)=>{
            // A giant valve wheel on a stem, lying flat on the dome.
            t.cylinder(r,0,3.1,0,.14,.5);
            const wheel=new THREE.TorusGeometry(.72,.11,10,32);t.add(wheel,r,0,3.55,0,Math.PI/2,0,0);wheel.dispose();
            for(let i=0;i<4;i++)t.box(r,0,3.55,0,1.4,.09,.12,0,i*Math.PI/4,0);
            t.cylinder(r,0,3.6,0,.2,.2);
        },red,m.outline);
        // Pad: a round steel piston plate on a chrome ram.
        const plate=new THREE.Group();padRoot.add(plate);parts.plate=plate;
        const pl=new Builder();pl.cylinder(m.steel,0,.14,0,4.4,.22);pl.cylinder(m.iron,0,.27,0,3.4,.06);
        for(let i=0;i<12;i++){const a=i/12*Math.PI*2;pl.cylinder(m.brass,Math.sin(a)*3.9,.26,Math.cos(a)*3.9,.12,.06);}
        pl.build(plate);
        const ram=new THREE.Mesh(new THREE.CylinderGeometry(.9,.9,1,20),m.steel);ram.position.y=.1;ram.scale.y=.01;padRoot.add(ram);parts.ram=ram;
    }else if(kind==='dumpster'){
        // A sanitation hydraulic unit: green cabinet, two angled rams, a warning lamp.
        b.box(m.green,0,1.2,-.15,2.3,2.4,1.9);b.box(m.dark,0,.1,-.15,2.5,.2,2.1);
        b.box(m.hazard,0,2.35,-.15,2.34,.18,1.94);
        for(const side of [-1,1]){b.cylinder(m.steel,side*.75,.9,.95,.16,1.2,.9);b.cylinder(m.iron,side*.75,.55,.55,.22,.5,.9);}
        b.cylinder(m.yellow,.8,2.62,-.8,.16,.28);
        const label=sign('SANITATION DEPT','#2e5c3c','#f2e8cf',2,.42);label.position.set(0,1.5,.81);body.add(label);
        seams.push(new THREE.Vector3(1.16,1.8,.2),new THREE.Vector3(-1.16,1,.4),new THREE.Vector3(0,2.45,.6));
        triggerGroup=trigger((t,r)=>{
            // A big mushroom plunger marked CRUSH.
            t.cylinder(r,0,2.9,0,.22,.5);t.add(SPHERE,r,0,3.35,0,0,0,0,.78,.36,.78);t.cylinder(r,0,3.22,0,.8,.14);
        },red,m.outline);
        const crush=sign('CRUSH','#ff1a0a','#fff2d0',1.2,.36);crush.position.set(0,2.62,.9);crush.rotation.x=-.25;body.add(crush);
        // Pad: a dumpster bed with walls, a spring floor that catapults and a lid that slams.
        pb.box(m.green,0,.35,-3.6,8,.7,.3);for(const side of [-1,1])pb.box(m.green,side*3.95,.2,0,.3,.4,7.3);
        const floor=new THREE.Group();floor.position.set(0,.15,-3.4);padRoot.add(floor);parts.floor=floor;
        const fl=new Builder();fl.box(m.steel,0,0,3.4,7.4,.18,6.8);for(let x=-3;x<=3;x+=1)fl.box(m.iron,x,.1,3.4,.1,.04,6.4);fl.build(floor);
        const lid=new THREE.Group();lid.position.set(0,.72,-3.6);padRoot.add(lid);parts.lid=lid;
        const ld=new Builder();ld.box(m.green,0,.08,-.6,7.8,.14,1.2);ld.box(m.dark,0,.16,-.6,7.4,.04,.9);ld.build(lid);
        for(const side of [-1,1])spring(pb,m.brass,side*2.8,.1,-2.2,.3,.5,5);
    }else if(kind==='freight'){
        // A loading-dock pneumatic ram: striped housing, bell, and a piston aimed across the pad.
        b.box(m.iron,0,1.15,-.2,2.3,2.3,1.9);b.box(m.hazard,0,.3,-.2,2.36,.4,1.96);b.box(m.hazard,0,2.1,-.2,2.36,.3,1.96);
        b.cylinder(m.steel,0,1.2,.85,.62,.3,Math.PI/2);
        for(const side of [-1,1])b.box(m.dark,side*1.25,1.2,-.2,.2,2.4,.3);
        b.add(SPHERE,m.brass,.9,2.55,-.8,0,0,0,.26,.2,.26);b.cylinder(m.dark,.9,2.35,-.8,.05,.25);
        seams.push(new THREE.Vector3(0,1.2,1.05),new THREE.Vector3(1.2,.9,.3),new THREE.Vector3(-1.2,1.8,-.4));
        triggerGroup=trigger((t,r)=>{
            // An emergency-stop mushroom button on a yellow post.
            t.add(SPHERE,r,0,3.3,0,0,0,0,.85,.42,.85);t.cylinder(r,0,3.1,0,.55,.24);
        },red,m.outline);
        b.cylinder(m.yellow,0,2.72,0,.3,.55);
        const piston=new THREE.Group();piston.position.set(0,1.2,.95);body.add(piston);parts.piston=piston;
        const ps=new Builder();ps.cylinder(m.steel,0,0,.9,.32,1.8,Math.PI/2);ps.cylinder(m.iron,0,0,1.85,.55,.18,Math.PI/2);ps.build(piston);
        // Pad: rails and a sled that tilts into a ramp.
        for(const x of [-2.2,2.2])pb.box(m.steel,x,.1,0,.22,.2,8.2);
        for(let z=-3.6;z<=3.6;z+=.9)pb.box(m.wood,0,.05,z,5.2,.1,.35);
        const sled=new THREE.Group();sled.position.set(0,.2,-3.4);padRoot.add(sled);parts.sled=sled;
        const sl=new Builder();sl.box(m.yellow,0,0,3.4,4.6,.2,6.6);sl.box(m.hazard,0,.12,.2,4.6,.05,.4);sl.box(m.hazard,0,.12,6.6,4.6,.05,.4);sl.build(sled);
    }else if(kind==='geyser'){
        // A sewer standpipe with a valve housing, weeping green.
        b.cylinder(m.iron,0,.9,0,.55,1.8);b.cylinder(m.steel,0,1.85,0,.72,.3);b.cylinder(m.iron,0,.2,0,.9,.4);
        for(const y of [.6,1.3])rivets(b,m.brass,.56,y,12,.04);
        b.cylinder(m.iron,0,.3,.8,.26,1.2,Math.PI/2);b.cylinder(m.green,0,2.3,0,.4,.6);
        seams.push(new THREE.Vector3(.56,1,0),new THREE.Vector3(-.56,1.4,0),new THREE.Vector3(0,2.1,.5));
        triggerGroup=trigger((t,r)=>{
            // A hydrant-style valve cap with a pentagon nut.
            t.cylinder(r,0,3.05,0,.62,.5);t.add(SPHERE,r,0,3.35,0,0,0,0,.62,.3,.62);
            t.add(new THREE.CylinderGeometry(.22,.22,.3,5),r,0,3.72,0);
            for(const side of [-1,1])t.cylinder(r,side*.72,3.05,0,.18,.3,0,0,Math.PI/2);
        },red,m.outline);
        // Pad: cracked paving around a manhole cover, glowing green from below.
        pb.cylinder(m.dark,0,.06,0,4.4,.12);
        for(let i=0;i<10;i++){const a=i/10*Math.PI*2;pb.box(m.iron,Math.sin(a)*3,.13,Math.cos(a)*3,.12,.02,2.2,0,a,0);}
        const well=new THREE.Mesh(new THREE.CircleGeometry(1.35,32),new THREE.MeshBasicMaterial({color:0x5aff9a,toneMapped:false,fog:false}));
        well.rotation.x=-Math.PI/2;well.position.y=.13;padRoot.add(well);parts.well=well;
        const cover=new THREE.Group();cover.position.y=.2;padRoot.add(cover);parts.cover=cover;
        const cv=new Builder();cv.cylinder(m.iron,0,0,0,1.5,.14);
        for(let i=-3;i<=3;i++)cv.box(m.steel,i*.36,.08,0,.08,.03,Math.sqrt(Math.max(0,2-(i*.36)**2))*1.9);
        cv.build(cover);
    }else if(kind==='mousetrap'){
        // The trap's spring box: a wooden block with a heavy coil and a latch.
        b.box(m.wood,0,.9,-.1,2.2,1.8,1.9);b.box(m.brass,0,1.82,-.1,2.3,.08,2);
        spring(b,m.steel,0,1.9,-.1,.55,.9,7);
        b.box(m.steel,0,2.6,.3,.12,.12,1.4);
        const brand=sign('VICTORY RAT CO.','#93684a','#2a1a0c',1.9,.42);brand.position.set(0,.9,.86);body.add(brand);
        seams.push(new THREE.Vector3(1.1,1.3,.3),new THREE.Vector3(-1.1,.8,-.2),new THREE.Vector3(0,2.3,-.1));
        triggerGroup=trigger((t,r)=>{
            // The bait: a giant red-waxed cheese wheel with one wedge cut out.
            t.add(new THREE.CylinderGeometry(.85,.85,.6,28,1,false,.5,Math.PI*2-1),r,0,3.3,0);
        },red,m.outline);
        const wedge=new THREE.Mesh(new THREE.CylinderGeometry(.8,.8,.56,6,1,false,-.5,1),m.cheese);wedge.position.y=3.3;body.add(wedge);
        // Pad: the wooden board, staples and the snap bar that flips over.
        pb.box(m.wood,0,.07,0,8.4,.14,7.2);
        for(let x=-3.6;x<=3.6;x+=.9)pb.box(m.dark,x,.15,0,.03,.02,6.8);
        for(const x of [-3.9,3.9])pb.box(m.steel,x,.2,0,.12,.12,.5);
        const bar=new THREE.Group();bar.position.set(0,.22,0);padRoot.add(bar);parts.bar=bar;
        const br=new Builder();br.cylinder(m.steel,0,0,-3.2,.07,7.8,0,0,Math.PI/2);for(const x of [-3.9,3.9])br.cylinder(m.steel,x,0,-1.6,.07,3.2,Math.PI/2);
        br.build(bar);bar.rotation.x=Math.PI;
    }else{
        // A turbine motor on its side with cooling fins and a knife switch.
        b.cylinder(m.iron,0,1.2,-.1,.95,2,Math.PI/2);
        for(let z=-.9;z<=.8;z+=.22)b.cylinder(m.steel,0,1.2,z,1.04,.06,Math.PI/2);
        b.box(m.dark,0,.2,-.1,1.9,.4,2);b.cylinder(m.steel,0,1.2,1.05,.3,.3,Math.PI/2);
        b.box(m.dark,.95,2.25,-.6,.14,.5,.3);b.box(m.steel,.95,2.55,-.5,.05,.55,.08,.5,0,0);
        seams.push(new THREE.Vector3(0,2.2,-.9),new THREE.Vector3(.9,1.2,.5),new THREE.Vector3(-.9,1.6,-.4));
        triggerGroup=trigger((t,r)=>{
            // A big red motor cap on the housing.
            t.cylinder(r,0,3.1,0,.8,.45);t.add(SPHERE,r,0,3.35,0,0,0,0,.8,.35,.8);
            for(let i=0;i<8;i++){const a=i/8*Math.PI*2;t.box(r,Math.sin(a)*.82,3.08,Math.cos(a)*.82,.08,.4,.2,0,a,0);}
        },red,m.outline);
        b.cylinder(m.iron,0,2.35,-.1,.3,.5);
        // Pad: a grate over caged turbine blades, with streamers around the rim.
        pb.cylinder(m.dark,0,.05,0,4.5,.1);
        const blades=new THREE.Group();blades.position.y=.14;padRoot.add(blades);parts.blades=blades;
        const bl=new Builder();for(let i=0;i<6;i++){const a=i*Math.PI/3;bl.box(m.brass,Math.sin(a)*1.9,0,Math.cos(a)*1.9,.8,.06,3.2,0,a+.38,.25);}bl.cylinder(m.iron,0,.05,0,.6,.16);
        bl.build(blades);
        for(let i=-4;i<=4;i++)pb.box(m.steel,i*.95,.26,0,.07,.05,Math.sqrt(Math.max(0,20-(i*.95)**2))*2);
        for(let i=-4;i<=4;i++)pb.box(m.steel,0,.29,i*.95,Math.sqrt(Math.max(0,20-(i*.95)**2))*2,.05,.07);
        const streamers=new THREE.Group();padRoot.add(streamers);parts.streamers=streamers;
        const ribbons=[0xe0a81c,0xff1a0a].map(color=>new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));
        const ribbonGeometry=new THREE.PlaneGeometry(.18,1.2).translate(0,.6,0);
        for(let i=0;i<8;i++){
            const a=i/8*Math.PI*2,ribbon=new THREE.Mesh(ribbonGeometry,ribbons[i%2]!);
            ribbon.position.set(Math.sin(a)*4.8,.2,Math.cos(a)*4.8);ribbon.rotation.y=a;streamers.add(ribbon);
        }
    }
    b.build(body);pb.build(padRoot,false);
    body.add(triggerGroup);
    const glow=new THREE.Mesh(new THREE.CircleGeometry(1,40),m.glow.clone());glow.rotation.x=-Math.PI/2;
    glow.position.set((box.x+p.x)/2,.09,(box.z+p.z)/2);glow.scale.setScalar(Math.hypot(p.x-box.x,p.z-box.z)/2+p.radius);
    glow.renderOrder=1;
    return {machine,base,body,trigger:triggerGroup,triggerMaterial:red,pad:padRoot,parts,needle,seams,glow};
}

import * as THREE from 'three';
import type {LaunchMachineKind} from '../shared/chaosState';

const BITS=220;
const SPARKS=64;
const PUFFS=180;
const DECALS=10;

/** What a machine spits when it fires: colours, size (x,y,z) and how the bits fly. */
const SPIT:Record<LaunchMachineKind,{colors:readonly number[];size:readonly [number,number,number];speed:number;lift:number;flutter:number}>={
    pressure:{colors:[0xb09050,0x5a5050,0x807060],size:[.22,.07,.22],speed:6,lift:14,flutter:0},
    dumpster:{colors:[0x4a5a3a,0x8a7a5a,0x9aa0a8,0xd8ccb0,0x3a3a34],size:[.42,.16,.34],speed:7,lift:16,flutter:.4},
    freight:{colors:[0x707880,0x505860,0x9a8a60],size:[.12,.12,.2],speed:9,lift:9,flutter:0},
    geyser:{colors:[0x5a6a50,0x6f7f66,0x44503c],size:[.24,.24,.24],speed:4,lift:22,flutter:0},
    mousetrap:{colors:[0x8a6040,0x6a4a30,0xc8a060],size:[.07,.07,.5],speed:10,lift:10,flutter:0},
    fan:{colors:[0xc8bea0,0x6a5a3a,0x8a7a4a],size:[.26,.02,.2],speed:5,lift:20,flutter:1},
};
const SPARK_COLORS=[0xffa040,0xffd070,0xff6a20] as const;
const PAPER=[0xe8dcc0,0xd8ccb0,0xf0e6d0] as const;
const CHUNKS=[0x2a2a30,0x3a3838,0x4a4640] as const;

interface Bit {p:THREE.Vector3;v:THREE.Vector3;spin:THREE.Vector3;rot:THREE.Euler;size:THREE.Vector3;age:number;life:number;floor:number;flutter:number}
const bit=():Bit=>({p:new THREE.Vector3(),v:new THREE.Vector3(),spin:new THREE.Vector3(),rot:new THREE.Euler(),size:new THREE.Vector3(1,1,1),age:Infinity,life:1,floor:0,flutter:0});

/** Scene-wide launcher juice (L5–L7): machine debris, overpressure sparks,
 * contrails behind launched rats, landing craters and case paperwork. Pooled
 * instanced draws built on first use; cosmetic only. */
export class LaunchJuice {
    private readonly bits=Array.from({length:BITS},bit);
    private readonly sparks=Array.from({length:SPARKS},bit);
    private readonly puffs=Array.from({length:PUFFS},()=>({p:new THREE.Vector3(),age:Infinity,life:1,size:1}));
    private readonly decals:{mesh:THREE.Mesh;material:THREE.MeshBasicMaterial;age:number;life:number}[]=[];
    private readonly trails=new Map<string,number>();
    private bitMesh?:THREE.InstancedMesh;
    private sparkMesh?:THREE.InstancedMesh;
    private puffMesh?:THREE.InstancedMesh;
    private crackTexture?:THREE.CanvasTexture;
    private decalGeometry?:THREE.PlaneGeometry;
    private readonly owned:{dispose():void}[]=[];
    private bitCursor=0;
    private sparkCursor=0;
    private puffCursor=0;
    private decalCursor=0;
    private active=false;
    private readonly dummy=new THREE.Object3D();
    private readonly color=new THREE.Color();

    constructor(private readonly scene:THREE.Scene){}

    private instanced(name:string,geometry:THREE.BufferGeometry,material:THREE.Material,count:number):THREE.InstancedMesh {
        const mesh=new THREE.InstancedMesh(geometry,material,count);
        mesh.name=name;mesh.count=0;mesh.frustumCulled=false;this.scene.add(mesh);
        this.owned.push(geometry,material);
        return mesh;
    }
    private bitDraw():THREE.InstancedMesh {
        return this.bitMesh??=this.instanced('launch-debris',new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({roughness:.8}),BITS);
    }
    private sparkDraw():THREE.InstancedMesh {
        return this.sparkMesh??=this.instanced('launch-sparks',new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({toneMapped:false}),SPARKS);
    }
    private puffDraw():THREE.InstancedMesh {
        return this.puffMesh??=this.instanced('launch-contrails',new THREE.IcosahedronGeometry(1,1),
            new THREE.MeshBasicMaterial({color:0xcfc9bb,transparent:true,opacity:.2,depthWrite:false}),PUFFS);
    }

    private emit(pool:Bit[],mesh:THREE.InstancedMesh,cursor:number,at:THREE.Vector3,colors:readonly number[],size:readonly [number,number,number],speed:number,lift:number,flutter:number,life:number,floor:number):number {
        const slot=cursor%pool.length,b=pool[slot]!,angle=Math.random()*Math.PI*2,out=speed*(.4+Math.random()*.8);
        b.p.copy(at);b.v.set(Math.cos(angle)*out,lift*(.5+Math.random()*.7),Math.sin(angle)*out);
        b.spin.set((Math.random()*2-1)*14,(Math.random()*2-1)*14,(Math.random()*2-1)*14);b.rot.set(0,angle,0);
        const s=.7+Math.random()*.6;b.size.set(size[0]*s,size[1]*s,size[2]*s);
        b.age=0;b.life=life*(.7+Math.random()*.6);b.floor=floor;b.flutter=flutter;
        mesh.setColorAt(slot,this.color.setHex(colors[Math.floor(Math.random()*colors.length)]!));
        if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
        this.active=true;
        return cursor+1;
    }
    private debris(at:THREE.Vector3,count:number,colors:readonly number[],size:readonly [number,number,number],speed:number,lift:number,flutter:number,life:number){
        const mesh=this.bitDraw();
        for(let i=0;i<count;i++)this.bitCursor=this.emit(this.bits,mesh,this.bitCursor,at,colors,size,speed,lift,flutter,life,at.y-.1);
    }
    private spray(at:THREE.Vector3,count:number){
        const mesh=this.sparkDraw();
        for(let i=0;i<count;i++)this.sparkCursor=this.emit(this.sparks,mesh,this.sparkCursor,at,SPARK_COLORS,[.06,.06,.22],12,14,0,.55,-Infinity);
    }

    /** A machine fires: its own debris from the pad; overpressure adds a fountain of sparks. */
    fired(kind:LaunchMachineKind,pad:{x:number;y:number;z:number;radius:number},boost:boolean,count:number):void {
        const spit=SPIT[kind],at=new THREE.Vector3();
        for(let i=0;i<count;i++){
            const angle=Math.random()*Math.PI*2,r=Math.random()*pad.radius*.8;
            at.set(pad.x+Math.cos(angle)*r,pad.y+.3,pad.z+Math.sin(angle)*r);
            this.debris(at,1,spit.colors,spit.size,spit.speed,spit.lift*(boost?1.5:1),spit.flutter,2.4);
        }
        if(boost)this.spray(at.set(pad.x,pad.y+.6,pad.z),SPARKS/2);
    }

    /** One contrail puff every `every` seconds behind a launched rat (`id` keys its timer). */
    trail(id:string,at:THREE.Vector3,dt:number,every:number):void {
        const timer=(this.trails.get(id)??0)-dt;
        if(timer>0){this.trails.set(id,timer);return;}
        this.trails.set(id,every);
        this.puffDraw();
        const puff=this.puffs[this.puffCursor++%PUFFS]!;
        puff.p.set(at.x+(Math.random()-.5)*.3,at.y+1+(Math.random()-.5)*.3,at.z+(Math.random()-.5)*.3);
        puff.age=0;puff.life=.8+Math.random()*.4;puff.size=.13+Math.random()*.06;
        this.active=true;
    }
    /** Forget a rat's contrail timer once it lands. */
    endTrail(id:string):void {this.trails.delete(id);}

    /** A launched rat hits the ground: asphalt chunks and a crater of cracked pavement scaled by `energy` (0…1). */
    landed(at:THREE.Vector3,energy:number,life:number):void {
        const e=Math.max(.2,Math.min(1,energy));
        this.debris(at,Math.round(6+e*14),CHUNKS,[.18,.1,.16],5+e*7,6+e*8,0,1.6);
        this.decal(at,2.6+e*3.4,life);
    }
    /** The thrown case bursts open: paperwork flutters down around it. */
    spill(at:THREE.Vector3,count:number):void {this.debris(at,count,PAPER,[.34,.012,.26],3.5,9,1,4.5);}

    private decal(at:THREE.Vector3,size:number,life:number){
        if(!this.crackTexture){
            this.crackTexture=crackTexture();this.decalGeometry=new THREE.PlaneGeometry(1,1);this.decalGeometry.rotateX(-Math.PI/2);
            this.owned.push(this.crackTexture,this.decalGeometry);
        }
        let decal=this.decals[this.decalCursor%DECALS];
        if(!decal){
            const material=new THREE.MeshBasicMaterial({map:this.crackTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
            const mesh=new THREE.Mesh(this.decalGeometry,material);mesh.name='launch-crater';mesh.renderOrder=1;
            this.scene.add(mesh);decal={mesh,material,age:0,life};this.decals.push(decal);this.owned.push(material);
        }
        this.decalCursor++;
        decal.mesh.position.set(at.x,at.y+.03,at.z);decal.mesh.rotation.y=Math.random()*Math.PI*2;
        decal.mesh.scale.setScalar(size);decal.mesh.visible=true;decal.material.opacity=1;decal.age=0;decal.life=life;
        decal.mesh.updateMatrix();this.active=true;
    }

    private step(pool:Bit[],mesh:THREE.InstancedMesh|undefined,dt:number):boolean {
        if(!mesh)return false;
        let live=false;
        for(let slot=0;slot<pool.length;slot++){
            const b=pool[slot]!;
            if((b.age+=dt)>=b.life){this.dummy.scale.setScalar(0);this.dummy.updateMatrix();mesh.setMatrixAt(slot,this.dummy.matrix);continue;}
            live=true;
            // Paper and leaves fall slowly and drift; everything else is thrown hard.
            const drag=b.flutter?2.4*b.flutter:.4;
            b.v.multiplyScalar(Math.exp(-drag*dt));b.v.y-=(b.flutter?9:25)*dt;
            if(b.flutter)b.v.x+=Math.sin(b.age*7+slot)*b.flutter*6*dt;
            b.p.addScaledVector(b.v,dt);
            if(b.p.y<b.floor){b.p.y=b.floor;b.v.y=Math.abs(b.v.y)*.3;b.v.x*=.6;b.v.z*=.6;b.spin.multiplyScalar(.5);}
            b.rot.x+=b.spin.x*dt;b.rot.y+=b.spin.y*dt;b.rot.z+=b.spin.z*dt;
            const fade=Math.min(1,(b.life-b.age)/.3);
            this.dummy.position.copy(b.p);this.dummy.rotation.copy(b.rot);this.dummy.scale.copy(b.size).multiplyScalar(fade);
            this.dummy.updateMatrix();mesh.setMatrixAt(slot,this.dummy.matrix);
        }
        mesh.count=live?pool.length:0;mesh.instanceMatrix.needsUpdate=true;
        return live;
    }

    update(dt:number):void {
        if(!this.active)return;
        let live=this.step(this.bits,this.bitMesh,dt);
        live=this.step(this.sparks,this.sparkMesh,dt)||live;
        if(this.puffMesh){
            let count=0;
            for(let slot=0;slot<PUFFS;slot++){
                const puff=this.puffs[(this.puffCursor+slot)%PUFFS]!;
                if((puff.age+=dt)>=puff.life)continue;
                const t=puff.age/puff.life;puff.p.y+=dt*.5;
                this.dummy.position.copy(puff.p);this.dummy.rotation.set(0,0,0);
                this.dummy.scale.setScalar(puff.size*(1+t*2.2)*(1-t*t));
                this.dummy.updateMatrix();this.puffMesh.setMatrixAt(count++,this.dummy.matrix);
            }
            this.puffMesh.count=count;this.puffMesh.instanceMatrix.needsUpdate=true;
            live||=count>0;
        }
        for(const decal of this.decals){
            if(!decal.mesh.visible)continue;
            decal.age+=dt;
            decal.material.opacity=Math.min(1,(decal.life-decal.age)/2);
            if(decal.age>=decal.life)decal.mesh.visible=false;else live=true;
        }
        this.active=live;
    }

    clear():void {
        for(const b of [...this.bits,...this.sparks])b.age=Infinity;
        for(const puff of this.puffs)puff.age=Infinity;
        for(const decal of this.decals)decal.mesh.visible=false;
        for(const mesh of [this.bitMesh,this.sparkMesh,this.puffMesh])if(mesh)mesh.count=0;
        this.trails.clear();this.active=false;
    }
    dispose():void {
        for(const mesh of [this.bitMesh,this.sparkMesh,this.puffMesh]){mesh?.removeFromParent();mesh?.dispose();}
        for(const decal of this.decals)decal.mesh.removeFromParent();
        for(const resource of this.owned)resource.dispose();
        this.owned.length=0;this.decals.length=0;this.trails.clear();
    }
}

/** A dark impact scorch with radiating cracks, transparent at the edge. */
function crackTexture():THREE.CanvasTexture {
    const size=256,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
    const ctx=canvas.getContext('2d')!,c=size/2;
    const scorch=ctx.createRadialGradient(c,c,4,c,c,c*.62);
    scorch.addColorStop(0,'rgba(8,7,9,.85)');scorch.addColorStop(.55,'rgba(14,12,14,.45)');scorch.addColorStop(1,'rgba(14,12,14,0)');
    ctx.fillStyle=scorch;ctx.fillRect(0,0,size,size);
    // A pale ring of pulverised concrete reads on the dark street where the scorch alone would not.
    const dust=ctx.createRadialGradient(c,c,c*.3,c,c,c*.95);
    dust.addColorStop(0,'rgba(170,160,145,0)');dust.addColorStop(.55,'rgba(170,160,145,.28)');dust.addColorStop(1,'rgba(170,160,145,0)');
    ctx.fillStyle=dust;ctx.fillRect(0,0,size,size);
    ctx.lineCap='round';
    let seed=97;const random=()=>(seed=(seed*16807)%2147483647)/2147483647;
    for(let i=0;i<11;i++){
        let x=c,y=c,angle=i/11*Math.PI*2+random()*.4;
        // Each segment is its own stroke so the crack tapers toward its tip.
        for(let step=0;step<7;step++){
            const width=Math.max(.8,3.2-step*.4),x0=x,y0=y;
            angle+=(random()-.5)*.8;const length=8+random()*12;
            x+=Math.cos(angle)*length;y+=Math.sin(angle)*length;
            // Chipped pale lip, then the dark crack inside it.
            ctx.strokeStyle='rgba(190,180,165,.55)';ctx.lineWidth=width+2.4;ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x,y);ctx.stroke();
            ctx.strokeStyle='rgba(6,5,6,.95)';ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x,y);ctx.stroke();
        }
    }
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    return texture;
}

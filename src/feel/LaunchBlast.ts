import * as THREE from 'three';
import type {LaunchMachineKind} from '../shared/chaosState';

const BLASTS=8;
const STREAKS=200;
const DUST=160;

/** Each machine's blast: its air colour (column, dust), the flash, how wide the column opens and how tall it shoots. */
const LOOK:Record<LaunchMachineKind,{air:number;dust:number;flash:number;width:number;height:number}>={
    pressure:{air:0xe9edf0,dust:0xb8b0a4,flash:0xfff0c8,width:1,height:30},
    dumpster:{air:0xa7b394,dust:0x8e8a70,flash:0xe8f0c0,width:1.3,height:22},
    freight:{air:0xd2bf9c,dust:0xb09c78,flash:0xffe0a0,width:1.1,height:20},
    geyser:{air:0xbff5d2,dust:0x8fb8a0,flash:0xa8ffcc,width:.8,height:38},
    mousetrap:{air:0xe0c496,dust:0xb89870,flash:0xffe0a0,width:1.2,height:20},
    fan:{air:0xdfeaee,dust:0xc8c4b4,flash:0xffffff,width:.9,height:36},
};
const OVERPRESSURE={air:0x6a6260,flash:0xffa040};
const ease=(t:number)=>1-(1-Math.min(1,Math.max(0,t)))**3;

interface Blast {root:THREE.Group;core:THREE.Mesh;column:THREE.Mesh;ring:THREE.Mesh;flash:THREE.Mesh;age:number;life:number;width:number;height:number;boost:boolean}
interface Mote {p:THREE.Vector3;v:THREE.Vector3;age:number;life:number;size:number;grow:number;drag:number}
const mote=():Mote=>({p:new THREE.Vector3(),v:new THREE.Vector3(),age:Infinity,life:1,size:1,grow:1,drag:0});

/** The launch itself, layered: a flash, a white-hot core that shoots up, the
 * machine's coloured air column blooming out, a shock ring racing across the
 * ground, speed streaks, a ground-hugging dust burst and a slow haze left behind.
 * Overpressure is taller and wider, with dirty smoke. Pooled; cosmetic only. */
export class LaunchBlast {
    private readonly blasts:Blast[]=[];
    private readonly streaks=Array.from({length:STREAKS},mote);
    private readonly dust=Array.from({length:DUST},mote);
    private streakMesh?:THREE.InstancedMesh;
    private dustMesh?:THREE.InstancedMesh;
    private readonly geometry={
        column:new THREE.CylinderGeometry(1.8,1,1,28,1,true).translate(0,.5,0),
        ring:new THREE.RingGeometry(.82,1,56).rotateX(-Math.PI/2),
        flash:new THREE.SphereGeometry(1,16,12),
    };
    private blastCursor=0;private streakCursor=0;private dustCursor=0;
    private active=false;
    private readonly dummy=new THREE.Object3D();
    private readonly ahead=new THREE.Vector3();
    private readonly color=new THREE.Color();

    constructor(private readonly scene:THREE.Scene){}

    private slot():Blast {
        if(this.blasts.length<BLASTS){
            const material=(color:number,opacity:number,additive=false)=>new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide,
                blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,toneMapped:!additive,fog:!additive});
            const root=new THREE.Group();root.name='launch-blast';
            const column=new THREE.Mesh(this.geometry.column,material(0xffffff,0));
            const core=new THREE.Mesh(this.geometry.column,material(0xffffff,0,true));
            const ring=new THREE.Mesh(this.geometry.ring,material(0xffffff,0));
            const flash=new THREE.Mesh(this.geometry.flash,material(0xffffff,0,true));
            for(const mesh of [column,core,ring,flash]){mesh.frustumCulled=false;mesh.renderOrder=2;root.add(mesh);}
            root.visible=false;this.scene.add(root);
            this.blasts.push({root,core,column,ring,flash,age:Infinity,life:1,width:1,height:1,boost:false});
        }
        return this.blasts[this.blastCursor++%BLASTS]!;
    }
    private streakDraw():THREE.InstancedMesh {
        return this.streakMesh??=this.pool('launch-streaks',new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:0xf4f2ea,transparent:true,opacity:.75,depthWrite:false}),STREAKS);
    }
    private dustDraw():THREE.InstancedMesh {
        return this.dustMesh??=this.pool('launch-dust',new THREE.IcosahedronGeometry(1,2),new THREE.MeshBasicMaterial({transparent:true,opacity:.32,depthWrite:false}),DUST);
    }
    private pool(name:string,geometry:THREE.BufferGeometry,material:THREE.Material,count:number):THREE.InstancedMesh {
        const mesh=new THREE.InstancedMesh(geometry,material,count);
        mesh.name=name;mesh.count=0;mesh.frustumCulled=false;this.scene.add(mesh);return mesh;
    }

    fire(kind:LaunchMachineKind,pad:{x:number;y:number;z:number;radius:number},boost:boolean):void {
        const look=LOOK[kind],blast=this.slot();
        blast.root.position.set(pad.x,pad.y+.1,pad.z);blast.root.visible=true;
        blast.age=0;blast.boost=boost;blast.life=boost?1.3:1;
        blast.width=look.width*(boost?1.5:1)*pad.radius/5;blast.height=look.height*(boost?1.45:1);
        (blast.column.material as THREE.MeshBasicMaterial).color.setHex(boost?OVERPRESSURE.air:look.air);
        (blast.ring.material as THREE.MeshBasicMaterial).color.setHex(look.dust);
        (blast.flash.material as THREE.MeshBasicMaterial).color.setHex(boost?OVERPRESSURE.flash:look.flash);
        (blast.core.material as THREE.MeshBasicMaterial).color.setHex(boost?OVERPRESSURE.flash:look.flash).multiplyScalar(.8);
        // Speed streaks up through the column.
        const streaks=this.streakDraw();
        for(let i=0,n=boost?44:28;i<n;i++){
            const m=this.streaks[this.streakCursor++%STREAKS]!,a=Math.random()*Math.PI*2,r=Math.random()*pad.radius*.6,tilt=Math.random()*.5;
            m.p.set(pad.x+Math.sin(a)*r,pad.y+.4+Math.random(),pad.z+Math.cos(a)*r);
            const speed=30+Math.random()*28;m.v.set(Math.sin(a)*Math.sin(tilt)*speed,Math.cos(tilt)*speed,Math.cos(a)*Math.sin(tilt)*speed);
            m.age=0;m.life=.35+Math.random()*.2;m.size=.07+Math.random()*.05;m.drag=1.5;m.grow=0;
        }
        streaks.count=STREAKS;
        // A ground-hugging dust burst from the pad's rim, then a slow haze left hanging.
        const dust=this.dustDraw();
        for(let i=0,n=boost?44:32;i<n;i++){
            const m=this.dust[this.dustCursor]!,a=i/n*Math.PI*2+Math.random()*.2,speed=11+Math.random()*9;
            dust.setColorAt(this.dustCursor%DUST,this.color.setHex(boost&&i%3===0?0x2a2624:look.dust));this.dustCursor=(this.dustCursor+1)%DUST;
            m.p.set(pad.x+Math.sin(a)*pad.radius*.8,pad.y+.3,pad.z+Math.cos(a)*pad.radius*.8);
            m.v.set(Math.sin(a)*speed,1+Math.random()*2.5,Math.cos(a)*speed);
            m.age=0;m.life=.8+Math.random()*.5;m.size=.2+Math.random()*.18;m.grow=2.2;m.drag=3.2;
        }
        for(let i=0,n=boost?14:9;i<n;i++){
            const m=this.dust[this.dustCursor]!;
            dust.setColorAt(this.dustCursor%DUST,this.color.setHex(boost?0x3a3432:look.air));this.dustCursor=(this.dustCursor+1)%DUST;
            m.p.set(pad.x+(Math.random()-.5)*4,pad.y+2+Math.random()*6,pad.z+(Math.random()-.5)*4);
            m.v.set((Math.random()-.5)*1.5,1.5+Math.random()*2,(Math.random()-.5)*1.5);
            m.age=0;m.life=2+Math.random()*1.2;m.size=.45+Math.random()*.35;m.grow=1.4;m.drag=.6;
        }
        if(dust.instanceColor)dust.instanceColor.needsUpdate=true;
        dust.count=DUST;
        this.active=true;
    }

    update(dt:number):void {
        if(!this.active||!(dt>0))return;
        let live=false;
        for(const b of this.blasts){
            if(!b.root.visible)continue;
            const a=(b.age+=dt);
            if(a>=b.life){b.root.visible=false;continue;}
            live=true;
            // Core: a white-hot jet that shoots up and is gone in a third of a second.
            b.core.scale.set(.55*b.width*(1+a*1.5),b.height*1.15*ease(a/.16),.55*b.width*(1+a*1.5));
            (b.core.material as THREE.MeshBasicMaterial).opacity=Math.max(0,.9*(1-a/.32));
            // Column: the machine's air blooming up and out, thinning as it rises.
            const w=b.width*(1.1+3.6*ease(a/.6));
            b.column.scale.set(w,b.height*ease(a/.28),w);
            (b.column.material as THREE.MeshBasicMaterial).opacity=.5*Math.max(0,1-a/b.life)**1.4;
            // Shock ring racing across the ground.
            const r=1+14*b.width*ease(a/.45);b.ring.scale.set(r,1,r);b.ring.position.y=.12;
            (b.ring.material as THREE.MeshBasicMaterial).opacity=Math.max(0,.7*(1-a/.45));
            // The flash: a blink at the pad.
            const f=a<.05?a/.05:Math.max(0,1-(a-.05)/.13);
            b.flash.scale.setScalar(Math.max(.001,4.5*b.width*f));b.flash.position.y=.8;
            (b.flash.material as THREE.MeshBasicMaterial).opacity=f*(b.boost?1:.8);
        }
        if(this.streakMesh){
            for(let i=0;i<STREAKS;i++){
                const m=this.streaks[i]!;
                if((m.age+=dt)>=m.life){this.dummy.scale.setScalar(0);this.dummy.updateMatrix();this.streakMesh.setMatrixAt(i,this.dummy.matrix);continue;}
                live=true;
                m.v.multiplyScalar(Math.exp(-m.drag*dt));m.p.addScaledVector(m.v,dt);
                // Stretched along its travel: faster reads longer.
                this.dummy.position.copy(m.p);this.dummy.lookAt(this.ahead.copy(m.p).add(m.v));
                const fade=1-m.age/m.life;this.dummy.scale.set(m.size*fade,m.size*fade,m.v.length()*.07);
                this.dummy.updateMatrix();this.streakMesh.setMatrixAt(i,this.dummy.matrix);
            }
            this.streakMesh.instanceMatrix.needsUpdate=true;
        }
        if(this.dustMesh){
            for(let i=0;i<DUST;i++){
                const m=this.dust[i]!;
                if((m.age+=dt)>=m.life){this.dummy.scale.setScalar(0);this.dummy.updateMatrix();this.dustMesh.setMatrixAt(i,this.dummy.matrix);continue;}
                live=true;
                m.v.multiplyScalar(Math.exp(-m.drag*dt));m.p.addScaledVector(m.v,dt);
                const k=m.age/m.life;
                this.dummy.position.copy(m.p);this.dummy.rotation.set(0,0,0);this.dummy.scale.setScalar(m.size*(1+k*m.grow)*(1-k*k));
                this.dummy.updateMatrix();this.dustMesh.setMatrixAt(i,this.dummy.matrix);
            }
            this.dustMesh.instanceMatrix.needsUpdate=true;
        }
        if(!live){if(this.streakMesh)this.streakMesh.count=0;if(this.dustMesh)this.dustMesh.count=0;}
        this.active=live;
    }

    clear():void {
        for(const b of this.blasts){b.root.visible=false;b.age=Infinity;}
        for(const m of [...this.streaks,...this.dust])m.age=Infinity;
        if(this.streakMesh)this.streakMesh.count=0;if(this.dustMesh)this.dustMesh.count=0;
        this.active=false;
    }
    dispose():void {
        for(const b of this.blasts){b.root.removeFromParent();for(const mesh of [b.core,b.column,b.ring,b.flash])(mesh.material as THREE.Material).dispose();}
        for(const mesh of [this.streakMesh,this.dustMesh]){if(!mesh)continue;mesh.removeFromParent();mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();mesh.dispose();}
        for(const geometry of Object.values(this.geometry))geometry.dispose();
        this.blasts.length=0;
    }
}

import * as THREE from 'three';
import {LAUNCH_MACHINES,type LaunchMachine,type ChaosState} from '../shared/chaosState';
import {disposeMeshResources} from '../utils/disposeMeshResources';

/** Six municipal contraptions. Low launch surfaces stay traversable; control housings are shared cover. */
export class PressureMachine {
    private root=new THREE.Group();
    private noiseBuffer?:AudioBuffer;
    private geometry={box:new THREE.BoxGeometry(1,1,1),round:new THREE.CylinderGeometry(.5,.5,1,20)};
    private material={metal:new THREE.MeshStandardMaterial({color:0x61736b,emissive:0x26372f,emissiveIntensity:.18,roughness:.4,metalness:.25}),dark:new THREE.MeshStandardMaterial({color:0x182727,roughness:.8}),brass:new THREE.MeshStandardMaterial({color:0xc6a55b,emissive:0x62441c,emissiveIntensity:.15,roughness:.4,metalness:.25}),wood:new THREE.MeshStandardMaterial({color:0x886346,emissive:0x302010,emissiveIntensity:.1,roughness:.8}),red:new THREE.MeshBasicMaterial({color:0xff1005,toneMapped:false}),white:new THREE.MeshBasicMaterial({color:0xffe8ad,toneMapped:false})};
    private batches=new Map<string,{shape:keyof PressureMachine['geometry'];material:THREE.Material;matrices:THREE.Matrix4[]}>();
    private instanced:THREE.InstancedMesh[]=[];
    private dummy=new THREE.Object3D();
    private moving:Array<{machine:LaunchMachine;rotor:THREE.Group;indicator:THREE.Mesh;lastUntil:number;ring:THREE.Mesh;burst:THREE.Group;shaft?:THREE.Mesh}>=[];
    constructor(scene:THREE.Scene,private audio?:AudioContext){
        this.root.name='municipal-launch-contraptions';
        for(const machine of LAUNCH_MACHINES)this.build(machine);
        for(const batch of this.batches.values()){
            const mesh=new THREE.InstancedMesh(this.geometry[batch.shape],batch.material,batch.matrices.length);
            batch.matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.computeBoundingSphere();mesh.receiveShadow=true;
            this.root.add(mesh);this.instanced.push(mesh);
        }
        this.batches.clear();scene.add(this.root);
    }
    private part(shape:keyof PressureMachine['geometry'],mat:keyof PressureMachine['material'],x:number,y:number,z:number,w:number,h:number,d:number,rx=0,ry=0,rz=0){
        this.dummy.position.set(x,y,z);this.dummy.scale.set(w,h,d);this.dummy.rotation.set(rx,ry,rz);this.dummy.updateMatrix();
        const key=shape+mat;if(!this.batches.has(key))this.batches.set(key,{shape,material:this.material[mat],matrices:[]});
        this.batches.get(key)!.matrices.push(this.dummy.matrix.clone());
    }
    private build(machine:LaunchMachine){
        const {pad:p,box:b,target:t,kind}=machine;
        const box=(mat:keyof PressureMachine['material'],x:number,y:number,z:number,w:number,h:number,d:number,rx=0,ry=0,rz=0)=>this.part('box',mat,x,y,z,w,h,d,rx,ry,rz);
        // A shootable red cap on every face, with no visual wiring to its launcher.
        box('dark',b.x,b.y,b.z,b.w,b.h,b.d);
        box('dark',b.x,.12,b.z,b.w+.45,.24,b.d+.45);
        box('metal',t.x,t.y-t.h/2-.08,t.z,t.w+.14,.16,t.d+.14);
        box('red',t.x,t.y,t.z,t.w,t.h,t.d);
        for(const side of [-1,1]){
            box('metal',b.x+side*(b.w/2+.025),b.y,b.z,.05,b.h*.75,b.d*.65);
            box('metal',b.x,b.y,b.z+side*(b.d/2+.025),b.w*.65,b.h*.75,.05);
        }
        const indicator=new THREE.Mesh(new THREE.BoxGeometry(t.w+.04,.12,t.d+.04),this.material.red);
        indicator.position.set(t.x,t.y+t.h/2+.07,t.z);this.root.add(indicator);
        const rectangular=kind==='dumpster'||kind==='freight'||kind==='mousetrap';
        if(rectangular)box(kind==='mousetrap'?'wood':'metal',p.x,.02,p.z,8.5,.09,7.5);
        else this.part('round','metal',p.x,.02,p.z,p.radius*2,.09,p.radius*2);
        for(let i=0;i<16;i++){
            const angle=i*Math.PI/8;box('brass',p.x+Math.sin(angle)*4.7,.09,p.z+Math.cos(angle)*4.7,.42,.06,.9,0,angle,0);
        }
        const rotor=new THREE.Group();rotor.position.set(p.x,.13,p.z);this.root.add(rotor);
        const movingBox=(mat:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number)=>{
            const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);rotor.add(mesh);return mesh;
        };
        let shaft:THREE.Mesh|undefined;
        if(kind==='pressure'){
            for(let x=-3.8;x<4;x+=.5)box('metal',p.x+x,.11,p.z,.12,.045,Math.sqrt(Math.max(0,16-x*x))*2);
            const piston=new THREE.Mesh(new THREE.CylinderGeometry(3.5,3.5,.55,24),this.material.brass);rotor.add(piston);
            shaft=new THREE.Mesh(new THREE.CylinderGeometry(.85,1.05,1,16),this.material.metal);
            shaft.position.set(p.x,.13,p.z);this.root.add(shaft);
            for(const x of [-4.1,4.1])this.spring(p.x+x,.18,p.z, .4,1.1);
        }else if(kind==='dumpster'){
            movingBox(this.material.metal,0,0,0,7.7,.4,5.8);
            for(const side of [-1,1])movingBox(this.material.brass,side*2.5,-.3,-1, .32,.5,5);
            for(const side of [-1,1]){
                box('metal',p.x+side*4,.22,p.z,.18,.32,6);
                box('dark',p.x+side*3.5,.12,p.z-3.5,.6,.24,.7);
                this.spring(p.x+side*3.6,.16,p.z+2.7,.36,.75);
            }
            for(let x=-3;x<4;x+=1) movingBox(this.material.brass,x,.08,0,.09,.05,5.4);
            this.label('SANITATION · SPRING LOADED',p.x,.15,p.z+2.9,4,.42,-Math.PI/2);
        }else if(kind==='freight'){
            for(const z of [-2.6,2.6])box('metal',p.x,.15,p.z+z,8,.18,.25);
            movingBox(this.material.brass,0,.06,0,2.2,1.1,5.4);
            for(let x=-3.5;x<=3.5;x+=.75)this.part('round','metal',p.x+x,.16,p.z,.22,5,.22,Math.PI/2);
            for(const z of [-3.2,3.2])this.spring(p.x+3.8,.15,p.z+z,.35,.8);
        }else if(kind==='geyser'){
            this.part('round','metal',p.x,.10,p.z,7.8,.16,7.8);
            for(let x=-3;x<3.1;x+=.5)box('dark',p.x+x,.195,p.z,.20,.03,Math.sqrt(Math.max(0,11-x*x))*2);
            for(let i=0;i<9;i++){
                const angle=i*Math.PI*2/9;
                movingBox(new THREE.MeshBasicMaterial({color:0x91c4ac,transparent:true,opacity:.5}),Math.sin(angle)*1.3,0,Math.cos(angle)*1.3,.09,1,.09);
            }
        }else if(kind==='mousetrap'){
            for(let x=-3.7;x<4;x+=.8)box('dark',p.x+x,.077,p.z,.025,.025,7);
            movingBox(this.material.brass,-3.3,.08,0,.15,.15,5.8);
            movingBox(this.material.brass,3.3,.08,0,.15,.15,5.8);
            movingBox(this.material.brass,0,.08,2.9,6.7,.15,.15);
            for(const x of [-1.1,1.1])this.spring(p.x+x,.14,p.z-3,.34,.8);
            const bait=movingBox(this.material.brass,0,.13,.5,1.5,.12,1);bait.rotation.y=.3;
        }else{
            this.part('round','metal',p.x,.085,p.z,8.4,.1,8.4);
            for(let i=0;i<6;i++){
                const angle=i*Math.PI/3;const blade=movingBox(this.material.brass,Math.sin(angle)*1.8,.04,Math.cos(angle)*1.8,.75,.07,3.2);blade.rotation.y=angle+.38;
            }
            this.part('round','dark',p.x,.22,p.z,1,.12,1);
        }
        const ring=new THREE.Mesh(new THREE.RingGeometry(1,1.14,40),new THREE.MeshBasicMaterial({color:0xffee66,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false,toneMapped:false}));
        ring.rotation.x=-Math.PI/2;ring.position.set(p.x,.28,p.z);this.root.add(ring);
        const burst=new THREE.Group();burst.position.set(p.x,.25,p.z);this.root.add(burst);
        const burstMaterial=new THREE.MeshBasicMaterial({color:kind==='geyser'?0x9ab6a0:kind==='fan'?0xd9e5e3:0xd8c49a,transparent:true,opacity:0,depthWrite:false,toneMapped:false});
        for(let i=0;i<10;i++){
            const ray=new THREE.Mesh(kind==='fan'||kind==='geyser'?new THREE.TorusGeometry(1,.11,4,24,Math.PI*1.65):new THREE.ConeGeometry(.32,1,5),burstMaterial);
            if(kind==='fan'||kind==='geyser')ray.rotation.x=Math.PI/2;
            const angle=i*Math.PI/5;ray.position.set(Math.sin(angle)*2,0,Math.cos(angle)*2);burst.add(ray);
        }
        this.moving.push({machine,rotor,indicator,ring,burst,shaft,lastUntil:-1});
    }
    private spring(x:number,y:number,z:number,radius:number,height:number){
        for(let ring=0;ring<6;ring++){
            const mesh=new THREE.Mesh(new THREE.TorusGeometry(radius,.045,5,12),this.material.brass);
            mesh.rotation.x=Math.PI/2;mesh.position.set(x,y+ring*height/6,z);this.root.add(mesh);
        }
    }
    private label(text:string,x:number,y:number,z:number,w:number,h:number,rx=0){
        const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
        const ctx=canvas.getContext('2d')!;ctx.fillStyle='#f6d680';ctx.fillRect(0,0,512,128);ctx.fillStyle='#242c29';ctx.textAlign='center';ctx.font='bold 38px monospace';
        text.split('\n').forEach((line,i)=>ctx.fillText(line,256,45+i*56));
        const texture=new THREE.CanvasTexture(canvas),material=new THREE.MeshBasicMaterial({map:texture});material.addEventListener('dispose',()=>texture.dispose());
        const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);mesh.position.set(x,y,z);mesh.rotation.x=rx;this.root.add(mesh);
    }
    update(state:ChaosState['pressure'],now:number,camera?:THREE.Camera){
        for(const model of this.moving){
            const until=state?.cooldowns?.[model.machine.id]??(model.machine.id==='pressure'?state?.until??0:0);
            const elapsed=now-(until-model.machine.cooldownMs);
            const age=elapsed*2; // Presentation runs at double speed; cooldown and launch physics stay unchanged.
            if(model.lastUntil>=0&&until>model.lastUntil&&elapsed>=0&&elapsed<1000)this.launchSound(model.machine.kind,model.machine.pad,camera);
            const active=until>0&&age>=0&&age<3600;
            const attack=Math.min(1,Math.max(0,age)/110);
            const kick=active?attack*(age<2000?1:Math.max(0,(3600-age)/1600)):0;
            model.indicator.visible=until<=now||Math.floor(now/350)%2===0;
            model.rotor.position.set(model.machine.pad.x,.13,model.machine.pad.z);model.rotor.rotation.set(0,0,0);model.rotor.scale.setScalar(1);
            const kind=model.machine.kind;
            if(kind==='fan'){model.rotor.rotation.y=now*.002+Math.max(0,Math.min(age,3600))*.035;model.rotor.position.y+=kick*.8;}
            else if(kind==='geyser'){model.rotor.scale.y=.02+kick*22;model.rotor.position.y=.13+kick*10;model.rotor.visible=active;}
            else if(kind==='freight')model.rotor.position.x-=kick*7;
            else if(kind==='dumpster'||kind==='mousetrap'){model.rotor.rotation.x=-kick*1.9;model.rotor.position.y+=kick*2.5;}
            else model.rotor.position.y+=kick*7;
            if(model.shaft){model.shaft.scale.y=Math.max(.1,kick*7);model.shaft.position.y=.13+kick*3.5;}
            model.ring.visible=active;model.ring.scale.setScalar(5+Math.min(1200,Math.max(0,age))*.008);
            (model.ring.material as THREE.MeshBasicMaterial).opacity=active?Math.max(0,1-age/3600)*.85:0;
            model.burst.visible=active;
            for(let i=0;i<model.burst.children.length;i++){
                const ray=model.burst.children[i] as THREE.Mesh,angle=i*Math.PI/5;
                if(kind==='fan'||kind==='geyser'){
                    const rise=((Math.max(0,age)/1500+i/10)%1);
                    const width=2+rise*(kind==='fan'?5:2);
                    ray.position.set(Math.sin(angle+age*.002)*rise,1+rise*24,Math.cos(angle+age*.002)*rise);
                    ray.scale.set(width,width,width);ray.rotation.z=age*.004+i;
                }else{
                    ray.position.set(Math.sin(angle)*3,kick*5+Math.sin(age*.009+i)*.5,Math.cos(angle)*3);
                    ray.scale.set(1,kick*10+.01,1);
                }
                (ray.material as THREE.MeshBasicMaterial).opacity=kick*.65;
            }
            model.lastUntil=until;
        }
    }
    private launchSound(kind:LaunchMachine['kind'],pad?:LaunchMachine['pad'],camera?:THREE.Camera){
        const ctx=this.audio;if(!ctx||ctx.state!=='running')return;
        const now=ctx.currentTime;
        const pitch={pressure:95,dumpster:65,freight:125,geyser:180,mousetrap:240,fan:75}[kind];
        // Layered impact, mechanical pitch-drop and rushing air; bounded to one event per cooldown.
        const output=ctx.createGain(),pan=ctx.createStereoPanner();
        let distance=0;
        if(pad&&camera){
            const dx=pad.x-camera.position.x,dz=pad.z-camera.position.z;distance=Math.hypot(dx,dz);
            const e=camera.matrixWorld.elements;
            pan.pan.value=Math.max(-.85,Math.min(.85,(dx*e[0]+dz*e[2])/Math.max(1,distance)));
        }
        output.gain.value=.85/(1+distance/260);output.connect(pan);pan.connect(ctx.destination);
        const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=kind==='mousetrap'?'triangle':'sawtooth';
        osc.frequency.setValueAtTime(pitch*2,now);osc.frequency.exponentialRampToValueAtTime(35,now+.6);
        gain.gain.setValueAtTime(.001,now);gain.gain.linearRampToValueAtTime(.65,now+.006);gain.gain.exponentialRampToValueAtTime(.001,now+.85);
        osc.connect(gain);gain.connect(output);osc.start();osc.stop(now+.9);
        const noise=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),air=ctx.createGain();
        if(!this.noiseBuffer){
            this.noiseBuffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*1.75),ctx.sampleRate);
            const data=this.noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
        }
        noise.buffer=this.noiseBuffer;filter.type='lowpass';filter.frequency.setValueAtTime(kind==='geyser'?4200:2200,now);filter.frequency.exponentialRampToValueAtTime(180,now+1.65);
        air.gain.setValueAtTime(.001,now);air.gain.linearRampToValueAtTime(.8,now+.0125);air.gain.linearRampToValueAtTime(.5,now+1.15);air.gain.exponentialRampToValueAtTime(.001,now+1.7);
        noise.connect(filter);filter.connect(air);air.connect(output);noise.start();noise.stop(now+1.75);
        noise.onended=()=>{noise.disconnect();filter.disconnect();air.disconnect();osc.disconnect();gain.disconnect();output.disconnect();pan.disconnect();};
    }
    dispose(){this.root.removeFromParent();for(const mesh of this.instanced)mesh.dispose();disposeMeshResources(this.root);for(const geometry of Object.values(this.geometry))geometry.dispose();for(const material of Object.values(this.material))material.dispose();}
}

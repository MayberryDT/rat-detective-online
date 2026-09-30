import * as THREE from 'three';
import {CITY_STREETS} from '../shared/cityPlan';
import {SEWER_MANHOLE} from '../shared/sewerLayout';
import {STREET_LAMP_HEIGHT,type StreetLampPosition} from '../shared/streetLampLayout';
import {feelState} from './feelState';
import {FEEL} from './feelTuning';

type Point={x:number;y:number;z:number};
interface Bird {home:THREE.Vector3;position:THREE.Vector3;velocity:THREE.Vector3;flying:boolean;away:number;phase:number;yaw:number}
interface Paper {home:THREE.Vector3;position:THREE.Vector3;velocity:THREE.Vector3;spin:THREE.Vector3;rotation:THREE.Euler;airborne:boolean}
interface Can {home:THREE.Vector3;position:THREE.Vector3;velocity:THREE.Vector3;tip:number;tipVelocity:number;yaw:number;down:number}
interface Puff {position:THREE.Vector3;age:number;life:number;size:number}

/** Street direction at a lamp: +1 when its road runs along x, -1 along z. */
function roadAxis(x:number,z:number):{alongX:boolean;center:number} {
    const road=CITY_STREETS.find(r=>Math.abs(x-r.x)<=r.w/2+1.5&&Math.abs(z-r.z)<=r.d/2+1.5);
    return road?{alongX:road.w>road.d,center:road.w>road.d?road.z:road.x}:{alongX:true,center:z};
}

/** Polish 18: a city that reacts, entirely cosmetic and client-side. Pigeons
 * scatter from shots, blasts and passing rats; newspapers kick up; trash cans
 * tip; the manhole steams; hit streetlamp bulbs stutter (a glow only: authored
 * lighting stays steady). Nothing here has a physics body, so props never
 * block rats, cheese or cases. Five instanced draws in total. */
export class CityReactions {
    private readonly root=new THREE.Group();
    private readonly birds:Bird[]=[];
    private readonly papers:Paper[]=[];
    private readonly cans:Can[]=[];
    private readonly puffs:Puff[]=Array.from({length:24},()=>({position:new THREE.Vector3(),age:Infinity,life:1,size:1}));
    private readonly bulbs:{position:THREE.Vector3;age:number}[]=[];
    private readonly lamps:THREE.Vector3[];
    private readonly meshes:THREE.InstancedMesh[]=[];
    private readonly birdMesh;private readonly paperMesh;private readonly canMesh;private readonly steamMesh;private readonly bulbMesh;
    private readonly dummy=new THREE.Object3D();
    private puffCursor=0;private steamClock=0;private time=0;

    constructor(scene:THREE.Scene,lamps:readonly StreetLampPosition[]){
        this.root.name='feel-city-reactions';
        this.lamps=lamps.map(([x,z])=>new THREE.Vector3(x,STREET_LAMP_HEIGHT+.2,z));
        const p=FEEL.city.params;
        lamps.forEach(([x,z],i)=>{
            const {alongX,center}=roadAxis(x,z);
            const inward=alongX?Math.sign(center-z):Math.sign(center-x);
            if(i%Math.max(1,Math.round(p.flockEvery))===0){
                // A flock on the road beside the lamp, with some newspapers.
                const fx=alongX?x+2:x+inward*3,fz=alongX?z+inward*3:z+2;
                for(let b=0;b<5;b++){
                    const home=new THREE.Vector3(fx+Math.cos(b*2.4)*1.1,0,fz+Math.sin(b*2.4)*1.1);
                    this.birds.push({home,position:home.clone(),velocity:new THREE.Vector3(),flying:false,away:0,phase:b*1.7+i,yaw:b*1.3+i});
                }
                for(let n=0;n<3;n++){
                    const home=new THREE.Vector3(fx+Math.cos(n*2.1+1)*2.2,.02,fz+Math.sin(n*2.1+1)*2.2);
                    this.papers.push({home,position:home.clone(),velocity:new THREE.Vector3(),spin:new THREE.Vector3(),rotation:new THREE.Euler(0,n*1.9+i,0),airborne:false});
                }
            }
            if(i%Math.max(1,Math.round(p.canEvery))===1){
                const home=new THREE.Vector3(alongX?x+1.3:x,0,alongX?z:z+1.3);
                this.cans.push({home,position:home.clone(),velocity:new THREE.Vector3(),tip:0,tipVelocity:0,yaw:i*.7,down:0});
            }
        });
        const pigeon=new THREE.SphereGeometry(.16,8,6).scale(1,.8,1.5);
        const wing=new THREE.BoxGeometry(.5,.03,.18);
        this.birdMesh=this.instanced(mergeTwo(pigeon,wing),new THREE.MeshStandardMaterial({color:0x8f8b9a,roughness:.9}),this.birds.length);
        this.paperMesh=this.instanced(new THREE.PlaneGeometry(.55,.4).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({color:0xcfc6ae,roughness:1,side:THREE.DoubleSide}),this.papers.length);
        this.canMesh=this.instanced(new THREE.CylinderGeometry(.3,.26,.8,12).translate(0,.4,0),new THREE.MeshStandardMaterial({color:0x3d4148,roughness:.55,metalness:.5}),this.cans.length);
        this.steamMesh=this.instanced(new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:0xb9b4c4,roughness:1,transparent:true,opacity:.22,depthWrite:false}),this.puffs.length);
        this.bulbMesh=this.instanced(new THREE.SphereGeometry(.7,10,8),new THREE.MeshBasicMaterial({color:0xffd9a0,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}),8);
        this.bulbMesh.count=0;this.steamMesh.count=0;
        scene.add(this.root);
        this.writeRest();
    }

    private instanced(geometry:THREE.BufferGeometry,material:THREE.Material,count:number):THREE.InstancedMesh {
        const mesh=new THREE.InstancedMesh(geometry,material,Math.max(1,count));
        mesh.count=count;mesh.frustumCulled=false;mesh.castShadow=false;this.meshes.push(mesh);this.root.add(mesh);return mesh;
    }

    /** A cheese impact or blast at `point`; `energy` ~1 for a ball, 3+ for explosions/launches. */
    impact(point:Point,energy:number):void {
        if(!feelState().on('city'))return;
        const scare=FEEL.city.params.scare*Math.sqrt(Math.max(.5,energy));
        for(const bird of this.birds)if(!bird.flying&&distance(bird.position,point)<scare)this.flush(bird,point);
        for(const paper of this.papers){
            const d=distance(paper.position,point);
            if(d<1.5+energy*1.2){
                paper.airborne=true;
                paper.velocity.set(paper.position.x-point.x,0,paper.position.z-point.z).setLength(1.5+energy).setY(2.5+energy*1.5);
                paper.spin.set(Math.random()*8-4,Math.random()*6-3,Math.random()*8-4);
            }
        }
        for(const can of this.cans){
            const d=distance(can.position,point);
            if(d<.9+energy*.9&&can.tip<.1){
                can.yaw=Math.atan2(can.position.x-point.x,can.position.z-point.z);
                can.tipVelocity=4+energy*2;can.velocity.set(Math.sin(can.yaw),0,Math.cos(can.yaw)).multiplyScalar(1+energy);can.down=0;
            }
        }
        for(const lamp of this.lamps)if(distance(lamp,point)<1.6&&this.bulbs.length<8)this.bulbs.push({position:lamp,age:0});
        if(Math.hypot(point.x-SEWER_MANHOLE.x,point.z-SEWER_MANHOLE.z)<4)for(let i=0;i<4;i++)this.puff(1.4);
    }

    /** Rats walking through a flock startle it. */
    proximity(rats:Iterable<{position:THREE.Vector3}>):void {
        if(!feelState().on('city'))return;
        for(const rat of rats)for(const bird of this.birds)
            if(!bird.flying&&Math.abs(bird.position.x-rat.position.x)<3&&Math.abs(bird.position.z-rat.position.z)<3&&rat.position.y<3)this.flush(bird,rat.position);
    }

    private flush(bird:Bird,from:Point):void {
        bird.flying=true;bird.away=0;
        bird.velocity.set(bird.position.x-from.x,0,bird.position.z-from.z);
        if(bird.velocity.lengthSq()<.01)bird.velocity.set(Math.cos(bird.phase),0,Math.sin(bird.phase));
        bird.velocity.setLength(5+Math.random()*3).setY(6+Math.random()*2);
        bird.yaw=Math.atan2(bird.velocity.x,bird.velocity.z);
    }

    private puff(size:number):void {
        const puff=this.puffs[this.puffCursor++%this.puffs.length]!;
        puff.position.set(SEWER_MANHOLE.x+(Math.random()-.5)*1.2,.2,SEWER_MANHOLE.z+(Math.random()-.5)*1.2);
        puff.age=0;puff.life=2.2+Math.random();puff.size=size*(.5+Math.random()*.3);
    }

    update(dt:number):void {
        if(!feelState().on('city')){if(this.root.visible)this.root.visible=false;return;}
        this.root.visible=true;
        dt=Math.min(dt,.05);this.time+=dt;
        const respawn=FEEL.city.params.respawn;
        // Birds: peck in place, or flee up and away, then return later.
        this.birds.forEach((bird,i)=>{
            if(bird.flying){
                bird.away+=dt;bird.velocity.y=Math.max(1.5,bird.velocity.y-dt*1.5);bird.position.addScaledVector(bird.velocity,dt);
                if(bird.away>respawn){bird.flying=false;bird.position.copy(bird.home);}
            }
            const flap=bird.flying?Math.sin(this.time*28+bird.phase):0,peck=bird.flying?0:Math.max(0,Math.sin(this.time*3+bird.phase))*.25;
            this.dummy.position.copy(bird.position).setY(bird.position.y+.14);
            this.dummy.rotation.set(peck,bird.yaw,flap*.6);
            // Out of sight once well away; they reappear at home after `respawn` seconds.
            if(bird.flying&&bird.away>4)this.dummy.scale.setScalar(0);else this.dummy.scale.set(bird.flying?1:.45+.1*Math.sin(bird.phase),1,1);
            this.dummy.updateMatrix();this.birdMesh.setMatrixAt(i,this.dummy.matrix);
        });
        this.papers.forEach((paper,i)=>{
            if(paper.airborne){
                paper.velocity.y-=dt*3;paper.velocity.multiplyScalar(Math.exp(-1.6*dt));
                paper.position.addScaledVector(paper.velocity,dt);
                paper.rotation.x+=paper.spin.x*dt;paper.rotation.y+=paper.spin.y*dt;paper.rotation.z+=paper.spin.z*dt;
                if(paper.position.y<=.02&&paper.velocity.y<0){paper.position.y=.02;paper.airborne=false;paper.rotation.x=paper.rotation.z=0;}
            }
            this.dummy.position.copy(paper.position);this.dummy.rotation.copy(paper.rotation);this.dummy.scale.setScalar(1);
            this.dummy.updateMatrix();this.paperMesh.setMatrixAt(i,this.dummy.matrix);
        });
        this.cans.forEach((can,i)=>{
            if(can.tipVelocity>0||can.tip>0){
                can.tip=Math.min(Math.PI/2,can.tip+can.tipVelocity*dt);
                if(can.tip>=Math.PI/2)can.tipVelocity=0;
                can.velocity.multiplyScalar(Math.exp(-3*dt));can.position.addScaledVector(can.velocity,dt);
                if(can.tip>=Math.PI/2&&(can.down+=dt)>respawn){can.tip=0;can.position.copy(can.home);can.velocity.set(0,0,0);}
            }
            this.dummy.position.copy(can.position);this.dummy.rotation.set(0,can.yaw,0);this.dummy.rotateX(can.tip);this.dummy.scale.setScalar(1);
            this.dummy.updateMatrix();this.canMesh.setMatrixAt(i,this.dummy.matrix);
        });
        if((this.steamClock-=dt)<=0){this.steamClock=.35+Math.random()*.4;this.puff(1);}
        let puffs=0;
        for(const puff of this.puffs){
            if((puff.age+=dt)>=puff.life)continue;
            const t=puff.age/puff.life;
            this.dummy.position.copy(puff.position).setY(puff.position.y+t*3.2);this.dummy.rotation.set(0,0,0);
            this.dummy.scale.setScalar(puff.size*(.4+t*1.4)*(1-t*t));
            this.dummy.updateMatrix();this.steamMesh.setMatrixAt(puffs++,this.dummy.matrix);
        }
        this.steamMesh.count=puffs;
        let bulbs=0;
        for(let i=this.bulbs.length-1;i>=0;i--){
            const bulb=this.bulbs[i]!;
            if((bulb.age+=dt)>.55){this.bulbs.splice(i,1);continue;}
            // Three quick stutters.
            const on=Math.floor(bulb.age/.09)%2===0;
            this.dummy.position.copy(bulb.position);this.dummy.rotation.set(0,0,0);this.dummy.scale.setScalar(on?1.3:.35);
            this.dummy.updateMatrix();this.bulbMesh.setMatrixAt(bulbs++,this.dummy.matrix);
        }
        this.bulbMesh.count=bulbs;
        for(const mesh of this.meshes)mesh.instanceMatrix.needsUpdate=true;
    }

    reset():void {
        for(const bird of this.birds){bird.flying=false;bird.position.copy(bird.home);}
        for(const paper of this.papers){paper.airborne=false;paper.position.copy(paper.home);}
        for(const can of this.cans){can.tip=can.tipVelocity=0;can.position.copy(can.home);can.velocity.set(0,0,0);}
        this.bulbs.length=0;this.writeRest();
    }
    private writeRest():void {this.update(0);}

    dispose():void {
        this.root.removeFromParent();
        for(const mesh of this.meshes){mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();mesh.dispose();}
    }
}

let registered:CityReactions|undefined;
/** The scene-wide city reactions fed by chaos impacts. */
export function registerCity(city:CityReactions|undefined):void {registered=city;}
export function cityImpact(point:Point,energy:number):void {registered?.impact(point,energy);}

/** Per impact against every bird, paper, can and lamp: no Math.hypot, which allocates its arguments. */
function distance(a:Point,b:Point):number {const x=a.x-b.x,y=a.y-b.y,z=a.z-b.z;return Math.sqrt(x*x+y*y+z*z);}

/** Pigeon body plus a wing slab as one non-indexed geometry. */
function mergeTwo(a:THREE.BufferGeometry,b:THREE.BufferGeometry):THREE.BufferGeometry {
    const parts=[a.index?a.toNonIndexed():a,b.index?b.toNonIndexed():b];
    const positions:number[]=[],normals:number[]=[];
    for(const part of parts){positions.push(...part.getAttribute('position').array);normals.push(...part.getAttribute('normal').array);}
    const merged=new THREE.BufferGeometry();
    merged.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    merged.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    for(const part of [a,b,...parts])part.dispose();
    return merged;
}

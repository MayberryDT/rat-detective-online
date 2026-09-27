import * as THREE from 'three';
import type {StreetLampPosition} from '../shared/streetLampLayout';
import {feelState} from './feelState';
import {FEEL} from './feelTuning';

/** Soft vertical gradient (bright at the lamp end) for wet-street reflection streaks. */
function streakTexture():THREE.CanvasTexture|undefined {
    if(typeof document==='undefined')return undefined;
    const canvas=document.createElement('canvas');canvas.width=16;canvas.height=128;
    const g=canvas.getContext('2d');if(!g)return undefined;
    const gradient=g.createLinearGradient(0,0,0,128);
    gradient.addColorStop(0,'rgba(255,255,255,0.95)');gradient.addColorStop(.35,'rgba(255,255,255,.45)');gradient.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=gradient;g.fillRect(0,0,16,128);
    const side=g.createLinearGradient(0,0,16,0);side.addColorStop(0,'rgba(0,0,0,1)');side.addColorStop(.5,'rgba(0,0,0,0)');side.addColorStop(1,'rgba(0,0,0,1)');
    g.globalCompositeOperation='destination-out';g.fillStyle=side;g.fillRect(0,0,16,128);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}

/** Noir N3: rain around the view, splashes, and warm lamp reflections streaking
 * across the wet street toward the camera. Outdoors only (not indoors or in the
 * sewers). Three instanced draws; the rain sound is driven by `level`. */
export class NoirRain {
    private readonly root=new THREE.Group();
    private readonly drops:THREE.InstancedMesh;
    private readonly splashes:THREE.InstancedMesh;
    private readonly glints:THREE.InstancedMesh;
    private readonly positions:Float32Array;
    private readonly splashAges:Float32Array;
    private readonly splashPoints:Float32Array;
    private readonly lamps:THREE.Vector3[];
    private readonly dummy=new THREE.Object3D();
    private readonly toCamera=new THREE.Vector3();
    private splashCursor=0;private seed=12345;
    /** Current audible/visible rain amount, 0…1. */
    level=0;

    constructor(scene:THREE.Scene,lamps:readonly StreetLampPosition[],private readonly count:number){
        this.root.name='noir-rain';this.root.userData.noNoir=true;
        this.lamps=lamps.map(([x,z])=>new THREE.Vector3(x,0,z));
        this.drops=new THREE.InstancedMesh(new THREE.PlaneGeometry(.02,1.1),
            new THREE.MeshBasicMaterial({color:0xb7c2d6,transparent:true,opacity:.32,depthWrite:false,fog:true}),count);
        this.splashes=new THREE.InstancedMesh(new THREE.RingGeometry(.05,.11,10).rotateX(-Math.PI/2),
            new THREE.MeshBasicMaterial({color:0xc9d2e2,transparent:true,opacity:.45,depthWrite:false}),64);
        const map=streakTexture();
        this.glints=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1).translate(0,-.5,0).rotateX(-Math.PI/2),
            new THREE.MeshBasicMaterial({color:0xffcf96,map,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}),Math.max(1,this.lamps.length));
        for(const mesh of [this.drops,this.splashes,this.glints]){mesh.frustumCulled=false;mesh.castShadow=false;this.root.add(mesh);}
        this.positions=new Float32Array(count*3);
        for(let i=0;i<count;i++){this.place(i);this.positions[i*3+1]=this.random()*25;}
        this.splashAges=new Float32Array(64).fill(Infinity);this.splashPoints=new Float32Array(64*2);
        scene.add(this.root);
    }

    /** Horizontal drop position around the camera, never right in front of the lens. */
    private place(i:number):void {
        const angle=this.random()*Math.PI*2,radius=3+Math.sqrt(this.random())*27;
        this.positions[i*3]=Math.cos(angle)*radius;this.positions[i*3+2]=Math.sin(angle)*radius;
    }
    private random():number {this.seed=(this.seed*1103515245+12345)&0x7fffffff;return this.seed/0x7fffffff;}

    /** `outdoors` false indoors or underground: rain and reflections fade out. */
    update(dt:number,camera:THREE.Camera,outdoors:boolean):void {
        const on=feelState().on('noirRain'),strength=feelState().noir(),target=on&&outdoors?Math.min(1,strength/.65):0;
        this.level+=(target-this.level)*(1-Math.exp(-2.5*Math.min(dt,.1)));
        if(this.level<.01){if(this.root.visible)this.root.visible=false;this.level=target>0?this.level:0;return;}
        this.root.visible=true;
        const p=FEEL.noirRain.params,cx=camera.position.x,cy=camera.position.y,cz=camera.position.z;
        const yaw=Math.atan2(camera.matrixWorld.elements[8],camera.matrixWorld.elements[10]);
        // Rain: a box of drops that follows the camera and wraps.
        const fall=p.speed*dt,visible=Math.round(this.count*this.level);
        for(let i=0;i<visible;i++){
            let x=this.positions[i*3]!,y=this.positions[i*3+1]!-fall,z=this.positions[i*3+2]!;
            if(y<0){y+=25;this.place(i);x=this.positions[i*3]!;z=this.positions[i*3+2]!;
                if(i%9===0&&cy<20){const s=this.splashCursor++%64;this.splashAges[s]=0;this.splashPoints[s*2]=cx+x;this.splashPoints[s*2+1]=cz+z;}}
            this.positions[i*3+1]=y;
            this.dummy.position.set(cx+x,cy-6+y,cz+z);this.dummy.rotation.set(0,yaw,p.slant);this.dummy.scale.set(1,1,1);
            this.dummy.updateMatrix();this.drops.setMatrixAt(i,this.dummy.matrix);
        }
        this.drops.count=visible;
        (this.drops.material as THREE.MeshBasicMaterial).opacity=.32*this.level;
        let splashes=0;
        for(let s=0;s<64;s++){
            if((this.splashAges[s]!+=dt)>.3)continue;
            const t=this.splashAges[s]!/.3;
            this.dummy.position.set(this.splashPoints[s*2]!,.03,this.splashPoints[s*2+1]!);this.dummy.rotation.set(0,0,0);this.dummy.scale.setScalar(.6+t*1.6);
            this.dummy.updateMatrix();this.splashes.setMatrixAt(splashes++,this.dummy.matrix);
        }
        this.splashes.count=splashes;
        // Wet street: each nearby lamp smears a warm streak along the ground toward the camera.
        let glints=0;
        for(const lamp of this.lamps){
            this.toCamera.set(cx-lamp.x,0,cz-lamp.z);
            const distance=this.toCamera.length();
            if(distance>p.reflectRange||distance<1)continue;
            const length=Math.min(p.reflectLength,distance*.8);
            this.dummy.position.set(lamp.x,.02,lamp.z);
            this.dummy.rotation.set(0,Math.atan2(this.toCamera.x,this.toCamera.z),0);
            this.dummy.scale.set(p.reflectWidth,1,length);
            this.dummy.updateMatrix();this.glints.setMatrixAt(glints++,this.dummy.matrix);
        }
        this.glints.count=glints;
        (this.glints.material as THREE.MeshBasicMaterial).opacity=p.reflectOpacity*this.level*Math.min(1,strength/.65);
        for(const mesh of [this.drops,this.splashes,this.glints])mesh.instanceMatrix.needsUpdate=true;
    }

    dispose():void {
        this.root.removeFromParent();
        for(const mesh of [this.drops,this.splashes,this.glints]){
            const material=mesh.material as THREE.MeshBasicMaterial;material.map?.dispose();material.dispose();mesh.geometry.dispose();mesh.dispose();
        }
    }
}


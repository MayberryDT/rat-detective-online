import * as THREE from 'three';
import {LANDMARK_INTERIORS} from '../shared/landmarkLayout';
import {feelState} from './feelState';
import {FEEL} from './feelTuning';

const NEON:readonly [string,number][]=[['HOTEL',0xff3b4f],['JAZZ',0x2fe0d0],['BAR',0xff3b4f],['DINER',0x2fe0d0],['NOIR',0xff3b4f],['CHEESE',0xffb03a],['OPEN',0x2fe0d0],['DETECTIVE',0xff3b4f]];

function canvas(width:number,height:number):{c:HTMLCanvasElement;g:CanvasRenderingContext2D}|undefined {
    if(typeof document==='undefined')return undefined;
    const c=document.createElement('canvas');c.width=width;c.height=height;const g=c.getContext('2d');
    return g?{c,g}:undefined;
}
/** Warm slats of window light with soft edges. */
function blindTexture():THREE.CanvasTexture|undefined {
    const made=canvas(128,128);if(!made)return undefined;
    const {c,g}=made;
    for(let i=0;i<7;i++){
        const y=8+i*17,gradient=g.createLinearGradient(0,y,0,y+10);
        gradient.addColorStop(0,'rgba(255,220,160,0)');gradient.addColorStop(.5,'rgba(255,220,160,1)');gradient.addColorStop(1,'rgba(255,220,160,0)');
        g.fillStyle=gradient;g.fillRect(10,y,108,10);
    }
    g.globalCompositeOperation='destination-in';
    const edge=g.createRadialGradient(64,64,20,64,64,70);edge.addColorStop(0,'rgba(0,0,0,1)');edge.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=edge;g.fillRect(0,0,128,128);
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
/** A neon word with its own glow. */
function neonTexture(text:string,color:number):THREE.CanvasTexture|undefined {
    const made=canvas(512,160);if(!made)return undefined;
    const {c,g}=made,hex=`#${color.toString(16).padStart(6,'0')}`;
    g.font="bold 92px 'Bangers', Impact, sans-serif";g.textAlign='center';g.textBaseline='middle';
    g.lineWidth=7;g.strokeStyle=hex;g.shadowColor=hex;g.shadowBlur=36;
    for(let i=0;i<3;i++)g.strokeText(text,256,84);
    g.shadowBlur=10;g.lineWidth=3;g.strokeStyle='#fff4ec';g.strokeText(text,256,84);
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}

interface Sign {mesh:THREE.Mesh;material:THREE.MeshBasicMaterial;flicker:number;phase:number}

/** Noir N5 (venetian-blind light on landmark interior floors) and N7 (neon signs
 * on landmark facades, the city's only saturated colour; they buzz and flicker).
 * Decals and emissive planes only: no new lights, no collision. */
export class NoirDressing {
    readonly root=new THREE.Group();
    private readonly blinds:THREE.InstancedMesh;
    private readonly signs:Sign[]=[];
    private time=0;private seed=4242;

    constructor(scene:THREE.Scene){
        this.root.name='noir-dressing';this.root.userData.noNoir=true;
        const slats:THREE.Matrix4[]=[],dummy=new THREE.Object3D();
        for(const hall of LANDMARK_INTERIORS)for(const level of hall.levels)for(const side of [-1,1])for(const along of [-.25,.2]){
            dummy.position.set(hall.cx+along*hall.w,level+.04,hall.cz+side*(hall.d/2-4));
            dummy.rotation.set(-Math.PI/2,0,side*.35+along);dummy.scale.set(9,6.5,1);dummy.updateMatrix();slats.push(dummy.matrix.clone());
        }
        this.blinds=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:blindTexture(),transparent:true,opacity:0,
            blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2}),Math.max(1,slats.length));
        slats.forEach((matrix,i)=>this.blinds.setMatrixAt(i,matrix));this.blinds.count=slats.length;
        this.blinds.frustumCulled=false;this.root.add(this.blinds);
        const plane=new THREE.PlaneGeometry(1,1);
        LANDMARK_INTERIORS.forEach((hall,h)=>{
            for(const [face,index] of [['south',h*2],['east',h*2+1]] as const){
                const [text,color]=NEON[index%NEON.length]!;
                const material=new THREE.MeshBasicMaterial({map:neonTexture(text,color),transparent:true,opacity:0,
                    blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,side:THREE.DoubleSide,forceSinglePass:true});
                const mesh=new THREE.Mesh(plane,material);mesh.name='noir-neon';
                const width=Math.min(9,1.4+text.length*1.05);mesh.scale.set(width,width*.31,1);
                if(face==='south'){mesh.position.set(hall.cx+hall.w*.18,9.5,hall.cz+hall.d/2+.35);}
                else{mesh.position.set(hall.cx+hall.w/2+.35,10.5,hall.cz-hall.d*.12);mesh.rotation.y=Math.PI/2;}
                this.root.add(mesh);this.signs.push({mesh,material,flicker:0,phase:h*1.7+index});
            }
        });
        scene.add(this.root);
    }

    private random():number {this.seed=(this.seed*1103515245+12345)&0x7fffffff;return this.seed/0x7fffffff;}

    update(dt:number):void {
        dt=Math.min(Math.max(dt,0),.1);this.time+=dt;
        const state=feelState(),strength=state.noir();
        (this.blinds.material as THREE.MeshBasicMaterial).opacity=state.on('noirBlinds')?FEEL.noirBlinds.params.opacity*Math.min(1,strength/.65):0;
        this.blinds.visible=state.on('noirBlinds')&&strength>0;
        const neonOn=state.on('noirNeon')&&strength>0,p=FEEL.noirNeon.params;
        for(const sign of this.signs){
            sign.mesh.visible=neonOn;if(!neonOn)continue;
            // Occasional buzzing stutter; otherwise a faint hum in brightness.
            if(sign.flicker<=0&&this.random()<dt*p.flickerRate)sign.flicker=.35+this.random()*.5;
            let level=.92+.08*Math.sin(this.time*7+sign.phase);
            if(sign.flicker>0){sign.flicker-=dt;level*=Math.sin(sign.flicker*60)>0?1:.15;}
            sign.material.opacity=p.brightness*level;
        }
    }

    dispose():void {
        this.root.removeFromParent();
        const blind=this.blinds.material as THREE.MeshBasicMaterial;blind.map?.dispose();blind.dispose();this.blinds.geometry.dispose();this.blinds.dispose();
        for(const sign of this.signs){sign.material.map?.dispose();sign.material.dispose();}
        this.signs[0]?.mesh.geometry.dispose();
    }
}

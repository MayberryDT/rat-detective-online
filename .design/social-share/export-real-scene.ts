import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { writeFile } from 'node:fs/promises';
import { CityGenerator } from '../../src/world/CityGenerator';
import { cityStreetBuildings } from '../../src/shared/cityPlan';
import { CENTRAL_BUILDINGS } from '../../src/shared/skyline';
import { generateBuildingLayout } from '../../src/shared/worldSpec';
import { createRatMesh } from '../../src/utils/RatModel';
import { addLeatherBriefcase } from '../../src/prototype/CaseModel';

// Canvas is only used to paint the game's own authored facade/road atlases.
// This tiny offscreen implementation preserves those pixels without opening a browser.
import sharp from 'sharp';
class StubCanvas {
 private w=1;private h=1;pixels=new Uint8ClampedArray(4);
 get width(){return this.w;}set width(v:number){this.w=v;this.pixels=new Uint8ClampedArray(this.w*this.h*4);}
 get height(){return this.h;}set height(v:number){this.h=v;this.pixels=new Uint8ClampedArray(this.w*this.h*4);}
 context:any;
 getContext(){
  if(!this.context){const canvas=this;this.context={fillStyle:'#000000',_flip:false,
   translate(){},scale(_x:number,y:number){this._flip=y<0;},
   fillRect(x:number,y:number,w:number,h:number){
    const c=String(this.fillStyle);let rgb:number[];
    if(c[0]==='#'){const v=c.slice(1);rgb=[0,2,4].map(i=>parseInt(v.slice(i,i+2),16));}
    else rgb=(c.match(/\d+/g)||[]).slice(0,3).map(Number);
    for(let yy=Math.max(0,Math.floor(y));yy<Math.min(canvas.h,Math.ceil(y+h));yy++)
     for(let xx=Math.max(0,Math.floor(x));xx<Math.min(canvas.w,Math.ceil(x+w));xx++){
      const i=(yy*canvas.w+xx)*4;canvas.pixels[i]=rgb[0];canvas.pixels[i+1]=rgb[1];canvas.pixels[i+2]=rgb[2];canvas.pixels[i+3]=255;
     }
   },
   drawImage(image:StubCanvas,_x:number,_y:number,w:number,h:number){
    for(let y=0;y<canvas.h;y++)for(let x=0;x<canvas.w;x++){
     const sx=Math.min(image.width-1,Math.floor(x/w*image.width));
     const sy=Math.min(image.height-1,Math.floor((this._flip?canvas.h-1-y:y)/h*image.height));
     const i=(y*canvas.w+x)*4,j=(sy*image.width+sx)*4;
     canvas.pixels.set(image.pixels.subarray(j,j+4),i);
    }
   }
  };}return this.context;
 }
 toBlob(callback:(b:Blob)=>void){sharp(Buffer.from(this.pixels),{raw:{width:this.w,height:this.h,channels:4}}).png().toBuffer().then(b=>callback(new Blob([b],{type:'image/png'})));}
}
(globalThis as any).document={createElement:(name:string)=>{if(name!=='canvas')throw new Error(name);return new StubCanvas();}};
(globalThis as any).HTMLCanvasElement=StubCanvas;
(globalThis as any).FileReader=class {result:any=null;onloadend:any=null;readAsArrayBuffer(blob:Blob){blob.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});}};
const scene=new THREE.Scene(),world=new CANNON.World();
const spec={seed:341283204,version:1};
const all=[...cityStreetBuildings(generateBuildingLayout(spec)),...CENTRAL_BUILDINGS];
const layout=all.filter(b=>b.cx>-48&&b.cx<70&&b.cz>-55&&b.cz<90);
const city=new CityGenerator(scene,world,undefined,spec);
city.generate(layout,true);
console.log('buildings',layout.length,'scene objects',scene.children.length,'windows',city.windowLights.length);
const root=new THREE.Group();root.name='REAL GAME ASSETS';
const region=(x:number,z:number)=>x>-45&&x<65&&z>-40&&z<55;
for(const obj of [...scene.children]){
  if(obj instanceof THREE.InstancedMesh){
    for(let i=0;i<obj.count;i++){
      const m=new THREE.Matrix4();obj.getMatrixAt(i,m);
      const p=new THREE.Vector3().setFromMatrixPosition(m);
      if(!region(p.x,p.z))continue;
      const mesh=new THREE.Mesh(obj.geometry,obj.material);
      mesh.applyMatrix4(m);root.add(mesh);
    }
  }else if(obj instanceof THREE.Mesh){
    if(!region(obj.position.x,obj.position.z))continue;
    root.add(obj);
  }
}
// Keep the exact source-generated facade/road texture atlases.
root.traverse(obj=>{
 if(!(obj instanceof THREE.Mesh))return;
 for(const mat of Array.isArray(obj.material)?obj.material:[obj.material])
  for(const key of Object.keys(mat as any))if((mat as any)[key]?.isDataTexture)(mat as any)[key]=null;
});
const windowColors=new Map<number,THREE.Material>();
for(const s of city.windowLights){
 if(s.kind!=='window'||!region(s.x,s.z)||s.y>38)continue;
 let mat=windowColors.get(s.color);
 if(!mat){mat=new THREE.MeshBasicMaterial({color:s.color,side:THREE.DoubleSide});windowColors.set(s.color,mat);}
 const pane=new THREE.Mesh(new THREE.PlaneGeometry(s.width??1.35,s.height??1.4),mat);
 pane.position.set(s.x+s.nx*.04,s.y,s.z+s.nz*.04);
 pane.rotation.y=Math.atan2(s.nx,s.nz);root.add(pane);
}
const appearances=[
 {coatColor:0x273b65,hatColor:0x253453,furColor:0xc19a7c,highlightColor:0xdbc18b},
 {coatColor:0x8b2936,hatColor:0x6b2133,furColor:0xbc8c69,highlightColor:0xe1aa70},
 {coatColor:0x2f654f,hatColor:0x295343,furColor:0xd5aa77,highlightColor:0xc8c494},
];
for(let i=0;i<3;i++){
 const rat=createRatMesh(appearances[i]);rat.name=`game-rat-${i}`;
 // Keep each exact mesh under a top-level node for posing in Blender.
 root.add(rat);
}
const caseRoot=new THREE.Group();caseRoot.name='game-briefcase';
addLeatherBriefcase(caseRoot);
for(const child of caseRoot.children)if(child.name==='case-silhouette-glow')child.visible=false;
root.add(caseRoot);
const cheese=new THREE.Group();cheese.name='game-cheese-ball';
const ball=new THREE.Mesh(new THREE.SphereGeometry(.21,20,14),new THREE.MeshStandardMaterial({color:0xf4c840,roughness:.65,emissive:0x8b4600,emissiveIntensity:.18}));cheese.add(ball);
for(const [x,y,z,r] of [[.08,.13,.17,.035],[-.1,-.03,.17,.027],[.02,-.09,-.18,.034]]){
 const pore=new THREE.Mesh(new THREE.SphereGeometry(r,10,8),new THREE.MeshStandardMaterial({color:0xb88630,roughness:1}));pore.position.set(x,y,z);cheese.add(pore);
}
root.add(cheese);
const data=await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:true});
await writeFile('.design/social-share/real-assets.glb',Buffer.from(data));
console.log('exported glb',Buffer.byteLength(data as ArrayBuffer));

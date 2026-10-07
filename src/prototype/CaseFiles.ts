import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {CLUES,visibleClues,type CaseClue} from '../shared/caseClues';
import type {Vec3Data} from '../shared/networkProtocol';
import {CASE_RED} from './caseRed';

/** Bright physical paperwork, depth-tested against the city. Three instanced draws for the whole trail. */
export class CaseFiles {
    readonly root=new THREE.Group();
    private readonly batches:THREE.InstancedMesh[]=[];
    private readonly frustum=new THREE.Frustum();
    private readonly matrix=new THREE.Matrix4();
    private readonly point=new THREE.Vector3();
    private readonly pose=new THREE.Object3D();
    visibleIds:string[]=[];
    clearSight:(p:Vec3Data)=>boolean=()=>true;
    constructor(){
        this.root.name='physical-case-files';
        const parts:THREE.BufferGeometry[][]=[[],[],[]];
        const part=(kind:number,x:number,y:number,z:number,w:number,h:number,d:number,tilt=0)=>{
            const geometry=new THREE.BoxGeometry(w,h,d);geometry.rotateZ(tilt);geometry.translate(x,y,z);parts[kind]!.push(geometry);
        };
        part(0,0,.025,0,2.6,.05,1.85);part(1,0,.065,0,2.36,.035,1.61);
        part(0,-.65,.028,-.99,.88,.05,.25);part(1,-.65,.068,-.97,.67,.03,.16);
        part(0,.38,.20,.11,1.72,.045,1.24,.16);part(1,.38,.235,.11,1.55,.045,1.07,.16);
        part(0,.18,.30,-.16,.90,.018,.34);part(1,.18,.32,-.16,.70,.012,.16);
        for(let k=0;k<3;k++)part(2,.19,.32,.19+k*.16,.81-k*.10,.012,.025);
        for(const [i,color] of [CASE_RED,0xfff4d4,0x403327].entries()){
            const geometry=mergeGeometries(parts[i]!)!;for(const part of parts[i]!)part.dispose();
            const material=new THREE.MeshBasicMaterial({color,toneMapped:false,fog:false,depthTest:true});
            const mesh=new THREE.InstancedMesh(geometry,material,CLUES.visible);mesh.count=0;mesh.frustumCulled=false;mesh.raycast=()=>{};
            mesh.name='case-paper-'+i;mesh.userData.noNoir=true;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.batches.push(mesh);this.root.add(mesh);
        }
    }
    update(clues:readonly CaseClue[],now:number,camera:THREE.Camera):void {
        camera.updateMatrixWorld();
        this.frustum.setFromProjectionMatrix(this.matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
        const visible=visibleClues(clues,camera.position,now,p=>this.frustum.containsPoint(this.point.set(p.x,p.y+.2,p.z))&&this.clearSight(p));
        this.visibleIds=visible.map(c=>c.id);
        for(const [i,c] of visible.entries()){
            let hash=0;for(const char of c.id)hash=Math.imul(hash,31)+char.charCodeAt(0)|0;
            this.pose.position.set(c.p.x,c.p.y,c.p.z);this.pose.rotation.y=(hash>>>0)%628/100;this.pose.updateMatrix();
            for(const mesh of this.batches)mesh.setMatrixAt(i,this.pose.matrix);
        }
        for(const mesh of this.batches){mesh.count=visible.length;mesh.instanceMatrix.needsUpdate=true;}
    }
    warm():void{for(const mesh of this.batches){mesh.count=1;mesh.setMatrixAt(0,this.matrix.identity());mesh.instanceMatrix.needsUpdate=true;}}
    clear():void{this.visibleIds=[];for(const mesh of this.batches)mesh.count=0;}
    dispose():void{this.root.removeFromParent();for(const mesh of this.batches){mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();mesh.dispose();}}
}

import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {CLUES,visibleClues,type CaseClue} from '../shared/caseClues';
import type {Vec3Data} from '../shared/networkProtocol';
import {CASE_RED} from './caseRed';

/** Small weathered sheets with a thin red perimeter; three instanced draws for the trail. */
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
        const sheet=(w:number,d:number,x:number,z:number,y:number,yaw:number)=>{
            const transform=(g:THREE.BufferGeometry)=>{g.rotateY(yaw);g.translate(x,y,z);return g;};
            // A shallow crease; both paper and rim follow the same piecewise-planar surface.
            const height=(px:number,_pz:number)=>.025*Math.abs(px)/(w/2);
            const paper=new THREE.PlaneGeometry(w,d,4,6);paper.rotateX(-Math.PI/2);
            const positions=paper.getAttribute('position');
            for(let i=0;i<positions.count;i++)positions.setY(i,height(positions.getX(i),positions.getZ(i)));
            paper.computeVertexNormals();parts[1]!.push(transform(paper));
            const border:number[]=[];
            const edge=(ax:number,az:number,bx:number,bz:number)=>{
                for(let i=0;i<6;i++){
                    const t=i/6,u=(i+1)/6;
                    const a=[ax+(bx-ax)*t,az+(bz-az)*t],b=[ax+(bx-ax)*u,az+(bz-az)*u];
                    const inner=(p:number[])=>[p[0]!*(1-.024/w),p[1]!*(1-.024/d)];
                    const c=inner(a),e=inner(b);
                    for(const p of [a,c,b,b,c,e])border.push(p[0]!,height(p[0]!,p[1]!)+.003,p[1]!);
                }
            };
            edge(-w/2,-d/2,w/2,-d/2);edge(w/2,-d/2,w/2,d/2);
            edge(w/2,d/2,-w/2,d/2);edge(-w/2,d/2,-w/2,-d/2);
            const rim=new THREE.BufferGeometry();rim.setAttribute('position',new THREE.Float32BufferAttribute(border,3));rim.computeVertexNormals();parts[0]!.push(transform(rim));
            for(let k=0;k<5;k++){
                const line=new THREE.PlaneGeometry(w*(k===4?.35:.58),.009,8);line.rotateX(-Math.PI/2);
                line.translate(-w*.06,0,-d*.25+k*d*.10);
                const ink=line.getAttribute('position');
                for(let i=0;i<ink.count;i++)ink.setY(i,height(ink.getX(i),ink.getZ(i))+.004);
                line.computeVertexNormals();parts[2]!.push(transform(line));
            }
        };
        sheet(.72,1.02,0,0,0,-.12);
        sheet(.60,.85,.22,.08,.012,.38);
        const materials=[
            new THREE.MeshBasicMaterial({color:CASE_RED,side:THREE.DoubleSide,toneMapped:false}),
            new THREE.MeshStandardMaterial({color:0xb9ad8f,roughness:1,side:THREE.DoubleSide}),
            new THREE.MeshStandardMaterial({color:0x514b40,roughness:1,side:THREE.DoubleSide}),
        ];
        for(const [i,material] of materials.entries()){
            const geometry=mergeGeometries(parts[i]!)!;for(const part of parts[i]!)part.dispose();
            const mesh=new THREE.InstancedMesh(geometry,material,CLUES.visible);mesh.count=0;mesh.frustumCulled=false;mesh.raycast=()=>{};
            mesh.name='case-paper-'+i;mesh.userData.noNoir=i===0;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
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
            this.pose.position.set(c.p.x,c.p.y,c.p.z);this.pose.rotation.y=(hash>>>0)%628/100;this.pose.scale.setScalar(.88+((hash>>>8)%25)/100);this.pose.updateMatrix();
            for(const mesh of this.batches)mesh.setMatrixAt(i,this.pose.matrix);
        }
        for(const mesh of this.batches){mesh.count=visible.length;mesh.instanceMatrix.needsUpdate=true;}
    }
    warm():void{for(const mesh of this.batches){mesh.count=1;mesh.setMatrixAt(0,this.matrix.identity());mesh.instanceMatrix.needsUpdate=true;}}
    clear():void{this.visibleIds=[];for(const mesh of this.batches)mesh.count=0;}
    dispose():void{this.root.removeFromParent();for(const mesh of this.batches){mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();mesh.dispose();}}
}

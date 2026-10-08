import * as THREE from 'three';
import {CLUES,type CaseClue} from '../shared/caseClues';
import type {Vec3Data} from '../shared/networkProtocol';
import {casePaperArt} from './CasePaperArt';

export interface PaperSupport {y:number;normal:Vec3Data}
const UP=new THREE.Vector3(0,1,0);
function hashId(id:string):number{let h=2166136261;for(const c of id)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}

/** Four original document families, one lit surface each. GPU depth owns occlusion. */
export class CaseFiles {
    readonly root=new THREE.Group();
    private readonly batches:THREE.InstancedMesh[]=[];
    private readonly material:THREE.MeshStandardMaterial;
    private readonly art=casePaperArt();
    private readonly frustum=new THREE.Frustum();
    private readonly matrix=new THREE.Matrix4();
    private readonly sphere=new THREE.Sphere(new THREE.Vector3(),1.1);
    private readonly pose=new THREE.Object3D();
    private readonly normal=new THREE.Vector3();
    private readonly yaw=new THREE.Quaternion();
    private readonly supports=new Map<string,PaperSupport|null>();
    private selected=new Set<string>();
    visibleIds:string[]=[];
    /** Cached static-city support, not a visibility test. Called once per changed clue. */
    support:(p:Vec3Data)=>PaperSupport|undefined=p=>({y:p.y,normal:{x:0,y:1,z:0}});
    constructor(){
        this.root.name='physical-case-files';
        this.root.userData.noNoir=true; // adopted explicitly with the dynamic dressing path
        this.material=new THREE.MeshStandardMaterial({map:this.art.map,emissiveMap:this.art.edge,
            emissive:0xffffff,emissiveIntensity:.22,roughness:1,metalness:0,side:THREE.DoubleSide});
        for(let family=0;family<4;family++){
            const [w,d]=[[.82,1.10],[.79,1.03],[.43,.96],[.76,.65]][family];
            const geometry=new THREE.PlaneGeometry(w,d,4,6);geometry.rotateX(-Math.PI/2);
            const pos=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
            for(let i=0;i<pos.count;i++){
                const x=pos.getX(i)/w+.5,z=pos.getZ(i)/d+.5;
                const curl=family===0?.035*Math.max(0,(x+z-1.55)/.45):
                    family===1?.008*Math.abs(x-.5):family===2?.027*Math.pow(z,5):.003;
                pos.setY(i,curl);
                uv.setXY(i,((family%2)*512+16+uv.getX(i)*480)/1024,
                    (1024-Math.floor(family/2)*512-496+uv.getY(i)*480)/1024);
            }
            geometry.computeVertexNormals();
            const mesh=new THREE.InstancedMesh(geometry,this.material,CLUES.visible);
            mesh.count=0;mesh.frustumCulled=false;mesh.raycast=()=>{};mesh.receiveShadow=true;
            mesh.name=['case-paper-statement','case-paper-inventory','case-paper-receipt','case-paper-photo'][family];
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.batches.push(mesh);this.root.add(mesh);
        }
    }
    update(clues:readonly CaseClue[],now:number,camera:THREE.Camera):void {
        camera.updateMatrixWorld();
        this.frustum.setFromProjectionMatrix(this.matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
        const live=new Set(clues.map(c=>c.id));for(const id of this.supports.keys())if(!live.has(id))this.supports.delete(id);
        const candidates=clues.filter(c=>{
            this.sphere.center.set(c.p.x,c.p.y+.03,c.p.z);
            return (c.anchored||now-c.at<CLUES.lifeMs)&&this.sphere.center.distanceTo(camera.position)<CLUES.range&&this.frustum.intersectsSphere(this.sphere);
        }).sort((a,b)=>{
            // Small hysteresis stops equally distant instances swapping at the budget edge.
            const score=(c:CaseClue)=>Math.hypot(c.p.x-camera.position.x,c.p.y-camera.position.y,c.p.z-camera.position.z)-(this.selected.has(c.id)?3:0);
            return score(a)-score(b)||a.id.localeCompare(b.id);
        });
        const counts=[0,0,0,0];this.visibleIds=[];
        for(const c of candidates){
            if(this.visibleIds.length===CLUES.visible)break;
            if(!this.supports.has(c.id))this.supports.set(c.id,this.support(c.p)??null);
            const ground=this.supports.get(c.id);if(!ground)continue;
            const hash=hashId(c.id),family=hash%4;
            this.pose.position.set(c.p.x,ground.y+.012,c.p.z);
            this.normal.set(ground.normal.x,ground.normal.y,ground.normal.z).normalize();
            this.pose.quaternion.setFromUnitVectors(UP,this.normal);
            this.yaw.setFromAxisAngle(UP,((hash>>>4)%628)/100);this.pose.quaternion.multiply(this.yaw);
            this.pose.scale.setScalar(.94+((hash>>>12)%13)/100);this.pose.updateMatrix();
            this.batches[family].setMatrixAt(counts[family]++,this.pose.matrix);this.visibleIds.push(c.id);
        }
        this.selected=new Set(this.visibleIds);
        for(const [i,mesh] of this.batches.entries()){mesh.count=counts[i];mesh.instanceMatrix.needsUpdate=true;}
    }
    warm():void{for(const mesh of this.batches){mesh.count=1;mesh.setMatrixAt(0,this.matrix.identity());mesh.instanceMatrix.needsUpdate=true;}}
    clear():void{this.visibleIds=[];this.selected.clear();this.supports.clear();for(const mesh of this.batches)mesh.count=0;}
    dispose():void{this.root.removeFromParent();this.clear();for(const mesh of this.batches){mesh.geometry.dispose();mesh.dispose();}this.material.dispose();this.art.map.dispose();this.art.edge.dispose();}
}

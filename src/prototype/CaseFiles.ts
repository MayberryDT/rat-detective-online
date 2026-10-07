import * as THREE from 'three';
import {CLUES,clueAge,visibleClues,type CaseClue} from '../shared/caseClues';
import type {Vec3Data} from '../shared/networkProtocol';
import {CASE_RED} from './caseRed';

/** Three quiet physical folders. No locator, animation, shadow, light, or per-clue texture. */
export class CaseFiles {
    readonly root=new THREE.Group();
    private readonly groups:THREE.Group[]=[];
    private readonly papers:THREE.MeshBasicMaterial[]=[];
    private readonly geometry=new THREE.BoxGeometry(1,1,1);
    private readonly red=new THREE.MeshBasicMaterial({color:CASE_RED,toneMapped:false,fog:false});
    private readonly ink=new THREE.MeshBasicMaterial({color:0x51453a,toneMapped:false,fog:false});
    private readonly frustum=new THREE.Frustum();
    private readonly matrix=new THREE.Matrix4();
    private readonly point=new THREE.Vector3();
    visibleIds:string[]=[];
    clearSight:(p:Vec3Data)=>boolean=()=>true;
    constructor(){
        this.root.name='physical-case-files';
        for(let i=0;i<CLUES.visible;i++){
            const g=new THREE.Group(),paper=new THREE.MeshBasicMaterial({color:0xeee2bd,toneMapped:false,fog:false});
            this.papers.push(paper);this.groups.push(g);this.root.add(g);
            const part=(m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number)=>{
                const mesh=new THREE.Mesh(this.geometry,m);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.raycast=()=>{};g.add(mesh);return mesh;
            };
            part(this.red,0,.025,0,1.9,.05,1.35);
            part(paper,0,.055,0,1.74,.035,1.19);
            part(this.red,-.48,.028,-.72,.64,.05,.18); // rectangular folder tab, never a pointer
            part(paper,-.48,.058,-.71,.49,.03,.12);
            const sheet=part(paper,.28,.11,.08,1.18,.04,.85);sheet.rotation.z=.075;
            part(this.red,.13,.15,-.12,.65,.012,.25); // broad evidence stamp, no text to decode
            part(paper,.13,.16,-.12,.51,.012,.12);
            for(let k=0;k<3;k++)part(this.ink,.14,.165,.14+k*.12,.59-k*.07,.009,.018);
            g.visible=false;
        }
    }
    update(clues:readonly CaseClue[],now:number,camera:THREE.Camera):void {
        camera.updateMatrixWorld();
        this.frustum.setFromProjectionMatrix(this.matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
        const visible=visibleClues(clues,camera.position,now,p=>this.frustum.containsPoint(this.point.set(p.x,p.y+.12,p.z))&&this.clearSight(p));
        this.visibleIds=visible.map(c=>c.id);
        this.groups.forEach((g,i)=>{
            const c=visible[i];g.visible=!!c;if(!c)return;
            g.position.set(c.p.x,c.p.y,c.p.z);
            let hash=0;for(const char of c.id)hash=Math.imul(hash,31)+char.charCodeAt(0)|0;
            g.rotation.y=(hash>>>0)%628/100; // unrelated to travel or current case
            const age=clueAge(c,now);
            this.papers[i]!.color.setHex([0xeee2bd,0xc8b58e,0x9d947c][age]!);
            // Coarse condition is a shape cue too: the old sheet curls and bunches.
            const sheet=g.children[4]!;sheet.scale.x=1.18-age*.14;sheet.rotation.z=.075+age*.16;
        });
    }
    warm():void{for(const g of this.groups)g.visible=true;}
    clear():void{this.visibleIds=[];for(const g of this.groups)g.visible=false;}
    dispose():void{this.root.removeFromParent();this.geometry.dispose();this.red.dispose();this.ink.dispose();for(const p of this.papers)p.dispose();}
}

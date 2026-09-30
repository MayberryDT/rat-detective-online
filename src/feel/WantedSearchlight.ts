import * as THREE from 'three';
import {freezeStatic} from '../utils/freezeStatic';

const HEIGHT=34, TOP=.25, BOTTOM=2.1;

/** Most Wanted: a police searchlight from the sky that lags a little behind the
 * leader like a real operator tracking them, with a hard pool at their feet. */
export class WantedSearchlight {
    private readonly root=new THREE.Group();
    private readonly aim=new THREE.Vector3();
    private readonly beam:THREE.MeshBasicMaterial;
    private readonly pool:THREE.MeshBasicMaterial;
    private level=0;
    private sway=0;
    constructor(scene:THREE.Scene){
        const glow=(opacity:number,side:THREE.Side)=>new THREE.MeshBasicMaterial({color:0xdfe8ff,transparent:true,opacity,depthWrite:false,
            blending:THREE.AdditiveBlending,side,forceSinglePass:true,fog:false,toneMapped:false});
        this.beam=glow(.14,THREE.DoubleSide);this.pool=glow(.42,THREE.FrontSide);
        const cone=new THREE.Mesh(new THREE.CylinderGeometry(TOP,BOTTOM,HEIGHT,24,1,true),this.beam);cone.position.y=HEIGHT/2;cone.raycast=()=>{};
        const pool=new THREE.Mesh(new THREE.CircleGeometry(BOTTOM*1.1,28),this.pool);pool.rotation.x=-Math.PI/2;pool.position.y=.08;pool.raycast=()=>{};
        this.root.add(cone,pool);this.root.name='most-wanted-searchlight';this.root.userData.noNoir=true;this.root.visible=false;
        // In the scene from the start, hidden, so the load's warm-up links its program, not the first Most Wanted.
        freezeStatic(this.root,[this.root]);scene.add(this.root);
    }
    /** `target` is the wanted rat's feet, or undefined when nobody is wanted. */
    update(dt:number,target:THREE.Vector3|undefined):void {
        if(target&&!this.root.visible)this.aim.copy(target);
        this.level=Math.max(0,Math.min(1,this.level+(target?dt*3:-dt*3)));
        this.root.visible=this.level>0;
        if(!this.root.visible)return;
        if(target)this.aim.lerp(target,1-Math.exp(-6*dt));
        this.sway+=dt;
        this.root.position.set(this.aim.x+Math.sin(this.sway*1.7)*.35,this.aim.y,this.aim.z+Math.cos(this.sway*1.3)*.35);
        this.beam.opacity=.14*this.level;this.pool.opacity=.42*this.level;
    }
    dispose():void {
        this.root.removeFromParent();
        this.root.traverse(child=>{if(child instanceof THREE.Mesh)child.geometry.dispose();});
        this.beam.dispose();this.pool.dispose();
    }
}

import * as THREE from 'three';
import {FEEL} from './feelTuning';
import './feel.css';

const ARROWS=4;
interface Arrow {node:HTMLElement;from:THREE.Vector3|null;age:number;life:number}

/** DOM overlays for screen feedback: edge flash and damage direction arrows.
 * Built lazily so node tests and title screens pay nothing. */
export class ScreenFeel {
    private root?:HTMLElement;
    private edge?:HTMLElement;
    private readonly arrows:Arrow[]=[];
    private edgeLevel=0;
    private readonly local=new THREE.Vector3();
    private readonly inverse=new THREE.Quaternion();

    constructor(private readonly flash:()=>number,private readonly doc:Document|undefined=globalThis.document){}

    /** Red edge flash plus an arrow that keeps pointing at `from` (a live position) while it fades. */
    damage(from:THREE.Vector3|undefined,damage:number):void {
        if(!this.build())return;
        const p=FEEL.damageDirection.params;
        this.edgeLevel=Math.min(1,this.edgeLevel+p.edge*(1+(Math.max(1,damage)-1)*.5));
        if(!from)return;
        const arrow=this.arrows.find(a=>a.from===from)??this.arrows.reduce((a,b)=>a.age/a.life>=b.age/b.life?a:b);
        arrow.from=from;arrow.age=0;arrow.life=p.arrowLife;
    }

    update(dt:number,camera:THREE.Camera,self?:THREE.Vector3):void {
        if(!this.root)return;
        const p=FEEL.damageDirection.params;
        if(this.edge){
            this.edgeLevel=Math.max(0,this.edgeLevel-dt/p.edgeFade);
            this.edge.style.opacity=String(this.edgeLevel*this.flash());
        }
        const radius=Math.min(innerWidth,innerHeight)*p.radius;
        this.inverse.copy(camera.quaternion).invert();
        for(const arrow of this.arrows){
            if(!arrow.from)continue;
            arrow.age+=dt;
            if(arrow.age>=arrow.life){arrow.from=null;arrow.node.style.opacity='0';continue;}
            this.local.copy(arrow.from).sub(self??camera.position).applyQuaternion(this.inverse);
            const angle=Math.atan2(this.local.x,-this.local.z);
            const fade=1-arrow.age/arrow.life;
            arrow.node.style.opacity=String(Math.min(1,fade*1.6));
            arrow.node.style.transform=`rotate(${angle}rad) translateY(${-radius}px)`;
        }
    }

    reset():void {
        this.edgeLevel=0;
        if(this.edge)this.edge.style.opacity='0';
        for(const arrow of this.arrows){arrow.from=null;arrow.node.style.opacity='0';}
    }

    dispose():void {this.root?.remove();this.root=undefined;this.edge=undefined;this.arrows.length=0;}

    private build():boolean {
        if(this.root)return true;
        if(!this.doc?.body)return false;
        this.root=this.doc.createElement('div');this.root.className='feel-screen';this.root.setAttribute('aria-hidden','true');
        this.edge=this.doc.createElement('div');this.edge.className='feel-edge';this.root.appendChild(this.edge);
        for(let i=0;i<ARROWS;i++){
            const node=this.doc.createElement('div');node.className='feel-arrow';this.root.appendChild(node);
            this.arrows.push({node,from:null,age:0,life:1});
        }
        this.doc.body.appendChild(this.root);
        return true;
    }
}

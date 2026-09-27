import * as THREE from 'three';
import {FEEL} from './feelTuning';
import './feel.css';

const ARROWS=4;

/** A small tile of monochrome noise for the film-grain overlay, as a data URL. */
function grainImage(doc:Document):string|undefined {
    const canvas=doc.createElement('canvas');canvas.width=canvas.height=96;
    const g=canvas.getContext?.('2d');if(!g)return undefined;
    const image=g.createImageData(96,96);
    for(let i=0;i<image.data.length;i+=4){const v=Math.random()*255;image.data[i]=image.data[i+1]=image.data[i+2]=v;image.data[i+3]=255;}
    g.putImageData(image,0,0);return canvas.toDataURL();
}
interface Arrow {node:HTMLElement;from:THREE.Vector3|null;age:number;life:number}

/** DOM overlays for screen feedback: edge flash and damage direction arrows.
 * Built lazily so node tests and title screens pay nothing. */
export class ScreenFeel {
    private root?:HTMLElement;
    private edge?:HTMLElement;
    private bloom?:HTMLElement;
    private noirEdge?:HTMLElement;
    private irisNode?:HTMLElement;
    private speedNode?:HTMLElement;
    private calloutNode?:HTMLElement;
    private grainNode?:HTMLElement;
    private vignetteNode?:HTMLElement;
    private lastFilm='';
    private lastSpeed=0;
    private canvas?:HTMLElement;
    private lastFilter='';
    private lastNoir=0;
    private readonly words:HTMLElement[]=[];
    private wordCursor=0;
    private readonly projected=new THREE.Vector3();
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

    /** The game canvas, for the low-health colour drain. */
    attachCanvas(canvas:HTMLElement):void {this.canvas=canvas;}

    /** Low-health noir: `level` 0 (full colour) … 1 (near black and white); `flood` 0…1 is the heal overshoot. */
    noir(level:number,flood:number,filter:boolean):void {
        const key=level*1000+flood;
        if(key===this.lastNoir)return;
        this.lastNoir=key;
        if(!(level>0||flood>0)&&!this.root)return;
        if(!this.build())return;
        const flash=this.flash(),p=FEEL.lowHealth.params,drain=level*flash;
        if(this.noirEdge)this.noirEdge.style.opacity=String(drain*p.vignette);
        if(!this.canvas)return;
        const value=filter&&(drain>.001||flood>.001)?`saturate(${(1-p.drain*drain+p.flood*flood).toFixed(3)}) contrast(${(1+.12*drain).toFixed(3)})`:'';
        if(value!==this.lastFilter){this.canvas.style.filter=value;this.lastFilter=value;}
    }

    /** Noir N6: grain and vignette amount (0…1), and letterbox bars for big moments. */
    film(grain:number,vignette:number,letterbox:boolean):void {
        const key=`${grain.toFixed(2)}|${vignette.toFixed(2)}|${letterbox}`;
        if(key===this.lastFilm)return;
        this.lastFilm=key;
        if(!(grain>0||vignette>0||letterbox)&&!this.root)return;
        if(!this.build())return;
        if(this.grainNode){this.grainNode.style.opacity=grain.toFixed(3);this.grainNode.style.display=grain>0?'':'none';}
        if(this.vignetteNode)this.vignetteNode.style.opacity=vignette.toFixed(3);
        this.root!.classList.toggle('letterboxed',letterbox);
    }

    /** A noir streak callout stamped near the top of the screen. */
    callout(text:string):void {
        if(!this.build()||!this.calloutNode)return;
        this.calloutNode.textContent=text;
        this.calloutNode.classList.remove('on');void this.calloutNode.offsetWidth;this.calloutNode.classList.add('on');
    }

    /** Hot Pursuit edge streaks, `level` 0…1. */
    speed(level:number):void {
        const value=Math.round(level*50)/50;
        if(value===this.lastSpeed)return;
        this.lastSpeed=value;
        if(!this.build()||!this.speedNode)return;
        this.speedNode.style.opacity=String(value*Math.max(.3,this.flash()));
        this.speedNode.classList.toggle('on',value>0);
    }

    /** Iris-out: `closed` 0 (open) … 1 (fully closed to `minRadius` vmax) around `at`. */
    iris(closed:number,at:THREE.Vector3|undefined,camera:THREE.Camera,minRadius:number):void {
        if(closed<=0){if(this.irisNode)this.irisNode.style.opacity='0';return;}
        if(!this.build()||!this.irisNode)return;
        let x=.5,y=.5;
        if(at){this.projected.copy(at).project(camera);if(this.projected.z<1){x=Math.min(.9,Math.max(.1,(this.projected.x+1)/2));y=Math.min(.9,Math.max(.1,(1-this.projected.y)/2));}}
        const eased=closed*closed*(3-2*closed),radius=150-(150-minRadius)*eased;
        const style=this.irisNode.style;
        style.opacity='1';style.setProperty('--iris-x',`${(x*100).toFixed(1)}%`);style.setProperty('--iris-y',`${(y*100).toFixed(1)}%`);style.setProperty('--iris-r',`${radius.toFixed(2)}vmax`);
    }

    /** Pop a comic word over `at` (world position), clamped inside the screen. */
    word(text:string,at:THREE.Vector3,camera:THREE.Camera):void {
        if(!this.build())return;
        const node=this.words[this.wordCursor++%this.words.length]!;
        this.projected.copy(at).project(camera);
        const behind=this.projected.z>1;
        const x=behind?.5:Math.min(.85,Math.max(.15,(this.projected.x+1)/2));
        const y=behind?.35:Math.min(.8,Math.max(.18,(1-this.projected.y)/2-.08));
        node.textContent=text;
        node.style.left=`${x*100}%`;node.style.top=`${y*100}%`;
        node.style.setProperty('--tilt',`${(this.wordCursor%2?-1:1)*(4+this.wordCursor%3*2)}deg`);
        node.classList.remove('on');void node.offsetWidth;node.classList.add('on');
    }

    /** Ring burst around the crosshair for a confirmed kill. */
    killBloom():void {
        if(!this.build()||!this.bloom)return;
        this.bloom.style.setProperty('--feel-flash',String(Math.max(.35,this.flash())));
        this.bloom.classList.remove('on');void this.bloom.offsetWidth;this.bloom.classList.add('on');
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
        this.bloom?.classList.remove('on');
        for(const node of this.words)node.classList.remove('on');
        if(this.noirEdge)this.noirEdge.style.opacity='0';
        if(this.irisNode)this.irisNode.style.opacity='0';
        if(this.speedNode){this.speedNode.style.opacity='0';this.speedNode.classList.remove('on');}
        this.calloutNode?.classList.remove('on');
        this.lastSpeed=0;
        this.lastFilm='';this.root?.classList.remove('letterboxed');
        if(this.canvas&&this.lastFilter){this.canvas.style.filter='';this.lastFilter='';}
        this.lastNoir=0;
    }

    dispose():void {this.reset();this.root?.remove();this.noirEdge=undefined;this.irisNode=undefined;this.speedNode=undefined;this.calloutNode=undefined;this.grainNode=undefined;this.vignetteNode=undefined;this.root=undefined;this.edge=undefined;this.bloom=undefined;this.arrows.length=0;this.words.length=0;}

    private build():boolean {
        if(this.root)return true;
        // Headless/test documents may lack a full DOM; overlays are then simply skipped.
        if(!this.doc?.body||typeof this.doc.createElement!=='function')return false;
        this.root=this.doc.createElement('div');this.root.className='feel-screen';this.root.setAttribute('aria-hidden','true');
        this.noirEdge=this.doc.createElement('div');this.noirEdge.className='feel-noir';this.root.appendChild(this.noirEdge);
        this.vignetteNode=this.doc.createElement('div');this.vignetteNode.className='feel-vignette';this.root.appendChild(this.vignetteNode);
        this.grainNode=this.doc.createElement('div');this.grainNode.className='feel-grain';this.grainNode.style.display='none';
        const noise=grainImage(this.doc);if(noise)this.grainNode.style.backgroundImage=`url(${noise})`;
        this.root.appendChild(this.grainNode);
        for(const edge of ['top','bottom']){const bar=this.doc.createElement('div');bar.className=`feel-letterbox ${edge}`;this.root.appendChild(bar);}
        this.speedNode=this.doc.createElement('div');this.speedNode.className='feel-speed';this.root.appendChild(this.speedNode);
        this.calloutNode=this.doc.createElement('div');this.calloutNode.className='feel-callout';this.root.appendChild(this.calloutNode);
        this.irisNode=this.doc.createElement('div');this.irisNode.className='feel-iris';this.root.appendChild(this.irisNode);
        this.edge=this.doc.createElement('div');this.edge.className='feel-edge';this.root.appendChild(this.edge);
        this.bloom=this.doc.createElement('div');this.bloom.className='feel-kill-bloom';this.root.appendChild(this.bloom);
        for(let i=0;i<3;i++){const node=this.doc.createElement('div');node.className='feel-word';this.root.appendChild(node);this.words.push(node);}
        for(let i=0;i<ARROWS;i++){
            const node=this.doc.createElement('div');node.className='feel-arrow';this.root.appendChild(node);
            this.arrows.push({node,from:null,age:0,life:1});
        }
        this.doc.body.appendChild(this.root);
        return true;
    }
}

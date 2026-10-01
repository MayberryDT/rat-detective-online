import * as THREE from 'three';
import {FEEL} from './feelTuning';
import './feel.css';
import {reducedMotion,replay,scrawl,uiMotion} from '../ui/motion';

const ARROWS=4;

/** A small tile of monochrome noise for the film-grain overlay, as a data URL: an 8-bit grey BMP
 * written directly. Drawing and encoding a canvas instead cost 90–380 ms on its first use (a GPU
 * canvas read back), a frame frozen as play began. */
function grainImage():string {
    const side=96,header=54+256*4,bytes=new Uint8Array(header+side*side),view=new DataView(bytes.buffer);
    bytes[0]=0x42;bytes[1]=0x4d;view.setUint32(2,bytes.length,true);view.setUint32(10,header,true);
    view.setUint32(14,40,true);view.setInt32(18,side,true);view.setInt32(22,side,true);view.setUint16(26,1,true);view.setUint16(28,8,true);view.setUint32(46,256,true);
    for(let i=0;i<256;i++)bytes.fill(i,54+i*4,57+i*4);
    for(let i=header;i<bytes.length;i++)bytes[i]=Math.random()*256;
    return `data:image/bmp;base64,${btoa(String.fromCharCode(...bytes))}`;
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
    private sootNode?:HTMLElement;
    private grainNode?:HTMLElement;
    private vignetteNode?:HTMLElement;
    private claimNode?:HTMLElement;
    private inkNode?:HTMLElement;
    private lensNode?:HTMLElement;
    private caseNode?:HTMLElement;
    private readonly caseSheets:HTMLElement[]=[];
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
    private reticle?:HTMLElement|null;
    private spread=0;
    private spreadTarget=0;
    private lastSpread=-1;

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

    /** Low health: `level` 0 (clear) … 1 (last hit point) sets the edge vignette; `flood` 0…1 is the heal overshoot.
     * The black and white itself is on city materials (`NoirCity`), so rats and cheese keep their colour. */
    noir(level:number,flood:number,filter:boolean):void {
        const key=level*1000+flood;
        if(key===this.lastNoir)return;
        this.lastNoir=key;
        if(!(level>0||flood>0)&&!this.root)return;
        if(!this.build())return;
        const p=FEEL.lowHealth.params;
        if(this.noirEdge)this.noirEdge.style.opacity=String(level*this.flash()*p.vignette);
        if(!this.canvas)return;
        const value=filter&&flood>.001?`saturate(${(1+p.flood*flood).toFixed(3)})`:'';
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

    /** A noir streak callout scrawled near the top of the screen. */
    callout(text:string):void {
        if(!this.build()||!this.calloutNode)return;
        scrawl(this.calloutNode,text);
        replay(this.calloutNode,'on');
    }

    /** Bad Ammunition backfire: a smear of soot across the lens that fades. */
    soot():void {
        if(!this.build()||!this.sootNode)return;
        this.sootNode.style.setProperty('--soot',String(Math.max(.5,this.flash())));
        this.sootNode.style.setProperty('--soot-x',`${(40+Math.random()*30).toFixed(0)}%`);
        replay(this.sootNode,'on');
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
        // Reduced motion: the iris fades in at its final size instead of closing.
        const eased=closed*closed*(3-2*closed),still=reducedMotion(),radius=still?minRadius:150-(150-minRadius)*eased;
        const style=this.irisNode.style;
        style.opacity=still?eased.toFixed(3):'1';style.setProperty('--iris-x',`${(x*100).toFixed(1)}%`);style.setProperty('--iris-y',`${(y*100).toFixed(1)}%`);style.setProperty('--iris-r',`${radius.toFixed(2)}vmax`);
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
        replay(node,'on');
    }

    /** Ring burst around the crosshair for a confirmed kill. */
    killBloom():void {
        if(!this.build()||!this.bloom)return;
        this.bloom.style.setProperty('--feel-flash',String(Math.max(.35,this.flash())));
        replay(this.bloom,'on');
    }

    /** C1: your supply claim: a brief edge flash in the supply's `colour`, `level` × Flash strength. */
    claim(colour:string,level:number):void {
        const strength=level*this.flash();
        if(!(strength>0)||!this.build()||!this.claimNode)return;
        this.claimNode.style.setProperty('--claim',colour);this.claimNode.style.setProperty('--feel-flash',strength.toFixed(3));
        replay(this.claimNode,'on');
    }
    /** K1: you took the case: an ON THE CASE stamp slams in over `sheets` paper sheets bursting out and fluttering down,
     * with a brass edge flash (`flash` × Flash strength). Reduced interface motion keeps the stamp, fading, and no sheets. */
    caseClaim(sheets:number,flash:number):void {
        this.claim('#c39a55',flash);
        if(!this.build()||!this.caseNode)return;
        const still=reducedMotion();
        this.caseSheets.forEach((sheet,i)=>{
            const shown=!still&&i<sheets,angle=i/Math.max(1,sheets)*Math.PI*2+Math.random()*.5,reach=180+Math.random()*220;
            sheet.style.display=shown?'':'none';if(!shown)return;
            sheet.style.setProperty('--dx',`${(Math.cos(angle)*reach).toFixed(0)}px`);sheet.style.setProperty('--dy',`${(Math.sin(angle)*reach*.6-60).toFixed(0)}px`);
            sheet.style.setProperty('--rot',`${((Math.random()*2-1)*220).toFixed(0)}deg`);sheet.style.setProperty('--delay',`${(Math.random()*90).toFixed(0)}ms`);
        });
        replay(this.caseNode,'on');
    }
    /** C2: your Stakeout claim: an ink ripple spreads across the screen from `at`, under a brief magnifying-glass
     * lens vignette lasting `lens` s. Skipped under Reduced interface motion. */
    stakeout(at:THREE.Vector3,camera:THREE.Camera,lens:number):void {
        const strength=this.flash();
        if(!(strength>0)||reducedMotion()||!this.build()||!this.inkNode||!this.lensNode)return;
        this.projected.copy(at).project(camera);
        const behind=this.projected.z>1,x=behind?.5:Math.min(1,Math.max(0,(this.projected.x+1)/2)),y=behind?.6:Math.min(1,Math.max(0,(1-this.projected.y)/2));
        this.inkNode.style.left=`${(x*100).toFixed(1)}%`;this.inkNode.style.top=`${(y*100).toFixed(1)}%`;
        this.inkNode.style.setProperty('--feel-flash',Math.min(1,strength).toFixed(3));replay(this.inkNode,'on');
        this.lensNode.style.setProperty('--feel-flash',Math.min(1,strength).toFixed(3));this.lensNode.style.setProperty('--lens',`${Math.round(lens*1000)}ms`);
        replay(this.lensNode,'on');
    }

    /** U6: the crosshair opens with movement speed (units/s) … */
    crosshairMotion(speed:number):void {const p=FEEL.reactiveCrosshair.params;this.spreadTarget=Math.min(1,speed/p.speed)*p.move;}
    /** … and kicks open on each local shot, easing back as you settle. */
    crosshairKick():void {const p=FEEL.reactiveCrosshair.params;this.spread=Math.min(p.max,this.spread+p.kick);}

    update(dt:number,camera:THREE.Camera,self?:THREE.Vector3):void {
        const cross=FEEL.reactiveCrosshair.params,open=uiMotion('reactiveCrosshair');
        const target=open?this.spreadTarget:0;
        this.spread=open?target+(this.spread-target)*Math.exp(-cross.recover*dt):0;
        const spread=Math.round(this.spread*4)/4;
        if(spread!==this.lastSpread){
            if(this.reticle===undefined)this.reticle=this.doc?.getElementById?.('crosshair')??null;
            this.reticle?.style.setProperty('--spread',`${spread}px`);this.lastSpread=spread;
        }
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
        this.edgeLevel=0;this.spread=0;
        if(this.edge)this.edge.style.opacity='0';
        for(const arrow of this.arrows){arrow.from=null;arrow.node.style.opacity='0';}
        this.bloom?.classList.remove('on');
        for(const node of this.words)node.classList.remove('on');
        if(this.noirEdge)this.noirEdge.style.opacity='0';
        if(this.irisNode)this.irisNode.style.opacity='0';
        if(this.speedNode){this.speedNode.style.opacity='0';this.speedNode.classList.remove('on');}
        this.calloutNode?.classList.remove('on');this.sootNode?.classList.remove('on');
        for(const node of [this.claimNode,this.inkNode,this.lensNode,this.caseNode])node?.classList.remove('on');
        this.lastSpeed=0;
        this.lastFilm='';this.root?.classList.remove('letterboxed');
        if(this.canvas&&this.lastFilter){this.canvas.style.filter='';this.lastFilter='';}
        this.lastNoir=0;
    }

    dispose():void {this.reset();this.root?.remove();this.noirEdge=undefined;this.irisNode=undefined;this.speedNode=undefined;this.calloutNode=undefined;this.sootNode=undefined;this.grainNode=undefined;this.vignetteNode=undefined;this.claimNode=this.inkNode=this.lensNode=this.caseNode=undefined;this.caseSheets.length=0;this.root=undefined;this.edge=undefined;this.bloom=undefined;this.arrows.length=0;this.words.length=0;}

    private build():boolean {
        if(this.root)return true;
        // Headless/test documents may lack a full DOM; overlays are then simply skipped.
        if(!this.doc?.body||typeof this.doc.createElement!=='function')return false;
        this.root=this.doc.createElement('div');this.root.className='feel-screen';this.root.setAttribute('aria-hidden','true');
        this.noirEdge=this.doc.createElement('div');this.noirEdge.className='feel-noir';this.root.appendChild(this.noirEdge);
        this.vignetteNode=this.doc.createElement('div');this.vignetteNode.className='feel-vignette';this.root.appendChild(this.vignetteNode);
        this.grainNode=this.doc.createElement('div');this.grainNode.className='feel-grain';this.grainNode.style.display='none';
        this.grainNode.style.backgroundImage=`url(${grainImage()})`;
        this.root.appendChild(this.grainNode);
        for(const edge of ['top','bottom']){const bar=this.doc.createElement('div');bar.className=`feel-letterbox ${edge}`;this.root.appendChild(bar);}
        this.speedNode=this.doc.createElement('div');this.speedNode.className='feel-speed';this.root.appendChild(this.speedNode);
        this.calloutNode=this.doc.createElement('div');this.calloutNode.className='feel-callout';this.root.appendChild(this.calloutNode);
        this.sootNode=this.doc.createElement('div');this.sootNode.className='feel-soot';this.root.appendChild(this.sootNode);
        this.irisNode=this.doc.createElement('div');this.irisNode.className='feel-iris';this.root.appendChild(this.irisNode);
        this.edge=this.doc.createElement('div');this.edge.className='feel-edge';this.root.appendChild(this.edge);
        this.inkNode=this.doc.createElement('div');this.inkNode.className='feel-ink';this.root.appendChild(this.inkNode);
        this.lensNode=this.doc.createElement('div');this.lensNode.className='feel-lens';this.root.appendChild(this.lensNode);
        this.claimNode=this.doc.createElement('div');this.claimNode.className='feel-claim';this.root.appendChild(this.claimNode);
        this.caseNode=this.doc.createElement('div');this.caseNode.className='feel-case';
        for(let i=0;i<16;i++){const sheet=this.doc.createElement('div');sheet.className='feel-case-sheet';this.caseNode.appendChild(sheet);this.caseSheets.push(sheet);}
        const stamp=this.doc.createElement('div');stamp.className='feel-case-stamp';stamp.textContent='ON THE CASE';this.caseNode.appendChild(stamp);
        this.root.appendChild(this.caseNode);
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

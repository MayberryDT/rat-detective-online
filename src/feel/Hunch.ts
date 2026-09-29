import * as THREE from 'three';
import {MAX_HP} from '../shared/networkProtocol';
import {advanceHunchSketch,type RatEntity} from '../entities/RatEntity';
import type {FeelState} from './feelState';
import type {FeelSound} from './FeelSound';
import {FEEL} from './feelTuning';
import './hunch.css';

export interface HunchRat {readonly entity:RatEntity}
const PHOTOS=4, TRAIL_POINTS=16, TRAIL_EVERY=.11;

interface Photo {node:HTMLElement;caption:HTMLElement;target?:RatEntity;age:number}
interface Trail {line:THREE.Line;points:Float32Array;colors:Float32Array;count:number;timer:number}

/** Rats this client's detective has on the Hunch, and the rats that have it on you.
 * `everyone`: Clean Bill gives every rat the Hunch whatever its health. */
export function hunchReads(self:{position:THREE.Vector3;hp:number;dead:boolean}|undefined,rats:Iterable<[string,HunchRat]>,range:number,
    sensed:Set<string>,watchers:RatEntity[],everyone=false):void {
    sensed.clear();watchers.length=0;
    if(!self||self.dead)return;
    const sharp=everyone||self.hp>=MAX_HP,rangeSq=range*range;
    for(const [id,{entity}] of rats){
        if(entity.dead||entity.hp<=0)continue;
        if(entity.mesh.position.distanceToSquared(self.position)>rangeSq)continue;
        if(sharp)sensed.add(id);
        if(everyone||entity.hp>=MAX_HP)watchers.push(entity);
    }
}

/** The Hunch: at full health you see rats through walls, and anyone at full
 * health can see you. Being read either way is a noir moment: the spotter
 * gets an evidence photo and a shutter, the one spotted gets YOU'VE BEEN MADE,
 * a violin sting and an eye on the screen edge toward the watcher. */
export class Hunch {
    private readonly sensed=new Set<string>();
    private readonly previous=new Set<string>();
    private readonly watchers:RatEntity[]=[];
    private readonly lastMade=new Map<string,number>();
    private readonly trails=new Map<string,Trail>();
    private readonly photos:Photo[]=[];
    private wasWatched=false;
    private holding=false;
    private lastCardAt=-Infinity;
    private supercharged=false;
    private root?:HTMLElement;
    private eye?:HTMLElement;
    private card?:HTMLElement;
    private eyeLevel=0;
    private readonly projected=new THREE.Vector3();
    private readonly local=new THREE.Vector3();
    private readonly inverse=new THREE.Quaternion();
    private readonly material=new THREE.LineBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,depthFunc:THREE.GreaterDepth,
        blending:THREE.AdditiveBlending,fog:false,toneMapped:false});

    /** Always in the scene, never drawn: the trails' program compiles with the title's warm-up. */
    private readonly warmLine=new THREE.Line(new THREE.BufferGeometry(),this.material);

    constructor(private readonly scene:THREE.Scene,private readonly state:FeelState,private readonly sound:FeelSound,
        private readonly doc:Document|undefined=globalThis.document){
        this.warmLine.visible=false;this.warmLine.name='hunch-trail-warm';scene.add(this.warmLine);
    }

    /** Clean Bill: everyone at full health with a city-wide, stronger Hunch. */
    setSupercharged(on:boolean):void {this.supercharged=on;}
    get range():number {const p=FEEL.hunch.params;return this.supercharged?p.superRange:p.range;}

    /** `self` is undefined when there is no live local rat (title, observer, lineup).
     * `wanted`: Most Wanted's target, sketched through walls for everyone. */
    update(dt:number,now:number,view:THREE.Camera,self:RatEntity|undefined,rats:ReadonlyMap<string,HunchRat>,wanted?:string):void {
        advanceHunchSketch(dt);
        const p=FEEL.hunch.params;
        this.previous.clear();for(const id of this.sensed)this.previous.add(id);
        hunchReads(self?{position:self.mesh.position,hp:self.hp,dead:self.dead}:undefined,rats,this.range,this.sensed,this.watchers,this.supercharged);
        const strength=this.supercharged?p.superStrength:p.strength;
        const juice=this.state.on('made');
        // The Hunch as a power-up on your own nameplate: the eye opens at full health and shuts on the first hit.
        const holding=!!self&&!self.dead&&(self.hp>=MAX_HP||this.supercharged);
        if(holding!==this.holding){
            if(holding)this.sound.hunchGained();else if(self&&!self.dead)this.sound.hunchLost();
            this.holding=holding;
        }
        self?.billboard.setHunch(holding);
        let shutter=false;
        for(const [id,{entity}] of rats){
            const on=this.sensed.has(id);
            entity.sense(id===wanted&&self?p.superStrength:on?strength:0);
            if(on&&!this.previous.has(id)&&now-(this.lastMade.get(id)??-Infinity)>p.remake*1000){
                this.lastMade.set(id,now);
                if(juice){shutter=true;this.photo(entity);}
            }
            this.trail(id,entity,on&&juice,dt);
        }
        for(const id of this.trails.keys())if(!rats.has(id))this.dropTrail(id);
        if(shutter)this.sound.shutter();
        // Being made: the card and sting when someone first gets a read on you.
        const watched=this.watchers.length>0;
        if(watched&&!this.wasWatched&&juice&&now-this.lastCardAt>p.cardGap*1000){
            this.lastCardAt=now;this.sound.made();this.showCard();
        }
        this.wasWatched=watched;
        this.present(dt,view,self,juice);
    }

    private photo(entity:RatEntity):void {
        if(!this.build())return;
        const photo=this.photos.find(item=>!item.target)??this.photos.reduce((a,b)=>a.age>=b.age?a:b);
        photo.target=entity;photo.age=0;
        const text=`MADE: ${entity.name.toUpperCase()}`;
        photo.caption.textContent=text;photo.caption.style.setProperty('--chars',String(text.length));
        photo.node.style.setProperty('--hunch-life',`${Math.round(FEEL.hunch.params.photo*1000)}ms`);
        photo.node.classList.remove('on');void photo.node.offsetWidth;photo.node.classList.add('on');
    }

    private showCard():void {
        if(!this.build()||!this.card)return;
        this.card.classList.remove('on');void this.card.offsetWidth;this.card.classList.add('on');
    }

    /** A faint pencil tail behind a rat you have a read on, only where scenery hides it. */
    private trail(id:string,entity:RatEntity,on:boolean,dt:number):void {
        let trail=this.trails.get(id);
        if(!on){if(trail){trail.line.visible=false;trail.count=0;}return;}
        if(!trail){
            const geometry=new THREE.BufferGeometry(),points=new Float32Array(TRAIL_POINTS*3),colors=new Float32Array(TRAIL_POINTS*3);
            geometry.setAttribute('position',new THREE.BufferAttribute(points,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
            const line=new THREE.Line(geometry,this.material);line.frustumCulled=false;line.raycast=()=>{};line.name='hunch-trail';
            this.scene.add(line);trail={line,points,colors,count:0,timer:0};this.trails.set(id,trail);
        }
        const p=entity.mesh.position,level=FEEL.hunch.params.trail;
        trail.timer-=dt;
        if(trail.count===0||trail.timer<=0){
            trail.timer=TRAIL_EVERY;
            trail.points.copyWithin(3,0,(TRAIL_POINTS-1)*3);trail.count=Math.min(TRAIL_POINTS,trail.count+1);
        }
        trail.points[0]=p.x;trail.points[1]=p.y+.9;trail.points[2]=p.z;
        for(let i=0;i<TRAIL_POINTS;i++){
            const fade=i<trail.count?(1-i/TRAIL_POINTS)*level:0;
            trail.colors[i*3]=.84*fade;trail.colors[i*3+1]=.8*fade;trail.colors[i*3+2]=.72*fade;
        }
        const geometry=trail.line.geometry;
        geometry.setDrawRange(0,trail.count);
        geometry.attributes.position!.needsUpdate=true;geometry.attributes.color!.needsUpdate=true;
        trail.line.visible=trail.count>1;
    }
    private dropTrail(id:string):void {
        const trail=this.trails.get(id);if(!trail)return;
        this.scene.remove(trail.line);trail.line.geometry.dispose();this.trails.delete(id);
    }

    private present(dt:number,view:THREE.Camera,self:RatEntity|undefined,juice:boolean):void {
        if(!this.root)return;
        const life=FEEL.hunch.params.photo;
        for(const photo of this.photos){
            if(!photo.target)continue;
            photo.age+=dt;
            if(photo.age>=life||photo.target.dead){photo.target=undefined;photo.node.classList.remove('on');continue;}
            // Frame the rat from feet to hat, projected each frame so the photo tracks it.
            const p=photo.target.mesh.position;
            this.projected.set(p.x,p.y+2.3,p.z).project(view);
            const top=this.projected.y,x=this.projected.x,behind=this.projected.z>1;
            this.projected.set(p.x,p.y-.1,p.z).project(view);
            if(behind||this.projected.z>1){photo.node.style.opacity='0';continue;}
            const w=innerWidth,h=innerHeight,height=Math.max(28,(top-this.projected.y)*h/2);
            const cx=(x+1)/2*w,cy=(1-(top+this.projected.y)/2)/2*h;
            photo.node.style.opacity='';
            photo.node.style.transform=`translate(${(cx-height*.36).toFixed(1)}px,${(cy-height/2).toFixed(1)}px)`;
            photo.node.style.width=`${(height*.72).toFixed(1)}px`;photo.node.style.height=`${height.toFixed(1)}px`;
        }
        // The eye opens toward the nearest watcher and stays while anyone has a read on you.
        const target=juice&&self&&this.watchers.length?this.nearestWatcher(self.mesh.position):undefined;
        this.eyeLevel+=((target?Math.min(1,.7+.1*this.watchers.length):0)-this.eyeLevel)*(1-Math.exp(-8*dt));
        if(!this.eye)return;
        this.eye.style.opacity=this.eyeLevel<.01?'0':this.eyeLevel.toFixed(3);
        this.eye.classList.toggle('open',!!target);
        if(!target||!self)return;
        this.inverse.copy(view.quaternion).invert();
        this.local.copy(target).sub(self.mesh.position).applyQuaternion(this.inverse);
        const angle=Math.atan2(this.local.x,-this.local.z),radius=Math.min(innerWidth,innerHeight)*.4;
        this.eye.style.transform=`rotate(${angle.toFixed(3)}rad) translateY(${(-radius).toFixed(1)}px) rotate(${(-angle).toFixed(3)}rad)`;
    }
    private nearestWatcher(from:THREE.Vector3):THREE.Vector3|undefined {
        let best:THREE.Vector3|undefined,distance=Infinity;
        for(const watcher of this.watchers){const d=watcher.mesh.position.distanceToSquared(from);if(d<distance){distance=d;best=watcher.mesh.position;}}
        return best;
    }

    reset():void {
        this.sensed.clear();this.previous.clear();this.watchers.length=0;this.wasWatched=false;this.eyeLevel=0;this.holding=false;
        for(const photo of this.photos){photo.target=undefined;photo.node.classList.remove('on');}
        this.card?.classList.remove('on');this.eye?.classList.remove('open');if(this.eye)this.eye.style.opacity='0';
        for(const trail of this.trails.values()){trail.line.visible=false;trail.count=0;}
    }
    dispose():void {
        this.reset();for(const id of [...this.trails.keys()])this.dropTrail(id);this.warmLine.removeFromParent();this.warmLine.geometry.dispose();this.material.dispose();
        this.root?.remove();this.root=this.eye=this.card=undefined;this.photos.length=0;this.lastMade.clear();
    }

    private build():boolean {
        if(this.root)return true;
        if(!this.doc?.body||typeof this.doc.createElement!=='function')return false;
        const make=(className:string,parent:HTMLElement)=>{const node=this.doc!.createElement('div');node.className=className;parent.appendChild(node);return node;};
        this.root=this.doc.createElement('div');this.root.className='hunch-screen';this.root.setAttribute('aria-hidden','true');
        for(let i=0;i<PHOTOS;i++){
            const node=make('hunch-photo',this.root);
            for(const corner of ['tl','tr','bl','br'])make(`hunch-corner ${corner}`,node);
            make('hunch-flash',node);
            this.photos.push({node,caption:make('hunch-caption',node),age:0});
        }
        this.eye=make('hunch-eye',this.root);
        this.eye.innerHTML='<svg viewBox="0 0 64 40"><path class="brim" d="M2 13Q32-3 62 13Q48 9 32 9T2 13Z"/><path class="lid" d="M8 24Q32 6 56 24Q32 40 8 24Z"/><circle class="iris" cx="32" cy="24" r="7"/><circle class="pupil" cx="32" cy="24" r="3"/></svg>';
        this.card=make('hunch-card',this.root);
        this.card.innerHTML='<span class="hunch-card-kicker">CASE FILE · SURVEILLANCE</span><span class="hunch-card-title">YOU\u2019VE BEEN MADE</span><span class="hunch-card-stamp">MADE</span>';
        this.doc.body.appendChild(this.root);
        return true;
    }
}

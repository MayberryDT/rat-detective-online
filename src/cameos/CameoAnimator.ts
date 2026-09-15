import * as THREE from 'three';
import type { CameoKind } from './cameoLayout';

export type CameoReaction = 'idle' | 'passerby' | 'shot';
export const CAMEO_DURATIONS: Record<CameoReaction,number> = {idle:8,passerby:4.8,shot:5.4};
export const CAMEO_REACTIONS:Record<CameoKind,Record<CameoReaction,string>> = {
    spider:{idle:'Keeping eight imaginary eyes on the city.',passerby:'Friendly neighborhood overenthusiasm.',shot:'The web shooter is definitely under warranty.'},
    bat:{idle:'Brooding. Professionally.',passerby:'You have been silently investigated.',shot:'That was a tactical flinch.'},
};
const smooth=(a:number,b:number,t:number)=>{
    const x=THREE.MathUtils.clamp((t-a)/(b-a),0,1);return x*x*(3-2*x);
};
const beat=(t:number,start:number,attack:number,hold:number,end:number)=>smooth(start,attack,t)*(1-smooth(hold,end,t));
const names=['cameo-motion','cameo-torso','cameo-head','cameo-tail','cameo-cape',
    'cameo-arm-left','cameo-arm-right','cameo-forearm-left','cameo-forearm-right','cameo-hand-left','cameo-hand-right',
    'ear-left','ear-right','eye--1','eye-1'];

/** Absolute-time poses: scrubbing, interruption and frame rate cannot accumulate transforms. */
export class CameoAnimator {
    private readonly parts=new Map<string,{node:THREE.Object3D,position:THREE.Vector3,rotation:THREE.Euler,quaternion:THREE.Quaternion,scale:THREE.Vector3}>();
    constructor(readonly root:THREE.Group,readonly kind:CameoKind){
        for(const name of names){
            const node=root.getObjectByName(name);
            if(node)this.parts.set(name,{node,position:node.position.clone(),rotation:node.rotation.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone()});
        }
    }
    reset(){
        for(const {node,position,quaternion,scale} of this.parts.values()){node.position.copy(position);node.quaternion.copy(quaternion);node.scale.copy(scale);}
    }
    private rotate(name:string,x=0,y=0,z=0){const part=this.parts.get(name);if(part){part.node.rotation.set(part.rotation.x+x,part.rotation.y+y,part.rotation.z+z);}}
    private move(name:string,x=0,y=0,z=0){const part=this.parts.get(name);if(part)part.node.position.set(part.position.x+x,part.position.y+y,part.position.z+z);}
    private scale(name:string,x=1,y=1,z=1){const part=this.parts.get(name);if(part)part.node.scale.set(part.scale.x*x,part.scale.y*y,part.scale.z*z);}
    private eyes(y:number){this.scale('eye--1',1,y,1);this.scale('eye-1',1,y,1);}
    private ears(fold:number,twitch=0){this.rotate('ear-left',fold,0,-twitch);this.rotate('ear-right',fold,0,twitch);}

    sample(reaction:CameoReaction,seconds:number,direction=1){
        this.reset();
        if(!Number.isFinite(seconds)||seconds<0)return;
        const length=CAMEO_DURATIONS[reaction];
        if(reaction!=='idle'&&seconds>=length)return;
        const t=reaction==='idle'?seconds%length:seconds;
        const side=Number.isFinite(direction)&&direction<0?-1:1;
        if(reaction==='idle')this.idle(t);
        else if(reaction==='passerby')this.passerby(t,side);
        else this.shot(t,side);
    }
    private idle(t:number){
        const phase=t/8*Math.PI*2, breath=Math.sin(phase*2);
        this.scale('cameo-torso',1+breath*.009,1+breath*.015,1+breath*.012);
        this.rotate('cameo-tail',0,Math.sin(phase*2)*.13,Math.sin(phase)*.025);
        const blink=beat(t,2.1,2.18,2.23,2.36)+beat(t,6.15,6.23,6.26,6.40);
        this.eyes(1-blink*.82);
        if(this.kind==='spider'){
            const glance=beat(t,.6,1.4,2.4,3.3)-beat(t,4.1,4.7,5.6,6.8);
            this.rotate('cameo-head',breath*.045,glance*.30,Math.sin(phase)*.04);
            this.ears(0,beat(t,3.4,3.48,3.5,3.7)*.22);
            this.rotate('cameo-hand-right',0,0,Math.sin(t*14)*beat(t,4.2,4.4,4.9,5.2)*.10);
        }else{
            this.rotate('cameo-head',-.035*Math.sin(phase),Math.sin(phase)*.16,0);
            this.rotate('cameo-cape',Math.sin(phase)*.025,Math.sin(phase)*.035,Math.sin(phase*2)*.012);
            this.ears(0,beat(t,4.2,4.3,4.4,4.8)*.14);
        }
    }
    private passerby(t:number,side:number){
        const notice=beat(t,.05,.45,3.3,4.6),track=(1-2*smooth(.8,3.2,t))*side;
        this.rotate('cameo-head',0,track*.68*notice,0);
        this.rotate('cameo-tail',0,-track*.16*notice,0);
        if(this.kind==='spider'){
            const wave=beat(t,.5,1.05,2.65,3.25),wobble=beat(t,2.7,2.85,2.98,3.55);
            const arm=side>0?'right':'left';
            this.rotate(`cameo-arm-${arm}`,-.25*wave,0,side*1.95*wave);
            this.rotate(`cameo-forearm-${arm}`,-.50*wave,0,side*(.25+Math.sin(t*13)*.22)*wave);
            this.rotate(`cameo-hand-${arm}`,0,Math.sin(t*13)*.3*wave,0);
            this.rotate('cameo-motion',0,0,-side*.055*wave+side*.09*wobble);
            this.scale('cameo-motion',1,1-.075*wobble,1);
            this.rotate('cameo-head',-.08*wave,track*.68*notice,-side*.16*wave);
            this.eyes(1-.20*wave+.22*wobble);
            this.ears(0,wobble*.15);
        }else{
            const nod=beat(t,1.1,1.4,1.52,1.95),cloak=beat(t,1.6,2.1,2.7,3.7);
            this.rotate('cameo-head',nod*.23,track*.68*notice,side*notice*.06);
            this.rotate('cameo-arm-left',-.18*cloak,0,-.12*cloak);
            this.rotate('cameo-forearm-left',-.75*cloak,0,.30*cloak);
            this.rotate('cameo-cape',0,side*.17*cloak,side*.025*cloak);
            this.eyes(1-.25*notice);
        }
    }
    private shot(t:number,side:number){
        const flinch=beat(t,0,.09,.18,.48);
        this.ears(-.65*flinch,flinch*.2);
        this.rotate('cameo-tail',0,Math.sin(t*19)*.24*beat(t,0,.1,.9,1.4),0);
        if(this.kind==='spider'){
            const pop=beat(t,.18,.32,.39,.62),web=beat(t,.55,.82,1.70,2.0);
            const jam=beat(t,1.82,2.15,3.1,3.50),shrug=beat(t,3.40,3.8,4.6,5.35);
            const pulse=(Math.sin(t*24)*.5+.5)*web;
            this.scale('cameo-motion',1+flinch*.08,1-flinch*.20,1+flinch*.07);
            this.move('cameo-motion',0,pop*.13,0);
            this.rotate('cameo-head',-.20*flinch+.17*jam,.38*jam,side*.19*shrug);
            this.eyes(1+.40*flinch-.25*jam-.2*shrug);
            for(const armSide of [-1,1]){
                const arm=armSide<0?'left':'right';
                this.rotate(`cameo-arm-${arm}`,-.20*web-.20*pulse,0,armSide*(.6*flinch+.35*web+.72*shrug));
                this.rotate(`cameo-forearm-${arm}`,-1.42*web-1.0*shrug,0,0);
                this.rotate(`cameo-hand-${arm}`,-.32*pulse,.2*shrug,armSide*.45*shrug);
            }
            // Inspect and shake the jammed wrist, then a long palms-out complaint.
            this.rotate('cameo-arm-right',-.10*web,0,.35*web+.3*jam+.72*shrug+.6*flinch);
            this.rotate('cameo-forearm-right',-1.42*web-1.65*jam-1.0*shrug,0,Math.sin(t*27)*.19*jam);
            this.rotate('cameo-hand-right',Math.sin(t*30)*.35*jam-.32*pulse,0,.45*shrug);
        }else{
            const duck=beat(t,.12,.42,1.35,1.9),check=beat(t,.9,1.13,1.5,1.9);
            const dust=beat(t,2.10,2.45,3.5,3.95),pride=beat(t,3.55,4.0,4.65,5.35);
            this.scale('cameo-motion',1+flinch*.08,1-.14*duck-.06*flinch,1);
            this.move('cameo-head',side*.13*check,-.30*duck,0);
            this.rotate('cameo-head',-.12*duck-.16*pride,side*.5*check-side*.10*dust,0);
            this.eyes(1+.30*flinch-.45*check-.28*pride);
            this.rotate('cameo-arm-left',-.75*duck,0,-.4*duck);
            this.rotate('cameo-forearm-left',-1.1*duck,0,.2*duck);
            this.rotate('cameo-arm-right',-.75*duck-.5*dust,0,.4*duck-.72*dust);
            this.rotate('cameo-forearm-right',-1.1*duck-1.45*dust,0,Math.sin(t*13)*.17*dust);
            this.rotate('cameo-hand-right',Math.sin(t*13)*.20*dust,0,0);
            this.scale('cameo-torso',1+.055*pride,1+.045*pride,1+.045*pride);
        }
    }

    /** Bake exactly the preview poses to portable glTF node animation tracks. */
    clips():THREE.AnimationClip[]{
        const clips:THREE.AnimationClip[]=[];
        for(const reaction of ['idle','passerby','shot'] as const){
            const frames=Math.round(CAMEO_DURATIONS[reaction]*30);
            const tracks=new Map<string,{position:number[],quaternion:number[],scale:number[]}>();
            for(const name of this.parts.keys())tracks.set(name,{position:[],quaternion:[],scale:[]});
            const times:number[]=[];
            for(let i=0;i<=frames;i++){
                const time=i/30;times.push(time);this.sample(reaction,time);
                for(const [name,{node}] of this.parts){const values=tracks.get(name)!;node.position.toArray(values.position,values.position.length);node.quaternion.toArray(values.quaternion,values.quaternion.length);node.scale.toArray(values.scale,values.scale.length);}
            }
            const keys:THREE.KeyframeTrack[]=[];
            for(const [name,values] of tracks)for(const property of ['position','quaternion','scale'] as const){
                const valuesForProperty=values[property],stride=property==='quaternion'?4:3;
                if(!valuesForProperty.some((n,i)=>Math.abs(n-valuesForProperty[i%stride])>1e-7))continue;
                const Track=property==='quaternion'?THREE.QuaternionKeyframeTrack:THREE.VectorKeyframeTrack;
                keys.push(new Track(`${name}.${property}`,times,valuesForProperty));
            }
            clips.push(new THREE.AnimationClip(`${this.kind}-${reaction}`,CAMEO_DURATIONS[reaction],keys).optimize());
        }
        this.reset();return clips;
    }
}

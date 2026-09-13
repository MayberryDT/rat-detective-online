import * as THREE from 'three';
import type {OutfitStudioSubject} from './OutfitStudioSubject';
import {locomotionStudy} from './locomotionStudy';

export const CHARACTER_STUDIES = [
    ['burst','Focused firing',3],['shot','Single-shot reaction',2],
    ['jump','Jump takeoff',2.5],['launch','Launcher surprise',7],
    ['air','Ascent / apex / descent',3],['land','Landing recovery',2.5],
    ['carry','Carried-case weight',6.5],['case-pickup','Case pickup',2.5],
    ['case-loss','Case knocked away',2.5],['hit','Nonlethal hit',2.5],
    ['reflect','Ironclad reflection',3],['hustle','Hot Pursuit',4],
    ['heal','Quick Fix relief',2.5],['idle','Observant idle',13],
    ['delivery','Assignment delivery',2.5],
] as const;
export type CharacterStudyId = typeof CHARACTER_STUDIES[number][0];

/** Art-only stimuli using the actual entity presentation, never game inputs.
 * Flight is an illustrative trajectory; this fixture does not step physics. */
export class CharacterReactionStudy {
    time=0;speed=0;height=0;yaw=0;
    private nextShot=.65;
    private fired=false;
    private readonly target=new THREE.Vector3();
    readonly duration:number;
    readonly label:string;
    constructor(readonly id:CharacterStudyId,private readonly subject:OutfitStudioSubject){
        const entry=CHARACTER_STUDIES.find(row=>row[0]===id)!;
        this.duration=entry[2];this.label=entry[1];
        if(id==='carry'||id==='case-loss'||id==='delivery')subject.setOffHand('case');
        if(id==='case-pickup')subject.setOffHand('none');
        if(id==='reflect')subject.rat.setPowerups(12,0);
        if(id==='hustle')subject.rat.setPowerups(0,10);
    }
    update(dt:number):void {
        if(!(dt>0))return;
        this.time+=dt;const t=this.time;
        if(this.id==='carry'){
            const p=locomotionStudy(t);this.speed=p.speed;this.yaw=p.yaw;return;
        }
        this.speed=this.id==='hustle'&&t>.5&&t<3?26.1:this.id==='burst'&&t<2.3?7:0;
        if((this.id==='shot'||this.id==='burst')&&t>=this.nextShot&&t<1.7){
            this.target.set(0,1.55,20);this.subject.rat.mesh.localToWorld(this.target);
            this.subject.rat.playShootAnimation(this.target);
            this.nextShot=this.id==='shot'?Infinity:this.nextShot+.12;
        }
        if(t>=.6&&!this.fired){
            this.fired=true;
            switch(this.id){
                case 'jump':case 'air':this.subject.rat.playReaction('jump');break;
                case 'launch':this.subject.rat.playReaction('launch');break;
                case 'case-pickup':this.subject.setOffHand('case');this.subject.rat.playReaction('case-pickup');break;
                case 'case-loss':this.subject.setOffHand('none');this.subject.rat.playReaction('case-loss');break;
                case 'hit':this.subject.rat.takeDamage(1,new THREE.Vector3(1,0,.5));break;
                case 'reflect':this.subject.rat.playReaction('reflect');break;
                case 'heal':this.subject.rat.hp=2;this.subject.rat.heal(3);break;
                case 'delivery':this.subject.rat.playReaction('delivery');break;
            }
        }
        if(this.id==='reflect'&&t>.6&&t<1.5)this.subject.rat.playReaction('reflect');
        const flight=Math.max(0,t-.6);
        if(this.id==='launch'){
            const k=-Math.log(.9),g=30,v=90;
            this.height=Math.max(0,(v+g/k)*(1-Math.exp(-k*flight))/k-g*flight/k);
        }else if(this.id==='jump'||this.id==='air'){
            this.height=Math.max(0,16*Math.sqrt(1.28)*flight-.5*30*1.28*flight*flight);
        }else if(this.id==='land'){
            // Establish a raised rest pose before descent, never a teleport cue.
            this.height=Math.max(0,3-15*flight*flight);
        }
    }
    get done():boolean{return this.time>=this.duration;}
}

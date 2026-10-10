import {fly, leave} from '../ui/motion';
import {headlines} from '../ui/Headlines';
import * as THREE from 'three';
import type {ChaosState} from '../shared/chaosState';
import { CheeseImpactEffects } from '../weapons/CheeseImpactEffects';
import type { RatEntity } from '../entities/RatEntity';
import type { FeedbackCue } from '../audio/FeedbackAudio';
import type {Vec3Data, PickupTarget} from '../shared/networkProtocol';
import { locateCase } from './caseLocator';
import { PickupVisual } from './PickupVisual';
import {faultyCard, heldCard, hotCaseCard, pickupArtwork, powerupCard} from './pickupArtwork';
import {BUFF_FIELD, BUFF_MS, FAULTY_MS, TIMED_PICKUPS, WEAPON_KINDS, WEAPON_MS, WEAPON_TUNING, activeBuffs, entryWeapon, heldWeapon, isTimedPickup, type BuffMap, type FaultyKind, type PickupKind, type TimedPickup, type WeaponKind} from '../shared/pickups';
import {feelState} from '../feel/feelState';
import {FEEL} from '../feel/feelTuning';

const CARD_EXIT:Keyframe[]=[{opacity:1,transform:'none'},{opacity:0,transform:'translateY(46px) rotate(6deg) scale(.9)'}];
const CLAIM_REACH=5;
/** Scene props, claim feedback, held weapons and supply cards share one reconnect lifetime. */
export class SupplyPresentation {
    private readonly pickups=new Map<string,PickupVisual>();
    private readonly armed=new Set<string>();
    private readonly buffBar?:HTMLElement;
    private readonly buffCards=new Map<PickupKind,HTMLElement>();
    private healingUntil=0;
    private claimed?:PickupKind;
    private readonly claimChips=new Map<PickupKind,HTMLElement>();
    private readonly claimAt=new THREE.Vector3();
    private readonly claimFrom={x:0,y:0};
    private readonly localBuffs:Record<TimedPickup,number>={ironclad:0,hustle:0,stakeout:0};
    private buffsSeen=false;
    private localWeapon?:WeaponKind;
    private localWeaponUntil=0;
    private dud?:{kind:FaultyKind;card:HTMLElement};
    private held?:HTMLElement;
    private hotCase?:HTMLElement;
    private readonly acceptedPickups=new Map<string,{generation:number;tick:number;epoch:string}>();
    private readonly fixBeacons:HTMLElement[]=[];
    private readonly nearestFixes:PickupVisual[]=[];
    private readonly nearestFixDistances:number[]=[];
    private readonly impactPoint=new THREE.Vector3();
    private readonly impactNormal=new THREE.Vector3();
    private readonly p=new THREE.Vector3();
    constructor(private readonly scene:THREE.Scene,private readonly resolveRat:(id:string)=>RatEntity|undefined,
        private readonly clock:()=>number,private readonly feedback:((cue:FeedbackCue,origin?:Vec3Data)=>void)|undefined,
        private readonly impacts:CheeseImpactEffects,private readonly context:{state:()=>ChaosState|null;id:()=>string;xray:()=>boolean;pending:(target:PickupTarget,id:string)=>boolean;trapPending:()=>boolean;claim:(kind:PickupKind,camera:THREE.Camera)=>void},replay:boolean){
        if(!replay){const bar=this.buffBar=document.createElement('div');bar.className='pickup-buffs';bar.style.display='none';document.body.appendChild(bar);}
    }
    private get state():ChaosState|null{return this.context.state();}
    private get myId():string{return this.context.id();}
    private get fixXray():boolean{return this.context.xray();}
    setPending(id:string,on:boolean):void {this.pickups.get(id)?.setPending(on);}
    accept(id:string,generation:number,tick:number,epoch:string):void {this.acceptedPickups.set(id,{generation,tick,epoch});}
    clearInteractions():void {this.acceptedPickups.clear();for(const visual of this.pickups.values())visual.setPending(false);}
    restart():void {this.clearWeapons();for(const visual of this.pickups.values())visual.restart();}
    private clearWeapons():void {for(const id of this.armed)this.resolveRat(id)?.setWeapon(undefined);this.armed.clear();}
    setXray(on:boolean):void {for(const visual of this.pickups.values())visual.setXray(on);if(!on)for(const beacon of this.fixBeacons)beacon.style.display='none';}
    updateProps(now:number,camera:THREE.Camera):void {for(const visual of this.pickups.values())visual.update(now,camera);}
    updateCards(buffs:BuffMap|undefined,now:number):void {if(this.buffBar)this.updateBuffs(buffs,now);}
    presentClaim(camera:THREE.Camera):void {if(this.claimed){const kind=this.claimed;this.claimed=undefined;this.claim(kind,camera);}}
    dispose():void {this.clearPickupCards();this.buffBar?.remove();for(const chip of this.claimChips.values())chip.remove();for(const beacon of this.fixBeacons)beacon.remove();for(const visual of this.pickups.values())visual.dispose();this.pickups.clear();this.clearWeapons();}
    showHealing():void {
        this.healingUntil=this.clock()+3200;
        const healing=this.buffCards.get('quick-fix');if(healing)leave(healing,'paperSlide',CARD_EXIT);this.buffCards.delete('quick-fix');
        this.pickupFeedback('quick-fix');
    }
    private pickupFeedback(kind:PickupKind):void {
        this.feedback?.('pickup-slap');this.feedback?.(`pickup-${kind}`);this.claimed=kind;
    }
    private claim(kind:PickupKind,camera:THREE.Camera):void {
        const self=this.resolveRat(this.myId);
        if(!self||self.dead)return;
        const me=self.mesh.position;let best=CLAIM_REACH*CLAIM_REACH;
        this.claimAt.set(me.x,me.y+1.2,me.z);
        for(const pickup of this.state?.pickups??[]){
            const d=(pickup.x-me.x)**2+(pickup.y-me.y)**2+(pickup.z-me.z)**2;
            // The claimed site has already rolled its next pickup, so it is the nearest empty one (or still of this kind).
            if((pickup.kind===kind||(pickup.availableAt??0)>(this.state?.time??0))&&d<best){best=d;this.claimAt.set(pickup.x,pickup.y,pickup.z);}
        }
        const card=this.buffCards.get(kind);
        if(card){
            let chip=this.claimChips.get(kind);
            if(!chip){chip=document.createElement('div');chip.className=`claim-fly powerup-${kind}`;chip.innerHTML=pickupArtwork(kind);chip.setAttribute('aria-hidden','true');this.claimChips.set(kind,chip);}
            this.impactPoint.copy(this.claimAt).project(camera);
            const behind=this.impactPoint.z>1;
            this.claimFrom.x=(behind?.5:Math.min(1,Math.max(0,(this.impactPoint.x+1)/2)))*innerWidth;
            this.claimFrom.y=(behind?.6:Math.min(1,Math.max(0,(1-this.impactPoint.y)/2)))*innerHeight;
            fly(document,chip,this.claimFrom,card,'claimMoment',FEEL.claimMoment.params.flight);
        }
        if(kind==='ironclad'&&feelState().on('claimIronclad'))for(let i=0;i<FEEL.claimIronclad.params.sparks;i++){
            const angle=i*2.4+Math.random();
            this.impacts.spark(this.impactPoint.set(me.x+Math.cos(angle)*.35,me.y+1.1+i*.25,me.z+Math.sin(angle)*.35),this.impactNormal.set(Math.cos(angle),.8,Math.sin(angle)));
        }
        this.context.claim(kind,camera);
    }
    clearPickupCards():void {
        this.healingUntil=0;this.claimed=undefined;for(const kind of TIMED_PICKUPS)this.localBuffs[kind]=0;this.localWeapon=undefined;this.localWeaponUntil=0;
        for(const card of this.buffCards.values())leave(card,'paperSlide',CARD_EXIT);
        if(this.dud){leave(this.dud.card,'paperSlide',CARD_EXIT);this.dud=undefined;}
        if(this.held){leave(this.held,'paperSlide',CARD_EXIT);this.held=undefined;}
        if(this.hotCase){leave(this.hotCase,'paperSlide',CARD_EXIT);this.hotCase=undefined;}
        this.buffCards.clear();if(this.buffBar)this.buffBar.style.display=this.buffBar.childElementCount?'flex':'none';
    }
    syncPickups(state:ChaosState):void{
        const live=new Set((state.pickups??[]).map(p=>p.id));
        for(const [id,visual] of this.pickups)if(!live.has(id)){visual.dispose();this.pickups.delete(id);}
        for(const pickup of state.pickups??[]){
            let visual=this.pickups.get(pickup.id);
            // A site rolls its next pickup on each claim and round: rebuild its prop once the claim pop has played.
            if(visual&&visual.kind!==pickup.kind&&visual.settled){visual.dispose();this.pickups.delete(pickup.id);visual=undefined;}
            if(!visual){visual=new PickupVisual(this.scene,pickup.kind);visual.setXray(this.fixXray);this.pickups.set(pickup.id,visual);}
            visual.setPosition(pickup.x,pickup.y,pickup.z);
            visual.setAvailableAt(pickup.availableAt??0);
            const accepted=this.acceptedPickups.get(pickup.id);
            if(accepted&&state.epoch===accepted.epoch&&(state.tick??0)>=accepted.tick&&(pickup.availableAt??0)!==accepted.generation)
                this.acceptedPickups.delete(pickup.id);
            visual.setPending(this.context.pending('pickup',pickup.id)||this.acceptedPickups.has(pickup.id));
        }
    }
    syncWeapons(state:ChaosState):void{
        for(const id of this.armed)if(!heldWeapon(state.buffs,id,state.time)){this.resolveRat(id)?.setWeapon(undefined);this.armed.delete(id);}
        for(const id in state.buffs){
            const weapon=heldWeapon(state.buffs,id,state.time);
            // A new weapon is shown immediately; acquisition does not lock the trigger.
            if(weapon){if(id===this.myId&&weapon==='mousetrap'&&this.context.trapPending())continue;this.resolveRat(id)?.setWeapon(weapon);this.armed.add(id);}
        }
    }
    noteLocalBuffs(state:ChaosState):void{
        if(!this.myId)return;
        const mine=state.buffs?.[this.myId],seen=this.buffsSeen;this.buffsSeen=true;
        for(const kind of TIMED_PICKUPS){
            const until=mine?.[BUFF_FIELD[kind]]??0;
            if(seen&&until!==this.localBuffs[kind]&&until>state.time)this.pickupFeedback(kind);
            this.localBuffs[kind]=until;
        }
        const weapon=entryWeapon(mine,state.time),until=mine?.weaponUntil??0;
        if(seen&&weapon&&(weapon!==this.localWeapon||until!==this.localWeaponUntil)){this.pickupFeedback(weapon);}
        // W3: the trap is up in your paws: the next press launches it.
        this.localWeapon=weapon;this.localWeaponUntil=until;
    }
    private updateBuffs(buffs:BuffMap|undefined,now:number):void{
        if(this.resolveRat(this.myId)?.dead){this.clearPickupCards();return;}
        const mine=activeBuffs(buffs,this.myId,now);
        if(!this.buffBar||typeof this.buffBar.replaceChildren!=='function')return;
        for(const kind of TIMED_PICKUPS)this.showCard(kind,mine[BUFF_FIELD[kind]],now);
        // One special weapon at most: a timed one has a clock like a supply, the Mousetrap is held until thrown.
        for(const kind of WEAPON_KINDS)this.showCard(kind,mine.weapon===kind?mine.weaponUntil??Infinity:undefined,now);
        const healing=this.buffCards.get('quick-fix');
        if(this.clock()<this.healingUntil){
            if(!healing){const card=powerupCard('quick-fix');card.setAttribute('role','status');
                this.buffCards.set('quick-fix',card);this.buffBar.appendChild(card);}
        }else {if(healing)leave(healing,'paperSlide',CARD_EXIT);this.buffCards.delete('quick-fix');}
        // Code Violation's dud: its own condemned card, saying what it does to you (the first time), until it wears off.
        if(this.dud&&this.dud.kind!==mine.faulty){leave(this.dud.card,'paperSlide',CARD_EXIT);this.dud=undefined;}
        if(mine.faulty&&mine.faultyUntil!==undefined){
            if(!this.dud){
                this.dud={kind:mine.faulty,card:faultyCard(mine.faulty)};this.buffBar.appendChild(this.dud.card);
                this.dud.card.classList.toggle('explained',!headlines.firstTime(`dud-${mine.faulty}`));
            }
            this.tickCard(this.dud.card,mine.faultyUntil-now,FAULTY_MS[mine.faulty]);
        }
        // A Mousetrap's hold: the HELD card (what it means the first time) and its clock until the trap lets go.
        if(mine.trappedUntil!==undefined){
            if(!this.held){this.held=heldCard();this.held.classList.toggle('explained',!headlines.firstTime('held'));this.buffBar.appendChild(this.held);}
            this.tickCard(this.held,mine.trappedUntil-now,WEAPON_TUNING.trapHoldMs);
        }else if(this.held){leave(this.held,'paperSlide',CARD_EXIT);this.held=undefined;}
        // K3: the HOT CASE card for as long as you carry the buffed case (it replaced the first-time explanation).
        const s=this.state,carrying=!!s&&s.case.owner===this.myId&&s.assignment?.phase==='active';
        if(carrying&&!this.hotCase){this.hotCase=hotCaseCard();this.buffBar.appendChild(this.hotCase);}
        else if(!carrying&&this.hotCase){leave(this.hotCase,'paperSlide',CARD_EXIT);this.hotCase=undefined;}
        this.buffBar.style.display=this.buffBar.childElementCount?'flex':'none';
    }
    private showCard(kind:TimedPickup|WeaponKind,until:number|undefined,now:number):void{
        if(!this.buffBar)return;
        let card=this.buffCards.get(kind);
        if(!until){if(card)leave(card,'paperSlide',CARD_EXIT);this.buffCards.delete(kind);return;}
        if(!card){
            card=powerupCard(kind);this.buffCards.set(kind,card);this.buffBar.appendChild(card);
            // Ironclad (cheese bounces off you, traps still hold you) and Stakeout are explained the first time.
            if(kind==='ironclad'||kind==='stakeout')headlines.explain(kind);
        }
        const duration=isTimedPickup(kind)?BUFF_MS[kind]:WEAPON_MS[kind];
        if(duration!==undefined)this.tickCard(card,until-now,duration);
    }
    private tickCard(card:HTMLElement,remaining:number,duration:number):void{
        remaining=Math.max(0,remaining);
        const seconds=String(Math.ceil(remaining/1000)),clock=card.querySelector('b')!;
        if(clock.textContent!==seconds)clock.textContent=seconds;
        card.style.setProperty('--remaining',String(Math.min(1,remaining/duration)));
        card.classList.toggle('powerup-expiring',remaining<=3000);
    }
    updateFixBeacons(camera:THREE.Camera,now:number){
        // The three nearest ready kits, kept sorted by insertion; equal distances keep pickup order.
        const nearest=this.nearestFixes,distances=this.nearestFixDistances;
        let found=0;
        for(const visual of this.pickups.values()){
            if(!visual.readyQuickFix(now))continue;
            const d=visual.root.position.distanceToSquared(camera.position);
            if(found===3&&!(d<distances[2]))continue;
            let i=found<3?found++:2;
            for(;i>0&&distances[i-1]>d;i--){distances[i]=distances[i-1];nearest[i]=nearest[i-1];}
            distances[i]=d;nearest[i]=visual;
        }
        for(let i=0;i<3;i++){
            let beacon=this.fixBeacons[i];
            const visual=i<found?nearest[i]:undefined;
            if(!visual){if(beacon)beacon.style.display='none';continue;}
            if(!beacon){
                // Styled in dispatchHud.css; only its projected position changes per frame.
                beacon=document.createElement('div');beacon.className='quick-fix-beacon';beacon.setAttribute('aria-hidden','true');
                beacon.textContent='+';document.body.appendChild(beacon);this.fixBeacons[i]=beacon;
            }
            this.p.copy(visual.root.position);this.p.y+=1.3;
            const location=locateCase(this.p,camera,window.innerWidth,window.innerHeight);
            beacon.style.display='block';
            beacon.style.transform=`translate(${location.x-20}px,${location.y-20}px) scale(${(1+Math.sin(now*.006)*.08)*(i===0?1:.8)})`;
            beacon.style.opacity=i===0?'1':'.7';
        }
    }
}

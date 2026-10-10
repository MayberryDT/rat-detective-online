import type {ChaosState} from '../shared/chaosState';
import {CHAOS_TUNING} from '../shared/chaosState';
import type {PickupTarget,Vec3Data,ServerMessage} from '../shared/networkProtocol';
import {PICKUP_TUNING} from '../shared/pickups';
import {closestPointOnSegment} from '../shared/netplay';
import {incidentInfo} from '../shared/incidentCatalog';
import type {SupplyPresentation} from './SupplyPresentation';
export interface InteractionCandidate {
    target:PickupTarget;targetId:string;generation:number;pickup?:import('../shared/pickups').PickupKind;
}

/** Swept candidate selection and reversible anticipation for case and supply intents. Authority remains in ChaosSimulation. */
export class InteractionPresentation {
    private readonly pendingInteractions=new Map<string,InteractionCandidate>();
    private anticipatedCase:{acceptedTick?:number;epoch?:string}|null=null;
    constructor(private readonly supplies:SupplyPresentation,private readonly stateNow:()=>ChaosState|null,private readonly clock:()=>number,private readonly received:()=>number){}
    get caseAnticipated():boolean{return !!this.anticipatedCase;}
    reconcile(previous:ChaosState|null,state:ChaosState):void {
        if(previous&&(previous.epoch!==state.epoch||previous.assignment?.roundId!==state.assignment?.roundId))this.clearInteractions();
        else if(state.case.owner||previous&&((state.assignment?.deliverySerial??0)>(previous.assignment?.deliverySerial??0))){
            // Ownership and a delivery are authoritative even if a claim result
            // is still pending. Never keep an old grip across case relocation.
            this.anticipatedCase=null;
            for(const [id,candidate] of this.pendingInteractions)if(candidate.target==='case')this.pendingInteractions.delete(id);
        }
    }
    applied(state:ChaosState):void {
        if(this.anticipatedCase?.acceptedTick!==undefined&&state.epoch===this.anticipatedCase.epoch&&(state.tick??0)>=this.anticipatedCase.acceptedTick)
            this.anticipatedCase=null;
    }
    interaction(from:Vec3Data,to:Vec3Data,fullHealth:boolean):InteractionCandidate|undefined {
        const state=this.stateNow();if(!state)return;
        const now=state.time+Math.min(80,Math.max(0,this.clock()-this.received()));
        let best:InteractionCandidate|undefined,bestDistance=Infinity;
        const consider=(candidate:InteractionCandidate,p:Vec3Data,radius:number)=>{
            const closest=closestPointOnSegment(from,to,p),distance=Math.hypot(closest.x-p.x,closest.y-p.y,closest.z-p.z);
            if(distance<=radius&&distance<bestDistance){best=candidate;bestDistance=distance;}
        };
        const c=state.case;
        const classicWeaponized=state.dispatch.phase==='active'&&incidentInfo(state.dispatch.incident).id==='evidence-tampering';
        if(!this.anticipatedCase&&!c.owner&&!c.returningUntil&&!c.missileOwner&&!classicWeaponized&&state.assignment?.phase!=='closed'&&
            Math.hypot(c.v.x,c.v.y,c.v.z)<=CHAOS_TUNING.casePickupMaxSpeed&&now>=c.pickupAfter)
            // Interaction runs before update(): the rendered prop may still be
            // in yesterday's paw after a delivery/drop/reset snapshot. Use the
            // current authoritative pickup position, never that stale mesh.
            consider({target:'case',targetId:'primary',generation:c.pickupAfter},c.p,CHAOS_TUNING.pickupRadius);
        for(const pickup of state.pickups??[]){
            if((pickup.availableAt??0)>now||this.pendingTarget('pickup',pickup.id)||fullHealth&&pickup.kind==='quick-fix')continue;
            consider({target:'pickup',targetId:pickup.id,generation:pickup.availableAt??0,pickup:pickup.kind},pickup,PICKUP_TUNING.claimRadius);
        }
        return best;
    }
    pendingTarget(target:PickupTarget,targetId:string):boolean {
        return [...this.pendingInteractions.values()].some(candidate=>candidate.target===target&&candidate.targetId===targetId);
    }
    anticipateInteraction(interactionId:string,candidate:InteractionCandidate):void {
        this.pendingInteractions.set(interactionId,candidate);
        if(candidate.target==='pickup')this.supplies.setPending(candidate.targetId,true);
        else this.anticipatedCase={};
    }
    resolveInteraction(message:Extract<ServerMessage,{type:'pickupResult'}>):void {
        const candidate=this.pendingInteractions.get(message.interactionId);this.pendingInteractions.delete(message.interactionId);
        if(message.target==='pickup'){
            if(message.accepted)this.supplies.accept(message.targetId,candidate?.generation??0,message.tick,message.epoch);
            else this.supplies.setPending(message.targetId,false);
        }else if(candidate){
            // A cancelled/previous-round claim cannot resurrect a carried case.
            const state=this.stateNow();
            const superseded=state?.epoch!==message.epoch||
                state.tick!==undefined&&state.tick>message.tick;
            this.anticipatedCase=message.accepted&&!superseded?{acceptedTick:message.tick,epoch:message.epoch}:null;
        }
    }
    clearInteractions():void {
        this.pendingInteractions.clear();this.supplies.clearInteractions();this.anticipatedCase=null;

    }
    cancelInteraction(interactionId:string):void {
        const candidate=this.pendingInteractions.get(interactionId);this.pendingInteractions.delete(interactionId);
        if(candidate?.target==='pickup')this.supplies.setPending(candidate.targetId,false);
        else if(candidate)this.anticipatedCase=null;
    }
}

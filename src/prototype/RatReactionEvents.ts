import type {ChaosState} from '../shared/chaosState';
import type {ServerMessage} from '../shared/networkProtocol';
import type {RatEntity} from '../entities/RatEntity';
import type {RatReaction} from '../utils/RatActing';

/** Presentation-only bridge from confirmed outcomes. Initial/rebased snapshots
 * establish state silently; anticipated pickups never reach this bridge. */
export class RatReactionEvents {
    private time:number|undefined;
    private tick=-1;
    private epoch='';
    private round='';
    private owner:string|null=null;
    private delivery=0;
    private readonly launches=new Set<string>();
    private readonly reflections=new Set<string>();
    constructor(private readonly resolve:(id:string)=>RatEntity|undefined){}
    private play(id:string|undefined|null,event:RatReaction):void {
        const rat=id?this.resolve(id):undefined;
        if(rat&&!rat.dead&&rat.hp>0)rat.playReaction(event);
    }
    apply(state:ChaosState):void {
        const epoch=state.epoch??'',round=state.assignment?.roundId??'';
        if(this.time!==undefined&&epoch===this.epoch&&round===this.round&&
            (state.time<=this.time||(state.tick!==undefined&&state.tick<=this.tick)))return;
        const fresh=this.time!==undefined&&epoch===this.epoch&&round===this.round&&state.time-this.time<1000;
        const delivery=state.assignment?.deliverySerial??0;
        const delivered=fresh&&delivery>this.delivery?state.assignment?.lastDelivery?.playerId:undefined;
        if(fresh){
            if(delivered)this.play(delivered,'delivery');
            if(state.case.owner!==this.owner){
                if(this.owner!==delivered)this.play(this.owner,'case-loss');
                this.play(state.case.owner,'case-pickup');
            }
        }else {this.launches.clear();this.reflections.clear();}
        for(const launch of state.pressure?.launches??[]){
            if(this.launches.has(launch.id))continue;
            this.launches.add(launch.id);
            if(fresh&&state.time>=launch.at&&state.time-launch.at<300)this.play(launch.playerId,'launch');
        }
        while(this.launches.size>32)this.launches.delete(this.launches.values().next().value!);
        if(fresh)for(const impact of state.impacts){
            if(impact.cue!=='armor-clang')continue;
            // Broadcast impacts carry a point but no victim ID. React only when
            // exactly one living protected rat is close; ambiguous contacts skip.
            let match:string|undefined,ambiguous=false;
            for(const id in state.buffs){
                if((state.buffs[id].ironcladUntil??0)<=state.time)continue;
                const rat=this.resolve(id);if(!rat||rat.dead||rat.hp<=0)continue;
                const p=rat.mesh.position;
                if(Math.hypot(p.x-impact.p.x,p.y+1-impact.p.y,p.z-impact.p.z)>1.6)continue;
                if(match){ambiguous=true;break;}match=id;
            }
            if(!ambiguous)this.play(match,'reflect');
        }
        this.time=state.time;this.tick=state.tick??-1;this.epoch=epoch;this.round=round;
        this.owner=state.case.owner;this.delivery=delivery;
    }
    shotResult(message:Extract<ServerMessage,{type:'shotResult'}>):void {
        if(message.outcome!=='ironclad-reflect'||!message.victimId)return;
        if(this.time!==undefined&&message.epoch!==this.epoch)return;
        if(this.time!==undefined&&message.at<this.time-500)return;
        const key=`${message.epoch}:${message.tick}:${message.ballId}:${message.victimId}`;
        if(this.reflections.has(key))return;
        this.reflections.add(key);
        if(this.reflections.size>64)this.reflections.delete(this.reflections.values().next().value!);
        this.play(message.victimId,'reflect');
    }
    reset():void {
        this.time=undefined;this.tick=-1;this.epoch=this.round='';this.owner=null;this.delivery=0;
        this.launches.clear();this.reflections.clear();
    }
}

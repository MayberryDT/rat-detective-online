import { activeZone, rotateZone, JURISDICTION_TUNING } from './jurisdiction';
import { zoneContains } from './jurisdictionZones';
import { activeDestination, ASSIGNMENT_TUNING, destinationContains, shuffledChainRoute, type AssignmentState, type AssignmentResult } from './assignments';
import type { PlayerData, Vec3Data } from './networkProtocol';

export type CrossingOutcome = 'none' | 'delivered' | 'closed' | 'carry-required';

/** Objective credit is independent of all projectile/corpse damage credit.
 * Calls follow the simulation's resolved order; a recorded finish is immutable. */
export class AssignmentRules {
    constructor(readonly state: AssignmentState, private readonly players: Map<string, PlayerData>,private readonly random= Math.random) {}
    get closed(): boolean { return !!this.state.result; }
    get active(): boolean { return this.state.phase === 'active'; }
    private living(id: string | null): PlayerData | undefined {
        const p = id ? this.players.get(id) : undefined;
        return p && p.hp > 0 ? p : undefined;
    }
    private close(player: PlayerData, at: number, method: AssignmentResult['method']): void {
        if (this.closed) return;
        this.state.phase = 'closed';
        if(this.state.jurisdiction)this.state.jurisdiction.scorerId=null;
        this.state.result = { winnerId: player.id, winnerName: player.name, at, method, posthumous: player.hp <= 0 };
        this.state.revision++;
    }
    setPhase(now: number, tampering: boolean): void {
        if (this.closed) return;
        const phase = tampering ? 'suspended' : now < this.state.liveAt ? 'briefing' : 'active';
        if(phase!=='active'&&this.state.jurisdiction)this.state.jurisdiction.scorerId=null;
        if (phase !== this.state.phase) { this.state.phase = phase; this.state.revision++; }
    }
    /** Only elapsed simulated held time counts. The caller divides intervals at
     * actual incident deadlines; elapsed wall time while a room sleeps is absent. */
    advance(from: number, to: number, holder: string | null): void {
        if(this.state.id==='jurisdiction'){this.advanceJurisdiction(from,to,holder);return;}
        if (!this.active || this.state.id !== 'closing-time' || this.closed) return;
        const p = this.living(holder);
        if (!p) return;
        const start = Math.max(from, this.state.liveAt), elapsed = Math.max(0, to - start);
        if (!elapsed) return;
        const previous = this.state.remainingMs;
        this.state.remainingMs = Math.max(0, previous - elapsed);
        if (this.state.remainingMs <= .000001) { this.state.remainingMs = 0; this.close(p, start + previous, 'held'); }
    }
    private advanceJurisdiction(from:number,to:number,holder:string|null):void {
        const s=this.state.jurisdiction;if(!s||!this.active||this.closed)return;
        let at=Math.max(from,this.state.liveAt),left=Math.max(0,to-at);
        const p=this.living(holder);
        while(left>0&&!this.closed){
            const ms=Math.min(left,s.remainingMs),eligible=!!p&&zoneContains(activeZone(s),p);
            const scorer=eligible?p.id:null;
            if(s.scorerId!==scorer){s.scorerId=scorer;this.state.revision++;}
            if(eligible){
                const previous=Object.prototype.hasOwnProperty.call(s.heldMs,p.id)?s.heldMs[p.id]:0;
                const credit=Math.min(ms,JURISDICTION_TUNING.targetMs-previous);
                Object.defineProperty(s.heldMs,p.id,{value:previous+credit,writable:true,enumerable:true,configurable:true});
                if(previous+credit>=JURISDICTION_TUNING.targetMs-1e-7){
                    s.heldMs[p.id]=JURISDICTION_TUNING.targetMs;
                    s.remainingMs=Math.max(.000001,s.remainingMs-credit);this.close(p,at+credit,'zone-held');return;
                }
            }
            s.remainingMs-=ms;left-=ms;at+=ms;
            if(s.remainingMs<1e-7){rotateZone(s,this.random);this.state.revision++;}
        }
    }
    /** The attributed kill has resolved. Fire-time possession is irrelevant. */
    kill(killerId: string, holder: string | null, at: number): boolean {
        if (!this.active || this.closed || this.state.id !== 'excessive-force' || killerId !== holder) return false;
        const player = this.living(holder);
        if (!player) return false;
        const points = Math.min(ASSIGNMENT_TUNING.caseKillTarget, (Object.prototype.hasOwnProperty.call(this.state.caseKills,killerId)?this.state.caseKills[killerId]:0) + 1);
        // defineProperty also safely handles arbitrary protocol player identifiers.
        Object.defineProperty(this.state.caseKills, killerId, {value: points, writable: true, enumerable: true, configurable: true});
        this.state.revision++;
        if (points === ASSIGNMENT_TUNING.caseKillTarget) this.close(player, at, 'kills');
        return true;
    }
    disconnect(id: string): void {
        const j=this.state.jurisdiction;
        if(!this.closed&&j){if(Object.prototype.hasOwnProperty.call(j.heldMs,id)){delete j.heldMs[id];this.state.revision++;}if(j.scorerId===id)j.scorerId=null;}
        if (!this.closed && Object.prototype.hasOwnProperty.call(this.state.caseKills, id)) { delete this.state.caseKills[id]; this.state.revision++; }
        if (!this.closed && Object.prototype.hasOwnProperty.call(this.state.deliveries, id)) { delete this.state.deliveries[id]; this.state.revision++; }
    }
    visit(holder:string|null,position:Vec3Data,at:number):CrossingOutcome {
        if (!this.active || this.closed || this.state.id!=='chain-of-custody') return 'none';
        const destination=activeDestination(this.state);
        if(!destination||!destinationContains(destination,position))return 'none';
        const player=this.living(holder);if(!player)return 'carry-required';
        const points=(Object.prototype.hasOwnProperty.call(this.state.deliveries,player.id)?this.state.deliveries[player.id]:0)+1;
        Object.defineProperty(this.state.deliveries,player.id,{value:points,writable:true,enumerable:true,configurable:true});
        this.state.deliverySerial++;this.state.revision++;
        this.state.lastDelivery={playerId:player.id,playerName:player.name,at};
        if(points===ASSIGNMENT_TUNING.deliveryTarget){this.close(player,at,'carried');return 'closed';}
        if(this.state.deliverySerial%this.state.destinations.length===0)this.state.destinations=shuffledChainRoute(this.random,destination);
        return 'delivered';
    }
}

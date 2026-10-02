import {RACE_LIMIT,type Award,type AwardId,type DeathCause,type EnvironmentCause,type KillWeapon,type PlayerData,type ReportRat,type RoundReport} from '../shared/networkProtocol';
import type {AssignmentState} from '../shared/assignments';
import type {ChaosState} from '../shared/chaosState';
import {isIncidentId,type IncidentId} from '../shared/incidentCatalog';
import type {PickupKind,WeaponKind} from '../shared/pickups';
import {ASSIST_WINDOW_MS} from '../shared/city/ledger';

interface Stats {
    cheesed:number;drops:number;sewer:number;peak:number;
    shots:number;hits:number;headshots:number;longest:number;caseSeconds:number;flights:number;pickups:number;distance:number;calls:number;
    streak:number;dealt:number;assists:number;takes:number;carry:number;alive:number;
    weapons:Partial<Record<KillWeapon,number>>;kinds:Partial<Record<PickupKind,number>>;deathsBy:Partial<Record<DeathCause,number>>;
    last?:{x:number;z:number};
    /** The race: objective progress at each sample, padded with zeros before the rat arrived. */
    race?:number[];
}
/** How a death happened, as `GameRoom.handleHit` saw it. */
export interface DeathHow {headshot:boolean;explosive:boolean;weapon?:WeaponKind;environment?:EnvironmentCause}
const bump=<K extends string>(table:Partial<Record<K,number>>,key:K)=>{table[key]=(table[key]??0)+1;};

const TITLES:Record<AwardId,string>={
    'top-gun':'TOP GUN','most-cheesed':'MOST CHEESED','butterfingers':'BUTTERFINGERS',
    'sewer-dweller':'SEWER DWELLER','high-flier':'HIGH FLIER',
    'sharpshooter':'SHARPSHOOTER','headhunter':'HEADHUNTER','long-shot':'LONG SHOT','case-keeper':'CASE KEEPER',
    'frequent-flier':'FREQUENT FLIER','supply-run':'SUPPLY RUN','legwork':'LEGWORK','dispatcher':'DISPATCHER',
};
/** Minimum values before an award is worth mentioning. Sharpshooter also needs `MIN_SHOTS`. */
const FLOORS:Record<AwardId,number>={'top-gun':1,'most-cheesed':3,'butterfingers':1,'sewer-dweller':5,'high-flier':14,
    'sharpshooter':1,'headhunter':1,'long-shot':20,'case-keeper':15,'frequent-flier':2,'supply-run':2,'legwork':250,'dispatcher':1};
const MIN_SHOTS=8;
/** A larger jump in one tick is a respawn or teleport, not legwork. */
const MAX_STRIDE=12;
export const LINEUP_SIZE=5;
/** Seconds between race samples at the start of a round; doubles each time the race fills up. */
const RACE_STEP=10;

/** A rat's progress toward the round's win: deliveries, zone points, case kills, or kills without an assignment. */
function progress(player:PlayerData,assignment?:AssignmentState):number {
    switch(assignment?.id){
        case undefined:return player.kills;
        case 'chain-of-custody':return assignment.deliveries[player.id]??0;
        case 'jurisdiction':return (assignment.jurisdiction?.heldMs[player.id]??0)/1000;
        case 'excessive-force':return assignment.caseKills[player.id]??0;
    }
}

/** Polish 19 + juice T5: cosmetic per-round statistics for the Case File, the police
 * lineup and the results board's round report. In memory only (never persisted, never
 * used for scoring); a Durable Object restart mid-round starts the tallies again. */
export class RoundAwards {
    private readonly stats=new Map<string,Stats>();
    /** Accepted trigger pulls by shot id; only their balls count toward accuracy. */
    private readonly triggers=new Map<string,string>();
    private readonly hitShots=new Set<string>();
    private readonly seenLaunches=new Set<string>();
    private caseOwner:string|null=null;
    private deliveries=0;
    /** The Dispatch serial whose caller was last counted: one call per roll. */
    private calledSerial=-1;
    private kills=0;
    /** Seconds sampled this round. */
    private elapsed=0;
    /** The case: the last rat to hold it, the current carry, and the longest carry. */
    private lastHolder:string|null=null;
    private handoffs=0;
    private carry=0;
    private carrierName='';
    private longestCarry?:{playerId:string;playerName:string;seconds:number};
    private raceStep=RACE_STEP;
    private raceSamples=0;
    /** Victim -> attacker -> when that attacker last damaged it (for assists). */
    private readonly recent=new Map<string,Map<string,number>>();
    /** Dispatch incidents rolled, and the serial last counted: one per roll. */
    private incidents:Partial<Record<IncidentId,number>>={};
    private incidentSerial=-1;

    private of(id:string):Stats {
        let stats=this.stats.get(id);
        if(!stats){stats={cheesed:0,drops:0,sewer:0,peak:0,shots:0,hits:0,headshots:0,longest:0,caseSeconds:0,flights:0,pickups:0,distance:0,calls:0,streak:0,
            dealt:0,assists:0,takes:0,carry:0,alive:0,weapons:{},kinds:{},deathsBy:{}};this.stats.set(id,stats);}
        return stats;
    }
    /** Damage taken by `victimId`, dealt by `attackerId` (none for the city or the rat's own). */
    damage(victimId:string,attackerId:string|null,amount:number,at:number):void {
        if(amount<=0)return;
        this.of(victimId).cheesed+=amount;
        if(!attackerId||attackerId===victimId)return;
        this.of(attackerId).dealt+=amount;
        let by=this.recent.get(victimId);if(!by){by=new Map();this.recent.set(victimId,by);}
        by.set(attackerId,at);
    }
    /** An accepted trigger pull. */
    shot(playerId:string,shotId:string):void {
        this.of(playerId).shots++;
        this.triggers.set(shotId,playerId);if(this.triggers.size>4096)this.triggers.delete(this.triggers.keys().next().value!);
    }
    /** A ball of `shotId` struck a rat. A trigger pull counts as one hit at most, and
     * balls not fired by a trigger (eruptions, bursts, splits) never count. */
    hit(playerId:string,shotId:string):void {
        if(this.triggers.get(shotId)!==playerId||this.hitShots.has(shotId))return;
        this.hitShots.add(shotId);if(this.hitShots.size>4096)this.hitShots.delete(this.hitShots.values().next().value!);
        this.of(playerId).hits++;
    }
    /** After the death is applied (`killer.streak` already includes it): the victim's cause, the credited killer's
     * kill (none for the city or a rat's own blast), and assists for everyone else who hurt the victim lately. */
    death(victim:PlayerData,killer:PlayerData|undefined,how:DeathHow,at:number):void {
        bump(this.of(victim.id).deathsBy,how.environment??(how.explosive?'blast':how.headshot?'headshot':'shot'));
        const recent=this.recent.get(victim.id);this.recent.delete(victim.id);
        for(const [id,t] of recent??[])if(id!==killer?.id&&at-t<=ASSIST_WINDOW_MS)this.of(id).assists++;
        if(!killer)return;
        const stats=this.of(killer.id);
        this.kills++;
        if(how.headshot)stats.headshots++;
        bump(stats.weapons,how.explosive?'blast':how.weapon==='tommy-gun'||how.weapon==='laser'?how.weapon:'cheese');
        stats.streak=Math.max(stats.streak,killer.streak??0);
        stats.longest=Math.max(stats.longest,Math.hypot(killer.x-victim.x,killer.y-victim.y,killer.z-victim.z));
    }
    /** A supply taken from a site or given as a reward. */
    pickup(playerId:string,kind:PickupKind):void {const stats=this.of(playerId);stats.pickups++;bump(stats.kinds,kind);}
    /** Per tick: case losses (not deliveries), hand-offs and carries, case time, sewer seconds, highest altitude,
     * distance, launcher rides, Dispatch calls and, every race step, each rat's objective progress. */
    sample(players:Iterable<PlayerData>,dt:number,caseOwner:string|null,deliveries:number,launches:readonly {id:string;playerId:string}[]=[],dispatch?:ChaosState['dispatch'],assignment?:AssignmentState):void {
        if(dispatch?.caller&&dispatch.serial!==this.calledSerial){this.calledSerial=dispatch.serial;this.of(dispatch.caller).calls++;}
        if(dispatch?.incident&&dispatch.serial!==this.incidentSerial&&isIncidentId(dispatch.incident)){this.incidentSerial=dispatch.serial;bump(this.incidents,dispatch.incident);}
        if(this.caseOwner&&caseOwner!==this.caseOwner&&deliveries===this.deliveries)this.of(this.caseOwner).drops++;
        if(caseOwner!==this.caseOwner){
            this.endCarry();
            if(caseOwner){this.of(caseOwner).takes++;if(caseOwner!==this.lastHolder){this.handoffs++;this.lastHolder=caseOwner;}}
        }
        this.caseOwner=caseOwner;this.deliveries=deliveries;
        if(caseOwner){this.of(caseOwner).caseSeconds+=dt;this.carry+=dt;}
        for(const launch of launches)if(!this.seenLaunches.has(launch.id)){this.seenLaunches.add(launch.id);this.of(launch.playerId).flights++;}
        const race=this.elapsed>=this.raceSamples*this.raceStep;
        this.elapsed+=dt;
        for(const player of players){
            const stats=this.of(player.id);
            if(player.id===caseOwner)this.carrierName=player.name;
            if(race){
                stats.race??=Array<number>(this.raceSamples).fill(0);
                stats.race.push(Math.round(progress(player,assignment)*10)/10);
            }
            if(player.hp<=0){stats.last=undefined;continue;}
            stats.alive+=dt;
            if(player.y<-.5)stats.sewer+=dt;
            stats.peak=Math.max(stats.peak,player.y);
            if(stats.last){const stride=Math.hypot(player.x-stats.last.x,player.z-stats.last.z);if(stride<MAX_STRIDE)stats.distance+=stride;}
            stats.last={x:player.x,z:player.z};
        }
        if(race)this.nextRaceSample();
    }
    /** Rats gone since the last sample leave the race; a full race keeps every other sample at twice the step. */
    private nextRaceSample():void {
        this.raceSamples++;
        for(const stats of this.stats.values())if(stats.race&&stats.race.length!==this.raceSamples)stats.race=undefined;
        if(this.raceSamples<RACE_LIMIT.points-1)return;
        for(const stats of this.stats.values())if(stats.race)stats.race=stats.race.filter((_,i)=>i%2===0);
        this.raceSamples=Math.ceil(this.raceSamples/2);this.raceStep*=2;
    }
    private endCarry():void {
        if(this.caseOwner){const stats=this.of(this.caseOwner);stats.carry=Math.max(stats.carry,this.carry);}
        if(this.caseOwner&&this.carry>(this.longestCarry?.seconds??0))this.longestCarry={playerId:this.caseOwner,playerName:this.carrierName,seconds:this.carry};
        this.carry=0;
    }
    reset():void {
        this.stats.clear();this.triggers.clear();this.hitShots.clear();this.seenLaunches.clear();this.recent.clear();this.caseOwner=null;this.deliveries=0;this.calledSerial=-1;
        this.kills=0;this.elapsed=0;this.lastHolder=null;this.handoffs=0;this.carry=0;this.carrierName='';this.longestCarry=undefined;this.raceStep=RACE_STEP;this.raceSamples=0;
        this.incidents={};this.incidentSerial=-1;
    }

    private value(id:AwardId,player:PlayerData):number {
        const stats=this.stats.get(player.id);
        if(id==='top-gun')return player.kills;
        if(!stats)return 0;
        switch(id){
            case 'most-cheesed':return stats.cheesed;
            case 'butterfingers':return stats.drops;
            case 'sewer-dweller':return Math.round(stats.sewer);
            case 'high-flier':return Math.round(stats.peak);
            case 'sharpshooter':return stats.shots>=MIN_SHOTS?Math.round(stats.hits/stats.shots*100):0;
            case 'headhunter':return stats.headshots;
            case 'long-shot':return Math.round(stats.longest);
            case 'case-keeper':return Math.round(stats.caseSeconds);
            case 'frequent-flier':return stats.flights;
            case 'supply-run':return stats.pickups;
            case 'legwork':return Math.round(stats.distance);
            case 'dispatcher':return stats.calls;
        }
    }

    /** One winner per category among players still present; ties go to the first found. */
    awards(players:ReadonlyMap<string,PlayerData>):Award[] {
        const awards:Award[]=[];
        for(const id of Object.keys(TITLES) as AwardId[]){
            let best:PlayerData|undefined,top=0;
            for(const player of players.values()){const v=this.value(id,player);if(v>top){top=v;best=player;}}
            if(best&&top>=FLOORS[id])awards.push({id,title:TITLES[id],playerId:best.id,playerName:best.name,value:top});
        }
        return awards;
    }

    /** The round's top rats for the police lineup, winner first: the assignment's
     * own progress, then kills, case time and fewest deaths. */
    lineup(players:ReadonlyMap<string,PlayerData>,winnerId:string,assignment?:AssignmentState):string[] {
        const caseSeconds=(player:PlayerData)=>this.stats.get(player.id)?.caseSeconds??0;
        return [...players.values()].sort((a,b)=>Number(b.id===winnerId)-Number(a.id===winnerId)||progress(b,assignment)-progress(a,assignment)
            ||b.kills-a.kills||caseSeconds(b)-caseSeconds(a)||a.deaths-b.deaths||a.name.localeCompare(b.name))
            .slice(0,LINEUP_SIZE).map(player=>player.id);
    }

    /** The results board's round report: totals over every rat this round, lines for the rats still
     * present, and the race of the leading present rats ending on their final progress. */
    report(players:ReadonlyMap<string,PlayerData>,seconds:number,assignment?:AssignmentState):RoundReport {
        this.endCarry();
        let supplies=0,flights=0,calls=0;
        for(const stats of this.stats.values()){supplies+=stats.pickups;flights+=stats.flights;calls+=stats.calls;}
        const rats=[...players.values()].map((player):ReportRat=>{
            const s=this.of(player.id);
            return {id:player.id,name:player.name,kills:player.kills,deaths:player.deaths,assists:s.assists,shots:s.shots,hits:s.hits,headshots:s.headshots,
                longest:Math.round(s.longest),caseSeconds:Math.round(s.caseSeconds),takes:s.takes,carry:Math.round(s.carry),streak:s.streak,
                supplies:s.pickups,flights:s.flights,damage:s.cheesed,dealt:s.dealt,alive:Math.round(s.alive),
                weapons:{...s.weapons},kinds:{...s.kinds},deathsBy:{...s.deathsBy}};
        });
        const leaders=[...players.values()].filter(player=>this.stats.get(player.id)?.race&&progress(player,assignment)>0)
            .sort((a,b)=>progress(b,assignment)-progress(a,assignment)||b.kills-a.kills||a.name.localeCompare(b.name)).slice(0,RACE_LIMIT.rats);
        const race=leaders.length?{step:this.raceStep,ids:leaders.map(player=>player.id),
            points:leaders.map(player=>[...this.stats.get(player.id)!.race!,Math.round(progress(player,assignment)*10)/10])}:undefined;
        const carry=this.longestCarry&&{...this.longestCarry,seconds:Math.round(this.longestCarry.seconds)};
        return {seconds:Math.round(Math.max(0,seconds)),kills:this.kills,handoffs:this.handoffs,...(carry?{carry}:{}),supplies,flights,calls,
            incidents:{...this.incidents},rats,...(race?{race}:{})};
    }
}

import type {Award, AwardId, PlayerData} from '../shared/networkProtocol';
import type {AssignmentState} from '../shared/assignments';

interface Stats {
    cheesed:number;drops:number;sewer:number;peak:number;
    shots:number;hits:number;headshots:number;longest:number;caseSeconds:number;flights:number;pickups:number;distance:number;
    last?:{x:number;z:number};
}

const TITLES:Record<AwardId,string>={
    'top-gun':'TOP GUN','most-cheesed':'MOST CHEESED','butterfingers':'BUTTERFINGERS',
    'sewer-dweller':'SEWER DWELLER','high-flier':'HIGH FLIER',
    'sharpshooter':'SHARPSHOOTER','headhunter':'HEADHUNTER','long-shot':'LONG SHOT','case-keeper':'CASE KEEPER',
    'frequent-flier':'FREQUENT FLIER','supply-run':'SUPPLY RUN','legwork':'LEGWORK',
};
/** Minimum values before an award is worth mentioning. Sharpshooter also needs `MIN_SHOTS`. */
const FLOORS:Record<AwardId,number>={'top-gun':1,'most-cheesed':3,'butterfingers':1,'sewer-dweller':5,'high-flier':14,
    'sharpshooter':1,'headhunter':1,'long-shot':20,'case-keeper':15,'frequent-flier':2,'supply-run':2,'legwork':250};
const MIN_SHOTS=8;
/** A larger jump in one tick is a respawn or teleport, not legwork. */
const MAX_STRIDE=12;
export const LINEUP_SIZE=5;

/** Polish 19 + juice T5: cosmetic per-round statistics for the Case File and
 * the police lineup shown at round end. In memory only (never persisted, never
 * used for scoring); a Durable Object restart mid-round starts the tallies again. */
export class RoundAwards {
    private readonly stats=new Map<string,Stats>();
    /** Accepted trigger pulls by shot id; only their balls count toward accuracy. */
    private readonly triggers=new Map<string,string>();
    private readonly hitShots=new Set<string>();
    private readonly seenLaunches=new Set<string>();
    private caseOwner:string|null=null;
    private deliveries=0;

    private of(id:string):Stats {
        let stats=this.stats.get(id);
        if(!stats){stats={cheesed:0,drops:0,sewer:0,peak:0,shots:0,hits:0,headshots:0,longest:0,caseSeconds:0,flights:0,pickups:0,distance:0};this.stats.set(id,stats);}
        return stats;
    }
    damage(victimId:string,amount:number):void {if(amount>0)this.of(victimId).cheesed+=amount;}
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
    kill(killer:PlayerData,victim:PlayerData,headshot:boolean):void {
        const stats=this.of(killer.id);
        if(headshot)stats.headshots++;
        stats.longest=Math.max(stats.longest,Math.hypot(killer.x-victim.x,killer.y-victim.y,killer.z-victim.z));
    }
    pickup(playerId:string):void {this.of(playerId).pickups++;}
    /** Per tick: case losses (not deliveries), case time, sewer seconds, highest altitude, distance and launcher rides. */
    sample(players:Iterable<PlayerData>,dt:number,caseOwner:string|null,deliveries:number,launches:readonly {id:string;playerId:string}[]=[]):void {
        if(this.caseOwner&&caseOwner!==this.caseOwner&&deliveries===this.deliveries)this.of(this.caseOwner).drops++;
        this.caseOwner=caseOwner;this.deliveries=deliveries;
        if(caseOwner)this.of(caseOwner).caseSeconds+=dt;
        for(const launch of launches)if(!this.seenLaunches.has(launch.id)){this.seenLaunches.add(launch.id);this.of(launch.playerId).flights++;}
        for(const player of players){
            const stats=this.of(player.id);
            if(player.hp<=0){stats.last=undefined;continue;}
            if(player.y<-.5)stats.sewer+=dt;
            stats.peak=Math.max(stats.peak,player.y);
            if(stats.last){const stride=Math.hypot(player.x-stats.last.x,player.z-stats.last.z);if(stride<MAX_STRIDE)stats.distance+=stride;}
            stats.last={x:player.x,z:player.z};
        }
    }
    reset():void {this.stats.clear();this.triggers.clear();this.hitShots.clear();this.seenLaunches.clear();this.caseOwner=null;this.deliveries=0;}

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
        const progress=(player:PlayerData)=>{
            if(!assignment)return player.kills;
            switch(assignment.id){
                case 'chain-of-custody':return assignment.deliveries[player.id]??0;
                case 'jurisdiction':return assignment.jurisdiction?.heldMs[player.id]??0;
                case 'closing-time':return this.stats.get(player.id)?.caseSeconds??0;
                case 'excessive-force':return assignment.caseKills[player.id]??0;
            }
        };
        const caseSeconds=(player:PlayerData)=>this.stats.get(player.id)?.caseSeconds??0;
        return [...players.values()].sort((a,b)=>Number(b.id===winnerId)-Number(a.id===winnerId)||progress(b)-progress(a)
            ||b.kills-a.kills||caseSeconds(b)-caseSeconds(a)||a.deaths-b.deaths||a.name.localeCompare(b.name))
            .slice(0,LINEUP_SIZE).map(player=>player.id);
    }
}

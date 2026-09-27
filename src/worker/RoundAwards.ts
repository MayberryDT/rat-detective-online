import type {Award, AwardId, PlayerData} from '../shared/networkProtocol';

interface Stats {cheesed:number;drops:number;sewer:number;peak:number}

const TITLES:Record<AwardId,string>={
    'top-gun':'TOP GUN','most-cheesed':'MOST CHEESED','butterfingers':'BUTTERFINGERS',
    'sewer-dweller':'SEWER DWELLER','high-flier':'HIGH FLIER',
};
/** Minimum values before an award is worth mentioning. */
const FLOORS:Record<AwardId,number>={'top-gun':1,'most-cheesed':3,'butterfingers':1,'sewer-dweller':5,'high-flier':14};

/** Polish 19: cosmetic per-round statistics for the Case File shown at round end.
 * In memory only (never persisted, never used for scoring); a Durable Object
 * restart mid-round simply starts the tallies again. */
export class RoundAwards {
    private readonly stats=new Map<string,Stats>();
    private caseOwner:string|null=null;
    private deliveries=0;

    private of(id:string):Stats {
        let stats=this.stats.get(id);
        if(!stats){stats={cheesed:0,drops:0,sewer:0,peak:0};this.stats.set(id,stats);}
        return stats;
    }
    damage(victimId:string,amount:number):void {if(amount>0)this.of(victimId).cheesed+=amount;}
    /** Per tick: case losses (not deliveries), sewer seconds and highest altitude. */
    sample(players:Iterable<PlayerData>,dt:number,caseOwner:string|null,deliveries:number):void {
        if(this.caseOwner&&caseOwner!==this.caseOwner&&deliveries===this.deliveries)this.of(this.caseOwner).drops++;
        this.caseOwner=caseOwner;this.deliveries=deliveries;
        for(const player of players){
            if(player.hp<=0)continue;
            const stats=this.of(player.id);
            if(player.y<-.5)stats.sewer+=dt;
            stats.peak=Math.max(stats.peak,player.y);
        }
    }
    reset():void {this.stats.clear();this.caseOwner=null;this.deliveries=0;}

    /** One winner per category among players still present; ties go to the first found. */
    awards(players:ReadonlyMap<string,PlayerData>):Award[] {
        const value=(id:AwardId,player:PlayerData)=>{
            const stats=this.stats.get(player.id);
            return id==='top-gun'?player.kills:!stats?0:id==='most-cheesed'?stats.cheesed:id==='butterfingers'?stats.drops:
                id==='sewer-dweller'?Math.round(stats.sewer):Math.round(stats.peak);
        };
        const awards:Award[]=[];
        for(const id of Object.keys(TITLES) as AwardId[]){
            let best:PlayerData|undefined,top=0;
            for(const player of players.values()){const v=value(id,player);if(v>top){top=v;best=player;}}
            if(best&&top>=FLOORS[id])awards.push({id,title:TITLES[id],playerId:best.id,playerName:best.name,value:top});
        }
        return awards;
    }
}

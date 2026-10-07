import type {CaseState} from '../../chaosState';
import type {PlayerData,Vec3Data} from '../../networkProtocol';

/** A carrier observed directly: its position is remembered when line of sight is lost. */
export interface KnownCarrier {
    readonly id:string;
    readonly rat:PlayerData;
    readonly p:Vec3Data;
    readonly at:number;
    readonly seen:boolean;
    readonly pinged:boolean;
}
interface Fix {id:string;rat:PlayerData|undefined;p:Vec3Data;at:number;seen:boolean;pinged:boolean;
    /** Whether `point` holds anything yet: nothing before the first sight. */known:boolean;pingAt:number;readonly point:Vec3Data}

/** Each case's carrier fix (by case key), kept across decisions. A new carrier forgets the old fix; a
 * sight refreshes it. Fixes are reused: nothing is allocated per tick. */
export class CarrierSight {
    private readonly fixes=new Map<string,Fix>();
    private readonly list:Fix[]=[];
    /** Other rats carrying a case whose place this rat knows, nearest first, as of the last decision (`see`). */
    get known():readonly KnownCarrier[]{return this.list as readonly KnownCarrier[];}
    reset():void{this.fixes.clear();this.list.length=0;}

    /** Every tick: a case changing hands drops its fix; pings provide no knowledge. */
    observe(cases:readonly {key:string;value:CaseState}[],selfId:string):void {
        for(const {key,value} of cases){
            const owner=value.owner&&value.owner!==selfId?value.owner:'';
            let fix=this.fixes.get(key);
            if(!fix){const point={x:0,y:0,z:0};fix={id:'',rat:undefined,p:point,at:-Infinity,seen:false,pinged:false,known:false,pingAt:-Infinity,point};this.fixes.set(key,fix);}
            if(fix.id!==owner){fix.id=owner;fix.rat=undefined;fix.p=fix.point;fix.at=fix.pingAt=-Infinity;fix.seen=fix.pinged=fix.known=false;}

        }
        if(this.fixes.size>cases.length)for(const key of this.fixes.keys()){
            let kept=false;for(const c of cases)if(c.key===key){kept=true;break;}
            if(!kept)this.fixes.delete(key);
        }
    }

    /** At a decision: a carrier in `visible` (sight range and a clear line, the motor's sight) is seen now and tracked
     * live; any other keeps its last known point. Lists the known ones among `living`, nearest first, each rat once. */
    see(self:Vec3Data,visible:readonly PlayerData[],living:readonly PlayerData[],time:number):void {
        const list=this.list;list.length=0;
        for(const fix of this.fixes.values()){
            fix.seen=false;
            if(!fix.id)continue;
            let rat:PlayerData|undefined;
            for(const p of visible)if(p.id===fix.id){rat=p;break;}
            if(rat){
                fix.point.x=rat.x;fix.point.y=rat.y;fix.point.z=rat.z;fix.at=time;
                fix.seen=fix.known=true;fix.pinged=false;
            }else for(const p of living)if(p.id===fix.id){rat=p;break;}
            fix.rat=rat;fix.p=fix.seen&&rat?rat:fix.point;
            if(!rat||!fix.known)continue;
            // A rat holding two cases is listed once, at its newer fix.
            let i=0;while(i<list.length&&list[i]!.id!==fix.id)i++;
            if(i===list.length)list.push(fix);else if(fix.at>list[i]!.at)list[i]=fix;
        }
        if(list.length>1)list.sort((a,b)=>Math.hypot(a.p.x-self.x,a.p.y-self.y,a.p.z-self.z)-Math.hypot(b.p.x-self.x,b.p.y-self.y,b.p.z-self.z));
    }

    /** Own case or a carrier observed directly; loose-case sight is handled by the goal selector. */
    caseAt(key:string,c:CaseState,selfId:string):Vec3Data|undefined {
        if(c.owner===selfId)return c.p;
        if(!c.owner)return undefined;
        const fix=this.fixes.get(key);
        return fix?.known?fix.p:undefined;
    }
}

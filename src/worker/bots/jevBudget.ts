/** The daily Jev cap across rooms (docs/bot-overhaul.md): each room adds up its own spend and reports it
 * about every 30 s to one ledger, the `Matchmaker` instance named `jev-budget`. A room spends only while it
 * knows today's total and it, plus its unreported spend, is under the cap; the next UTC day starts afresh.
 * It fails closed: a ledger it cannot reach, or has not heard from for two report intervals, stops it. */
export const JEV_LEDGER='jev-budget';
const REPORT_MS=30_000,RETRY_MS=30_000,TRUST_MS=2*REPORT_MS;

export interface JevBudgetStatus {day:string;total:number;cap:number;capped:boolean}
export interface JevLedger {
    spend(dollars:number,now:number):Promise<JevBudgetStatus>;
    read(now:number):Promise<JevBudgetStatus>;
}
export const utcDay=(now:number)=>new Date(now).toISOString().slice(0,10);

export class JevBudget {
    private status?:JevBudgetStatus;
    /** When the call that brought `status` was made. */
    private statusAt=0;
    private pending=0;
    private reportAt=0;
    private readAt=0;
    private busy=false;
    /** A flush asked for while a call was out: it runs when that call ends. */
    private flushWanted=false;
    constructor(private readonly ledger:JevLedger,private readonly waitUntil:(work:Promise<unknown>)=>void,private readonly clock:()=>number=Date.now){}

    /** Whether Jev may spend now. Until today's total is known, or once it is too old to trust, the answer is
     * no. A total half that old is asked for again while it still holds. */
    allows(now:number):boolean {
        const status=this.status,age=now-this.statusAt;
        const trusted=status?.day===utcDay(now)&&age<TRUST_MS;
        if(!this.busy&&now>=this.readAt&&(!trusted||age>=REPORT_MS))this.call(this.ledger.read(now),now,0);
        return trusted&&!status.capped&&status.total+this.pending<status.cap;
    }
    add(dollars:number):void{if(dollars>0)this.pending+=dollars;}
    /** Report the unreported spend when due, or at once (`flush`: Jev switched off, or spent while off). */
    tick(now:number,flush=false):void {
        if(this.busy){if(flush)this.flushWanted=true;return;}
        if(this.pending<=0||!flush&&now<this.reportAt)return;
        const dollars=this.pending;
        this.pending=0;this.reportAt=now+REPORT_MS;
        this.call(this.ledger.spend(dollars,now),now,dollars);
    }

    private call(request:Promise<JevBudgetStatus>,now:number,dollars:number):void {
        this.busy=true;
        this.waitUntil(request.then(status=>{this.status=status;this.statusAt=now;},()=>{
            // Unreachable ledger: stop spending, keep the spend for the next report, and ask again later.
            this.status=undefined;this.pending+=dollars;this.readAt=now+RETRY_MS;
        }).finally(()=>{
            this.busy=false;
            if(this.flushWanted){this.flushWanted=false;this.tick(this.clock(),true);}
        }));
    }
}

/** The daily Jev cap across rooms (docs/bot-overhaul.md): each room adds up its own spend and reports it
 * about every 30 s to one ledger, the `Matchmaker` instance named `jev-budget`. A room spends only while it
 * knows today's total and it, plus its unreported spend, is under the cap; the next UTC day starts afresh. */
export const JEV_LEDGER='jev-budget';
const REPORT_MS=30_000,RETRY_MS=30_000;

export interface JevBudgetStatus {day:string;total:number;cap:number;capped:boolean}
export interface JevLedger {
    spend(dollars:number,now:number):Promise<JevBudgetStatus>;
    read(now:number):Promise<JevBudgetStatus>;
}
export const utcDay=(now:number)=>new Date(now).toISOString().slice(0,10);

export class JevBudget {
    private status?:JevBudgetStatus;
    private pending=0;
    private reportAt=0;
    private readAt=0;
    private busy=false;
    constructor(private readonly ledger:JevLedger,private readonly waitUntil:(work:Promise<unknown>)=>void){}

    /** Whether Jev may spend now. Until today's total is known the answer is no, and the ledger is asked. */
    allows(now:number):boolean {
        const status=this.status;
        if(status?.day===utcDay(now))return !status.capped&&status.total+this.pending<status.cap;
        if(!this.busy&&now>=this.readAt)this.call(this.ledger.read(now),now,0);
        return false;
    }
    add(dollars:number):void{if(dollars>0)this.pending+=dollars;}
    /** Report the unreported spend when due, or at once (`flush`: Jev switched off). */
    tick(now:number,flush=false):void {
        if(this.busy||this.pending<=0||!flush&&now<this.reportAt)return;
        const dollars=this.pending;
        this.pending=0;this.reportAt=now+REPORT_MS;
        this.call(this.ledger.spend(dollars,now),now,dollars);
    }

    private call(request:Promise<JevBudgetStatus>,now:number,dollars:number):void {
        this.busy=true;
        this.waitUntil(request.then(status=>{this.status=status;},()=>{
            // Unreachable ledger: keep the spend for the next report, and ask again later.
            this.pending+=dollars;this.readAt=now+RETRY_MS;
        }).finally(()=>{this.busy=false;}));
    }
}

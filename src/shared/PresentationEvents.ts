/** Ordered socket events are retained only until the common display clock
 * reaches their source timestamp. Clearing an epoch drops every old closure. */
export class PresentationEvents<T> {
    private pending:Array<{at:number;value:T}>=[];
    constructor(private readonly capacity=128){}
    push(at:number,value:T):void {
        if(!Number.isFinite(at))return;
        if(this.pending.length>=this.capacity)throw new Error('Presentation event budget exceeded');
        this.pending.push({at,value});
        this.pending.sort((a,b)=>a.at-b.at);
    }
    drain(at:number,apply:(value:T)=>void):void {
        while(this.pending.length&&this.pending[0].at<=at)apply(this.pending.shift()!.value);
    }
    clear():void {this.pending.length=0;}
    discard(matches:(value:T)=>boolean):void {this.pending=this.pending.filter(entry=>!matches(entry.value));}
    get size():number{return this.pending.length;}
}

import type {Vec3Data} from './networkProtocol';

export const CLUES={max:64,visible:3,range:25,spacing:10,lifeMs:25000,freshMs:3000,wornMs:10000} as const;
export interface CaseClue {id:string;p:Vec3Data;at:number;anchored?:true}
export interface ClueEvent {what:'shed'|'clear';id:string;p:Vec3Data}
export function clueAge(c:CaseClue,now:number):0|1|2{return now-c.at<CLUES.freshMs?0:now-c.at<CLUES.wornMs?1:2;}
export function validClues(value:unknown):value is CaseClue[]{
    if(!Array.isArray(value)||value.length>CLUES.max)return false;
    const ids=new Set<string>();
    return value.every(c=>c&&typeof c.id==='string'&&c.id.length>0&&c.id.length<=64&&!ids.has(c.id)&&
        (ids.add(c.id),true)&&Number.isFinite(c.at)&&c.p&&[c.p.x,c.p.y,c.p.z].every(Number.isFinite)&&
        (c.anchored===undefined||c.anchored===true));
}
/** Same local budget for rendering and bot observations. Age is deliberately NOT a sort key. */
export function visibleClues(clues:readonly CaseClue[],eye:Vec3Data,now:number,canSee:(p:Vec3Data)=>boolean):CaseClue[]{
    const distance=(p:Vec3Data)=>Math.hypot(p.x-eye.x,p.y-eye.y,p.z-eye.z);
    const nearby=clues.filter(c=>(c.anchored||now-c.at<CLUES.lifeMs)&&distance(c.p)<=CLUES.range)
        .sort((a,b)=>distance(a.p)-distance(b.p));
    const visible:CaseClue[]=[];
    for(const c of nearby)if(canSee(c.p)){visible.push(c);if(visible.length===CLUES.visible)break;}
    return visible;
}
/** Bounded authority history, no physics or per-player paths. Only real supported passage emits evidence. */
export class CaseClues {
    items:CaseClue[]=[];
    private serial=0;
    private previous?:Vec3Data;
    private travelled=0;
    private events:ClueEvent[]=[];
    constructor(saved?:CaseClue[]){if(validClues(saved))this.items=structuredClone(saved);}
    clear():void {
        if(this.items.length)this.events.push({what:'clear',id:this.items[0]!.id,p:{...this.items[0]!.p}});
        this.items=[];this.previous=undefined;this.travelled=0;
    }
    step(p:Vec3Data|undefined,now:number):void {
        this.items=this.items.filter(c=>c.anchored||now-c.at<CLUES.lifeMs);
        if(!p){for(const c of this.items)delete c.anchored;this.previous=undefined;this.travelled=0;return;}
        const before=this.previous,delta=before?Math.hypot(p.x-before.x,p.y-before.y,p.z-before.z):0;
        if(delta>6){this.previous=undefined;this.travelled=0;} // discontinuity: no interpolated trail
        else this.travelled+=delta;
        // Restore a stationary endpoint without duplicating it on wake.
        const endpoint=this.items.find(c=>c.anchored);
        if(!this.previous&&endpoint&&Math.hypot(endpoint.p.x-p.x,endpoint.p.y-p.y,endpoint.p.z-p.z)<1){
            this.previous={...p};return;
        }
        if(!this.previous||this.travelled>=CLUES.spacing){
            for(const c of this.items)delete c.anchored;
            const clue:CaseClue={id:'paper-'+now.toString(36)+'-'+(++this.serial).toString(36),p:{...p},at:now,anchored:true};
            this.items.push(clue);if(this.items.length>CLUES.max)this.items.shift();
            this.events.push({what:'shed',id:clue.id,p:{...p}});
            this.travelled=0;
        }
        this.previous={...p};
    }
    drain():ClueEvent[]{return this.events.splice(0);}
}

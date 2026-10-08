import {BotNavigation} from './BotNavigation';
import type {WorldSpec} from './worldSpec';
import type {PlayerData} from './networkProtocol';
import type {Vec3Data} from './networkProtocol';

export const CLUES={max:128,visible:48,range:65,spacing:4,lifeMs:25000,freshMs:3000,wornMs:10000} as const;
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
/** Shared physical routes, refreshed from each rat toward the current case. Tyler, 7 October:
 * multiple obvious paper trails at every spawn; no x-ray guidance. */
export class CaseClues {
    items:CaseClue[]=[];
    private readonly navigation?:BotNavigation;
    private paths=new Map<string,{points:Vec3Data[];papers:Vec3Data[];target:Vec3Data;at:number}>();
    private events:ClueEvent[]=[];
    private placements=new Map<string,Vec3Data|null>();
    private leads=new Map<string,{origin:Vec3Data;points:Vec3Data[]}>();
    private pending?:{id:string;from:Vec3Data;target:Vec3Data;search:Generator<void,Vec3Data[]>};
    constructor(spec?:WorldSpec,saved?:CaseClue[]){
        if(spec)this.navigation=new BotNavigation(spec);
        if(validClues(saved))this.items=structuredClone(saved);
    }
    clear():void {
        if(this.items.length)this.events.push({what:'clear',id:this.items[0]!.id,p:{...this.items[0]!.p}});
        this.items=[];this.paths.clear();this.placements.clear();this.leads.clear();this.pending=undefined;
    }
    guide(players:Iterable<PlayerData>,target:Vec3Data,now:number,clear?:(a:Vec3Data,b:Vec3Data)=>boolean):void {
        const nav=this.navigation;if(!nav)return;
        const living=[...players].filter(p=>p.hp>0).sort((a,b)=>Number(a.id.startsWith('rd-ai-'))-Number(b.id.startsWith('rd-ai-')));
        const ids=new Set(living.map(p=>p.id));for(const id of this.paths.keys())if(!ids.has(id))this.paths.delete(id);
        const distance=(a:Vec3Data,b:Vec3Data)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
        for(const id of this.leads.keys())if(!ids.has(id))this.leads.delete(id);
        for(const player of living)if(!this.leads.has(player.id)){
            const facing={x:2*(player.meshQx*player.meshQz+player.meshQw*player.meshQy),y:0,
                z:1-2*(player.meshQx*player.meshQx+player.meshQy*player.meshQy)};
            const points=nav.paperLead(player,facing,clear);
            this.leads.set(player.id,{origin:{x:player.x,y:player.y,z:player.z},points});
            if(points.length)this.events.push({what:'shed',id:'lead-'+player.id,p:{...points[0]!}});
        }
        // One bounded slice of the shared walk graph per simulation step; new humans first.
        if(this.pending&&(!ids.has(this.pending.id)||distance(living.find(p=>p.id===this.pending!.id)!,this.pending.from)>40))this.pending=undefined;
        if(this.pending?.id.startsWith('rd-ai-')&&living.some(p=>!p.id.startsWith('rd-ai-')&&!this.paths.has(p.id)))this.pending=undefined;
        if(!this.pending)for(const player of living){
            const old=this.paths.get(player.id);
            if(old&&now-old.at<1000)continue;
            if(old&&distance(old.target,target)<8&&old.points.some(p=>distance(p,player)<6))continue;
            this.pending={id:player.id,from:{x:player.x,y:player.y,z:player.z},target:{...target},search:nav.paperRouteSteps(player,target,clear)};break;
        }
        if(this.pending){
            const job=this.pending,result=job.search.next();
            if(result.done){
                const papers:Vec3Data[]=[];let travelled=6,previous=result.value[0];
                for(const [i,p] of result.value.entries()){
                    travelled+=distance(previous!,p);previous=p;
                    const seed=Math.abs(Math.imul(Math.round(p.x),73856093)^Math.imul(Math.round(p.z),19349663));
                    const a=result.value[i-1],b=result.value[i+1];
                    const turn=a&&b&&Math.abs((p.x-a.x)*(b.z-p.z)-(p.z-a.z)*(b.x-p.x))>.1;
                    if(i!==result.value.length-1&&!turn&&(travelled<2.8||(travelled<5.5&&seed%3===0)))continue;
                    papers.push(p);travelled=0;
                }
                this.paths.set(job.id,{points:result.value,papers,target:job.target,at:now});
                if(result.value.length)this.events.push({what:'shed',id:'trail-'+job.id,p:{...result.value[0]!}});
                this.pending=undefined;
            }
        }
        const previousClues=new Map(this.items.map(c=>[c.id,c]));
        const next=new Map<string,CaseClue>();
        for(const player of living){
            const points=this.paths.get(player.id)?.papers??[];
            let start=0,nearest=Infinity;
            points.forEach((p,i)=>{const d=distance(p,player);if(d<nearest){nearest=d;start=i;}});
            const add=(p:Vec3Data,starter=false)=>{
                const id='paper-'+p.x+'-'+Math.round(p.y*100)+'-'+p.z;
                if(!this.placements.has(id)){
                    let seed=2166136261;for(const c of id)seed=Math.imul(seed^c.charCodeAt(0),16777619);
                    this.placements.set(id,nav.paperPlacement(p,seed>>>0)??null);
                }
                const placed=this.placements.get(id);if(!placed)return false;
                if(next.has(id))return true; // shared location, never stacked pages
                const clueId=starter?'lead-'+id:id;
                next.set(id,previousClues.get(clueId)??{id:clueId,p:{x:placed.x,y:placed.y+.018,z:placed.z},at:now,anchored:true});
                return true;
            };
            // Sampling is fixed when a route is built, not re-phased around the rat.
            // A moving window only adds/removes its boundary; retained sheets never move.
            let count=0;
            const lead=this.leads.get(player.id);
            if(lead&&distance(player,lead.origin)<8)for(const p of lead.points)if(add(p,true))count++;
            for(let i=Math.max(0,start-1);i<points.length&&count<12;i++)
                if(add(points[i]!))count++;

        }
        this.items=[...next.values()].slice(0,CLUES.max);
        // Bound geometry-probe cache to active paths, not the lifetime of the room.
        if(this.placements.size>4096)this.placements.clear();
    }
    drain():ClueEvent[]{return this.events.splice(0);}
}

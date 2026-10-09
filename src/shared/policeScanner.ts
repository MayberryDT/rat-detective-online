import type {PlayerData,Vec3Data} from './networkProtocol';
import {placePhrase} from './radioPlaces';

/** The police scanner (Tyler, 9 October: "we want a lot more police scanner"): the city's radio calls the case's
 * whereabouts all round, every rat hears the same. Everything it says is true and coarse: where the carrier was seen
 * `SCANNER.delayMs` ago (a part of town, never a pin) and which way it was heading, the case changing hands or lying
 * loose, rats going down, rats in the air, pigeons spooked. A line carrying a lead names the point and when it was true
 * (`p`, `seen`) and whose it is (`c`), so a bot hears exactly what a player reads. */
export const SCANNER={lines:6,lineMs:20_000,gapMs:3_000,carrierEveryMs:8_000,delayMs:4_000,headingMs:2_500,staleMs:6_000,downEveryMs:7_000} as const;
export type ScannerKind='carrier'|'taken'|'loose'|'down'|'airborne'|'pigeons'|'safe';
export interface ScannerLine {id:string;at:number;kind:ScannerKind;text:string;p?:Vec3Data;seen?:number;c?:string}
const KINDS:readonly ScannerKind[]=['carrier','taken','loose','down','airborne','pigeons','safe'];

export function validScanner(value:unknown):value is ScannerLine[]{
    const ids=new Set<string>();
    const point=(p:unknown)=>!!p&&typeof p==='object'&&[(p as Vec3Data).x,(p as Vec3Data).y,(p as Vec3Data).z].every(Number.isFinite);
    return Array.isArray(value)&&value.length<=SCANNER.lines&&value.every(l=>l&&typeof l.id==='string'&&l.id.length>0&&l.id.length<=64&&!ids.has(l.id)&&(ids.add(l.id),true)&&
        Number.isFinite(l.at)&&KINDS.includes(l.kind)&&typeof l.text==='string'&&l.text.length<=160&&(l.p===undefined||point(l.p))&&
        (l.seen===undefined||Number.isFinite(l.seen))&&(l.c===undefined||typeof l.c==='string'&&l.c.length>0&&l.c.length<=64));
}

const COMPASS=['NORTH','NORTH-EAST','EAST','SOUTH-EAST','SOUTH','SOUTH-WEST','WEST','NORTH-WEST'];
/** North is −z. */
const heading=(dx:number,dz:number)=>COMPASS[Math.round(Math.atan2(dx,-dz)/(Math.PI/4))&7]!;
const CALLS=['ALL UNITS:','DISPATCH:','BE ADVISED:','CAR 9:','ATTENTION ALL CARS:','UNIT 12:','THIS IS DISPATCH:','HEADS UP:'];

interface Pending {at:number;kind:ScannerKind;text:string;p?:Vec3Data;seen?:number;c?:string}

export class PoliceScanner {
    lines:ScannerLine[]=[];
    /** The carrier's recent positions (every 250 ms), for the delayed sighting and its heading. */
    private readonly track:{at:number;x:number;y:number;z:number}[]=[];
    private readonly queue:Pending[]=[];
    private carrier='';
    private owner:string|null=null;
    private nextCarrier=0;
    private lastLine=0;
    private lastDown=0;
    private next=1;
    private call=0;
    constructor(saved?:unknown,private readonly random:()=>number=Math.random){
        if(validScanner(saved))this.lines=structuredClone(saved);
        for(const l of this.lines){const n=parseInt(l.id.slice(1),36);if(Number.isFinite(n))this.next=Math.max(this.next,n+1);}
    }
    private prefix():string {this.call=(this.call+1+Math.floor(this.random()*3))%CALLS.length;return CALLS[this.call]!;}
    private say(line:Pending):void {this.queue.push(line);}

    /** One step while the round plays. `carrier`: the rat holding the case, if any; `caseAt`: where the case is. */
    step(now:number,carrier:PlayerData|undefined,caseAt:Vec3Data,owner:string|null):void {
        if(this.lines.length&&now-this.lines[0]!.at>=SCANNER.lineMs)this.lines=this.lines.filter(l=>now-l.at<SCANNER.lineMs);
        if(owner!==this.owner){
            if(owner&&carrier)this.say({at:now,kind:'taken',text:`${this.prefix()} ${carrier.name.toUpperCase()} HAS THE CASE ${placePhrase(carrier)}.`,p:{x:carrier.x,y:carrier.y,z:carrier.z},seen:now,c:carrier.id});
            else if(!owner)this.say({at:now,kind:'loose',text:`${this.prefix()} THE CASE IS LOOSE ${placePhrase(caseAt)}.`,p:{...caseAt},seen:now});
            this.owner=owner;
        }
        if(!carrier){this.track.length=0;this.carrier='';}
        else{
            if(carrier.id!==this.carrier){this.carrier=carrier.id;this.track.length=0;this.nextCarrier=now+SCANNER.carrierEveryMs*.75;}
            const last=this.track[this.track.length-1];
            if(!last||now-last.at>=250){this.track.push({at:now,x:carrier.x,y:carrier.y,z:carrier.z});if(this.track.length>64)this.track.shift();}
            if(now>=this.nextCarrier){
                this.nextCarrier=now+SCANNER.carrierEveryMs;
                const seen=this.at(now-SCANNER.delayMs),before=this.at(now-SCANNER.delayMs-SCANNER.headingMs);
                if(seen){
                    const dx=before?seen.x-before.x:0,dz=before?seen.z-before.z:0,moving=Math.hypot(dx,dz)>3,where=placePhrase(seen);
                    const text=moving?`${this.prefix()} SUSPECT WITH THE CASE SEEN ${where}, HEADING ${heading(dx,dz)}.`
                        :`${this.prefix()} SUSPECT WITH THE CASE HOLED UP ${where}.`;
                    this.say({at:now,kind:'carrier',text,p:{x:seen.x,y:seen.y,z:seen.z},seen:seen.at,c:carrier.id});
                }
            }
        }
        // One line at a time on the air, the newest news first; what waited too long is dropped (a carrier sighting never
        // waits behind chatter).
        if(now-this.lastLine<SCANNER.gapMs||!this.queue.length)return;
        for(let i=this.queue.length-1;i>=0;i--)if(now-this.queue[i]!.at>SCANNER.staleMs)this.queue.splice(i,1);
        const pick=this.queue.findIndex(l=>l.kind==='carrier'||l.kind==='taken'||l.kind==='loose');
        const line=this.queue.splice(pick>=0?pick:this.queue.length-1,1)[0];
        if(!line)return;
        this.lastLine=now;
        this.lines.push({id:'r'+(this.next++).toString(36),...line,at:Math.round(now),...(line.seen!==undefined?{seen:Math.round(line.seen)}:{})});
        if(this.lines.length>SCANNER.lines)this.lines.splice(0,this.lines.length-SCANNER.lines);
    }
    /** The carrier's position at `t` (the nearest sample at or before it). */
    private at(t:number):{at:number;x:number;y:number;z:number}|undefined {
        let found;for(const s of this.track){if(s.at>t)break;found=s;}
        return found;
    }
    /** A rat went down at `p` (rate-limited: a firefight is one call). */
    down(p:Vec3Data,now:number):void {
        if(now-this.lastDown<SCANNER.downEveryMs)return;
        this.lastDown=now;this.say({at:now,kind:'down',text:`${this.prefix()} RAT DOWN ${placePhrase(p)}.`});
    }
    airborne(p:Vec3Data,now:number):void {this.say({at:now,kind:'airborne',text:`${this.prefix()} RAT AIRBORNE ${placePhrase(p)}.`});}
    /** Pigeons flushed by the carrier: a lead, as the flock is to anyone who sees it. */
    pigeons(p:Vec3Data,carrier:string,now:number):void {this.say({at:now,kind:'pigeons',text:`${this.prefix()} PIGEONS SPOOKED ${placePhrase(p)}.`,p:{...p},seen:now,c:carrier});}
    /** A penthouse safe's alarm or its cracking (`text` names the place). */
    safe(text:string,now:number):void {this.say({at:now,kind:'safe',text:`${this.prefix()} ${text}`});}
    clear():void {this.lines=[];this.track.length=0;this.queue.length=0;this.carrier='';this.owner=null;this.nextCarrier=0;this.lastLine=0;this.lastDown=0;}
}

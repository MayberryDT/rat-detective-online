import './policeScanner.css';
import type {ScannerLine} from '../shared/policeScanner';
import {scrawl} from './motion';
import {perfMark} from '../session/perfMarks';

/** How long a call stays up, when it dims, and how many show at once. */
const FEED={showMs:12_000,dimMs:5_000,rows:2,keyMs:900} as const;
const CASE_CALLS=new Set(['carrier','taken','loose']);

/** The police scanner on screen (Tyler, 9 October: "we want a lot more police scanner"): each new call from the room's
 * radio (`policeScanner.ts`) types in under the POLICE BAND line, dims, and goes; the newest two show. The case's calls
 * (where the carrier was seen, the case taken or loose) are in case red and key the set (a red light, a quiet squelch
 * and two chirps); the rest come in silent. Each call shows once: one that has scrolled off never comes back (Tyler's
 * 9 October session: it re-added itself every frame, a squelch a frame). A compact feed, not a headline. */
export class PoliceScannerFeed {
    readonly root:HTMLElement;
    private readonly rows=new Map<string,{el:HTMLElement;at:number}>();
    /** Every call shown, kept while the room still lists it. */
    private readonly heard=new Set<string>();
    private keyedUntil=0;
    constructor(private readonly doc:Document,private readonly key:()=>void){
        this.root=doc.createElement('div');this.root.id='police-scanner';this.root.setAttribute('aria-live','polite');
        const band=doc.createElement('div');band.className='scanner-band';band.innerHTML='<i></i><span>POLICE BAND</span>';
        this.root.appendChild(band);doc.body.appendChild(this.root);
    }
    /** `now`: the authority's clock (the lines' `at`). */
    update(lines:readonly ScannerLine[],now:number):void {
        // Headless documents (no class lists) get nothing.
        if(!this.root.classList)return;
        for(const line of lines){
            if(this.heard.has(line.id)||now-line.at>FEED.showMs)continue;
            this.heard.add(line.id);
            const el=this.doc.createElement('div');el.className=`scanner-line ${CASE_CALLS.has(line.kind)?'case':line.kind==='pigeons'?'pigeons':''}`;
            const call=line.text.match(/^([A-Z0-9 ]+:)\s*(.*)$/);
            const label=this.doc.createElement('b');label.textContent=call?.[1]??'';const body=this.doc.createElement('span');
            el.appendChild(label);el.appendChild(body);scrawl(body,call?.[2]??line.text);
            this.root.appendChild(el);this.rows.set(line.id,{el,at:line.at});
            if(now-line.at<2000&&CASE_CALLS.has(line.kind)){this.key();perfMark('radio');this.keyedUntil=performance.now()+FEED.keyMs;}
        }
        if(this.heard.size>lines.length+8){const live=new Set(lines.map(l=>l.id));for(const id of this.heard)if(!live.has(id))this.heard.delete(id);}
        for(const [id,row] of this.rows){
            const age=now-row.at;
            row.el.classList.toggle('old',age>FEED.dimMs);
            if(age>FEED.showMs){row.el.remove();this.rows.delete(id);}
        }
        while(this.rows.size>FEED.rows){const [id,row]=this.rows.entries().next().value!;row.el.remove();this.rows.delete(id);}
        this.root.classList.toggle('keyed',performance.now()<this.keyedUntil);
    }
    dispose():void {this.root.remove();this.rows.clear();this.heard.clear();}
}

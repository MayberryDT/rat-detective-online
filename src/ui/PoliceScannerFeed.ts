import './policeScanner.css';
import type {ScannerLine} from '../shared/policeScanner';
import {scrawl} from './motion';

/** How long a call stays up, when it dims, and how many show at once. */
const FEED={showMs:14_000,dimMs:6_000,rows:3,keyMs:900} as const;
const CASE_CALLS=new Set(['carrier','taken','loose']);

/** The police scanner on screen (Tyler, 9 October: "we want a lot more police scanner"): each new call from the room's
 * radio (`policeScanner.ts`) keys the set (a red light, the squelch and two chirps), types in under the POLICE BAND
 * line, dims, and goes; the newest three show. The case's calls are in case red. A compact feed, not a headline. */
export class PoliceScannerFeed {
    readonly root:HTMLElement;
    private readonly rows=new Map<string,{el:HTMLElement;at:number}>();
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
            if(this.rows.has(line.id)||now-line.at>FEED.showMs)continue;
            const el=this.doc.createElement('div');el.className=`scanner-line ${CASE_CALLS.has(line.kind)?'case':line.kind==='pigeons'?'pigeons':''}`;
            const call=line.text.match(/^([A-Z0-9 ]+:)\s*(.*)$/);
            const label=this.doc.createElement('b');label.textContent=call?.[1]??'';const body=this.doc.createElement('span');
            el.appendChild(label);el.appendChild(body);scrawl(body,call?.[2]??line.text);
            this.root.appendChild(el);this.rows.set(line.id,{el,at:line.at});
            if(now-line.at<2000){this.key();this.keyedUntil=performance.now()+FEED.keyMs;}
        }
        for(const [id,row] of this.rows){
            const age=now-row.at;
            row.el.classList.toggle('old',age>FEED.dimMs);
            if(age>FEED.showMs){row.el.remove();this.rows.delete(id);}
        }
        while(this.rows.size>FEED.rows){const [id,row]=this.rows.entries().next().value!;row.el.remove();this.rows.delete(id);}
        this.root.classList.toggle('keyed',performance.now()<this.keyedUntil);
    }
    dispose():void {this.root.remove();this.rows.clear();}
}

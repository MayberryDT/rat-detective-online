import {MAX_HP} from '../shared/networkProtocol';
import './hunchPlate.css';

const EYE='<svg viewBox="0 0 64 64" aria-hidden="true"><circle class="ring" cx="32" cy="32" r="29"/><path class="brim" d="M6 25Q32 7 58 25Q45 20 32 20T6 25Z"/>'
    +'<path class="lid" d="M11 36Q32 20 53 36Q32 51 11 36Z"/><circle class="iris" cx="32" cy="36" r="7.5"/><circle class="pupil" cx="32" cy="36" r="3.2"/></svg>';

/** Your own vitals, bottom left: five slanted pips like the nameplates, and the
 * Hunch as a power-up badge. At full health the badge slams on, the pips burn
 * gold and pencil hatching creeps in at the screen edges; the first hit cracks
 * it and it falls away. */
export class HunchPlate {
    private root?:HTMLElement;
    private pips:HTMLElement[]=[];
    private hp=-1;
    private hunch=false;
    private visible=false;
    constructor(private readonly doc:Document|undefined=globalThis.document){}

    /** `hp` undefined hides the plate (title, observer, dead, round end). */
    update(hp:number|undefined,hunch:boolean,supercharged:boolean):void {
        const visible=hp!==undefined;
        if(!visible&&!this.visible)return;
        if(!this.build())return;
        if(visible!==this.visible){this.visible=visible;this.root!.classList.toggle('on',visible);}
        // Hidden (dead, round end): drop the Hunch quietly so the next life slams it on again.
        if(!visible){this.hunch=false;this.hp=-1;this.root!.classList.remove('hunch','gained','broken');this.doc!.body.classList.remove('hunch-active');return;}
        if(hp!==this.hp){
            for(let i=0;i<MAX_HP;i++){
                const pip=this.pips[i]!,full=i<hp!,was=i<this.hp;
                pip.classList.toggle('full',full);pip.classList.toggle('last',full&&hp===1);
                if(was&&!full&&this.hp>=0){pip.classList.remove('lost');void pip.offsetWidth;pip.classList.add('lost');}
            }
            this.hp=hp!;
        }
        this.root!.classList.toggle('super',supercharged);
        if(hunch!==this.hunch){
            this.hunch=hunch;
            this.root!.classList.remove('gained','broken');void this.root!.offsetWidth;
            this.root!.classList.add(hunch?'gained':'broken');
            this.root!.classList.toggle('hunch',hunch);
            this.doc!.body.classList.toggle('hunch-active',hunch);
        }
    }
    reset():void {this.hp=-1;this.hunch=false;this.root?.classList.remove('hunch','gained','broken','on');this.visible=false;this.doc?.body?.classList.remove('hunch-active');}
    dispose():void {this.reset();this.root?.remove();this.root=undefined;this.pips=[];}

    private build():boolean {
        if(this.root)return true;
        if(!this.doc?.body||typeof this.doc.createElement!=='function')return false;
        const root=this.doc.createElement('div');root.className='hunch-plate';root.setAttribute('aria-hidden','true');
        const make=(tag:string,className:string,parent:HTMLElement,html='')=>{const node=this.doc!.createElement(tag);node.className=className;if(html)node.innerHTML=html;parent.appendChild(node);return node;};
        make('div','hunch-edges',root);
        make('div','hunch-badge',root,`${EYE}<i class="shard a"></i><i class="shard b"></i><i class="shard c"></i>`);
        const vitals=make('div','hunch-vitals',root),pips=make('div','hunch-pips',vitals);
        this.pips=Array.from({length:MAX_HP},()=>make('i','',pips));
        make('div','hunch-label',vitals,'<b>THE HUNCH</b><span>HUNCH LOST</span>');
        this.doc.body.appendChild(root);this.root=root;
        return true;
    }
}

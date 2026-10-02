import './headlines.css';
import {reducedMotion,replay} from './motion';

/** Clarity batch (protocol 29): which big message wins. Yours first (you got or lost the case), then your death, then an
 * incident starting, then the rest (other rats' case news, deliveries, posters, stamps, made, kills, callouts). */
export type HeadlineRank='case'|'death'|'incident'|'news';
const ORDER:Record<HeadlineRank,number>={case:0,death:1,incident:2,news:3};

/** Jargon explained once per browser: the first meeting gets the line, later only the word. */
export const EXPLANATIONS={
    made:'MADE: SOMEONE CAN SEE YOU THROUGH WALLS',
    hunch:'THE HUNCH: AT FULL HEALTH YOU SEE NEARBY RATS THROUGH WALLS',
    carrier:'ON THE CASE: YOUR HITS COUNT DOUBLE AND A KILL HEALS YOU',
    ironclad:'IRONCLAD: CHEESE BOUNCES OFF YOU · TRAPS STILL HOLD YOU',
    stakeout:'STAKEOUT: YOU SEE EVERY RAT THROUGH WALLS',
    held:'HELD: YOU CAN TURN AND SHOOT, NOT MOVE',
    'dud-hustle':'COLD FEET: YOU RUN SLOWLY',
    'dud-ironclad':'RUST BUCKET: NO JUMPING',
    'dud-stakeout':'STAKED OUT: EVERY RAT SEES YOU THROUGH WALLS',
    'dud-tommy-gun':'BACKFIRE: THE GUN BLEW UP IN YOUR PAWS',
    'dud-laser':'SHORT CIRCUIT: YOUR GUN WON\u2019T FIRE',
    'dud-mousetrap':'SNAPPED PAW: STUCK IN YOUR OWN TRAP',
} as const;
export type ExplainedWord=keyof typeof EXPLANATIONS;
const EXPLAINED_KEY='rat-detective-explained';

/** One headline at a time. A producer asks before showing its big message: it gets the screen when nothing outranks
 * what is up (the one it outranks is hidden through its `hide`), otherwise its `line` is told as the single compact
 * line instead. A holder keeps the screen for `ms` (Infinity: until it lets go with `release`). The compact line and
 * the first-time explanation are CSS-timed, so nothing here runs per frame. DOM built lazily (tests pay nothing). */
export class Headlines {
    private key='';
    private rank=Infinity;
    private until=0;
    private hide?:()=>void;
    private root?:HTMLElement;
    private line?:HTMLElement;
    private explainNode?:HTMLElement;
    private explained?:Set<string>;
    constructor(private readonly clock:()=>number=()=>performance.now()){}

    /** May `key` show its big message now? Same `key` renews its own hold. */
    claim(key:string,rank:HeadlineRank,line:string,ms:number,hide?:()=>void):boolean {
        if(this.clock()<this.until&&key!==this.key&&this.rank<=ORDER[rank]){this.shrink(line);return false;}
        this.take(key,rank,ms,hide);
        return true;
    }
    /** `key` takes the screen whatever holds it (your death screen always shows; it cuts your ON THE CASE stamp short). */
    take(key:string,rank:HeadlineRank,ms:number,hide?:()=>void):void {
        const now=this.clock();
        if(now<this.until&&key!==this.key)this.hide?.();
        this.key=key;this.rank=ORDER[rank];this.until=now+ms;this.hide=hide;
    }
    /** `key` is done with the screen (its message ended early, or a held one such as the death screen closed). */
    release(key:string):void {if(key===this.key){this.until=0;this.key='';this.rank=Infinity;this.hide=undefined;}}

    /** The single compact line: the latest message that lost the screen. */
    shrink(text:string):void {
        if(!this.build()||!this.line)return;
        this.line.textContent=text;this.line.classList.toggle('still',reducedMotion());replay(this.line,'on');
    }

    /** Has this browser met `word` yet? Marks it met. */
    firstTime(word:ExplainedWord):boolean {
        const seen=this.seen();
        if(seen.has(word))return false;
        seen.add(word);
        try{globalThis.localStorage?.setItem(EXPLAINED_KEY,JSON.stringify([...seen]));}catch{/* Private mode: explain again next visit. */}
        return true;
    }
    /** The first meeting with `word`: its one-line explanation on a slip above the supply cards. */
    explain(word:ExplainedWord):boolean {
        if(!this.firstTime(word))return false;
        if(!this.build()||!this.explainNode)return true;
        this.explainNode.textContent=EXPLANATIONS[word];this.explainNode.classList.toggle('still',reducedMotion());replay(this.explainNode,'on');
        return true;
    }

    /** A new round, a welcome or a death: nothing holds the screen and nothing is shown. */
    reset():void {
        this.release(this.key);
        this.line?.classList.remove('on');this.explainNode?.classList.remove('on');
    }

    private seen():Set<string> {
        if(this.explained)return this.explained;
        let stored:unknown=[];
        try{stored=JSON.parse(globalThis.localStorage?.getItem(EXPLAINED_KEY)??'[]');}catch{stored=[];}
        this.explained=new Set(Array.isArray(stored)?stored.filter((word):word is string=>typeof word==='string'):[]);
        return this.explained;
    }
    private build():boolean {
        if(this.root)return true;
        const doc=globalThis.document;
        if(!doc?.body||typeof doc.createElement!=='function')return false;
        this.root=doc.createElement('div');this.root.className='headlines';this.root.setAttribute('aria-live','polite');
        this.line=doc.createElement('div');this.line.className='headline-line';this.root.appendChild(this.line);
        this.explainNode=doc.createElement('div');this.explainNode.className='headline-explain';this.root.appendChild(this.explainNode);
        doc.body.appendChild(this.root);
        return true;
    }
}

/** The game's one queue for big on-screen messages. */
export const headlines=new Headlines();

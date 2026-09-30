import type {GoalContext} from '../../shared/bots/goals';
import type {Goal,GoalScores,Mind,MindAnswer} from '../../shared/bots/intent';
import {JEV_DOLLARS_PER_TOKEN,type JevAnswer,type JevClient,type JevQuestion} from './jevClient';
import {perceive,type RatView} from './perception';

/** How long an answer stays playable after its situation was sent; the beat between one rat's requests
 * (events jump it); the room's request rate and burst: at most 580 in any minute, under half the account's
 * 1,200, so a second busy room still fits. */
export const JEV={freshMs:1500,beatMs:1000,roomPerSecond:9.5,roomBurst:10} as const;
const GOAL_LEVELS=['Makes no sense right now.','A poor idea right now.','A reasonable option.','A good idea right now.','Clearly the best thing to do right now.'];
const DANGER_LEVELS=['Safe: nobody threatening nearby.','Some risk: enemies around but not on me.','Under pressure: being shot at or outnumbered.','About to die: low HP and taking fire.'];
const PLACE_KEYS=[...'abcdefghijklmnop'];
const HITS_KEPT=4;

/** Room-wide counts since the mind was made, for logs and the recorder (B5). */
export interface JevStats {
    requests:number;answers:number;failures:number;
    /** Answers thrown away because the world moved on (an event, or their target left view). */
    staleDrops:number;
    /** Decisions the code mind took while Jev was on. */
    fallbacks:number;
    /** Requests a rat wanted but the room's rate held back. */
    throttled:number;
    tokens:number;dollars:number;
}
/** How one rat's last decision went, for the recorder. */
export type JevOutcome='answered'|'stale'|'fallback';
interface Rat {
    /** Raised by every event; an answer to an older serial is stale. */
    serial:number;
    event:boolean;
    inFlight:boolean;
    sentAt:number;
    latest?:{answer:MindAnswer;serial:number;sentAt:number};
    outcome?:JevOutcome;
    memory:{hits:{at:number;by?:string}[]};
}
export interface JevMindOptions {
    client:JevClient;
    /** Keeps a request alive past the tick that sent it (the Durable Object's `ctx.waitUntil`). */
    waitUntil:(work:Promise<unknown>)=>void;
}

/** The Jev mind (docs/bot-overhaul.md, B4) for every server bot in one room. Each decision gets the rat's
 * latest fresh answer, or nothing (the code mind decides). A rat asks at most once a second, at once on
 * an event, never twice at once; requests go out without holding the tick. */
export class JevMind implements Mind<GoalContext> {
    /** Set by the room: a human is connected, the key is set and the day's budget is not spent. */
    enabled=false;
    readonly stats:JevStats={requests:0,answers:0,failures:0,staleDrops:0,fallbacks:0,throttled:0,tokens:0,dollars:0};
    private readonly rats=new Map<string,Rat>();
    private tokens:number=JEV.roomBurst;
    private tokensAt=0;
    private unreported=0;
    private latencies:number[]=[];
    /** Times are the bots' decision clock (`ctx.now`), the room's clock. */
    constructor(private readonly options:JevMindOptions){}

    answer(ctx:GoalContext):MindAnswer|undefined {
        if(!this.enabled)return;
        const rat=this.rat(ctx.self.id);
        if(ctx.trigger==='event'){rat.serial++;rat.event=true;}
        this.ask(ctx,rat);
        const latest=rat.latest,now=ctx.now;
        if(latest&&(latest.serial!==rat.serial||latest.answer.target!==undefined&&!ctx.visible.some(p=>p.id===latest.answer.target))){
            rat.latest=undefined;this.stats.staleDrops++;return this.fallback(rat,'stale');
        }
        if(!latest||!this.options.client.ready(now)||now-latest.sentAt>JEV.freshMs)return this.fallback(rat,'fallback');
        rat.outcome='answered';
        return latest.answer;
    }

    /** The room saw `victim` hit (by `attacker`, or the city): an event for that rat, and a memory. */
    hit(victim:string,attacker:string|undefined,at:number):void {
        const rat=this.rat(victim);
        rat.serial++;rat.event=true;
        rat.memory.hits.push({at,...(attacker&&attacker!==victim?{by:attacker}:{})});
        if(rat.memory.hits.length>HITS_KEPT)rat.memory.hits.shift();
    }
    /** How a rat's last decision went while Jev was on. */
    outcome(id:string):JevOutcome|undefined{return this.rats.get(id)?.outcome;}
    /** Dollars spent since the last call, for the budget. */
    takeSpend():number{const spent=this.unreported;this.unreported=0;return spent;}
    /** Latencies since the last call, for the room's log. */
    takeLatencies():number[]{const taken=this.latencies;this.latencies=[];return taken;}

    private rat(id:string):Rat {
        let rat=this.rats.get(id);
        if(!rat)this.rats.set(id,rat={serial:0,event:false,inFlight:false,sentAt:-Infinity,memory:{hits:[]}});
        return rat;
    }
    private fallback(rat:Rat,outcome:JevOutcome):undefined {rat.outcome=outcome;this.stats.fallbacks++;return undefined;}

    private ask(ctx:GoalContext,rat:Rat):void {
        const now=ctx.now;
        if(rat.inFlight||!this.options.client.ready(now)||!rat.event&&now<rat.sentAt+JEV.beatMs)return;
        this.tokens=Math.min(JEV.roomBurst,this.tokens+(now-this.tokensAt)/1000*JEV.roomPerSecond);this.tokensAt=now;
        if(this.tokens<1){this.stats.throttled++;return;}
        this.tokens--;
        rat.inFlight=true;rat.event=false;rat.sentAt=now;
        const view=perceive(ctx,rat.memory),serial=rat.serial;
        const questions=questionsFor(view,ctx.offered);
        this.stats.requests++;
        this.options.waitUntil(this.options.client.ask(view.state,questions).then(reply=>{
            this.stats.answers++;this.stats.tokens+=reply.tokens;
            const dollars=reply.tokens*JEV_DOLLARS_PER_TOKEN;
            this.stats.dollars+=dollars;this.unreported+=dollars;this.latencies.push(reply.latencyMs);
            if(serial!==rat.serial){this.stats.staleDrops++;return;}
            rat.latest={serial,sentAt:now,answer:{...read(view,ctx.offered,reply.answers),jev:{latencyMs:reply.latencyMs,tokens:reply.tokens,sentAt:now}}};
        },()=>{this.stats.failures++;}).finally(()=>{rat.inFlight=false;}));
    }
}

/** One Score per offered goal, the target among rats in view, a place per open-ended goal with a choice,
 * danger, and a bank shot only at a rat seen moments ago that is now behind cover. */
export function questionsFor(view:RatView,offered:readonly Goal[]):Record<string,JevQuestion> {
    const questions:Record<string,JevQuestion>={};
    for(const goal of offered)questions[`goal_${goal}`]={type:'score',criteria:GOAL_LEVELS,
        instructions:{goal:view.goals[goal],question:'How much sense does it make for `me` to pursue `goal` right now?'}};
    if(view.inView.size){
        const criteria:Record<string,string>={};
        for(const id of view.inView.keys())criteria[id]=`The rat whose id is ${id}.`;
        criteria.none='Shoot at nobody.';
        questions.target={type:'choice',criteria,
            instructions:'Which rat in `rats_in_view` should `me` shoot at right now? Pick none if shooting at any of them is pointless or harmful.'};
    }
    for(const goal of offered){
        const options=view.places[goal];
        if(!options)continue;
        const criteria:Record<string,string>={};
        options.forEach((option,i)=>{criteria[PLACE_KEYS[i]]=option.what;});
        questions[`place_${goal}`]={type:'choice',criteria,
            instructions:{goal:view.goals[goal],question:'If `me` pursues `goal`, which of these places should it head for?'}};
    }
    questions.danger={type:'score',criteria:DANGER_LEVELS,instructions:'How much danger is `me` in right now?'};
    if(view.hidden)questions.bank={type:'noul',
        instructions:'`last_target` has just gone behind cover. Is a cheese ball bounced off a nearby wall a good way for `me` to hit it now?'};
    return questions;
}

/** Answers back onto goals, rat ids and place ids. Scores sit on the 0–4 goal scale; danger on 0–3. */
function read(view:RatView,offered:readonly Goal[],answers:Record<string,JevAnswer|undefined>):Omit<MindAnswer,'jev'> {
    const score=(id:string,top:number)=>{const a=answers[id];return a?.type==='score'?Math.min(top,Math.max(0,a.score)):undefined;};
    const scores:GoalScores={};
    for(const goal of offered){const value=score(`goal_${goal}`,4);if(value!==undefined)scores[goal]=value;}
    const places:Partial<Record<Goal,string>>={};
    for(const goal of offered){
        const options=view.places[goal],a=answers[`place_${goal}`],i=a?.type==='choice'?PLACE_KEYS.indexOf(a.choice):-1;
        if(options&&i>=0&&options[i])places[goal]=options[i].id;
    }
    const target=answers.target,bank=answers.bank,danger=score('danger',3);
    const id=target?.type==='choice'?view.inView.get(target.choice):undefined;
    return {source:'jev',scores,...(Object.keys(places).length?{places}:{}),...(id?{target:id}:{}),
        ...(danger===undefined?{}:{danger}),...(bank?.type==='noul'?{bank:bank.noul}:{})};
}

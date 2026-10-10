import type {GoalContext} from '../../shared/bots/goals';
import {DECIDE,STANCES,type Goal,type GoalScores,type Mind,type MindAnswer} from '../../shared/bots/intent';
import {JEV_DOLLARS_PER_TOKEN,type JevAnswer,type JevClient,type JevQuestion} from './jevClient';
import {perceive,type RatView} from './describeSituation';

/** How long an answer stays playable after its situation was sent; the shortest gap between one rat's requests
 * (the bot learning plan, L4: a rat asks only at its decision moments, never twice within 3 s); the room's
 * request rate and burst: at most 580 in any minute, under half the account's 1,200, so a second busy room fits. */
export const JEV={freshMs:DECIDE.waitMs,minGapMs:3000,roomPerSecond:9.5,roomBurst:10} as const;
const GOAL_LEVELS=['Makes no sense right now.','A poor idea right now.','A reasonable option.','A good idea right now.','Clearly the best thing to do right now.'];
const DANGER_LEVELS=['Safe: nobody threatening nearby.','Some risk: enemies around but not on me.','Under pressure: being shot at or outnumbered.','About to die: low HP and taking fire.'];
const STANCE_CRITERIA:Record<typeof STANCES[number],string>={
    fight:'Fight them: stop and shoot it out with any rival that comes close on the way.',
    focus:'Stay on the goal: keep moving, shoot on the run, and only fight a rat that blocks the way or shoots at `me`.',
};
const PLACE_KEYS=[...'abcdefghijklmnop'];
const HITS_KEPT=4;

/** Room-wide counts, for logs and the recorder's `minds` facts. */
export interface JevStats {
    /** Decisions taken while Jev was on, whoever answered. */
    decisions:number;
    requests:number;answers:number;failures:number;
    /** Answers thrown away because the world moved on (an event, or their target left view). */
    staleDrops:number;
    /** Decisions the code mind took while Jev was on. */
    fallbacks:number;
    /** Requests a rat wanted but the room's rate held back. */
    throttled:number;
    tokens:number;dollars:number;
}
const NO_STATS:JevStats={decisions:0,requests:0,answers:0,failures:0,staleDrops:0,fallbacks:0,throttled:0,tokens:0,dollars:0};
/** How one rat's last decision went, for the recorder. */
export type JevOutcome='answered'|'stale'|'fallback';
interface Rat {
    /** The mind's `onSince` when this rat last decided with Jev on; behind it, the rat is due. */
    generation:number;
    inFlight:boolean;
    sentAt:number;
    /** The answer to its last request, until a decision uses it. */
    latest?:{answer:MindAnswer;sentAt:number};
    outcome?:JevOutcome;
    memory:{hits:{at:number;by?:string}[]};
}
export interface JevMindOptions {
    client:JevClient;
    /** Keeps a request alive past the tick that sent it (the Durable Object's `ctx.waitUntil`). */
    waitUntil:(work:Promise<unknown>)=>void;
    /** Each reply's cost as it lands, even after the mind was switched off or its bots were gone. */
    spend?:(dollars:number)=>void;
}

/** The Jev mind (docs/bot-overhaul.md, B4; cadence from the bot learning plan, L4) for every server bot in one
 * room. A rat asks only at its decision moments, at most once every 3 s, and a decision waits briefly for the
 * answer (`'wait'`); each answer is used once. Without one in time, the code mind decides. Requests go out
 * without holding the tick. */
export class JevMind implements Mind<GoalContext> {
    /** Set by the room: a human is connected, the key is set, the day's budget is not spent and the round is not
     * code-only. Coming on makes every rat due, so Jev decides at once rather than at each rat's next moment. */
    get enabled():boolean{return this.on;}
    set enabled(on:boolean){if(on&&!this.on)this.onSince++;this.on=on;}
    private on=false;
    private onSince=0;
    readonly stats:JevStats={...NO_STATS};
    private readonly rats=new Map<string,Rat>();
    private tokens:number=JEV.roomBurst;
    private tokensAt=0;
    private reported:JevStats={...NO_STATS};
    private latencies:number[]=[];
    /** Times are the bots' decision clock (`ctx.now`), the room's clock. */
    constructor(private readonly options:JevMindOptions){}

    answer(ctx:GoalContext):MindAnswer|'wait'|undefined {
        if(!this.enabled)return;
        const rat=this.rat(ctx.self.id),now=ctx.now,latest=rat.latest;
        rat.generation=this.onSince;
        if(latest){
            rat.latest=undefined;
            // Too old for this moment, or aimed at a rat gone from view: ask afresh below.
            if(now-latest.sentAt>JEV.freshMs||latest.answer.target!==undefined&&!ctx.visible.some(p=>p.id===latest.answer.target))this.stats.staleDrops++;
            else {this.stats.decisions++;rat.outcome='answered';return latest.answer;}
        }
        if(rat.inFlight)return now-rat.sentAt<JEV.freshMs?'wait':this.fallback(rat,'fallback');
        const gap=rat.sentAt+JEV.minGapMs-now;
        if(gap<=0)return this.ask(ctx,rat)?'wait':this.fallback(rat,'fallback');
        // Asked moments ago: wait out a short gap, otherwise the code mind decides this one.
        return gap<DECIDE.waitMs?'wait':this.fallback(rat,'fallback');
    }

    due(id:string):boolean {return this.on&&this.rats.get(id)?.generation!==this.onSince;}

    /** The room saw `victim` hit (by `attacker`, or the city): a memory for its next request. Shooting back is
     * the motor's reflex, so a hit is not a decision moment. */
    hit(victim:string,attacker:string|undefined,at:number):void {
        const rat=this.rat(victim);
        rat.memory.hits.push({at,...(attacker&&attacker!==victim?{by:attacker}:{})});
        if(rat.memory.hits.length>HITS_KEPT)rat.memory.hits.shift();
    }
    /** How a rat's last decision went while Jev was on. */
    outcome(id:string):JevOutcome|undefined{return this.rats.get(id)?.outcome;}
    /** The counts and reply latencies since the last call, for the room's log and `minds` fact. */
    takeWindow():{stats:JevStats;latencies:number[]} {
        const stats={...NO_STATS};
        for(const key of Object.keys(stats) as (keyof JevStats)[])stats[key]=this.stats[key]-this.reported[key];
        this.reported={...this.stats};
        const latencies=this.latencies;this.latencies=[];
        return {stats,latencies};
    }

    private rat(id:string):Rat {
        let rat=this.rats.get(id);
        if(!rat)this.rats.set(id,rat={generation:-1,inFlight:false,sentAt:-Infinity,memory:{hits:[]}});
        return rat;
    }
    private fallback(rat:Rat,outcome:JevOutcome):undefined {rat.outcome=outcome;this.stats.decisions++;this.stats.fallbacks++;return undefined;}

    /** Sends one request; false when the client or the room's rate holds it back. */
    private ask(ctx:GoalContext,rat:Rat):boolean {
        const now=ctx.now;
        if(!this.options.client.ready(now))return false;
        this.tokens=Math.min(JEV.roomBurst,this.tokens+(now-this.tokensAt)/1000*JEV.roomPerSecond);this.tokensAt=now;
        if(this.tokens<1){this.stats.throttled++;return false;}
        this.tokens--;
        rat.inFlight=true;rat.sentAt=now;
        const view=perceive(ctx,rat.memory);
        const questions=questionsFor(view,ctx.offered);
        this.stats.requests++;
        this.options.waitUntil(this.options.client.ask(view.state,questions).then(reply=>{
            this.stats.answers++;this.stats.tokens+=reply.tokens;
            const dollars=reply.tokens*JEV_DOLLARS_PER_TOKEN;
            this.stats.dollars+=dollars;this.latencies.push(reply.latencyMs);this.options.spend?.(dollars);
            rat.latest={sentAt:now,answer:{...read(view,ctx.offered,reply.answers),jev:{latencyMs:reply.latencyMs,tokens:reply.tokens,sentAt:now}}};
        },()=>{this.stats.failures++;}).finally(()=>{rat.inFlight=false;}));
        return true;
    }
}

/** One Score per offered goal, the target among rats in view, a place per open-ended goal with a choice,
 * danger, the stance toward rivals on the way, and a bank shot only at a rat seen moments ago that is now behind cover. */
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
    questions.stance={type:'choice',criteria:STANCE_CRITERIA,
        instructions:'Until `me` next stops to think, what should it do about rival rats that come close on the way to its goal?'};
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
    const target=answers.target,bank=answers.bank,danger=score('danger',3),stance=answers.stance;
    const id=target?.type==='choice'?view.inView.get(target.choice):undefined;
    const chosen=stance?.type==='choice'?STANCES.find(s=>s===stance.choice):undefined;
    return {source:'jev',scores,...(Object.keys(places).length?{places}:{}),...(id?{target:id}:{}),
        ...(danger===undefined?{}:{danger}),...(bank?.type==='noul'?{bank:bank.noul}:{}),...(chosen?{stance:chosen}:{})};
}

import {BotMotor,distance,type MotorNavigation,type Tactics} from './motor';
import type {RatControls} from '../rat/ratBody';
import {BotGoals,type GoalContext,type GoalInput} from './goals';
import {codeMind,codeStance} from './codeMind';
import {Cast,completeAnswer} from './cast';
import {ARCHETYPE_SKILL,BASE_SKILL,DECIDE,type Decision,type Goal,type Mind,type MindAnswer,type MotorMode,type Personality,type Plan,type SkillDials} from './intent';
import {seededRandom} from './random';
import type {ChaosState} from '../chaosState';
import type {PlayerData,Vec3Data} from '../networkProtocol';

export interface RatBotOptions {
    /** Answers first; when it has no fresh answer the code mind does. Default: the code mind. */
    mind?:Mind<GoalContext>;
    /** The rat's archetype. Absent: none (base play: no archetype's weights or tactics). */
    personality?:Personality;
    /** Default: the archetype's dials, else `BASE_SKILL`. */
    skill?:SkillDials;
}

/** What each archetype does beyond its goal weights (cast.ts) and dials (`ARCHETYPE_SKILL`), docs/bot-overhaul.md
 * "Archetypes". Snipers fight from 38–55 units and keep fighting out to 70 (backing off a rival that comes inside
 * the range), banking now and then, with half the speculative fire; hoses close in to 12–22 and spray twice as
 * much, banking too; joyriders ride launch machines, and they and gremlins shoot launch triggers under other
 * rats. A camper's difference is where it holds the case (goals.ts). */
export const ARCHETYPE_TACTICS:Record<Personality,Omit<Tactics,'danger'|'stance'>>={
    sniper:{bank:true,mischief:false,range:[38,55],reach:70,spray:.5},
    hose:{bank:true,mischief:false,range:[12,22],spray:2},
    camper:{bank:false,mischief:false},
    joyrider:{bank:false,mischief:true,joyride:true},
    gremlin:{bank:false,mischief:true},
};
const BASE_TACTICS:Omit<Tactics,'danger'|'stance'>={bank:false,mischief:false};

/** Goals about the case: one of them becoming possible is the case changing state, a decision moment. */
const CASE_GOALS:Partial<Record<Goal,true>>={'take-case':true,'chase-carrier':true,'keep-case':true,'hold-zone':true};

/** One bot: a mind scores the goals code offers, the cast picks one, code makes it a Plan and the motor runs
 * that plan every tick. Like a player it decides rarely: on events (spawn, its goal ending or failing, a case
 * changing hands, the assignment moving on) and at most `DECIDE.holdMs` after its last decision; in between it
 * holds its goal and code only refreshes the plan every 180–300 ms. Objective choice knows the same globally
 * advertised case position as a human: a loose case where it lies, a carrier where it was last seen or pinged. The
 * pickup reflex comes before any decision: while it takes a supply, the goal waits and no mind is asked. */
export class RatBot {
    private readonly motor:BotMotor;
    private readonly goals:BotGoals;
    private readonly cast:Cast;
    private readonly mind:Mind<GoalContext>;
    private decisionAt=0;
    private decidedAt=-Infinity;
    private failuresSeen=0;
    /** The pickup reflex drove the motor at the last beat; an event it held back is decided after it. */
    private reflexing=false;
    private held=false;
    /** The mind asked for time at a decision moment (Jev's answer on its way): since when, and why the moment came. */
    private waiting?:{since:number;trigger:Decision['trigger']};
    /** While waiting after the held goal ended: the code mind's plan, run but not recorded as a decision. */
    private interim?:Plan;
    private last?:Decision;
    /** The case goals offered at the last beat. */
    private readonly caseGoals:Goal[]=[];
    /** Hidden from players; the cast's weights and the motor's tactics follow it (`play`). */
    personality:Personality|undefined;
    constructor(navigation:MotorNavigation,seed=0,private readonly random:()=>number=Math.random,options:RatBotOptions={}){
        this.personality=options.personality;
        this.motor=new BotMotor(navigation,seed,random,options.skill??(options.personality?ARCHETYPE_SKILL[options.personality]:BASE_SKILL));
        this.goals=new BotGoals(navigation,this.motor,seed,random);
        // Its own stream: a sampling archetype never shifts the navigation or combat randomness.
        this.cast=new Cast(seededRandom(seed+20000));
        this.mind=options.mind??codeMind;
    }
    /** Play as `personality` with `skill` from the next decision: a slot's rat (and so its archetype) can change
     * between rounds. */
    play(personality:Personality|undefined,skill:SkillDials):void {this.personality=personality;this.motor.useSkill(skill);}
    /** The motor mode of the current plan. */
    get objective():MotorMode{return this.motor.mode;}
    /** The current plan's key, for tests and diagnostics. */
    get goalKey():string{return this.motor.key;}
    get navigationStalled():boolean{return this.motor.navigationStalled;}
    get progressMark():number{return this.motor.progressMark;}
    get flyingRoute():boolean{return this.motor.flyingRoute;}
    get failedCasePosition():Readonly<Vec3Data>|undefined{return this.motor.failedCasePosition;}
    /** The last decision, for the recorder. */
    get decision():Decision|undefined{return this.last;}
    reset():void{this.motor.reset();this.goals.reset();this.cast.reset();this.decisionAt=0;this.decidedAt=-Infinity;this.last=this.waiting=this.interim=undefined;this.caseGoals.length=0;this.failuresSeen=this.motor.failures;this.reflexing=this.held=false;}

    step(now: number, self: PlayerData, others: Iterable<PlayerData>, state: ChaosState | undefined,
        clear: (target: Vec3Data) => boolean, blocked: boolean, grounded: boolean,
        clearControl: (target: Vec3Data) => boolean = clear): RatControls {
        const early=this.motor.begin(now,self,state,grounded);if(early)return early;
        const {ownershipChanged,assignmentChanged}=this.motor.observe(now,self,state);
        if(assignmentChanged)this.goals.newAssignment();
        if(this.motor.urgent||now>=this.decisionAt)this.decide(now,self,[...others],state,clear,clearControl,ownershipChanged);
        return this.motor.drive(now,self,state,clear,blocked,grounded,clearControl);
    }

    private decide(now:number,self:PlayerData,rats:readonly PlayerData[],state:ChaosState|undefined,
        clear:(target:Vec3Data)=>boolean,clearControl:(target:Vec3Data)=>boolean,ownershipChanged:boolean):void {
        let trigger:Decision['trigger']=this.motor.urgent||this.held?'event':'beat';
        const personality=this.personality;
        this.motor.urgent=false;
        this.decisionAt=now+180+this.random()*120;
        const cases=this.motor.genuineCases;
        const living=rats.filter(p=>p.id!==self.id&&p.hp>0);
        const carrying=cases.some(c=>c.value.owner===self.id);
        // The motor's known carriers, refreshed in place by `perceive` below before any goal reads them.
        const input:GoalInput={now,self,state,cases,living,carriers:this.motor.carriers,carrying,ownershipChanged,trigger,clear,personality};
        const available=this.goals.takeable(input);
        // The mind's preferred target arrives with its answer, so it steers the motor from the next decision.
        this.motor.perceive(now,self,living,state,clear,clearControl,carrying||!!available&&distance(self,available.value.p)<24,this.last?.answer.target);
        const supply=this.goals.reflex(input,available);
        if(supply){
            this.reflexing=true;this.held=trigger==='event';
            this.motor.setPlan({goal:supply.kind==='quick-fix'?'heal':'arm-up',mode:'pickup',key:`pickup:${supply.id}`,destination:supply});
            return;
        }
        // A route the motor gave up while the reflex drove it was the reflex's, not the goal's.
        if(this.reflexing)this.failuresSeen=this.motor.failures;
        this.reflexing=this.held=false;
        const ctx=this.goals.survey(input,available);
        // The case changing state includes a case goal becoming possible: a case free to take (its former carrier's
        // delay over, a failed route cleared), a carrier within reach again, a zone to hold.
        let opened=false;
        for(const goal of ctx.offered)if(CASE_GOALS[goal]&&!this.caseGoals.includes(goal)){opened=true;break;}
        this.caseGoals.length=0;for(const goal of ctx.offered)if(CASE_GOALS[goal])this.caseGoals.push(goal);
        if(opened||this.mind.due?.(self.id))trigger='event';
        // The goal being held, refreshed: a followed rat moves, a case lands, a zone post changes.
        const holding=this.interim??this.last?.plan,places=this.interim?undefined:this.last?.answer.places;
        const refreshed=holding&&ctx.offered.includes(holding.goal)?this.goals.planFor(holding.goal,ctx,places?.[holding.goal]):undefined;
        if(!this.waiting&&refreshed&&trigger==='beat'&&now<this.decidedAt+DECIDE.holdMs){this.run(refreshed,ctx);return;}
        // A decision moment. The held goal ending is itself an event.
        if(!refreshed)trigger='event';
        const asked=this.mind.answer(ctx);
        if(asked==='wait'){
            const waiting=this.waiting??={since:now,trigger};
            if(trigger==='event')waiting.trigger='event';
            if(now-waiting.since<DECIDE.waitMs){
                // Keep going while the answer comes; with the held goal over, on the code mind's pick, unrecorded.
                if(refreshed&&!this.interim)this.run(refreshed,ctx);
                else this.run(this.interim=this.best(codeMind.answer(ctx),ctx),ctx);
                return;
            }
        }
        if(this.waiting&&this.waiting.trigger==='event')trigger='event';
        this.waiting=this.interim=undefined;
        const answer=completeAnswer(asked==='wait'?undefined:asked,ctx.offered,()=>codeMind.answer(ctx));
        const {ranked,weighted}=this.cast.rank(personality,answer,ctx.offered,now,trigger,carrying);
        const plan=this.best(answer,ctx,ranked);
        this.cast.took(plan.goal);
        this.run(plan,ctx);
        const stance=answer.stance??codeStance(plan.goal,personality);
        this.motor.tactics={...(personality?ARCHETYPE_TACTICS[personality]:BASE_TACTICS),stance,...(answer.danger===undefined?{}:{danger:answer.danger})};
        if((answer.bank??0)>=.6)this.motor.tactics.bank=true;
        // The dispatch detour's give-up happens in the survey above, so failures are read after it.
        const failed=this.motor.failures!==this.failuresSeen;
        this.failuresSeen=this.motor.failures;this.decidedAt=now;
        this.last={plan,answer,personality,weighted,stance,trigger,...(failed?{failed:true as const}:{})};
    }

    /** The first goal in `ranked` (default: by the answer's scores) that code can make a plan for; roam when none can. */
    private best(answer:MindAnswer,ctx:GoalContext,ranked:readonly Goal[]=[...ctx.offered].sort((a,b)=>(answer.scores[b]??0)-(answer.scores[a]??0))):Plan {
        for(const goal of ranked){const plan=this.goals.planFor(goal,ctx,answer.places?.[goal]);if(plan)return plan;}
        return this.goals.planFor('roam',ctx)!;
    }
    private run(plan:Plan,ctx:GoalContext):void {this.goals.adopt(plan,ctx);this.motor.setPlan(plan);}
}

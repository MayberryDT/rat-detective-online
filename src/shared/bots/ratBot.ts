import {BotMotor,distance,type MotorIntent,type MotorNavigation} from './motor';
import {BotGoals,type GoalContext,type GoalInput} from './goals';
import {codeMind} from './codeMind';
import {Cast,completeAnswer} from './cast';
import {BASE_SKILL,type Decision,type Mind,type MotorMode,type Personality,type Plan,type SkillDials} from './intent';
import {combatRandom} from '../BotCombat';
import type {ChaosState} from '../chaosState';
import type {PlayerData,Vec3Data} from '../networkProtocol';

export interface RatBotOptions {
    /** Answers first; when it has no fresh answer the code mind does. Default: the code mind. */
    mind?:Mind<GoalContext>;
    /** Default: tryhard. */
    personality?:Personality;
    skill?:SkillDials;
}

/** One bot: a mind scores the goals code offers, the cast picks one, code makes it a Plan and the motor runs
 * that plan every tick. Decides every 180–300 ms, and at once when a case changes hands, the assignment
 * moves on or a goal fails. Objective choice knows the same globally advertised case position as a human. */
export class RatBot {
    private readonly motor:BotMotor;
    private readonly goals:BotGoals;
    private readonly cast:Cast;
    private readonly mind:Mind<GoalContext>;
    private decisionAt=0;
    private last?:Decision;
    /** Hidden from players; the cast's weights and the motor's tactics follow it. */
    personality:Personality;
    constructor(navigation:MotorNavigation,seed=0,private readonly random:()=>number=Math.random,options:RatBotOptions={}){
        this.motor=new BotMotor(navigation,seed,random,options.skill??BASE_SKILL);
        this.goals=new BotGoals(navigation,this.motor,seed,random);
        // Its own stream: a sampling personality never shifts the navigation or combat randomness.
        this.cast=new Cast(combatRandom(seed+20000));
        this.mind=options.mind??codeMind;
        this.personality=options.personality??'tryhard';
    }
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
    reset():void{this.motor.reset();this.goals.reset();this.cast.reset();this.decisionAt=0;this.last=undefined;}

    step(now: number, self: PlayerData, others: Iterable<PlayerData>, state: ChaosState | undefined,
        clear: (target: Vec3Data) => boolean, blocked: boolean, grounded: boolean,
        clearControl: (target: Vec3Data) => boolean = clear): MotorIntent {
        const early=this.motor.begin(now,self,state,grounded);if(early)return early;
        const {ownershipChanged,assignmentChanged}=this.motor.observe(now,self,state);
        if(assignmentChanged)this.goals.newAssignment();
        if(this.motor.urgent||now>=this.decisionAt)this.decide(now,self,[...others],state,clear,clearControl,ownershipChanged);
        return this.motor.drive(now,self,state,clear,blocked,grounded,clearControl);
    }

    private decide(now:number,self:PlayerData,rats:readonly PlayerData[],state:ChaosState|undefined,
        clear:(target:Vec3Data)=>boolean,clearControl:(target:Vec3Data)=>boolean,ownershipChanged:boolean):void {
        const trigger=this.motor.urgent?'event':'beat',personality=this.personality;
        this.motor.urgent=false;
        this.decisionAt=now+180+this.random()*120;
        const cases=this.motor.genuineCases;
        const living=rats.filter(p=>p.id!==self.id&&p.hp>0);
        const carrying=cases.some(c=>c.value.owner===self.id);
        const carriers=living.filter(p=>cases.some(c=>c.value.owner===p.id)).sort((a,b)=>distance(self,a)-distance(self,b));
        const input:GoalInput={now,self,state,cases,living,carriers,carrying,ownershipChanged,trigger,clear,personality};
        const available=this.goals.takeable(input);
        // The mind's preferred target arrives with its answer, so it steers the motor from the next decision.
        this.motor.perceive(now,self,living,carriers,state,clear,clearControl,carrying||!!available&&distance(self,available.value.p)<24,this.last?.answer.target);
        const ctx=this.goals.survey(input,available);
        const answer=completeAnswer(this.mind.answer(ctx),ctx.offered,()=>codeMind.answer(ctx)!);
        const {ranked,weighted}=this.cast.rank(personality,answer,ctx.offered,now,trigger);
        let plan:Plan|undefined;
        for(const goal of ranked)if((plan=this.goals.planFor(goal,ctx,answer.places?.[goal])))break;
        plan??=this.goals.planFor('roam',ctx)!;
        this.cast.took(plan.goal);
        this.goals.adopt(plan,ctx);
        this.motor.setPlan(plan);
        this.motor.tactics={bank:personality==='maverick'||(answer.bank??0)>=.6,mischief:personality==='gremlin'};
        this.last={plan,answer,personality,weighted,trigger};
    }
}

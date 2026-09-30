import {BotMotor,distance,type MotorIntent,type MotorNavigation} from './motor';
import {BotGoals,type GoalContext,type GoalInput} from './goals';
import {codeMind} from './codeMind';
import type {Decision,GoalScores,Mind,MindAnswer,MotorMode,Plan} from './intent';
import type {ChaosState} from '../chaosState';
import type {PlayerData,Vec3Data} from '../networkProtocol';

/** One bot: a mind scores the goals code offers, the cast picks one, code makes it a Plan and the motor runs
 * that plan every tick. Decides every 180–300 ms, and at once when a case changes hands, the assignment
 * moves on or a goal fails. Objective choice knows the same globally advertised case position as a human. */
export class RatBot {
    private readonly motor:BotMotor;
    private readonly goals:BotGoals;
    private decisionAt=0;
    private last?:Decision;
    /** `mind` answers first; when it has no fresh answer the code mind does. */
    constructor(navigation:MotorNavigation,seed=0,private readonly random:()=>number=Math.random,private readonly mind:Mind<GoalContext>=codeMind){
        this.motor=new BotMotor(navigation,seed,random);
        this.goals=new BotGoals(navigation,this.motor,seed,random);
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
    reset():void{this.motor.reset();this.goals.reset();this.decisionAt=0;this.last=undefined;}

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
        const trigger=this.motor.urgent?'event':'beat';
        this.motor.urgent=false;
        this.decisionAt=now+180+this.random()*120;
        const cases=this.motor.genuineCases;
        const living=rats.filter(p=>p.id!==self.id&&p.hp>0);
        const carrying=cases.some(c=>c.value.owner===self.id);
        const carriers=living.filter(p=>cases.some(c=>c.value.owner===p.id)).sort((a,b)=>distance(self,a)-distance(self,b));
        const input:GoalInput={now,self,state,cases,living,carriers,carrying,ownershipChanged,clear};
        const available=this.goals.takeable(input);
        // The mind's preferred target arrives with its answer, so it steers the motor from the next decision.
        this.motor.perceive(now,self,living,carriers,state,clear,clearControl,carrying||!!available&&distance(self,available.value.p)<24,this.last?.answer.target);
        const ctx=this.goals.survey(input,available);
        const answer=this.mind.answer(ctx)??codeMind.answer(ctx)!;
        const {plan,weighted}=this.cast(answer,ctx);
        this.goals.adopt(plan,ctx);
        this.motor.setPlan(plan);
        this.last={plan,answer,personality:'tryhard',weighted,trigger};
    }

    /** The cast, for now a tryhard only: the top score wins. B2b adds personality weights, hysteresis and
     * sampling here, between the mind's answer and the plan. */
    private cast(answer:MindAnswer,ctx:GoalContext):{plan:Plan;weighted:GoalScores} {
        const weighted=answer.scores;
        const ranked=[...ctx.offered].sort((a,b)=>(weighted[b]??0)-(weighted[a]??0));
        for(const goal of ranked){
            const plan=this.goals.planFor(goal,ctx,answer.places?.[goal]);
            if(plan)return {plan,weighted};
        }
        return {plan:this.goals.planFor('roam',ctx)!,weighted};
    }
}

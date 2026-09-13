export const RAT_REACTIONS = ['shot','jump','launch','land','case-pickup','case-loss','hit','reflect','heal','delivery'] as const;
export type RatReaction = typeof RAT_REACTIONS[number];
// Hold the readable pose briefly before easing home. These are cosmetic times;
// neither the next action nor player movement waits for recovery.
const DURATIONS = [.42,.50,.85,.60,.85,.80,.48,.36,1.05,.95];
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));

/** Bounded cosmetic acting, independent of controls, camera and gameplay RNG.
 * Events replace a pulse rather than queue/accumulate it. No transform writes. */
export class RatActing {
    private readonly ages = new Float64Array(10).fill(10);
    private readonly strengths = new Float64Array(10);
    private clock = 0;
    private quiet = 0;
    private nextLook:number;
    private lookAge = 10;
    private lookDirection = 1;
    private readonly seed:number;
    get blinkOffset():number{return this.seed*4.7;}
    private descentTime = 0;
    private fallSpeed = 0;
    private airborne = false;
    private flightAge = 0;
    private hitSide = 0;
    private haste = 0;
    focus = 0;
    air = 0;
    launchFlight = false;
    headX=0; headY=0; headZ=0;
    hatX=0; hatY=0; hatZ=0;
    earLeftX=0; earRightX=0; earLeftZ=0; earRightZ=0;
    eyes=1; eyeSlant=0;
    tailLift=0; tailStream=0; tailSide=0;

    constructor(identity:string) {
        let hash=2166136261;
        for(let i=0;i<identity.length;i++)hash=Math.imul(hash^identity.charCodeAt(i),16777619);
        this.seed=(hash>>>0)/4294967296;
        this.nextLook=3+this.seed*3;
    }
    trigger(event:RatReaction,strength=1,side=0):void {
        const i=RAT_REACTIONS.indexOf(event);
        if(i<0)return;
        // Let each readable impact recover instead of pinning the pose at peak.
        if(event==='reflect'&&this.ages[i]<.28)return;
        this.ages[i]=0;this.strengths[i]=Number.isFinite(strength)?clamp(strength,0,1):0;
        this.quiet=0;this.lookAge=10;
        if(event==='shot')this.focus=1;
        if(event==='hit')this.hitSide=Number.isFinite(side)?clamp(side,-1,1):0;
        if(event==='launch'){this.launchFlight=true;this.airborne=true;this.flightAge=0;}
        if(event==='jump')this.airborne=true;
        this.compose();
    }
    private pulse(event:RatReaction):number {
        const i=RAT_REACTIONS.indexOf(event);
        const x=clamp((this.ages[i]/DURATIONS[i]-.12)/.88,0,1);
        return (1-x*x*(3-2*x))*this.strengths[i];
    }
    /** Vertical speed is presented motion, never an instruction to move a body. */
    update(dt:number,speed:number,vertical:number,hustle:boolean):void {
        if(!(dt>0)||!Number.isFinite(dt))return;
        dt=Math.min(dt,.1);
        speed=Number.isFinite(speed)?Math.max(0,speed):0;
        vertical=Number.isFinite(vertical)?clamp(vertical,-100,100):0;
        for(let i=0;i<this.ages.length;i++)this.ages[i]=Math.min(10,this.ages[i]+dt);
        this.clock+=dt;this.lookAge+=dt;
        this.focus*=Math.exp(-4.5*dt);
        this.haste+=((hustle?Math.min(speed/7,1):0)-this.haste)*(1-Math.exp(-12*dt));
        if(vertical>4&&!this.airborne)this.trigger('jump');
        if(Math.abs(vertical)>2)this.airborne=true;
        if(vertical< -2){this.descentTime+=dt;this.fallSpeed=Math.max(this.fallSpeed,-vertical);}
        if(this.airborne&&this.descentTime>0&&vertical> -1){
            if(this.descentTime>=.08)this.trigger('land',clamp(this.fallSpeed/18,.2,1));
            this.airborne=false;this.launchFlight=false;this.descentTime=0;this.fallSpeed=0;
        }
        if(this.launchFlight&& (this.flightAge+=dt)>15)this.launchFlight=false;
        this.air+=(clamp(vertical/12,-1,1)-this.air)*(1-Math.exp(-16*dt));
        let active=speed>.25||Math.abs(vertical)>1||this.focus>.03;
        for(let i=0;i<this.ages.length&&!active;i++)active=this.ages[i]<DURATIONS[i];
        if(active){this.quiet=0;this.lookAge=10;}
        else {
            this.quiet+=dt;
            if(this.quiet>2&&this.clock>=this.nextLook){
                this.lookAge=0;this.lookDirection=-this.lookDirection;
                this.nextLook=this.clock+7+this.seed*5;
            }
        }
        this.compose();
    }
    private compose():void {
        const shot=this.pulse('shot'),jump=this.pulse('jump'),launch=this.pulse('launch'),land=this.pulse('land');
        const take=this.pulse('case-pickup'),loss=this.pulse('case-loss'),hit=this.pulse('hit'),reflect=this.pulse('reflect');
        const heal=this.pulse('heal');
        const nodAge=this.ages[9]/DURATIONS[9];
        const nod=nodAge<1?Math.sin(nodAge*Math.PI)*this.strengths[9]:0;
        const look=this.lookAge<1.6?Math.pow(Math.sin(this.lookAge/1.6*Math.PI),2)*this.lookDirection:0;
        // Combat suppresses little acknowledgments; each composed axis has a cap.
        const composure=1-Math.max(shot,hit,launch);
        this.headX=clamp(this.focus*.14-shot*.14-jump*.12-launch*.18+land*.26+hit*.20+reflect*.16+
            this.haste*.18+(nod*.32-heal*.14-take*.12)*composure,-.35,.42);
        this.headY=clamp(look*.42+(-take*.16+loss*.28)*composure,-.45,.45);
        this.headZ=clamp(hit*this.hitSide*.28+(loss*.18+look*.08-heal*.09)*composure,-.32,.32);
        this.hatX=clamp(shot*.18-jump*.20-launch*.30+land*.25+this.air*.16+reflect*.12,-.42,.38);
        this.hatY=launch*.075+land*.035;
        this.hatZ=clamp(-hit*this.hitSide*.16+loss*.13+reflect*.08,-.22,.22);
        this.earLeftX=clamp(-shot*.48-jump*.55-launch*.75-this.air*.32-this.haste*.58+land*.40-reflect*.30,-1.05,.55);
        this.earRightX=this.earLeftX*.7;
        this.earLeftZ=clamp(take*.45-loss*.50+look*.38+heal*.21,-.65,.65);
        this.earRightZ=clamp(-take*.30+loss*.32-heal*.16,-.5,.5);
        this.eyes=clamp(1-this.focus*.50-hit*.40-loss*.35+launch*.70+take*.40-heal*.25,.3,1.7);
        this.eyeSlant=this.focus*.13+loss*.10;
        this.tailLift=clamp(Math.max(0,this.air)*.48+Math.max(0,-this.air)*.14+launch*.18+
            jump*.15+land*.15+this.haste*.20,0,.70);
        this.tailSide=clamp(look*.32-loss*.32+take*.24+heal*.22+nod*.22+reflect*.12,-.6,.6);
        this.tailStream=this.haste*.85;
    }
    resetMotion():void {
        this.air=0;this.airborne=false;this.launchFlight=false;this.flightAge=0;
        this.descentTime=this.fallSpeed=0;this.lookAge=10;this.quiet=0;this.haste=0;
        for(const i of [1,2,3])this.ages[i]=10;
        this.compose();
    }
    reset():void {
        this.ages.fill(10);this.strengths.fill(0);this.focus=0;
        this.clock=0;this.nextLook=3+this.seed*3;this.lookDirection=1;this.resetMotion();
    }
}

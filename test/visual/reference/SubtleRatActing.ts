export const RAT_REACTIONS = ['shot','jump','launch','land','case-pickup','case-loss','hit','reflect','heal','delivery'] as const;
export type RatReaction = typeof RAT_REACTIONS[number];
const DURATIONS = [.20,.24,.42,.28,.42,.34,.22,.16,.55,.48];
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));

/** Bounded cosmetic acting, independent of controls, camera and gameplay RNG.
 * Events replace a pulse rather than queue/accumulate it. No transform writes. */
export class SubtleRatActing {
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
    tailLift=0; tailStream=0;

    constructor(identity:string) {
        let hash=2166136261;
        for(let i=0;i<identity.length;i++)hash=Math.imul(hash^identity.charCodeAt(i),16777619);
        this.seed=(hash>>>0)/4294967296;
        this.nextLook=5+this.seed*5;
    }
    trigger(event:RatReaction,strength=1,side=0):void {
        const i=RAT_REACTIONS.indexOf(event);
        if(i<0)return;
        // A hail of armor hits is one small reaction, not a vibrating head.
        if(event==='reflect'&&this.ages[i]<.12)return;
        this.ages[i]=0;this.strengths[i]=Number.isFinite(strength)?clamp(strength,0,1):0;
        this.quiet=0;this.lookAge=10;
        if(event==='shot')this.focus=1;
        if(event==='hit')this.hitSide=Number.isFinite(side)?clamp(side,-1,1):0;
        if(event==='launch'){this.launchFlight=true;this.airborne=true;this.flightAge=0;}
        if(event==='jump')this.airborne=true;
        this.compose();
    }
    private pulse(event:RatReaction):number {
        const i=RAT_REACTIONS.indexOf(event),x=Math.max(0,1-this.ages[i]/DURATIONS[i]);
        return x*x*this.strengths[i];
    }
    /** Vertical speed is presented motion, never an instruction to move a body. */
    update(dt:number,speed:number,vertical:number,hustle:boolean):void {
        if(!(dt>0)||!Number.isFinite(dt))return;
        dt=Math.min(dt,.1);
        speed=Number.isFinite(speed)?Math.max(0,speed):0;
        vertical=Number.isFinite(vertical)?clamp(vertical,-100,100):0;
        for(let i=0;i<this.ages.length;i++)this.ages[i]=Math.min(10,this.ages[i]+dt);
        this.clock+=dt;this.lookAge+=dt;
        this.focus*=Math.exp(-7*dt);
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
        const look=this.lookAge<1.15?Math.pow(Math.sin(this.lookAge/1.15*Math.PI),2)*this.lookDirection:0;
        // Combat suppresses little acknowledgments; each composed axis has a cap.
        const composure=1-Math.max(shot,hit,launch);
        this.headX=clamp(-shot*.025+land*.055+hit*.045+reflect*.025+(nod*.075-heal*.025-take*.025)*composure,-.10,.12);
        this.headY=clamp(look*.11+loss*.055*composure,-.12,.12);
        this.headZ=clamp(hit*this.hitSide*.07+loss*.035*composure,-.09,.09);
        this.hatX=clamp(shot*.035-jump*.045-launch*.085+land*.065+this.air*.035,-.16,.13);
        this.hatY=launch*.025+land*.008;
        this.hatZ=clamp(-hit*this.hitSide*.035+loss*.025,-.06,.06);
        this.earLeftX=clamp(-shot*.09-jump*.11-launch*.18-this.air*.08-this.haste*.13+land*.09,-.32,.18);
        this.earRightX=this.earLeftX*.7;
        this.earLeftZ=clamp(take*.095-loss*.10+look*.09+heal*.035,-.16,.16);
        this.earRightZ=clamp(-take*.06+loss*.06-heal*.025,-.12,.12);
        this.eyes=clamp(1-this.focus*.20-hit*.16-loss*.12+launch*.28+take*.10-heal*.08,.65,1.3);
        this.eyeSlant=this.focus*.035+loss*.025;
        this.tailLift=clamp(Math.max(0,this.air)*.09+launch*.055,0,.145);
        this.tailStream=this.haste*.55;
    }
    resetMotion():void {
        this.air=0;this.airborne=false;this.launchFlight=false;this.flightAge=0;
        this.descentTime=this.fallSpeed=0;this.lookAge=10;this.quiet=0;this.haste=0;
        for(const i of [1,2,3])this.ages[i]=10;
        this.compose();
    }
    reset():void {
        this.ages.fill(10);this.strengths.fill(0);this.focus=0;
        this.clock=0;this.nextLook=5+this.seed*5;this.lookDirection=1;this.resetMotion();
    }
}

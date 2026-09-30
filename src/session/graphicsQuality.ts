import {playerPreferences,type GraphicsMode} from '../settings/PlayerPreferences';

/** Settings → Graphics. High is the full look; Auto (the default) moves between High and Low
 * by measured frame time so a weak or high-DPI machine holds 60 fps without anybody tuning it. */
export const TIERS=['high','medium','low'] as const;
export type Tier=typeof TIERS[number];
export interface QualityStatus {mode:GraphicsMode;scale:number;tier:Tier}

/** Costly extras per tier, least visible loss first. Nothing here changes a shader program, so no step
 * relinks on ANGLE: medium thins the rain and redraws the flashlight's shadow every other frame;
 * low also drops the film grain overlay and the haze cones under streetlamps (the fog stays). */
const EXTRAS=[{rain:1,grain:true,haze:true,shadowEvery:1},{rain:.5,grain:true,haze:true,shadowEvery:2},{rain:.3,grain:false,haze:false,shadowEvery:3}] as const;
/** The live extras, read by the effects each frame. */
export const GRAPHICS:{rain:number;grain:boolean;haze:boolean;shadowEvery:number}={...EXTRAS[0]};

/** Render scales (drawing-buffer pixels per CSS pixel), finest first: min(DPR, 2), then about 28% fewer
 * pixels a step down to native, then .85 and .7 of native. */
export function scaleLadder(dpr:number):number[] {
    const top=Math.min(2,Math.max(.7,dpr||1)),out=[top];
    for(let s=top*.85;s>1.1;s*=.85)out.push(Math.round(s*1000)/1000);
    if(top>1.04)out.push(1);
    for(const s of [.85,.7])if(s<out[out.length-1]!-.04)out.push(s);
    return out;
}

type Step='scale'|'tier';
/** Auto's order of steps down: resolution to native, medium extras, .85, low extras, then the rest. */
function stepOrder(ladder:number[]):Step[] {
    const native=ladder.findIndex(s=>s<=1),order:Step[]=Array<Step>(native).fill('scale');
    order.push('tier');if(native+1<ladder.length)order.push('scale');order.push('tier');
    for(let i=native+2;i<ladder.length;i++)order.push('scale');
    return order;
}

/** Auto's timing (ms). A window's mean frame interval above `slow` (55 fps) twice running steps down;
 * `probe` ms of `calm` (58.5 fps) windows, or of slow windows with nothing left worth trying, try one
 * step back up; if the next two windows are slower than `slow` and `cost` slower than before, it goes
 * straight back and the wait doubles (to `probeMax`). Each window leaves out its slowest `trim`
 * share of frames, so one long hitch cannot move anything; gaps over `gap` (hidden tab, title,
 * loading) and the first `warm` ms after them or a respawn are not measured. A step whose next two
 * windows are not `gain` faster than the two before is undone and that kind waits `block` (doubling).
 * Both margins sit above ordinary frame-to-frame noise; a resolution step moves 28-38% of the pixels. */
export const AUTO={window:1500,slow:1000/55,calm:1000/58.5,trim:.05,gap:1000,warm:4000,settle:600,gain:.08,cost:.1,probe:8000,probeMax:120000,probeFail:8000,block:60000,blockMax:600000} as const;

/** The quality decision alone: no DOM, fed one timestamp per presented frame. */
export class QualityController {
    private dpr=0;private ladder:number[]=[];private order:Step[]=[];private medium=0;
    private readonly count:Record<Step,number>={scale:0,tier:0};
    /** Auto's steps down, newest last; stepping up undoes the newest. */
    private readonly applied:Step[]=[];
    private last=-Infinity;private ignoreUntil=0;private windowStart=0;private n=0;
    /** This window's frame intervals; a window closes early if it fills (over 340 fps). */
    private readonly samples=new Float64Array(512);
    private slowRun=0;private previousMean=0;private calmFor=0;private stuckFor=0;
    /** The step just taken back up: judged on the two windows after it against the two before. */
    private probe?:{step:Step;before:number;after:number;at:number;stuck:boolean};
    private probeWait=AUTO.probe as number;
    private check?:{step:Step;before:number;after:number};
    private readonly blocked:Record<Step,{until:number;wait:number}>={scale:{until:0,wait:AUTO.block},tier:{until:0,wait:AUTO.block}};

    constructor(dpr:number,public mode:GraphicsMode='auto',start?:{scale:number;tier:number}){
        this.setDpr(dpr);
        if(start)this.restore(this.ladder.findIndex(s=>s<=start.scale+.005),start.tier);
    }
    get scale():number {
        const l=this.ladder;
        switch(this.mode){
            case 'high':return l[0]!;
            case 'medium':return l[this.medium]!;
            case 'low':return l[l.length-1]!;
            default:return l[this.count.scale]!;
        }
    }
    get tier():Tier {return TIERS[this.mode==='auto'?this.count.tier:this.mode==='high'?0:this.mode==='medium'?1:2];}
    /** The window moved to a screen with another pixel ratio: the same steps on the new ladder. */
    setDpr(dpr:number):void {
        if(dpr===this.dpr)return;
        this.dpr=dpr;this.ladder=scaleLadder(dpr);this.order=stepOrder(this.ladder);
        // Medium: about ¾ of High's width, never below native.
        this.medium=this.ladder.findIndex(s=>s<=Math.max(1,this.ladder[0]!*.75)+.01);
        this.restore(this.count.scale,this.count.tier);
    }
    setMode(mode:GraphicsMode):void {
        if(mode===this.mode)return;
        this.mode=mode;this.restore(0,0);this.probeWait=AUTO.probe;this.probe=undefined;
        for(const b of Object.values(this.blocked)){b.until=0;b.wait=AUTO.block;}
        this.settle(this.last);
    }
    /** Do not measure for `ms` from `now` (load, respawn, a hidden tab). */
    settle(now:number,ms:number=AUTO.warm):void {this.quiet(now,ms);this.check=undefined;}
    /** One presented frame at `now`; true when the scale or tier changed. */
    frame(now:number):boolean {
        const ms=now-this.last;this.last=now;
        if(this.mode!=='auto')return false;
        if(!(ms>0&&ms<=AUTO.gap))this.settle(now);
        if(now<this.ignoreUntil)return false;
        if(!this.n)this.windowStart=now-ms;
        this.samples[this.n++]=ms;
        if(now-this.windowStart<AUTO.window&&this.n<this.samples.length)return false;
        // The slowest few frames of the window are hitches (a shader link, a collection); leave them out.
        const sorted=this.samples.subarray(0,this.n).sort(),kept=this.n-Math.min(this.n-1,Math.ceil(this.n*AUTO.trim));
        let sum=0;for(let i=0;i<kept;i++)sum+=sorted[i]!;
        const span=now-this.windowStart;this.n=0;
        return this.decide(now,sum/kept,span);
    }

    private decide(now:number,mean:number,span:number):boolean {
        const before=this.previousMean;this.previousMean=mean;
        this.slowRun=mean>AUTO.slow?this.slowRun+1:0;
        this.calmFor=mean<=AUTO.calm?this.calmFor+span:0;
        const probe=this.probe;
        if(probe&&now-probe.at>=AUTO.probeFail){this.probe=undefined;this.probeWait=AUTO.probe;}
        const check=this.check;
        // Judge a step on the two windows after it against the two before, so one noisy window cannot decide.
        if(check&&!check.after)check.after=mean;
        else if(check){
            this.check=undefined;
            if((check.after+mean)/2>check.before*(1-AUTO.gain)){
                // No gain: this machine is not limited by what that step saves. Put it back.
                const b=this.blocked[check.step];b.until=now+b.wait;b.wait=Math.min(b.wait*2,AUTO.blockMax);
                this.pop();this.quiet(now,AUTO.settle);return true;
            }
            this.blocked[check.step].wait=AUTO.block;
        }
        if(probe?.after===0)probe.after=mean;
        else if(probe&&probe.after>0){
            const after=(probe.after+mean)/2;probe.after=-1;
            if(after>Math.max(AUTO.slow,probe.before*(1+AUTO.cost))){
                // The step back up costs frames: return to where it was and wait longer to retry.
                this.push(probe.step);this.probe=undefined;this.probeWait=Math.min(this.probeWait*2,AUTO.probeMax);
                this.quiet(now,AUTO.settle);return true;
            }
            // Slow before and no worse now: that step was never the bottleneck, so do not take it again soon.
            if(probe.stuck)this.blocked[probe.step].until=now+this.blocked[probe.step].wait;
        }
        if(this.slowRun>=2){
            const step=this.next(now);
            if(step){
                this.push(step);this.check={step,before:(mean+before)/2,after:0};
                this.quiet(now,AUTO.settle);return true;
            }
            // Slow with nothing left worth trying (a processor-bound spell, or a start from last visit's level).
            this.stuckFor+=span;
        }
        if((this.calmFor>=this.probeWait||this.stuckFor>=this.probeWait)&&this.applied.length){
            this.probe={step:this.pop()!,before:(mean+before)/2,after:0,at:now,stuck:this.stuckFor>0};
            this.quiet(now,AUTO.settle);return true;
        }
        return false;
    }
    private quiet(now:number,ms:number):void {this.ignoreUntil=Math.max(this.ignoreUntil,now+ms);this.n=this.slowRun=this.calmFor=this.stuckFor=0;}
    private next(now:number):Step|undefined {
        const seen:Record<Step,number>={scale:0,tier:0};
        for(const step of this.order){
            if(seen[step]++<this.count[step])continue;
            if(this.blocked[step].until<=now)return step;
        }
        return undefined;
    }
    private push(step:Step):void {this.applied.push(step);this.count[step]++;}
    private pop():Step|undefined {const step=this.applied.pop();if(step)this.count[step]--;return step;}
    /** Rebuild Auto's steps as `scale` resolution and `tier` extras steps, in ladder order. */
    private restore(scale:number,tier:number):void {
        const want:Record<Step,number>={scale:Math.max(0,Math.min(scale,this.ladder.length-1)),tier:Math.max(0,Math.min(tier,2))};
        this.applied.length=0;this.count.scale=this.count.tier=0;
        for(const step of this.order)if(this.count[step]<want[step])this.push(step);
    }
}

const HINT_KEY='rat-graphics-auto-v1';
const status:QualityStatus={mode:'auto',scale:1,tier:'high'};
const listeners=new Set<(status:Readonly<QualityStatus>)=>void>();
let controller:QualityController|undefined;
function storage():Storage|undefined {try{return typeof window==='undefined'?undefined:window.localStorage;}catch{return undefined;}}
function quality():QualityController {
    if(controller)return controller;
    let hint:{scale:number;tier:number}|undefined;
    try{
        const raw=JSON.parse(storage()?.getItem(HINT_KEY)??'null') as {scale?:unknown;tier?:unknown}|null;
        if(typeof raw?.scale==='number'&&typeof raw.tier==='number')hint={scale:raw.scale,tier:raw.tier};
    }catch{/* A lost hint only means starting at High. */}
    const prefs=playerPreferences(),made=new QualityController(typeof devicePixelRatio==='number'?devicePixelRatio:1,prefs.current.graphics,hint);
    controller=made;changed(false);
    prefs.subscribe(p=>{if(p.graphics!==made.mode){made.setMode(p.graphics);changed();}});
    return made;
}
function changed(save=true):void {
    const q=controller!;status.mode=q.mode;status.scale=q.scale;status.tier=q.tier;
    Object.assign(GRAPHICS,EXTRAS[TIERS.indexOf(status.tier)]);
    // Auto starts the next visit where this one settled; it still steps back up when there is headroom.
    if(save&&q.mode==='auto')try{storage()?.setItem(HINT_KEY,JSON.stringify({scale:status.scale,tier:TIERS.indexOf(status.tier)}));}catch{/* Optional. */}
    for(const listener of listeners)listener(status);
}

/** Current graphics mode, render scale and extras tier (read-only; for Settings and perf telemetry). */
export function qualityStatus():Readonly<QualityStatus> {quality();return status;}
export function onQualityChange(listener:(status:Readonly<QualityStatus>)=>void):()=>void {listeners.add(listener);return()=>listeners.delete(listener);}
/** The drawing buffer's pixel ratio for a screen of `dpr`. Cheap; the stage asks every frame. */
export function renderScale(dpr:number):number {
    const q=quality();q.setDpr(dpr);
    if(q.scale!==status.scale)changed(false);
    return status.scale;
}
/** One presented frame of live play (not the title or loading). */
export function qualityFrame(now:number):void {
    if(typeof document!=='undefined'&&document.hidden)return;
    if(quality().frame(now))changed();
}
/** Load, respawn: the next seconds hitch for reasons resolution cannot fix. */
export function settleQuality(now=performance.now()):void {quality().settle(now);}

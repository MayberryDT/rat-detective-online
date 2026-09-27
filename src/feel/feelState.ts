import {playerPreferences,type PlayerPreferences} from '../settings/PlayerPreferences';
import {FEEL,type FeelItem,type FeelSpec} from './feelTuning';

/** `?feel=off` restores the pre-polish presentation; `?feel=dev` adds the
 * review controls (per-item switches and live tuning) to Settings. */
export type FeelMode='on'|'off'|'dev';
export function readFeelMode(search=typeof location==='undefined'?'':location.search):FeelMode {
    const value=new URLSearchParams(search).get('feel');
    return value==='off'?'off':value==='dev'?'dev':'on';
}

export const FEEL_REVIEW_KEY='rat-feel-review-v1';
const DEFAULT_PARAMS:Record<string,Readonly<Record<string,number>>>={};
for(const item of Object.keys(FEEL) as FeelItem[])DEFAULT_PARAMS[item]={...FEEL[item].params};
type Review={switches:Partial<Record<FeelItem,boolean>>;params:Partial<Record<FeelItem,Record<string,number>>>};

/** Owns which feel items run and the review-only tuning overrides. Outside
 * `feel=dev`, stored review choices are ignored so ordinary play uses defaults. */
export class FeelState {
    private readonly switches=new Map<FeelItem,boolean>();
    constructor(readonly mode:FeelMode=readFeelMode(),
        private readonly storage?:Pick<Storage,'getItem'|'setItem'|'removeItem'>,
        private readonly prefs:()=>Readonly<PlayerPreferences>=()=>playerPreferences().current){
        if(mode==='dev')this.load();
    }
    on(item:FeelItem):boolean {
        if(this.mode==='off')return false;
        const spec:FeelSpec=FEEL[item];
        return this.switches.get(item)??!spec.defaultOff;
    }
    /** Camera motion multiplier: Settings → Camera shake; zero under `feel=off` or Reduced interface motion. */
    shake():number {
        const prefs=this.prefs();
        return this.mode==='off'||prefs.reducedMotion?0:prefs.cameraShake;
    }
    /** Noir city strength 0…1 (juice review slider); zero under `feel=off`. */
    noir():number {return this.mode==='off'?0:Math.max(0,Math.min(1,FEEL.noir.params.strength));}
    /** Screen flash multiplier: Settings → Flash strength; zero under `feel=off`. */
    flash():number {return this.mode==='off'?0:this.prefs().flashStrength;}
    set(item:FeelItem,on:boolean):void {this.switches.set(item,on);this.save();}
    tune(item:FeelItem,param:string,value:number):void {
        const params:Record<string,number>=FEEL[item].params;
        if(!(param in params)||!Number.isFinite(value))return;
        params[param]=value;this.save();
    }
    /** Restore code defaults for every switch and value. */
    resetReview():void {
        this.switches.clear();
        for(const item of Object.keys(FEEL) as FeelItem[])Object.assign(FEEL[item].params,DEFAULT_PARAMS[item]);
        try{this.storage?.removeItem(FEEL_REVIEW_KEY);}catch{/* Review storage is optional. */}
    }
    /** Current review choices as JSON, for copying tuned values back into code. */
    exportReview():string {
        const review:Review={switches:Object.fromEntries(this.switches),params:{}};
        for(const item of Object.keys(FEEL) as FeelItem[]){
            const changed=Object.entries(FEEL[item].params).filter(([key,value])=>DEFAULT_PARAMS[item][key]!==value);
            if(changed.length)review.params[item]=Object.fromEntries(changed);
        }
        return JSON.stringify(review,null,2);
    }
    private load():void {
        let review:Review|undefined;
        try{review=JSON.parse(this.storage?.getItem(FEEL_REVIEW_KEY)??'null') as Review|undefined;}catch{return;}
        if(!review||typeof review!=='object')return;
        for(const [item,on] of Object.entries(review.switches??{}))
            if(item in FEEL&&typeof on==='boolean')this.switches.set(item as FeelItem,on);
        for(const [item,params] of Object.entries(review.params??{})){
            if(!(item in FEEL)||!params||typeof params!=='object')continue;
            const target:Record<string,number>=FEEL[item as FeelItem].params;
            for(const [key,value] of Object.entries(params))if(key in target&&typeof value==='number'&&Number.isFinite(value))target[key]=value;
        }
    }
    private save():void {
        if(this.mode!=='dev')return;
        try{this.storage?.setItem(FEEL_REVIEW_KEY,this.exportReview());}catch{/* Review storage is optional. */}
    }
}

let state:FeelState|undefined;
export function feelState():FeelState {
    if(!state){let storage:Storage|undefined;try{storage=typeof window==='undefined'?undefined:window.localStorage;}catch{}state=new FeelState(readFeelMode(),storage);}
    return state;
}

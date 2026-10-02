import type * as THREE from 'three';
import { playerPreferences } from '../settings/PlayerPreferences';
type Bus={effects:GainNode;music:GainNode;world:GainNode;ducks:GainNode[]};
const buses=new WeakMap<BaseAudioContext,Bus>();
/** All native and Three effects meet here once, after their existing spatial mix. */
function mix(context:BaseAudioContext){
    let bus=buses.get(context);
    if(!bus){
        const world=context.createGain();
        bus={effects:context.createGain(),music:context.createGain(),world,ducks:[world]};
        bus.effects.connect(context.destination);bus.music.connect(context.destination);world.connect(bus.effects);buses.set(context,bus);
        const current=bus;
        const unsubscribe=playerPreferences().subscribe(p=>{
            current.effects.gain.value=p.masterVolume*p.effectsVolume;
            current.music.gain.value=p.masterVolume;
        });
        context.addEventListener?.('statechange',()=>{if(context.state==='closed')unsubscribe();});
    }
    return bus;
}
export const effectsOutput=(context:BaseAudioContext)=>mix(context).effects;
export const musicOutput=(context:BaseAudioContext)=>mix(context).music;

/** The ranked mix (clarity batch, protocol 29). World sounds (other rats' guns and hits, world foley, launchers,
 * pillar bells, incident foley) pass a duck that your own hits, kills and case events dip briefly
 * (`duckWorld`), and share one budget of `voices` that drops the quietest (softest or furthest) first.
 * Your own gun and hurt, the case, UI and announcements stay on the plain effects path. */
export const RANKED_MIX={voices:12,depth:.5,attack:.015,hold:.22,release:.12} as const;
/** Native world sources connect here instead of `effectsOutput`. */
export const worldOutput=(context:BaseAudioContext)=>mix(context).world;
const listenerDucks=new WeakMap<THREE.AudioListener,GainNode>();
/** Three world voices connect here instead of `listener.getInput()`: before the listener's gain, so the noir muffle still applies. */
export function worldInput(listener:THREE.AudioListener):AudioNode|undefined {
    let duck=listenerDucks.get(listener);
    if(duck)return duck;
    if(typeof listener.context?.createGain!=='function'||typeof listener.getInput!=='function')return;
    duck=listener.context.createGain();duck.connect(listener.getInput());
    listenerDucks.set(listener,duck);mix(listener.context).ducks.push(duck);
    return duck;
}
/** Dip every world bus on `context` to `1 - depth × strength` (0…1) for a moment, then let it back up. */
export function duckWorld(context:BaseAudioContext,strength=1):void {
    const bus=buses.get(context);if(!bus)return;
    const t=context.currentTime,floor=1-RANKED_MIX.depth*Math.max(0,Math.min(1,strength));
    for(const {gain} of bus.ducks){
        const now=gain.value;
        gain.cancelScheduledValues(t);gain.setValueAtTime(now,t);
        gain.linearRampToValueAtTime(Math.min(now,floor),t+RANKED_MIX.attack);
        gain.setTargetAtTime(1,t+RANKED_MIX.attack+RANKED_MIX.hold,RANKED_MIX.release);
    }
}

/** One sound in the shared world budget: `level` its loudness at your ear when it started (volume × distance fade);
 * `cut` silences and frees it at once (it need not call `endWorldVoice`). */
export interface WorldVoice {level:number;cut():void}
const budgets=new WeakMap<BaseAudioContext,Set<WorldVoice>>();
/** Admit a new world voice. When the budget is full the quietest playing voice is cut for it, or the newcomer is
 * refused (false) when it would be the quietest. */
export function admitWorldVoice(context:BaseAudioContext,voice:WorldVoice):boolean {
    let voices=budgets.get(context);
    if(!voices){voices=new Set();budgets.set(context,voices);}
    if(voices.size>=RANKED_MIX.voices){
        let quietest:WorldVoice|undefined;
        for(const v of voices)if(!quietest||v.level<quietest.level)quietest=v;
        if(!quietest||quietest.level>=voice.level)return false;
        voices.delete(quietest);quietest.cut();
    }
    voices.add(voice);return true;
}
/** A world voice ended or was stopped by its owner. */
export function endWorldVoice(context:BaseAudioContext,voice:WorldVoice):void {budgets.get(context)?.delete(voice);}
/** World voices playing now (diagnostics and tests). */
export function worldVoiceCount(context:BaseAudioContext):number {return budgets.get(context)?.size??0;}

import type * as THREE from 'three';
import { playerPreferences } from '../settings/PlayerPreferences';
/** `fades`: one per world path, after its duck, that a playing replay turns down (`fadeLiveWorld`); `live` is their level. */
type Bus={effects:GainNode;music:GainNode;world:GainNode;ducks:GainNode[];fades:GainNode[];live:number;
    replay?:GainNode;stream?:MediaStreamAudioDestinationNode};
const buses=new WeakMap<BaseAudioContext,Bus>();
/** All native and Three effects meet here once, after their existing spatial mix. */
function mix(context:BaseAudioContext){
    let bus=buses.get(context);
    if(!bus){
        const world=context.createGain(),fade=context.createGain();
        bus={effects:context.createGain(),music:context.createGain(),world,ducks:[world],fades:[fade],live:1};
        bus.effects.connect(context.destination);bus.music.connect(context.destination);world.connect(fade);fade.connect(bus.effects);buses.set(context,bus);
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

/** Exhibit replays (docs/replay/playback.md): replay sounds meet on their own bus, which feeds the effects bus (so
 * the master and effects sliders apply) and, for saving, a media stream. While a replay plays the live world
 * paths fade to `live` over `fade` seconds; replay voices have their own budget of `voices`. */
export const REPLAY_MIX={voices:10,live:.25,fade:.35} as const;
/** The replay bus: replay voices connect here. */
export function replayOutput(context:BaseAudioContext):GainNode {
    const bus=mix(context);
    if(!bus.replay){bus.replay=context.createGain();bus.replay.connect(bus.effects);if(bus.stream)bus.replay.connect(bus.stream);}
    return bus.replay;
}
/** The replay bus as a media stream (before the sliders, so a saved exhibit keeps its own level). */
export function replayStream(context:AudioContext):MediaStream {
    const bus=mix(context);
    if(!bus.stream){bus.stream=context.createMediaStreamDestination();replayOutput(context).connect(bus.stream);}
    return bus.stream.stream;
}
/** Turn every live world path down while a replay plays (`down`), or back up. */
export function fadeLiveWorld(context:BaseAudioContext,down:boolean):void {
    // Nothing to turn back up on a context that never had a mix.
    const bus=down?mix(context):buses.get(context),level=down?REPLAY_MIX.live:1;
    if(!bus||bus.live===level)return;
    bus.live=level;
    const t=context.currentTime;
    for(const {gain} of bus.fades){gain.cancelScheduledValues(t);gain.setValueAtTime(gain.value,t);gain.linearRampToValueAtTime(level,t+REPLAY_MIX.fade);}
}
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
    const bus=mix(listener.context),fade=listener.context.createGain();
    fade.gain.value=bus.live;
    duck=listener.context.createGain();duck.connect(fade);fade.connect(listener.getInput());
    listenerDucks.set(listener,duck);bus.ducks.push(duck);bus.fades.push(fade);
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
const replayBudgets=new WeakMap<BaseAudioContext,Set<WorldVoice>>();
/** Admit `voice` to `voices`, cutting the quietest when full, or refuse it (false) when it would be the quietest. */
function admit(all:WeakMap<BaseAudioContext,Set<WorldVoice>>,context:BaseAudioContext,voice:WorldVoice,capacity:number):boolean {
    let voices=all.get(context);
    if(!voices){voices=new Set();all.set(context,voices);}
    if(voices.size>=capacity){
        let quietest:WorldVoice|undefined;
        for(const v of voices)if(!quietest||v.level<quietest.level)quietest=v;
        if(!quietest||quietest.level>=voice.level)return false;
        voices.delete(quietest);quietest.cut();
    }
    voices.add(voice);return true;
}
/** Admit a new world voice. When the budget is full the quietest playing voice is cut for it, or the newcomer is
 * refused (false) when it would be the quietest. */
export function admitWorldVoice(context:BaseAudioContext,voice:WorldVoice):boolean {return admit(budgets,context,voice,RANKED_MIX.voices);}
/** A world voice ended or was stopped by its owner. */
export function endWorldVoice(context:BaseAudioContext,voice:WorldVoice):void {budgets.get(context)?.delete(voice);}
/** World voices playing now (diagnostics and tests). */
export function worldVoiceCount(context:BaseAudioContext):number {return budgets.get(context)?.size??0;}
/** Replay voices playing now (diagnostics: a replay leaves none behind). */
export function replayVoiceCount(context:BaseAudioContext):number {return replayBudgets.get(context)?.size??0;}

/** Where a native world voice goes and whose budget it joins: the live world bus (`LIVE_ROUTE`, ducked, ranked) or an
 * exhibit replay's bus (`REPLAY_ROUTE`, its own budget, never the live world's slots). A replay route takes every cue,
 * announcements included. */
export interface VoiceRoute {
    output(context:BaseAudioContext):AudioNode;
    admit(context:BaseAudioContext,voice:WorldVoice):boolean;
    end(context:BaseAudioContext,voice:WorldVoice):void;
    replay:boolean;
}
export const LIVE_ROUTE:VoiceRoute={output:worldOutput,admit:admitWorldVoice,end:endWorldVoice,replay:false};
export const REPLAY_ROUTE:VoiceRoute={output:replayOutput,replay:true,
    admit:(context,voice)=>admit(replayBudgets,context,voice,REPLAY_MIX.voices),end:(context,voice)=>{replayBudgets.get(context)?.delete(voice);}};

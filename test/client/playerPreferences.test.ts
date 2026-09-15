import {afterEach,expect,it} from 'vitest';
import {DEFAULT_PREFERENCES,PREFERENCES_KEY,PreferenceStore,lookDelta,playerPreferences,validatePreferences} from '../../src/settings/PlayerPreferences';
import {InputState} from '../../src/session/InputState';
import {effectsOutput,musicOutput} from '../../src/audio/PlayerAudioMix';
afterEach(()=>playerPreferences().reset());
function storage(initial:Record<string,string>={}){const data=new Map(Object.entries(initial));return {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};}
it('migrates touch sensitivity once, persists independent look settings, and resets across reload',()=>{
 const disk=storage({'rat-touch-sensitivity':'0.7'}),store=new PreferenceStore(disk);
 expect(store.current.touchSensitivity).toBe(.7);store.update({mouseSensitivity:.2,invertMouseY:true});
 expect(new PreferenceStore(disk).current).toMatchObject({mouseSensitivity:.2,touchSensitivity:.7,invertMouseY:true});
 store.reset();expect(new PreferenceStore(disk).current).toEqual(DEFAULT_PREFERENCES);
});
it('survives malformed, unavailable and future storage and validates finite bounds',()=>{
 for(const value of ['{bad','null','[]','{"version":2,"mouseSensitivity":2}'])expect(new PreferenceStore(storage({[PREFERENCES_KEY]:value})).current).toEqual(DEFAULT_PREFERENCES);
 const store=new PreferenceStore({getItem:()=>{throw Error();},setItem:()=>{throw Error();}});
 store.update({mouseSensitivity:.3,effectsVolume:0});expect(store.current.mouseSensitivity).toBe(.3);
 expect(validatePreferences({version:1,mouseSensitivity:NaN,touchSensitivity:Infinity,uiScale:99,invertMouseY:'yes'})).toMatchObject({mouseSensitivity:1,touchSensitivity:1.5,uiScale:1.3,invertMouseY:false});
});
it('scales and inverts each input exactly once without coupling devices',()=>{
 const p={...DEFAULT_PREFERENCES,mouseSensitivity:.25,touchSensitivity:2,invertMouseY:true};
 expect(lookDelta(100,20,'mouse',p)).toEqual([25,-5]);expect(lookDelta(100,20,'touch',p)).toEqual([200,40]);
});
it('rejects conflicts, reserved/browser keys and empty actions without silently changing bindings',()=>{
 const store=new PreferenceStore();const before=structuredClone(store.current.bindings);
 for(const code of ['KeyS','Escape','MetaLeft','Tab','F8'])expect(store.bind('forward',0,code)).toBeTruthy();
 expect(store.current.bindings).toEqual(before);expect(store.bind('forward',0,'KeyI')).toBeUndefined();
 expect(store.bind('jump',0,'')).toBeTruthy();expect(store.bind('forward',1,'')).toBeUndefined();
 expect(validatePreferences({...store.current,bindings:{...store.current.bindings,back:['KeyI','']}}).bindings).toEqual(DEFAULT_PREFERENCES.bindings);
});
it('keeps dual held bindings active, respects menu gating and clears remapped input on focus loss',()=>{
 const target=new EventTarget(),doc=new EventTarget();let enabled=true;
 playerPreferences().bind('forward',0,'KeyI');const input=new InputState(target as Window,doc as Document,()=>enabled);
 const key=(type:string,code:string)=>target.dispatchEvent(Object.assign(new Event(type),{code}));
 key('keydown','KeyW');expect(input.keys.KeyW).toBeUndefined();key('keydown','KeyI');key('keydown','ArrowUp');key('keyup','KeyI');expect(input.keys.KeyW).toBe(true);
 key('keyup','ArrowUp');expect(input.keys.KeyW).toBe(false);enabled=false;key('keydown','KeyI');expect(input.keys.KeyW).toBe(false);
 enabled=true;key('keydown','KeyI');target.dispatchEvent(new Event('blur'));expect(input.keys.KeyW).toBeUndefined();input.dispose();
});
it('changes existing effects and music buses live while keeping effects separate from music',()=>{
 const context=Object.assign(new EventTarget(),{destination:{},state:'running',createGain:()=>({gain:{value:1},connect:()=>{}})}) as unknown as AudioContext;
 const fx=effectsOutput(context),music=musicOutput(context);expect(effectsOutput(context)).toBe(fx);
 playerPreferences().update({masterVolume:.4,effectsVolume:.25});expect(fx.gain.value).toBe(.1);expect(music.gain.value).toBe(.4);
 playerPreferences().update({masterVolume:0});expect(fx.gain.value).toBe(0);expect(music.gain.value).toBe(0);
 Object.assign(context,{state:'closed'});context.dispatchEvent(new Event('statechange'));
});

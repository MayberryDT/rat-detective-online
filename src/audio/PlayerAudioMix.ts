import { playerPreferences } from '../settings/PlayerPreferences';
const buses=new WeakMap<BaseAudioContext,{effects:GainNode;music:GainNode}>();
/** All native and Three effects meet here once, after their existing spatial mix. */
function mix(context:BaseAudioContext){
    let bus=buses.get(context);
    if(!bus){
        bus={effects:context.createGain(),music:context.createGain()};
        bus.effects.connect(context.destination);bus.music.connect(context.destination);buses.set(context,bus);
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

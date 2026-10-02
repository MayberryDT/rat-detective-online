import {expect,it,vi,type Mock} from 'vitest';
import {RANKED_MIX,admitWorldVoice,duckWorld,endWorldVoice,worldOutput,worldVoiceCount,type WorldVoice} from '../../src/audio/PlayerAudioMix';

interface FakeParam {value:number;cancelScheduledValues:Mock;setValueAtTime:Mock;linearRampToValueAtTime:Mock;setTargetAtTime:Mock}
const param=():FakeParam=>({value:1,cancelScheduledValues:vi.fn(),setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),setTargetAtTime:vi.fn()});
const context=()=>({currentTime:2,destination:{},createGain:()=>({gain:param(),connect:vi.fn(),disconnect:vi.fn()})}) as unknown as BaseAudioContext;
const voice=(level:number):WorldVoice&{cut:Mock}=>({level,cut:vi.fn()});

it('caps world voices, cutting the quietest for a louder newcomer and refusing a quieter one',()=>{
    const ctx=context(),voices=Array.from({length:RANKED_MIX.voices},(_,i)=>voice(.1+i*.01));
    for(const v of voices)expect(admitWorldVoice(ctx,v)).toBe(true);
    expect(admitWorldVoice(ctx,voice(.05))).toBe(false);
    expect(voices.every(v=>v.cut.mock.calls.length===0)).toBe(true);
    const loud=voice(.9);expect(admitWorldVoice(ctx,loud)).toBe(true);
    expect(voices[0]!.cut).toHaveBeenCalledOnce();expect(worldVoiceCount(ctx)).toBe(RANKED_MIX.voices);
    // An ended voice frees its place for any newcomer, however quiet.
    endWorldVoice(ctx,loud);expect(admitWorldVoice(ctx,voice(.01))).toBe(true);
    // Budgets are per audio context.
    expect(worldVoiceCount(context())).toBe(0);
});

it('dips the world bus by the strength, then lets it back up after the hold',()=>{
    const ctx=context(),{gain}=worldOutput(ctx) as unknown as {gain:FakeParam};
    duckWorld(ctx,1);
    expect(gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1-RANKED_MIX.depth,2+RANKED_MIX.attack);
    expect(gain.setTargetAtTime).toHaveBeenLastCalledWith(1,2+RANKED_MIX.attack+RANKED_MIX.hold,RANKED_MIX.release);
    duckWorld(ctx,.5);
    expect(gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1-RANKED_MIX.depth*.5,2+RANKED_MIX.attack);
    // A context without world sounds yet has nothing to duck.
    expect(()=>duckWorld(context(),1)).not.toThrow();
});

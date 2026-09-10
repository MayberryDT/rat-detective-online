import {expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {AudioVoicePool} from '../../src/audio/AudioVoicePool';
vi.unmock('three');

it('reuses real Three audio objects and gains, bounds overlap, and disconnects every output on disposal',()=>{
    const outputs:Array<{disconnect:ReturnType<typeof vi.fn>}>=[];
    const context={createGain:()=>{
        const gain={connect:vi.fn(),disconnect:vi.fn()};outputs.push(gain);return gain;
    }};
    const pool=new AudioVoicePool({context,getInput:()=>({})} as unknown as THREE.AudioListener,12);
    const distinct=new Set<THREE.Audio>();
    for(let i=0;i<200;i++){
        const sound=pool.acquire()!;distinct.add(sound);pool.finish(sound);
        expect(sound.isPlaying).toBe(false);
    }
    expect(distinct.size).toBe(1);expect(outputs).toHaveLength(1);
    for(let i=0;i<12;i++)expect(pool.acquire()).toBeDefined();
    expect(pool.acquire()).toBeUndefined();expect(outputs).toHaveLength(12);
    pool.dispose();pool.dispose();
    expect(outputs.every(output=>output.disconnect.mock.calls.length===1)).toBe(true);
    expect(pool.acquire()).toBeUndefined();
});

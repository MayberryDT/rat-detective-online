import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { disposeEntitySounds, initEntitySounds, playEntitySound } from '../../src/audio/EntityAudio';

const state = vi.hoisted(() => ({
    loads: [] as { done: (buffer: AudioBuffer) => void; error: () => void }[],
    sounds: [] as { isPlaying: boolean; onEnded: () => void; disconnect: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[],
}));
vi.mock('three', async original => ({
    ...await original<typeof import('three')>(),
    AudioLoader: class {
        load(_url: string, done: (buffer: AudioBuffer) => void, _progress: unknown, error: () => void) { state.loads.push({ done, error }); }
    },
    Audio: class {
        isPlaying = false;
        onEnded = () => { this.isPlaying = false; };
        setBuffer() {}
        setVolume() {}
        play() { this.isPlaying = true; }
        stop = vi.fn(() => { this.isPlaying = false; });
        disconnect = vi.fn();
        constructor() { state.sounds.push(this); }
    },
}));
afterEach(() => { disposeEntitySounds(); state.loads.length = 0; state.sounds.length = 0; vi.restoreAllMocks(); });

it('ignores completed loads from disposed sessions and permits a fresh load', () => {
    initEntitySounds({ context: { state: 'running' } } as THREE.AudioListener);
    const old = state.loads[0];
    disposeEntitySounds();
    old.done({} as AudioBuffer);
    playEntitySound('ratHit');
    expect(state.sounds).toHaveLength(0);
    initEntitySounds({ context: { state: 'running' } } as THREE.AudioListener);
    state.loads[3].done({} as AudioBuffer);
    playEntitySound('ratHit');
    expect(state.sounds).toHaveLength(1);
});

it('preserves Three audio end-state and disconnects active sounds on teardown', () => {
    initEntitySounds({ context: { state: 'running' } } as THREE.AudioListener);
    state.loads[0].done({} as AudioBuffer);
    playEntitySound('ratHit');
    const ended = state.sounds[0];
    ended.onEnded();
    expect(ended.isPlaying).toBe(false);
    expect(ended.disconnect).toHaveBeenCalledTimes(1);
    playEntitySound('ratHit');
    const active = state.sounds[1];
    disposeEntitySounds();
    expect(active.stop).toHaveBeenCalledTimes(1);
    expect(active.disconnect).toHaveBeenCalledTimes(1);
    expect(ended.disconnect).toHaveBeenCalledTimes(1);
});

it('reports an asset failure without preventing other sounds from loading', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    initEntitySounds({ context: { state: 'running' } } as THREE.AudioListener);
    state.loads[0].error();
    state.loads[1].done({} as AudioBuffer);
    playEntitySound('ratDeath');
    expect(warning).toHaveBeenCalledTimes(1);
    expect(state.sounds).toHaveLength(1);
});


it('drops hits while audio is suspended rather than playing a backlog after unlock', () => {
    const listener = { context: { state: 'suspended' } } as THREE.AudioListener;
    initEntitySounds(listener);
    state.loads[0].done({} as AudioBuffer);
    playEntitySound('ratHit');
    expect(state.sounds).toHaveLength(0);
    Object.assign(listener.context, { state: 'running' });
    expect(state.sounds).toHaveLength(0);
    playEntitySound('ratHit');
    expect(state.sounds).toHaveLength(1);
});

it('bounds overlapping chaos audio while allowing a new hit to be heard', () => {
    initEntitySounds({ context: { state: 'running' } } as THREE.AudioListener);
    state.loads[0].done({} as AudioBuffer);
    for (let hit = 0; hit < 20; hit++) playEntitySound('ratHit');
    expect(state.sounds.filter(sound => sound.isPlaying)).toHaveLength(12);
    expect(state.sounds.at(-1)?.isPlaying).toBe(true);
    expect(state.sounds[0].stop).toHaveBeenCalledTimes(1);
    expect(state.sounds[0].disconnect).toHaveBeenCalledTimes(1);
});

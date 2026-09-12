import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
});

async function load() {
    return import('../../src/audio/effectsAudio');
}

function stubWindow(hostname: string, search: string, Ctor: unknown) {
    vi.stubGlobal('window', { location: { hostname, search }, AudioContext: Ctor, webkitAudioContext: Ctor });
}

it('creates and resumes the shared context during an unmuted title gesture', async () => {
    class Ctx {
        state = 'suspended';
        resume = vi.fn(async () => { this.state = 'running'; });
    }
    stubWindow('127.0.0.1', '', Ctx);
    const { effectsAudioContext, unlockEffectsAudio } = await load();
    unlockEffectsAudio();
    await Promise.resolve();
    const context = effectsAudioContext() as unknown as Ctx;
    expect(context).toBeInstanceOf(Ctx);
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(context.state).toBe('running');
    unlockEffectsAudio();
    expect(effectsAudioContext()).toBe(context);
});

it('keeps the effects graph suspended for muted loopback agent tests', async () => {
    class Ctx {
        state = 'suspended';
        resume = vi.fn();
    }
    stubWindow('127.0.0.1', '?mute=1', Ctx);
    const { effectsAudioContext, unlockEffectsAudio } = await load();
    unlockEffectsAudio();
    expect(effectsAudioContext()).toBeUndefined();
});

it('reuses one already-running context instead of constructing another', async () => {
    class Ctx {
        state = 'running';
        resume = vi.fn();
        static count = 0;
        constructor() { Ctx.count += 1; }
    }
    stubWindow('ratdetective.online', '', Ctx);
    const { effectsAudioContext, unlockEffectsAudio } = await load();
    unlockEffectsAudio();
    unlockEffectsAudio();
    expect(Ctx.count).toBe(1);
    expect((effectsAudioContext() as unknown as Ctx).resume).not.toHaveBeenCalled();
});

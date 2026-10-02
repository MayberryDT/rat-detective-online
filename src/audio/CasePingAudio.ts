import { duckWorld, effectsOutput } from './PlayerAudioMix';
import { worldSoundGain } from './worldSoundGain';

/** The case ping (clarity batch): a bright sonar ping with a softer echo, panned toward the case and heard across the
 * whole city (distance only softens it); the carrier hears a soft tick instead. Synthesized per ping (one every 4 s),
 * on the effects bus so it cuts through fights, with a light duck of the world sounds. */
export class CasePingAudio {
    constructor(private readonly context?: AudioContext) {}

    /** `distance` units away, `pan` -1 (left) … 1 (right). */
    ping(distance: number, pan: number): void {
        const ctx = this.running(); if (!ctx) return;
        duckWorld(ctx, .45);
        const out = this.voice(ctx, .3 * (.4 + .6 * worldSoundGain(distance)), pan, 1.3), at = ctx.currentTime;
        this.tone(ctx, out, 1568, at, .9, 1);
        this.tone(ctx, out, 2352, at, .45, .35);
        this.tone(ctx, out, 784, at, .25, .4);
        // The echo, quieter and a hair lower, so the ping reads as far away.
        this.tone(ctx, out, 1560, at + .2, .7, .32);
    }
    /** Your own case pinged: a soft, dry tick, centred. */
    tick(): void {
        const ctx = this.running(); if (!ctx) return;
        const out = this.voice(ctx, .1, 0, .3), at = ctx.currentTime;
        this.tone(ctx, out, 2093, at, .06, 1);
        this.tone(ctx, out, 1046, at, .05, .5);
    }
    private running(): AudioContext | undefined {
        const ctx = this.context;
        return ctx?.state === 'running' ? ctx : undefined;
    }
    /** A voice's level and pan, freed after `seconds`. */
    private voice(ctx: AudioContext, level: number, pan: number, seconds: number): GainNode {
        const gain = ctx.createGain(), panner = ctx.createStereoPanner();
        gain.gain.value = level; panner.pan.value = Math.max(-.85, Math.min(.85, pan));
        gain.connect(panner); panner.connect(effectsOutput(ctx));
        setTimeout(() => { gain.disconnect(); panner.disconnect(); }, seconds * 1000);
        return gain;
    }
    private tone(ctx: AudioContext, out: GainNode, frequency: number, at: number, decay: number, peak: number): void {
        const osc = ctx.createOscillator(), env = ctx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(frequency, at);
        env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(peak, at + .006);
        env.gain.exponentialRampToValueAtTime(.0001, at + decay);
        osc.connect(env); env.connect(out);
        osc.onended = () => { osc.disconnect(); env.disconnect(); };
        osc.start(at); osc.stop(at + decay + .02);
    }
}

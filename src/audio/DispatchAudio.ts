import { effectsOutput } from './PlayerAudioMix';
import { worldSoundGain } from './worldSoundGain';

/** `clank`: a ball on a busy bell; `strike`: the ball that starts an incident;
 * `squawk`: the police radio, heard citywide; `tick`: each of the last three
 * seconds; `finale`: the incident's closing beat; `whistle`: the all clear; `yelp`: an All Units backup arriving. */
export type DispatchCue = 'clank' | 'strike' | 'squawk' | 'tick' | 'finale' | 'whistle' | 'yelp';
type Buffers = Partial<Record<DispatchCue | 'whoop' | 'ring', AudioBuffer>>;
interface Voice {source:AudioBufferSourceNode;gain:GainNode;pan:StereoPannerNode;volume:number}
/** Siren slots, bell slots and one-shot cues are each bounded. */
export const DISPATCH_VOICES = {siren:2, bell:3, cue:6} as const;
const SIREN_EVERY = 4;
/** The ready siren is how players find a pillar: loud, and heard out to 85 units. */
export function sirenVolume(distance: number): number {
    return distance < 85 ? .38 * worldSoundGain(distance, Math.max(0, 1 - Math.max(0, distance - 12) / 73)) : 0;
}

/** Synthesized alarm pillar sounds. Every buffer is generated once on first use;
 * nothing resumes the context or plays while it is suspended, and cues missed
 * while it was suspended are dropped rather than queued. */
export class DispatchAudio {
    private readonly buffers: Buffers = {};
    private readonly sirens: Array<Voice | undefined> = [];
    private readonly sirenNext: number[] = [];
    private readonly bells: Array<(Voice & {station:number}) | undefined> = [];
    private readonly cues: Voice[] = [];
    private disposed = false;
    constructor(private readonly context?: AudioContext) {}

    private running(): AudioContext | undefined {
        const ctx = this.context;
        return !this.disposed && ctx?.state === 'running' ? ctx : undefined;
    }
    private voice(buffer: AudioBuffer, volume: number, pan: number, loop = false, rate = 1, delay = 0): Voice | undefined {
        const ctx = this.context!, source = ctx.createBufferSource(), gain = ctx.createGain(), panner = ctx.createStereoPanner();
        source.buffer = buffer; source.loop = loop; source.playbackRate.value = rate;
        gain.gain.value = volume; panner.pan.value = pan;
        source.connect(gain); gain.connect(panner); panner.connect(effectsOutput(ctx));
        const voice = {source, gain, pan: panner, volume};
        try { source.start(ctx.currentTime + delay); } catch { this.stop(voice); return undefined; }
        return voice;
    }
    private stop(voice: Voice): void {
        voice.source.onended = null;
        try { voice.source.stop(); } catch { /* A failed start has no running source. */ } finally { voice.source.disconnect(); voice.gain.disconnect(); voice.pan.disconnect(); }
    }
    private retarget(voice: Voice, volume: number, pan: number): void {
        if (Math.abs(voice.volume - volume) > .0001) { voice.gain.gain.setTargetAtTime(volume, this.context!.currentTime, .04); voice.volume = volume; }
        voice.pan.pan.value = pan;
    }

    /** The mechanical whoop from a ready pillar in `slot` (the nearest two), every few
     * seconds; `volume` 0 silences the slot and lets it announce afresh. */
    siren(slot: number, volume: number, pan: number): void {
        const ctx = this.running(), voice = this.sirens[slot];
        if (!ctx || !(volume > 0)) { if (voice) { this.sirens[slot] = undefined; this.stop(voice); } if (!(volume > 0)) this.sirenNext[slot] = 0; return; }
        if (voice) { this.retarget(voice, volume, pan); return; }
        // The second pillar answers the first half a cycle later, so the two directions stay distinct.
        if (!this.sirenNext[slot]) this.sirenNext[slot] = slot > 0 ? ctx.currentTime + SIREN_EVERY / 2 : ctx.currentTime;
        if (ctx.currentTime < this.sirenNext[slot]!) return;
        const started = this.voice(this.buffers.whoop ??= whoop(ctx), volume, pan);
        if (!started) return;
        this.sirens[slot] = started; this.sirenNext[slot] = ctx.currentTime + SIREN_EVERY;
        started.source.onended = () => { this.stop(started); if (this.sirens[slot] === started) this.sirens[slot] = undefined; };
    }

    /** A ringing bell in `slot` (the nearest three ringing pillars): `station` -1 stops it;
     * a different station restarts it. `rate` above 1 is a berserk bell. */
    bell(slot: number, station: number, volume: number, pan: number, rate = 1): void {
        const ctx = this.running(), voice = this.bells[slot];
        if (voice && (!ctx || station < 0 || voice.station !== station || !(volume > 0))) { this.bells[slot] = undefined; this.stop(voice); }
        else if (voice) { this.retarget(voice, volume, pan); voice.source.playbackRate.value = rate; return; }
        if (!ctx || station < 0 || !(volume > 0)) return;
        const started = this.voice(this.buffers.ring ??= ring(ctx), volume, pan, true, rate);
        if (started) this.bells[slot] = {...started, station};
    }

    /** A one-shot cue; the oldest cue gives way when all voices are busy. */
    play(cue: DispatchCue, volume: number, pan = 0, delay = 0): void {
        const ctx = this.running();
        if (!ctx || !(volume > 0)) return;
        if (this.cues.length >= DISPATCH_VOICES.cue) this.stop(this.cues.shift()!);
        const buffer = this.buffers[cue] ??= CUES[cue](ctx);
        const started = this.voice(buffer, volume, pan, false, 1, delay);
        if (!started) return;
        this.cues.push(started);
        started.source.onended = () => { this.stop(started); const i = this.cues.indexOf(started); if (i >= 0) this.cues.splice(i, 1); };
    }

    dispose(): void {
        this.disposed = true;
        for (const voice of [...this.sirens, ...this.bells, ...this.cues]) if (voice) this.stop(voice);
        this.sirens.length = this.bells.length = this.cues.length = 0;
        for (const key of Object.keys(this.buffers) as Array<keyof Buffers>) delete this.buffers[key];
    }
}

/** Fill a mono buffer of `seconds` from `sample(t)`, normalised to `peak`; the last 15 ms fade out
 * (unless it `loops`) so a one-shot never ends on a click. */
function render(ctx: AudioContext, seconds: number, peak: number, sample: (t: number) => number, loops = false): AudioBuffer {
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate), pcm = buffer.getChannelData(0);
    let max = 0;
    for (let i = 0; i < pcm.length; i++) { pcm[i] = sample(i / ctx.sampleRate); max = Math.max(max, Math.abs(pcm[i]!)); }
    const tail = loops ? 0 : Math.ceil(ctx.sampleRate * .015);
    if (max > 0) for (let i = 0; i < pcm.length; i++) pcm[i] = pcm[i]! * peak / max * Math.min(1, (pcm.length - i) / Math.max(1, tail));
    return buffer;
}
/** Seeded noise, so every generated buffer is the same. */
function noise(seed: number): () => number {
    let s = seed;
    return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x3fffffff - 1; };
}
/** A struck metal partial set, `age` seconds after the strike. */
function metal(age: number, base: number, partials: readonly (readonly [number, number, number])[]): number {
    if (age < 0) return 0;
    let v = 0;
    for (const [ratio, amp, decay] of partials) v += amp * Math.exp(-age / decay) * Math.sin(2 * Math.PI * base * ratio * age);
    return v * Math.min(1, age / .0015);
}
const ALARM_BELL = [[1, 1, .35], [2.32, .55, .2], [4.25, .3, .1], [6.1, .15, .06]] as const;
const BIG_BELL = [[1, 1, 1.4], [2.76, .6, .6], [5.4, .35, .25], [8.9, .15, .1]] as const;

/** The ready siren: a mechanical whoop (the kiosk siren, unchanged). */
function whoop(ctx: AudioContext): AudioBuffer {
    const duration = 1.6; let phase = 0, last = 0;
    return render(ctx, duration, .48 * 1.42, t => {
        const frequency = 540 + 460 * (.5 - .5 * Math.cos(t * 2 * Math.PI * 2.5));
        phase += 2 * Math.PI * frequency * (t - last); last = t;
        const envelope = Math.min(1, t / .045) * Math.min(1, (duration - t) / .11);
        return (Math.sin(phase) + .3 * Math.sin(phase * 3) + .12 * Math.sin(phase * 5)) * envelope;
    });
}
/** One second of an electric alarm bell: sixteen hammer strikes, each ringing into
 * the next, wrapped so the buffer loops without a seam. */
function ring(ctx: AudioContext): AudioBuffer {
    const rate = 16, strength = Array.from({length: rate}, (_, i) => .75 + .25 * Math.abs(Math.sin(i * 2.3)));
    return render(ctx, 1, .8, t => {
        let v = 0;
        const since = t % (1 / rate), strike = Math.floor(t * rate);
        for (let j = 0; j < 8; j++) v += strength[((strike - j) % rate + rate) % rate]! * metal(since + j / rate, 1180, ALARM_BELL);
        return v;
    }, true);
}
const CUES: Record<DispatchCue, (ctx: AudioContext) => AudioBuffer> = {
    // A dull thud under a short dead clank: the line is busy.
    clank: ctx => { const n = noise(7); return render(ctx, .35, .8, t => .9 * Math.exp(-t / .05) * Math.sin(2 * Math.PI * (110 - 150 * t) * t)
        + .35 * Math.exp(-t / .03) * (Math.sin(2 * Math.PI * 910 * t) + .7 * Math.sin(2 * Math.PI * 1370 * t)) + .3 * Math.exp(-t / .008) * n()); },
    // A huge bong and a clattering hammer: the bell takes the call.
    strike: ctx => { const n = noise(11); return render(ctx, 1.8, .9, t => metal(t, 520, BIG_BELL) + .5 * metal(t - .09, 1180, ALARM_BELL) + .4 * Math.exp(-t / .012) * n()); },
    // Police radio: a squelch burst, a garbled voice through a narrow band, the roger beep and the squelch tail.
    squawk: ctx => {
        const n = noise(23); let low = 0, high = 0, previous = 0, phase = 0;
        return render(ctx, 1.5, .85, t => {
            let x: number;
            if (t < .13 || t > 1.36) x = n() * (t < .13 ? 1 : Math.max(0, 1 - (t - 1.36) / .14));
            else if (t > 1.24) x = Math.sin(2 * Math.PI * 1250 * t) * .8;
            else {
                phase += 2 * Math.PI * (130 + 40 * Math.sin(t * 9)) / ctx.sampleRate;
                const saw = (phase / Math.PI) % 2 - 1, syllable = Math.max(0, Math.sin(t * 2 * Math.PI * 4.3)) ** .6;
                x = (saw * (.6 + .4 * Math.sin(2 * Math.PI * 820 * t)) * syllable + .25 * n()) * 1.6;
            }
            // A crude radio band (about 400 Hz to 2.5 kHz), then clipped.
            low += (x - low) * .28; high = .92 * (high + low - previous); previous = low;
            return Math.max(-.6, Math.min(.6, high * 1.8));
        });
    },
    tick: ctx => render(ctx, .16, .7, t => metal(t, 1900, [[1, 1, .04], [2.4, .4, .02]]) + .3 * Math.exp(-t / .004) * Math.sin(t * 9000)),
    // Every bell at once over a bass drum hit and a cymbal-like wash.
    finale: ctx => { const n = noise(31); return render(ctx, 1.4, .95, t => 1.2 * Math.exp(-t / .22) * Math.sin(2 * Math.PI * (72 - 30 * t) * t)
        + metal(t, 440, BIG_BELL) + .6 * metal(t, 1180, ALARM_BELL) + .35 * Math.exp(-t / .35) * n()); },
    // Two blasts on a pea whistle: all clear.
    whistle: ctx => { const n = noise(43); let phase = 0; return render(ctx, 1.35, .75, t => {
        const on = t < .32 ? Math.min(1, t / .02, (.32 - t) / .03) : t > .45 && t < 1.3 ? Math.min(1, (t - .45) / .02, (1.3 - t) / .06) : 0;
        phase += 2 * Math.PI * (2850 + 140 * Math.sin(2 * Math.PI * 27 * t)) / ctx.sampleRate;
        return on * (Math.sin(phase) * (.75 + .25 * Math.sin(2 * Math.PI * 27 * t)) + .12 * n());
    }); },
    // All Units backup arrival: a prowl car's two fast whoop-whoops, sweeping up and dropping.
    yelp: ctx => { let phase = 0; return render(ctx, 1.1, .7, t => {
        const cycle = (t % .5) / .5, frequency = 620 + 980 * Math.sin(Math.PI * Math.min(1, cycle * 1.25)) ** .7;
        phase += 2 * Math.PI * frequency / ctx.sampleRate;
        const envelope = Math.min(1, t / .03) * Math.min(1, (1.1 - t) / .12);
        return (Math.sin(phase) + .35 * Math.sin(phase * 3) + .15 * Math.sin(phase * 5)) * envelope;
    }); },
};

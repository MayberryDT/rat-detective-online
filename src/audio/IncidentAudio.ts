import { admitWorldVoice, effectsOutput, endWorldVoice, worldOutput } from './PlayerAudioMix';
import type {Vec3Data} from '../shared/networkProtocol';
import { previewMuted } from './previewMuted';
import {worldSoundGain} from './worldSoundGain';

/** Recorded and pre-rendered foley through the game's existing Web Audio context. */
const MAX_VOICES = 10;
const FILES = ['pop-0', 'pop-1', 'pop-2', 'case-saw'] as const;
type Cue = typeof FILES[number];
let context: AudioContext | undefined;
let buffers = new Map<Cue, AudioBuffer>();
let loading: Promise<void> | undefined;
let generation = 0;
let buzzWanted = false;
const CASE_BUZZ_VOLUME = .055;
let buzzVolume = CASE_BUZZ_VOLUME;
let saw: {source: AudioBufferSourceNode; gain: GainNode; volume: number} | undefined;
const listener = {x:0,y:0,z:0};
/** Each playing cue and how to free it (its nodes and its ranked-mix world voice). */
const voices = new Map<AudioBufferSourceNode, () => void>();
let popVariant = 0;
/** Short synthesized cues, rendered once per audio context: `seconds` long, `sample(t, noise)` normalised to `peak`. */
const SYNTH = {
    // A heavy ball's dull landing (case missiles; Big Cheese replays it lower).
    thud: {seconds: .18, peak: .16, sample: (t: number) => Math.sin(2 * Math.PI * (90 * t - 130 * t * t)) * Math.exp(-t * 28)},
    // Bad Ammunition's superball: a cartoon spring, the pitch wobbling up and settling.
    boing: {seconds: .62, peak: .5, sample: (t: number) => {
        const f = 190 + 140 * Math.min(1, t * 9) + 70 * Math.sin(2 * Math.PI * 13 * t) * Math.exp(-t * 4);
        return (Math.sin(2 * Math.PI * f * t) + .35 * Math.sin(4 * Math.PI * f * t)) * Math.min(1, t * 300) * Math.exp(-t * 5.5);
    }},
    // Bad Ammunition corkscrew: a toy drill whirring up, its tremolo the ball's spin.
    corkscrew: {seconds: .55, peak: .42, sample: (t: number) => {
        const phase = 2 * Math.PI * (380 * t + 650 * t * t);
        return (Math.sin(phase) + .3 * Math.sin(2 * phase) + .15 * Math.sin(3 * phase)) * (.6 + .4 * Math.sin(2 * Math.PI * 38 * t)) * Math.min(1, t * 60) * Math.exp(-t * 2.5);
    }},
    // Bad Ammunition snake: a slide whistle wavering up and down with its sway.
    snake: {seconds: .7, peak: .38, sample: (t: number, n: () => number) => {
        const phase = 2 * Math.PI * (900 * t - 450 / (2 * Math.PI * 2.4) * Math.cos(2 * Math.PI * 2.4 * t));
        return (Math.sin(phase) + .08 * n()) * Math.min(1, t * 40) * Math.exp(-t * 2);
    }},
    // Bad Ammunition floater: a lazy kazoo, "wheee-ooo", buzzing as it drifts off.
    floater: {seconds: .9, peak: .36, sample: (t: number) => {
        const phase = 2 * Math.PI * (340 * t + 160 * .9 / Math.PI * (1 - Math.cos(Math.PI * t / .9)));
        let buzz = 0; for (let k = 1; k <= 6; k++) buzz += Math.sin(k * phase) / k;
        return buzz * (.85 + .15 * Math.sin(2 * Math.PI * 6 * t)) * Math.min(1, t * 30) * Math.min(1, (.9 - t) * 12);
    }},
    // Code Violation: a faulty fitting arcing, a crackle over a mains buzz.
    zap: {seconds: .35, peak: .3, sample: (t: number, n: () => number) =>
        (n() * (Math.sin(2 * Math.PI * 120 * t) > .3 ? 1 : .2) + .3 * Math.sign(Math.sin(2 * Math.PI * 100 * t))) * Math.exp(-t * 7)},
    // Crossfire: a bright ricochet "pyew", a whine gliding down from 2.6 kHz with a ringing metal partial and a click of
    // contact. Each bounce of a ball plays it higher.
    ricochet: {seconds: .3, peak: .34, sample: (t: number, n: () => number) => {
        const phase = 2 * Math.PI * (1050 * t + 1550 * (1 - Math.exp(-14 * t)) / 14);
        return (Math.sin(phase) + .35 * Math.sin(2.76 * phase) * Math.exp(-t * 18) + n() * Math.exp(-t * 260) * .8) * Math.min(1, t * 900) * Math.exp(-t * 11);
    }},
} as const;
export type SynthCue = keyof typeof SYNTH;
let synthBuffers: Partial<Record<SynthCue, AudioBuffer>> = {};

function preload(ctx: AudioContext): Promise<void> {
    if (loading) return loading;
    const epoch = generation;
    loading = Promise.all(FILES.map(async cue => {
        try {
            const response = await fetch(`/sounds/incidents/${cue}.wav`);
            if (!response.ok) throw new Error(`${response.status}`);
            const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
            if (epoch === generation) buffers.set(cue, buffer);
        } catch (error) { console.warn(`Incident sound ${cue} could not load`, error); }
    })).then(() => { if (epoch === generation && buzzWanted) startCaseBuzz(true); });
    return loading;
}

function distanceGain(origin?: Vec3Data): number {
    return origin ? worldSoundGain(Math.hypot(origin.x-listener.x,origin.y-listener.y,origin.z-listener.z)) : 1;
}

/** `world` (a placed cue) joins the ranked mix: ducked under your hits and kills, sharing its voice budget. */
function playBuffer(buffer: AudioBuffer, volume: number, pitch = 1, world = false): void {
    const ctx = context;
    if (!ctx || ctx.state !== 'running' || voices.size >= MAX_VOICES) return;
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    const end = () => { voices.delete(source); source.disconnect(); gain.disconnect(); if (ranked) endWorldVoice(ctx, ranked); };
    const ranked = world ? {level: volume, cut: () => { source.onended = null; source.stop(); end(); }} : undefined;
    if (ranked && !admitWorldVoice(ctx, ranked)) return;
    source.buffer = buffer; source.playbackRate.value = pitch; gain.gain.value = volume;
    source.connect(gain); gain.connect(world ? worldOutput(ctx) : effectsOutput(ctx)); voices.set(source, end);
    source.onended = end;
    source.start();
}

/** A synthesized incident cue from `origin` (full volume without one); `pitch` under 1 plays it lower. */
export function playSynth(cue: SynthCue, origin?: Vec3Data, pitch = 1, volume = 1): void {
    const ctx = context; if (!ctx || ctx.state !== 'running' || voices.size >= MAX_VOICES) return;
    let buffer = synthBuffers[cue];
    if (!buffer) {
        const {seconds, peak, sample} = SYNTH[cue];
        buffer = synthBuffers[cue] = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
        const pcm = buffer.getChannelData(0);
        let seed = 7, max = 0;
        const noise = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; };
        for (let i = 0; i < pcm.length; i++) { pcm[i] = sample(i / ctx.sampleRate, noise); max = Math.max(max, Math.abs(pcm[i]!)); }
        if (max > 0) for (let i = 0; i < pcm.length; i++) pcm[i] = pcm[i]! * peak / max;
    }
    playBuffer(buffer, volume * distanceGain(origin), pitch, !!origin);
}

/** Bad Ammunition: a hiccuping ball stops dead in the air: the recorded cartoon mouth pop, pitched up into a HIC! */
export function playHic(origin?: Vec3Data): void {
    const buffer = buffers.get(`pop-${popVariant++ % 3}` as Cue);
    if (buffer) playBuffer(buffer, .9 * distanceGain(origin), 1.35 + Math.random() * .1, !!origin);
}

function stopSaw(): void {
    if (!saw) return;
    const old = saw; saw = undefined;
    old.source.onended = () => { old.source.disconnect(); old.gain.disconnect(); };
    const now = old.source.context.currentTime;
    old.gain.gain.cancelScheduledValues(now);
    old.gain.gain.setTargetAtTime(0, now, .015);
    old.source.stop(now + .08);
}

export function startCaseBuzz(active: boolean, origin?: Vec3Data): void {
    buzzWanted = active;
    if (!active) { stopSaw(); return; }
    // Keep the most recent distance when asynchronous loading starts the loop.
    if (origin) buzzVolume = CASE_BUZZ_VOLUME * distanceGain(origin);
    const ctx = context, buffer = buffers.get('case-saw');
    if (!ctx || ctx.state !== 'running' || !buffer) return;
    if (saw) {
        // Track the nearest case without scheduling a new ramp on every frame.
        if (Math.abs(saw.volume-buzzVolume) > .001) {
            saw.gain.gain.setTargetAtTime(buzzVolume,ctx.currentTime,.08);
            saw.volume = buzzVolume;
        }
        return;
    }
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = buffer; source.loop = true;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(buzzVolume, ctx.currentTime + .12);
    source.connect(gain); gain.connect(effectsOutput(ctx)); source.start(); saw = {source, gain, volume:buzzVolume};
}

export function bindIncidentAudio(next?: AudioContext, position?: Vec3Data): void {
    if (next && context !== next) {
        disposeIncidentAudio(); context = next; void preload(next);
    }
    if (position) { listener.x=position.x;listener.y=position.y;listener.z=position.z; }
    if (context?.state === 'suspended' && !previewMuted()) void context.resume().catch(() => {});
}

export function disposeIncidentAudio(): void {
    buzzWanted = false; stopSaw(); generation++;
    for (const [voice,end] of voices) { voice.onended=null;voice.stop();end(); }
    voices.clear(); buffers = new Map(); loading = undefined; context = undefined; synthBuffers = {};
    listener.x=listener.y=listener.z=0; buzzVolume=CASE_BUZZ_VOLUME;
}

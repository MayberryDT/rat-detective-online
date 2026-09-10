import type {Vec3Data} from '../shared/networkProtocol';
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
const voices = new Map<AudioBufferSourceNode, GainNode>();
let popVariant = 0;
let thudBuffer: AudioBuffer | undefined;

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

function playBuffer(buffer: AudioBuffer, volume: number, pitch = 1): void {
    const ctx = context;
    if (!ctx || ctx.state !== 'running' || voices.size >= MAX_VOICES) return;
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = buffer; source.playbackRate.value = pitch; gain.gain.value = volume;
    source.connect(gain); gain.connect(ctx.destination); voices.set(source,gain);
    source.onended = () => { voices.delete(source); source.disconnect(); gain.disconnect(); };
    source.start();
}

export function playDelayedThud(origin?: Vec3Data): void {
    const ctx = context; if (!ctx || ctx.state !== 'running' || voices.size >= MAX_VOICES) return;
    // Preserve the separate Delayed Reaction thud as a short rendered buffer.
    if (!thudBuffer) {
        thudBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * .18), ctx.sampleRate);
        const samples = thudBuffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) {
            const t = i / ctx.sampleRate;
            samples[i] = Math.sin(2 * Math.PI * (90 * t - 130 * t * t)) * Math.exp(-t * 28) * .16;
        }
    }
    playBuffer(thudBuffer, distanceGain(origin));
}

export function playPopcornPop(origin?: Vec3Data): void {
    const buffer = buffers.get(`pop-${popVariant++ % 3}` as Cue);
    if (buffer) playBuffer(buffer, .82 * distanceGain(origin), .97 + Math.random() * .06);
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
    source.connect(gain); gain.connect(ctx.destination); source.start(); saw = {source, gain, volume:buzzVolume};
}

export function bindIncidentAudio(next?: AudioContext, position?: Vec3Data): void {
    if (next && context !== next) {
        disposeIncidentAudio(); context = next; void preload(next);
    }
    if (position) { listener.x=position.x;listener.y=position.y;listener.z=position.z; }
    if (context?.state === 'suspended') void context.resume().catch(() => {});
}

export function disposeIncidentAudio(): void {
    buzzWanted = false; stopSaw(); generation++;
    for (const [voice,gain] of voices) { voice.onended=null;voice.stop();voice.disconnect();gain.disconnect(); }
    voices.clear(); buffers = new Map(); loading = undefined; context = undefined; thudBuffer = undefined;
    listener.x=listener.y=listener.z=0; buzzVolume=CASE_BUZZ_VOLUME;
}

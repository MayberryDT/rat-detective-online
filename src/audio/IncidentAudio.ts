/** Recorded and pre-rendered foley through the game's existing Web Audio context. */
const MAX_VOICES = 10;
const FILES = ['malfunction', 'pop-0', 'pop-1', 'pop-2', 'case-saw'] as const;
type Cue = typeof FILES[number];
let context: AudioContext | undefined;
let buffers = new Map<Cue, AudioBuffer>();
let loading: Promise<void> | undefined;
let generation = 0;
let buzzWanted = false;
let saw: {source: AudioBufferSourceNode; gain: GainNode} | undefined;
const voices = new Set<AudioBufferSourceNode>();
let popVariant = 0;

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

function play(cue: Cue, volume: number, pitch = 1): void {
    const ctx = context, buffer = buffers.get(cue);
    if (!ctx || ctx.state !== 'running' || !buffer || voices.size >= MAX_VOICES) return;
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = buffer; source.playbackRate.value = pitch; gain.gain.value = volume;
    source.connect(gain); gain.connect(ctx.destination); voices.add(source);
    source.onended = () => { voices.delete(source); source.disconnect(); gain.disconnect(); };
    source.start();
}

export function playMalfunctionShot(): void {
    play('malfunction', .72, .88 + Math.random() * .24);
}

export function playDelayedThud(): void {
    const ctx = context; if (!ctx || ctx.state !== 'running' || voices.size >= MAX_VOICES) return;
    // Preserve the separate Delayed Reaction thud as a short rendered buffer.
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * .18), ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
        const t = i / ctx.sampleRate;
        samples[i] = Math.sin(2 * Math.PI * (90 * t - 130 * t * t)) * Math.exp(-t * 28) * .16;
    }
    const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(ctx.destination);
    voices.add(source); source.onended = () => { voices.delete(source); source.disconnect(); }; source.start();
}

export function playPopcornPop(): void {
    play(`pop-${popVariant++ % 3}` as Cue, .82, .97 + Math.random() * .06);
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

export function startCaseBuzz(active: boolean): void {
    buzzWanted = active;
    if (!active) { stopSaw(); return; }
    const ctx = context, buffer = buffers.get('case-saw');
    if (saw || !ctx || ctx.state !== 'running' || !buffer) return;
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = buffer; source.loop = true;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(.19, ctx.currentTime + .12);
    source.connect(gain); gain.connect(ctx.destination); source.start(); saw = {source, gain};
}

export function bindIncidentAudio(next?: AudioContext): void {
    if (next && context !== next) {
        disposeIncidentAudio(); context = next; void preload(next);
    }
    if (context?.state === 'suspended') void context.resume().catch(() => {});
}

export function disposeIncidentAudio(): void {
    buzzWanted = false; stopSaw(); generation++;
    for (const voice of voices) { voice.stop(); voice.disconnect(); }
    voices.clear(); buffers = new Map(); loading = undefined; context = undefined;
}

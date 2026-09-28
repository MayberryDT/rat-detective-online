import { effectsOutput } from './PlayerAudioMix';
import * as THREE from 'three';
import type {LaunchMachine} from '../shared/chaosState';
import {worldSoundGain} from './worldSoundGain';

const VOLUME = .85 * .7;
const RANGE = 120;
const MAX_VOICES = 12;
type Voice = {pad: LaunchMachine['pad']; output: GainNode; pan: StereoPannerNode; volume: number; release: () => void};
/** `tell`: the half-second hang when full; `creak`/`pop`: strain accents while pressure builds. */
export type LauncherCue = 'tell' | 'fire' | 'creak' | 'pop';
type PressureLoop = {pad: LaunchMachine['pad']; output: GainNode; pan: StereoPannerNode; hum: OscillatorNode; filter: BiquadFilterNode; siren: OscillatorNode; sirenGain: GainNode; wobble: OscillatorNode; depth: GainNode};

/** Launcher cues, all attached to the machine in 3D: the pressure hum and danger
 * siren while a machine fills, strain creaks, the hang's rising whine and the
 * firing's mechanical impact with its air tail. */
export class LauncherAudio {
    private noiseBuffer?: AudioBuffer;
    private voices = new Set<Voice>();
    private ear = new THREE.Vector3();
    private disposed = false;
    constructor(private readonly audio?: AudioContext) {}

    private spatial(pad: LaunchMachine['pad'], camera: THREE.Camera): {volume: number; pan: number} {
        camera.getWorldPosition(this.ear);
        const dx = pad.x - this.ear.x, dy = pad.y + .13 - this.ear.y, dz = pad.z - this.ear.z;
        const distance = Math.hypot(dx, dy, dz), e = camera.matrixWorld.elements;
        return {
            volume: VOLUME * worldSoundGain(distance, Math.max(0, 1 - Math.max(0, distance - 8) / (RANGE - 8))),
            pan: Math.max(-.85, Math.min(.85, (dx * e[0] + dy * e[1] + dz * e[2]) / Math.max(1, distance))),
        };
    }

    update(camera?: THREE.Camera): void {
        for (const voice of this.voices) {
            const spatial = camera ? this.spatial(voice.pad, camera) : {volume: 0, pan: 0};
            if (spatial.volume !== voice.volume) {
                voice.output.gain.setTargetAtTime(spatial.volume, this.audio!.currentTime, .03);
                voice.volume = spatial.volume;
            }
            voice.pan.pan.value = spatial.pan;
        }
    }

    private noise(ctx: AudioContext): AudioBuffer {
        if (!this.noiseBuffer) {
            this.noiseBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 1.75), ctx.sampleRate);
            const data = this.noiseBuffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        }
        return this.noiseBuffer;
    }

    play(kind: LaunchMachine['kind'], pad: LaunchMachine['pad'], camera?: THREE.Camera, cue: LauncherCue = 'fire', boost = false): void {
        const ctx = this.audio;
        if (this.disposed || !ctx || ctx.state !== 'running' || !camera) return;
        const spatial = this.spatial(pad, camera);
        if (spatial.volume <= 0) return;
        if (this.voices.size >= MAX_VOICES) this.voices.values().next().value!.release();
        const now = ctx.currentTime;
        const pitch = {pressure:95,dumpster:65,freight:125,geyser:180,mousetrap:240,fan:75}[kind];
        const output = ctx.createGain(), pan = ctx.createStereoPanner();
        output.gain.value = spatial.volume; pan.pan.value = spatial.pan;
        output.connect(pan); pan.connect(effectsOutput(ctx));
        const nodes: AudioNode[] = [output, pan];
        const sources: AudioScheduledSourceNode[] = [];
        const tone = (type: OscillatorType, from: number, to: number, peak: number, attack: number, end: number, start = 0) => {
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.type = type; osc.frequency.setValueAtTime(from, now + start); osc.frequency.exponentialRampToValueAtTime(to, now + start + end * .7);
            gain.gain.setValueAtTime(.001, now); gain.gain.setValueAtTime(.001, now + start);
            gain.gain.linearRampToValueAtTime(peak, now + start + attack); gain.gain.exponentialRampToValueAtTime(.001, now + start + end);
            osc.connect(gain); gain.connect(output); nodes.push(osc, gain); sources.push(osc);
            osc.start(now); osc.stop(now + start + end + .05);
        };
        const hiss = (type: BiquadFilterType, from: number, to: number, peak: number, attack: number, hold: number, end: number, start = 0) => {
            const noise = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), air = ctx.createGain();
            noise.buffer = this.noise(ctx); filter.type = type;
            filter.frequency.setValueAtTime(from, now + start); filter.frequency.exponentialRampToValueAtTime(to, now + start + end);
            air.gain.setValueAtTime(.001, now); air.gain.setValueAtTime(.001, now + start);
            air.gain.linearRampToValueAtTime(peak, now + start + attack); air.gain.linearRampToValueAtTime(peak * .6, now + start + hold);
            air.gain.exponentialRampToValueAtTime(.001, now + start + end);
            noise.connect(filter); filter.connect(air); air.connect(output); nodes.push(noise, filter, air); sources.push(noise);
            noise.start(now); noise.stop(now + start + Math.min(1.74, end + .05));
            return noise;
        };
        let last: AudioScheduledSourceNode;
        if (cue === 'tell') {
            // Rising whine over a pressure rattle: the half second to scream and scramble.
            tone('sine', pitch * 3, pitch * 16, .26, .03, .55);
            tone('square', pitch * .5, pitch * .7, .14, .01, .5);
            last = hiss('bandpass', 900, 3200, .22, .05, .4, .55);
        } else if (cue === 'creak') {
            // Stressed metal: a slow groaning glide under a gritty rasp.
            tone('sawtooth', pitch * 1.4, pitch * .9, .2, .04, .45);
            last = hiss('bandpass', 500, 300, .12, .05, .2, .4);
        } else if (cue === 'pop') {
            // A rivet or bolt pinging loose.
            tone('triangle', 2600, 1700, .28, .001, .18);
            last = hiss('highpass', 4000, 3000, .15, .001, .01, .06);
        } else {
            tone(kind === 'mousetrap' ? 'triangle' : 'sawtooth', pitch * 2, 35, .65, .006, .85);
            last = hiss('lowpass', kind === 'geyser' ? 4200 : 2200, 180, .8, .0125, 1.15, 1.7);
            // Each machine's own voice on top of the shared impact and air tail.
            if (kind === 'mousetrap') { hiss('highpass', 3600, 1800, 1, .001, .02, .09); tone('triangle', 1900, 600, .5, .001, .07); }
            else if (kind === 'dumpster') { tone('sine', 72, 38, .9, .004, .5); tone('square', 420, 405, .14, .004, .55, .01); tone('square', 633, 610, .1, .004, .45, .01); }
            else if (kind === 'geyser') hiss('highpass', 5200, 2600, .7, .05, 1.3, 1.7);
            else if (kind === 'freight') { tone('square', 180, 172, .24, .003, .35); tone('square', 272, 262, .18, .003, .3, .07); tone('square', 181, 176, .16, .003, .25, .16); }
            else if (kind === 'fan') { hiss('lowpass', 700, 260, .9, .18, 1.3, 1.7); tone('sawtooth', 45, 62, .2, .2, 1.5); }
            if (boost) {
                // Overpressure: a blown gasket shriek and a second, lower bang.
                tone('sawtooth', pitch * 6, pitch * 1.5, .3, .01, .7, .05);
                tone('square', 70, 28, .5, .004, .5, .12);
            }
        }
        const voice: Voice = {pad, output, pan, volume: spatial.volume, release: () => {
            if (!this.voices.delete(voice)) return;
            last.onended = null;
            for (const source of sources) { try { source.stop(); } catch { /* Already ended. */ } }
            for (const node of nodes) node.disconnect();
        }};
        this.voices.add(voice); last.onended = voice.release;
    }

    private readonly loops = new Map<string, PressureLoop>();
    /** The building-pressure bed for one machine: a hum that climbs with `level`
     * (0…1) and a siren that swells with `danger`. Silent (and released) at zero. */
    setPressure(id: string, pad: LaunchMachine['pad'], level: number, danger: number, camera?: THREE.Camera): void {
        const ctx = this.audio;
        let loop = this.loops.get(id);
        const spatial = camera && !this.disposed && ctx?.state === 'running' ? this.spatial(pad, camera) : {volume: 0, pan: 0};
        const audible = level > .02 && spatial.volume > 0;
        if (!audible) {
            if (loop) {this.loops.delete(id); for (const node of [loop.hum, loop.siren, loop.wobble]) { try { node.stop(); } catch { /* Stopped. */ } }
                for (const node of [loop.hum, loop.filter, loop.siren, loop.sirenGain, loop.wobble, loop.depth, loop.output, loop.pan]) node.disconnect();}
            return;
        }
        if (!loop) {
            const output = ctx!.createGain(), pan = ctx!.createStereoPanner(), hum = ctx!.createOscillator(), filter = ctx!.createBiquadFilter();
            const siren = ctx!.createOscillator(), sirenGain = ctx!.createGain(), wobble = ctx!.createOscillator(), depth = ctx!.createGain();
            hum.type = 'sawtooth'; filter.type = 'lowpass'; filter.Q.value = 4; siren.type = 'sine'; wobble.frequency.value = 3.2; depth.gain.value = 140;
            hum.connect(filter); filter.connect(output); siren.connect(sirenGain); sirenGain.connect(output); wobble.connect(depth); depth.connect(siren.frequency);
            output.gain.value = 0; sirenGain.gain.value = 0; output.connect(pan); pan.connect(effectsOutput(ctx!));
            hum.start(); siren.start(); wobble.start();
            loop = {pad, output, pan, hum, filter, siren, sirenGain, wobble, depth}; this.loops.set(id, loop);
        }
        const at = ctx!.currentTime;
        loop.hum.frequency.setTargetAtTime(38 + level * 110, at, .08);
        loop.filter.frequency.setTargetAtTime(180 + level * 1400, at, .08);
        loop.siren.frequency.setTargetAtTime(620 + danger * 260, at, .1);
        loop.sirenGain.gain.setTargetAtTime(danger * .22, at, .08);
        loop.output.gain.setTargetAtTime(spatial.volume * (.12 + level * .35), at, .05);
        loop.pan.pan.value = spatial.pan;
    }

    dispose(): void {
        this.disposed = true;
        for (const voice of this.voices) voice.release();
        for (const id of [...this.loops.keys()]) this.setPressure(id, this.loops.get(id)!.pad, 0, 0);
        this.noiseBuffer = undefined;
    }
}

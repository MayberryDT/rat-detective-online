import { effectsOutput } from './PlayerAudioMix';
import * as THREE from 'three';
import type {LaunchMachine} from '../shared/chaosState';
import {worldSoundGain} from './worldSoundGain';

const VOLUME = .85 * .7;
const RANGE = 120;
const MAX_VOICES = 12;
type Voice = {pad: LaunchMachine['pad']; output: GainNode; pan: StereoPannerNode; volume: number; release: () => void};

/** Mechanical impact and air tail, both attached to the launcher in 3D. */
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

    play(kind: LaunchMachine['kind'], pad: LaunchMachine['pad'], camera?: THREE.Camera): void {
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
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = kind === 'mousetrap' ? 'triangle' : 'sawtooth';
        osc.frequency.setValueAtTime(pitch * 2, now); osc.frequency.exponentialRampToValueAtTime(35, now + .6);
        gain.gain.setValueAtTime(.001, now); gain.gain.linearRampToValueAtTime(.65, now + .006); gain.gain.exponentialRampToValueAtTime(.001, now + .85);
        osc.connect(gain); gain.connect(output);
        const noise = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), air = ctx.createGain();
        if (!this.noiseBuffer) {
            this.noiseBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 1.75), ctx.sampleRate);
            const data = this.noiseBuffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        }
        noise.buffer = this.noiseBuffer; filter.type = 'lowpass';
        filter.frequency.setValueAtTime(kind === 'geyser' ? 4200 : 2200, now); filter.frequency.exponentialRampToValueAtTime(180, now + 1.65);
        air.gain.setValueAtTime(.001, now); air.gain.linearRampToValueAtTime(.8, now + .0125); air.gain.linearRampToValueAtTime(.5, now + 1.15); air.gain.exponentialRampToValueAtTime(.001, now + 1.7);
        noise.connect(filter); filter.connect(air); air.connect(output);
        const voice: Voice = {pad, output, pan, volume: spatial.volume, release: () => {
            if (!this.voices.delete(voice)) return;
            noise.onended = null;
            for (const source of [noise, osc]) { try { source.stop(); } catch { /* Already ended. */ } }
            for (const node of [noise, filter, air, osc, gain, output, pan]) node.disconnect();
        }};
        this.voices.add(voice); noise.onended = voice.release;
        osc.start(); osc.stop(now + .9); noise.start(); noise.stop(now + 1.75);
    }

    dispose(): void {
        this.disposed = true;
        for (const voice of this.voices) voice.release();
        this.noiseBuffer = undefined;
    }
}

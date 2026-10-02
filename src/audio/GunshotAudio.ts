import * as THREE from 'three';
import type { Vec3Data } from '../shared/networkProtocol';
import { AudioVoicePool } from './AudioVoicePool';
import { admitWorldVoice, endWorldVoice, type WorldVoice } from './PlayerAudioMix';
import { worldSoundGain as gunshotGain } from './worldSoundGain';
export { worldSoundGain as gunshotGain } from './worldSoundGain';

const MAX_VOICES = 12;
export const GUNSHOT_VOLUME = .4;
/** Single Thompson rounds cut from a CC0 recording (scripts/generate-feedback-sounds.py, public/sounds/weapons/README.md). */
const TOMMY_ROUNDS = 4;
/** `shotgun`: Scattershot's own five-ball cheese blast (`scattershot.wav`, the same generator). */
export type GunshotCue = 'normal' | 'malfunction' | 'tommy' | 'shotgun';

type Voice = WorldVoice & { sound: THREE.Audio; priority: number };
/** Independent, bounded voices keep distant AI from cutting off your own pistol. */
export class GunshotAudio {
    private buffer?: AudioBuffer;
    private scatter?: AudioBuffer;
    private readonly tommy: AudioBuffer[] = [];
    private round = 0;
    private readonly pool: AudioVoicePool;
    private readonly voices = new Set<Voice>();
    private readonly ear = new THREE.Vector3();
    private disposed = false;
    constructor(private readonly listener: THREE.AudioListener) {
        this.pool = new AudioVoicePool(listener, MAX_VOICES);
        const loader = new THREE.AudioLoader();
        loader.load('/sounds/gunshot.mp3', buffer => { if (!this.disposed) this.buffer = buffer; }, undefined,
            () => { if (!this.disposed) console.warn('Gunshot sound could not load'); });
        for (let i = 0; i < TOMMY_ROUNDS; i++) loader.load(`/sounds/weapons/tommy-${i}.wav`, buffer => { if (!this.disposed) this.tommy.push(buffer); }, undefined,
            () => { if (!this.disposed) console.warn('Tommy Gun sound could not load'); });
        loader.load('/sounds/weapons/scattershot.wav', buffer => { if (!this.disposed) this.scatter = buffer; }, undefined,
            () => { if (!this.disposed) console.warn('Scattershot sound could not load'); });
    }
    play(origin: Vec3Data, local: boolean, cue: GunshotCue): void {
        // The Tommy Gun rotates its recorded rounds so a held burst never machine-guns one sample.
        const buffer = cue === 'tommy' ? this.tommy[this.round++ % Math.max(1, this.tommy.length)] : cue === 'shotgun' ? this.scatter : this.buffer;
        if (this.disposed || !buffer || this.listener.context.state !== 'running') return;
        this.listener.getWorldPosition(this.ear);
        const gain = local ? 1 : gunshotGain(Math.hypot(origin.x-this.ear.x, origin.y-this.ear.y, origin.z-this.ear.z));
        if (gain < .001) return;
        const priority = local ? 2 : gain;
        if (this.voices.size >= MAX_VOICES) {
            let quietest = this.voices.values().next().value!;
            for (const voice of this.voices) if (voice.priority < quietest.priority) quietest = voice;
            if (quietest.priority > priority) return;
            this.release(quietest);
        }
        // Match the local gun's global playback, including when firing behind you. Other rats' shots are world
        // voices: ducked under your hits and kills, and sharing the ranked mix's budget.
        const sound = this.pool.acquire(!local);
        if (!sound) return;
        const voice: Voice = {sound, priority, level: GUNSHOT_VOLUME * gain, cut: () => this.release(voice)};
        if (!local && !admitWorldVoice(this.listener.context, voice)) { this.pool.release(sound); return; }
        sound.setBuffer(buffer);
        sound.setVolume(GUNSHOT_VOLUME * gain);
        sound.setPlaybackRate(cue === 'malfunction' ? 1.45 : cue === 'tommy' || cue === 'shotgun' ? .95 + Math.random() * .1 : 1);
        sound.onEnded = () => { this.pool.finish(sound); this.voices.delete(voice); endWorldVoice(this.listener.context, voice); };
        this.voices.add(voice);
        try { sound.play(); }
        catch { this.release(voice); }
    }
    private release(voice: Voice): void {
        if (!this.voices.delete(voice)) return;
        endWorldVoice(this.listener.context, voice);
        this.pool.release(voice.sound);
    }
    dispose(): void {
        this.disposed = true;
        for (const voice of this.voices) this.release(voice);
        this.pool.dispose();
        this.buffer = this.scatter = undefined; this.tommy.length = 0;
    }
}

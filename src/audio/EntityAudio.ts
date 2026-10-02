import * as THREE from 'three';
import type { Vec3Data } from '../shared/networkProtocol';
import { worldSoundGain } from './worldSoundGain';
import { AudioVoicePool } from './AudioVoicePool';
import { admitWorldVoice, endWorldVoice, type WorldVoice } from './PlayerAudioMix';

type SoundName = 'ratHit' | 'ratDeath' | 'playerHit';
const paths: Record<SoundName, string> = { ratHit: '/sounds/rathit.mp3', ratDeath: '/sounds/ratdeath.mp3', playerHit: '/sounds/playerhit.mp3' };
let listener: THREE.AudioListener | null = null;
let generation = 0;
const buffers = new Map<SoundName, AudioBuffer>();
/** Each playing sound, with its ranked-mix world voice when it came from another rat. */
const playing = new Map<THREE.Audio, WorldVoice | undefined>();
const MAX_ENTITY_VOICES = 12;
const ear = new THREE.Vector3();
let pool: AudioVoicePool | undefined;

function stop(sound: THREE.Audio): void {
    if (!playing.has(sound)) return;
    const voice = playing.get(sound); playing.delete(sound);
    if (voice && listener) endWorldVoice(listener.context, voice);
    pool?.release(sound);
}

export function initEntitySounds(next: THREE.AudioListener): void {
    if (listener === next) return;
    disposeEntitySounds();
    listener = next;
    pool = new AudioVoicePool(next, MAX_ENTITY_VOICES);
    const current = generation;
    const loader = new THREE.AudioLoader();
    for (const [name, path] of Object.entries(paths)) {
        loader.load(path, buffer => {
            if (current === generation && listener === next) buffers.set(name as SoundName, buffer);
        }, undefined, () => {
            if (current === generation) console.warn(`Could not load sound: ${path}`);
        });
    }
}

/** Omit origin for your own reactions; world reactions share the distance mix. */
export function playEntitySound(name: SoundName, volume = 0.5, origin?: Vec3Data): void {
    const buffer = buffers.get(name);
    // Hits during a suspended context should not queue up and burst on unlock.
    if (!buffer || !listener || !pool || listener.context.state !== 'running') return;
    let gain = 1;
    if (origin) {
        listener.getWorldPosition(ear);
        gain = worldSoundGain(Math.hypot(origin.x - ear.x, origin.y - ear.y, origin.z - ear.z));
    }
    if (gain === 0) return;
    if (playing.size >= MAX_ENTITY_VOICES) stop(playing.keys().next().value!);
    // Other rats' hits and deaths are world voices: ducked under your hits and kills, sharing the ranked budget.
    const sound = pool.acquire(!!origin);
    if (!sound) return;
    const voice = origin ? {level: volume * gain, cut: () => stop(sound)} : undefined;
    if (voice && !admitWorldVoice(listener.context, voice)) { pool.release(sound); return; }
    sound.setBuffer(buffer);
    sound.setVolume(volume * gain);
    const ownerPool = pool, context = listener.context;
    sound.onEnded = () => {
        ownerPool.finish(sound);
        if (voice) endWorldVoice(context, voice);
        playing.delete(sound);
    };
    playing.set(sound, voice);
    try { sound.play(); } catch { stop(sound); }
}

export function playHitSound(): void { playEntitySound('ratHit', 0.5); }
export function playPlayerHitSound(): void { playEntitySound('playerHit', 0.6); }

export function disposeEntitySounds(): void {
    generation++;
    if (listener) for (const voice of playing.values()) if (voice) endWorldVoice(listener.context, voice);
    pool?.dispose(); pool = undefined;
    playing.clear();
    buffers.clear();
    listener = null;
}

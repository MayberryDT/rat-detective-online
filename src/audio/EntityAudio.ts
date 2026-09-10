import * as THREE from 'three';
import type { Vec3Data } from '../shared/networkProtocol';
import { worldSoundGain } from './worldSoundGain';
import { AudioVoicePool } from './AudioVoicePool';

type SoundName = 'ratHit' | 'ratDeath' | 'playerHit';
const paths: Record<SoundName, string> = { ratHit: '/sounds/rathit.mp3', ratDeath: '/sounds/ratdeath.mp3', playerHit: '/sounds/playerhit.mp3' };
let listener: THREE.AudioListener | null = null;
let generation = 0;
const buffers = new Map<SoundName, AudioBuffer>();
const playing = new Set<THREE.Audio>();
const MAX_ENTITY_VOICES = 12;
const ear = new THREE.Vector3();
let pool: AudioVoicePool | undefined;

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

/** Omit origin for your own reactions; remote rats share the gun's mild fade. */
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
    if (playing.size >= MAX_ENTITY_VOICES) {
        const oldest = playing.values().next().value!;
        pool.release(oldest);
        playing.delete(oldest);
    }
    const sound = pool.acquire();
    if (!sound) return;
    sound.setBuffer(buffer);
    sound.setVolume(volume * gain);
    const ownerPool = pool;
    sound.onEnded = () => {
        ownerPool.finish(sound);
        playing.delete(sound);
    };
    playing.add(sound);
    try { sound.play(); } catch {
        playing.delete(sound);
        pool.release(sound);
    }
}

export function playHitSound(): void { playEntitySound('ratHit', 0.5); }
export function playPlayerHitSound(): void { playEntitySound('playerHit', 0.6); }

export function disposeEntitySounds(): void {
    generation++;
    pool?.dispose(); pool = undefined;
    playing.clear();
    buffers.clear();
    listener = null;
}

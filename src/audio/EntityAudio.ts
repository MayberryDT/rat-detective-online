import * as THREE from 'three';

type SoundName = 'ratHit' | 'ratDeath' | 'playerHit';
const paths: Record<SoundName, string> = { ratHit: '/sounds/rathit.mp3', ratDeath: '/sounds/ratdeath.mp3', playerHit: '/sounds/playerhit.mp3' };
let listener: THREE.AudioListener | null = null;
let generation = 0;
const buffers = new Map<SoundName, AudioBuffer>();
const playing = new Set<THREE.Audio>();

export function initEntitySounds(next: THREE.AudioListener): void {
    if (listener === next) return;
    disposeEntitySounds();
    listener = next;
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

export function playEntitySound(name: SoundName, volume = 0.5): void {
    const buffer = buffers.get(name);
    if (!buffer || !listener) return;
    const sound = new THREE.Audio(listener);
    sound.setBuffer(buffer);
    sound.setVolume(volume);
    const ended = sound.onEnded.bind(sound);
    sound.onEnded = () => {
        ended();
        sound.disconnect();
        playing.delete(sound);
    };
    playing.add(sound);
    try { sound.play(); } catch {
        playing.delete(sound);
        sound.disconnect();
    }
}

export function playHitSound(): void { playEntitySound('ratHit', 0.5); }
export function playPlayerHitSound(): void { playEntitySound('playerHit', 0.6); }

export function disposeEntitySounds(): void {
    generation++;
    for (const sound of playing) {
        if (sound.isPlaying) sound.stop();
        sound.disconnect();
    }
    playing.clear();
    buffers.clear();
    listener = null;
}

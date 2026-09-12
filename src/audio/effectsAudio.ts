import { previewMuted } from './previewMuted';

let context: AudioContext | undefined;

/** Native Web Audio graph used by later Three.js effects.
 * Created during a real title gesture so Chrome/Brave allow it to run. */
export function unlockEffectsAudio(): void {
    if (typeof window === 'undefined' || previewMuted()) return;
    try {
        context ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        if (context.state === 'suspended') void context.resume().catch(() => {});
    } catch {
        /* Tests and browsers without Web Audio skip the effects graph. */
    }
}

export function effectsAudioContext(): AudioContext | undefined {
    return context;
}

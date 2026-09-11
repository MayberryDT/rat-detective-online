/** Opt-in silence for local agent playtests, without changing the public mix. */
export function previewMuted(): boolean {
    return typeof window !== 'undefined' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(window.location?.hostname ?? '') &&
        new URLSearchParams(window.location.search).get('mute') === '1';
}

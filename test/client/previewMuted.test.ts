import { afterEach, expect, it, vi } from 'vitest';
import { previewMuted } from '../../src/audio/previewMuted';

afterEach(() => vi.unstubAllGlobals());

it('mutes only explicitly requested loopback previews, preserving the public mix', () => {
    for (const [hostname, search, expected] of [
        ['127.0.0.1', '?mute=1', true], ['localhost', '?mute=1', true],
        ['[::1]', '?mute=1', true], ['127.0.0.1', '', false],
        ['127.0.0.1', '?mute=0', false], ['ratdetective.online', '?mute=1', false],
    ] as const) {
        vi.stubGlobal('window', { location: { hostname, search } });
        expect(previewMuted()).toBe(expected);
    }
});

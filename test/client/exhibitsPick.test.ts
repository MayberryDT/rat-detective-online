import {describe, expect, it} from 'vitest';
import {pickExhibits} from '../../src/ui/Exhibits';
import type {ReplayClip} from '../../src/replay/types';
import type {HighlightKind} from '../../src/shared/highlights';

const clip = (id: string, kind: HighlightKind, score: number, actors: string[]): ReplayClip => ({
    id, kind, score, actors, names: {}, involvesLocal: actors.includes('me'), at: 0, startAt: 0, endAt: 0, p: {x: 0, y: 0, z: 0},
});

describe('pickExhibits', () => {
    it('keeps your best moment even when three better ones from others exist', () => {
        const picked = pickExhibits([
            clip('a', 'pileup', 90, ['bot1', 'bot2']), clip('b', 'sent-flying', 80, ['bot2', 'bot3']),
            clip('c', 'splashdown', 70, ['bot3']), clip('d', 'delivery', 10, ['me']), clip('e', 'long-shot', 5, ['me', 'bot1']),
        ], 'me');
        expect(picked.map(c => c.id)).toEqual(['a', 'b', 'd']);
    });

    it('shows at most one exhibit of each kind, and your moment takes its kind', () => {
        const picked = pickExhibits([
            clip('a', 'multi-kill', 90, ['bot1']), clip('b', 'multi-kill', 80, ['me']), clip('c', 'multi-kill', 70, ['bot2']), clip('d', 'pileup', 10, ['bot2']),
        ], 'me');
        expect(picked.map(c => c.id)).toEqual(['b', 'd']);
    });

    it('shows what there is when the round had fewer than three moments, and nothing when it had none', () => {
        expect(pickExhibits([clip('a', 'delivery', 3, ['bot1'])], 'me').map(c => c.id)).toEqual(['a']);
        expect(pickExhibits([], 'me')).toEqual([]);
    });
});

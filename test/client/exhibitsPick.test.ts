import {describe, expect, it} from 'vitest';
import {pickExhibits} from '../../src/ui/Exhibits';
import {sharedExhibits} from '../../src/replay/ReplayRecorder';
import type {ReplayClip} from '../../src/replay/types';
import type {HighlightKind} from '../../src/shared/highlights';

const clip = (id: string, kind: HighlightKind, score: number, actors: string[], at = 0): ReplayClip => ({
    id, kind, score, actors, names: {}, involvesLocal: actors.includes('me'), at, startAt: 0, endAt: 0, p: {x: 0, y: 0, z: 0},
});
const shown = (clips: ReplayClip[], myId: string, shared = sharedExhibits(clips)) => pickExhibits(clips, shared, myId).map(e => `${e.letter}:${e.clip.id}`);

describe('sharedExhibits', () => {
    it('picks the best three, one per kind (so at most one sent flying), ties by time then id', () => {
        expect(sharedExhibits([
            clip('a', 'sent-flying', 90, []), clip('b', 'sent-flying', 85, []), clip('c', 'pileup', 70, [], 5), clip('d', 'squashed', 70, [], 2), clip('e', 'delivery', 60, []),
        ])).toEqual(['a', 'd', 'c']);
        expect(sharedExhibits([clip('z', 'delivery', 10, [], 1), clip('y', 'pileup', 10, [], 1)])).toEqual(['y', 'z']);
    });
});

describe('pickExhibits', () => {
    const round = [
        clip('a', 'pileup', 90, ['bot1', 'bot2']), clip('b', 'sent-flying', 80, ['bot2', 'bot3']),
        clip('c', 'splashdown', 70, ['bot3']), clip('d', 'delivery', 10, ['me']), clip('e', 'long-shot', 5, ['me', 'bot1']),
    ];

    it('shows everyone the same A, B, C, and your best other moment as D', () => {
        expect(shown(round, 'me')).toEqual(['A:a', 'B:b', 'C:c', 'D:d']);
        expect(shown(round, 'bot9')).toEqual(['A:a', 'B:b', 'C:c']);
    });

    it('adds no D when your best moment is already shared', () => {
        expect(shown(round, 'bot3')).toEqual(['A:a', 'B:b', 'C:c']);
    });

    it('keeps the shared letters when this client has no clip of one', () => {
        const shared = sharedExhibits(round);
        expect(shown(round.filter(c => c.id !== 'b'), 'bot9', shared)).toEqual(['A:a', 'C:c']);
    });

    it('shows what there is when the round had fewer than three moments, and nothing when it had none', () => {
        expect(shown([clip('a', 'delivery', 3, ['bot1'])], 'me')).toEqual(['A:a']);
        expect(pickExhibits([], [], 'me')).toEqual([]);
    });
});

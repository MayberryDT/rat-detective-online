import { describe, expect, it } from 'vitest';
import { consumePublicInvitation, isPublicRoomName, isRoomInPool, publicInvitationUrl, publicRoomLabel, readPublicInvitation } from '../../src/network/publicInvitation';

const overflow='public-live-v2-12345678-1234-4123-8123-123456789abc';

describe('public dispatch invitations',()=>{
    it('accepts only the canonical public room and matchmaker UUID overflow rooms',()=>{
        expect(isPublicRoomName('public-live-v2')).toBe(true);
        expect(isPublicRoomName(overflow)).toBe(true);
        for(const room of ['public-live-v2-overflow','public-live-v2-1234','graybox-practice-review',
            'public-live-v2-12345678-1234-7123-8123-123456789abc','PUBLIC-LIVE-V2']) {
            expect(isPublicRoomName(room)).toBe(false);
        }
    });

    it('builds a canonical share URL and reports malformed invitation intent',()=>{
        expect(publicInvitationUrl(overflow)).toBe(`https://ratdetective.online/?preferred=${overflow}`);
        expect(publicInvitationUrl('graybox-practice-review')).toBeUndefined();
        expect(readPublicInvitation(`?preferred=${overflow}`)).toEqual({requestedRoom:overflow,invalid:false});
        expect(readPublicInvitation('?preferred=graybox-practice-review')).toEqual({invalid:true});
        expect(readPublicInvitation('')).toEqual({invalid:false});
    });

    it('uses compact public labels and consumes only the invitation parameter',()=>{
        expect(publicRoomLabel('public-live-v2')).toBe('Public city');
        expect(publicRoomLabel(overflow)).toBe('City 12345678');
        let page=new URL(`https://ratdetective.online/play?mute=1&preferred=${overflow}&diagnostics=quiet#case`);
        const target={
            location:{get href(){return page.href;}},
            history:{state:{kept:true},replaceState:(_state:unknown,_unused:string,next:string|URL|null)=>{page=new URL(String(next),page);}},
        } as unknown as Pick<Window,'location'|'history'>;
        consumePublicInvitation(target);
        expect(page.href).toBe('https://ratdetective.online/play?mute=1&diagnostics=quiet#case');
    });

    it('keeps saved resume rooms inside their original pool',()=>{
        expect(isRoomInPool(overflow,'public-live-v2')).toBe(true);
        expect(isRoomInPool('graybox-benchmark-match-a-overflow','public-live-v2')).toBe(false);
        expect(isRoomInPool('graybox-benchmark-match-a-overflow','graybox-benchmark-match-a')).toBe(true);
    });
});

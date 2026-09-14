import { afterEach, expect, it, vi } from 'vitest';
import { loadTitleWorld } from '../../src/session/titleWorld';

afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
const url='wss://ratdetective.online/ws?chaos=compact-v2';
it('prepares the authoritative public world with HTTP, without entering a lobby',async()=>{
    const fetcher=vi.fn(async(_url:URL,_init:RequestInit)=>Response.json({room:'public-live-v2',world:{seed:341283204,version:2}}));
    vi.stubGlobal('fetch',fetcher);
    expect(await loadTitleWorld(undefined,url)).toEqual({seed:341283204,version:2});
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0].toString()).toBe('https://ratdetective.online/status');
    expect(fetcher.mock.calls[0][1]).toMatchObject({cache:'no-store'});
});
it('does not prepare an unrelated public map for explicit private rooms',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    expect(await loadTitleWorld(undefined,url+'&room=graybox-practice-test')).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
});
it('does not warm the canonical room for an overflow invitation',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    const room='public-live-v2-12345678-1234-4123-8123-123456789abc';
    expect(await loadTitleWorld(undefined,`${url}&preferred=${room}`)).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
});
it('falls back safely for legacy, malformed, mismatched or unavailable metadata',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    for(const data of [{}, {room:'other',world:{seed:1,version:2}}, {room:'public-live-v2',world:{seed:-1,version:2}}, {room:'public-live-v2',world:{seed:1,version:9}}]){
        fetcher.mockResolvedValueOnce(Response.json(data));
        expect(await loadTitleWorld(undefined,url)).toBeUndefined();
    }
    fetcher.mockRejectedValueOnce(new Error('offline'));
    expect(await loadTitleWorld(undefined,url)).toBeUndefined();
    fetcher.mockResolvedValueOnce(new Response(null,{status:503}));
    expect(await loadTitleWorld(undefined,url)).toBeUndefined();
});
it('bounds preparation and cancels it when the page leaves',async()=>{
    vi.useFakeTimers();
    const fetcher=vi.fn((_url:unknown,{signal}:{signal:AbortSignal})=>new Promise<Response>((_resolve,reject)=>{
        signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
    }));
    vi.stubGlobal('fetch',fetcher);
    const timed=loadTitleWorld(undefined,url);
    await vi.advanceTimersByTimeAsync(1500);
    expect(await timed).toBeUndefined();expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    const page=new AbortController(),leaving=loadTitleWorld(page.signal,url);page.abort();
    expect(await leaving).toBeUndefined();expect(vi.getTimerCount()).toBe(0);
    expect(await loadTitleWorld(page.signal,url)).toBeUndefined();expect(fetcher).toHaveBeenCalledTimes(2);
});

it('warms the exact hosted private pool instead of building the public or placeholder city',async()=>{
    const room='graybox-benchmark-match-pickups';
    const fetcher=vi.fn(async(_url:URL)=>Response.json({room,world:{seed:341283204,version:2}}));vi.stubGlobal('fetch',fetcher);
    expect(await loadTitleWorld(undefined,`ws://127.0.0.1:5193/ws?room=${room}`)).toEqual({seed:341283204,version:2});
    expect(String(fetcher.mock.calls[0][0])).toBe(`http://127.0.0.1:5193/status?room=${room}`);
});

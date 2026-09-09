import {describe,expect,it} from 'vitest';
import worker from '../../src/worker/index';

describe('canonical public domain',()=>{
    it('redirects the old hostname including asset paths and query strings before routing',async()=>{
        const response=await worker.fetch(new Request('https://rat-detective.animasai.co/assets/game.js?version=2'),{} as Env);
        expect(response.status).toBe(301);
        expect(response.headers.get('location')).toBe('https://ratdetective.online/assets/game.js?version=2');
    });
    it('keeps health checks on the new domain local',async()=>{
        const response=await worker.fetch(new Request('https://ratdetective.online/health'),{} as Env);
        expect(response.status).toBe(200);
        expect(response.headers.has('location')).toBe(false);
    });
});

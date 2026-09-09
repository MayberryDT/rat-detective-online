import { describe, expect, it, vi } from 'vitest';
import { BotNavigation } from '../../src/shared/BotNavigation';
import { CITY_PREVIEW_SEED, GRAYBOX_VERSION } from '../../src/shared/grayboxLayout';
import type { Vec3Data } from '../../src/shared/networkProtocol';

const spec={seed:CITY_PREVIEW_SEED,version:GRAYBOX_VERSION};
function solve(nav:BotNavigation,from:Vec3Data,to:Vec3Data) {
    let route=nav.route(from,to);
    for(let i=0;i<400&&!route.length;i++){nav.update(20);route=nav.route(from,to);}
    return route;
}
describe('geometry-aware bot navigation',()=>{
    it('limits graph work even when the runtime clock does not advance',()=>{
        const nav=new BotNavigation(spec);
        const from={x:-16,y:0,z:-30},to={x:-36,y:8,z:-76};
        nav.route(from,to);
        const clock=vi.spyOn(performance,'now').mockReturnValue(100);
        const neighbors=vi.spyOn(nav as unknown as {neighbors(node:unknown):unknown},'neighbors');
        try {
            nav.update(20,1);
            expect(neighbors.mock.calls.length).toBeLessThanOrEqual(1);
            expect(nav.route(from,to)).toEqual([]);
        } finally {clock.mockRestore();neighbors.mockRestore();}
        expect(solve(nav,from,to).length).toBeGreaterThan(15);
    });
    it('enters a sewer pipe and follows its slope to the underground hall',()=>{
        const nav=new BotNavigation(spec);
        const path=solve(nav,{x:146,y:0,z:0},{x:90,y:-7,z:0});
        expect(path.length).toBeGreaterThan(12);
        expect(path.some(p=>p.y < -1&&p.y > -6)).toBe(true);
        expect(path.at(-1)?.y).toBeCloseTo(-7);
        for(let i=1;i<path.length;i++)expect(Math.abs(path[i].y-path[i-1].y)).toBeLessThan(1.2);
    });
    it('routes from the street through Records Hall and up its actual staircase',()=>{
        const nav=new BotNavigation(spec);
        const path=solve(nav,{x:-16,y:0,z:-30},{x:-36,y:8,z:-76});
        expect(path.length).toBeGreaterThan(15);
        expect(path.some(p=>p.x < -33&&p.x > -40&&p.y >1&&p.y<7)).toBe(true);
        expect(path.at(-1)?.y).toBeCloseTo(8);
        for(let i=1;i<path.length;i++)expect(Math.abs(path[i].y-path[i-1].y)).toBeLessThan(1.2);
    });
    it('includes varied underground and upper-floor exploration destinations',()=>{
        const targets=new BotNavigation(spec).explorationTargets();
        expect(targets.filter(p=>p.y===-7).length).toBeGreaterThan(10);
        expect(targets.some(p=>p.y===16)).toBe(true);
        expect(targets.some(p=>p.y===0)).toBe(true);
    });
});

it('shares one bounded reverse field for eleven rats chasing the same live city case',()=>{
    const nav=new BotNavigation({version:GRAYBOX_VERSION,seed:341283204});
    const goal={x:69,y:0,z:6};
    const starts=[[-187,-57],[10,-47],[52,132],[-103,-108],[140,-44],[-172,-184],
        [160,-138],[162,160],[-92,28],[-52,140],[4,-172]].map(([x,z])=>({x,y:0,z}));
    const fields=(nav as unknown as {fields:Map<string,unknown>}).fields;
    const clock=vi.spyOn(performance,'now').mockReturnValue(100);
    const neighbors=vi.spyOn(nav as unknown as {neighbors(node:unknown):unknown},'neighbors');
    const found=new Map<number,Vec3Data[]>();
    try {
        // Six seconds at 60 updates/sec, including a frozen Worker clock. New
        // start positions still reuse the same destination field rather than
        // adding eleven new abandoned searches each time the bots move.
        for(let tick=0;tick<360;tick++) {
            starts.forEach((start,index)=>{
                if(found.has(index))return;
                const path=nav.route(start,goal);if(path.length)found.set(index,path);
            });
            nav.update(2,96);
        }
        expect(fields.size).toBe(1);
        expect(neighbors.mock.calls.length).toBeLessThanOrEqual(360*96);
        expect(found.size).toBe(11);
        for(const path of found.values()) {
            expect(Math.hypot(path.at(-1)!.x-goal.x,path.at(-1)!.z-goal.z)).toBeLessThanOrEqual(2);
            for(let i=1;i<path.length;i++) {
                expect(Math.hypot(path[i].x-path[i-1].x,path[i].z-path[i-1].z)).toBeLessThanOrEqual(Math.SQRT2*2+.001);
                expect(Math.abs(path[i].y-path[i-1].y)).toBeLessThan(1.2);
            }
        }
    } finally {clock.mockRestore();neighbors.mockRestore();}
});

it('checks local body clearance and floor support rather than aiming through a wall or floor opening',()=>{
    const nav=new BotNavigation(spec);
    // The Records south facade is solid at x=-36. Move along it, never into it.
    const from={x:-36,y:0,z:-35};
    const around=nav.localStep(from,{x:-36,y:0,z:-60});
    expect(around).toBeDefined();
    expect(around!.z).toBeGreaterThan(-36.3);
    expect(Math.abs(around!.x-from.x)).toBeGreaterThan(1);
    expect(Math.hypot(around!.x-from.x,around!.z-from.z)).toBeCloseTo(2.5);
    // Above the unsupported center of the manhole, there is no walkable step.
    expect(nav.localStep({x:72,y:0,z:0},{x:90,y:0,z:0})).toBeUndefined();
    // The deep Records atrium cannot be treated as an upper-floor shortcut.
    expect(nav.localStep({x:-16,y:8,z:-59},{x:-16,y:8,z:-45})).toBeUndefined();
    const ramp=nav.localStep({x:124,y:-3.5,z:0},{x:110,y:-7,z:0});
    expect(ramp).toBeDefined();
    expect(ramp!.y).toBeLessThan(-3.5);
    expect(ramp!.y).toBeGreaterThan(-4.7);
});

it('bounds cached destinations and stops spending expansion work on abandoned fields',()=>{
    const nav=new BotNavigation(spec);
    const from={x:-16,y:0,z:-30};
    for(const goal of nav.explorationTargets())nav.route(from,goal);
    const fields=(nav as unknown as {fields:Map<string,unknown>}).fields;
    expect(fields.size).toBeLessThanOrEqual(6);
    // Clock-independent age tracking: inactive destinations stop consuming the
    // shared budget even if a Worker never advances performance.now this turn.
    const clock=vi.spyOn(performance,'now').mockReturnValue(100);
    const neighbors=vi.spyOn(nav as unknown as {neighbors(node:unknown):unknown},'neighbors');
    try {
        for(let i=0;i<121;i++)nav.update(2,0);
        nav.update(2,96);
        expect(neighbors).not.toHaveBeenCalled();
        nav.route(from,{x:-36,y:8,z:-76});
        nav.update(2,96);
        expect(neighbors.mock.calls.length).toBeGreaterThan(0);
        expect(neighbors.mock.calls.length).toBeLessThanOrEqual(96);
        expect(fields.size).toBeLessThanOrEqual(6);
    } finally {clock.mockRestore();neighbors.mockRestore();}
});

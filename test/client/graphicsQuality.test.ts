import {expect,it} from 'vitest';
import {AUTO,QualityController} from '../../src/session/graphicsQuality';

const VSYNC=1000/60;
/** A fill-bound machine at DPR 1.5: frame cost grows with drawn pixels; each extras step saves 2.5 ms. `load` scales the scene. */
const gpuBound=(load=1)=>(q:QualityController)=>Math.max(VSYNC,(6+14*q.scale**2)*load-(q.tier==='high'?0:q.tier==='medium'?2.5:5));
/** Present frames for `seconds` from `t`; returns the end time and every (time, scale, tier) change. */
function run(q:QualityController,t:number,seconds:number,cost:(q:QualityController)=>number){
    const end=t+seconds*1000,changes:{t:number;scale:number;tier:string}[]=[];let slow=0,frames=0;
    while(t<end){
        const ms=cost(q);t+=ms;frames++;if(ms>AUTO.slow)slow++;
        const before=`${q.scale}/${q.tier}`;q.frame(t);
        if(`${q.scale}/${q.tier}`!==before)changes.push({t,scale:q.scale,tier:q.tier});
    }
    return {t,changes,slowShare:slow/frames};
}

it('steps a fill-bound machine down until frames fit 60 fps: resolution to native, then extras before blur',()=>{
    const q=new QualityController(1.5),cost=gpuBound();
    expect(q.scale).toBe(1.5);
    const {t,changes}=run(q,0,40,cost);
    // 1.5 (37.5 ms) -> 1.275 (28.8) -> 1.0 (20) -> medium extras (17.5 ms, fits): never below native.
    expect(changes.slice(0,3).map(c=>`${c.scale}/${c.tier}`)).toEqual(['1.275/high','1/high','1/medium']);
    expect(changes[2]!.t).toBeLessThan(20_000);
    expect(q.scale).toBe(1);expect(q.tier).toBe('medium');
    // Settled: frames now fit the budget, and it holds there (occasional tries back up aside).
    expect(cost(q)).toBeLessThanOrEqual(AUTO.slow);
    expect(run(q,t,60,cost).slowShare).toBeLessThan(.1);
});
it('steps down a machine far below 20 fps as well, measuring how much each step helps',()=>{
    // 7 fps at High (a weak laptop GPU on a high-DPI panel): every resolution step saves real time, the extras save none.
    const q=new QualityController(1.5),cost=(c:QualityController)=>20+55*c.scale**2;
    run(q,0,90,cost);
    expect(q.scale).toBe(.7);expect(q.tier).toBe('high');
});
it('reaches the same level on a noisy machine (jittery frames, stalls from other programs)',()=>{
    let seed=7;const noise=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
    const q=new QualityController(1.5),clean=gpuBound(),quiet=new QualityController(1.5);
    run(q,0,60,c=>{const r=noise();return r<.02?150+r*5000:clean(c)*(.75+noise()*.5);});
    run(quiet,0,60,clean);
    expect([q.scale,q.tier]).toEqual([quiet.scale,quiet.tier]);
});

it('does not move on hitches: long frames alone, or a hidden tab',()=>{
    const q=new QualityController(1.5);let t=0;
    for(let second=0;second<60;second++){
        for(let i=0;i<60;i++){t+=VSYNC;q.frame(t);}
        if(second%5===0){t+=400;q.frame(t);t+=50;q.frame(t);}
    }
    t+=30_000;q.frame(t);
    for(let i=0;i<600;i++){t+=VSYNC;q.frame(t);}
    expect(q.scale).toBe(1.5);expect(q.tier).toBe('high');
});

it('recovers when the load drops, slowly, and backs off from a level that failed',()=>{
    const q=new QualityController(1.5);
    let {t}=run(q,0,60,gpuBound(1.3));
    const low=q.scale;expect(low).toBeLessThan(1);
    // A lighter scene: 1.275 now fits (6+22.8)*.55 ≈ 15.8 ms but 1.5 does not (20.7 ms).
    const light=run(q,t,5,gpuBound(.55));t=light.t;
    expect(light.changes.filter(c=>c.scale>low)).toEqual([]);
    const later=run(q,t,120,gpuBound(.55));
    expect(q.scale).toBe(1.275);expect(q.tier).toBe('high');
    // Failed tries at 1.5 come ever further apart instead of flickering every few seconds.
    const tries=later.changes.filter(c=>c.scale===1.5).map(c=>c.t);
    expect(tries.length).toBeGreaterThan(0);expect(tries.length).toBeLessThanOrEqual(4);
    for(let i=2;i<tries.length;i++)expect(tries[i]!-tries[i-1]!).toBeGreaterThan(tries[i-1]!-tries[i-2]!);
    expect(later.slowShare).toBeLessThan(.12);
});

it('keeps the full look on a machine that resolution cannot help',()=>{
    const q=new QualityController(1.5),cpuBound=()=>25;
    const {changes,t}=run(q,0,200,cpuBound);
    // The sample may end inside a bounded probe; it must restore the full look
    // within the two-window assessment, not remain degraded on this CPU-bound input.
    const settled=run(q,t,6,cpuBound);
    expect(q.scale).toBe(1.5);expect(q.tier).toBe('high');
    // Each kind is tried, found useless and put back within seconds; retries wait longer each time.
    expect(changes.length).toBeLessThanOrEqual(12);
    expect(run(q,settled.t,200,cpuBound).changes.length).toBeLessThanOrEqual(4);
});

it('manual modes hold their level whatever the frame time',()=>{
    for(const [mode,scale,tier] of [['high',1.5,'high'],['medium',1,'medium'],['low',.7,'low']] as const){
        const q=new QualityController(1.5,mode);run(q,0,30,()=>40);
        expect([q.scale,q.tier]).toEqual([scale,tier]);
    }
    const q=new QualityController(1.5);run(q,0,40,gpuBound());expect(q.scale).toBeLessThan(1.5);
    q.setMode('high');expect(q.scale).toBe(1.5);
    q.setMode('auto');expect([q.scale,q.tier]).toEqual([1.5,'high']);
});

it('starts where the last visit settled, and still climbs when there is room',()=>{
    const q=new QualityController(1.5,'auto',{scale:.85,tier:1});
    expect([q.scale,q.tier]).toEqual([.85,'medium']);
    run(q,0,90,()=>VSYNC);
    expect([q.scale,q.tier]).toEqual([1.5,'high']);
});

it('climbs back to the full look when it is slow for reasons the lower levels do not fix',()=>{
    // Last visit settled low; this one is processor-bound at 40 fps whatever the resolution.
    const q=new QualityController(1.5,'auto',{scale:.7,tier:2});
    const {changes}=run(q,0,180,()=>25);
    expect([q.scale,q.tier]).toEqual([1.5,'high']);
    expect(changes.filter(c=>c.scale<.7+1e-9&&c.t>60_000)).toEqual([]);
});

// A first step can be below the noise margin even when the strongest step pays off.
// Failure cases: blocking the whole kind after one weak step; staying degraded when
// even the strongest step fails; repeated unbounded probes on a CPU-bound machine.
it('tries the stronger extras before rejecting the whole extras ladder',()=>{
    const q=new QualityController(1);
    const cost=(c:QualityController)=>c.tier==='low'?26:c.tier==='medium'?39:40;
    const {changes}=run(q,0,60,cost);
    expect(changes.some(c=>c.tier==='low'&&c.t<25_000)).toBe(true);
    expect(run(q,60_000,60,cost).slowShare).toBe(1);
    expect(q.tier).toBe('low');
});
it('tries a stronger resolution when the first reduction is below the gain margin',()=>{
    const q=new QualityController(1),cost=(c:QualityController)=>c.scale<=.7?25:c.scale<1?38:40;
    const {changes}=run(q,0,60,cost);
    expect(changes.some(c=>c.scale===.7&&c.t<30_000)).toBe(true);
    expect(q.scale).toBe(.7);
});

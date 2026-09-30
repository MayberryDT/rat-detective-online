import {afterEach,expect,it,vi} from 'vitest';
import {checkPrograms} from '../../src/session/warmPrograms';

/** A context whose GPU fence signals after `drainPolls` status reads. */
class FakeContext {
    readonly SYNC_GPU_COMMANDS_COMPLETE=1;readonly SYNC_STATUS=2;readonly SIGNALED=3;
    polls=0;
    constructor(private readonly drainPolls:number){}
    get drained():boolean {return this.polls>this.drainPolls;}
    fenceSync():object {return {};}
    getSyncParameter():number {return ++this.polls>this.drainPolls?this.SIGNALED:0;}
    flush():void {}
    deleteSync():void {}
    isContextLost():boolean {return false;}
}
vi.stubGlobal('WebGL2RenderingContext',FakeContext);
afterEach(()=>vi.clearAllMocks());

function program(gl:FakeContext,readyAfter=0){
    let polls=0;
    const used:boolean[]=[];
    return {used,isReady:()=>++polls>readyAfter,getUniforms:vi.fn(()=>{used.push(gl.drained);return {};})};
}

it('first-uses every program the renderer holds, never before the GPU has drained',async()=>{
    const gl=new FakeContext(3),programs=[program(gl),program(gl),program(gl)];
    await checkPrograms({getContext:()=>gl,extensions:{has:()=>true},info:{programs}} as never);
    for(const p of programs)expect(p.used).toEqual([true]);
});

it('waits for a program still linking and leaves one released meanwhile alone',async()=>{
    // A released program's readiness poll answers null (its GL program is gone), never true.
    const gl=new FakeContext(0),released={isReady:()=>null,getUniforms:vi.fn(()=>({}))},polls={count:0};
    const linking={getUniforms:vi.fn(()=>({})),isReady:()=>{if(programs.length>1)programs.pop();return ++polls.count>4;}};
    const programs:object[]=[linking,released];
    await checkPrograms({getContext:()=>gl,extensions:{has:()=>true},info:{programs}} as never);
    expect(polls.count).toBe(5);
    expect(linking.getUniforms).toHaveBeenCalledTimes(1);
    expect(released.getUniforms).not.toHaveBeenCalled();
});

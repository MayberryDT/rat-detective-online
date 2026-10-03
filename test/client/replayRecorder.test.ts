import {expect,it} from 'vitest';
import {ReplayRecorder} from '../../src/replay/ReplayRecorder';
import type {HighlightMarker} from '../../src/shared/highlights';
import type {PlayerData,ServerMessage} from '../../src/shared/networkProtocol';

const rat=(id:string):PlayerData=>({id,name:id.toUpperCase(),x:0,y:0,z:0,qx:0,qy:0,qz:0,qw:1,meshQx:0,meshQy:0,meshQz:0,meshQw:1,hp:5,kills:0,deaths:0,hatType:'fedora',hatColor:0,furColor:0,coatColor:0});
function fixture(){
    let now=10_000;
    const recorder=new ReplayRecorder(()=>now);
    recorder.welcome({type:'welcome',id:'me',player:rat('me'),players:{bot:rat('bot')},round:{phase:'playing'},serverTime:now} as unknown as Extract<ServerMessage,{type:'welcome'}>);
    /** Play on to `to`, your rat recorded at 30 Hz. */
    const until=(to:number)=>{while(now<to){now=Math.min(to,now+34);recorder.recordLocal({x:0,y:0,z:0},{x:0,y:0,z:0,w:1},{x:0,y:0,z:1});}};
    const mark=(id:string,score:number,at:number,actors=['bot'],kind:HighlightMarker['kind']='sent-flying'):void=>recorder.record({type:'highlight',id,kind,at,actors,p:{x:0,y:0,z:0},score,leadMs:4000,trailMs:2000} satisfies HighlightMarker);
    return {recorder,until,mark};
}

it('keeps the 8 best clips plus your best one, even when it scores below them',()=>{
    const {recorder,until,mark}=fixture();
    until(11_500);
    for(let i=0;i<10;i++)mark(`bot-${i}`,10+i*10,11_000);
    mark('mine',5,11_000,['bot','me']);
    until(12_999);
    expect(recorder.clips()).toHaveLength(0);
    until(13_000);
    const clips=recorder.clips();
    expect(clips.map(clip=>clip.score)).toEqual([100,90,80,70,60,50,40,30,5]);
    expect(clips.at(-1)).toMatchObject({id:'mine',involvesLocal:true,names:{bot:'BOT',me:'ME'}});
});

it('keeps the shared exhibits (one per kind) even below the 8 best, and freezes their order with the board',()=>{
    const {recorder,until,mark}=fixture();
    until(11_500);
    for(let i=0;i<10;i++)mark(`fly-${i}`,100+i,11_000);
    mark('pile',20,11_000,['bot'],'pileup');
    until(13_000);
    expect(recorder.clips().map(clip=>clip.id)).toContain('pile');
    recorder.freeze();
    expect(recorder.shared()).toEqual(['fly-9','pile']);
    recorder.reset();
    expect(recorder.shared()).toEqual(['fly-9','pile']);
});

it('replaces a grown moment (the same id) instead of keeping two clips of it',()=>{
    const {recorder,until,mark}=fixture();
    until(11_500);mark('burst',30,11_000);
    until(13_100);
    expect(recorder.clips().map(clip=>clip.score)).toEqual([30]);
    mark('burst',70,12_500);
    expect(recorder.clips()).toHaveLength(0);
    until(14_500);
    expect(recorder.clips()).toMatchObject([{id:'burst',score:70,at:12_500,endAt:14_500}]);
});

it('cuts a moment still in its trail short when the board freezes the shelf',()=>{
    const {recorder,until,mark}=fixture();
    until(12_000);mark('winner',60,11_800);
    recorder.freeze();
    expect(recorder.clips()).toMatchObject([{id:'winner',endAt:12_000}]);
    recorder.reset();
    // The board keeps its clips through the next round's reset until it goes.
    expect(recorder.clips()).toHaveLength(1);
    recorder.release();
    expect(recorder.clips()).toHaveLength(0);
});

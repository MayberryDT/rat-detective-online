import {afterEach,describe,expect,it,vi} from 'vitest';
import type {WebGLRenderer} from 'three';
import {PerfReporter,browserOf,osOf} from '../../src/session/perfReporter';
import type {PerfReport} from '../../src/shared/perfReport';

afterEach(()=>{vi.unstubAllGlobals();});
function fixture(){
  const doc=Object.assign(new EventTarget(),{hidden:false});vi.stubGlobal('document',doc);vi.stubGlobal('window',{devicePixelRatio:1.25});
  const gl={drawingBufferWidth:2400,drawingBufferHeight:1350,RENDERER:1,VENDOR:2,getExtension:()=>({UNMASKED_RENDERER_WEBGL:3,UNMASKED_VENDOR_WEBGL:4}),
    getParameter:(p:number)=>p===3?'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)':'Google Inc. (Intel)'};
  const renderer={getContext:()=>gl,getPixelRatio:()=>1.25} as unknown as WebGLRenderer;
  const sent:PerfReport[]=[],reporter=new PerfReporter(renderer,r=>{sent.push(r);},new AbortController().signal);
  return {doc,sent,reporter};
}

describe('perf reports from the player\'s machine',()=>{
  // A player who alt-tabs for eight seconds did not see an eight-second frame.
  it('reports every 30 s of play, counts hitches, and does not count a hidden tab as a frame',()=>{
    const {doc,sent,reporter}=fixture();
    for(let i=0;i<1000;i++)reporter.frame(i%100===0?120:16.7,5);
    doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));doc.hidden=false;
    reporter.frame(8000,5);
    expect(sent).toHaveLength(0);
    for(let i=0;i<900;i++)reporter.frame(16.7,5);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({p50:16.7,worst:120,over33:10,over100:10,cpu50:5,w:2400,h:1350,dpr:1.25,pr:1.25,gpuVendor:'Google Inc. (Intel)'});
    expect(sent[0]!.frames).toBe(1735);expect(sent[0]!.ms).toBeGreaterThanOrEqual(30_000);expect(sent[0]!.ms).toBeLessThan(30_020);
    expect(sent[0]!.gpu).toContain('Direct3D11');
    // Leaving after a couple of seconds sends nothing new; after five it sends what it has.
    for(let i=0;i<120;i++)reporter.frame(16.7,5);reporter.leave();expect(sent).toHaveLength(1);
    for(let i=0;i<200;i++)reporter.frame(16.7,5);reporter.leave();expect(sent).toHaveLength(2);expect(sent[1]!.frames).toBe(485);
  });

  // Edge and Opera carry "Chrome/" in their user agent; Tyler's friend is on Windows.
  it('tells Windows and Edge apart from Chrome, with or without client hints',()=>{
    const edge='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0';
    expect([osOf(edge),browserOf(edge)]).toEqual(['windows',{browser:'edge',browserMajor:129}]);
    expect(browserOf(edge,{platform:'Windows',brands:[{brand:'Chromium',version:'129'},{brand:'Microsoft Edge',version:'129'}]})).toEqual({browser:'edge',browserMajor:129});
    expect(osOf('',"Windows")).toBe('windows');
    const firefox='Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0';
    expect([osOf(firefox),browserOf(firefox)]).toEqual(['linux',{browser:'firefox',browserMajor:131}]);
    expect(osOf('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36')).toBe('android');
  });
});

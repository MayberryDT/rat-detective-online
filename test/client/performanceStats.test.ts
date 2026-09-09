import {afterEach,describe,expect,it,vi} from 'vitest';
import {PerformanceStats} from '../../src/session/PerformanceStats';
import type {WebGLRenderer} from 'three';
const originalDocument=globalThis.document;
afterEach(()=>{vi.unstubAllGlobals();vi.stubGlobal('document',originalDocument);vi.restoreAllMocks();});
function fixture(publish?:(report:Record<string,unknown>)=>void){
 const window=new EventTarget();vi.stubGlobal('window',window);
 vi.stubGlobal('document',{hidden:false});const save=vi.fn();vi.stubGlobal('localStorage',{setItem:save});vi.spyOn(console,'info').mockImplementation(()=>{});
 const renderer={domElement:new EventTarget(),info:{render:{calls:4,triangles:50},memory:{geometries:2,textures:3}}} as unknown as WebGLRenderer;
 return {stats:new PerformanceStats(renderer,false,publish),save,window};
}
describe('bounded playtest diagnostics',()=>{
 it('publishes through the supplied game transport without HTTP polling',()=>{
  const publish=vi.fn(),fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  const {stats}=fixture(publish);stats.record(16,5000,{seed:1,version:2});
  expect(publish).toHaveBeenCalledTimes(1);expect(fetch).not.toHaveBeenCalled();stats.dispose();
 });
 it('retains multi-second freezes and phase timings instead of discarding them',()=>{
  const {stats,save}=fixture();stats.record(2200,5000,{seed:1,version:2},{simulationMs:100,botsMs:70,presentationMs:3,renderMs:12});
  const report=JSON.parse(save.mock.calls[0][1]).reports[0];expect(report.longestFrameMs).toBe(2200);expect(report.stallsOver100Ms).toBe(1);expect(report.phaseMaxMs.botsMs).toBe(70);stats.dispose();
 });
 it('bounds report/event history and persists a report without DOM controls',()=>{
  const {stats,save,window}=fixture();for(let i=1;i<=130;i++){stats.event('test');stats.record(16,i*5000,{seed:1,version:2});}
  const report=JSON.parse(save.mock.calls.at(-1)![1]);expect(report.reports).toHaveLength(120);expect(report.events).toHaveLength(100);
  stats.dispose();expect('ratDiagnostics' in window).toBe(false);
 });
});

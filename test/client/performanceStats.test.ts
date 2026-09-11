import {afterEach,describe,expect,it,vi} from 'vitest';
import {sanitizeDiagnosticReport} from '../../src/shared/diagnosticReport';
import {PerformanceStats} from '../../src/session/PerformanceStats';
import type {WebGLRenderer} from 'three';
const originalDocument=globalThis.document;
afterEach(()=>{vi.unstubAllGlobals();vi.stubGlobal('document',originalDocument);vi.restoreAllMocks();});
function fixture(publish?:(report:Record<string,unknown>)=>void){
 const window=new EventTarget();vi.stubGlobal('window',window);
 vi.stubGlobal('document',Object.assign(new EventTarget(),{hidden:false}));const save=vi.fn();vi.stubGlobal('localStorage',{setItem:save});vi.spyOn(console,'info').mockImplementation(()=>{});
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
  const publish=vi.fn(),{stats}=fixture(publish);stats.record(2200,5000,{seed:1,version:2},{simulationMs:100,botsMs:70,presentationMs:3,renderMs:12});
  const report=publish.mock.calls[0][0];expect(report.longestFrameMs).toBe(2200);expect(report.stallsOver100Ms).toBe(1);expect(report.phaseMaxMs.botsMs).toBe(70);stats.dispose();
 });
 it('records focus and lock errors and removes listeners on disposal',()=>{
  const {stats,window}=fixture();
  window.dispatchEvent(new Event('blur'));document.dispatchEvent(new Event('pointerlockerror'));
  const before=stats.snapshot() as {events:Array<{type:string}>};
  expect(before.events.map(e=>e.type)).toEqual(['window-blur','pointer-lock-error']);
  stats.dispose();window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('pointerlockerror'));
  expect((stats.snapshot() as {events:unknown[]}).events).toHaveLength(2);
 });
 it('persists a lock loss immediately and publishes only numeric input summaries',()=>{
  const publish=vi.fn(),{stats,save}=fixture(publish);
  stats.event('pointer-lock',{locked:false,focused:true,hidden:false,recentEscape:false});
  expect(save).toHaveBeenCalledTimes(1);stats.record(16,5000,{seed:1,version:2});
  const report=publish.mock.calls[0][0];
  expect(report.input).toMatchObject({lockLosses:1,focusedLosses:1,escapeLosses:0});
  report.input.extra='private';report.input.windowBlurs=Infinity;
  const clean=sanitizeDiagnosticReport(report)!;
  expect(clean.input).toMatchObject({lockLosses:1,focusedLosses:1});
  expect(clean.input).not.toHaveProperty('extra');expect(clean.input).not.toHaveProperty('windowBlurs');stats.dispose();
 });
 it('bounds report/event history and persists a report without DOM controls',()=>{
  const {stats,save,window}=fixture();for(let i=1;i<=130;i++){stats.event('test');stats.record(16,i*5000,{seed:1,version:2});}
  expect(save).not.toHaveBeenCalled();expect(console.info).not.toHaveBeenCalled();
  window.dispatchEvent(new Event('pagehide'));
  const report=JSON.parse(save.mock.calls.at(-1)![1]);expect(report.reports).toHaveLength(120);expect(report.events).toHaveLength(100);
  stats.dispose();expect('ratDiagnostics' in window).toBe(false);
 });
});

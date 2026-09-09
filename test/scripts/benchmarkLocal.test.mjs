import { test } from 'node:test';
import assert from 'node:assert/strict';
import { options, summarize, phaseHealthy } from '../../scripts/benchmark-local.mjs';
test('local benchmark has a bounded ladder and no external target option',()=>{
  assert.deepEqual(options([]).players,[2,8,12,24,32,50,75,100]);
  for(const args of [['--phases=unknown'],['--phases=idle,idle'],['--players=101'],['--players=0'],['--players=2,2'],['--phase-seconds=451'],['--warmup=0'],['--target=https://example.com']])assert.throws(()=>options(args));
});
test('merges latency histograms by observation count rather than averaging percentiles',()=>{
  const a={bins:[0,98,2],count:100,sum:102,max:2},b={bins:[0,0,1],count:1,sum:2,max:2};
  const result=summarize([a,b]);assert.equal(result.count,101);assert.equal(result.p95,1);assert.equal(result.p99,2);assert.equal(result.max,2);
});

test('missing snapshots and continuing silence cannot pass as zero latency',()=>{
  assert.equal(summarize([]).p95,null);
  const good={gaps:{count:100,p95:40,p99:50,max:60},maxSilence:50,loop:{count:5,p99:11},invalid:0,errors:0,disconnects:0,skipped:0};
  assert.equal(phaseHealthy(good),true);
  assert.equal(phaseHealthy({...good,gaps:summarize([])}),false);
  assert.equal(phaseHealthy({...good,maxSilence:15000}),false);
  assert.equal(options(['--admission-only']).admissionOnly,true);
});

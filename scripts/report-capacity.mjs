import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
const {values}=parseArgs({options:{results:{type:'string'},output:{type:'string'}}});
if(!values.results||!values.output)throw new Error('Use --results=/absolute/results.json --output=/absolute/report.md');
const {manifest,results}=JSON.parse(await readFile(values.results,'utf8'));
const lines=['# Capacity benchmark receipt','',`Generated from \`${values.results}\`.`, '',`Fixture: \`${manifest.fixtureId??'historical local fixture'}\`. Version: \`${manifest.version??'local workerd'}\`.`, '',
'| Players | Phase | Result | Gap p95 | Gap p99 | Worst gap | Server timestamp gap max | RTT p95 | Peak balls |',
'| --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
const csv=['players,phase,result,gap_p95_ms,gap_p99_ms,gap_max_ms,server_gap_max_ms,rtt_p95_ms,peak_balls'];
const cell=n=>n==null?'unavailable':`${Math.round(n*100)/100}ms`;
for(const r of results){
 if(!r.phases.length){csv.push([r.players,'admission',r.status,'','','','','',''].join(','));lines.push(`| ${r.players} | admission | ${r.status} | — | — | — | — | — | — |`);continue;}
 for(const p of r.phases){
  const m=p.metrics,g=m.gaps;
  lines.push(`| ${r.players} | ${p.phase} | ${p.passed?'pass':'fail'} | ${cell(g.p95)} | ${cell(g.p99)} | ${g.count?cell(g.max):'no arrivals'} | ${m.serverGaps?.count?cell(m.serverGaps.max):'unavailable'} | ${cell(m.rtts?.p95)} | ${m.peakBalls} |`);
  csv.push([r.players,p.phase,p.passed?'pass':'fail',g.p95??'',g.p99??'',g.count?g.max:'',m.serverGaps?.count?m.serverGaps.max:'',m.rtts?.p95??'',m.peakBalls].join(','));
 }
}
const omitted=manifest.options.players.filter(n=>!results.some(r=>r.players===n));
lines.push('',`Unattempted levels: ${omitted.length?omitted.join(', '):'none'}.`,'');
for(const r of results)if(r.stopReason||r.error)lines.push(`- ${r.players} players: ${r.stopReason??r.error}`);
lines.push('','Synthetic full-feed results do not measure browser rendering, animation smoothness, public AI, or real player movement. Admission-only results do not establish sustained capacity. Server timestamp gaps describe simulation snapshot timestamps, not independent CPU or wall-time profiling.');
await writeFile(values.output,lines.join('\n')+'\n');
await writeFile(values.output.replace(/\.md$/,'')+'.csv',csv.join('\n')+'\n');
console.log(values.output);

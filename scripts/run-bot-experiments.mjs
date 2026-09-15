// Reproducible controlled comparisons. This is not a human playtest or a load benchmark.
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
const out=join(process.cwd(),'output/bot-experiments-2026-09-14');
await mkdir(out,{recursive:true});
const started=Date.now();
const child=spawn(process.execPath,['node_modules/vitest/vitest.mjs','run','--config','vitest.client.config.ts','--silent=false','test/client/botExperiments.test.ts','test/client/botExperimentPhysics.test.ts'],{stdio:['ignore','pipe','pipe']});
let log='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{log+=chunk;});
const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
await writeFile(join(out,'comparisons.log'),log);
for(const file of ['controlled.json','physics.json']){
 if((await stat(join(out,file))).mtimeMs<started)throw Error(`Stale report: ${file}`);
 JSON.parse(await readFile(join(out,file),'utf8'));
}
if(code!==0)throw Error(`Comparison tests failed; inspect ${out}/comparisons.log`);
console.log(`Comparisons passed: ${out}`);

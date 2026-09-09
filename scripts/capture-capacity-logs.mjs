// Captures console diagnostics only; deliberately discards request data and headers.
import { readFile, mkdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { join, dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { spawnProcess, stopProcess } from './lib/process.mjs';
import { projectRoot, PRIVATE_WORKER } from './lib/capacity-fixture.mjs';
const {values}=parseArgs({options:{deployment:{type:'string'},output:{type:'string'}}});
if(!values.deployment||!values.output)throw new Error('Use --deployment and --output');
const receipt=JSON.parse(await readFile(values.deployment,'utf8'));
if(receipt.worker!==PRIVATE_WORKER||receipt.expiresAt<=Date.now())throw new Error('Expected an active private capacity deployment');
await mkdir(dirname(values.output),{recursive:true});
const output=createWriteStream(values.output,{flags:'wx'});
const child=spawnProcess(process.execPath,[join(projectRoot,'node_modules/wrangler/bin/wrangler.js'),'tail',PRIVATE_WORKER,'--config',receipt.configPath,'--format','json'],{cwd:projectRoot,stdio:['ignore','pipe','pipe'],env:{WRANGLER_SEND_METRICS:'false'}});
let stdoutBytes=0;
let buffer='',depth=0,inString=false,escaped=false,capturing=false,events=0,diagnostics=0;
child.stdout.on('data',chunk=>{
  stdoutBytes+=chunk.length;
  for(const ch of chunk.toString()){
    if(!capturing){if(ch!=='{')continue;capturing=true;depth=0;}
    buffer+=ch;
    if(inString){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')inString=false;}
    else if(ch==='"')inString=true;
    else if(ch==='{')depth++;
    else if(ch==='}')depth--;
    if(buffer.length>2*1024*1024){buffer='';depth=0;capturing=false;inString=false;escaped=false;}
    if(capturing&&depth===0){
      try{
        const event=JSON.parse(buffer);events++;
        const logs=(event.logs??[]).map(log=>({timestamp:log.timestamp,level:log.level,message:log.message}));
        if(logs.length||(event.exceptions??[]).length){diagnostics++;output.write(JSON.stringify({eventTimestamp:event.eventTimestamp,outcome:event.outcome,logs,exceptions:(event.exceptions??[]).map(e=>({name:e.name,message:e.message}))})+'\n');}
      }catch{}
      buffer='';capturing=false;
    }
  }
});
// CLI diagnostics can contain account metadata; retain only a count.
let stderrBytes=0;child.stderr.on('data',chunk=>stderrBytes+=chunk.length);
const stop=()=>void stopProcess(child);
process.on('SIGINT',stop);process.on('SIGTERM',stop);
const progress=setInterval(()=>console.log(JSON.stringify({event:'capture-status',events,diagnostics,stdoutBytes,stderrBytes,pendingBytes:buffer.length})),30000);
const expiry=setTimeout(stop,Math.max(1,receipt.expiresAt-Date.now()));
console.log(JSON.stringify({event:'capturing',output:values.output,pid:process.pid}));
await new Promise(resolve=>child.once('exit',resolve));
clearTimeout(expiry);clearInterval(progress);await new Promise(resolve=>output.end(resolve));
console.log(JSON.stringify({event:'complete',events,diagnostics,stderrBytes}));

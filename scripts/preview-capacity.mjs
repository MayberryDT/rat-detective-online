// Dedicated local human-playtest relay. Existing preview services are untouched.
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createHostedPreview } from './hosted-preview.mjs';
import { checkReceipt } from './benchmark-hosted.mjs';
const {values}=parseArgs({options:{deployment:{type:'string'},dist:{type:'string'},port:{type:'string',default:'5180'},room:{type:'string',default:'graybox-benchmark-human-playtest'}}});
if(!/^graybox-benchmark-[a-z0-9-]{1,80}$/.test(values.room))throw Error('Expected a private benchmark room');
if(!values.deployment)throw new Error('Use --deployment=/absolute/deployment.json');
const receipt=JSON.parse(await readFile(values.deployment,'utf8'));
if((await stat(receipt.tokenFile)).mode&0o077)throw new Error('Credential file must be private');
const {CAPACITY_TEST_TOKEN:token}=JSON.parse(await readFile(receipt.tokenFile,'utf8'));
checkReceipt(receipt,token);
const health=await fetch(`${receipt.url}/health`,{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(10000)});
if(!health.ok||(await health.json()).fixtureId!==receipt.fixtureId)throw new Error('Private fixture is unavailable or changed');
const preview=createHostedPreview({distDir:values.dist??join(receipt.stage,'dist'),upstreamOrigin:receipt.url,token});
const origin=await preview.listen(Number(values.port));
console.log(JSON.stringify({event:'playtest-ready',url:`${origin}/?room=${values.room}`,version:receipt.version,expiresAt:receipt.expiresAt,pid:process.pid}));
let expiry;
let stopping=false;
const stop=async()=>{
 if(stopping)return;stopping=true;clearTimeout(expiry);await preview.close();
 if(values.room.startsWith('graybox-benchmark-ai-')&&Date.now()<receipt.expiresAt){
  const url=new URL('/cleanup',receipt.url);url.searchParams.set('room',values.room);
  try{const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error(`Cleanup HTTP ${response.status}`);}
  catch(error){console.error('Private preview AI cleanup failed:',String(error));process.exitCode=1;}
 }
};
process.once('SIGINT',stop);process.once('SIGTERM',stop);
expiry=setTimeout(stop,Math.max(1,receipt.expiresAt-Date.now()));

// Deploys only the dedicated private benchmark. No target/name override.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify, parseArgs } from 'node:util';
import { prepareFixture, projectRoot, PRIVATE_WORKER } from './lib/capacity-fixture.mjs';
const exec = promisify(execFile);
const { values } = parseArgs({ options: { 'bot-experiments':{type:'boolean',default:false}, assignment:{type:'string'}, 'first-assignment':{type:'string'}, deploy:{type:'boolean',default:false}, minutes:{type:'string',default:'120'}, window:{type:'string',default:'8'}, bots:{type:'string',default:'11'}, cap:{type:'string',default:'100'}, 'full-lobby':{type:'boolean',default:false}, 'checkpoint-control':{type:'boolean',default:false} } });
const minutes = Number(values.minutes);
const serverBots=Number(values.bots);
const window=Number(values.window);if(![4,8].includes(window))throw Error('window must be 4 or 8');
if (!Number.isInteger(minutes) || minutes < 10 || minutes > 240) throw new Error('minutes must be 10–240');
const out = join(projectRoot,'output',`hosted-capacity-deployment-${new Date().toISOString().replace(/[:.]/g,'-')}`);
const fixture = await prepareFixture(out, { hosted:true, botExperiments:values['bot-experiments'], assignment:values.assignment, firstAssignment:values['first-assignment'], expiresAt:Date.now()+minutes*60000, window, serverBots, maxPlayers:Number(values.cap), fullLobby:values['full-lobby'], checkpointControl:values['checkpoint-control'] });
const wrangler = join(projectRoot,'node_modules/wrangler/bin/wrangler.js');
const run = args => exec(process.execPath,[wrangler,...args], { cwd:fixture.stage, timeout:180000, maxBuffer:4*1024*1024, env:{...process.env,WRANGLER_SEND_METRICS:'false'} });
const dryRun = await run(['deploy','--config',fixture.configPath,'--dry-run','--outdir',join(out,'bundle')]);
await writeFile(join(out,'dry-run.log'),dryRun.stdout+dryRun.stderr);
console.log(JSON.stringify({event:'prepared',out,fixtureId:fixture.fixtureId,expiresAt:fixture.expiresAt}));
if (values.deploy) {
  const stateDir = join(homedir(),'.local/state/rat-detective/capacity-test');
  await mkdir(stateDir,{recursive:true,mode:0o700});
  const tokenFile = join(stateDir,`${fixture.fixtureId}-${Date.now()}.json`);
  const token=randomBytes(32).toString('hex');
  await writeFile(tokenFile,JSON.stringify({CAPACITY_TEST_TOKEN:token}),{mode:0o600,flag:'wx'});
  const deployed = await run(['deploy','--config',fixture.configPath,'--secrets-file',tokenFile]);
  await writeFile(join(out,'deploy.log'),deployed.stdout+deployed.stderr);
  const url = deployed.stdout.match(/https:\/\/rat-detective-capacity-test\.[a-z0-9-]+\.workers\.dev\b/)?.[0];
  const version = deployed.stdout.match(/Current Version ID:\s*([a-f0-9-]{36})/)?.[1];
  if (!url || !version) throw new Error(`Deployment completed but receipt parsing failed; inspect ${join(out,'deploy.log')}`);
  const receipt = {...fixture,worker:PRIVATE_WORKER,url,version,tokenFile};
  const path = join(out,'deployment.json');
  await writeFile(path,JSON.stringify(receipt,null,2));
  // Deployment publication and edge routing can become visible at different
  // times. Verify the exact new fixture before a caller starts its workload.
  let ready=false;
  for(let attempt=0;attempt<30;attempt++){
    try{
      const response=await fetch(`${url}/health`,{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(5000)});
      if(response.ok){const health=await response.json();if(health.fixtureId===fixture.fixtureId&&health.expiresAt===fixture.expiresAt){ready=true;break;}}
    }catch{/* Retry only this authenticated private health read during propagation. */}
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  if(!ready)throw new Error(`Private deployment did not become ready; receipt retained at ${path}`);
  console.log(JSON.stringify({event:'deployed',receipt:path,url,version,expiresAt:fixture.expiresAt}));
}

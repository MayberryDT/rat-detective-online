// Bounded process-level transport regression. Use an isolated CI Worker or authorized hosted fixture.
// Failure cases: unplanned peer drop; lost rat on resume; stalled ACKs never bounded;
// failure context erased on welcome; teardown leaks sockets; credentials enter the receipt.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import WS from 'ws';
const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6);
if(!out)throw Error('Pass --out=/absolute/path/receipt.json');
const target=new URL(process.env.SMOKE_WS_URL??process.argv.find(a=>/^wss?:/.test(a))??'ws://127.0.0.1:5173/ws');
target.searchParams.set('agent','1');
const origin=target.origin.replace(/^ws/,'http');
const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/network/NetworkManager.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node'});
const {NetworkManager}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
globalThis.WebSocket=WS;
class BrowserSocket extends WS {
  stalled=false;
  send(data,...args){if(!this.stalled)return super.send(data,...args);}
  addEventListener(type,listener,options={}){
    if(options.signal?.aborted)return;super.addEventListener(type,listener,options);
    options.signal?.addEventListener('abort',()=>this.removeEventListener(type,listener),{once:true});
  }
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=20000){const end=Date.now()+ms;while(!fn()){if(Date.now()>end)throw Error('Timed out waiting for transport');await pause(25);}}
const clients=[],report={started:new Date().toISOString(),origin,clients:[]};
function make(name,prepare=false){
  const row={name,welcomes:[],closes:[],states:[],updates:0};report.clients.push(row);
  const manager=new NetworkManager({url:target.toString(),resumeStorage:null,createSocket:url=>{
    const socket=new BrowserSocket(url,{origin});row.socket=socket;
    socket.on('close',code=>row.closes.push({code,at:Date.now()}));return socket;
  }});row.manager=manager;clients.push(manager);
  manager.onState=state=>row.states.push({state,at:Date.now()});
  manager.onMessage=m=>{if(m.type==='welcome')row.welcomes.push({id:m.id,protocol:m.protocolVersion,at:Date.now()});if(m.type==='chaos')row.updates++;};
  if(prepare)manager.prepare();
  manager.connect(name,{hatType:'fedora',hatColor:1,furColor:2,coatColor:3});return row;
}
try {
  const a=make('Connection check A',true);await until(()=>a.manager.state==='playing');
  const b=make('Connection check B');await until(()=>b.manager.state==='playing');
  await pause(6000);assert.equal(a.closes.length,0);assert.equal(b.closes.length,0);
  a.socket.terminate();await until(()=>a.welcomes.length===2&&a.manager.state==='playing');
  assert.equal(a.welcomes[0].id,a.welcomes[1].id);assert.ok(a.welcomes[0].id);
  assert.equal(a.manager.getDiagnostics().lastFailure,'close');assert.ok(a.manager.getDiagnostics().recoveryMs>0);
  await pause(1000);a.socket.stalled=true;
  await until(()=>a.welcomes.length===3&&a.manager.state==='playing');
  assert.equal(a.welcomes[0].id,a.welcomes[2].id);
  assert.ok(['delivery-timeout','delivery-backlog'].includes(a.manager.getDiagnostics().lastFailure));
  assert.equal(a.manager.getDiagnostics().lastCloseCode,1013);
  await pause(6000);assert.equal(a.closes.length,2);assert.equal(b.closes.length,0);
  for(const row of report.clients){assert.equal(row.manager.getDiagnostics().invalidCount,0);assert.ok(row.updates>20);assert.equal(row.manager.state,'playing');}
  report.ok=true;
} catch(error){report.ok=false;report.error=String(error.stack??error);}
finally {
  for(const row of report.clients)row.diagnostics=row.manager.getDiagnostics();
  for(const manager of clients)manager.destroy();
  for(const row of report.clients){delete row.manager;delete row.socket;}
  report.finished=new Date().toISOString();await mkdir(dirname(resolve(out)),{recursive:true});await writeFile(out,JSON.stringify(report,null,2));
  console.log(JSON.stringify({ok:report.ok,error:report.error,receipt:resolve(out)}));
}
process.exitCode=report.ok?0:1;

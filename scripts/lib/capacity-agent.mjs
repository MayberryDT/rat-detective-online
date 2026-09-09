// SSH stdio bridge: credentials arrive only on stdin, never process arguments.
import {createInterface} from 'node:readline';
import {Worker} from 'node:worker_threads';
let worker;
const input=createInterface({input:process.stdin});
input.on('line',line=>{
 try{
  const m=JSON.parse(line);
  if(m.type==='init'&&!worker){
   worker=new Worker(new URL('./capacity-clients.mjs',import.meta.url),{workerData:m.workerData});
   worker.on('message',message=>process.stdout.write(JSON.stringify(message)+'\n'));
   worker.on('error',error=>{process.stdout.write(JSON.stringify({type:'failed',error:error.message})+'\n');process.exitCode=1;input.close();});
   worker.on('exit',()=>input.close());
  }else worker?.postMessage(m);
 }catch{process.exitCode=1;input.close();}
});
input.on('close',()=>{void worker?.terminate();});

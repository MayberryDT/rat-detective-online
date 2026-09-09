import {EventEmitter} from 'node:events';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {homedir} from 'node:os';
/** Fixed known SSH alias, strict host verification, no credentials in argv. */
export class RemoteCapacityWorker extends EventEmitter {
 constructor(directory,workerData){
  super();
  if(!/^\/tmp\/rat-capacity-[a-zA-Z0-9-]+$/.test(directory))throw Error('Invalid remote runtime directory');
  this.child=spawn('ssh',['-F',`${homedir()}/.ssh/config`,'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3','halla',`node ${directory}/capacity-agent.mjs`],{stdio:['pipe','pipe','pipe']});
  createInterface({input:this.child.stdout}).on('line',line=>{try{this.emit('message',JSON.parse(line));}catch{this.emit('error',Error('Malformed remote generator response'));}});
  this.child.stderr.on('data',()=>{});
  this.child.on('error',e=>this.emit('error',e));this.child.on('exit',code=>this.emit('exit',code??1));
  this.child.stdin.on('error',()=>{});
  this.postMessage({type:'init',workerData:{...workerData,validator:`${directory}/validator.mjs`}});
 }
 postMessage(message){if(!this.child.stdin.destroyed)this.child.stdin.write(JSON.stringify(message)+'\n');}
 async terminate(){this.child.stdin.end();if(this.child.exitCode!==null)return;await new Promise(resolve=>{const timer=setTimeout(()=>{this.child.kill('SIGTERM');resolve();},2000);this.child.once('exit',()=>{clearTimeout(timer);resolve();});});}
}

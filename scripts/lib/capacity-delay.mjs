import {EventEmitter} from 'node:events';
import WebSocket from 'ws';
/** Bounded, ordered application-delivery delay, not packet-loss emulation. */
export class DelayedSocket extends EventEmitter {
 constructor(url,options,{latency=0,jitter=0,seed=1}={}){
  super();this.ws=new WebSocket(url,options);this.pending=new Map();this.bytes=0;this.outBytes=0;this.dead=false;
  let random=seed|0;this.draw=()=>{random=(Math.imul(random,1664525)+1013904223)|0;return (random>>>0)/4294967296;};this.latency=latency;this.jitter=jitter;this.due={in:0,out:0};this.queues={in:[],out:[]};
  this.ws.on('open',()=>this.emit('open'));this.ws.on('error',e=>this.emit('error',e));
  this.ws.on('message',raw=>this.schedule('in',raw.length,()=>this.emit('message',raw)));
  this.ws.on('close',(code,reason)=>{this.clear();this.emit('close',code,reason);});
 }
 get readyState(){return this.ws.readyState;}
 get bufferedAmount(){return this.ws.bufferedAmount+this.outBytes;}
 schedule(direction,bytes,callback){
  if(this.dead)return;
  if(this.bytes+bytes>4*1024*1024||this.pending.size>=4096){this.emit('error',Error('Impairment queue exceeded budget'));this.terminate();return;}
  const now=performance.now(),due=Math.max(this.due[direction],now+this.latency+this.jitter*this.draw());this.due[direction]=due;
  this.bytes+=bytes;if(direction==='out')this.outBytes+=bytes;
  // Equal deadlines may fire out of order after timer rounding. Only drain
  // a ready prefix, preserving WebSocket ordering regardless of timer order.
  const entry={ready:false,bytes,callback};this.queues[direction].push(entry);
  const timer=setTimeout(()=>{
   this.pending.delete(timer);entry.ready=true;
   const queue=this.queues[direction];
   while(!this.dead&&queue[0]?.ready){const next=queue.shift();this.bytes-=next.bytes;if(direction==='out')this.outBytes-=next.bytes;next.callback();}
  },Math.max(0,due-now));this.pending.set(timer,bytes);
 }
 send(data){this.schedule('out',Buffer.byteLength(data),()=>{if(this.ws.readyState===WebSocket.OPEN)this.ws.send(data);});}
 clear(){this.dead=true;for(const t of this.pending.keys())clearTimeout(t);this.pending.clear();this.queues.in.length=0;this.queues.out.length=0;this.bytes=0;this.outBytes=0;}
 close(){this.clear();this.ws.close();}
 terminate(){this.clear();this.ws.terminate();}
}

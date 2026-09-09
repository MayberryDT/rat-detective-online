import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec=promisify(execFile);
/** Aggregate only the generator process's sockets; never retain endpoints. */
export function parseTcpStats(text,pid) {
  const lines=text.split('\n');
  const result={available:true,sockets:0,bytesReceived:0,bytesRetransmitted:0,outOfOrderPackets:0,retransmissions:0};
  for(let i=0;i<lines.length;i++)if(lines[i].includes(`pid=${pid},`)){
    const info=lines[i+1]??'';result.sockets++;
    const count=key=>Number(info.match(new RegExp(`\\b${key}:(\\d+)`))?.[1]??0);
    result.bytesReceived+=count('bytes_received');result.bytesRetransmitted+=count('bytes_retrans');result.outOfOrderPackets+=count('rcv_ooopack');
    result.retransmissions+=Number(info.match(/\bretrans:\d+\/(\d+)/)?.[1]??0);
  }
  return result;
}
export async function sampleTcpStats(){
  try{const {stdout}=await exec('ss',['-tinpH'],{timeout:2000,maxBuffer:2*1024*1024});return {at:Date.now(),...parseTcpStats(stdout,process.pid)};}
  catch{return {at:Date.now(),available:false};}
}

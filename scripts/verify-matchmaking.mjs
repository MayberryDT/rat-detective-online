// Bounded protocol check through the existing local authenticated relay; no gameplay input.
import WebSocket from 'ws';
const origin=new URL(process.argv[2]??'http://127.0.0.1:5180');
if(!['127.0.0.1','localhost'].includes(origin.hostname))throw Error('Use the local preview relay');
const pool=`graybox-benchmark-match-check-${Date.now().toString(36)}`;
const sockets=[];
const join=()=>new Promise((resolve,reject)=>{
 const url=new URL('/ws',origin);url.protocol='ws:';url.searchParams.set('room',pool);
 const ws=new WebSocket(url,{origin:origin.origin});sockets.push(ws);
 const timer=setTimeout(()=>{ws.terminate();reject(Error('Join timeout'));},20000);
 const players=new Map();let welcome;
 ws.on('open',()=>ws.send(JSON.stringify({type:'join',protocolVersion:1,name:'Lobby Check',appearance:{hatType:'fedora',hatColor:1,furColor:2,coatColor:3}})));
 ws.on('error',error=>{clearTimeout(timer);reject(error);});
 ws.on('message',raw=>{
  const m=JSON.parse(raw);
  if(m.type==='error'){clearTimeout(timer);reject(Error(m.message));}
  if(m.type==='welcome'){welcome=m;for(const [id,p] of Object.entries(m.players))players.set(id,p);clearTimeout(timer);resolve({ws,welcome,players});}
  if(m.type==='playerJoined')players.set(m.player.id,m.player);
  if(m.type==='playerLeft')players.delete(m.id);
 });
});
const close=ws=>new Promise(resolve=>{if(ws.readyState===WebSocket.CLOSED)return resolve();ws.once('close',resolve);ws.close(1000,'verification complete');setTimeout(()=>{ws.terminate();resolve();},2000).unref();});
try{
 const first=await join();
 if(first.players.size!==8)throw Error(`Initial roster ${first.players.size}`);
 const joined=[first,...await Promise.all(Array.from({length:43},join))];
 const rooms={};for(const c of joined)rooms[c.welcome.matchRoom]=(rooms[c.welcome.matchRoom]??0)+1;
 const sizes=Object.values(rooms).sort((a,b)=>b-a);if(JSON.stringify(sizes)!=='[24,20]')throw Error(`Room sizes ${sizes}`);
 console.log(JSON.stringify({stage:'admission',humans:44,roomSizes:sizes,initialTotal:8,roomCount:Object.keys(rooms).length}));
 await Promise.all(joined.slice(1).map(c=>close(c.ws)));
 const end=Date.now()+16000;
 while(Date.now()<end&&(first.players.size!==8||[...first.players.keys()].filter(id=>id.startsWith('rd-ai-')).length!==7))await new Promise(r=>setTimeout(r,200));
 const bots=[...first.players.keys()].filter(id=>id.startsWith('rd-ai-')).length;
 if(first.players.size!==8||bots!==7)throw Error(`Backfill roster ${first.players.size}, AI ${bots}`);
 console.log(JSON.stringify({stage:'backfill',humans:1,ai:bots,total:first.players.size}));
}finally{await Promise.all(sockets.map(close));}

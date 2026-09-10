// Six local AI clients for the explicitly named private human-playtest room.
// Uses the frozen fixture's navigation/physics and the existing loopback relay.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {build} from 'esbuild';
import WebSocket from 'ws';
const {values}=parseArgs({options:{deployment:{type:'string'}}});
if(!values.deployment)throw Error('Supply --deployment=/absolute/deployment.json');
const receipt=JSON.parse(await readFile(values.deployment,'utf8'));
if(Date.now()>=receipt.expiresAt)throw Error('Fixture expired');
const origin='http://127.0.0.1:5190';
const room='graybox-benchmark-human-playtest';
const health=await fetch(`${origin}/health`);if(!health.ok)throw Error('Private relay unavailable');
const bundle=`${receipt.stage}/playtest-bot-controller.mjs`;
await build({entryPoints:[`${receipt.stage}/src/worker/ServerBotController.ts`],outfile:bundle,bundle:true,packages:'external',platform:'node',format:'esm'});
const {ServerBotController}=await import(pathToFileURL(bundle));
const codec=await import(pathToFileURL(`${receipt.stage}/validator.mjs`));
const Decoder=codec.DeliveryDecoder??codec.ChaosDecoder,protocolVersion=codec.PROTOCOL_VERSION??5;
const names=['Constable Trap','Inspector Nibbles','Sergeant Stilton','Detective Crumbs','Officer Whiskers','Captain Cheddar'];
const clients=[],players=new Map();let chaos,world,controller,playing=true,stopping=false,tick,heartbeat,expiry,moves=0,shots=0;
function stop(){if(stopping)return;stopping=true;clearInterval(tick);clearInterval(heartbeat);clearTimeout(expiry);controller?.dispose();for(const c of clients)c.ws.close();setTimeout(()=>{for(const c of clients)c.ws.terminate();},1000).unref();}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
function apply(m){switch(m.type){
 case 'welcome':world=m.world;players.clear();for(const p of Object.values(m.players))players.set(p.id,{...p});playing=m.round.phase==='playing';break;
 case 'currentPlayers':players.clear();for(const p of Object.values(m.players))players.set(p.id,{...p});break;
 case 'playerJoined':players.set(m.player.id,{...m.player});break;
 case 'playerLeft':players.delete(m.id);break;
 case 'playerMoved':case 'playerCorrected':if(players.has(m.player.id))Object.assign(players.get(m.player.id),m.player);if(m.type==='playerCorrected')controller?.reset(m.player.id,m.player);break;
 case 'playerDamaged':if(players.has(m.id))players.get(m.id).hp=m.hp;break;
 case 'playerDied':if(players.has(m.victimId))players.get(m.victimId).hp=0;break;
 case 'playerRespawn':if(players.has(m.id))Object.assign(players.get(m.id),m);controller?.reset(m.id,m);break;
 case 'gameWon':playing=false;break;
 case 'gameReset':playing=true;chaos=undefined;break;
 case 'chaos':chaos=m.state;break;
}}
try{
 for(let i=0;i<6;i++)await new Promise((resolve,reject)=>{
  const c={ws:new WebSocket(`ws://127.0.0.1:5190/ws?room=${room}&chaos=compact-v1`,{headers:{Origin:origin}}),decoder:new Decoder(),id:null};clients.push(c);
  const timeout=setTimeout(()=>reject(Error('Bot join timeout')),15000);
  c.ws.on('open',()=>c.ws.send(JSON.stringify({type:'join',protocolVersion,name:names[i],appearance:{hatType:'fedora',hatColor:0x554433,furColor:0x777777,coatColor:0x333344}})));
  c.ws.on('error',error=>{clearTimeout(timeout);reject(error);stop();});
  c.ws.on('close',(code)=>{clearTimeout(timeout);if(!stopping){console.error(JSON.stringify({event:'bot-disconnected',name:names[i],code}));stop();}});
  c.ws.on('message',raw=>{
   const decoded=c.decoder.read(raw.toString());if(!decoded){reject(Error('Invalid server frame'));stop();return;}
   const m=decoded.message;
   if(!m){if(decoded.ack&&c.ws.readyState===WebSocket.OPEN)c.ws.send(JSON.stringify(decoded.ack));return;}
   if(i===0)apply(m);
   if(m.type==='welcome'){c.id=m.id;world??=m.world;players.set(m.id,{...m.player});clearTimeout(timeout);resolve();}
   if(m.type==='error'){console.error(JSON.stringify({event:'server-error',message:m}));stop();}
   if(decoded.ack&&c.ws.readyState===WebSocket.OPEN)c.ws.send(JSON.stringify(decoded.ack));
  });
 });
 const send=(id,message)=>{const c=clients.find(c=>c.id===id);if(c?.ws.readyState===WebSocket.OPEN&&c.ws.bufferedAmount<65536)c.ws.send(JSON.stringify(message));};
 controller=new ServerBotController(world,clients.map(c=>c.id),{
  move:(id,position,facing)=>{const rotation={x:0,y:Math.sin(facing/2),z:0,w:Math.cos(facing/2)};send(id,{type:'updateMovement',position,rotation,meshRotation:rotation});moves++;},
  shoot:(id,origin,direction)=>{send(id,{type:'shoot',shotId:crypto.randomUUID(),origin,direction});shots++;}
 });
 let previous=performance.now(),accumulator=0;
 tick=setInterval(()=>{const now=performance.now();accumulator=Math.min(.1,accumulator+(now-previous)/1000);previous=now;while(accumulator>=1/60){controller.step(1/60,Date.now(),players,chaos,playing);accumulator-=1/60;}},1000/60);
 heartbeat=setInterval(()=>{for(const c of clients)send(c.id,{type:'ping',sentAt:Date.now()});},1000);
 expiry=setTimeout(stop,Math.max(1,receipt.expiresAt-Date.now()));
 console.log(JSON.stringify({event:'six-bots-ready',names,room,pid:process.pid,expiresAt:receipt.expiresAt}));
 setTimeout(()=>{if(!stopping)console.log(JSON.stringify({event:'activity-check',connected:clients.filter(c=>c.ws.readyState===WebSocket.OPEN).length,moves,shots,roster:players.size}));},8000).unref();
}catch(error){console.error(error);stop();process.exitCode=1;}

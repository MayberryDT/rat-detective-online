import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const bundle=await build({stdin:{contents:"export {DeliveryDecoder} from './src/shared/deliveryWire.ts'; export {PROTOCOL_VERSION,MAX_PLAYERS} from './src/shared/networkProtocol.ts';",resolveDir:fileURLToPath(new URL('../../',import.meta.url))},bundle:true,write:false,format:'esm',platform:'node'});
const codec=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
export const {DeliveryDecoder,PROTOCOL_VERSION,MAX_PLAYERS}=codec;
const decoders=new WeakMap(),pending=new WeakMap();
export function acknowledgeSocket(socket,ack){
  if(!ack)return;
  if(pending.has(socket)){pending.get(socket).ack=ack;return;}
  const entry={ack};pending.set(socket,entry);
  setTimeout(()=>{pending.delete(socket);if(socket.readyState===1)socket.send(JSON.stringify(entry.ack));},10);
}
export function readSocketMessage(socket,raw){
  if(!decoders.has(socket))decoders.set(socket,new DeliveryDecoder());
  const decoded=decoders.get(socket).read(String(raw));
  if(!decoded)throw Error('Invalid server delivery');
  acknowledgeSocket(socket,decoded.ack);
  return decoded.message;
}

import { DeliveryDecoder } from '../../src/shared/deliveryWire';
const decoders=new WeakMap<WebSocket,DeliveryDecoder>();
const acks=new WeakMap<WebSocket,{ack:unknown}>();
export function readSocketMessage(ws:WebSocket,raw:unknown) {
  let decoder=decoders.get(ws);if(!decoder){decoder=new DeliveryDecoder();decoders.set(ws,decoder);}
  const decoded=decoder.read(typeof raw==='string'?raw:String(raw));
  if(!decoded)throw new Error('Invalid server delivery');
  if(decoded.ack && ws.readyState===WebSocket.OPEN){
    const pending=acks.get(ws);
    if(pending)pending.ack=decoded.ack;
    else {
      const entry={ack:decoded.ack as unknown};acks.set(ws,entry);
      setTimeout(()=>{acks.delete(ws);try{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(entry.ack));}catch{/* Closing. */}},10);
    }
  }
  return decoded.message;
}

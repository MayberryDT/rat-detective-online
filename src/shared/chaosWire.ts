import type { ChaosState, ChaosShot } from './chaosState';
import { CHAOS_TUNING } from './chaosState';
import { MAX_SERVER_MESSAGE_BYTES, type ServerMessage } from './networkProtocol';
import { parseServerMessage } from './messageValidation';
export { parseServerMessage } from './messageValidation';

export const CHAOS_WIRE_MODE = 'compact-v2';
const REST_KEYS = ['case','extraCases','dispatch','pressure','possession','corpses','notice'] as const;
type Definition = [number, string, string];
export interface ChaosAck { type:'chaosAck'; stream:string; seq:number }
const rounded = (value: unknown): string => JSON.stringify(value, (_key,v)=>typeof v==='number'?Math.round(v*1000)/1000:v);
const integer = (n: unknown): n is number => typeof n==='number' && Number.isSafeInteger(n);
const record = (v: unknown): v is Record<string,unknown> => !!v && typeof v==='object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v==='string' && v.length>0 && v.length<=64;

/** Prepared once for one broadcast; never cached across mutable simulation states. */
export interface PreparedChaos {
  shots: Array<{id:string;owner:string;motion:string;values:number[]}>;
  rest: Map<string,string>;
}
export function prepareChaos(state:ChaosState):PreparedChaos {
  const flag=(v:boolean|undefined)=>v===undefined?0:v?2:1;
  return {shots:state.shots.map(s=>{const values=[...[s.p.x,s.p.y,s.p.z,s.v.x,s.v.y,s.v.z,s.age].map(n=>Math.round(n*1000)),flag(s.wallBounced)|(flag(s.returned)<<2)];return {id:s.id,owner:s.owner,values,motion:values.join(',')};}),
    rest:new Map(REST_KEYS.filter(k=>k!=='pressure').map(key=>[key,rounded(state[key]??(key==='extraCases'?[]:undefined))]))};
}

/** Ordered WebSocket frames use the previous SENT baseline. Acks bound flow,
 * not decoding dependencies. Fresh streams and periodic keyframes are complete. */
export class ChaosEncoder {
  private seq=0;
  private nextHandle=1;
  private shots=new Map<string,{handle:number;owner:string}>();
  private rest=new Map<string,string>();
  private motions=new Map<number,number[]>();
  constructor(readonly stream: string = crypto.randomUUID(), private readonly deltaMotion=false) {}
  encode(state: ChaosState, prepared=prepareChaos(state)): {payload:string;seq:number} {
    const seq=++this.seq, full=seq===1||seq%300===0;
    const definitions:Definition[]=[],motion:string[]=[];
    const present=new Set<string>();
    for(const s of prepared.shots){
      present.add(s.id);
      let entry=this.shots.get(s.id);
      const define=!entry||full||entry.owner!==s.owner;
      if(!entry){entry={handle:this.nextHandle++,owner:s.owner};this.shots.set(s.id,entry);definitions.push([entry.handle,s.id,s.owner]);}
      else if(full||entry.owner!==s.owner){definitions.push([entry.handle,s.id,s.owner]);entry.owner=s.owner;}
      const previous=this.motions.get(entry.handle);
      const delta=this.deltaMotion&&!define&&previous?s.values.map((value,i)=>value-previous[i]):undefined;
      const deltaText=delta?.join(',');
      motion.push('['+(deltaText!==undefined&&deltaText.length<s.motion.length?-entry.handle+','+deltaText:entry.handle+','+s.motion)+']');
      this.motions.set(entry.handle,s.values);
    }
    for(const [key,entry] of this.shots)if(!present.has(key)){this.motions.delete(entry.handle);this.shots.delete(key);}
    const rest:string[]=[];
    for(const key of REST_KEYS){
      // Optional fields use their canonical empty representation so deletions travel.
      const value=state[key]??(key==='extraCases'?[]:key==='pressure'?null:undefined);
      const encoded=key==='pressure'?rounded(value):prepared.rest.get(key)!;
      if(full||this.rest.get(key)!==encoded){rest.push(JSON.stringify(key)+':'+encoded);this.rest.set(key,encoded);}
    }
    const payload='{"type":"chaosFrame",'+(this.deltaMotion?'"motionEncoding":"delta-v1",':'')+'"stream":'+JSON.stringify(this.stream)+',"seq":'+seq+',"base":'+(full?0:seq-1)+',"time":'+rounded(state.time)+',"definitions":'+JSON.stringify(definitions)+',"motion":['+motion.join(',')+'],"rest":{'+rest.join(',')+'},"impacts":'+rounded(state.impacts)+'}';
    if(new TextEncoder().encode(payload).byteLength>MAX_SERVER_MESSAGE_BYTES)throw new Error('Compact snapshot budget exceeded');
    return {payload,seq};
  }
}

/** Validates reconstructed state with the existing gameplay validator before
 * committing a baseline or exposing anything to the session. One per socket. */
export class ChaosDecoder {
  private stream='';
  private seq=0;
  private definitions=new Map<number,[string,string]>();
  private rest:Record<string,unknown>={};
  private motions=new Map<number,number[]>();
  read(raw: unknown): {message:ServerMessage;ack?:ChaosAck}|null {
    if(typeof raw!=='string')return null;
    if(raw.length>MAX_SERVER_MESSAGE_BYTES||new TextEncoder().encode(raw).byteLength>MAX_SERVER_MESSAGE_BYTES)return null;
    let value:unknown;try{value=JSON.parse(raw);}catch{return null;}
    if(!record(value))return null;
    if(value.type!=='chaosFrame'){const message=parseServerMessage(value);return message?{message}:null;}
    const f=value;
    if(f.motionEncoding!==undefined&&f.motionEncoding!=='delta-v1')return null;
    if(!id(f.stream)||!integer(f.seq)||f.seq<1||!integer(f.base)||f.base<0||!record(f.rest)||
      !Array.isArray(f.definitions)||f.definitions.length>CHAOS_TUNING.maxShots||!Array.isArray(f.motion)||f.motion.length>CHAOS_TUNING.maxShots)return null;
    const full=f.base===0;
    if(!full&&(f.stream!==this.stream||f.base!==this.seq||f.seq!==this.seq+1))return null;
    if(full&&f.stream===this.stream&&f.seq<=this.seq)return null;
    if(Object.keys(f.rest).some(k=>!REST_KEYS.some(allowed=>allowed===k)))return null;
    const definitions=full?new Map<number,[string,string]>():new Map(this.definitions);
    const changed=new Set<number>();
    for(const d of f.definitions){
      if(!Array.isArray(d)||d.length!==3||!integer(d[0])||d[0]<1||!id(d[1])||!id(d[2])||changed.has(d[0]))return null;
      changed.add(d[0]);definitions.set(d[0],[d[1],d[2]]);
    }
    const shots:ChaosShot[]=[],active=new Set<number>(),ids=new Set<string>();
    const motions=new Map<number,number[]>();
    for(const encoded of f.motion){
      if(!Array.isArray(encoded)||encoded.length!==9||!encoded.every(integer)||encoded[0]===0)return null;
      const handle=Math.abs(encoded[0]);if(active.has(handle))return null;
      const previous=this.motions.get(handle);
      if(encoded[0]<0&&(f.motionEncoding!=='delta-v1'||full||changed.has(handle)||!previous))return null;
      const row=encoded[0]<0?[handle,...encoded.slice(1).map((n,i)=>n+previous![i])]:encoded;
      if(!row.every(integer))return null;
      const d=definitions.get(handle),flags=row[8];
      if(!d||ids.has(d[0])||flags<0||flags>10||(flags&3)===3||((flags>>2)&3)===3)return null;
      active.add(handle);ids.add(d[0]);motions.set(handle,row.slice(1));
      shots.push({id:d[0],owner:d[1],p:{x:row[1]/1000,y:row[2]/1000,z:row[3]/1000},v:{x:row[4]/1000,y:row[5]/1000,z:row[6]/1000},age:row[7]/1000,
        ...((flags&3)?{wallBounced:(flags&3)===2}:{}),...((flags>>2)?{returned:(flags>>2)===2}:{})});
    }
    // Membership is complete on every frame, so omitted projectiles cannot linger.
    for(const handle of definitions.keys())if(!active.has(handle))definitions.delete(handle);
    const rest={...(full?{}:this.rest),...f.rest};
    if(rest.pressure===null)delete rest.pressure;
    const message=parseServerMessage({type:'chaos',state:{...rest,time:f.time,shots,impacts:f.impacts}});
    if(!message||message.type!=='chaos')return null;
    this.stream=f.stream;this.seq=f.seq;this.definitions=definitions;this.rest=structuredClone(rest);this.motions=motions;
    return {message,ack:{type:'chaosAck',stream:f.stream,seq:f.seq}};
  }
}

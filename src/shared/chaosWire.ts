import type { ChaosState, ChaosShot, ChaosImpact } from './chaosState';
import { CHAOS_TUNING, CROSSFIRE } from './chaosState';
import { MAX_SERVER_MESSAGE_BYTES, wireBytes, type ServerMessage } from './networkProtocol';
import { parseServerMessage } from './messageValidation';
import { expandMovement } from './movementWire';
export { parseServerMessage } from './messageValidation';

export const CHAOS_WIRE_MODE = 'compact-v2';
/** A ball's motion rows after its first are relative: the change from its previous row, or, once two rows are known,
 * the miss of a straight-line prediction from them (balls fly smooth arcs, so most rows are a few small numbers).
 * Trailing zeros are left off. */
export const MOTION_ENCODING = 'predict-v1';
const REST_KEYS = ['case','extraCases','dispatch','pressure','possession','corpses','notice','assignment','pickups','buffs','traps','beams'] as const;
/** Lists of things with ids. While a list changes only by edits, removals and additions at its end, it travels as
 * `{put,drop}` (changed and new items, ids gone) when that is shorter than the whole list. */
const KEYED_KEYS: Record<string, true> = { corpses: true, beams: true, traps: true };
const restValue=(state:ChaosState,key:typeof REST_KEYS[number]):unknown=>
  state[key]??(key==='extraCases'?[]:key==='pressure'||key==='assignment'||key==='pickups'||key==='buffs'||key==='traps'||key==='beams'?null:undefined);
type Definition = [number, string, string | null];
type KeyedItem = {id:string;text:string};
export interface ChaosAck { type:'chaosAck'; stream:string; seq:number }
const rounded = (value: unknown): string => JSON.stringify(value, (_key,v)=>typeof v==='number'?Math.round(v*1000)/1000:v);
const integer = (n: unknown): n is number => typeof n==='number' && Number.isSafeInteger(n);
const record = (v: unknown): v is Record<string,unknown> => !!v && typeof v==='object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v==='string' && v.length>0 && v.length<=64;

/** An impact as a row: position, normal, flags (1 surface, 2 audio only, 4 `audioOnly: false`), then scale, cue,
 * foley, energy and Crossfire bounces, null where absent and trailing nulls left off. */
function impactRow(i:ChaosImpact):unknown[] {
  const row:unknown[]=[i.p.x,i.p.y,i.p.z,i.n.x,i.n.y,i.n.z,(i.surface?1:0)|(i.audioOnly===true?2:i.audioOnly===false?4:0),i.scale??null,i.cue??null,i.foley??null,i.energy??null,i.bounces??null];
  while(row.length>7&&row[row.length-1]===null)row.pop();
  return row;
}
/** Each item's rounded text, or undefined when an item has no id or two share one (the list then travels whole). */
function keyedItems(value:readonly unknown[]):KeyedItem[]|undefined {
  const items:KeyedItem[]=[],seen=new Set<string>();
  for(const item of value){
    if(!record(item)||typeof item.id!=='string'||seen.has(item.id))return undefined;
    seen.add(item.id);items.push({id:item.id,text:rounded(item)});
  }
  return items;
}
/** `{put,drop}` from the list last sent to `items`, or undefined when the decoder's rule (kept items stay in place,
 * new ones go at the end) would not rebuild `items` in order. */
function keyedDelta(sent:ReadonlyMap<string,string>,items:readonly KeyedItem[]):string|undefined {
  const current=new Set<string>();for(const item of items)current.add(item.id);
  const drop:string[]=[],kept:string[]=[];
  for(const key of sent.keys())(current.has(key)?kept:drop).push(key);
  const put:string[]=[];let next=0;
  for(const item of items){
    const text=sent.get(item.id);
    if(text===undefined){if(next<kept.length)return undefined;put.push(item.text);continue;}
    if(kept[next++]!==item.id)return undefined;
    if(text!==item.text)put.push(item.text);
  }
  return '{"put":['+put.join(',')+'],"drop":'+JSON.stringify(drop)+'}';
}
/** The order of a relative row's numbers, likeliest zero last so more trailing zeros drop: height, x, z, vertical
 * speed, age (each misses by a rounding unit or gravity's pull), then x and z speed, flags and the optional tail.
 * Its first n entries are a row of n numbers (8 to 10). */
const RELATIVE_ORDER = [1,0,2,4,6,3,5,7,8,9] as const;
/** A relative motion row's numbers after the handle, in `RELATIVE_ORDER`: against the prediction from `previous` and
 * `base` when the base is known, otherwise against `previous`; trailing zeros left off. */
function relativeMotion(values:readonly number[],previous:readonly number[],base:readonly number[]|undefined):string {
  let end=values.length;
  while(end>0){const i=RELATIVE_ORDER[end-1];if(values[i]!==(base?2*previous[i]-base[i]:previous[i]))break;end--;}
  let text='';
  for(let k=0;k<end;k++){const i=RELATIVE_ORDER[k];text+=','+(values[i]-(base?2*previous[i]-base[i]:previous[i]));}
  return text;
}

/** Prepared once for one broadcast; never cached across mutable simulation states. */
export interface PreparedChaos {
  shots: Array<{id:string;owner:string|null;motion:string;values:number[];relative:WeakMap<number[],{base:number[]|undefined;text:string}>}>;
  rest: Map<string,string>;
  /** The keyed lists' items (`KEYED_KEYS`), when every item has its own id. */
  items: Map<string,KeyedItem[]>;
  impacts: ChaosState['impacts'];
  impactText: string;
  pressure: ChaosState['pressure'];
  pressureText: string;
}
export function prepareChaos(state:ChaosState):PreparedChaos {
  const flag=(v:boolean|undefined)=>v===undefined?0:v?2:1;
  return {shots:state.shots.map(s=>{
    // Flags: the bounce flag (0 absent, 1 false, 2 true) plus three times the Crossfire heat.
    const flags=flag(s.wallBounced)+3*(s.heat??0);
    const life=s.life===undefined?0:Math.round(s.life*1000);
    const values=[...[s.p.x,s.p.y,s.p.z,s.v.x,s.v.y,s.v.z,s.age].map(n=>Math.round(n*1000)),flags];
    // Optional tail: a longer lifetime (Crossfire, Bad Ammunition).
    if(life)values.push(life);
    return {id:s.id,owner:s.owner,values,motion:values.join(','),relative:new WeakMap<number[],{base:number[]|undefined;text:string}>()};
  }),
    impacts:state.impacts,impactText:rounded(state.impacts.map(impactRow)),pressure:state.pressure,pressureText:rounded(state.pressure??null),
    ...restTexts(state)};
}
function restTexts(state:ChaosState):Pick<PreparedChaos,'rest'|'items'> {
  const rest=new Map<string,string>(),items=new Map<string,KeyedItem[]>();
  for(const key of REST_KEYS){
    if(key==='pressure')continue;
    const value=restValue(state,key),list=KEYED_KEYS[key]&&Array.isArray(value)?keyedItems(value):undefined;
    if(list){items.set(key,list);rest.set(key,'['+list.map(item=>item.text).join(',')+']');}
    else rest.set(key,rounded(value));
  }
  return {rest,items};
}

/** Ordered WebSocket frames use the previous SENT baseline. Acks bound flow,
 * not decoding dependencies. Fresh streams and periodic keyframes are complete. */
export class ChaosEncoder {
  private seq=0;
  private nextHandle=1;
  /** Handles of balls gone, reused so handles stay as short as the most balls ever in flight at once. */
  private freeHandles:number[]=[];
  private shots=new Map<string,{handle:number;owner:string|null}>();
  private rest=new Map<string,string>();
  /** The keyed lists as last sent: item texts by id, in list order. */
  private items=new Map<string,Map<string,string>>();
  private motions=new Map<number,number[]>();
  /** The row before each ball's last, while its last two rows are of one flight (`MOTION_ENCODING`). */
  private bases=new Map<number,number[]>();
  constructor(readonly stream: string = crypto.randomUUID(), private readonly deltaMotion=false) {}
  encode(state: ChaosState, prepared=prepareChaos(state)): {payload:string;seq:number;bytes:number;ack:ChaosAck} {
    const seq=++this.seq, full=seq===1||seq%300===0;
    const definitions:Definition[]=[],motion:string[]=[];
    const present=new Set<string>();
    for(const s of prepared.shots){
      present.add(s.id);
      let entry=this.shots.get(s.id);
      const define=!entry||full||entry.owner!==s.owner;
      if(!entry){entry={handle:this.freeHandles.pop()??this.nextHandle++,owner:s.owner};this.shots.set(s.id,entry);definitions.push([entry.handle,s.id,s.owner]);}
      else if(full||entry.owner!==s.owner){definitions.push([entry.handle,s.id,s.owner]);entry.owner=s.owner;}
      const previous=this.motions.get(entry.handle),continued=!define&&!!previous&&previous.length===s.values.length;
      let relative:string|undefined;
      if(this.deltaMotion&&continued&&previous){
        const base=this.bases.get(entry.handle),cached=s.relative.get(previous);
        if(cached&&cached.base===base)relative=cached.text;
        else{relative=relativeMotion(s.values,previous,base);s.relative.set(previous,{base,text:relative});}
      }
      motion.push('['+(relative!==undefined&&relative.length<s.motion.length?-entry.handle+relative:entry.handle+','+s.motion)+']');
      if(continued&&previous)this.bases.set(entry.handle,previous);else this.bases.delete(entry.handle);
      this.motions.set(entry.handle,s.values);
    }
    for(const [key,entry] of this.shots)if(!present.has(key)){this.motions.delete(entry.handle);this.bases.delete(entry.handle);this.shots.delete(key);this.freeHandles.push(entry.handle);}
    const rest:string[]=[];
    for(const key of REST_KEYS){
      // Optional fields use their canonical empty representation so deletions travel.
      const encoded=key==='pressure'?(state.pressure===prepared.pressure?prepared.pressureText:rounded(restValue(state,key))):prepared.rest.get(key)!;
      if(!full&&this.rest.get(key)===encoded)continue;
      const items=prepared.items.get(key),sent=this.items.get(key),delta=!full&&items&&sent?keyedDelta(sent,items):undefined;
      rest.push(JSON.stringify(key)+':'+(delta!==undefined&&delta.length<encoded.length?delta:encoded));this.rest.set(key,encoded);
      if(items)this.items.set(key,new Map(items.map(item=>[item.id,item.text])));else this.items.delete(key);
    }
    const identity=state.epoch===undefined&&state.tick===undefined?'':',"epoch":'+JSON.stringify(state.epoch??'legacy')+',"tick":'+Math.max(0,Math.floor(state.tick??0));
    const payload='{"type":"chaosFrame",'+(this.deltaMotion?'"motionEncoding":"'+MOTION_ENCODING+'",':'')+'"stream":'+JSON.stringify(this.stream)+',"seq":'+seq+',"base":'+(full?0:seq-1)+',"time":'+rounded(state.time)+identity+',"definitions":'+JSON.stringify(definitions)+',"motion":['+motion.join(',')+'],"rest":{'+rest.join(',')+'},"impacts":'+(state.impacts===prepared.impacts?prepared.impactText:rounded(state.impacts.map(impactRow)))+'}';
    const bytes=wireBytes(payload);
    if(bytes>MAX_SERVER_MESSAGE_BYTES)throw new Error('Compact snapshot budget exceeded');
    return {payload,seq,bytes,ack:{type:'chaosAck',stream:this.stream,seq}};
  }
}

/** Validates reconstructed state with the existing gameplay validator before
 * committing a baseline or exposing anything to the session. One per socket. */
export class ChaosDecoder {
  private stream='';
  private seq=0;
  private definitions=new Map<number,[string,string|null]>();
  private rest:Record<string,unknown>={};
  private motions=new Map<number,number[]>();
  private bases=new Map<number,number[]>();
  read(raw: unknown): {message:ServerMessage;ack?:ChaosAck}|null {
    if(typeof raw!=='string')return null;
    if(raw.length>MAX_SERVER_MESSAGE_BYTES||wireBytes(raw)>MAX_SERVER_MESSAGE_BYTES)return null;
    let value:unknown;try{value=JSON.parse(raw);}catch{return null;}
    return this.readValue(value);
  }
  /** Used only after the bounded delivery decoder has reconstructed an envelope. */
  readValue(value: unknown): {message:ServerMessage;ack?:ChaosAck}|null {
    if(!record(value))return null;
    if(value.type==='movementFrame'){const message=parseServerMessage(expandMovement(value));return message?{message}:null;}
    if(value.type!=='chaosFrame'){const message=parseServerMessage(value);return message?{message}:null;}
    const f=value;
    if(f.motionEncoding!==undefined&&f.motionEncoding!==MOTION_ENCODING)return null;
    if(!id(f.stream)||(f.epoch!==undefined&&!id(f.epoch))||(f.tick!==undefined&&(!integer(f.tick)||f.tick<0))||!integer(f.seq)||f.seq<1||!integer(f.base)||f.base<0||!record(f.rest)||
      !Array.isArray(f.definitions)||f.definitions.length>CHAOS_TUNING.maxShots||!Array.isArray(f.motion)||f.motion.length>CHAOS_TUNING.maxShots)return null;
    const full=f.base===0;
    if(!full&&(f.stream!==this.stream||f.base!==this.seq||f.seq!==this.seq+1))return null;
    if(full&&f.stream===this.stream&&f.seq<=this.seq)return null;
    if(Object.keys(f.rest).some(k=>!REST_KEYS.some(allowed=>allowed===k)))return null;
    const definitions=full?new Map<number,[string,string|null]>():new Map(this.definitions);
    const changed=new Set<number>();
    for(const d of f.definitions){
      if(!Array.isArray(d)||d.length!==3||!integer(d[0])||d[0]<1||!id(d[1])||(d[2]!==null&&!id(d[2]))||changed.has(d[0]))return null;
      changed.add(d[0]);definitions.set(d[0],[d[1],d[2]]);
    }
    const shots:ChaosShot[]=[],active=new Set<number>(),ids=new Set<string>();
    const motions=new Map<number,number[]>(),bases=new Map<number,number[]>();
    for(const encoded of f.motion){
      if(!Array.isArray(encoded)||encoded.length<1||encoded.length>11||!encoded.every(integer)||encoded[0]===0)return null;
      const handle=Math.abs(encoded[0]);if(active.has(handle))return null;
      const previous=this.motions.get(handle),fresh=full||changed.has(handle);
      let row:number[];
      if(encoded[0]<0){
        // Relative row: the change from the previous row, or the miss of the prediction from the last two.
        if(f.motionEncoding!==MOTION_ENCODING||fresh||!previous||encoded.length>previous.length+1)return null;
        const base=this.bases.get(handle);
        row=new Array<number>(previous.length);
        for(let k=0;k<previous.length;k++){const i=RELATIVE_ORDER[k];row[i]=(encoded[k+1]??0)+(base?2*previous[i]-base[i]:previous[i]);if(!integer(row[i]))return null;}
      }else{
        if(encoded.length<9)return null;
        row=encoded.slice(1);
      }
      const d=definitions.get(handle),flags=row[7];
      if(!d||ids.has(d[0])||flags<0||flags>2+3*CROSSFIRE.maxHeat)return null;
      active.add(handle);ids.add(d[0]);motions.set(handle,row);
      if(!fresh&&previous&&previous.length===row.length)bases.set(handle,previous);
      const life=row[8];
      const shot:ChaosShot={id:d[0],owner:d[1],p:{x:row[0]/1000,y:row[1]/1000,z:row[2]/1000},v:{x:row[3]/1000,y:row[4]/1000,z:row[5]/1000},age:row[6]/1000};
      if(flags%3)shot.wallBounced=flags%3===2;
      if(flags>=3)shot.heat=Math.floor(flags/3);
      if(life)shot.life=life/1000;
      shots.push(shot);
    }
    // Membership is complete on every frame, so omitted projectiles cannot linger.
    for(const handle of definitions.keys())if(!active.has(handle))definitions.delete(handle);
    const rest:Record<string,unknown>={...(full?{}:this.rest)};
    for(const [key,value] of Object.entries(f.rest)){
      if(!KEYED_KEYS[key]||!record(value)){rest[key]=value;continue;}
      if(full)return null;
      const list=keyedList(this.rest[key],value);if(!list)return null;
      rest[key]=list;
    }
    const impacts=impactObjects(f.impacts);if(!impacts)return null;
    if(rest.pressure===null)delete rest.pressure;
    if(rest.assignment===null)delete rest.assignment;
    if(rest.pickups===null)delete rest.pickups;
    if(rest.buffs===null)delete rest.buffs;
    if(rest.traps===null)delete rest.traps;
    if(rest.beams===null)delete rest.beams;
    const message=parseServerMessage({type:'chaos',state:{...rest,time:f.time,...(f.epoch===undefined?{}:{epoch:f.epoch}),...(f.tick===undefined?{}:{tick:f.tick}),shots,impacts}});
    if(!message||message.type!=='chaos')return null;
    this.stream=f.stream;this.seq=f.seq;this.definitions=definitions;this.rest=structuredClone(rest);this.motions=motions;this.bases=bases;
    return {message,ack:{type:'chaosAck',stream:f.stream,seq:f.seq}};
  }
}

/** A keyed list rebuilt from the previous one and `{put,drop}`: dropped ids removed, put items replacing theirs in
 * place or appended. Null when the previous value is no list, an id is unknown, or the delta is malformed. */
function keyedList(previous:unknown,delta:Record<string,unknown>):unknown[]|null {
  const {put,drop}=delta;
  if(!Array.isArray(previous)||!Array.isArray(put)||!Array.isArray(drop)||Object.keys(delta).length!==2||put.length>64||drop.length>64||!drop.every(id))return null;
  const gone=new Set<unknown>(drop);
  const list=previous.filter(item=>!(record(item)&&gone.has(item.id)));
  if(gone.size!==drop.length||list.length!==previous.length-gone.size)return null;
  for(const item of put){
    if(!record(item)||!id(item.id))return null;
    const at=list.findIndex(other=>record(other)&&other.id===item.id);
    if(at<0)list.push(item);else list[at]=item;
  }
  return list;
}
/** Impact rows (`impactRow`) back into impacts; the state validator checks every value. */
function impactObjects(rows:unknown):unknown[]|null {
  if(!Array.isArray(rows)||rows.length>64)return null;
  const impacts:unknown[]=[];
  for(const row of rows){
    if(!Array.isArray(row)||row.length<7||row.length>12)return null;
    const [x,y,z,nx,ny,nz,flags,scale,cue,foley,energy,bounces]=row;
    if(!integer(flags)||flags<0||flags>5||(flags&6)===6)return null;
    const impact:Record<string,unknown>={p:{x,y,z},n:{x:nx,y:ny,z:nz},surface:(flags&1)===1};
    if(scale!==undefined&&scale!==null)impact.scale=scale;
    if(cue!==undefined&&cue!==null)impact.cue=cue;
    if(foley!==undefined&&foley!==null)impact.foley=foley;
    if(energy!==undefined&&energy!==null)impact.energy=energy;
    if(bounces!==undefined&&bounces!==null)impact.bounces=bounces;
    if(flags&2)impact.audioOnly=true;else if(flags&4)impact.audioOnly=false;
    impacts.push(impact);
  }
  return impacts;
}

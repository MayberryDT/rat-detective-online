/// <reference types="vite/client" />
import * as THREE from 'three';
import {GRAYBOX_VERSION} from '../shared/grayboxLayout';

/** The city bake cache: on a warm load the city's baked light (graybox and kit vertex light,
 * the street spill atlas, the facade beams) comes from IndexedDB instead of ~0.85 s of CPU.
 * Only derived data is stored (typed arrays and geometry attributes), keyed by everything the
 * bake depends on, the chunk URL included, so any new build starts over. Any read, parse or
 * shape error means a full build; a record is used whole or not at all. */
export const CITY_BAKE_DB='rd-city-bake';
const STORE='bakes',RECENT='#recent',KEEP=2;

/** Item size of every attribute a baked geometry may carry. */
const ITEM_SIZES:Readonly<Record<string,number>>={position:3,normal:3,uv:2,fixedIllumination:3,tint:3,beamUv:2,roomUv:1,strength:1};
/** The attributes of each baked part, as built. */
export const BAKED_ATTRIBUTES={
    lit:['position','normal','uv','fixedIllumination'],
    glow:['position','normal','uv'],
    kit:['position','normal','fixedIllumination'],
    beams:['position','tint','beamUv','roomUv','strength'],
} as const;

export interface BakedGeometry {
    index:Uint16Array|Uint32Array|null;
    names:string[];
    arrays:Float32Array[];
    /** Bounding box min and max, then bounding sphere centre and radius. */
    bounds:Float64Array;
}
export interface SpillBake {atlas:Uint8Array;cells:string[];beams:BakedGeometry[]}
/** What the current build expects the record to hold; any difference is a miss. */
export interface CityBakeShape {
    grayboxGroups:readonly string[];
    kitMerged:readonly string[];
    kitBatches:readonly string[];
    signs:number;
    /** Street readability runs (pools lighting, readability on), so the spill part is present. */
    spill:boolean;
    atlasBytes:number;
}
export interface CityBakeRecord {
    key:string;
    grayboxGroups:string[];graybox:BakedGeometry[];
    kitMerged:string[];kitBatches:string[];kit:BakedGeometry[];kitColors:Float32Array[];
    /** Steady light on each sign, three channels per sign. */
    signs:Float64Array;
    spill:SpillBake|null;
}

/** Every input of the bake: layout version, seed, lighting, readability and the code itself
 * (this chunk's URL, hashed by the build). */
export function cityBakeKey(seed:number,lighting:string,readability:boolean,chunk=import.meta.url):string {
    return `${GRAYBOX_VERSION}|${seed}|${lighting}|${readability?1:0}|${chunk}`;
}

/** A geometry's buffers, as stored (the arrays are shared, not copied). */
export function bakeGeometry(geometry:THREE.BufferGeometry):BakedGeometry {
    const names=Object.keys(geometry.attributes),arrays=names.map(name=>{
        const {array}=geometry.getAttribute(name);
        if(!(array instanceof Float32Array))throw new TypeError(`${name}: not float`);
        return array;
    });
    const index=geometry.index?.array??null;
    if(index!==null&&!(index instanceof Uint16Array)&&!(index instanceof Uint32Array))throw new TypeError('index: not unsigned');
    if(!geometry.boundingBox)geometry.computeBoundingBox();
    if(!geometry.boundingSphere)geometry.computeBoundingSphere();
    const box=geometry.boundingBox!,sphere=geometry.boundingSphere!;
    return {index,names,arrays,bounds:Float64Array.of(...box.min.toArray(),...box.max.toArray(),...sphere.center.toArray(),sphere.radius)};
}

export function restoreGeometry(baked:BakedGeometry):THREE.BufferGeometry {
    const geometry=new THREE.BufferGeometry(),b=baked.bounds;
    if(baked.index)geometry.setIndex(new THREE.BufferAttribute(baked.index,1));
    baked.names.forEach((name,i)=>geometry.setAttribute(name,new THREE.BufferAttribute(baked.arrays[i],ITEM_SIZES[name])));
    geometry.boundingBox=new THREE.Box3(new THREE.Vector3(b[0],b[1],b[2]),new THREE.Vector3(b[3],b[4],b[5]));
    geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(b[6],b[7],b[8]),b[9]);
    return geometry;
}

const field=(value:unknown,key:string):unknown=>typeof value==='object'&&value!==null&&key in value?Reflect.get(value,key):undefined;
const strings=(value:unknown):value is string[]=>Array.isArray(value)&&value.every(item=>typeof item==='string');
const same=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((item,i)=>item===b[i]);

function parseGeometry(value:unknown,expected:readonly string[]):BakedGeometry|undefined {
    const index=field(value,'index'),names=field(value,'names'),arrays=field(value,'arrays'),bounds=field(value,'bounds');
    if(index!==null&&!(index instanceof Uint16Array)&&!(index instanceof Uint32Array))return;
    if(!strings(names)||!same([...names].sort(),[...expected].sort()))return;
    if(!Array.isArray(arrays)||arrays.length!==names.length||!arrays.every(array=>array instanceof Float32Array))return;
    if(!(bounds instanceof Float64Array)||bounds.length!==10||!bounds.every(Number.isFinite))return;
    const floats:Float32Array[]=arrays.filter(array=>array instanceof Float32Array);
    const count=floats[0].length/ITEM_SIZES[names[0]];
    if(!Number.isInteger(count)||count<1||!floats.every((array,i)=>array.length===count*ITEM_SIZES[names[i]]))return;
    if(index){
        if(index.length%3)return;
        for(let i=0;i<index.length;i++)if(index[i]>=count)return;
    }else if(count%3)return;
    return {index,names,arrays:floats,bounds};
}
function parseGeometries(value:unknown,expected:(i:number)=>readonly string[],length:number):BakedGeometry[]|undefined {
    if(!Array.isArray(value)||value.length!==length)return;
    const out:BakedGeometry[]=[];
    for(const [i,item] of value.entries()){const geometry=parseGeometry(item,expected(i));if(!geometry)return;out.push(geometry);}
    return out;
}

/** The record, if it is whole and made by this build for this city; otherwise undefined. */
export function parseCityBake(value:unknown,key:string,shape:CityBakeShape):CityBakeRecord|undefined {
    try {
        if(field(value,'key')!==key)return;
        const grayboxGroups=field(value,'grayboxGroups'),kitMerged=field(value,'kitMerged'),kitBatches=field(value,'kitBatches');
        if(!strings(grayboxGroups)||!same(grayboxGroups,shape.grayboxGroups))return;
        if(!strings(kitMerged)||!same(kitMerged,shape.kitMerged))return;
        if(!strings(kitBatches)||!same(kitBatches,shape.kitBatches))return;
        const graybox=parseGeometries(field(value,'graybox'),i=>grayboxGroups[i].startsWith('MeshBasicMaterial:')?BAKED_ATTRIBUTES.glow:BAKED_ATTRIBUTES.lit,grayboxGroups.length);
        const kit=parseGeometries(field(value,'kit'),()=>BAKED_ATTRIBUTES.kit,kitMerged.length);
        if(!graybox||!kit)return;
        const colors=field(value,'kitColors');
        if(!Array.isArray(colors)||colors.length!==kitBatches.length)return;
        const kitColors:Float32Array[]=[];
        for(const [i,array] of colors.entries()){
            // A batch label ends in its instance count and whether it is baked.
            const [,,,count,baked]=kitBatches[i].split(':');
            if(!(array instanceof Float32Array)||array.length!==(baked==='1'?Number(count)*3:0))return;
            kitColors.push(array);
        }
        const signs=field(value,'signs');
        if(!(signs instanceof Float64Array)||signs.length!==shape.signs*3||!signs.every(Number.isFinite))return;
        const spillValue=field(value,'spill');
        let spill:SpillBake|null=null;
        if(shape.spill){
            const atlas=field(spillValue,'atlas'),cells=field(spillValue,'cells');
            if(!(atlas instanceof Uint8Array)||atlas.length!==shape.atlasBytes)return;
            if(!strings(cells)||new Set(cells).size!==cells.length||!cells.every(cell=>/^-?\d+,-?\d+$/.test(cell)))return;
            const beams=parseGeometries(field(spillValue,'beams'),()=>BAKED_ATTRIBUTES.beams,cells.length);
            if(!beams)return;
            spill={atlas,cells,beams};
        }else if(spillValue!==null)return;
        return {key,grayboxGroups,graybox,kitMerged,kitBatches,kit,kitColors,signs,spill};
    } catch {return;}
}

/** The slice of IndexedDB the cache uses (the browser's `indexedDB` fits it). Handlers never read their event. */
type Handler=((event:never)=>unknown)|null;
interface BakeRequest<T> {readonly result:T;readonly error:DOMException|null;onsuccess:Handler;onerror:Handler}
interface BakeOpenRequest extends BakeRequest<BakeDatabase> {onupgradeneeded:Handler;onblocked:Handler}
interface BakeObjectStore {get(key:string):BakeRequest<unknown>;put(value:unknown,key:string):BakeRequest<unknown>;delete(key:string):unknown}
interface BakeTransaction {readonly error:DOMException|null;objectStore(name:string):BakeObjectStore;oncomplete:Handler;onerror:Handler;onabort:Handler}
export interface BakeDatabase {readonly version:number;readonly objectStoreNames:{contains(name:string):boolean};createObjectStore(name:string):unknown;transaction(store:string,mode:'readonly'|'readwrite'):BakeTransaction;close():void}
export interface BakeDatabaseFactory {open(name:string,version?:number):BakeOpenRequest}

export interface CityBakeStore {
    /** The stored value for `key`, unchecked; undefined on a miss or any error. */
    read(key:string):Promise<unknown>;
    /** Store `record` and keep only the newest two; false (nothing changed) on any error. */
    write(record:CityBakeRecord):Promise<boolean>;
}

/** The arrays of a record are stored in rows of about ROW_BYTES, apart from its head: the browser
 * clones each stored value in one task, and a whole record (about 30 MB) as one value held a
 * play frame for about 100 ms. */
const ROW_BYTES=1<<20,MAX_ROWS=4096;
/** How the head refers to an array stored in the rows: by its number across all rows. */
const PART='#part';
const rowKey=(key:string,row:number)=>`${key}#${row}`;
const rowCount=(head:unknown):number|undefined=>{
    const rows=field(head,'rows');
    return typeof rows==='number'&&Number.isInteger(rows)&&rows>=0&&rows<=MAX_ROWS?rows:undefined;
};

/** A record as stored: its head, with each array replaced by its number, and the rows. */
function splitRecord(record:CityBakeRecord):{head:{record:unknown;rows:number};rows:ArrayBufferView[][]} {
    const rows:ArrayBufferView[][]=[];
    let bytes=0,parts=0;
    const walk=(value:unknown):unknown=>{
        if(ArrayBuffer.isView(value)){
            if(!rows.length||bytes+value.byteLength>ROW_BYTES){rows.push([]);bytes=0;}
            rows[rows.length-1].push(value);bytes+=value.byteLength;
            return {[PART]:parts++};
        }
        if(Array.isArray(value))return value.map(walk);
        if(typeof value==='object'&&value!==null)return Object.fromEntries(Object.entries(value).map(([name,item])=>[name,walk(item)]));
        return value;
    };
    const head=walk(record);
    return {head:{record:head,rows:rows.length},rows};
}
/** The record put back together from its head and rows, unchecked; undefined if a row is not an
 * array or an array it refers to is missing. */
function joinRecord(head:unknown,rows:readonly unknown[]):unknown {
    const parts:unknown[]=[];
    for(const row of rows){if(!Array.isArray(row))return;parts.push(...row);}
    let whole=true;
    const walk=(value:unknown):unknown=>{
        if(typeof value!=='object'||value===null||ArrayBuffer.isView(value))return value;
        if(Array.isArray(value))return value.map(walk);
        const part=field(value,PART);
        if(part!==undefined){
            if(typeof part!=='number'||!Number.isInteger(part)||part<0||part>=parts.length){whole=false;return;}
            return parts[part];
        }
        return Object.fromEntries(Object.entries(value).map(([name,item])=>[name,walk(item)]));
    };
    const record=walk(field(head,'record'));
    return whole?record:undefined;
}

function openDatabase(factory:BakeDatabaseFactory,version?:number):Promise<BakeDatabase> {
    return new Promise((resolve,reject)=>{
        const request=version===undefined?factory.open(CITY_BAKE_DB):factory.open(CITY_BAKE_DB,version);
        request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error??new Error('open failed'));
        request.onblocked=()=>reject(new Error('open blocked'));
    });
}

export function cityBakeStore(factory:BakeDatabaseFactory):CityBakeStore {
    return {
        async read(key) {
            let db:BakeDatabase|undefined;
            try {
                db=await openDatabase(factory);
                if(!db.objectStoreNames.contains(STORE))return undefined;
                const store=db.transaction(STORE,'readonly').objectStore(STORE);
                return await new Promise<unknown>((resolve,reject)=>{
                    const head=store.get(key);
                    head.onerror=()=>reject(head.error);
                    head.onsuccess=()=>{
                        const count=rowCount(head.result);
                        if(count===undefined){resolve(undefined);return;}
                        const rows:unknown[]=[];
                        let left=count;
                        if(!left)resolve(joinRecord(head.result,rows));
                        for(let i=0;i<count;i++){
                            const row=store.get(rowKey(key,i));
                            row.onerror=()=>reject(row.error);
                            row.onsuccess=()=>{rows[i]=row.result;if(!--left)resolve(joinRecord(head.result,rows));};
                        }
                    };
                });
            } catch {return undefined;}
            finally {db?.close();}
        },
        async write(record) {
            let db:BakeDatabase|undefined;
            try {
                db=await openDatabase(factory);
                // A database without the store (an older or damaged one) gets it back in an upgrade.
                if(!db.objectStoreNames.contains(STORE)){const version=db.version+1;db.close();db=await openDatabase(factory,version);}
                const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
                const done=new Promise<boolean>(resolve=>{tx.oncomplete=()=>resolve(true);tx.onerror=tx.onabort=()=>resolve(false);});
                const {head,rows}=splitRecord(record);
                // One transaction, so a record is stored whole or not at all; each row is put from
                // the last one's success, so each is cloned in its own task.
                const putRows=(i:number)=>{if(i<rows.length)store.put(rows[i],rowKey(record.key,i)).onsuccess=()=>putRows(i+1);};
                const recent=store.get(RECENT);
                recent.onsuccess=()=>{
                    const keys=[record.key,...(strings(recent.result)?recent.result:[]).filter(key=>key!==record.key)];
                    store.put(keys.slice(0,KEEP),RECENT);
                    // First the rows of the record replaced and of those dropped (each head counts its rows).
                    const cleared=[record.key,...keys.slice(KEEP)];
                    let left=cleared.length;
                    for(const key of cleared){
                        const old=store.get(key);
                        old.onsuccess=()=>{
                            for(let i=0;i<(rowCount(old.result)??0);i++)store.delete(rowKey(key,i));
                            if(key!==record.key)store.delete(key);
                            if(--left)return;
                            store.put(head,record.key);
                            putRows(0);
                        };
                    }
                };
                return await done;
            } catch {return false;}
            finally {db?.close();}
        },
    };
}

/** Where a city build finds and leaves its bake. */
export interface CityBakeSource {key:string;store:CityBakeStore;record:Promise<unknown>}

/** A read slower than this is a miss: some browsers never answer an open, and the load must not wait. */
export const CITY_BAKE_READ_MS=2000;

/** Start reading the bake stored under `key` (see `cityBakeKey`). Off in development (code
 * changes without a new chunk URL) and wherever IndexedDB is missing; a private window that
 * refuses it, or a database that does not answer in time, just misses. */
export function openCityBake(key:string,factory:BakeDatabaseFactory|undefined=typeof indexedDB==='undefined'?undefined:indexedDB,enabled=import.meta.env.PROD):CityBakeSource|undefined {
    if(!enabled||!factory)return;
    const store=cityBakeStore(factory);
    const record=new Promise<unknown>(resolve=>{setTimeout(resolve,CITY_BAKE_READ_MS,undefined);void store.read(key).then(resolve);});
    return {key,store,record};
}

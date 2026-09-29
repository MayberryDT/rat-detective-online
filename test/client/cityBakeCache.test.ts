import {expect,it,vi} from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {bakeGeometry,CITY_BAKE_READ_MS,cityBakeKey,cityBakeStore,openCityBake,parseCityBake,type BakeDatabase,type BakeDatabaseFactory,type CityBakeRecord,type CityBakeShape,type CityBakeSource,type CityBakeStore} from '../../src/prototype/CityBakeCache';
import {Neighborhood} from '../../src/prototype/Neighborhood';
import {FixedLightField} from '../../src/prototype/FixedLighting';
import {StaticCityBroadphase} from '../../src/shared/StaticCityBroadphase';
import {CITY_PREVIEW_SEED,GRAYBOX_VERSION} from '../../src/shared/grayboxLayout';

type Handler=(()=>unknown)|null;
/** An in-memory IndexedDB: values are structured-cloned, transactions commit whole or abort. */
class FakeRequest<T> {
    result!:T;error:DOMException|null=null;
    onsuccess:Handler=null;onerror:Handler=null;onupgradeneeded:Handler=null;onblocked:Handler=null;
}
class FakeTransaction {
    error:DOMException|null=null;oncomplete:Handler=null;onerror:Handler=null;onabort:Handler=null;
    private pending=0;private wrote=false;private settled=false;
    private readonly work:Map<string,unknown>;
    constructor(private readonly db:FakeDatabase,private readonly rows:Map<string,unknown>,private readonly mode:'readonly'|'readwrite'){
        this.work=new Map(rows);
        queueMicrotask(()=>this.settle());
    }
    private request<T>(run:()=>T):FakeRequest<T> {
        const request=new FakeRequest<T>();this.pending++;
        queueMicrotask(()=>{request.result=run();request.onsuccess?.();this.pending--;if(!this.pending)queueMicrotask(()=>this.settle());});
        return request;
    }
    objectStore(){
        return {
            get:(key:string)=>this.request(()=>structuredClone(this.work.get(key))),
            put:(value:unknown,key:string)=>{if(this.mode!=='readwrite')throw new DOMException('read only','ReadOnlyError');this.wrote=true;return this.request(()=>{this.work.set(key,structuredClone(value));});},
            delete:(key:string)=>this.request(()=>{this.work.delete(key);}),
        };
    }
    private settle(){
        if(this.pending||this.settled)return;this.settled=true;
        if(this.wrote&&this.db.quotaExceeded){this.error=new DOMException('full','QuotaExceededError');this.onerror?.();this.onabort?.();return;}
        this.rows.clear();for(const [key,value] of this.work)this.rows.set(key,value);
        this.oncomplete?.();
    }
}
class FakeDatabase implements BakeDatabase {
    readonly stores=new Map<string,Map<string,unknown>>();
    quotaExceeded=false;
    constructor(public version:number){}
    readonly objectStoreNames={contains:(name:string)=>this.stores.has(name)};
    createObjectStore(name:string){this.stores.set(name,new Map());}
    transaction(store:string,mode:'readonly'|'readwrite'){
        const rows=this.stores.get(store);
        if(!rows)throw new DOMException(`no ${store}`,'NotFoundError');
        return new FakeTransaction(this,rows,mode);
    }
    close(){}
}
class FakeFactory implements BakeDatabaseFactory {
    db?:FakeDatabase;
    open(_name:string,version?:number){
        const request=new FakeRequest<FakeDatabase>();
        queueMicrotask(()=>{
            if(this.db&&version!==undefined&&version<this.db.version){request.error=new DOMException('older','VersionError');request.onerror?.();return;}
            const upgrade=!this.db||version!==undefined&&version>this.db.version;
            this.db??=new FakeDatabase(version??1);
            request.result=this.db;
            if(upgrade){this.db.version=version??this.db.version;request.onupgradeneeded?.();}
            request.onsuccess?.();
        });
        return request;
    }
}

const quad=(segments=1)=>bakeGeometry(new THREE.PlaneGeometry(1,1,segments,segments).deleteAttribute('uv')
    .setAttribute('fixedIllumination',new THREE.Float32BufferAttribute(new Float32Array((segments+1)**2*3),3)));
const SHAPE:CityBakeShape={grayboxGroups:[],kitMerged:['brick:1:1'],kitBatches:['brass:round:0:2:1','glass:box:0:1:0'],signs:1,spill:false,atlasBytes:16};
/** `segments` 300 makes a record of several megabytes, stored in several rows. */
const record=(key='k',segments=1):CityBakeRecord=>({key,grayboxGroups:[],graybox:[],kitMerged:[...SHAPE.kitMerged],kitBatches:[...SHAPE.kitBatches],
    kit:[quad(segments)],kitColors:[new Float32Array(6),new Float32Array(0)],signs:new Float64Array(3),spill:null});

it('misses on a corrupt record: wrong types, truncated or mismatched buffers, indices out of range',()=>{
    const corrupt:Array<(r:CityBakeRecord)=>unknown>=[
        r=>({...r,kit:'nope'}),
        r=>({...r,kitColors:[new Float32Array(5),new Float32Array(0)]}),
        r=>({...r,signs:new Float32Array(3)}),
        r=>({...r,kit:[{...r.kit[0],arrays:r.kit[0].arrays.map((a,i)=>i?a:a.subarray(3))}]}),
        r=>({...r,kit:[{...r.kit[0],index:Uint16Array.of(0,1,9)}]}),
        r=>({...r,kit:[{...r.kit[0],names:['position','normal','uv']}]}),
        r=>({...r,kit:[{...r.kit[0],bounds:new Float64Array(10).fill(NaN)}]}),
        r=>({...r,spill:{atlas:new Uint8Array(16),cells:[],beams:[]}}),
        ()=>null,()=>'k',
    ];
    for(const damage of corrupt)expect(parseCityBake(damage(record()),'k',SHAPE)).toBeUndefined();
    expect(parseCityBake(record(),'k',SHAPE)).toBeDefined();
});

it('misses on another key or a build that draws the city differently',()=>{
    expect(parseCityBake(record('other'),'k',SHAPE)).toBeUndefined();
    expect(parseCityBake(record(),'k',{...SHAPE,kitMerged:['brick:1:2']})).toBeUndefined();
    expect(parseCityBake(record(),'k',{...SHAPE,signs:2})).toBeUndefined();
    expect(parseCityBake(record(),'k',{...SHAPE,spill:true})).toBeUndefined();
    // The key changes with every input of the bake.
    const key=cityBakeKey(1,'pools',true,'a.js');
    for(const other of [cityBakeKey(2,'pools',true,'a.js'),cityBakeKey(1,'classic',true,'a.js'),cityBakeKey(1,'pools',false,'a.js'),cityBakeKey(1,'pools',true,'b.js')])
        expect(other).not.toBe(key);
});

it('a quota error changes nothing, and the earlier record still reads back whole',async()=>{
    const factory=new FakeFactory(),store=cityBakeStore(factory);
    expect(await store.write(record('a'))).toBe(true);
    factory.db!.quotaExceeded=true;
    expect(await store.write(record('b',300))).toBe(false);
    expect(await store.read('b')).toBeUndefined();
    expect(parseCityBake(await store.read('a'),'a',SHAPE)).toBeDefined();
});

it('misses when a row of the stored record is gone or damaged, and never uses the rest',async()=>{
    const factory=new FakeFactory(),store=cityBakeStore(factory);
    expect(await store.write(record('a',300))).toBe(true);
    const rows=factory.db!.stores.get('bakes')!,last=[...rows.keys()].filter(key=>key.startsWith('a#')).length-1;
    expect(last).toBeGreaterThan(0);
    const row=rows.get(`a#${last}`);
    rows.delete(`a#${last}`);
    expect(await store.read('a')).toBeUndefined();
    rows.set(`a#${last}`,'not a row');
    expect(await store.read('a')).toBeUndefined();
    rows.set(`a#${last}`,[]);
    expect(await store.read('a')).toBeUndefined();
    rows.set(`a#${last}`,row);
    expect(parseCityBake(await store.read('a'),'a',SHAPE)).toBeDefined();
});

it('a database without the store misses, and the next write puts the store back',async()=>{
    const factory=new FakeFactory();factory.db=new FakeDatabase(1);
    const store=cityBakeStore(factory);
    expect(await store.read('a')).toBeUndefined();
    expect(await store.write(record('a'))).toBe(true);
    expect(parseCityBake(await store.read('a'),'a',SHAPE)).toBeDefined();
});

it('misses without IndexedDB or when opening fails, and stays off outside production',async()=>{
    expect(openCityBake('a',undefined,true)).toBeUndefined();
    expect(openCityBake('a',new FakeFactory(),false)).toBeUndefined();
    const refused:BakeDatabaseFactory={open(){throw new DOMException('private window','SecurityError');}};
    expect(await openCityBake('a',refused,true)!.record).toBeUndefined();
    expect(await cityBakeStore(refused).write(record('a'))).toBe(false);
});

it('misses when the database never answers, instead of holding the load',async()=>{
    vi.useFakeTimers();
    try {
        const silent:BakeDatabaseFactory={open:()=>new FakeRequest<FakeDatabase>()};
        const source=openCityBake('a',silent,true)!;
        let settled=false;void source.record.then(()=>{settled=true;});
        await vi.advanceTimersByTimeAsync(CITY_BAKE_READ_MS-1);expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);expect(await source.record).toBeUndefined();
    } finally {vi.useRealTimers();}
});

it('keeps only the two newest records, rows and all',async()=>{
    const factory=new FakeFactory(),store=cityBakeStore(factory);
    for(const key of ['a','b','a','c'])expect(await store.write(record(key,300))).toBe(true);
    expect(await store.read('b')).toBeUndefined();
    for(const key of ['a','c'])expect(parseCityBake(await store.read(key),key,SHAPE)).toBeDefined();
    expect([...factory.db!.stores.get('bakes')!.keys()].filter(key=>!/^[ac](#\d+)?$/.test(key))).toEqual(['#recent']);
});

function cityWorld() {
    const world=new CANNON.World();world.broadphase=new StaticCityBroadphase(world);
    return world;
}
/** Every draw of the scene: kind, name, flags and a checksum of each buffer. */
function draws(scene:THREE.Scene):string[] {
    const sum=(array:ArrayLike<number>)=>{let s=0;for(let i=0;i<array.length;i++)s+=array[i]*((i%97)+1);return s.toFixed(3);};
    const out:string[]=[];
    scene.traverse(object=>{
        if(!(object instanceof THREE.Mesh))return;
        const g=object.geometry,attributes=Object.keys(g.attributes).map(name=>`${name}=${sum(g.getAttribute(name).array)}`).sort();
        const instances=object instanceof THREE.InstancedMesh?`i=${object.count}:${sum(object.instanceMatrix.array)}`:'';
        // The renderer computes a missing sphere on first use; the stored bake carries it.
        if(!g.boundingSphere)g.computeBoundingSphere();
        out.push([object.type,object.name,object.visible,object.castShadow,object.receiveShadow,g.index?sum(g.index.array):'-',...attributes,instances,
            g.boundingSphere?.radius.toFixed(4)??''].join(' '));
    });
    return out;
}
async function build(store:CityBakeStore):Promise<{scene:THREE.Scene;city:Neighborhood}> {
    const scene=new THREE.Scene(),key=cityBakeKey(CITY_PREVIEW_SEED,'pools',true,'test.js');
    const source:CityBakeSource={key,store,record:store.read(key)};
    const city=await Neighborhood.prepare(scene,cityWorld(),{seed:CITY_PREVIEW_SEED,version:GRAYBOX_VERSION},undefined,source);
    return {scene,city};
}

it('builds the same city from a stored bake as from a full bake, and never from part of a damaged one',async()=>{
    vi.stubGlobal('requestIdleCallback',(run:()=>void)=>{run();return 0;});
    const factory=new FakeFactory(),store=cityBakeStore(factory);
    const written:Promise<boolean>[]=[],write=store.write;let saved:CityBakeRecord|undefined;
    store.write=value=>{saved=value;const done=write(value);written.push(done);return done;};
    const sample=vi.spyOn(FixedLightField.prototype,'sample');

    const full=await build(store);
    expect(sample).toHaveBeenCalled();
    full.city.saveBake();
    expect(await Promise.all(written)).toEqual([true]);
    const expected=draws(full.scene);full.city.dispose();

    sample.mockClear();
    const warm=await build(store);
    expect(sample).not.toHaveBeenCalled();
    expect(draws(warm.scene)).toEqual(expected);
    warm.city.saveBake();expect(written).toHaveLength(1);
    warm.city.dispose();

    // A record whose graybox light is altered but whose kit is truncated: nothing of it is used.
    const damaged=structuredClone(saved!);
    damaged.graybox[0].arrays[0][0]+=1;
    damaged.kit[0].arrays[0]=damaged.kit[0].arrays[0].subarray(3);
    expect(await write(damaged)).toBe(true);
    sample.mockClear();
    const fallback=await build(store);
    expect(sample).toHaveBeenCalled();
    expect(draws(fallback.scene)).toEqual(expected);
    fallback.city.dispose();
},120000);

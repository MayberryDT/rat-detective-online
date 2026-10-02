/** First-use hitch census: the real title load (createGame, its warm-up and stand-ins) and the real
 * GameSession, fed scripted server messages through a stand-in transport, then every gameplay
 * effect in turn. Records WebGL program links, shader compiles, texture uploads and frame times
 * per step. `?latent=1` also compiles the whole scene after each step, finding programs an effect
 * brings that were merely out of view. No network, bots or input. */
import * as THREE from 'three';
import {TitleScreen} from '../../src/ui/TitleScreen';
import {TitleMusic} from '../../src/ui/TitleMusic';
import {createGame} from '../../src/session/createGame';
import type {NetworkManager} from '../../src/network/NetworkManager';
import {createPlayer} from '../../src/worker/gameState';
import {PROTOCOL_VERSION,type ServerMessage,type PlayerData} from '../../src/shared/networkProtocol';
import {GRAYBOX_VERSION} from '../../src/shared/grayboxLayout';
import {LAUNCH_MACHINES,CASE_HOME,EXTRA_CASE_IDS,type ChaosState,type ChaosShot,type CorpseState} from '../../src/shared/chaosState';
import {PICKUP_ANCHORS,type PickupState} from '../../src/shared/pickups';
import type {IncidentId} from '../../src/shared/incidentCatalog';

const params=new URLSearchParams(location.search),latent=params.get('latent')==='1';
interface Step {label:string;links:number;compiles:number;uploads:number;uploadBytes:number;buffers:number;bufferBytes:number;glMs:number;glMaxMs:number;glMaxCall:string;frames:number[];programs:string[];latent:string[];unchecked:string[];slow:{call:string;ms:number;target?:object;program?:string}[];vaos:number;firstDrawn:object[];drawnNames:string[];timers:number;textures:string[]}
const newStep=(label:string):Step=>({label,links:0,compiles:0,uploads:0,uploadBytes:0,buffers:0,bufferBytes:0,glMs:0,glMaxMs:0,glMaxCall:'',frames:[],programs:[],latent:[],unchecked:[],slow:[],vaos:0,firstDrawn:[],drawnNames:[],timers:0,textures:[]});
let step=newStep('load');const steps:Step[]=[step];
/** WebGL programs that have drawn (been bound) at least once. */
const drawn=new WeakSet<object>();
/** Timers set per step: a runaway polling loop shows here. */
const setTimer=window.setTimeout;
Reflect.set(window,'setTimeout',(...args:unknown[])=>{step.timers++;return Reflect.apply(setTimer,window,args);});
/** Frames over 50 ms: when (performance.now at their end) and how long, for matching against a CPU profile. */
const longFrames:{step:string;at:number;ms:number}[]=[];
/** WebGL programs three.js has checked (its first use of a program reads the info log). */
const checked=new WeakSet<object>();
const sourceBytes=(value:unknown):number=>value&&typeof value==='object'&&'width' in value&&'height' in value?Number(value.width)*Number(value.height)*4:0;
/** Uploads and buffers of 256 KB or more, with where they came from. */
const big:{step:string;call:string;bytes:number;stack:string}[]=[];
Error.stackTraceLimit=40;
const note=(call:string,bytes:number)=>{if(bytes>=262_144)big.push({step:step.label,call,bytes,stack:(new Error().stack??'').split('\n').slice(4,40).map(line=>line.trim().replace(/^at /,'').replace(/ \(.*/,'')).filter(name=>!/^(Object\.|WebGL|set|upload|render|Array|new Promise|Promise)/.test(name)).slice(0,6).join(' < ')});};
/** Time and count every call that can block or upload; three.js calls these through the context object. */
function instrument(gl:WebGL2RenderingContext):void {
    const time=(name:keyof WebGL2RenderingContext,count?:(args:unknown[])=>void)=>{
        const original=gl[name];if(typeof original!=='function')return;
        Reflect.set(gl,name,(...args:unknown[])=>{
            count?.(args);const start=performance.now(),result:unknown=Reflect.apply(original,gl,args),ms=performance.now()-start;
            step.glMs+=ms;if(ms>step.glMaxMs){step.glMaxMs=ms;step.glMaxCall=String(name);}
            if(ms>=8)step.slow.push({call:String(name),ms,...(typeof args[0]==='object'&&args[0]!==null?{target:args[0]}:{})});
            if(name==='getProgramInfoLog'&&typeof args[0]==='object'&&args[0]!==null)checked.add(args[0]);
            return result;
        });
    };
    time('linkProgram',()=>step.links++);time('compileShader',()=>step.compiles++);
    for(const [name,w,h] of [['texImage2D',3,4],['texSubImage2D',4,5],['texImage3D',3,4],['texSubImage3D',5,6],['compressedTexImage2D',3,4]] as const)
        time(name,args=>{const bytes=args.length>=9&&typeof args[w]==='number'&&typeof args[h]==='number'?args[w]*args[h]*4:sourceBytes(args.at(-1));step.uploads++;step.uploadBytes+=bytes;note(name,bytes);});
    time('texStorage2D',args=>{const bytes=Number(args[3])*Number(args[4])*4;step.uploads++;step.uploadBytes+=bytes;note('texStorage2D',bytes);});
    time('bufferData',args=>{const bytes=typeof args[1]==='number'?args[1]:ArrayBuffer.isView(args[1])?args[1].byteLength:0;step.buffers++;step.bufferBytes+=bytes;note('bufferData',bytes);});
    time('createVertexArray',()=>step.vaos++);
    time('useProgram',args=>{const program=args[0];if(typeof program==='object'&&program!==null&&!drawn.has(program)){drawn.add(program);step.firstDrawn.push(program);}});
    for(const name of ['getProgramParameter','getShaderParameter','getProgramInfoLog','getShaderInfoLog','getUniformLocation','getActiveUniform','drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced','readPixels','getSyncParameter'] as const)time(name);
}
const getContext=HTMLCanvasElement.prototype.getContext,seen=new WeakSet<object>();
Reflect.set(HTMLCanvasElement.prototype,'getContext',function(this:HTMLCanvasElement,...args:unknown[]){
    const context:unknown=Reflect.apply(getContext,this,args);
    if(context instanceof WebGL2RenderingContext&&!seen.has(context)){seen.add(context);instrument(context);}
    return context;
});

let last=0;
function tick(now:number):void {if(last){step.frames.push(now-last);if(now-last>50)longFrames.push({step:step.label,at:now,ms:now-last});}last=now;requestAnimationFrame(tick);}
requestAnimationFrame(tick);
const frames=(n:number)=>new Promise<void>(resolve=>{let left=n;const next=()=>{if(--left<=0)resolve();else requestAnimationFrame(next);};requestAnimationFrame(next);});

/** The transport GameSession drives; `deliver` plays the server. */
class ScriptedTransport {
    state:'idle'|'connecting'|'playing'='idle';
    onMessage?:(message:ServerMessage)=>void;
    onState?:(state:string,message?:string)=>void;
    welcome?:ServerMessage;
    connect():void {this.state='connecting';this.onState?.('connecting');setTimeout(()=>{if(this.welcome)this.onMessage?.(this.welcome);this.state='playing';this.onState?.('playing');},0);}
    deliver(message:ServerMessage):void {if(this.state==='playing')this.onMessage?.(message);}
    prepare():void {}
    retry():void {}
    destroy():void {}
    send():boolean {return true;}
    getDiagnostics():Record<string,number> {return {};}
}
const transport=new ScriptedTransport();
const title=new TitleScreen(),music=new TitleMusic(),abort=new AbortController();
const loadStart=performance.now();
const session=await createGame(title,music,transport as unknown as NetworkManager,{seed:341283204,version:GRAYBOX_VERSION},abort.signal);
const loadMs=performance.now()-loadStart;
interface Internals {stage:{renderer:THREE.WebGLRenderer;scene:THREE.Scene;camera:THREE.PerspectiveCamera};rat:{onMouseMove(dx:number,dy:number):void;entity:{mesh:THREE.Object3D}}|null;compiling?:Promise<unknown>}
/** GameSession's private members, read by name for the census only. */
const game=session as unknown as Internals;
const {renderer,scene,camera}=game.stage;
let warmDrawMs=0;
// Experiment `?warmdraw=1`: draw everything once, unculled, into a tiny target before play.
if(params.get('warmdraw')==='1'){
    const culled:THREE.Object3D[]=[];scene.traverse(o=>{if(o.frustumCulled){culled.push(o);o.frustumCulled=false;}});
    const target=new THREE.WebGLRenderTarget(1,1),start=performance.now();
    renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.setRenderTarget(null);target.dispose();
    for(const o of culled)o.frustumCulled=true;
    warmDrawMs=performance.now()-start;
}
const programKeys=()=>new Set((renderer.info.programs??[]).map(program=>program.cacheKey));
/** Name each program by the objects drawing with it. */
function describe(keys:Set<string>):string[] {
    const users=new Map<string,Set<string>>();
    scene.traverse(object=>{
        if(!(object instanceof THREE.Mesh||object instanceof THREE.Points||object instanceof THREE.Line||object instanceof THREE.Sprite))return;
        const material:THREE.Material|THREE.Material[]=object.material;
        for(const m of Array.isArray(material)?material:[material]){
            const properties:unknown=renderer.properties.get(m),program=properties&&typeof properties==='object'&&'currentProgram' in properties?properties.currentProgram:undefined;
            const key=program&&typeof program==='object'&&'cacheKey' in program&&typeof program.cacheKey==='string'?program.cacheKey:undefined;
            if(key&&keys.has(key)){const set=users.get(key)??new Set();set.add(`${object.name||object.type}/${m.name||m.type}`);users.set(key,set);}
        }
    });
    return [...keys].map(key=>{const program=renderer.info.programs?.find(p=>p.cacheKey===key);return `${program?.name??'?'}#${program?.id}: ${[...users.get(key)??[`(no live user) ${key.replace(/\s+/g,' ').slice(0,160)}`]].slice(0,4).join(', ')}`;});
}

// The scene: you on the street by Records Hall, eight rats in front of you.
const now=()=>Date.now();
const appearance={hatType:'fedora' as const,hatColor:0x386caa,coatColor:0x885b89,furColor:0xe8b84d,highlightColor:0xe9dfc9};
const me=createPlayer('me','Census',appearance,{x:-10,y:1,z:-27});
const rivals:PlayerData[]=Array.from({length:8},(_,i)=>createPlayer(`rat-${i}`,`Rival ${i}`,{...appearance,hatColor:0x224466+i*0x101010,coatColor:0x553322+i*0x080808},{x:-4+i*1.6,y:1,z:-29+(i%3)*1.8}));
const players=Object.fromEntries([me,...rivals].map(p=>[p.id,p]));
transport.welcome={type:'welcome',id:me.id,player:me,players,round:{phase:'playing',assignment:{roundId:'census',id:'chain-of-custody',phase:'active',revealedAt:now(),liveAt:now(),deliverySerial:0,destinations:['records'],deliveries:{},caseKills:{},revision:1}},
    world:{seed:341283204,version:GRAYBOX_VERSION},protocolVersion:PROTOCOL_VERSION,serverTime:now(),incidents:['improper-disposal','bad-ammunition','pressure-surge','crossfire','scattershot','big-cheese','blackout','code-violation','most-wanted','all-units']};
const pose=(x:number,y:number,z:number)=>({p:{x,y,z},q:{x:0,y:0,z:0,w:1},v:{x:0,y:0,z:0},spin:{x:0,y:0,z:0}});
const near:PickupState[]=[{id:'near-ironclad',kind:'ironclad',x:-6,y:.7,z:-25},{id:'near-hustle',kind:'hustle',x:-3,y:.7,z:-25},{id:'near-fix',kind:'quick-fix',x:0,y:.7,z:-25}];
const state:ChaosState={time:now(),epoch:'census',tick:0,case:{...pose(CASE_HOME.x,CASE_HOME.y,CASE_HOME.z),owner:null,previousOwner:null,pickupAfter:0,returningUntil:0},
    dispatch:{phase:'ready',started:0,until:0,serial:0},possession:{},corpses:[],shots:[],impacts:[],notice:{serial:0,text:''},
    pressure:{serial:0,levels:{},launches:[]},pickups:[...near,...PICKUP_ANCHORS.map(a=>({id:a.id,kind:a.kind,x:a.x,y:a.y??.7,z:a.z}))],buffs:{},
    assignment:transport.welcome.round.assignment};
/** Shots in flight: regenerated every send from a pattern, so they move. */
let shotPattern:((t:number)=>ChaosShot[])|undefined;
setInterval(()=>{
    state.time=now();state.tick=(state.tick??0)+1;
    state.shots=shotPattern?.(state.time)??[];
    transport.deliver({type:'chaos',state:structuredClone(state)});
    if(state.impacts.length)state.impacts=[];
},50);
const volley=(owner:string|null,extra:Partial<ChaosShot>={},count=24)=>(t:number)=>Array.from({length:count},(_,i):ChaosShot=>{
    const age=((t/1000+i*.13)%1.4);return {id:`s-${i}-${Math.floor(t/1400)}`,owner,p:{x:-8+age*12,y:1.2+(i%4)*.4,z:-29+(i%6)*.7},v:{x:12,y:0,z:0},age,...extra};
});
const incident=(id:IncidentId|undefined)=>{
    state.dispatch=id?{phase:'active',started:now(),until:now()+25_000,serial:state.dispatch.serial+1,incident:id,caller:'rat-0'}:{phase:'cooldown',started:now(),until:now()+40_000,serial:state.dispatch.serial};
};
const corpse=(i:number,moving=false):CorpseState=>({id:`corpse-${i}-${now()}`,victimId:`gone-${i}`,owner:null,appearance,born:now(),expires:now()+10_000,
    ...pose(-6+i*1.5,.6,-24),...(moving?{v:{x:20,y:4,z:0},spin:{x:3,y:2,z:1}}:{})});
const send=(message:ServerMessage)=>transport.deliver(message);
const damage=(to:number)=>send({type:'playerDamaged',id:'me',hp:to,attackerId:'rat-0'});

const script:[string,()=>void,number?][]=[
    ['welcome',()=>{session.enterCity();},120],
    ['look at the rivals',()=>{game.rat?.onMouseMove(-400,20);},60],
    ['idle',()=>{},60],
    ['your shots (predicted pool)',()=>{shotPattern=volley('me');},60],
    ['rival shots (red rims)',()=>{shotPattern=volley('rat-1');for(let i=0;i<3;i++)send({type:'playerShot',shooterId:'rat-1',shotId:`r-${i}`,origin:{x:-2,y:1.5,z:-28},direction:{x:-1,y:0,z:0}});},60],
    ['wall splats and thuds',()=>{state.impacts=[{p:{x:-6,y:1,z:-31},n:{x:0,y:0,z:1},surface:true,cue:'thud'},{p:{x:-4,y:1.5,z:-27},n:{x:-1,y:0,z:0},surface:false,cue:'armor-clang'},{p:{x:-10,y:1.2,z:-25},n:{x:0,y:1,z:0},surface:true,cue:'buzz'}];},40],
    ['hit a rival (flinch, hit marker)',()=>{send({type:'playerDamaged',id:'rat-2',hp:3,attackerId:'me'});},40],
    ['you hurt 4 HP',()=>damage(4),40],
    ['you hurt 3 HP',()=>damage(3),40],
    ['you hurt 2 HP (x-ray kits)',()=>damage(2),60],
    ['you hurt 1 HP (black and white)',()=>damage(1),60],
    ['Quick Fix heal',()=>{send({type:'playerHealed',id:'me',hp:5,cause:'pickup'});},60],
    ['Ironclad on you',()=>{state.buffs={me:{ironcladUntil:now()+12_000}};},40],
    ['Ironclad on a rival',()=>{state.buffs={me:{ironcladUntil:now()+12_000},'rat-3':{ironcladUntil:now()+12_000}};},40],
    ['Hot Pursuit on you',()=>{state.buffs={me:{hustleUntil:now()+10_000}};},60],
    ['Hot Pursuit on a rival',()=>{state.buffs={'rat-4':{hustleUntil:now()+10_000}};},60],
    ['buffs end',()=>{state.buffs={};},30],
    ['supplies claimed (restock dials)',()=>{for(const p of state.pickups??[])p.availableAt=now()+45_000;},60],
    ['supplies back',()=>{for(const p of state.pickups??[])delete p.availableAt;},30],
    ['you pick up the case',()=>{state.case={...state.case,owner:'me',previousOwner:null};},40],
    ['rival carries the case',()=>{state.case={...state.case,owner:'rat-5',previousOwner:'me'};},40],
    ['case loose',()=>{state.case={...state.case,...pose(-2,1.3,-26),owner:null,previousOwner:'rat-5'};},40],
    ['kill a rival (body)',()=>{send({type:'playerDied',victimId:'rat-2',killerId:'me',killerName:'Census',victimName:'Rival 2',respawnAt:now()+3000,killerStreak:1});state.corpses=[corpse(2,true)];},90],
    ['headshot a rival',()=>{send({type:'playerDied',victimId:'rat-6',killerId:'me',killerName:'Census',victimName:'Rival 6',respawnAt:now()+3000,headshot:true,killerStreak:2});state.corpses=[...state.corpses,corpse(6)];},90],
    ['kill streak 3 (ARMED stamp, hat smoke)',()=>{send({type:'playerDied',victimId:'rat-7',killerId:'me',killerName:'Census',victimName:'Rival 7',respawnAt:now()+3000,killerStreak:3});},90],
    ['rival streak 3',()=>{send({type:'playerDied',victimId:'rat-0',killerId:'rat-1',killerName:'Rival 1',victimName:'Rival 0',respawnAt:now()+3000,killerStreak:3});},60],
    ['streak 5 and 8',()=>{send({type:'playerDied',victimId:'rat-4',killerId:'rat-1',killerName:'Rival 1',victimName:'Rival 4',respawnAt:now()+3000,killerStreak:5});send({type:'playerDied',victimId:'rat-3',killerId:'me',killerName:'Census',victimName:'Rival 3',respawnAt:now()+3000,killerStreak:8});},60],
    ['rivals respawn',()=>{for(const id of ['rat-0','rat-2','rat-3','rat-4','rat-6','rat-7']){const p=players[id]!;send({type:'playerRespawn',id,x:p.x,y:p.y,z:p.z,hp:5});}},40],
    ['a rat joins',()=>{send({type:'playerJoined',player:createPlayer('rat-8','Newcomer',{...appearance,hatType:'fedora',hatColor:0x993322},{x:4,y:1,z:-26})});},60],
    ['two more rats join',()=>{for(const [i,x] of [[9,6],[10,8]] as const)send({type:'playerJoined',player:createPlayer(`rat-${i}`,`Newcomer ${i}`,{...appearance,coatColor:0x223344+i*0x111111},{x,y:1,z:-28})});},60],
    ['a rat leaves',()=>{send({type:'playerLeft',id:'rat-9'});},40],
    ['sixteen corpses',()=>{state.corpses=Array.from({length:16},(_,i)=>corpse(i%8,i%2===0));},90],
    ['corpses gone',()=>{state.corpses=[];},30],
    ['pressure building',()=>{state.pressure={serial:1,levels:Object.fromEntries(LAUNCH_MACHINES.map(m=>[m.id,8])),launches:[]};},40],
    ['you launched',()=>{const m=LAUNCH_MACHINES[1]!;state.pressure={serial:2,levels:{},fired:{[m.id]:now()},launches:[{id:'launch-1',playerId:'me',at:now(),velocity:{x:0,y:60,z:0},machineId:m.id}]};},150],
    ['rival launched (boost)',()=>{const m=LAUNCH_MACHINES[1]!;state.pressure={serial:3,levels:{},fired:{[m.id]:now()},boosts:{[m.id]:now()},launches:[{id:'launch-2',playerId:'rat-5',at:now(),velocity:{x:5,y:70,z:0},machineId:m.id,boost:true}]};},150],
    ...(['improper-disposal','bad-ammunition','crossfire','scattershot','big-cheese','all-units','code-violation','blackout'] as IncidentId[]).map((id):[string,()=>void,number]=>
        [`incident ${id}`,()=>{incident(id);shotPattern=volley('rat-1',id==='crossfire'?{wallBounced:true}:id==='big-cheese'?{radius:1.9}:{});
            if(id==='improper-disposal')state.corpses=[corpse(1,true),corpse(3,true)];},120]),
    ['crossfire, your own bank shots',()=>{incident('crossfire');shotPattern=volley('me',{wallBounced:true});},60],
    ['incident pressure-surge',()=>{incident('pressure-surge');state.pressure={serial:4,levels:{},launches:[],vents:[{id:'vent-1',x:-4,y:0,z:-27,at:now()+800},{id:'vent-2',x:2,y:0,z:-29,at:now()+800,boost:true}]};},150],
    ['incident evidence-tampering',()=>{incident('evidence-tampering');state.extraCases=EXTRA_CASE_IDS.slice(0,4).map((id,i)=>({id,...pose(-6+i*2,1.3,-25),v:{x:0,y:4,z:30},owner:null,previousOwner:null,pickupAfter:0,returningUntil:0,missileOwner:'rat-1'}));},120],
    ['incident most-wanted (a rival)',()=>{state.extraCases=[];incident('most-wanted');state.dispatch.wanted='rat-1';},120],
    ['incident most-wanted (you)',()=>{state.dispatch.wanted='me';},90],
    ['incident ends',()=>{incident(undefined);shotPattern=undefined;state.corpses=[];},60],
    ['you die',()=>{send({type:'playerDamaged',id:'me',hp:0,attackerId:'rat-1'});send({type:'playerDied',victimId:'me',killerId:'rat-1',killerName:'Rival 1',victimName:'Census',respawnAt:now()+3000,killerStreak:4});state.corpses=[{...corpse(0,true),victimId:'me'}];},200],
    ['you respawn',()=>{send({type:'playerRespawn',id:'me',x:me.x,y:me.y,z:me.z,hp:5});state.corpses=[];},90],
    ['you drown',()=>{send({type:'playerDied',victimId:'me',killerId:null,killerName:null,victimName:'Census',respawnAt:now()+3000,cause:'drowned'});},120],
    ['you respawn again',()=>{send({type:'playerRespawn',id:'me',x:me.x,y:me.y,z:me.z,hp:5});},60],
    ['you go underground',()=>{send({type:'playerCorrected',player:{id:'me',x:0,y:-5.7,z:4,qx:0,qy:0,qz:0,qw:1,meshQx:0,meshQy:0,meshQz:0,meshQw:1}});},90],
    ['back on the street',()=>{send({type:'playerCorrected',player:{id:'me',x:me.x,y:me.y,z:me.z,qx:0,qy:0,qz:0,qw:1,meshQx:0,meshQy:0,meshQz:0,meshQw:1}});},60],
    ['round won: lineup',()=>{send({type:'gameWon',winnerId:'me',winnerName:'Census',kills:9,resetAt:now()+15_000,lineup:['me','rat-1','rat-2','rat-3','rat-4'],awards:[{id:'top-gun',title:'Top Gun',playerId:'me',playerName:'Census',value:9}]});},600],
    ['round reset',()=>{send({type:'gameReset',round:{phase:'playing'}});},90],
];
const result={loadMs,warmDrawMs,steps,latent,longFrames,big};
Object.assign(window,{censusResult:result,censusDone:false});
/** Name the three.js program behind each slow call's WebGL program or shader. */
function resolveSlow(s:Step):void {
    for(const slow of s.slow){
        const owner=slow.target&&renderer.info.programs?.find(p=>p.program===slow.target||p.vertexShader===slow.target||p.fragmentShader===slow.target);
        if(owner)slow.program=describe(new Set([owner.cacheKey]))[0];
        delete slow.target;
    }
    s.unchecked=describe(new Set((renderer.info.programs??[]).filter(p=>!checked.has(p.program)).map(p=>p.cacheKey)));
    s.drawnNames=describe(new Set(s.firstDrawn.flatMap(target=>renderer.info.programs?.find(p=>p.program===target)?.cacheKey??[])));
    s.firstDrawn=[];
}
/** Every texture the scene's materials use, with a readable label and whether three.js has uploaded it. */
const uploadedTextures=new WeakSet<THREE.Texture>();
function sceneTextures():Map<THREE.Texture,string> {
    const found=new Map<THREE.Texture,string>();
    scene.traverse(object=>{
        if(!(object instanceof THREE.Mesh||object instanceof THREE.Points||object instanceof THREE.Line||object instanceof THREE.Sprite))return;
        const material:THREE.Material|THREE.Material[]=object.material;
        for(const m of Array.isArray(material)?material:[material]){
            const values=[...Object.values(m),...(m instanceof THREE.ShaderMaterial?Object.values(m.uniforms).map(u=>u.value):[])];
            for(const value of values)if(value instanceof THREE.Texture&&!found.has(value)){
                const image:unknown=value.image,size=image&&typeof image==='object'&&'width' in image&&'height' in image?`${image.width}x${image.height}`:'?';
                found.set(value,`${value.name||value.constructor.name} ${size} (${object.name||object.type}/${m.name||m.type})`);
            }
        }
    });
    return found;
}
const isUploaded=(texture:THREE.Texture)=>{const properties:unknown=renderer.properties.get(texture);return !!properties&&typeof properties==='object'&&'__webglInit' in properties&&properties.__webglInit===true;};
/** Labels of scene textures first uploaded since the last call. */
function newUploads():string[] {
    const labels:string[]=[];
    for(const [texture,label] of sceneTextures())if(!uploadedTextures.has(texture)&&isUploaded(texture)){uploadedTextures.add(texture);labels.push(label);}
    return labels;
}
newUploads();
const pendingAtLoad=[...sceneTextures()].filter(([texture])=>!isUploaded(texture)).map(([,label])=>label);
Object.assign(result,{pendingAtLoad});
resolveSlow(step);
for(const [label,run,wait=60] of script){
    const before=programKeys();
    step=newStep(label);steps.push(step);
    run();
    await frames(wait);
    const after=programKeys();step.programs=describe(new Set([...after].filter(key=>!before.has(key))));
    resolveSlow(step);
    step.textures=newUploads();
    if(latent&&!game.compiling){renderer.compile(scene,camera);const all=programKeys();step.latent=describe(new Set([...all].filter(key=>!after.has(key))));}
}
Object.assign(result,{marks:Object.fromEntries(performance.getEntriesByType('mark').map(mark=>[mark.name,mark.startTime]))});
Object.assign(window,{censusDone:true});

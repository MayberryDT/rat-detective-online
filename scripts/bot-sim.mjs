// Headless seeded bot rooms for motor iterations: the real ServerBotController and ChaosSimulation on the
// staging world, nine server bots cast 80/10/10 from real roster names, 3 s respawns, stuck rescues handled
// as GameRoom.recoverManagedBot does, and the next assignment as soon as one is won. Catches stuck and stall
// regressions and reports the gate's movement and case numbers. Not a capacity or balance claim: no humans,
// no network, no recorder.
//
// usage: node scripts/bot-sim.mjs [--assignment=all|<id>] [--seeds=3] [--minutes=4] [--jobs=4] [--ref=<git rev>] [--json]
//   --assignment  the assignment each room starts on; later ones follow the room's rotation (default: all four)
//   --seeds       rooms per starting assignment, seeds 1..N
//   --ref         build src/ from that commit instead of the working tree (A/B against older bots)
import {build} from 'esbuild';
import {execFileSync,fork} from 'node:child_process';
import {mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';

const WORLD=2383011301,BOTS=9,DT=1/60;
/** Distance bands (units) to the nearest other rat when a shot leaves, and between shooter and victim on a hit. */
const BANDS=[6,12,25,50,Infinity],BAND_NAMES=['<6','6-12','12-25','25-50','50+'];
const band=d=>BANDS.findIndex(limit=>d<limit);
const {values}=parseArgs({options:{assignment:{type:'string',default:'all'},seeds:{type:'string',default:'3'},minutes:{type:'string',default:'4'},
    jobs:{type:'string',default:'4'},ref:{type:'string'},json:{type:'boolean',default:false},child:{type:'string'},runtime:{type:'string'}}});
const root=process.cwd();

if(values.child){
    // One room, in its own process: its own seeded Math.random and clock.
    const {seed,assignment,minutes}=JSON.parse(values.child);
    process.send(await room(seed,assignment,minutes,values.runtime));
    process.exit(0);
}

const ref=values.ref&&execFileSync('git',['rev-parse',values.ref],{encoding:'utf8'}).trim();
const out=resolve(root,'test-results/bot-sim');await mkdir(out,{recursive:true});
const runtime=resolve(out,`runtime-${ref?ref.slice(0,12):'worktree'}.mjs`);
// An older commit's src/ is exported whole, so files it had and the worktree lacks still resolve.
const tree=ref?resolve(out,`src-${ref.slice(0,12)}`):root;
if(ref){await rm(tree,{recursive:true,force:true});await mkdir(tree,{recursive:true});execFileSync('sh',['-c',`git archive ${ref} src | tar -x -C ${tree}`]);}
await build({stdin:{contents:[
    "export {ServerBotController} from './src/worker/ServerBotController.ts';",
    "export {ChaosSimulation} from './src/shared/ChaosSimulation.ts';",
    "export {createPlayer,spawnForWorld,respawnPlayer,applyHit} from './src/worker/gameState.ts';",
    "export {GRAYBOX_VERSION} from './src/shared/grayboxLayout.ts';",
    "export {createAssignment,nextAssignment,ASSIGNMENT_IDS} from './src/shared/assignments.ts';",
    "export {botPersonality,createRoundBotRoster} from './src/shared/botRoster.ts';",
    "export {cityPlaces} from './src/shared/city/places.ts';",
].join(''),resolveDir:tree,loader:'ts'},outfile:runtime,bundle:true,packages:'external',platform:'node',format:'esm',logLevel:'error',
    define:{'performance.now':'__simClock'}});
const {ASSIGNMENT_IDS}=await import(pathToFileURL(runtime));
const starts=values.assignment==='all'?ASSIGNMENT_IDS:[values.assignment];
if(starts.some(id=>!ASSIGNMENT_IDS.includes(id)))throw Error(`--assignment must be all or one of ${ASSIGNMENT_IDS.join(', ')}`);
const runs=starts.flatMap(assignment=>Array.from({length:Number(values.seeds)},(_,i)=>({seed:i+1,assignment,minutes:Number(values.minutes)})));
const started=Date.now(),results=[];
await Promise.all(Array.from({length:Math.min(Number(values.jobs),runs.length)},async()=>{
    for(let run;(run=runs.shift());){
        results.push(await new Promise((done,fail)=>{
            const child=fork(fileURLToPath(import.meta.url),[`--child=${JSON.stringify(run)}`,`--runtime=${runtime}`],{stdio:['ignore','inherit','inherit','ipc']});
            child.once('message',done);child.once('exit',code=>code&&fail(Error(`room ${JSON.stringify(run)} exited ${code}`)));
        }));
    }
}));
report(results,(Date.now()-started)/1000);

function report(rooms,wall){
    const sum=key=>rooms.reduce((a,r)=>a+r[key],0),roomHours=sum('ms')/3600000,botHours=roomHours*BOTS;
    const per=(n,h)=>Math.round(n/h*100)/100;
    const deliveries={},hours={};
    for(const r of rooms)for(const [id,n] of Object.entries(r.deliveries))deliveries[id]=(deliveries[id]??0)+n;
    for(const r of rooms)for(const [id,ms] of Object.entries(r.assignmentMs))hours[id]=(hours[id]??0)+ms/3600000;
    const deathPlaces=new Set(rooms.flatMap(r=>r.deathPlaces)),rescuePlaces={};
    for(const r of rooms)for(const place of r.rescuePlaces)rescuePlaces[place]=(rescuePlaces[place]??0)+1;
    const summary={rooms:rooms.length,roomHours:Math.round(roomHours*1000)/1000,wallSeconds:Math.round(wall),
        rescuesPerBotHour:per(sum('rescues'),botHours),caseChangesPerRoomHour:per(sum('caseChanges'),roomHours),
        completionsPerRoomHour:per(sum('completions'),roomHours),
        deliveriesPerRoomHour:Object.fromEntries(Object.entries(deliveries).map(([id,n])=>[id,per(n,hours[id])])),
        killsPerBotHour:per(sum('kills'),botHours),deaths:sum('deaths'),deathPlaces:deathPlaces.size,
        botShots:sum('shots'),botHitRate:Math.round(sum('hits')/Math.max(1,sum('shots'))*1000)/10+'%',
        // Per band of the nearest rival: share of shots, and hits landing at that range per shot fired there.
        byRange:Object.fromEntries(BAND_NAMES.map((name,i)=>{const shots=rooms.reduce((a,r)=>a+r.shotsByRange[i],0),hits=rooms.reduce((a,r)=>a+r.hitsByRange[i],0);
            return [name,`${Math.round(shots/Math.max(1,sum('shots'))*100)}% of shots, ${Math.round(hits/Math.max(1,shots)*1000)/10}% hit`];})),
        longestStillCaseSeconds:Math.round(Math.max(...rooms.map(r=>r.longestStill))/100)/10,
        longestStillCase:rooms.reduce((a,r)=>r.longestStill>a.longestStill?r:a).stillAt,
        rescuePlaces:Object.entries(rescuePlaces).sort((a,b)=>b[1]-a[1]).slice(0,8)};
    if(values.json)console.log(JSON.stringify({summary,rooms},null,1));
    else for(const [key,value] of Object.entries(summary))console.log(`${key.padEnd(24)} ${typeof value==='object'?JSON.stringify(value):value}`);
}

async function room(seed,start,minutes,runtimePath){
    // Deterministic randomness and clock, installed before the runtime module captures them.
    let s=(seed*2654435761)>>>0;
    Math.random=()=>{s=(s+0x6D2B79F5)>>>0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
    let clock=1_800_000_000_000,uuid=0;
    globalThis.__simClock=()=>clock;Date.now=()=>clock;
    globalThis.crypto.randomUUID=()=>`00000000-0000-4000-8000-${String(++uuid).padStart(12,'0')}`;
    const m=await import(pathToFileURL(runtimePath));
    const spec={seed:WORLD,version:m.GRAYBOX_VERSION},places=m.cityPlaces();
    // Real roster names in the 80/10/10 mix: seven tryhards, a maverick and a gremlin.
    const want={tryhard:7,maverick:1,gremlin:1},names=[];
    for(let i=0;names.length<BOTS&&i<500;i++)for(const {name} of m.createRoundBotRoster([],Math.random)){
        const p=m.botPersonality(name);if(want[p]>0&&!names.includes(name)){want[p]--;names.push(name);}
    }
    const ids=names.map((_,i)=>`rd-ai-${String(i).padStart(2,'0')}`),personality=new Map(ids.map((id,i)=>[id,m.botPersonality(names[i])]));
    const players=new Map();
    for(const [i,id] of ids.entries())players.set(id,m.createPlayer(id,names[i],{hatType:'fedora',hatColor:1,furColor:2,coatColor:3},m.spawnForWorld(spec,Math.random,players.values())));
    const stats={seed,start,ms:0,rescues:0,rescuePlaces:[],rescueNotes:[],shotsByRange:BANDS.map(()=>0),hitsByRange:BANDS.map(()=>0),caseChanges:0,completions:0,deliveries:{},assignmentMs:{},kills:0,deaths:0,deathPlaces:[],shots:0,hits:0,longestStill:0};
    let sim;
    const onHit=hit=>{
        const victim=players.get(hit.victim);if(!victim||victim.hp<=0)return;
        const result=m.applyHit(players,hit.owner,hit.victim,hit.damage,!!hit.incoming,hit.owner&&sim.isCaseHolder(hit.owner)?hit.owner:null,!!sim.assignmentState,hit.explosive===true);
        if(!result.killed)return;
        victim.respawnAt=clock+3000;stats.deaths++;stats.deathPlaces.push(places.at(victim.x,victim.y,victim.z).id);
        if(hit.owner&&hit.owner!==victim.id)stats.kills++;
        sim.creditCaseKill(hit.owner);
        if(hit.incoming)sim.death(victim,hit.incoming,hit.owner);
    };
    sim=new m.ChaosSimulation(players,onHit,undefined,spec);
    const rotation={remaining:[],last:start};
    const begin=id=>sim.setAssignment(m.createAssignment(id,clock));
    const shotTimes=new Map(ids.map(id=>[id,[]]));
    const controller=new m.ServerBotController(spec,ids,{
        move:(id,p,facing)=>{const player=players.get(id);if(!player)return;player.x=p.x;player.y=p.y;player.z=p.z;player.meshQy=Math.sin(facing/2);player.meshQw=Math.cos(facing/2);},
        shoot:(id,origin,direction)=>{
            // GameRoom's per-rat limit: 12 shots a second.
            const times=shotTimes.get(id);while(times.length&&clock-times[0]>=1000)times.shift();
            if(times.length>=12||players.get(id).hp<=0)return;
            times.push(clock);stats.shots++;sim.shoot(id,{type:'shoot',shotId:crypto.randomUUID(),origin,direction});
            const shooter=players.get(id);let nearest=Infinity;
            for(const p of players.values())if(p.id!==id&&p.hp>0)nearest=Math.min(nearest,Math.hypot(p.x-shooter.x,p.z-shooter.z));
            stats.shotsByRange[band(nearest)]++;
        },
        recover:id=>{
            const player=players.get(id);if(!player||player.hp<=0)return;
            stats.rescues++;stats.rescuePlaces.push(places.at(player.x,player.y,player.z).id);
            // The bot's plan when rescued (private at type level only), for --json readers chasing a pocket.
            const brain=controller.bots?.get(id)?.brain;
            stats.rescueNotes.push({at:Math.round(stats.ms/1000),assignment:sim.assignmentState?.id,place:places.at(player.x,player.y,player.z).id,
                p:[player.x,player.y,player.z].map(v=>Math.round(v*10)/10),mode:brain?.objective,key:brain?.goalKey,stalled:brain?.navigationStalled});
            sim.recoverCarrierCase(id);
            Object.assign(player,m.spawnForWorld(spec,Math.random,players.values(),id,sim.assignmentState));controller.reset(id,player);
        },
        recoverCase:()=>sim.recoverLooseCase(),
    },id=>personality.get(id));
    begin(start);
    let owner=null,serial=0,stillSince=clock;
    const end=clock+minutes*60000;
    while(clock<end){
        clock+=DT*1000;
        for(const [id,player] of players)if(player.hp<=0&&player.respawnAt<=clock){
            m.respawnPlayer(player,m.spawnForWorld(spec,Math.random,players.values(),id,sim.assignmentState,sim.allUnitsTarget));controller.reset(id,player);
        }
        controller.step(DT,clock,players,sim.snapshot(false),true);
        sim.step(DT,clock);
        for(const event of sim.drainShotEvents()){
            if(event.outcome!=='rat-body'&&event.outcome!=='rat-head')continue;
            stats.hits++;
            const shooter=players.get(event.owner),victim=players.get(event.victimId);
            if(shooter&&victim)stats.hitsByRange[band(Math.hypot(victim.x-shooter.x,victim.z-shooter.z))]++;
        }
        const a=sim.assignmentState;
        if(a){stats.assignmentMs[a.id]=(stats.assignmentMs[a.id]??0)+DT*1000;}
        const c=sim.snapshot(false).case;
        if(c.owner!==owner){if(c.owner)stats.caseChanges++;owner=c.owner;stillSince=clock;}
        if(a?.phase!=='active'||c.owner)stillSince=clock;
        if(clock-stillSince>stats.longestStill){stats.longestStill=clock-stillSince;stats.stillAt=`${a?.id} seed ${seed} at ${places.at(c.p.x,c.p.y,c.p.z).id}`;}
        if(a&&a.deliverySerial!==serial){if(a.deliverySerial>serial)stats.deliveries[a.id]=(stats.deliveries[a.id]??0)+a.deliverySerial-serial;serial=a.deliverySerial;}
        if(a?.result){
            // GameRoom shows the win, then resets the city and starts the next assignment.
            stats.completions++;sim.reset();serial=0;owner=null;
            for(const [id,player] of players){m.respawnPlayer(player,m.spawnForWorld(spec,Math.random,players.values(),id));controller.reset(id,player);}
            begin(m.nextAssignment(rotation,Math.random));
        }
        stats.ms+=DT*1000;
    }
    controller.dispose();
    return stats;
}

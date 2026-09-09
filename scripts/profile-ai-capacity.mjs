// Local CPU attribution, not a hosted capacity pass. Actual city and controller.
import {build} from 'esbuild';
import {ObjectCollisionMatrix} from 'cannon-es';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const out=resolve('output/ai-cpu-profile');await mkdir(out,{recursive:true});
await build({stdin:{contents:"export {ServerBotController} from './src/worker/ServerBotController';export {ChaosSimulation} from './src/shared/ChaosSimulation';export {createPlayer} from './src/worker/gameState';",resolveDir:process.cwd(),loader:'ts'},outfile:resolve(out,'runtime.mjs'),bundle:true,packages:'external',platform:'node',format:'esm'});
const {ServerBotController,ChaosSimulation,createPlayer}=await import(resolve(out,'runtime.mjs'));
const count=Number(process.argv[2]??49);if(![11,23,31,49,99].includes(count))throw Error('Unsupported count');
const players=new Map(Array.from({length:count},(_,i)=>{const p=createPlayer(`ai-${i}`,`Rat ${i}`,{hatType:'fedora',hatColor:1,furColor:2,coatColor:3},{x:-100+i*4,y:2,z:-18});return[p.id,p];}));
const spec={seed:341283204,version:2};
const sim=new ChaosSimulation(players,()=>{},undefined,spec);
// Match GameRoom's sparse contact history override.
sim.world.collisionMatrix=new ObjectCollisionMatrix();sim.world.collisionMatrixPrevious=new ObjectCollisionMatrix();
let serial=0;const controller=new ServerBotController(spec,[...players.keys()],{
 move:(id,p)=>Object.assign(players.get(id),p),
 shoot:(id,origin,direction)=>sim.shoot(id,{shotId:`shot-${serial++}`,origin,direction}),
});
const totals={physics:0,navigation:0,brain:0,rays:0,bots:0,chaos:0};
function measure(object,key,metric){const original=object[key].bind(object);object[key]=(...args)=>{const at=performance.now();try{return original(...args);}finally{totals[metric]+=performance.now()-at;}};}
measure(controller.world,'step','physics');measure(controller.navigation,'update','navigation');measure(controller,'visible','rays');
for(const b of controller.bots.values())measure(b.brain,'step','brain');
const samples=[];let state=sim.snapshot(false);
for(let tick=0;tick<720;tick++){
 const now=1000+tick*1000/60;
 if(tick===120)for(const key in totals)totals[key]=0;
 let at=performance.now();controller.step(1/60,now,players,state,true);totals.bots+=performance.now()-at;
 at=performance.now();sim.step(1/60,now,true);state=sim.snapshot(false);totals.chaos+=performance.now()-at;
 if(tick>=120)samples.push(state.shots.length);
}
const result={rats:count,steps:600,totals,perStep:Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,v/600])),peakBalls:Math.max(...samples),notes:'Local 120-step warmup +600 measured steps; hits do not kill, no persistence/network/rendering. Brain includes rays; totals are nested, not additive.'};
controller.dispose();await writeFile(resolve(out,`${count}.json`),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));

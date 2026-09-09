import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const out = resolve('test-results/explosion-optimization');mkdirSync(out,{recursive:true});
await build({stdin:{contents:`export { ChaosSimulation } from './src/shared/ChaosSimulation';export { createPlayer } from './src/worker/gameState';`,resolveDir:process.cwd(),loader:'ts'},outfile:resolve(out,'simulation.mjs'),bundle:true,packages:'external',platform:'node',format:'esm',plugins:process.argv.includes('--reference')?[{name:'original-simulation',setup(build){build.onLoad({filter:/[\/]ChaosSimulation\.ts$/},()=>({contents:readFileSync(resolve(out,'ChaosSimulation.before.txt'),'utf8'),loader:'ts',resolveDir:resolve('src/shared')}));}}]:[]});
const {ChaosSimulation,createPlayer}=await import(resolve(out,'simulation.mjs'));
const samples=[];let bodyCount=0,rayCount=0,ballCount=0;
for(let run=0;run<9;run++){
 const p=createPlayer('victim','Victim',{hatType:'fedora',hatColor:1,furColor:2,coatColor:3},{x:-16,y:0,z:-28});
 const sim=new ChaosSimulation(new Map([[p.id,p]]),()=>{},undefined,{version:2,seed:42});
 sim.step(0,1000);sim.dispatch={phase:'active',started:1000,until:30000,serial:1};p.hp=0;sim.death(p,{x:1,y:.15,z:.3});
 bodyCount=sim.world.bodies.length;ballCount=sim.snapshot(false).shots.length;
 let rays=0,rayMs=0;const original=sim.ray.bind(sim);sim.ray=(...args)=>{const t=performance.now();const result=original(...args);rayMs+=performance.now()-t;rays++;return result;};
 const t=performance.now();for(let tick=1;tick<=120;tick++)sim.step(1/60,1000+tick*1000/60);
 const elapsed=performance.now()-t;rayCount=rays;
 if(run>=2)samples.push({totalMs:elapsed,rayMs,perStepMs:elapsed/120});
}
const median=key=>samples.map(x=>x[key]).sort((a,b)=>a-b)[Math.floor(samples.length/2)];
const report={scenario:'One existing-map 120-ball incident explosion; 120 fixed 1/60 steps; 2 warmup + 7 measured repeats; no clients/network/rendering',bodyCount,ballCount,rayCount,median:{totalMs:median('totalMs'),rayMs:median('rayMs'),perStepMs:median('perStepMs')},samples};
writeFileSync(resolve(out,`${process.argv[2]||'current'}.json`),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));

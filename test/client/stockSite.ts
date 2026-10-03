import type {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {isPickupKind,type PickupKind} from '../../src/shared/pickups';

/** The simulation's private site table, read through a runtime check (its `kind` is what a test stocks). */
function siteTable(sim:ChaosSimulation):Map<string,{kind:PickupKind;availableAt:number}> {
    const table:unknown=Reflect.get(sim,'pickups');
    if(!(table instanceof Map)||![...table.values()].every(s=>s&&typeof s==='object'&&isPickupKind(s.kind)&&typeof s.availableAt==='number'))
        throw Error('ChaosSimulation.pickups is no longer a site table');
    return table;
}
/** Every site but a Quick Fix one rolls a random pickup (protocol 32), so a test that needs a `kind` stocks one: the site
 * `pick` names, or the `pick`-th available site already holding it, else the next available site of the same family
 * (heal or not) set to it. */
export function stockSite(sim:ChaosSimulation,kind:PickupKind,pick:number|string=0){
    const sites=siteTable(sim),time=sim.snapshot(false).time;
    const open=[...sites].filter(([id,s])=>typeof pick==='string'?id===pick:s.availableAt<=time&&(s.kind==='quick-fix')===(kind==='quick-fix'));
    const skip=typeof pick==='number'?pick:0,holding=open.filter(([,s])=>s.kind===kind),others=open.filter(([,s])=>s.kind!==kind);
    const [id,site]=(holding[skip]??others[skip-holding.length])!;
    site.kind=kind;
    return sim.snapshot(false).pickups!.find(p=>p.id===id)!;
}

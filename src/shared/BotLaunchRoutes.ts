import {LAUNCH_MACHINES,type LaunchMachine} from './chaosState';
import {PICKUP_ANCHORS} from './pickups';
import type {Vec3Data} from './networkProtocol';

export interface BotLaunchLink { machine:LaunchMachine; landing:Vec3Data }
export interface BotWaypoint extends Vec3Data { launch?:BotLaunchLink; drop?:Vec3Data }
/** Known map routes, not knowledge of hidden rats. Land on the open front roofs,
 * then let the ordinary supported graph handle pursuit or supply collection. */
export const BOT_LAUNCH_LINKS:readonly BotLaunchLink[]=[
    ['dumpster','records'],['freight','icebox'],['mousetrap','needleworks'],
    ['pressure','pump'],['geyser','gate'],
].map(([machine,landmark])=>{
    const anchor=PICKUP_ANCHORS.find(p=>p.id===`alibi-${landmark}-roof`)!;
    return {machine:LAUNCH_MACHINES.find(m=>m.id===machine)!,landing:{x:anchor.x,y:anchor.y!-.7,z:anchor.z}};
});

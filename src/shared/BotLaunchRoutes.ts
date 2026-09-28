import {LAUNCH_MACHINES,type LaunchMachine} from './chaosState';
import type {Vec3Data} from './networkProtocol';

export interface BotLaunchLink { machine:LaunchMachine; landing:Vec3Data }
export interface BotWaypoint extends Vec3Data { launch?:BotLaunchLink; drop?:Vec3Data }
/** Open front roof landing per landmark (feet height). */
const ROOF_LANDINGS:Record<string,Vec3Data>={
    records:{x:-16,y:36,z:-43},icebox:{x:130,y:36,z:-42},needleworks:{x:-105,y:36,z:98},
    pump:{x:125,y:36,z:130},gate:{x:-137,y:29,z:0},
};
/** Known map routes, not knowledge of hidden rats. Land on the open front roofs,
 * then let the ordinary supported graph handle pursuit or supply collection. */
export const BOT_LAUNCH_LINKS:readonly BotLaunchLink[]=[
    ['dumpster','records'],['freight','icebox'],['mousetrap','needleworks'],
    ['pressure','pump'],['geyser','gate'],
].map(([machine,landmark])=>({machine:LAUNCH_MACHINES.find(m=>m.id===machine)!,landing:{...ROOF_LANDINGS[landmark!]!}}));

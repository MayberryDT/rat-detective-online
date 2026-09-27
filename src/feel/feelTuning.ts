/** Every presentation-only feel constant, grouped by reviewable item.
 * Values are starting points dialled in with `?feel=dev`; they never affect
 * authority, aim, collision or tuning. `toggle:false` groups are shared
 * infrastructure rather than items that can be switched off on their own. */
export interface FeelSpec {
    label:string;
    toggle:boolean;
    /** Off by default until review turns it on; only for optional variants. */
    defaultOff?:boolean;
    params:Record<string,number>;
}

export const FEEL={
    cameraSpring:{label:'Camera spring',toggle:false,params:{stiffness:260,damping:.78,maxTurn:.08,maxShift:.35,maxWiden:14,fovStiffness:60}},
    /** Upward view nudge (rad/s impulse) and a small backward shove per local shot. */
    shotKick:{label:'1 Shot kick',toggle:true,params:{pitch:.9,yawJitter:.25,push:.6,scattershot:1.6,popcorn:1.3}},
    /** Shove away from the attacker when you take nonlethal damage, scaled by damage. */
    hitJolt:{label:'2 Hit jolt',toggle:true,params:{push:7,yaw:1.4,dip:-1.1,perDamage:.35}},
    /** Red edge flash (scaled by Flash strength) and arrows tracking the attacker. */
    damageDirection:{label:'3 Damage direction and edge flash',toggle:true,params:{edge:.55,edgeFade:.7,arrowLife:1.1,radius:.2}},
    /** Hit-stop on the struck rat's model (seconds): hits you deal, and hits you take. */
    impactFreeze:{label:'4 Impact freeze',toggle:true,params:{dealt:.055,taken:.04}},
    /** Wall and floor splats: bigger, last longer; walls grow runs of cheese that slide down. */
    splats:{label:'5 Bigger dripping splats',toggle:true,params:{size:1.35,life:6,drips:2,dripLength:.9}},
    /** Cheese stains build up on a rat's coat during one life (max 8), cleared on respawn. */
    stains:{label:'6 Cheese stains',toggle:true,params:{}},
    /** Silver spark burst (with the existing armour clang) when cheese reflects off Ironclad. */
    ironcladSparks:{label:'7 Ironclad sparks',toggle:true,params:{count:18,speed:11,life:.36}},
    /** Ring burst around the crosshair plus a brief zoom-in (degrees) on your kills. */
    killBloom:{label:'8 Kill bloom and punch-in',toggle:true,params:{punch:4}},
} satisfies Record<string,FeelSpec>;

export type FeelItem=keyof typeof FEEL;

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
    /** Very subtle upward view nudge (rad/s impulse; peak ≈ 0.4°) and a tiny backward shove per local shot. Toned down 2026-09-27 at Tyler's request. */
    shotKick:{label:'1 Shot kick',toggle:true,params:{pitch:.28,yawJitter:.15,push:.15,scattershot:1.3,popcorn:1.15}},
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
    /** Comic words: kill streaks within `streakWindow` s, air kills, Big Cheese hits; `cooldown` s between non-streak words. */
    comicWords:{label:'9 Comic words',toggle:true,params:{streakWindow:4,cooldown:6}},
    /** Noir low health: colour drain/vignette by danger (hp 2 → `mid`, hp 1 → 1), muffle cutoff (Hz), heartbeat period/volume, heal flood. */
    lowHealth:{label:'10 Noir low health',toggle:true,params:{mid:.4,drain:.9,vignette:.55,flood:.6,ease:3,closed:900,period:.95,heartbeat:.5}},
    /** Fedora knocked askew by hits (radians), settling over `settle` s. */
    hatKnock:{label:'11a Hat knock',toggle:true,params:{tilt:.32,lift:.12,settle:.45}},
    /** On death the fedora pops off and tumbles (horizontal speed, upward speed). */
    hatPop:{label:'11b Hat pop-off',toggle:true,params:{speed:4,lift:9}},
    /** Corpse secondary motion by cause: shot spin, explosion fling, trap flop (visual only; server physics unchanged). */
    deathVariety:{label:'12 Death variety',toggle:true,params:{spinGain:1.5,spinWhirl:.5,flingGain:1.8,flingStretch:.26,flingTime:.42,flopGain:.6,flopLanding:2.2,flopDroop:.6}},
    /** Death camera: turn to your corpse over `turn` s, pull back, follow for `follow` s, then iris closes over `close` s to `irisRadius` vmax. */
    deathCam:{label:'13 Death camera and iris',toggle:true,params:{turn:.3,pullBack:2.5,follow:.8,close:.6,irisRadius:16}},
    /** Model touch-ups (whiskers, brows, cheeks, nose, brim edge); built into new rats, so reload after switching. */
    modelTouchUps:{label:'14 Model touch-ups (reload)',toggle:true,params:{}},
    /** Shoes under the coat hem; Tyler chose on by default. Needs model touch-ups. */
    shoes:{label:'14b Shoes (reload)',toggle:true,params:{}},
    /** Animation pass: squash/stretch, skid (braking decel u/s²), sneaky carry, flight flare, kill nod. */
    animationPass:{label:'15 Animation pass',toggle:true,params:{jumpStretch:.07,landSquash:.1,skidDecel:70,skidLean:.22,hunch:.12,glance:.45,flare:.1,nod:.22}},
    /** Movement: landing dip (rad/s impulse), launch/Hot Pursuit view widening (degrees), speed streaks, dust count. */
    movement:{label:'16 Movement',toggle:true,params:{dip:-1.6,dipPush:-5,launchWiden:9,pursuitWiden:3.5,streaks:.8,dust:8}},
    /** Synthesized sound pass (volumes before Effects volume): footsteps, rustle, jostle, squelch, whizz, brass, stings, wind; echo/muffle by space. */
    sound:{label:'17 Sound',toggle:true,params:{step:.07,remoteStep:.05,stepRange:14,rustle:.05,jostle:.08,squelch:.1,whizz:.2,whizzRange:1.8,brass:.12,sting:.1,wind:.07}},
    /** Reactive city: a flock every N lamps, a trash can every N lamps, scare radius, seconds before props return. */
    city:{label:'18 City reacts',toggle:true,params:{flockEvery:5,canEvery:4,scare:7,respawn:25}},
    /** Rewards: victory slow-motion (seconds, rate, catch-up), callout cooldown, score punch and Case File. */
    rewards:{label:'19 Rewards',toggle:true,params:{slowmo:1.4,slowRate:.3,catchup:.8,calloutCooldown:3}},
} satisfies Record<string,FeelSpec>;

export type FeelItem=keyof typeof FEEL;

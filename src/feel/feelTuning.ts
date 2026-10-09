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
    /** Params the review panel shows as sliders: [min, max, step]. */
    sliders?:Record<string,readonly [number,number,number]>;
}

export const FEEL={
    heavyCheese:{label:"Heavy cheese review",toggle:true,defaultOff:true,params:{muzzleLife:.07,impactLife:.18,muzzleSize:.20,impactSize:.36}},
    cameraSpring:{label:'Camera spring',toggle:false,params:{stiffness:260,damping:.78,maxTurn:.08,maxShift:.35,maxWiden:14,fovStiffness:60}},
    /** Very subtle upward view nudge (rad/s impulse; peak ≈ 0.4°) and a tiny backward shove per local shot. Toned down 2026-09-27 at Tyler's request.
     * Scattershot is a shotgun: `scattershot`× the kick and a `scatterWiden`° field-of-view thump (trimmed about 80% on
     * 1 October after Tyler's protocol 27 playtest: 3.2× and 3°). */
    shotKick:{label:'1 Shot kick',toggle:true,params:{pitch:.28,yawJitter:.15,push:.15,scattershot:.65,scatterWiden:.6}},
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
    /** Comic words: kill streaks within `streakWindow` s, air kills; `cooldown` s between non-streak words. */
    comicWords:{label:'9 Comic words',toggle:true,params:{streakWindow:4,cooldown:6}},
    /** Noir low health, by danger (linear from max HP to the last hit point): the city fades to black and white with its shadows
     * lifted to `lift` (a gamma, so the last hit point reads clearer, not darker) and old-film `grain`; a light edge `vignette`;
     * muffle cutoff (Hz), heartbeat period/volume, heal flood. Rats, cheese, cases and pickups keep their colour. */
    lowHealth:{label:'10 Noir low health',toggle:true,params:{lift:.86,grain:.1,vignette:.22,flood:.6,ease:3,closed:900,period:.95,heartbeat:.5}},
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
    sound:{label:'17 Sound',toggle:true,params:{step:.07,remoteStep:.05,stepRange:14,rustle:.05,jostle:.08,squelch:.1,whizz:.2,whizzRange:1.8,brass:.12,headshot:.22,headshotRange:45,flashbulb:.18,shutter:.2,made:.16,hunch:.2,supply:.2,supplyRange:40,jam:.22,sting:.1,wind:.07,rain:.06,thunder:.16,hum:.035}},
    /** Reactive city: a flock every N lamps, a trash can every N lamps, scare radius, seconds before props return. */
    city:{label:'18 City reacts',toggle:true,params:{flockEvery:5,canEvery:4,scare:7,respawn:25}},
    /** P4 case papers in the harbour wind: edges lift in passing gusts (strength scales the lift), loose sheets hop
     * between their two spots, new sheets blow in and retired ones blow away; rats and shots ruffle them.
     * Off (or Reduced interface motion): every sheet lies still where the authority put it. */
    paperWind:{label:'P4 Case papers in the wind',toggle:true,params:{strength:1}},
    /** Rewards: victory slow-motion (seconds, rate, catch-up), callout cooldown, score punch and Case File. `bank`: the
     * seconds of the same slow-motion a Crossfire bank kill gives its killer. */
    rewards:{label:'19 Rewards',toggle:true,params:{slowmo:1.4,slowRate:.3,catchup:.8,calloutCooldown:3,bank:.55}},
    /** Shared noir strength for the city look (Tyler chose Bold ≈ .65). Rats are never affected. */
    noir:{label:'Noir strength',toggle:false,params:{strength:.65,clear:.2},sliders:{strength:[0,1,.01],clear:[0,1,.01]}},
    /** N1: contrast curve on city surfaces (dark areas sink, lamp pools stay bright). */
    noirShadows:{label:'N1 Deeper shadows',toggle:true,params:{}},
    /** N2: city albedo toward cold grey-blue; windows and lamps keep warmth. */
    noirDrain:{label:'N2 Colour-drained city',toggle:true,params:{}},
    /** N3: rain (fall speed, slant), wet-street lamp reflections (range, length, width, opacity), drop count on desktop/phone. */
    noirRain:{label:'N3 Rain and wet streets',toggle:true,params:{speed:34,slant:.12,reflectRange:70,reflectLength:9,reflectWidth:1.1,reflectOpacity:.6,drops:700,phoneDrops:260}},
    /** N4: light cones under the nearest streetlamps (opacity, range) and extra cold fog (fraction of base density). */
    noirHaze:{label:'N4 Haze',toggle:true,params:{opacity:.32,range:70,fog:.45}},
    /** N8: searchlight beams (opacity, sweep speed) and lightning (gap range s, ambient flash gain). */
    noirSky:{label:'N8 Searchlights and lightning',toggle:true,params:{beamOpacity:.16,sweepSpeed:.12,minGap:28,maxGap:70,flash:2.5}},
    /** N5: warm venetian-blind slats on landmark interior floors. */
    noirBlinds:{label:'N5 Venetian-blind light',toggle:true,params:{opacity:.9}},
    /** N7: neon signs on landmark facades (brightness, chance per second of a buzzing stutter). */
    noirNeon:{label:'N7 Neon accents',toggle:true,params:{brightness:1,flickerRate:.08}},
    /** N6: film grain (off on phones), vignette, and letterbox bars during the death camera and victory slow-motion. */
    noirFilm:{label:'N6 Film grain, vignette, letterbox',toggle:true,params:{grain:.09,vignette:.55}},
    /** T2: the city's noir look stays at `Noir strength · clear` at every health; low health fades it to black and white (item 10). */
    noirByHealth:{label:'T2 Noir scales with health',toggle:true,params:{}},
    /** T2: from two hit points Quick Fix kits glow green through walls; at the last hit point the case also loses its markers. */
    lastHitPoint:{label:'T2b Low health: Quick Fix x-ray (2 HP), case hidden (1 HP)',toggle:true,params:{}},
    /** T4: a lethal headshot. Hat speed/lift multiply the hat pop; `hold` is the beat before the fall;
     * `burst` scales the cheese burst at the head. */
    headshot:{label:'T4 Headshot juice',toggle:true,params:{hatSpeed:2.6,hatLift:1.5,hold:.16,burst:2.4}},
    /** T5: the police lineup at round end (top five, winner last). */
    lineup:{label:'T5 Police lineup',toggle:true,params:{}},
    /** Blackout (incident, always on): seconds to fade; every rat's flashlight becomes a hard, narrow beam (`beam`
     * intensity, cone half-angle `angle` rad, `penumbra`, `decay`) that carries to `FLASHLIGHT_REACH`. The city's own
     * lights go out; exposure stays, so what a beam lights reads bright. Muzzle flashes within `muzzleRange` lift the dark. */
    blackout:{label:'I3 Blackout',toggle:false,params:{fade:1.2,beam:320,angle:.42,penumbra:.12,decay:.6,muzzle:.7,muzzleRange:40}},
    /** Bad Ammunition juice: muzzle `smoke` and each ball's personality sound (`volume`; a superball's boing at
     * `superballPitch`, at launch and every bounce), and your own ball's word. The paths themselves are gameplay. */
    badAmmo:{label:'I2 Bad Ammunition juice',toggle:true,params:{smoke:.6,volume:.8,superballPitch:1.7}},
    /** Code Violation juice: sparks off supplies and machines with a zap (`zap` volume) when close. */
    codeViolation:{label:'I5 Code Violation juice',toggle:true,params:{zap:.7}},
    /** The Hunch (gameplay, always on): at full health you see rats within `range` through walls as a pencil sketch
     * (`strength` opacity); Stakeout (and the Most Wanted sketch) uses `superRange`/`superStrength`. `trail` is the pencil tail brightness. */
    hunch:{label:'H The Hunch',toggle:false,params:{range:40,strength:.6,superRange:400,superStrength:.9,trail:.8,photo:1.5,remake:10,cardGap:8}},
    /** H2: being made. Spotter: evidence photo corners, typed MADE line and shutter. Spotted: YOU'VE BEEN MADE card, violin sting and a watching eye. */
    made:{label:'H2 Made moments',toggle:true,params:{}},
    /** L5: a machine firing: debris by machine, dust ring, overpressure sparks and smoke; hats blown off within `hatRange`;
     * `shake` (degrees) and `shakeRange` for the rumble nearby; your own launch kicks the view by `kick`. */
    launchMoment:{label:'L5 Launch moment',toggle:true,params:{hatRange:9,shake:1.2,shakeRange:30,kick:2.4,push:-9,debris:40}},
    /** L6: flight: scream, flail, contrails behind every launched rat, speed lines; `hang` seconds of floaty apex. */
    launchFlight:{label:'L6 Flight',toggle:true,params:{scream:.2,screamRange:60,trailEvery:.035,streaks:1,hang:.45,hangLift:.75}},
    /** L7: landing: crater and cracked pavement, dust, THUD, shake within `shakeRange`; the thrown case whistles and spills paperwork. */
    launchLanding:{label:'L7 Landing',toggle:true,params:{thud:.35,shake:2.2,shakeRange:35,decalLife:9,whistle:.14,paper:8}},
    /** P4: Pressure Surge look: the city rumble (`rumble` volume) and view shake (`shake`) rise over the incident;
     * each eruption or firing flickers the city lights by `flicker`. Street steam comes from the launchers. */
    surgeLook:{label:'P4 Surge look',toggle:true,params:{rumble:.16,shake:.5,flicker:.45}},
    /** D1: Dispatch alarm pillars: ringing bursts with a blurred hammer and a trembling post, the beacon's turning red wash on the pavement,
     * hits jolting the pillar with a clank, the last-three ticks, finale and all clear; `bell` volume within `bellRange`. The siren and face text always stay. */
    dispatchPillar:{label:'D1 Dispatch pillars',toggle:true,params:{bell:.3,bellRange:70,finale:.2,whistle:.16}},
    /** D2: the shot that starts an incident: berserk bell, sparks, shattered call-box glass, a citywide radio `squawk`, a view `kick`
     * within `kickRange`, and every streetlamp flashing red, sweeping out from the pillar at `sweep` units/s. */
    dispatchShot:{label:'D2 Dispatch shot',toggle:true,params:{kick:1.6,kickRange:30,sweep:260,squawk:.22}},
    /** R1–R3: floppy corpse limbs, cause-shaped deaths, splay and dead face, rolling hat; shots jolt limbs with a `squeak` heard within `squeakRange`. */
    ragdoll:{label:'R Ragdoll limbs',toggle:true,params:{squeak:.16,squeakRange:40,jolt:1}},
    /** Seventh batch R1–R5: the corpse body bends (soft spine) and is posed by a client point chain dragged by the corpse's position:
     * goes limp first (`limp` s before a local corpse flies), limbs trail on air `drag`, lands like a sack (`squash`), one last `twitch`,
     * and shots fold it where hit (`jolt` u/s). `spin` is the local corpse's tumble (rad/s; the old rigid tumble was 16). */
    ragdollBody:{label:'R7 Ragdoll body (bend, chain, sack)',toggle:true,params:{limp:.1,drag:1.6,squash:.3,twitch:1.6,jolt:5.5,spin:4}},
    /** M1: living face: ears and whiskers bounce on jolts; wide eyes and an open-mouth scream on launches, a gasp on near misses. */
    face:{label:'M1 Face',toggle:true,params:{}},
    /** M2: springy tail behind turns, hat rocking with each step, a flinch of the head away from hits. */
    bodySprings:{label:'M2 Body springs',toggle:true,params:{}},
    /** M3: each rat wears one extra from its name: cigarette, detective's badge or scarf (applies to newly built rats). */
    extras:{label:'M3 Personality extras (reload)',toggle:true,params:{}},
    /** U2: entering swoops from the title desk into the city (presentation only; control is immediate). */
    titleSwoop:{label:'U2 Title swoop',toggle:true,params:{}},
    /** U3: the settings and pause case folder opens, slides between tabs and puts itself away, with sounds. */
    caseFolder:{label:'U3 Case-folder settings motion',toggle:true,params:{}},
    /** U4: scores roll, ranks slide, points fly to the score card, bars ease, urgent timers shake and tick. */
    scoreMotion:{label:'U4 Score and assignment motion',toggle:true,params:{}},
    /** U5: telegram kill feed lines type in, tear away and close ranks. */
    telegramFeed:{label:'U5 Telegram kill feed motion',toggle:true,params:{}},
    /** U6: the crosshair spreads `move` px at `speed` u/s and `kick` px per shot (at most `max`), recovering `recover`/s; hit markers grow with damage. */
    reactiveCrosshair:{label:'U6 Reactive crosshair',toggle:true,params:{move:3,speed:9,kick:3,max:8,recover:9}},
    /** U7: RAT DOWN waits for the death camera and iris; the respawn countdown is a clock. */
    deathBeat:{label:'U7 Death beat',toggle:true,params:{}},
    /** U8: Case File awards count up and stamp in `gap` s apart, with a thump; results rows slide into order. */
    caseFileStamps:{label:'U8 Case File stamping',toggle:true,params:{gap:.42}},
    /** U9: scoreboard paper slide and live reordering, pickup-card exits, springy touch controls. */
    paperSlide:{label:'U9 Scoreboard, card exits, touch springs',toggle:true,params:{}},
    /** Carbon scrawl: headings and names on the in-game carbon copies jitter a hair, letter by letter. */
    scrawl:{label:'U10 Carbon scrawl letter jitter',toggle:true,params:{}},
    /** C1 Claim juice (1 October), your own claims only: an edge flash in the supply's colour (`flash`), a `punch` zoom-in (degrees),
     * a small `kick` (rad/s), the card artwork flying from the prop into its card over `flight` ms, and a squash-and-pop of your rat
     * (`squash` × the jump squash). */
    claimMoment:{label:'C1 Claim moment',toggle:true,params:{flash:.6,punch:3,kick:.9,flight:560,squash:1.8}},
    /** C2 Stakeout claim: an ink ripple from your rat; rats light up in the Hunch nearest first, `stagger` s apart from `delay` s
     * (a shutter each, at most `clicks`); a `lens` s magnifying-glass vignette. */
    claimStakeout:{label:'C2 Stakeout claim',toggle:true,params:{delay:.12,stagger:.075,clicks:6,lens:.4}},
    /** C3 Ironclad claim: a weighty `dip` (rad/s) and `push` down (u/s), one shine across the silver coat (`shine` s), `sparks` spark bursts. */
    claimIronclad:{label:'C3 Ironclad claim',toggle:true,params:{dip:-2.4,push:-6,shine:.35,sparks:2}},
    /** C4 Hot Pursuit claim: the view widens `widen` degrees with speed lines for `streaks` s, and red dust (`dust` strength) at your feet. */
    claimHustle:{label:'C4 Hot Pursuit claim',toggle:true,params:{widen:7,streaks:.5,dust:1}},
    /** C5 Quick Fix claim: the restored nameplate pips refill one at a time, `pip` s apart, with a tick each. */
    claimQuickFix:{label:'C5 Quick Fix claim',toggle:true,params:{pip:.07}},
    /** K1 Case claim (Tyler, 1 October: "it needs to feel good when you pick up the case"): your own take of the case slams an
     * ON THE CASE stamp over a burst of `sheets` paper sheets, with a brass edge `flash`, a `punch` (deg) in, a `kick` and
     * a `squash` of your rat; everyone sees the case burst paperwork (`paper` sheets) wherever it is taken or knocked loose. */
    caseClaim:{label:'K1 Case claim',toggle:true,params:{flash:.75,punch:4,kick:1.2,squash:2.4,sheets:12,paper:8,kickPaper:3}},
    /** K2 Case motion: carried, the case swings on its handle against the paw's acceleration (`swing` gain, `spring` rad/s,
     * `damping` ratio, at most `maxSwing` rad); taken, it squashes by `squash`; loose and still, it hops `hop` units for
     * `hopMs` about every `idleEvery` s; its evidence tag flaps on every jolt. */
    caseMotion:{label:'K2 Case motion',toggle:true,params:{swing:60,spring:9,damping:.22,maxSwing:.6,squash:.28,hop:.12,hopMs:320,idleEvery:3.5}},
    /** K3 Hot case, the carrier's own feel (Tyler, 2 October: the buff is felt). While you carry a
     * buffed case: its HOT CASE card; on each ping (`HEARTBEAT`) a brief, strong case-red screen-edge pulse (`edge` × Flash
     * strength, `still` of it under Reduced interface motion) so you know you were just seen; a heartbeat only you hear, a muted upright
     * bass lub-dub (`beat` volume, `accent` × on the beat that lands on a ping) at `slow` beats a ping (75 bpm) far from
     * the target quickening to `fast` (120 bpm) beside it. Any carrier's balls draw heavier and red-cored with a `thump`
     * (volume) under the shot and `sparks` red sparks on its hits. A kill while carrying: a red heal flare up your rat,
     * `surge` fast beats `surgeGap` s apart and the CASE CLOSED · HEALED stamp. */
    hotCase:{label:'K3 Hot case carrier feel',toggle:true,params:{edge:.35,still:.6,beat:.2,accent:1.6,slow:5,fast:8,thump:.9,sparks:14,surge:4,surgeGap:.26}},
    /** A1 Air acting (Tyler, 1 October: jumping rats were "stiff and lifeless", a salt shaker). Every rat, airborne from a
     * take-off over `takeOff` u/s or a fall over `fall` u/s until it lands: no walking stride in the air; `stretch` rising,
     * a `squash` and `tuck` (rad) ball at the apex with the feet pulled up (`feet`), a `reach` falling with ears (`ears`),
     * tail (`tail`) and hat (`hat`) streaming up; a small forward `lean` (rad) into travel about `pivot` units up the coat;
     * `arch` (rad) back on the way up; a landing squash (`land`) that wobbles back. Sideways (Tyler: banking into a strafe
     * jump looked like "torpedoing to the side") the coat stays upright, lagging only `sway` (rad), while the tail, hat
     * and ears trail by `drag` (rad), springing over when the rat reverses. */
    airActing:{label:'A1 Air acting',toggle:true,params:{takeOff:9,fall:7,stretch:.22,squash:.12,reach:.1,tuck:.55,arch:.14,lean:.12,sway:.05,drag:.5,pivot:.9,feet:1,ears:.7,tail:.6,hat:.1,land:.22}},
    /** W1 Tommy Gun (protocol 27; halved after Tyler's playtest, still above Scattershot): each of your shots kicks the view
     * (`kick` rad/s, `yaw` jitter share, `push` u/s back) and, while the trigger is held, the view rattles (`rattle`); every
     * Tommy's muzzle throws a cheese-yellow flash (`flash` size) and puff (`puff` size), `crumbs` cheese crumbs a round and
     * cheese-cube casings (`casings` in the pool, `casingLife` s), seen within `range` units. Clarity batch: 24 casings and
     * 3 crumbs a round (were 64 and 4). At 20 rounds a second (Tyler, 2 October, protocol 31) each round kicks half as
     * hard (were .55 and .22), so a held second shakes as before, and casings live 1.2 s (were 1.6) so one held Tommy's
     * 24 fill the pool without snapping the oldest away early. */
    tommyGun:{label:'W1 Tommy Gun juice',toggle:true,params:{kick:.28,yaw:.9,push:.11,rattle:.28,flash:1,puff:1,crumbs:3,casings:24,casingLife:1.2,range:70}},
    /** W2 Laser, a molten cheese beam: your shot's kick (`kick`, `push`); widths (units) of the hot centre (`core`), the
     * cheese strand (`strand`) and its greasy green sheen (`sheen`, opacity `glow`); its gooey wobble and end-of-life sag
     * (units); `gobs` dripped per beam (`gobSize` units); cheese splats on walls (`splats` in the pool, `splatSize` units,
     * `splatLife` s). The beam itself always draws. Clarity batch: 5 gobs a beam, 12 splats for 6 s (were 9, 32 and 9 s). */
    laser:{label:'W2 Laser juice',toggle:true,params:{kick:1.6,push:.9,core:.08,strand:.26,sheen:1.1,glow:.9,wobble:.12,sag:.8,gobs:5,gobSize:.07,splats:12,splatSize:1.1,splatLife:6}},
    /** W3 Mousetrap: a catch's SNAP shakes the view within `snapRange` (`snap` rad/s); a refused placement nudges it (`refuse`).
     * Taking one up: the TRAP IN PAW moment's pine edge flash (`inPaw` × Flash strength) and the view's heave (`heave` rad/s). */
    mousetrap:{label:'W3 Mousetrap juice',toggle:true,params:{snap:1.8,snapRange:24,refuse:.35,inPaw:.9,heave:.9}},
} satisfies Record<string,FeelSpec>;

export type FeelItem=keyof typeof FEEL;

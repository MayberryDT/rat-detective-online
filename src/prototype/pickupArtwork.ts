import type {FaultyKind,PickupKind} from '../shared/pickups';

const ink='stroke="#0a0e1a" stroke-width="5" stroke-linejoin="round"';
/** Hand-inked silhouettes shared by the active-effect cards. No external assets. */
const ART:Record<PickupKind,string>={
    'quick-fix':`<path d="m18 29 64-5 5 60-66 6Z" fill="#eff5df" ${ink}/><path d="m36 27-1-13 28-2 2 14" fill="none" ${ink}/><path d="m42 38 17-1 1 14 14-1 1 17-15 1 1 14-17 1-1-14-14 1-1-17 15-1Z" fill="#65cf8b" ${ink}/><path d="m14 9 2-9 3 9 9 3-9 3-3 9-2-9-9-3ZM84 7l2 8 8 2-8 3-2 8-2-8-8-3 8-2Z" fill="#b7f4bb"/>`,
    ironclad:`<path d="M30 20 43 14 57 14 70 20 84 57 68 63 65 47 70 88 30 88 35 47 32 63 16 57Z" fill="#bacbdb" ${ink}/><path d="m43 16 7 25-17-7 7 23 10-10 10 10 7-23-17 7 7-25" fill="#edf5ed" ${ink}/><path d="M32 69h36M50 48v37" ${ink}/><path d="m76 9 2-8 3 8 9 3-9 3-3 8-2-8-9-3Z" fill="#fff6d8"/>`,
    hustle:`<path d="m41 15 28 5-7 35 20 13 5 15-8 8H28l-7-14 6-21Z" fill="#fa5037" ${ink}/><path d="m29 58 22 9m-25-1 21 9M26 83h54" fill="none" stroke="#fff0cf" stroke-width="5"/><path d="M39 26 8 31l14 10L3 46l30 9" fill="#ffc763" ${ink}/><path d="m78 15-5 15 18-4-15 23 5-17-15 4Z" fill="#ffce63"/>`,
    // A brass magnifying glass with a pencil-sketch rat caught in the lens: the Hunch, city-wide.
    stakeout:`<path d="m59 63 7-7 30 30-7 7Z" fill="#a8683a" ${ink}/><circle cx="40" cy="42" r="32" fill="#f3cf6f" ${ink}/><circle cx="40" cy="42" r="22" fill="#e3e6d6" ${ink}/><path d="M26 55c1-8 7-13 14-13s13 5 15 10l-7 2c-7 4-15 4-22 1Zm4-10a5 5 0 1 1 7-3m6-1a5 5 0 1 1 7 3" fill="none" stroke="#b58a2e" stroke-width="3" stroke-linecap="round" stroke-dasharray="5 3"/><path d="M26 36a16 16 0 0 1 9-10" fill="none" stroke="#fffbea" stroke-width="5" stroke-linecap="round"/><path d="m84 5 2 8 8 2-8 3-2 8-2-8-8-3 8-2Z" fill="#ffe7a3"/>`,
    // A drum-fed Thompson: walnut stock and grips, finned barrel, a cheese-faced drum.
    'tommy-gun':`<path d="M4 41 31 36 34 50 9 63Z" fill="#c27a3e" ${ink}/><path d="M28 33H68V48H28Z" fill="#8f99ab" ${ink}/><path d="M68 37H90V45H68Z" fill="#8f99ab" ${ink}/><path d="M72 34v14m6-14v14m6-14v14" stroke="#0a0e1a" stroke-width="3"/><path d="M89 34h8v14h-8Z" fill="#5d6576" ${ink}/><path d="M35 47h10l-4 19-10-3Z" fill="#c27a3e" ${ink}/><path d="M74 45h8l-1 18h-8Z" fill="#c27a3e" ${ink}/><circle cx="56" cy="62" r="16" fill="#f3c04a" ${ink}/><circle cx="56" cy="62" r="5" fill="#d29a3a" ${ink}/><circle cx="48" cy="55" r="2.6" fill="#b47a12"/><circle cx="64" cy="57" r="2.2" fill="#b47a12"/><circle cx="51" cy="71" r="2.4" fill="#b47a12"/><path d="m92 18 2 8 8 2-8 3-2 8-2-8-8-3 8-2Z" fill="#ffd27a"/>`,
    // A pulp ray gun: chrome body, red fins, a molten cheese dome, a coil of yellow and greasy green, cheese oozing from the dish.
    laser:`<path d="m6 30 20 10-2 16-18 10Z" fill="#e0453a" ${ink}/><path d="M18 48c0-14 12-20 26-20 11 0 17 9 19 15h12v10H63c-2 6-8 15-19 15-14 0-26-6-26-20Z" fill="#c9d3dc" ${ink}/><circle cx="41" cy="27" r="10" fill="#ffd23a" ${ink}/><path d="M42 31h10v12a5 5 0 0 1-10 0Z" fill="#ffd23a" stroke="#0a0e1a" stroke-width="3" stroke-linejoin="round"/><path d="M68 41v14" stroke="#ffd23a" stroke-width="6"/><path d="M74 41v14" stroke="#9fe82e" stroke-width="6"/><path d="m80 38 12-8v36l-12-8Z" fill="#c9d3dc" ${ink}/><path d="M30 64h11l-3 22H27Z" fill="#3a2a22" ${ink}/><path d="M92 48c4-7 6 6 9-1" fill="none" stroke="#9fe82e" stroke-width="11" stroke-linecap="round"/><path d="M92 48c4-7 6 6 9-1" fill="none" stroke="#ffd23a" stroke-width="5" stroke-linecap="round"/><path d="M82 59 92 64V79a5 5 0 0 1-10 0Z" fill="#ffd23a" stroke="#0a0e1a" stroke-width="3" stroke-linejoin="round"/><circle cx="98" cy="64" r="3.5" fill="#ffd23a" stroke="#0a0e1a" stroke-width="2.5"/><path d="M27 41a14 14 0 0 1 6-7" fill="none" stroke="#fffbea" stroke-width="4" stroke-linecap="round"/>`,
    // A big set Mousetrap: pine board, brass bar pulled back, a wedge of cheese on the pedal.
    mousetrap:`<path d="M6 66 30 42H96L72 66Z" fill="#e8c88e" ${ink}/><path d="M6 66H72L96 42V52L72 76H6Z" fill="#a8743e" ${ink}/><path d="M22 56 40 38H70L52 56" fill="none" stroke="#0a0e1a" stroke-width="9" stroke-linejoin="round"/><path d="M22 56 40 38H70L52 56" fill="none" stroke="#e8b54a" stroke-width="4" stroke-linejoin="round"/><circle cx="44" cy="51" r="5" fill="#e8b54a" ${ink}/><path d="m64 52 22-13 2 12Z" fill="#ffd04a" ${ink}/><circle cx="78" cy="47" r="2" fill="#b47a12"/><path d="m10 22 4 10m10-16 1 11m14-7-6 9" stroke="#fff0cf" stroke-width="4" stroke-linecap="round"/>`,
};
export function pickupArtwork(kind:PickupKind):string {return `<svg viewBox="0 0 100 100" aria-hidden="true">${ART[kind]}</svg>`;}

/** Card copy: the shout above the title, the title, the stamp and the spoken label. */
const CARD:Record<PickupKind,{shout:string;title:string;stamp:string;label:string}>={
    ironclad:{shout:'NOTHING STICKS!',title:'IRONCLAD<br>ALIBI',stamp:'ALIBI ON FILE',label:'Ironclad Alibi'},
    hustle:{shout:'MOVE IT, DETECTIVE!',title:'HOT<br>PURSUIT',stamp:'IN PURSUIT',label:'Hot Pursuit'},
    'quick-fix':{shout:'FIT FOR DUTY!',title:'QUICK<br>FIX',stamp:'CLEARED FOR DUTY',label:'Quick Fix · health restored'},
    stakeout:{shout:'EYES ON THE CITY!',title:'STAKE-<br>OUT',stamp:'UNDER SURVEILLANCE',label:'Stakeout'},
    'tommy-gun':{shout:'THE CHICAGO TYPEWRITER!',title:'TOMMY<br>GUN',stamp:'RAT-A-TAT-TAT',label:'Tommy Gun · hold fire'},
    laser:{shout:'SCIENCE, DETECTIVE!',title:'LASER',stamp:'BOUNCES OFF WALLS',label:'Laser'},
    mousetrap:{shout:'BAIT NOT INCLUDED!',title:'MOUSE-<br>TRAP',stamp:'ONE SNAP',label:'Mousetrap · fire to set it down'},
};
/** The status line under the title: health restored, how to set the trap down, or the time gauge. */
const STATUS:Partial<Record<PickupKind,string>>={
    'quick-fix':'<div class="powerup-healed">HEALTH RESTORED</div>',
    mousetrap:'<div class="powerup-healed powerup-hint"><span class="powerup-desktop-hint">CLICK TO SET IT DOWN</span><span class="powerup-touch-hint">FIRE TO SET IT DOWN</span></div>',
};
/** One illustrated carbon card. Timed effects get a gauge and a seconds clock; Quick Fix a full-health stamp; the
 * Mousetrap (held until set down) neither, only how to set it down. */
export function powerupCard(kind:PickupKind):HTMLElement {
    const card=document.createElement('div');card.className=`powerup-card powerup-${kind}`;
    const healing=kind==='quick-fix',{shout,title,stamp,label}=CARD[kind];
    const clock=kind==='mousetrap'?'':`<div class="powerup-clock"><b>${healing?'+':''}</b><small>${healing?'FULL HP':'SEC'}</small></div>`;
    card.innerHTML=`<div class="powerup-art">${pickupArtwork(kind)}</div><div class="powerup-copy"><small>${shout}</small><strong>${title}</strong>${STATUS[kind]??'<div class="powerup-gauge"><i></i></div>'}</div>${clock}<div class="powerup-stamp">${stamp}</div>`;
    card.setAttribute('aria-label',label);
    return card;
}

/** Code Violation's mark over a dud's drawing: soot, condemned tape and a spark. */
const CONDEMNED=`<svg class="powerup-dud-mark" viewBox="0 0 100 100" aria-hidden="true"><path d="M14 72c8-11 24-8 28 1s-15 15-25 9-7-6-3-10Z" fill="#0a0e1a" opacity=".6"/><circle cx="70" cy="62" r="9" fill="#0a0e1a" opacity=".45"/><circle cx="58" cy="80" r="5" fill="#0a0e1a" opacity=".5"/><path d="M2 30 98 76" stroke="#e4553a" stroke-width="13" opacity=".9"/><path d="M2 30 98 76" stroke="#0a0e1a" stroke-width="3" stroke-dasharray="7 7"/><path d="m80 4-7 13h9l-7 14" fill="none" stroke="#ffd04a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
/** Each dud's card copy, said to you: the title, what it does to you, the stamp and the spoken label. */
const DUD:Record<FaultyKind,{title:string;status:string;stamp:string;label:string}>={
    hustle:{title:'COLD<br>FEET',status:'YOU RUN SLOWLY',stamp:'RECALLED',label:'Cold Feet · you run slowly'},
    ironclad:{title:'RUST<br>BUCKET',status:'RUSTED STIFF: NO JUMPING',stamp:'CONDEMNED',label:'Rust Bucket · no jumping'},
    stakeout:{title:'STAKED<br>OUT',status:'EVERY RAT SEES YOU THROUGH WALLS',stamp:'LENS ON BACKWARDS',label:'Staked Out · every rat sees you through walls'},
    'tommy-gun':{title:'BACK-<br>FIRE',status:'IT BLEW UP IN YOUR PAWS',stamp:'OUT OF ORDER',label:'Backfire · the gun blew up in your paws'},
    laser:{title:'SHORT<br>CIRCUIT',status:'YOUR GUN WON\'T FIRE',stamp:'BLOWN FUSE',label:'Short Circuit · your gun will not fire'},
    mousetrap:{title:'SNAPPED<br>PAW',status:'STUCK IN YOUR OWN TRAP',stamp:'OUCH',label:'Snapped Paw · stuck in place'},
};
/** A Code Violation dud's card: the claimed supply's drawing, condemned, with what it does to you and its clock. */
export function faultyCard(kind:FaultyKind):HTMLElement {
    const card=document.createElement('div');card.className=`powerup-card powerup-faulty powerup-faulty-${kind}`;
    const {title,status,stamp,label}=DUD[kind];
    card.innerHTML=`<div class="powerup-art">${pickupArtwork(kind)}${CONDEMNED}</div><div class="powerup-copy"><small>CODE VIOLATION · FAULTY</small><strong>${title}</strong><div class="powerup-healed powerup-dud">${status}</div><div class="powerup-gauge"><i></i></div></div><div class="powerup-clock"><b></b><small>SEC</small></div><div class="powerup-stamp">${stamp}</div>`;
    card.setAttribute('role','status');card.setAttribute('aria-label',`Code Violation: ${label}`);
    return card;
}
/** Another rat's Mousetrap has you by the foot: the trap's drawing, what it means and its clock. */
export function heldCard():HTMLElement {
    const card=document.createElement('div');card.className='powerup-card powerup-held';
    card.innerHTML=`<div class="powerup-art">${pickupArtwork('mousetrap')}</div><div class="powerup-copy"><small>SNAPPED IN A TRAP</small><strong>HELD</strong><div class="powerup-healed powerup-dud">YOU CAN TURN AND SHOOT, NOT MOVE</div><div class="powerup-gauge"><i></i></div></div><div class="powerup-clock"><b></b><small>SEC</small></div><div class="powerup-stamp">SNAP!</div>`;
    card.setAttribute('role','status');card.setAttribute('aria-label','Held in a trap · you can turn and shoot, not move');
    return card;
}
/** K3: the case red-hot in your paw, cuffed to a chain, heat rising off it. */
const HOT_CASE_ART=`<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M36 34v-8a5 5 0 0 1 5-5h18a5 5 0 0 1 5 5v8" fill="none" ${ink}/><path d="M12 36h76l-3 46H15Z" fill="#ff3024" ${ink}/><path d="M14 52h72" stroke="#ffb27a" stroke-width="3"/><path d="M44 47h12v10H44Z" fill="#ffd28a" ${ink}/><path d="M21 42v34m58-34v34" stroke="#ff9a5c" stroke-width="2" opacity=".8"/><path d="M26 18c-4-5 4-8 0-13m22 11c-4-5 4-8 0-13m22 13c-4-5 4-8 0-13" fill="none" stroke="#ff7a4a" stroke-width="3" stroke-linecap="round"/><circle cx="92" cy="74" r="7" fill="none" stroke="#c9d3dc" stroke-width="4"/><path d="M85 72l-4-3m-2-2-4-3" stroke="#c9d3dc" stroke-width="4" stroke-linecap="round"/></svg>`;
/** K3: while you carry the hot case, its buff in the supply cards' family (case red): no clock, held until you lose it. */
export function hotCaseCard():HTMLElement {
    const card=document.createElement('div');card.className='powerup-card powerup-hot-case';
    card.innerHTML=`<div class="powerup-art">${HOT_CASE_ART}</div><div class="powerup-copy"><small>YOU’RE CARRYING THE</small><strong>HOT<br>CASE</strong><div class="powerup-healed">2× DAMAGE<br>A KILL HEALS YOU FULL</div></div><div class="powerup-stamp">EVIDENCE</div>`;
    card.setAttribute('role','status');card.setAttribute('aria-label','Hot case · 2× damage · a kill heals you full');
    return card;
}

import type {PickupKind} from '../shared/pickups';

/** Hand-inked silhouettes shared by the active-effect cards. No external assets. */
export function pickupArtwork(kind:PickupKind):string {
    const ink='stroke="#15101b" stroke-width="5" stroke-linejoin="round"';
    const body=kind==='quick-fix'
        ? `<path d="m18 29 64-5 5 60-66 6Z" fill="#eff5df" ${ink}/><path d="m36 27-1-13 28-2 2 14" fill="none" ${ink}/><path d="m42 38 17-1 1 14 14-1 1 17-15 1 1 14-17 1-1-14-14 1-1-17 15-1Z" fill="#65cf8b" ${ink}/><path d="m14 9 2-9 3 9 9 3-9 3-3 9-2-9-9-3ZM84 7l2 8 8 2-8 3-2 8-2-8-8-3 8-2Z" fill="#b7f4bb"/>`
        : kind==='ironclad'
        ? `<path d="M30 20 43 14 57 14 70 20 84 57 68 63 65 47 70 88 30 88 35 47 32 63 16 57Z" fill="#bacbdb" ${ink}/><path d="m43 16 7 25-17-7 7 23 10-10 10 10 7-23-17 7 7-25" fill="#edf5ed" ${ink}/><path d="M32 69h36M50 48v37" ${ink}/><path d="m76 9 2-8 3 8 9 3-9 3-3 8-2-8-9-3Z" fill="#fff6d8"/>`
        : `<path d="m41 15 28 5-7 35 20 13 5 15-8 8H28l-7-14 6-21Z" fill="#fa5037" ${ink}/><path d="m29 58 22 9m-25-1 21 9M26 83h54" fill="none" stroke="#fff0cf" stroke-width="5"/><path d="M39 26 8 31l14 10L3 46l30 9" fill="#ffc763" ${ink}/><path d="m78 15-5 15 18-4-15 23 5-17-15 4Z" fill="#ffce63"/>`;
    return `<svg viewBox="0 0 100 100" aria-hidden="true">${body}</svg>`;
}

export function powerupCard(kind:PickupKind):HTMLElement {
    const card=document.createElement('div');card.className=`powerup-card powerup-${kind}`;
    const healing=kind==='quick-fix';
    const title=healing?'QUICK<br>FIX':kind==='ironclad'?'IRONCLAD<br>ALIBI':'HOT<br>PURSUIT';
    card.innerHTML=`<div class="powerup-art">${pickupArtwork(kind)}</div><div class="powerup-copy"><small>${healing?'FIT FOR DUTY!':kind==='ironclad'?'NOTHING STICKS!':'MOVE IT, DETECTIVE!'}</small><strong>${title}</strong>${healing?'<div class="powerup-healed">HEALTH RESTORED</div>':'<div class="powerup-gauge"><i></i></div>'}</div><div class="powerup-clock"><b>${healing?'+':''}</b><small>${healing?'FULL HP':'SEC'}</small></div>`;
    card.setAttribute('aria-label',healing?'Quick Fix · health restored':kind==='ironclad'?'Ironclad Alibi':'Hot Pursuit');
    return card;
}

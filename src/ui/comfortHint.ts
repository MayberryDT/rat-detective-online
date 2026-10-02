import type {PlayerSettings} from './PlayerSettings';

export const COMFORT_HINT_KEY='rat-comfort-hint-v1';
type HintStorage=Pick<Storage,'getItem'|'setItem'>;
function deviceStorage():HintStorage|undefined {try{return typeof window==='undefined'?undefined:window.localStorage;}catch{return undefined;}}

/** Clarity batch (protocol 29): on a browser's first launch, a small paper note under the title's Settings tag points to
 * Camera shake and Reduced interface motion. Shown once per browser; SHOW ME opens Settings on Screen effects, × puts it away. */
export function showComfortHint(title:HTMLElement|null,settings:PlayerSettings|undefined,storage:HintStorage|undefined=deviceStorage()):HTMLElement|undefined {
    if(!title||!settings||title.querySelector('.comfort-hint'))return;
    try{if(storage?.getItem(COMFORT_HINT_KEY))return;storage?.setItem(COMFORT_HINT_KEY,'1');}catch{/* Device storage is optional. */}
    const doc=title.ownerDocument,note=doc.createElement('aside');
    note.className='comfort-hint';note.setAttribute('role','note');
    const text=doc.createElement('p');
    text.innerHTML='Too shaky? In <b>Settings</b>: <b>Camera shake</b> under Screen effects, or <b>Reduced interface motion</b> under Readability.';
    const show=doc.createElement('button'),close=doc.createElement('button');
    show.type=close.type='button';show.className='comfort-show';show.textContent='SHOW ME';
    close.className='comfort-close';close.textContent='×';close.setAttribute('aria-label','Dismiss the comfort hint');
    show.addEventListener('click',event=>{event.stopPropagation();note.remove();settings.open('SCREEN EFFECTS');});
    close.addEventListener('click',event=>{event.stopPropagation();note.remove();});
    note.appendChild(text);note.appendChild(show);note.appendChild(close);title.appendChild(note);
    return note;
}

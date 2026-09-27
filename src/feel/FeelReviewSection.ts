import {FEEL,type FeelItem} from './feelTuning';
import {feelState,type FeelState} from './feelState';

/** `?feel=dev` only: per-item switches and live values inside Settings, so a
 * reviewer can compare and dial effects without leaving the match. */
export function mountFeelReview(parent:HTMLElement,doc:Document,signal:AbortSignal,state:FeelState=feelState()):void {
    if(state.mode!=='dev')return;
    const field=doc.createElement('fieldset');field.className='feel-review';parent.appendChild(field);
    const legend=doc.createElement('legend');legend.textContent='FEEL REVIEW';field.appendChild(legend);
    const note=doc.createElement('p');
    note.textContent='Review build. Switch items off to compare; changed values save on this browser. Copy values to send them back.';
    field.appendChild(note);
    const refreshers:Array<()=>void>=[];
    for(const item of Object.keys(FEEL) as FeelItem[]){
        const spec=FEEL[item],group=doc.createElement('details');group.className='feel-review-item';field.appendChild(group);
        const summary=doc.createElement('summary');group.appendChild(summary);
        if(spec.toggle){
            const box=doc.createElement('input');box.type='checkbox';box.setAttribute('aria-label',`${spec.label} on`);
            box.addEventListener('click',event=>event.stopPropagation(),{signal});
            box.addEventListener('change',()=>state.set(item,box.checked),{signal});
            refreshers.push(()=>{box.checked=state.on(item);});
            summary.appendChild(box);
        }
        summary.append(spec.label);
        for(const param of Object.keys(spec.params)){
            const row=doc.createElement('label');row.className='feel-review-param';group.appendChild(row);
            row.append(param);
            const input=doc.createElement('input');input.type='number';input.step='any';row.appendChild(input);
            input.addEventListener('change',()=>{if(Number.isFinite(input.valueAsNumber))state.tune(item,param,input.valueAsNumber);},{signal});
            refreshers.push(()=>{input.value=String((FEEL[item].params as Record<string,number>)[param]);});
        }
    }
    const actions=doc.createElement('div');actions.className='feel-review-actions';field.appendChild(actions);
    const status=doc.createElement('span');
    const action=(label:string,run:()=>void)=>{
        const button=doc.createElement('button');button.type='button';button.textContent=label;
        button.addEventListener('click',run,{signal});actions.appendChild(button);
    };
    action('Copy values',()=>{
        void navigator.clipboard?.writeText(state.exportReview()).then(()=>{status.textContent='Copied.';},()=>{status.textContent='Copy failed.';});
    });
    action('Reset feel review',()=>{state.resetReview();for(const refresh of refreshers)refresh();status.textContent='Defaults restored.';});
    actions.appendChild(status);
    for(const refresh of refreshers)refresh();
}

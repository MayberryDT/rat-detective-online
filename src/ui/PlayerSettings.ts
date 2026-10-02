import { ACTIONS, GRAPHICS_MODES, RANGES, bindingLabel, playerPreferences, type Action, type GraphicsMode, type NumericPreference, type PreferenceStore } from '../settings/PlayerPreferences';
import { onQualityChange, qualityStatus, type QualityStatus } from '../session/graphicsQuality';
import { mountFeelReview } from '../feel/FeelReviewSection';
import { mountAdminKeyField } from './adminKey';
import './playerSettings.css';
import type { FeedbackCue } from '../audio/FeedbackAudio';
import { ghost, replay, uiMotion } from './motion';

type Session={observing?:()=>boolean;playing:()=>boolean;touch:()=>boolean;clear:()=>void;resume:()=>void;cue?:(cue:FeedbackCue)=>void};
/** One device settings surface, shared by the lightweight title and the match.
 * U3: a case folder with a tab per section; it opens, slides between pages and puts itself away. */
export class PlayerSettings {
    readonly root:HTMLDialogElement;
    private readonly events=new AbortController();
    private readonly content:HTMLElement;
    private readonly tabs:HTMLElement;
    private readonly pages:{page:HTMLElement;tab:HTMLButtonElement}[]=[];
    private readonly heading:HTMLElement;
    private readonly note:HTMLElement;
    private readonly status:HTMLElement;
    private readonly back:HTMLButtonElement;
    private session?:Session;
    private page:'pause'|'settings'='settings';
    private capture?:{action:Action;slot:0|1;button:HTMLButtonElement};
    private opener?:HTMLElement;
    private freshDown=true;
    private unlockedAt=-Infinity;
    private readonly unsubscribe:()=>void;
    private stopQuality?:()=>void;
    private readonly refreshers:Array<()=>void>=[];
    constructor(private readonly store:PreferenceStore=playerPreferences(),private readonly doc:Document=document){
        this.root=doc.createElement('dialog');this.root.className='player-settings';this.root.setAttribute('aria-labelledby','settings-heading');
        this.heading=this.make('h2',this.root,'PLAYER SETTINGS');this.heading.id='settings-heading';
        this.note=this.make('p',this.root,'Saved on this browser. Changes apply immediately.');
        this.tabs=this.make('div',this.root);this.tabs.className='settings-tabs';this.tabs.setAttribute('role','tablist');
        this.content=this.make('div',this.root);this.content.className='settings-content';
        this.status=this.make('p',this.root);this.status.className='settings-status';this.status.setAttribute('role','status');
        const footer=this.make('div',this.root);footer.className='settings-footer';
        this.button(footer,'Reset all',()=>{this.capture=undefined;this.store.reset();this.status.textContent='Defaults restored.';});
        this.back=this.button(footer,'Back',()=>this.leaveSettings());
        this.back.className='settings-back';
        this.button(footer,'Settings',()=>this.open()).className='pause-settings';
        this.doc.body.appendChild(this.root);
        this.build();
        Array.from(this.content.children).forEach((node,index)=>{
            const page=node as HTMLElement,tab=this.button(this.tabs,node.children[0]?.textContent??'',()=>this.tab(index));
            page.id=`settings-page-${index}`;page.setAttribute('role','tabpanel');
            tab.className='settings-tab';tab.setAttribute('role','tab');tab.setAttribute('aria-controls',page.id);
            this.pages.push({page,tab});
        });
        this.tab(0,false);
        this.unsubscribe=store.subscribe(p=>{
            doc.documentElement.style.setProperty('--player-ui-scale',String(p.uiScale));
            doc.body.classList.toggle('reduced-motion',p.reducedMotion);
            this.refreshHints();
            for(const refresh of this.refreshers)refresh();
            this.session?.clear();this.updateNote();
        });
        const options={signal:this.events.signal};
        doc.getElementById('title-settings-btn')?.addEventListener('click',()=>this.open(),options);
        this.root.addEventListener('cancel',event=>{event.preventDefault();this.capture=undefined;if(this.page==='settings'||!this.session?.playing())this.leaveSettings();},options);
        this.root.addEventListener('keydown',event=>{
            // Stop title Enter, gameplay bindings and held-scoreboard listeners.
            event.stopPropagation();
            if(!event.repeat)this.freshDown=true;
            const current=this.pages.findIndex(p=>p.tab===event.target);
            if(!this.capture&&current>=0&&(event.code==='ArrowRight'||event.code==='ArrowLeft')){
                event.preventDefault();const next=(current+(event.code==='ArrowRight'?1:this.pages.length-1))%this.pages.length;
                this.tab(next);this.pages[next]!.tab.focus();return;
            }
            if(!this.capture)return;
            event.preventDefault();
            if(event.repeat)return;
            if(event.code==='Escape'){this.capture=undefined;this.refresh();return;}
            if(event.altKey||event.ctrlKey||event.metaKey){this.status.textContent='Use a single key without a browser shortcut.';return;}
            const {action,slot}=this.capture;
            const error=this.store.bind(action,slot,event.code==='Delete'?'':event.code);
            this.status.textContent=error??'Binding saved.';
            if(!error){this.capture=undefined;this.refresh();}
        },options);
        doc.addEventListener('pointerlockchange',()=>{
            if(!doc.pointerLockElement&&this.session?.playing()&&!this.session.touch()){
                this.unlockedAt=performance.now();this.freshDown=false;
                if(!this.isOpen)this.pause();
            }
        },options);
        // Preserve the fresh-gesture rule after Escape; the shot's leftover
        // click cannot activate the newly exposed menu or Resume.
        for(const type of ['pointerdown','pointerup','mousedown','mouseup','click'] as const)doc.addEventListener(type,event=>{
            if(!this.isOpen||this.freshDown)return;
            if(type==='pointerdown'&&performance.now()-this.unlockedAt>=60){this.freshDown=true;return;}
            event.preventDefault();event.stopImmediatePropagation();
        },{...options,capture:true});
        doc.addEventListener('keydown',event=>{
            if(this.isOpen&&!event.repeat)this.freshDown=true;
            if(event.code==='Escape'&&!this.isOpen&&this.session?.playing()&&this.session.touch())this.pause();
        },options);
    }
    get isOpen():boolean{return this.root.open;}
    contains(target:EventTarget|null):boolean{return target instanceof Node&&this.root.contains(target);}
    attach(session:Session):void {this.session=session;}
    private make<K extends keyof HTMLElementTagNameMap>(tag:K,parent:HTMLElement,text=''):HTMLElementTagNameMap[K]{
        const node=this.doc.createElement(tag);node.textContent=text;parent.appendChild(node);return node;
    }
    private button(parent:HTMLElement,label:string,run:()=>void):HTMLButtonElement {
        const button=this.make('button',parent,label);button.type='button';button.addEventListener('click',run,{signal:this.events.signal});return button;
    }
    private build():void {
        const section=(title:string)=>{const field=this.make('fieldset',this.content);this.make('legend',field,title);return field;};
        const look=section('LOOK & AIM');
        this.range(look,'Mouse sensitivity','mouseSensitivity','×');this.range(look,'Touch sensitivity','touchSensitivity','×');
        this.toggle(look,'Invert mouse vertical look','invertMouseY');this.toggle(look,'Invert touch vertical look','invertTouchY');
        const audio=section('SOUND');this.range(audio,'Master volume','masterVolume','%',100);this.range(audio,'Effects volume','effectsVolume','%',100);
        const display=section('READABILITY');this.range(display,'UI scale','uiScale','%',100);this.toggle(display,'Reduced interface motion','reducedMotion');
        const effects=section('SCREEN EFFECTS');this.range(effects,'Camera shake','cameraShake','%',100);this.range(effects,'Flash strength','flashStrength','%',100);
        this.graphics(section('GRAPHICS'));
        mountFeelReview(this.content,this.doc,this.events.signal);
        const keys=section('KEY BINDINGS');this.make('p',keys,'Choose a binding, then press a key. Delete clears an alternate; Escape cancels. Left mouse always remains available for Fire.');
        for(const action of Object.keys(ACTIONS) as Action[]){
            const row=this.make('div',keys);row.className='settings-binding';this.make('span',row,ACTIONS[action]);
            for(const slot of [0,1] as const){
                const button=this.button(row,'',()=>{this.capture={action,slot,button};this.status.textContent='Press a key…';button.textContent='Press a key…';});
                // Fire's primary mouse control remains discoverable; its alternate is remappable.
                if(action==='fire'&&slot===0)button.disabled=true;
                this.refreshers.push(()=>{button.textContent=bindingLabel(this.store.current.bindings[action][slot]);button.setAttribute('aria-label',`${ACTIONS[action]}, ${slot?'alternate':'primary'}: ${button.textContent}`);});
            }
        }
        mountAdminKeyField(this.content,this.doc,this.events.signal);
    }
    /** Auto, High, Medium, Low as a row of stamps, and what Auto is drawing right now. */
    private graphics(parent:HTMLElement):void {
        this.make('p',parent,'Auto keeps the game near 60 frames a second: when it falls behind it lowers the resolution, then thins rain and effects, and it raises them again when there is room. High always draws everything.');
        const row=this.make('div',parent);row.className='settings-choice';row.setAttribute('role','radiogroup');row.setAttribute('aria-label','Graphics quality');
        for(const mode of Object.keys(GRAPHICS_MODES) as GraphicsMode[]){
            const button=this.button(row,GRAPHICS_MODES[mode],()=>this.store.update({graphics:mode}));button.setAttribute('role','radio');
            this.refreshers.push(()=>button.setAttribute('aria-checked',String(this.store.current.graphics===mode)));
        }
        const now=this.make('p',parent);now.className='settings-graphics-now';
        const show=(q:Readonly<QualityStatus>)=>{
            const w=globalThis.innerWidth||0,h=globalThis.innerHeight||0,effects=q.tier==='high'?'all effects':q.tier==='medium'?'lighter rain':'no film grain or haze';
            now.textContent=`Now drawing ${Math.round(w*q.scale)} × ${Math.round(h*q.scale)}, ${effects}.`;
        };
        show(qualityStatus());this.stopQuality=onQualityChange(show);
    }
    private range(parent:HTMLElement,label:string,key:NumericPreference,unit:string,factor=1):void {
        const row=this.make('div',parent);row.className='settings-range';const id=`setting-${key}`;
        const title=this.make('label',row,label);title.htmlFor=id;
        const [min,max,step]=RANGES[key],slider=this.make('input',row),stepper=this.make('span',row);stepper.className='settings-step';
        const less=this.button(stepper,'−',()=>nudge(-1)),number=this.make('input',stepper),more=this.button(stepper,'+',()=>nudge(1));
        slider.type='range';slider.id=id;number.type='number';number.setAttribute('aria-label',`${label} value`);
        for(const input of [slider,number]){input.min=String(min*factor);input.max=String(max*factor);input.step=String(step*factor);}
        // The stamped −/+ step like the native spinners (snap to the step grid, clamp) and fire the same events as typing.
        for(const [button,name] of [[less,'Lower'],[more,'Raise']] as const){button.tabIndex=-1;button.setAttribute('aria-label',`${name} ${label.toLowerCase()}`);}
        const nudge=(dir:1|-1)=>{
            const lo=min*factor,size=step*factor,steps=((Number.isFinite(number.valueAsNumber)?number.valueAsNumber:this.store.current[key]*factor)-lo)/size;
            const next=lo+(dir>0?Math.floor(steps+1e-6)+1:Math.ceil(steps-1e-6)-1)*size;
            number.value=String(Math.round(Math.min(max*factor,Math.max(lo,next))*100)/100);
            for(const type of ['input','change'])number.dispatchEvent(new Event(type,{bubbles:true}));
        };
        this.make('span',row,unit);
        const apply=(input:HTMLInputElement)=>{
            if(input.value.trim()===''||!Number.isFinite(input.valueAsNumber))return;
            this.store.update({[key]:input.valueAsNumber/factor});
        };
        slider.addEventListener('input',()=>apply(slider),{signal:this.events.signal});
        number.addEventListener('input',()=>{if(number.valueAsNumber>=min*factor&&number.valueAsNumber<=max*factor)apply(number);},{signal:this.events.signal});
        number.addEventListener('change',()=>{apply(number);number.value=String(Math.round(this.store.current[key]*factor*100)/100);},{signal:this.events.signal});
        this.button(row,'Reset',()=>this.store.update({[key]:key==='touchSensitivity'?1.5:1})).setAttribute('aria-label',`Reset ${label.toLowerCase()}`);
        this.refreshers.push(()=>{
            const value=String(Math.round(this.store.current[key]*factor*100)/100);slider.value=value;if(this.doc.activeElement!==number)number.value=value;
            slider.style.setProperty('--fill',String((this.store.current[key]-min)/(max-min)));
        });
    }
    private toggle(parent:HTMLElement,text:string,key:'invertMouseY'|'invertTouchY'|'reducedMotion'):void {
        const label=this.make('label',parent);label.className='settings-toggle';const box=this.make('input',label);box.type='checkbox';this.make('span',label,text);
        box.addEventListener('change',()=>this.store.update({[key]:box.checked}),{signal:this.events.signal});this.refreshers.push(()=>{box.checked=this.store.current[key];});
    }
    private refresh():void {for(const refresh of this.refreshers)refresh();}
    /** Show one section of the folder; the page slides in like a fresh sheet. */
    private tab(index:number,animate=true):void {
        this.pages.forEach(({page,tab},i)=>{
            page.hidden=i!==index;tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;
            if(i===index)tab.classList.add('active');else tab.classList.remove('active');
        });
        this.content.scrollTop=0;
        if(!animate)return;
        this.session?.cue?.('tick');
        if(uiMotion('caseFolder'))replay(this.pages[index]!.page,'paper-in');
    }
    refreshHints():void {
        const p=this.store.current,hint=this.doc.getElementById('hud');
        if(hint)hint.textContent=`${this.session?.observing?.()?'OBSERVING · ':''}${(['forward','back','left','right'] as Action[]).map(a=>bindingLabel(p.bindings[a][0])).join('/')} — Move | Mouse — Look | ${bindingLabel(p.bindings.jump[0])} — Jump | ${this.session?.observing?.()?'':p.bindings.fire.filter(Boolean).map(bindingLabel).join('/')+' — Shoot | '}Hold ${p.bindings.scores.filter(Boolean).map(bindingLabel).join('/')} — Scoreboard | Esc — Settings`;
    }
    private updateNote():void {
        const warning=this.session?.playing()?(this.session.observing?.()?'You are observing. The match continues without you. ':'The online match continues. Your rat is still vulnerable. '):'';
        if(this.page==='pause'){this.note.textContent=warning.trim();return;}
        this.note.textContent=warning+(this.store.storageAvailable?'Saved on this browser. Changes apply immediately.':'Changes apply for this visit. Browser storage is unavailable.');
    }
    private show():void {
        this.updateNote();
        this.session?.clear();
        if(!this.isOpen){this.opener=this.doc.activeElement as HTMLElement;this.root.showModal();this.session?.cue?.('menu-open');if(uiMotion('caseFolder'))replay(this.root,'folder-open');}
        else if(uiMotion('caseFolder'))replay(this.root,'paper-in');
        this.doc.body.classList.add('settings-open');
        if(this.doc.pointerLockElement)this.doc.exitPointerLock();
        this.status.textContent='';this.back.focus({preventScroll:true});this.root.scrollTop=0;
    }
    /** Open Settings, on the page titled `section` (its legend, e.g. 'SCREEN EFFECTS') when given. */
    open(section?:string):void {
        this.page='settings';this.content.hidden=false;this.root.dataset.page='settings';
        this.heading.textContent='PLAYER SETTINGS';this.note.textContent=this.session?.playing()?'The online match continues. Your rat is still vulnerable. Changes save on this browser.':'Saved on this browser. Changes apply immediately.';
        const index=section?this.pages.findIndex(p=>p.tab.textContent===section):-1;
        if(index>=0)this.tab(index,false);
        this.back.textContent='Back';this.refresh();this.show();
    }
    pause():void {
        this.page='pause';this.capture=undefined;this.content.hidden=true;this.root.dataset.page='pause';
        this.heading.textContent='OFF THE RECORD';this.note.textContent='The online match continues. Your rat is still vulnerable.';
        this.back.textContent=this.session?.observing?.()?'Resume observing':'Resume';
        this.show();
    }
    private leaveSettings():void {
        if(this.session?.playing()){
            if(this.page==='settings'){this.pause();return;}
            this.session.clear();this.close();this.session.resume();
        }else this.close();
    }
    private close():void {this.capture=undefined;if(this.isOpen){ghost(this.doc,this.root,'caseFolder');this.session?.cue?.('menu-close');}this.root.close();this.doc.body.classList.remove('settings-open');this.opener?.focus();}
    dispose():void {this.unsubscribe();this.stopQuality?.();this.events.abort();this.root.remove();this.doc.body.classList.remove('settings-open');}
}

import { playerPreferences, type Action } from '../settings/PlayerPreferences';
const canonical:Partial<Record<Action,string>>={forward:'KeyW',back:'KeyS',left:'KeyA',right:'KeyD',jump:'Space'};
/** Physical releases retain their original action even if a binding changes. */
export class InputState {
    readonly keys: Record<string, boolean> = {};
    private readonly held=new Map<string,string>();
    private readonly controller = new AbortController();
    constructor(target: Window = window, doc: Document = document, enabled:()=>boolean=()=>true) {
        const options = { signal: this.controller.signal };
        target.addEventListener('keydown', event => {
            const element=event.target as HTMLElement|null;
            if(!enabled()||event.altKey||event.ctrlKey||event.metaKey||element?.isContentEditable||['INPUT','TEXTAREA','SELECT','BUTTON'].includes(element?.tagName??''))return;
            for(const action of Object.keys(canonical) as Action[])if(playerPreferences().current.bindings[action].includes(event.code)){
                const key=canonical[action]!;this.held.set(event.code,key);this.keys[key]=true;event.preventDefault();
            }
        }, options);
        target.addEventListener('keyup', event => {
            const key=this.held.get(event.code);this.held.delete(event.code);
            if(key)this.keys[key]=[...this.held.values()].includes(key);
        }, options);
        target.addEventListener('blur', () => this.clear(), options);
        doc.addEventListener('visibilitychange', () => { if (doc.hidden) this.clear(); }, options);
        doc.addEventListener('pointerlockchange', () => { if (!doc.pointerLockElement) this.clear(); }, options);
    }
    clear(): void { this.held.clear();for (const key of Object.keys(this.keys)) delete this.keys[key]; }
    dispose(): void { this.controller.abort(); this.clear(); }
}

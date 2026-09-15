export const PREFERENCES_KEY='rat-player-settings-v1';
export const ACTIONS={forward:'Move forward',back:'Move back',left:'Move left',right:'Move right',jump:'Jump',fire:'Fire',scores:'Hold scoreboard'} as const;
export type Action=keyof typeof ACTIONS;
export type Bindings=Record<Action,[string,string]>;
export interface PlayerPreferences {
    version:1; mouseSensitivity:number; touchSensitivity:number; invertMouseY:boolean; invertTouchY:boolean;
    masterVolume:number; effectsVolume:number; uiScale:number; reducedMotion:boolean; bindings:Bindings;
}
export const DEFAULT_PREFERENCES:PlayerPreferences={version:1,mouseSensitivity:1,touchSensitivity:1.5,
    invertMouseY:false,invertTouchY:false,masterVolume:1,effectsVolume:1,uiScale:1,reducedMotion:false,
    bindings:{forward:['KeyW','ArrowUp'],back:['KeyS','ArrowDown'],left:['KeyA','ArrowLeft'],right:['KeyD','ArrowRight'],jump:['Space',''],fire:['Mouse0',''],scores:['Tab','']}};
export const RANGES={mouseSensitivity:[.1,3,.05],touchSensitivity:[.2,3,.05],masterVolume:[0,1,.01],effectsVolume:[0,1,.01],uiScale:[.8,1.3,.05]} as const;
export type NumericPreference=keyof typeof RANGES;
export function validBinding(action:Action,code:string):boolean {
    return code===''||code==='Mouse0'&&action==='fire'||code==='Tab'&&action==='scores'||
        /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|ShiftLeft|ShiftRight|Enter|Backspace|Comma|Period|Slash|Semicolon|Quote|BracketLeft|BracketRight|Backslash|Minus|Equal)$/.test(code);
}
export function validatePreferences(raw:unknown):PlayerPreferences {
    const result=structuredClone(DEFAULT_PREFERENCES);
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return result;
    const data=raw as Record<string,unknown>;if(data.version!==1)return result;
    for(const key of Object.keys(RANGES) as NumericPreference[]){
        const value=data[key],[min,max]=RANGES[key];
        if(typeof value==='number'&&Number.isFinite(value))result[key]=Math.max(min,Math.min(max,value));
    }
    for(const key of ['invertMouseY','invertTouchY','reducedMotion'] as const)if(typeof data[key]==='boolean')result[key]=data[key];
    // Bindings are atomic: malformed/conflicting maps must not disable an action.
    const bindings=data.bindings as Bindings|undefined,seen=new Set<string>();
    if(bindings&&Object.keys(ACTIONS).every(name=>{
        const action=name as Action,pair=bindings[action];
        return Array.isArray(pair)&&pair.length===2&&pair.some(Boolean)&&pair.every(code=>{
            if(typeof code!=='string'||!validBinding(action,code)||code!==''&&seen.has(code))return false;
            if(code)seen.add(code);return true;
        });
    })&&bindings.fire[0]==='Mouse0')for(const action of Object.keys(ACTIONS) as Action[])result.bindings[action]=[...bindings[action]];
    return result;
}
export class PreferenceStore {
    private value:PlayerPreferences;
    storageAvailable=false;
    private readonly listeners=new Set<(value:PlayerPreferences)=>void>();
    constructor(private readonly storage?:Pick<Storage,'getItem'|'setItem'>){
        this.value=structuredClone(DEFAULT_PREFERENCES);
        try{
            const saved=storage?.getItem(PREFERENCES_KEY);this.storageAvailable=!!storage;
            if(saved)this.value=validatePreferences(JSON.parse(saved));
            else {
                const legacy=Number(storage?.getItem('rat-touch-sensitivity'));
                if(legacy>=.4&&legacy<=2)this.value.touchSensitivity=legacy;
            }
        }catch{/* Device storage is optional. */}
    }
    get current():Readonly<PlayerPreferences>{return this.value;}
    update(patch:Partial<Omit<PlayerPreferences,'version'>>):void {
        this.value=validatePreferences({...this.value,...patch});
        try{this.storage?.setItem(PREFERENCES_KEY,JSON.stringify(this.value));this.storageAvailable=!!this.storage;}catch{this.storageAvailable=false;}
        for(const listener of this.listeners)listener(this.value);
    }
    reset():void {this.update(structuredClone(DEFAULT_PREFERENCES));}
    bind(action:Action,slot:0|1,code:string):string|undefined {
        if(action==='fire'&&slot===0&&code!=='Mouse0')return 'Left mouse remains the primary fire control.';
        if(!validBinding(action,code))return 'That key is reserved or unsupported.';
        const bindings=structuredClone(this.value.bindings);
        if(code)for(const name of Object.keys(ACTIONS) as Action[])for(const index of [0,1] as const){
            if(bindings[name][index]===code&&(name!==action||index!==slot))return `Already assigned to ${ACTIONS[name].toLowerCase()}.`;
        }
        bindings[action][slot]=code;
        if(!bindings[action].some(Boolean))return 'Keep at least one binding for this action.';
        this.update({bindings});return;
    }
    subscribe(listener:(value:PlayerPreferences)=>void):()=>void {this.listeners.add(listener);listener(this.value);return()=>this.listeners.delete(listener);}
}
let store:PreferenceStore|undefined;
export function playerPreferences():PreferenceStore {
    if(!store){let storage:Storage|undefined;try{storage=typeof window==='undefined'?undefined:window.localStorage;}catch{}store=new PreferenceStore(storage);}
    return store;
}
export function actionBound(action:Action,code:string):boolean {return playerPreferences().current.bindings[action].includes(code);}
export function lookDelta(dx:number,dy:number,device:'mouse'|'touch',prefs=playerPreferences().current):[number,number]{
    const scale=device==='mouse'?prefs.mouseSensitivity:prefs.touchSensitivity;
    const invert=device==='mouse'?prefs.invertMouseY:prefs.invertTouchY;
    return [dx*scale,dy*scale*(invert?-1:1)];
}
export function bindingLabel(code:string):string {return code==='Mouse0'?'Left mouse':code.replace(/^Key|^Digit/,'')||'Unassigned';}

import type {CaseState} from '../shared/chaosState';
import {sincePing} from '../shared/caseHeartbeat';
import {CarrierHeartbeat} from '../audio/CarrierHeartbeat';
import {reducedMotion} from '../ui/motion';
import type {FeelState} from './feelState';
import type {ScreenFeel} from './ScreenFeel';
import {FEEL} from './feelTuning';
/** The carrier's ping pulse: up over `rise` ms, then gone with a `decay` ms time constant (cut under `floor`), so it
 * says "you were just seen" at the ping and is over within half a second. */
const PULSE={rise:60,decay:130,floor:.03} as const;

/** K3: what the local carrier of the hot case feels and hears, all on the case's ping clock (`HEARTBEAT`): the red
 * screen-edge pulse at each ping, the heartbeat only you hear, and a kill's heartbeat surge and CASE CLOSED · HEALED
 * stamp. Everything stops the frame you stop carrying. */
export class CarrierFeel {
    private heart?:CarrierHeartbeat;
    private carrying=false;
    constructor(private readonly state:FeelState,private readonly screen:ScreenFeel){}
    attach(context:BaseAudioContext):void {this.heart?.dispose();this.heart=new CarrierHeartbeat(context);}
    /** Whether you are carrying a buffed case this frame. */
    get active():boolean {return this.carrying;}

    /** Each frame: `mine` is the buffed case you carry (null otherwise, dead included), `now` the ChaosView's server time
     * and `urgency` how near the case is to scoring (0…1, quickening the beat). */
    update(mine:CaseState|null,now:number,urgency:number):void {
        if(!mine||!this.state.on('hotCase')){if(this.carrying)this.stop();return;}
        this.carrying=true;
        const p=FEEL.hotCase.params;
        const t=sincePing(mine,now),pulse=t<PULSE.rise?t/PULSE.rise:Math.exp(-(t-PULSE.rise)/PULSE.decay);
        this.screen.casePing((pulse<PULSE.floor?0:pulse)*p.edge*(reducedMotion()?p.still:1));
        this.heart?.update(mine,now,urgency,p.beat,p.accent,p.slow,p.fast);
    }
    /** A kill while carrying healed you: the heartbeat surges and the stamp slams on. The red flare up your rat is the
     * heal's own (`RatEntity.heal`). */
    healed():void {
        if(!this.state.on('hotCase'))return;
        const p=FEEL.hotCase.params;
        this.heart?.surge(p.surge,p.surgeGap,p.beat*p.accent);
        this.screen.caseClosed();
    }
    stop():void {this.carrying=false;this.screen.casePing(0);this.heart?.stop();}
    dispose():void {this.stop();this.heart?.dispose();this.heart=undefined;}
}

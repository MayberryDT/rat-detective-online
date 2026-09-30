import type {RatControls} from './ratBody';

/** A rat's controls as telemetry (docs/city-map.md, the `window` row), the same for a player's keys, mouse and touch
 * and for a bot's motor. `f`, `r`: the move axes (`RatControls.moveForward` / `moveRight`, to 0.01) at the latest
 * step. `j`: jump presses (the jump control going from released to held). `fx`, `rx`: key changes on the
 * forward/back and left/right axes, so a tap shorter than a send or a recorder slot still counts. Counts run since
 * the last `clear`. For recording only: authority never reads it. */
export interface ControlsInput {f:number;r:number;j:number;fx:number;rx:number}

/** A push this short is no key; otherwise each axis reads as the nearest of the eight key directions, whatever the
 * push's length, so a stick's or a bot's analogue push counts as the keys a player would hold for it. */
const PUSH=.05,KEY=Math.sin(Math.PI/8);
/** The key held on the `along` axis (1, -1, or 0 for none) for a push of `along` and `across`. */
export function axisKey(along:number,across:number):number {
    const length=Math.hypot(along,across);
    return length<PUSH?0:along>KEY*length?1:along< -KEY*length?-1:0;
}

/** Counts a rat's controls between sends (a player's client) or recorder slots (the room). */
export class ControlTally implements ControlsInput {
    f=0;r=0;j=0;fx=0;rx=0;
    private forwardKey=0;private rightKey=0;private jumpHeld=false;
    /** One step's controls. */
    note(c:RatControls):void {
        const forward=axisKey(c.moveForward,c.moveRight),right=axisKey(c.moveRight,c.moveForward);
        if(forward!==this.forwardKey){this.fx++;this.forwardKey=forward;}
        if(right!==this.rightKey){this.rx++;this.rightKey=right;}
        if(c.jump&&!this.jumpHeld)this.j++;
        this.jumpHeld=c.jump;this.f=Math.round(c.moveForward*100)/100;this.r=Math.round(c.moveRight*100)/100;
    }
    /** Controls tallied elsewhere (a player's send). */
    add(input:ControlsInput):void {this.f=input.f;this.r=input.r;this.j+=input.j;this.fx+=input.fx;this.rx+=input.rx;}
    /** Presses or key changes not yet sent or sampled. */
    get pending():boolean {return this.j+this.fx+this.rx>0;}
    /** Starts new counts; the axes and the keys held stay. */
    clear():void {this.j=0;this.fx=0;this.rx=0;}
}

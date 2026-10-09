import * as C from 'cannon-es';
import type {Vec3Data} from '../networkProtocol';
import type {WeaponKind} from '../pickups';
import {LAUNCH_DRIFT_DECAY} from '../launcherVelocity';
import {guardFastFall,touchingSlick} from '../ratSurfaces';

/** How every rat moves, human or bot (Tyler, 30 September: one body, the same controls). `run`: top speed on
 * the legs, units a second. `accel` / `decel`: per-60 Hz-frame blends toward the wanted velocity while a
 * direction is held, and toward a stop when none is. A jump sets vertical speed to `jumpImpulse` and scales
 * gravity by `jumpGravityScale` until landing: a quicker arc with the old apex. `groundGrace`: seconds a rat
 * can still jump after its feet leave the ground. `turn`: per-frame blend of the body's facing toward the look. */
export const RAT_MOVEMENT={run:18,accel:.28,decel:.12,jumpGravityScale:1.28,jumpImpulse:16*Math.sqrt(1.28),groundGrace:.08,turn:.35} as const;
/** The rat's physical body: mass, damping (a respawn lowers it; a launcher flight raises it until landing) and
 * the foot, chest and head spheres, centred this high above the feet. */
export const RAT_BODY={mass:5,linearDamping:.1,angularDamping:1,respawnDamping:.01,flightDamping:.1,
    spheres:[{radius:.6,y:.6},{radius:.45,y:1.3},{radius:.28,y:1.9}]} as const;
/** In a Blackout every rat's flashlight beam reaches this far (units), and a rat sees other rats only this near,
 * human or bot. */
export const FLASHLIGHT_REACH=60;
/** Every rat's everyday flashlight (a three.js SpotLight's settings, `distance` its reach and shadow depth); a
 * Blackout narrows it and stretches it to `FLASHLIGHT_REACH` (`FEEL.blackout`). */
export const FLASHLIGHT={color:0xfffebb,intensity:2,distance:40,angle:.6,penumbra:.5,decay:1.2} as const;

/** One step's controls, the same for a player's keys, mouse and touch and for a bot's motor.
 * `moveForward` / `moveRight`: -1..1 along and across the look, as the keys or stick produce (longer than 1 is
 * scaled down). `lookYaw`: radians about +y, 0 looking along -z (the camera's yaw; the body faces
 * `lookYaw + π` in `atan2(x, z)` terms). `lookPitch`: radians above level. `jump`: the jump control is held this
 * step (a held jump fires again on landing, as the space bar does). `fire`: a shot this step, along `direction`
 * from the rat's muzzle; it goes through the room's shot handling and rate limit, never through the body. */
export interface RatControls {moveForward:number;moveRight:number;lookYaw:number;lookPitch:number;jump:boolean;fire?:{direction:Vec3Data}}
export const noControls=():RatControls=>({moveForward:0,moveRight:0,lookYaw:0,lookPitch:0,jump:false});

/** The body's heading (`atan2(x, z)`) for a look yaw; the same half turn also takes a heading to its look yaw. */
export const lookHeading=(yaw:number):number=>yaw+Math.PI;

/** Adds the rat's three spheres to `body`; returns them foot first, head last. */
export function addRatShapes(body:C.Body):C.Sphere[] {
    return RAT_BODY.spheres.map(({radius,y})=>{const shape=new C.Sphere(radius);body.addShape(shape,new C.Vec3(0,y,0));return shape;});
}

/** The rat model's raised firing arm (-.49, .91+.36, .09+.10) plus its muzzle anchor (0,.106,.28), turned by the
 * body's heading. Rendering recoil or walk animation never moves it. */
/** How much further forward a held weapon's barrel ends than the pistol's (the model's muzzle moves with it). */
export const MUZZLE_REACH:Readonly<Record<Exclude<WeaponKind,'mousetrap'>,number>>={'tommy-gun':.53,laser:.44,persuader:.4};
export const muzzleReach=(weapon?:WeaponKind):number=>weapon&&weapon!=='mousetrap'?MUZZLE_REACH[weapon]:0;
export function ratMuzzle(position:Vec3Data,heading:number,out:Vec3Data={x:0,y:0,z:0},reach=0):Vec3Data {
    const x=-.49,z=.47+reach,c=Math.cos(heading),s=Math.sin(heading);
    out.x=position.x+x*c+z*s;out.y=position.y+1.376;out.z=position.z-x*s+z*c;return out;
}

/** Eases the body's heading toward the look: the player's model turn, the same for every rat. */
export function turnFacing(heading:number,lookYaw:number,dt:number):number {
    let diff=lookYaw+Math.PI-heading;
    while(diff>Math.PI)diff-=Math.PI*2;
    while(diff<-Math.PI)diff+=Math.PI*2;
    return heading+diff*(1-Math.pow(1-RAT_MOVEMENT.turn,dt*60));
}

/** The look's forward and right on the ground, computed exactly as three.js's `applyAxisAngle` about +y does
 * (quaternion from half angles, then `applyQuaternion`), so a player's movement stays bit-for-bit what it was. */
function rotateY(vx:number,vy:number,vz:number,angle:number,out:{x:number;z:number}):void {
    const half=angle/2,s=Math.sin(half),qx=0*s,qy=1*s,qz=0*s,qw=Math.cos(half);
    const tx=2*(qy*vz-qz*vy),ty=2*(qz*vx-qx*vz),tz=2*(qx*vy-qy*vx);
    out.x=vx+qw*tx+qy*tz-qz*ty;out.z=vz+qw*tz+qx*ty-qy*tx;
}

/** A rat's physical movement on a cannon body: the one step every rat runs, human or bot, turning `RatControls`
 * into motion. Call `step` before the world steps and `settle` after it. Launcher throws and landing shoves
 * arrive through `launch` and `shove`. With `bounds`, a launcher flight is kept inside the city. */
export class RatBody {
    /** Seconds this rat may still jump since its feet last touched a floor. */
    groundGrace=0;
    /** The legs' speed (`legScale`): Hot Pursuit speeds them up, Code Violation's Cold Feet slows them, and Snapped Paw
     * and a Mousetrap's hold pin them (0); 1 otherwise. */
    speedScale=1;
    /** Code Violation's Rust Bucket and Snapped Paw, and a Mousetrap's hold (`jumpBlocked`): no jumping. */
    jumpBlocked=false;
    /** A launcher throw's sideways speed, kept (and slowly fading) under the rat's own steering until landing. */
    driftX=0;driftZ=0;
    /** A deliberate jump is in the air: its extra gravity applies until landing. */
    normalJump=false;
    private launcherFlight=false;
    private beforeLaunchDamping:number|undefined;
    /** Seconds of floaty apex left on this throw, and its lift (a share of gravity). */
    private hangLeft=0;
    private hangLift=0;
    private readonly forward={x:0,z:0};
    private readonly right={x:0,z:0};
    constructor(readonly body:C.Body,private readonly world:C.World,private readonly bounds?:{min:number;max:number}){}
    get grounded():boolean{return this.groundGrace>0;}

    /** Before the world step. `alive`: a living rat moves; a dead one only loses its flight state. True when
     * this step jumped. */
    step(dt:number,controls:RatControls,alive:boolean):boolean {
        this.groundGrace=Math.max(0,this.groundGrace-dt);
        if(!alive){this.normalJump=false;this.beforeLaunchDamping=undefined;this.driftX=this.driftZ=0;this.hangLeft=0;return false;}
        const jumped=this.move(dt,controls);
        guardFastFall(this.world,this.body,dt);
        return jumped;
    }

    /** After the world step: keep a launcher flight inside the city, and land on any floor under the feet.
     * `landing` defaults to `alive` (a player whose health reads zero before the death arrives still lands). */
    settle(alive:boolean,landing=alive):void {
        const body=this.body;
        if(!alive)this.launcherFlight=false;
        else if(this.launcherFlight&&this.bounds){
            // A gentle inward deflection precedes the hard body inset, which also catches collision kicks that
            // cross the boundary within a single physics step.
            const min=this.bounds.min+3,max=this.bounds.max-3;
            for(const axis of ['x','z'] as const){
                const position=body.position[axis],velocity=body.velocity[axis];
                if(position<min+5&&velocity<0)body.velocity[axis]=Math.max(8,-velocity*.45);
                else if(position>max-5&&velocity>0)body.velocity[axis]=-Math.max(8,velocity*.45);
                body.position[axis]=Math.max(min,Math.min(max,position));
                if(body.position[axis]!==position)body.aabbNeedsUpdate=true;
            }
        }
        if(!landing||body.velocity.y>1)return;
        for(const contact of this.world.contacts){
            const normalY=contact.bi===body?-contact.ni.y:contact.bj===body?contact.ni.y:0;
            // The grace permits forgiving edge jumps, never unlimited air jumps.
            if(normalY>.5){
                if(this.beforeLaunchDamping!==undefined){body.linearDamping=this.beforeLaunchDamping;this.beforeLaunchDamping=undefined;}
                this.groundGrace=RAT_MOVEMENT.groundGrace;this.launcherFlight=false;this.normalJump=false;this.driftX=this.driftZ=0;this.hangLeft=0;
                return;
            }
        }
    }

    /** A machine's throw: its velocity, flight damping until landing, and `hang` seconds of floaty apex lifted by
     * `hangLift` of gravity. */
    launch(velocity:Vec3Data,hang:number,hangLift:number):void {
        const body=this.body;
        this.beforeLaunchDamping??=body.linearDamping;
        body.linearDamping=RAT_BODY.flightDamping;
        body.velocity.set(velocity.x,velocity.y,velocity.z);
        body.wakeUp();this.groundGrace=0;this.normalJump=false;
        this.driftX=velocity.x;this.driftZ=velocity.z;
        this.hangLeft=hang;this.hangLift=hangLift;
        this.launcherFlight=!!this.bounds;
    }

    /** A nearby landing's shockwave: a knockback hop that carries until the rat lands. */
    shove(velocity:Vec3Data):void {
        const v=this.body.velocity;
        v.x+=velocity.x;v.z+=velocity.z;v.y=Math.max(v.y,velocity.y);
        this.driftX+=velocity.x;this.driftZ+=velocity.z;
        this.body.wakeUp();this.groundGrace=0;this.normalJump=false;
    }

    /** A new life or a teleport: no flight, no jump, no grace. */
    reset():void {this.beforeLaunchDamping=undefined;this.groundGrace=0;this.launcherFlight=false;this.normalJump=false;this.driftX=this.driftZ=0;this.hangLeft=0;}

    private move(dt:number,controls:RatControls):boolean {
        const body=this.body,world=this.world,forward=this.forward,right=this.right;
        rotateY(0,0,-1,controls.lookYaw,forward);rotateY(1,0,0,controls.lookYaw,right);
        let desiredX=forward.x*controls.moveForward+right.x*controls.moveRight;
        let desiredZ=forward.z*controls.moveForward+right.z*controls.moveRight;
        const len=Math.sqrt(desiredX*desiredX+desiredZ*desiredZ);
        if(len>0){
            desiredX=(desiredX/Math.max(1,len))*RAT_MOVEMENT.run;
            desiredZ=(desiredZ/Math.max(1,len))*RAT_MOVEMENT.run;
            desiredX*=this.speedScale;
            desiredZ*=this.speedScale;
        }
        const v=body.velocity;
        const acceleration=1-Math.pow(1-RAT_MOVEMENT.accel,dt*60);
        const braking=Math.pow(1-RAT_MOVEMENT.decel,dt*60);
        // Full steering throughout a launch, on top of the machine's fading drift.
        const drifting=this.driftX!==0||this.driftZ!==0;
        if(drifting){const fade=Math.exp(-LAUNCH_DRIFT_DECAY*dt);this.driftX*=fade;this.driftZ*=fade;}
        // A chute owns the ride: no legs, no brakes and no jump until the street.
        const riding=touchingSlick(world,body);
        if(riding)body.wakeUp();
        else if(len>0||drifting){
            body.wakeUp();
            v.x+=(desiredX+this.driftX-v.x)*acceleration;
            v.z+=(desiredZ+this.driftZ-v.z)*acceleration;
        }else{v.x*=braking;v.z*=braking;}
        let jumped=false;
        if(controls.jump&&!this.jumpBlocked&&this.groundGrace>0&&!riding){v.y=RAT_MOVEMENT.jumpImpulse;this.groundGrace=0;this.normalJump=true;jumped=true;}
        // Only deliberate jumps get the extra gravity. Falling off ledges, ragdolls and machine throws keep
        // their own arc.
        if(this.normalJump)body.force.y+=body.mass*world.gravity.y*(RAT_MOVEMENT.jumpGravityScale-1);
        // A floaty beat at the top of a launcher throw.
        if(this.hangLeft>0&&Math.abs(v.y)<8){this.hangLeft-=dt;body.force.y-=body.mass*world.gravity.y*this.hangLift;}
        return jumped;
    }
}

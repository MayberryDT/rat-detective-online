import {emitWorldSound} from '../audio/WorldSoundEvents';
import * as THREE from 'three';
import type * as CANNON from 'cannon-es';
import { RatEntity } from '../entities/RatEntity';
import { RatOptions } from '../utils/RatModel';
import { PRESSURE_LAUNCH, type ChaosState } from '../shared/chaosState';
import { RatBody, noControls, turnFacing } from '../shared/rat/ratBody';
import { ControlTally } from '../shared/rat/controlTally';
import { feelState } from '../feel/feelState';
import { FEEL } from '../feel/feelTuning';
import type {TouchMovement} from '../session/TouchInput';

const CAM_RADIUS = 6.0;
const CAM_PIVOT_Y = 3.5;
const CAM_SHOULDER = 1.25;
const MOUSE_SENS = 0.002;

/** three's recursive `intersect` without its sort: every hit under `object`, children in order. */
function castInto(object:THREE.Object3D,ray:THREE.Raycaster,hits:THREE.Intersection[]):void {
    if(object.layers.test(ray.layers)){const result:unknown=object.raycast(ray,hits);if(result===false)return;}
    for(let i=0;i<object.children.length;i++)castInto(object.children[i]!,ray,hits);
}

/** The player's rat: keys, mouse and touch read into `RatControls`, the shared rat body (`RatBody`, the same
 * step every bot runs) and the shoulder camera. */
export class RatController {
    public entity: RatEntity;
    /** The rat's movement: the one body step every rat shares. */
    readonly movement: RatBody;
    private camera: THREE.PerspectiveCamera;
    private spherical = new THREE.Spherical(CAM_RADIUS, Math.PI * 0.4, Math.PI);
    private readonly controls = noControls();
    /** The controls pressed since the last movement send (the city map's record; authority never reads it). */
    readonly tally = new ControlTally();

    /** Frozen city solids (2,400, mostly hidden behind the baked city) never move, so their world
     * bounding spheres are kept (x, y, z, radius) and a camera ray only raycasts the few it can
     * reach; each ray used to sphere-test every solid. Rats and props with parts raycast as before. */
    private readonly solids: THREE.Mesh[];
    private readonly solidSpheres: Float64Array;
    private readonly movingBlockers: THREE.Object3D[];
    private readonly rayHits: THREE.Intersection[] = [];
    private readonly cameraRay = new THREE.Raycaster();
    get grounded():boolean {return this.movement.grounded;}
    private readonly appliedLaunches = new Set<string>();
    private disposed = false;
    private readonly up = new THREE.Vector3(0, 1, 0);
    private readonly pivot = new THREE.Vector3();
    private readonly viewDirection = new THREE.Vector3();
    private readonly shoulder = new THREE.Vector3();
    private readonly shoulderDirection = new THREE.Vector3();
    private readonly offset = new THREE.Vector3();

    constructor(
        scene: THREE.Scene,
        world: CANNON.World,
        camera: THREE.PerspectiveCamera,
        name: string = 'Player',
        options?: RatOptions,
        spawnPos?: THREE.Vector3,
        launcherBounds?: {min:number;max:number},
        modelFactory?: (options?:RatOptions)=>THREE.Group
    ) {
        this.camera = camera;
        scene.updateMatrixWorld(true);
        const blockers = scene.children.filter(o=>o.userData.aimTarget===true);
        this.solids = blockers.filter((o):o is THREE.Mesh=>o instanceof THREE.Mesh&&!o.matrixAutoUpdate&&!o.children.length);
        const solids = new Set<THREE.Object3D>(this.solids), sphere = new THREE.Sphere();
        this.movingBlockers = blockers.filter(o=>!solids.has(o));
        this.solidSpheres = new Float64Array(this.solids.length*4);
        this.solids.forEach((mesh,i)=>{
            if(!mesh.geometry.boundingSphere)mesh.geometry.computeBoundingSphere();
            sphere.copy(mesh.geometry.boundingSphere!).applyMatrix4(mesh.matrixWorld);
            this.solidSpheres.set([sphere.center.x,sphere.center.y,sphere.center.z,sphere.radius],i*4);
        });

        // Create the Player Entity with the player's chosen name and appearance
        const pos = spawnPos ?? new THREE.Vector3(15, 2, 15);
        this.entity = new RatEntity(scene, world, pos, name, options, false, modelFactory);
        // One skinned draw for the rigid parts, as remote rats already do
        // (about 40 fewer draws in each of the main and two shadow passes).
        this.entity.enableRigidBatching();
        this.movement = new RatBody(this.entity.body, world, launcherBounds);
    }

    /** The legs (`legScale`, `jumpBlocked`): Hot Pursuit, or a Code Violation dud's slow, pin or no-jump. `(1,false)`
     * restores the ratified ordinary movement exactly; never a new base speed. */
    setLegs(scale:number,jumpBlocked=false):void {
        this.movement.speedScale = Number.isFinite(scale) && scale >= 0 ? scale : 1;
        this.movement.jumpBlocked = jumpBlocked;
    }
    get moveSpeedScale():number { return this.movement.speedScale; }
    onMouseMove(dx: number, dy: number): void {
        this.spherical.theta -= dx * MOUSE_SENS;
        this.spherical.phi -= dy * MOUSE_SENS;
        // Wider clamp so you can look almost straight up/down without snap
        this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi));
    }
    /** Point the camera along the rat's current heading (a restored rat keeps the view it had). */
    lookAlongFacing(): void { this.spherical.theta = this.entity.mesh.rotation.y - Math.PI; }

    update(dt: number, keys: Record<string, boolean>): void {
        this.prepareMovement(dt, keys);
        this.syncAfterPhysics(dt);
        this.updateView();
    }

    /** Read the controls and run the shared body step before the fixed physics step. Factors match the original at 60 Hz. */
    prepareMovement(dt: number, keys: Record<string, boolean>, touch?: TouchMovement): void {
        if (this.disposed) return;
        const c = this.controls, alive = !this.entity.dead && this.entity.hp > 0;
        c.moveForward = (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) - (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0) + (touch ? touch.y : 0);
        c.moveRight = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0) + (touch ? touch.x : 0);
        c.lookYaw = this.spherical.theta;
        c.lookPitch = this.spherical.phi - Math.PI / 2;
        c.jump = !!(keys['Space'] || touch?.jump);
        this.tally.note(c);
        if (this.movement.step(dt, c, alive)) emitWorldSound(this.entity.scene,'jump',this.entity.body.position,{key:'local-jump'});
        // Face the camera (always strafe, for shooting).
        if (alive) this.entity.mesh.rotation.y = turnFacing(this.entity.mesh.rotation.y, c.lookYaw, dt);
    }

    syncAfterPhysics(dt: number): void {
        if (this.disposed) return;
        this.movement.settle(!this.entity.dead && this.entity.hp > 0, !this.entity.dead);
        this.entity.update(dt);
        // The camera is placed once per rendered frame (updateView), not per
        // physics step: its two blocker raycasts were 8-12% of the frame.
    }

    updateView(): void {
        this.updateCamera();
        // Keep the camera ray current when input arrives before the next render.
        this.camera.updateWorldMatrix(true, false);
        this.entity.syncGlowTransform();
    }

    /** Server-selected launch events are retained briefly in snapshots and applied once. */
    applyPressureLaunches(state:Pick<ChaosState,'time'|'pressure'>,playerId:string):void {
        for(const event of state.pressure?.launches||[]){
            if(event.playerId!==playerId || this.appliedLaunches.has(event.id))continue;
            this.appliedLaunches.add(event.id);
            if(this.appliedLaunches.size>32)this.appliedLaunches.delete(this.appliedLaunches.values().next().value!);
            if(state.time-event.at<0 || state.time-event.at>PRESSURE_LAUNCH.eventMs || this.entity.dead || this.entity.hp<=0)continue;
            this.movement.launch(event.velocity,feelState().on('launchFlight')?FEEL.launchFlight.params.hang:0,FEEL.launchFlight.params.hangLift);
        }
        // A nearby landing's shockwave: a knockback hop that carries until the rat lands.
        for(const event of state.pressure?.shoves||[]){
            if(event.playerId!==playerId || this.appliedLaunches.has(event.id))continue;
            this.appliedLaunches.add(event.id);
            if(this.appliedLaunches.size>32)this.appliedLaunches.delete(this.appliedLaunches.values().next().value!);
            if(state.time-event.at<0 || state.time-event.at>PRESSURE_LAUNCH.eventMs || this.entity.dead || this.entity.hp<=0)continue;
            this.movement.shove(event.velocity);
        }
    }

    resetGrounding(): void { this.movement.reset(); }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.resetGrounding();
        this.entity.dispose();
    }

    private updateCamera(): void {
        const mesh = this.entity.mesh;
        const pivot = this.pivot.set(mesh.position.x, mesh.position.y + CAM_PIVOT_Y, mesh.position.z);
        const offset = this.offset.setFromSpherical(this.spherical);


        // Direct copy — NO lerp. Lerp causes snap-back when whipping around fast
        // because it interpolates through 3D space, not spherical space.
        this.camera.position.copy(pivot).add(offset);
        pivot.y = mesh.position.y + 2.2;
        // Translate the view sideways without toeing it back into the rat's head.
        this.viewDirection.copy(pivot).sub(this.camera.position).normalize();
        this.shoulder.set(1,0,0).applyAxisAngle(this.up,this.spherical.theta).multiplyScalar(CAM_SHOULDER);
        // Resolve the shoulder first, then the boom: backing into a wall must
        // shorten distance without collapsing the view back onto the rat.
        this.cameraRay.set(pivot,this.shoulderDirection.copy(this.shoulder).normalize());
        this.cameraRay.far=CAM_SHOULDER;
        const shoulderHit=this.firstBlockerHit();
        if(shoulderHit)this.shoulder.setLength(Math.max(0,shoulderHit.distance-.3));
        this.camera.position.add(this.shoulder);
        pivot.add(this.shoulder);
        offset.copy(this.camera.position).sub(pivot);
        this.cameraRay.far = offset.length();
        this.cameraRay.set(pivot, offset.normalize());
        const hit = this.firstBlockerHit();
        if(hit) this.camera.position.copy(pivot).addScaledVector(this.cameraRay.ray.direction,Math.max(.3,hit.distance-.3));
        this.camera.lookAt(this.offset.copy(this.camera.position).add(this.viewDirection));
    }

    /** The nearest blocker along `cameraRay` within its `far`: the same hit as raycasting every blocker. */
    private firstBlockerHit(): THREE.Intersection|undefined {
        const ray=this.cameraRay,{origin,direction}=ray.ray,far=ray.far,spheres=this.solidSpheres,hits=this.rayHits;
        hits.length=0;
        for(let i=0;i<this.solids.length;i++){
            const x=spheres[i*4]-origin.x,y=spheres[i*4+1]-origin.y,z=spheres[i*4+2]-origin.z,r=spheres[i*4+3];
            const along=x*direction.x+y*direction.y+z*direction.z;
            // Wholly behind the origin, wholly past `far`, or off the line: no hit is possible.
            if(along<-r||along>far+r||x*x+y*y+z*z-along*along>r*r)continue;
            castInto(this.solids[i]!,ray,hits);
        }
        for(let i=0;i<this.movingBlockers.length;i++)castInto(this.movingBlockers[i]!,ray,hits);
        // The nearest, and the first found among equals: what three's stable sort puts first.
        let nearest=hits[0];
        for(let i=1;i<hits.length;i++)if(hits[i]!.distance<nearest!.distance)nearest=hits[i];
        return nearest;
    }
}

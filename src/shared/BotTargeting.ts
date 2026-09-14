import * as C from 'cannon-es';
import {CASE_SIZE,type ChaosState} from './chaosState';
import {BALL_RADIUS} from './ballTuning';
import {hasIronclad} from './pickups';
import type {PlayerData,Vec3Data} from './networkProtocol';
import {sweepSphereBody} from './sweepSphere';

// Reuse the authoritative silhouette and suitcase shape for this bounded shot
// veto. No world or extra simulation, and no prediction of later ricochets.
const ratBody=new C.Body({mass:0});
ratBody.addShape(new C.Sphere(.6),new C.Vec3(0,.6,0));
ratBody.addShape(new C.Sphere(.45),new C.Vec3(0,1.3,0));
ratBody.addShape(new C.Sphere(.28),new C.Vec3(0,1.9,0));
const caseBody=new C.Body({mass:0,shape:new C.Box(new C.Vec3(CASE_SIZE.x/2,CASE_SIZE.y/2,CASE_SIZE.z/2))});

/** The coat protects the rat, not the case. Only try close, exposed disarms. */
export function exposedCarrierCase(self:Vec3Data,rat:PlayerData,state:ChaosState|undefined,clear:(p:Vec3Data)=>boolean):Vec3Data|undefined {
    const c=state?.case;
    if(!c||c.owner!==rat.id||c.returningUntil>(state?.time??0)||Math.hypot(self.x-c.p.x,self.y-c.p.y,self.z-c.p.z)>16)return;
    const side=(self.x-rat.x)*(c.p.x-rat.x)+(self.z-rat.z)*(c.p.z-rat.z);
    if(side<=0||!clear(c.p))return;
    return c.p;
}

/** Veto an immediate shot that would hit a visible silver coat before its case.
 * Uses the same muzzle offsets as the hosted controller, after selecting facing. */
export function shotHitsIronclad(self:Vec3Data,facing:number,aim:Vec3Data,rats:readonly PlayerData[],state:ChaosState|undefined):boolean {
    const cos=Math.cos(facing),sin=Math.sin(facing);
    const from=new C.Vec3(self.x-.49*cos+.47*sin,self.y+1.376,self.z+.49*sin+.47*cos),to=new C.Vec3(aim.x,aim.y,aim.z);
    for(const rat of rats){
        if(rat.hp<=0||!hasIronclad(state?.buffs,rat.id,state?.time??0))continue;
        ratBody.position.set(rat.x,rat.y,rat.z);
        const hit=sweepSphereBody(from,to,BALL_RADIUS,ratBody);if(!hit.hasHit)continue;
        const c=state?.case;
        if(c?.owner===rat.id){
            caseBody.position.set(c.p.x,c.p.y,c.p.z);caseBody.quaternion.set(c.q.x,c.q.y,c.q.z,c.q.w);
            const caseHit=sweepSphereBody(from,to,BALL_RADIUS,caseBody);
            if(caseHit.hasHit&&caseHit.distance<hit.distance)continue;
        }
        return true;
    }
    return false;
}

import * as THREE from 'three';

/** Polish 11: the fedora popped off a defeated rat. A render-only copy of the
 * rig's hat (shared geometry and materials, never disposed here) that tumbles
 * with simple ballistic motion and settles on the floor it died on. No
 * physics body: it never collides with rats, cheese or cases. */
export class FlyingHat {
    readonly root:THREE.Object3D;
    private readonly velocity=new THREE.Vector3();
    private readonly spin=new THREE.Vector3();
    private readonly turn=new THREE.Quaternion();
    private readonly axis=new THREE.Vector3();
    private resting=false;
    /** R3: after landing the hat rolls away on its brim, slows, wobbles and lies flat. */
    private rolling=false;
    private rollAge=0;
    private rollSpeed=0;
    private rollAngle=0;
    private rollSide=1;
    private readonly rollDirection=new THREE.Vector3();
    private readonly euler=new THREE.Euler(0,0,0,'YXZ');
    private readonly roll=new THREE.Quaternion();

    /** `floor` is read live (the body's current feet height), so the hat lands where the body does. */
    constructor(scene:THREE.Scene,source:THREE.Object3D,push:THREE.Vector3,private readonly floor:()=>number,speed:number,lift:number,seed:number){
        source.updateWorldMatrix(true,false);
        this.root=source.clone(true);
        // Batched rigs hide their source leaves; the copy must draw on its own.
        this.root.traverse(object=>{object.visible=true;delete object.userData.rigidBatchSource;});
        source.matrixWorld.decompose(this.root.position,this.root.quaternion,this.root.scale);
        this.root.name='rat-flying-hat';
        this.velocity.copy(push).setY(0);
        if(this.velocity.lengthSq()<1e-6)this.velocity.set(Math.sin(seed*7.1),0,Math.cos(seed*7.1));
        this.velocity.normalize().multiplyScalar(speed).setY(lift);
        this.spin.set(Math.sin(seed*3.3)*9,Math.cos(seed*5.7)*6,Math.sin(seed*1.9)*11);
        scene.add(this.root);
    }

    update(dt:number):void {
        if(!(dt>0))return;
        // The body can still slide or fall away below a resting hat.
        if(this.resting){if(this.floor()<this.root.position.y-.2)this.resting=false;else return;}
        dt=Math.min(dt,.05);
        if(this.rolling){this.rollOn(dt);return;}
        this.velocity.y-=25*dt;
        this.root.position.addScaledVector(this.velocity,dt);
        const angle=this.spin.length()*dt;
        if(angle>0){this.turn.setFromAxisAngle(this.axis.copy(this.spin).normalize(),angle);this.root.quaternion.premultiply(this.turn);}
        const floor=this.floor();
        if(this.root.position.y<=floor+.05&&this.velocity.y<0){
            this.root.position.y=floor+.05;
            this.velocity.y*=-.32;this.velocity.x*=.6;this.velocity.z*=.6;this.spin.multiplyScalar(.5);
            if(Math.abs(this.velocity.y)<1.2){
                // Tip onto the brim and roll off the way it was going.
                this.rollDirection.set(this.velocity.x,0,this.velocity.z);
                if(this.rollDirection.lengthSq()<1e-4)this.rollDirection.set(Math.sin(this.spin.y||1),0,Math.cos(this.spin.y||1));
                this.rollDirection.normalize();
                this.rollSpeed=Math.max(2.4,Math.hypot(this.velocity.x,this.velocity.z)*1.4);
                this.rollSide=this.spin.x>=0?1:-1;
                this.velocity.set(0,0,0);this.spin.set(0,0,0);this.rolling=true;this.rollAge=0;this.rollAngle=0;
            }
        }
    }

    private rollOn(dt:number):void {
        this.rollAge+=dt;
        this.rollSpeed*=Math.exp(-1.5*dt);
        this.root.position.addScaledVector(this.rollDirection,this.rollSpeed*dt);
        this.rollAngle+=this.rollSpeed/.5*dt;
        // On edge while it has speed; then it wobbles down flat like a dropped coin.
        const settle=Math.min(1,Math.max(0,(.9-this.rollSpeed)/.8));
        const tilt=(1.25*(1-settle))+Math.sin(this.rollAge*14)*.25*settle*(1-settle);
        const heading=Math.atan2(this.rollDirection.x,this.rollDirection.z);
        this.root.quaternion.setFromEuler(this.euler.set(0,heading+Math.PI/2,0));
        this.roll.setFromAxisAngle(this.axis.set(1,0,0),this.rollSide*tilt);this.root.quaternion.multiply(this.roll);
        this.roll.setFromAxisAngle(this.axis.set(0,1,0),this.rollAngle*(1-settle));this.root.quaternion.multiply(this.roll);
        this.root.position.y=this.floor()+.05+Math.sin(Math.abs(tilt))*.36;
        if(settle>=1){this.rolling=false;this.resting=true;this.root.position.y=this.floor()+.05;}
    }

    dispose():void {this.root.removeFromParent();}
}

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

    constructor(scene:THREE.Scene,source:THREE.Object3D,push:THREE.Vector3,private readonly floor:number,speed:number,lift:number,seed:number){
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
        if(this.resting||!(dt>0))return;
        dt=Math.min(dt,.05);
        this.velocity.y-=25*dt;
        this.root.position.addScaledVector(this.velocity,dt);
        const angle=this.spin.length()*dt;
        if(angle>0){this.turn.setFromAxisAngle(this.axis.copy(this.spin).normalize(),angle);this.root.quaternion.premultiply(this.turn);}
        if(this.root.position.y<=this.floor+.05&&this.velocity.y<0){
            this.root.position.y=this.floor+.05;
            this.velocity.y*=-.32;this.velocity.x*=.6;this.velocity.z*=.6;this.spin.multiplyScalar(.5);
            if(Math.abs(this.velocity.y)<1.2){
                // Settle brim-down, keeping its heading.
                this.velocity.set(0,0,0);this.spin.set(0,0,0);this.resting=true;
                const yaw=new THREE.Euler().setFromQuaternion(this.root.quaternion,'YXZ').y;
                this.root.quaternion.setFromEuler(new THREE.Euler(0,yaw,0));
            }
        }
    }

    dispose():void {this.root.removeFromParent();}
}

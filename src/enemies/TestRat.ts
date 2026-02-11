import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RatEntity } from '../entities/RatEntity';
import { CheeseGun } from '../weapons/CheeseGun';

// ─── AI TUNING ───
const CHASE_DIST = 25;       // Start chasing
const SHOOT_DIST = 15;       // Start shooting
const MOVE_SPEED = 5.5;        // Slower than player
const SHOOT_INTERVAL = 1.5;  // Time between shots

type AIState = 'IDLE' | 'CHASE' | 'SHOOT';

export class TestRat {
    public entity: RatEntity;
    public disposed = false; // Flag for cleanup

    private scene: THREE.Scene;
    private target: RatEntity; // The Player
    private gun: CheeseGun;

    private state: AIState = 'IDLE';
    private fireTimer = 0;
    private moveTimer = 0; // Wandering
    private desiredVelocity = new THREE.Vector3();
    private disposedTimer = 0;

    private funnyNames = [
        "Rat Capone", "Mickey Bricks", "Cheez Wiz", "Big Al", "Squeaky Pete",
        "The Goudafather", "Ratty Matty", "Verminator", "Slick Rick", "Brie Larson"
    ];

    constructor(
        scene: THREE.Scene,
        world: CANNON.World,
        position: THREE.Vector3,
        playerTarget: RatEntity,
        gun: CheeseGun
    ) {
        this.scene = scene;
        this.target = playerTarget;
        this.gun = gun;

        const name = "NPC " + this.funnyNames[Math.floor(Math.random() * this.funnyNames.length)];
        this.entity = new RatEntity(scene, world, position, name);
    }

    update(dt: number): boolean {
        this.entity.update(dt);

        if (this.entity.dead) {
            // Allow ragdoll to settle for a bit before removing
            this.disposedTimer += dt;
            if (this.disposedTimer > 5.0) {
                // CLEANUP
                this.entity.dispose(); // We need to add a dispose method to RatEntity!
                return true;
            }
            return false;
        }

        this.updateAI(dt);
        return false;
    }

    private updateAI(dt: number) {
        const myPos = this.entity.mesh.position;
        const targetPos = this.target.mesh.position;

        const dist = myPos.distanceTo(targetPos);
        const vecToTarget = new THREE.Vector3().subVectors(targetPos, myPos);

        // 1. STATE DECISION
        if (dist < SHOOT_DIST) {
            this.state = 'SHOOT';
        } else if (dist < CHASE_DIST) {
            this.state = 'CHASE';
        } else {
            this.state = 'IDLE';
        }

        // 2. BEHAVIOR
        this.desiredVelocity.set(0, 0, 0);

        if (this.state === 'IDLE') {
            // Wander logic (simple)
            this.moveTimer -= dt;
            if (this.moveTimer < 0) {
                this.moveTimer = 2 + Math.random() * 3;
                const angle = Math.random() * Math.PI * 2;
                this.desiredVelocity.set(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(MOVE_SPEED * 0.5);
            }
        }
        else if (this.state === 'CHASE') {
            const dir = vecToTarget.clone().normalize();
            this.desiredVelocity.copy(dir).multiplyScalar(MOVE_SPEED);
            this.faceTarget(targetPos);
        }
        else if (this.state === 'SHOOT') {
            // Stop to shoot
            this.desiredVelocity.set(0, 0, 0);
            this.faceTarget(targetPos);

            this.fireTimer -= dt;
            if (this.fireTimer <= 0) {
                this.fireTimer = SHOOT_INTERVAL + Math.random() * 0.5;
                // Aim at player's mid-body
                const aimPos = targetPos.clone();
                aimPos.y += 1.0;
                this.gun.shoot(this.entity, aimPos);
            }
        }

        // 3. APPLY PHYSICS
        const v = this.entity.body.velocity;
        v.x += (this.desiredVelocity.x - v.x) * 0.1;
        v.z += (this.desiredVelocity.z - v.z) * 0.1;

        // Wake up
        if (this.desiredVelocity.lengthSq() > 0.1) {
            this.entity.body.wakeUp();
        }
    }

    private faceTarget(target: THREE.Vector3) {
        const myPos = this.entity.mesh.position;
        const angle = Math.atan2(target.x - myPos.x, target.z - myPos.z);
        // atan2 returns angle from +Z? 0 is +Z, PI is -Z... THREE default rotation is 0 at +Z? 
        // Actually usually 0 is looking down +Z.
        // Let's just lerp rotation.

        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
        this.entity.mesh.quaternion.slerp(q, 0.1);
    }
}

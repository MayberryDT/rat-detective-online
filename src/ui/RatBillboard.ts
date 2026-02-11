import * as THREE from 'three';

export class RatBillboard {
    public sprite: THREE.Sprite;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private texture: THREE.CanvasTexture;

    private name: string;
    private health: number;
    private maxHealth: number = 3;

    constructor(name: string, initialHealth: number = 3) {
        this.name = name;
        this.health = initialHealth;

        this.canvas = document.createElement('canvas');
        this.canvas.width = 256;
        this.canvas.height = 128; // 2:1 aspect ratio
        this.ctx = this.canvas.getContext('2d')!;

        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.minFilter = THREE.LinearFilter;

        const material = new THREE.SpriteMaterial({
            map: this.texture,
            transparent: true,
            depthTest: true, // Visible depth, so walls hide it
            depthWrite: false
        });

        this.sprite = new THREE.Sprite(material);
        this.sprite.scale.set(1.5, 0.75, 1); // World size
        this.sprite.center.set(0.5, 0); // Pivot at bottom center so it sits on head

        this.draw();
    }

    public setHealth(hp: number) {
        if (this.health !== hp) {
            this.health = hp;
            this.draw();
        }
    }

    private draw() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const ctx = this.ctx;

        // Clear
        ctx.clearRect(0, 0, w, h);

        const isDead = this.health <= 0;

        // Text (Name or DEAD)
        ctx.font = 'bold 32px "Courier New", monospace';
        ctx.fillStyle = isDead ? '#ff0000' : '#ffffff';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 4;
        ctx.lineWidth = 3;

        let displayText = this.name;
        if (isDead) displayText = "DEAD";

        ctx.strokeText(displayText, w / 2, 40);
        ctx.fillText(displayText, w / 2, 40);

        // Health Bar Background
        const barW = 160;
        const barH = 20;
        const barX = (w - barW) / 2;
        const barY = 60;

        ctx.fillStyle = '#333333';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);

        // Segments
        const segW = (barW - 4) / 3; // 3 segments with small gaps

        for (let i = 0; i < 3; i++) {
            let color = '#550000'; // Empty

            if (i < this.health) {
                color = '#00ff00';
                if (this.health <= 1) color = '#ff0000';
            }

            ctx.fillStyle = color;
            ctx.fillRect(barX + (i * (segW + 2)) + 2, barY + 2, segW - 2, barH - 4);
        }

        this.texture.needsUpdate = true;
    }

    public update(camera: THREE.Camera) {
        // Billboard logic is handled automatically by THREE.Sprite! 
        // It always faces the camera.
        // We just need to make sure the parent position is correct.
    }
}

export type CameoKind='spider'|'bat';
export const CAMEO_LAYOUT = [
    // West corner of the south Gate tower, beside the Sewer Geyser launcher.
    // This authored 62-unit roof stays fixed across city seeds.
    {kind:'spider',x:-141,y:62,z:25.5,yaw:-Math.PI/2,viewDistance:100},
    // Back corner of Maintenance, clear of the workbench, cabinet and armor.
    {kind:'bat',x:61.5,y:-7,z:-40.4,yaw:-Math.PI*.3,viewDistance:40},
] as const;

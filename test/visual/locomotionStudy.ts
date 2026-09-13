/** In-place art sequence only. No controller input, physics or network actions. */
export function locomotionStudy(time:number):{speed:number;yaw:number;label:string} {
    const t = ((time % 6.5) + 6.5) % 6.5;
    if (t < .6) return {speed:0,yaw:0,label:'Ready'};
    if (t < 1.5) return {speed:18,yaw:0,label:'Start moving'};
    if (t < 1.8) return {speed:18,yaw:(t-1.5)/.3*Math.PI/2,label:'Turn left'};
    if (t < 2.4) return {speed:18,yaw:Math.PI/2,label:'Moving'};
    if (t < 3.5) return {speed:0,yaw:Math.PI/2,label:'Stop · settle'};
    if (t < 4.4) return {speed:18,yaw:Math.PI/2,label:'Move again'};
    if (t < 4.7) return {speed:18,yaw:(1-(t-4.4)/.3)*Math.PI/2,label:'Turn right'};
    if (t < 5.3) return {speed:18,yaw:0,label:'Moving'};
    return {speed:0,yaw:0,label:'Stop · settle'};
}

/** Chrome and Edge draw WebGL on the CPU when hardware acceleration is off or the graphics driver is blocked
 * (SwiftShader, or Microsoft Basic Render Driver on Windows); the city then crawls. Returns the renderer's name in that case. */
export function softwareRenderer(gl:WebGLRenderingContext|WebGL2RenderingContext):string|undefined {
    const info=gl.getExtension('WEBGL_debug_renderer_info');
    const name=String(gl.getParameter(info?info.UNMASKED_RENDERER_WEBGL:gl.RENDERER)??'');
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name)?name:undefined;
}

/** A paper note on the title screen telling the player how to get their graphics card back. */
export function showSoftwareRenderNotice(title:HTMLElement):void {
    if(title.querySelector('.render-notice'))return;
    const note=title.ownerDocument.createElement('p');
    note.className='render-notice';note.setAttribute('role','status');
    note.textContent='Your browser is drawing the city without your graphics card, so the game will run slowly. Turn on "Use graphics acceleration when available" in your browser settings, restart the browser, and come back.';
    title.appendChild(note);
}

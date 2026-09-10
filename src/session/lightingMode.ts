/** Local presentation trial. Append lighting=classic to restore the previous
 * ambient values and sewer-only dynamic lighting without changing the room. */
export type LightingMode='pools'|'classic';
export function readLightingMode(search=typeof location==='undefined'?'':location.search):LightingMode {
    return new URLSearchParams(search).get('lighting')==='classic'?'classic':'pools';
}

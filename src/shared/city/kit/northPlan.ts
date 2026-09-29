/**
 * The north of the city (layout 3): the harbour, the docks and the Panopticon
 * precinct. North is -z. Leaf module: plain numbers only, safe to import from
 * any layout file without cycles.
 */
export interface Rect {xmin:number; xmax:number; zmin:number; zmax:number}

/** Harbour water: open water north of the quay edge, across the whole city width. */
export const QUAY_EDGE_Z = -172;
/** The water surface sits below the quay; a rat whose feet sink below `DROWN_Y` in the water dies. */
export const WATER_SURFACE_Y = -2.2;
export const DROWN_Y = -1.6;
export const SEA_FLOOR_Y = -12;
export const HARBOUR: Rect = {xmin:-196, xmax:166, zmin:-196, zmax:QUAY_EDGE_Z};

/** The docks: the quay apron (a street), the container yard and the warehouse. */
export const DOCKS_LOT: Rect = {xmin:-40, xmax:166, zmin:QUAY_EDGE_Z, zmax:-108};
export const QUAY: Rect = {xmin:-40, xmax:166, zmin:QUAY_EDGE_Z, zmax:-150};

/** The Panopticon: a brick front house on the -102 street and a round cellblock behind it. */
export const PRECINCT_LOT: Rect = {xmin:-132, xmax:-78, zmin:QUAY_EDGE_Z, zmax:-108};
export const PRECINCT_HOUSE: Rect = {xmin:-130, xmax:-80, zmin:-128, zmax:-108};
export const PRECINCT_RING = {x:-105, z:-150, radius:20} as const;

export const inside = (r:Rect, x:number, z:number, pad=0) => x>=r.xmin-pad && x<=r.xmax+pad && z>=r.zmin-pad && z<=r.zmax+pad;
export const overlaps = (r:Rect, x:number, z:number, w:number, d:number) =>
    Math.abs(x-(r.xmin+r.xmax)/2) < (w+r.xmax-r.xmin)/2 && Math.abs(z-(r.zmin+r.zmax)/2) < (d+r.zmax-r.zmin)/2;

/** Kept clear for the north sewer branches' street exits (ramps up from the sewer). */
export const PRECINCT_SEWER_EXIT: Rect = {xmin:-77, xmax:-67, zmin:-150, zmax:-110};
export const DOCKS_SEWER_EXIT: Rect = {xmin:46, xmax:60, zmin:-146, zmax:-110};
/** The freighter's berth alongside the quay, between the Seventy Avenue pier and the east pier. */
export const BERTH: Rect = {xmin:82, xmax:140, zmin:-192, zmax:-175};

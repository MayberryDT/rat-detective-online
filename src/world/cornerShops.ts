import {chamferFace,type ChamferFace} from '../shared/skyline';
import type {BuildingFootprint,FootprintChamfer} from '../shared/worldSpec';

/** A corner business: the fascia over its door, the upright blade above it and its light. */
export interface CornerShop {name:string;blade:string;ink:string;neon:boolean;spill:number}
export interface CornerEntrance {building:BuildingFootprint;chamfer:FootprintChamfer;face:ChamferFace;shop:CornerShop}

// Period names; neon ones glow, painted ones catch the street light.
const SHOPS:readonly CornerShop[]=[
    {name:'THE RUSTY RIND',blade:'BAR',ink:'#ff4a3d',neon:true,spill:0xe8826a},
    {name:"SAL'S ALL-NITE DINER",blade:'EATS',ink:'#5ff2d6',neon:true,spill:0x9cd6c2},
    {name:'CORNER DRUGS · SODA',blade:'DRUGS',ink:'#e9dcae',neon:false,spill:0xe6d2a0},
    {name:"MOE'S LOANS",blade:'PAWN',ink:'#ffb23f',neon:true,spill:0xe8b87a},
    {name:'HOTEL MARLOWE',blade:'HOTEL',ink:'#ff5f8a',neon:true,spill:0xe08ea0},
    {name:'CIGARS · NEWS',blade:'SMOKE',ink:'#d8c79a',neon:false,spill:0xdcc190},
    {name:'THE CHEDDAR CLUB',blade:'CLUB',ink:'#7fb8ff',neon:true,spill:0x93b4e0},
    {name:'LUCKY BILLIARDS',blade:'POOL',ink:'#79ff7a',neon:true,spill:0xa8d890},
    {name:'PARMA DELICATESSEN',blade:'DELI',ink:'#f0d7a2',neon:false,spill:0xe3c893},
    {name:'NIGHT OWL LUNCH',blade:'LUNCH',ink:'#ffd05c',neon:true,spill:0xe8c47c},
    {name:'ACME LIQUORS',blade:'LIQUOR',ink:'#ff5140',neon:true,spill:0xe48a70},
    {name:'BLUE NOTE LOUNGE',blade:'JAZZ',ink:'#58a8ff',neon:true,spill:0x8aa8e0},
    {name:'GOLDEN RAT CAFE',blade:'CAFE',ink:'#ffc062',neon:true,spill:0xe8bf82},
    {name:'EMPIRE BARBERS',blade:'SHAVE',ink:'#e6e0cf',neon:false,spill:0xdcd2bc},
    {name:'SWISS WATCH REPAIR',blade:'CLOCKS',ink:'#ffe08a',neon:true,spill:0xe6cf96},
    {name:'MIDNIGHT LAUNDRY',blade:'WASH',ink:'#9ef0ff',neon:true,spill:0xa6d2dc},
];

/** Every cut corner's entrance, in layout order, so the renderer and the street spill agree. */
export function cornerEntrances(layout:readonly BuildingFootprint[]):CornerEntrance[] {
    return layout.flatMap(building=>(building.chamfers??[]).map(chamfer=>({building,chamfer,face:chamferFace(building,chamfer)})))
        .map((e,i)=>({...e,shop:SHOPS[i%SHOPS.length]}));
}

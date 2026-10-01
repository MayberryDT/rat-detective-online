import type {IncidentId} from '../shared/incidentCatalog';

// Small ink drawings, deliberately independent of fonts, emoji and image downloads.
const drawings: Record<IncidentId | 'dispatch', string> = {
    dispatch: '<path d="M14 43h37l-3 8H11zM19 40V28a13 13 0 0 1 26 0v12M26 23l-2 9M32 5v6M9 15l7 5M55 15l-7 5"/><path class="incident-ink" d="M30 20h5l-1 14h-3z"/>',
    'improper-disposal': '<path d="m5 41 12-2M4 49l17-6M9 30l10 3M24 32l-3-10 9 3 4-10 5 9 13-2-7 10 10 4-12 6-1 10-10-9-12 2zM29 30l6 6m0-6-6 6M38 28l6 6m0-6-6 6M26 43q-11 17-16 7"/>',
    'bad-ammunition': '<path d="M3 30h12l3-4h4v10h-4l-3-3H3z"/><path d="M25 31q3-9 6 0t6 0 6 0"/><path class="incident-ink" d="M24 46q4-10 8 0 4-7 8 0 4-4 8 0"/><circle cx="55" cy="31" r="4"/><circle cx="54" cy="46" r="2.5"/><path d="M28 14h2m5 0h2m5 0h2M50 18l4-5m-2 9 6-2"/>',
    'pressure-surge': '<path d="M13 53h38l-3-9H16zM20 39V23h9v16m6 0V23h9v16M15 17l8-10 9 10m-9-8v12M32 17 41 7l8 10m-8-8v12M5 31l8 3m40-3 7-4"/>',
    'evidence-tampering': '<path d="m17 25 34-5 4 25-35 5zM27 22l-1-8 14-2 1 8M18 32l35-5M30 30l1 6 10-2-1-6M5 31l9-2M7 41l8-2M12 51l4-1M48 9l3-5m5 11 5-2"/>',
    crossfire: '<path d="M50 11v42M7 49l34-22-14-8m14 8-9 13M38 13l3-10 5 10 11-6-3 12 8 4-11 4"/><circle class="incident-ink" cx="17" cy="42" r="6"/>',
    scattershot: '<path d="M4 40h12l3-4h4v10h-4l-3-3H4zM26 41l12-14M26 41h16M26 41l12 13"/><circle cx="41" cy="25" r="3"/><circle cx="45" cy="41" r="3"/><circle cx="41" cy="55" r="3"/><path class="incident-ink" d="m50 6 8 3-2 7-7 2-3-5zM47 12l-3 3m11 1 1 4M44 7l-2-3"/><path d="M36 13q4-7 10-8M30 18q2-4 6-6"/>',
    'big-cheese': '<path d="M8 49Q3 22 28 12q20-7 28 13L8 49l44 3 4-27M19 34l3-4M28 23l4-2M41 24l4-1M24 46l5 1M41 42l4-1M10 12 6 7m16 0-1-5"/>',
    'planted-evidence': '<path d="m14 30 30-4 3 22-30 4zM23 27l-1-7 12-2 1 7M16 36l30-4M27 37l1 6 9-1-1-6"/><path class="incident-ink" d="M52 14l2-8m4 12 7-3m-8 8 7 4m-11-1 3 8m-9-3 1 9"/><circle cx="52" cy="30" r="4"/>',
    blackout: '<path d="M32 6v7M20 13h24l-4 14H24zM24 27l-6 12h28l-6-12M9 55 55 9"/><path class="incident-ink" d="M30 42h4v9h-4z"/><circle cx="15" cy="17" r="2"/><circle cx="50" cy="43" r="2"/>',
    'code-violation': '<path d="M11 13h42v19H11zM20 13l12-8 12 8"/><path class="incident-ink" d="M23 17l18 11m0-11L23 28"/><path d="M32 36l-7 11h8l-4 12 13-17h-8l5-6zM12 44l-6-3m6 10-7 2M52 44l6-3m-6 10 7 2"/>',
    'most-wanted': '<path d="M10 6h44v52H10z"/><path class="incident-ink" d="M17 14h30"/><circle cx="32" cy="31" r="8"/><path d="M20 49q12-13 24 0M17 14h30M24 22l-3-4m19 4 3-4"/>',
    'all-units': '<path d="M26 44V24a6 6 0 0 1 12 0v20M20 44h24l3 10H17zM32 18V10M20 22l-6-5M44 22l6-5M12 32H5m54 0h-7"/><path class="incident-ink" d="M29 30h6v10h-6z"/>',
    bobbleheads: '<circle cx="32" cy="22" r="16"/><circle cx="17" cy="9" r="5"/><circle cx="47" cy="9" r="5"/><path d="m32 38-4 3 8 3-8 3 4 3M24 58l4-8h8l4 8M6 18q-3 4 0 8m52-8q3 4 0 8"/><path class="incident-ink" d="M26 20h2m8 0h2M27 28q5 4 10 0"/>',
    'act-of-god': '<path d="M14 30a13 12 0 1 0 26 0a13 12 0 1 0-26 0M38 22l19-16M41 30l19-11M33 18l12-14"/><circle cx="22" cy="27" r="2.5"/><circle cx="31" cy="34" r="3"/><circle cx="30" cy="23" r="1.5"/><path class="incident-ink" d="M12 57a15 4 0 1 0 30 0a15 4 0 1 0-30 0"/>',
};

export function incidentArtwork(id: IncidentId | 'dispatch'): string {
    return `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${drawings[id]}</svg>`;
}

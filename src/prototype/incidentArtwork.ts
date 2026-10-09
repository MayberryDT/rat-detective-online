import type {IncidentId} from '../shared/incidentCatalog';

// Small ink drawings, deliberately independent of fonts, emoji and image downloads.
const drawings: Record<IncidentId | 'dispatch', string> = {
    dispatch: '<path d="M14 43h37l-3 8H11zM19 40V28a13 13 0 0 1 26 0v12M26 23l-2 9M32 5v6M9 15l7 5M55 15l-7 5"/><path class="incident-ink" d="M30 20h5l-1 14h-3z"/>',
    'improper-disposal': '<path d="m5 41 12-2M4 49l17-6M9 30l10 3M24 32l-3-10 9 3 4-10 5 9 13-2-7 10 10 4-12 6-1 10-10-9-12 2zM29 30l6 6m0-6-6 6M38 28l6 6m0-6-6 6M26 43q-11 17-16 7"/>',
    'pressure-surge': '<path d="M13 53h38l-3-9H16zM20 39V23h9v16m6 0V23h9v16M15 17l8-10 9 10m-9-8v12M32 17 41 7l8 10m-8-8v12M5 31l8 3m40-3 7-4"/>',
    'evidence-tampering': '<path d="m17 25 34-5 4 25-35 5zM27 22l-1-8 14-2 1 8M18 32l35-5M30 30l1 6 10-2-1-6M5 31l9-2M7 41l8-2M12 51l4-1M48 9l3-5m5 11 5-2"/>',
    crossfire: '<path d="M50 11v42M7 49l34-22-14-8m14 8-9 13M38 13l3-10 5 10 11-6-3 12 8 4-11 4"/><circle class="incident-ink" cx="17" cy="42" r="6"/>',
    scattershot: '<path d="M4 40h12l3-4h4v10h-4l-3-3H4zM26 41l12-14M26 41h16M26 41l12 13"/><circle cx="41" cy="25" r="3"/><circle cx="45" cy="41" r="3"/><circle cx="41" cy="55" r="3"/><path class="incident-ink" d="m50 6 8 3-2 7-7 2-3-5zM47 12l-3 3m11 1 1 4M44 7l-2-3"/><path d="M36 13q4-7 10-8M30 18q2-4 6-6"/>',
    blackout: '<path d="M32 6v7M20 13h24l-4 14H24zM24 27l-6 12h28l-6-12M9 55 55 9"/><path class="incident-ink" d="M30 42h4v9h-4z"/><circle cx="15" cy="17" r="2"/><circle cx="50" cy="43" r="2"/>',
    'most-wanted': '<path d="M10 6h44v52H10z"/><path class="incident-ink" d="M17 14h30"/><circle cx="32" cy="31" r="8"/><path d="M20 49q12-13 24 0M17 14h30M24 22l-3-4m19 4 3-4"/>',
    'all-units': '<path d="M26 44V24a6 6 0 0 1 12 0v20M20 44h24l3 10H17zM32 18V10M20 22l-6-5M44 22l6-5M12 32H5m54 0h-7"/><path class="incident-ink" d="M29 30h6v10h-6z"/>',
};

export function incidentArtwork(id: IncidentId | 'dispatch'): string {
    return `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${drawings[id]}</svg>`;
}

import type {IncidentId} from '../shared/incidentCatalog';

// Small ink drawings, deliberately independent of fonts, emoji and image downloads.
const drawings: Record<IncidentId | 'dispatch', string> = {
    dispatch: '<path d="M14 43h37l-3 8H11zM19 40V28a13 13 0 0 1 26 0v12M26 23l-2 9M32 5v6M9 15l7 5M55 15l-7 5"/><path class="incident-ink" d="M30 20h5l-1 14h-3z"/>',
    'improper-disposal': '<path d="m5 41 12-2M4 49l17-6M9 30l10 3M24 32l-3-10 9 3 4-10 5 9 13-2-7 10 10 4-12 6-1 10-10-9-12 2zM29 30l6 6m0-6-6 6M38 28l6 6m0-6-6 6M26 43q-11 17-16 7"/>',
    'bad-ammunition': '<path d="m16 47 6-12-4-9 15-8 6 11 13 2M15 46l9 4 5-9-9-5zM32 13l-3-7m11 8 5-7M12 23l-7-3"/><circle cx="49" cy="18" r="5"/><path d="m44 36 5 1-4 4 5 2-7 9"/>',
    'pressure-surge': '<path d="M13 53h38l-3-9H16zM20 39V23h9v16m6 0V23h9v16M15 17l8-10 9 10m-9-8v12M32 17 41 7l8 10m-8-8v12M5 31l8 3m40-3 7-4"/>',
    'evidence-tampering': '<path d="m17 25 34-5 4 25-35 5zM27 22l-1-8 14-2 1 8M18 32l35-5M30 30l1 6 10-2-1-6M5 31l9-2M7 41l8-2M12 51l4-1M48 9l3-5m5 11 5-2"/>',
    crossfire: '<path d="M50 11v42M7 49l34-22-14-8m14 8-9 13M38 13l3-10 5 10 11-6-3 12 8 4-11 4"/><circle class="incident-ink" cx="17" cy="42" r="6"/>',
    scattershot: '<path d="m9 49 12-5m-8-2 7 2-2 7M26 38l6-8M25 44h11M21 34l1-10"/><circle cx="22" cy="12" r="5"/><circle cx="42" cy="18" r="6"/><circle cx="49" cy="37" r="5"/><circle cx="43" cy="53" r="4"/><circle cx="8" cy="24" r="4"/>',
    'delayed-reaction': '<path d="M48 9v45M6 33h11m-9 7h7M44 10l-6-5M48 6l5-3"/><circle cx="33" cy="34" r="14"/><path d="M33 25v10l-7 3M28 15h9M23 48l-5 5M42 47l3 5"/>',
    'big-cheese': '<path d="M8 49Q3 22 28 12q20-7 28 13L8 49l44 3 4-27M19 34l3-4M28 23l4-2M41 24l4-1M24 46l5 1M41 42l4-1M10 12 6 7m16 0-1-5"/>',
    'planted-evidence': '<path d="m14 30 30-4 3 22-30 4zM23 27l-1-7 12-2 1 7M16 36l30-4M27 37l1 6 9-1-1-6"/><path class="incident-ink" d="M52 14l2-8m4 12 7-3m-8 8 7 4m-11-1 3 8m-9-3 1 9"/><circle cx="52" cy="30" r="4"/>',
    blackout: '<path d="M32 6v7M20 13h24l-4 14H24zM24 27l-6 12h28l-6-12M9 55 55 9"/><path class="incident-ink" d="M30 42h4v9h-4z"/><circle cx="15" cy="17" r="2"/><circle cx="50" cy="43" r="2"/>',
    'clean-bill': '<path d="M14 8h28l8 8v40H14zM42 8v8h8M21 25h22M21 33h22M21 41h12"/><path class="incident-ink" d="m35 45 5 5 10-12"/><path d="M4 30h5m-3-6 4 3m-4 9 4-3"/>',
    malpractice: '<path d="M12 28h40v22H12zM24 28v-6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6M32 33v12m-6-6h12"/><path class="incident-ink" d="M8 14l5 5m43-5-5 5M5 55l6-4m48 4-6-4"/><path d="M20 58l-3 3m27-3 3 3"/>',
    'most-wanted': '<path d="M10 6h44v52H10z"/><path class="incident-ink" d="M17 14h30"/><circle cx="32" cy="31" r="8"/><path d="M20 49q12-13 24 0M17 14h30M24 22l-3-4m19 4 3-4"/>',
    'rat-race': '<path d="M6 45h10M3 36h13M8 27h8M24 44l7-12 9 5 7-10M28 50l-4-6 6-3M47 27l6-5M40 50l5-6-5-7"/><circle class="incident-ink" cx="37" cy="16" r="5"/><path d="M50 12l6-6m-3 9 6-2"/>',
    'all-units': '<path d="M26 44V24a6 6 0 0 1 12 0v20M20 44h24l3 10H17zM32 18V10M20 22l-6-5M44 22l6-5M12 32H5m54 0h-7"/><path class="incident-ink" d="M29 30h6v10h-6z"/>',
};

export function incidentArtwork(id: IncidentId | 'dispatch'): string {
    return `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${drawings[id]}</svg>`;
}

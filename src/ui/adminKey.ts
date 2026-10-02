/** Tyler's admin key lives in this browser's storage only, never in the bundle (docs/live-service.md, "Admin controls").
 * Kept apart from AdminPanel.ts so the title's Settings does not load the match code. */
const KEY = 'rat-detective-admin-key';
/** Settings' OPEN ADMIN PANEL button asks the match's AdminPanel to open through this document event. */
export const ADMIN_OPEN_EVENT = 'rat-admin-open';
export function storedAdminKey(): string | null {
    try { return localStorage.getItem(KEY); } catch { return null; }
}

/** The Settings field where the admin key is pasted once (shown with `?admin=1`, or whenever a key is saved), with a
 * button that opens the admin panel in a match (`openPanel`). */
export function mountAdminKeyField(parent: HTMLElement, doc: Document, signal: AbortSignal, openPanel: () => void): void {
    if (new URLSearchParams(doc.defaultView?.location.search ?? '').get('admin') !== '1' && !storedAdminKey()) return;
    const field = doc.createElement('fieldset'); field.className = 'settings-admin'; parent.appendChild(field);
    const legend = doc.createElement('legend'); legend.textContent = 'ADMIN'; field.appendChild(legend);
    const note = doc.createElement('p'); field.appendChild(note);
    const input = doc.createElement('input'); input.type = 'password'; input.autocomplete = 'off'; input.spellcheck = false;
    input.maxLength = 256; input.setAttribute('aria-label', 'Admin key'); field.appendChild(input);
    const row = doc.createElement('div'); row.className = 'settings-admin-actions'; field.appendChild(row);
    const show = () => { note.textContent = storedAdminKey() ? 'A key is saved on this browser. In a match, F10, ` (backquote) or OPEN ADMIN PANEL opens the admin panel.' : 'Paste the admin key and press Save key (or Enter). It stays on this browser only.'; };
    const action = (label: string, run: () => void) => {
        const button = doc.createElement('button'); button.type = 'button'; button.textContent = label;
        button.addEventListener('click', run, { signal }); row.appendChild(button);
    };
    const save = () => {
        const key = input.value.trim(); if (!key) return;
        try { localStorage.setItem(KEY, key); } catch { /* Private mode: nothing to keep. */ }
        input.value = ''; show();
    };
    action('Save key', save);
    // Enter saves too, and the key is never left unsaved in the field.
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); save(); } }, { signal });
    input.addEventListener('change', save, { signal });
    action('Open admin panel', () => { if (storedAdminKey()) openPanel(); else note.textContent = 'Save a key first.'; });
    action('Forget key', () => { try { localStorage.removeItem(KEY); } catch { /* Nothing stored. */ } show(); });
    show();
}

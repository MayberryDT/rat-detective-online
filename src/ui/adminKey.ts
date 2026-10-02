/** Tyler's admin key lives in this browser's storage only, never in the bundle (docs/live-service.md, "Admin controls").
 * Kept apart from AdminPanel.ts so the title's Settings does not load the match code. */
const KEY = 'rat-detective-admin-key';
export function storedAdminKey(): string | null {
    try { return localStorage.getItem(KEY); } catch { return null; }
}

/** `?admin=1` only: the Settings field where the admin key is pasted once. */
export function mountAdminKeyField(parent: HTMLElement, doc: Document, signal: AbortSignal): void {
    if (new URLSearchParams(doc.defaultView?.location.search ?? '').get('admin') !== '1') return;
    const field = doc.createElement('fieldset'); field.className = 'settings-admin'; parent.appendChild(field);
    const legend = doc.createElement('legend'); legend.textContent = 'ADMIN'; field.appendChild(legend);
    const note = doc.createElement('p'); field.appendChild(note);
    const input = doc.createElement('input'); input.type = 'password'; input.autocomplete = 'off'; input.spellcheck = false;
    input.maxLength = 256; input.setAttribute('aria-label', 'Admin key'); field.appendChild(input);
    const row = doc.createElement('div'); row.className = 'settings-admin-actions'; field.appendChild(row);
    const show = () => { note.textContent = storedAdminKey() ? 'A key is saved on this browser. F10 opens the admin panel in a match.' : 'Paste the admin key. It stays on this browser only.'; };
    const action = (label: string, run: () => void) => {
        const button = doc.createElement('button'); button.type = 'button'; button.textContent = label;
        button.addEventListener('click', run, { signal }); row.appendChild(button);
    };
    action('Save key', () => {
        const key = input.value.trim(); if (!key) return;
        try { localStorage.setItem(KEY, key); } catch { /* Private mode: nothing to keep. */ }
        input.value = ''; show();
    });
    action('Forget key', () => { try { localStorage.removeItem(KEY); } catch { /* Nothing stored. */ } show(); });
    show();
}

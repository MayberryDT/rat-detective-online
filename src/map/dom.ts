/** Small DOM helpers for the map's side panel. */
type Child = Node | string | null | undefined | false;
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: { className?: string; text?: string; title?: string; html?: string } = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.title) node.title = props.title;
  if (props.html !== undefined) node.innerHTML = props.html;
  else if (props.text !== undefined) node.textContent = props.text;
  for (const c of children) if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return node;
}
const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const esc = (s: string): string => s.replace(/[&<>"]/g, c => ENTITIES[c] ?? c);
export const section = (title: string, ...children: Child[]): HTMLElement => el('section', {}, el('h2', { text: title }), ...children);

/** A row of mutually exclusive buttons; `render` re-marks the current one. */
export function choices(options: ReadonlyArray<readonly [string, string]>, current: () => string, pick: (value: string) => void, disabled: (value: string) => boolean = () => false): HTMLElement & { render(): void } {
  const box = Object.assign(el('div', { className: 'choices' }), {
    render() { for (const b of box.querySelectorAll('button')) { b.classList.toggle('on', b.dataset.value === current()); b.disabled = disabled(b.dataset.value ?? ''); } },
  });
  for (const [value, label] of options) {
    const b = el('button', { text: label }); b.type = 'button'; b.dataset.value = value;
    b.addEventListener('click', () => { pick(value); box.render(); });
    box.appendChild(b);
  }
  box.render();
  return box;
}

export function toggle(label: string, checked: boolean, change: (on: boolean) => void, swatch?: string): HTMLLabelElement {
  const input = el('input'); input.type = 'checkbox'; input.checked = checked;
  input.addEventListener('change', () => change(input.checked));
  const s = swatch ? el('span', { className: 'swatch' }) : null;
  if (s && swatch) s.style.background = swatch;
  return el('label', { className: 'toggle' }, input, s, label);
}

export function definitions(rows: ReadonlyArray<readonly [string, string]>): HTMLDListElement {
  return el('dl', {}, ...rows.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]));
}

export const duration = (s: number): string => s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`;
export const pct = (v: number): string => `${Math.round(v * 100)}%`;

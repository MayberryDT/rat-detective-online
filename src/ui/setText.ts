/** Avoid replacing DOM text nodes every animation frame when the label is stable. */
export function setText(element: HTMLElement, text: string): void {
    if (element.textContent !== text) element.textContent = text;
}

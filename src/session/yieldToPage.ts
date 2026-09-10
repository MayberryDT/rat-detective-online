/** Yield city construction so name rolls, paint and taps keep getting turns. */
export async function yieldToPage(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new DOMException('Page closed', 'AbortError');
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    if (signal?.aborted) throw new DOMException('Page closed', 'AbortError');
}

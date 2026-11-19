/**
 * How long a wait runs before the spinner shows: a faster answer shows nothing, so nothing flickers. A plain module
 * (never a "use client" file), so unit tests and browser tests can import it.
 */
export const SPINNER_DELAY_MS = 300;

/**
 * Calls `onShow` once, after `delayMs`, unless the returned cancel runs first. The one timer behind every delayed
 * spinner (`useDelayedFlag`). Returns the cancel function; calling it after `onShow` ran does nothing.
 */
export function scheduleDelayedShow({ delayMs, onShow }: { delayMs: number; onShow: () => void }): () => void {
  const timer = setTimeout(onShow, delayMs);
  return () => clearTimeout(timer);
}

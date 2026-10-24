/**
 * Rules for the top-of-screen progress line (components/route-progress.tsx), kept pure so they can be tested.
 */

/** The next width while a page is on its way: quick at first, slower and slower, never past 90%. */
export function progressStep(width: number): number {
  return Math.min(90, width + (90 - width) * 0.18);
}

type ClickLike = {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
};
type Here = { origin: string; pathname: string };

/**
 * True when a click is a switch to ANOTHER page of this app that the app itself will handle: a plain left click on
 * a link to this site, not opened in a new tab or window, not a download, and to a different path (a link that only
 * changes ?date= or #section stays on the page and is instant).
 */
export function shouldTrackClick(e: ClickLike, here: Here): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  const el = e.target as { closest?: (s: string) => unknown } | null;
  const a = el?.closest?.("a[href]") as { href: string; target?: string; hasAttribute(n: string): boolean } | null;
  if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return false;
  let url: URL;
  try {
    url = new URL(a.href, here.origin);
  } catch {
    return false;
  }
  return url.origin === here.origin && url.pathname !== here.pathname;
}

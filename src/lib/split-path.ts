/**
 * The item a split view's address names (Clients, Invoices): `/dashboard/clients/<id>` gives the id, the list's own
 * address, a deeper one, a broken one or one of the page's fixed sub-pages (`reserved`, e.g. "archived", "new") gives
 * null.
 */
export function splitIdFromPath(pathname: string, base: string, reserved: readonly string[] = []): string | null {
  if (!pathname.startsWith(`${base}/`)) return null;
  const m = /^([^/]+)\/?$/.exec(pathname.slice(base.length + 1));
  if (!m || reserved.includes(m[1])) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

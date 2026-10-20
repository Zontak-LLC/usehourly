/**
 * Local-first sync of time entries (issue #95, spike). Shared by the server's `sync.pull` and the browser's copy.
 *
 * The idea: the server keeps a log of WHICH entries changed (`entry_changes`, filled by database triggers). A device
 * remembers the last log number it saw (its cursor) and asks for what came after. The first time it has no cursor and
 * is sent everything, a page at a time.
 */

/** Entries per page of the first full copy. */
export const SYNC_SNAPSHOT_PAGE = 1_000;
/** Log rows read per pull; a device that is far behind simply pulls again until `more` is false. */
export const SYNC_DELTA_PAGE = 500;
/** D1 allows about 100 bound values in a query, so entry ids are looked up in groups. */
export const SYNC_ID_GROUP = 90;
/** How long the server keeps log rows. */
export const SYNC_LOG_KEEP_DAYS = 30;
/** A device that has not pulled for this long starts again from a full copy (well inside the log's reach). */
export const SYNC_RESYNC_AFTER_DAYS = 14;

/** True when a device last pulled so long ago that the log may no longer cover what it missed. */
export function needsFullResync(lastPullAtMs: number | null, nowMs: number): boolean {
  if (lastPullAtMs === null) return true;
  return nowMs - lastPullAtMs > SYNC_RESYNC_AFTER_DAYS * 24 * 3600 * 1000;
}

/** Splits a list into groups of at most `size`. */
export function inGroups<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Today's "Coming from Toggl, Clockify or Harvest?" note (issue 326). New accounts that switch from another tool miss
 * the import under Account > Your data, so Today points there until the first entry exists or the person says "Not now".
 */

/** "Not now" is remembered in this browser, per account. */
export const importHintKey = (userId: string) => `hourly:importHint:${userId}`;

export const IMPORT_HINT_HREF = "/dashboard/account#data";

/**
 * Shown only while the import is switched on, the account has no entry (`hasEntries` from `entry.hasAny`, and the
 * week Today already holds, so the note goes at once after the first log) and it was not dismissed. Unknown counts as
 * "has entries", so the note never flashes on for an account that has time.
 */
export function showImportHint({
  importOn,
  hasEntries,
  weekHasEntries,
  dismissed,
}: {
  importOn: boolean;
  hasEntries: boolean | undefined;
  weekHasEntries: boolean;
  dismissed: boolean;
}): boolean {
  return importOn && hasEntries === false && !weekHasEntries && !dismissed;
}

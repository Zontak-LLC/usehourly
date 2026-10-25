/**
 * Today's "Coming from Toggl, Clockify or Harvest?" note (issue 326). New accounts that switch from another tool miss
 * the import under Account > Your data, so Today points there until the first entry exists or the person says "Not now".
 */

/** "Not now" is remembered in this browser, per account. */
export const importHintKey = (userId: string) => `hourly:importHint:${userId}`;

export const IMPORT_HINT_HREF = "/dashboard/account#data";

/**
 * Shown only while the import is switched on, the account has no entry (`hasEntries` from `entry.hasAny`, and the
 * week Today already holds, so the note goes at once after the first log) and it was not dismissed. While `hasAny` or
 * the week is still unknown the note stays hidden, so it never flashes on for an account that has time.
 */
export function showImportHint({
  importOn,
  hasEntries,
  weekLoaded,
  weekHasEntries,
  dismissed,
}: {
  importOn: boolean;
  hasEntries: boolean | undefined;
  weekLoaded: boolean;
  weekHasEntries: boolean;
  dismissed: boolean;
}): boolean {
  return importOn && hasEntries === false && weekLoaded && !weekHasEntries && !dismissed;
}

/**
 * The first entry was just logged in the week Today holds, while `entry.hasAny` still says "none": its cached answer
 * becomes true. Only real entries count, never a week still loading, or a new account would lose the note.
 */
export function firstEntryLogged({
  hasEntries,
  weekHasEntries,
}: {
  hasEntries: boolean | undefined;
  weekHasEntries: boolean;
}): boolean {
  return weekHasEntries && hasEntries === false;
}

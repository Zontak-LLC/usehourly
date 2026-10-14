/**
 * A sign-in token carries the account's `token_version` from when it was issued. The account row
 * holds the current number; a mismatch means the password was changed (or the user signed out
 * everywhere) since, so the session is dead. Tokens issued before this existed have no number
 * and count as 0, which matches an account that has never bumped it.
 */
export function sessionStillValid(tokenVersion: number | undefined, current: number | null | undefined): boolean {
  if (current === null || current === undefined) return false; // the account no longer exists
  return (tokenVersion ?? 0) === current;
}

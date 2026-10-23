/** A running timer's minutes, counted into the day and week totals on Today. */

/**
 * Whole minutes a running timer has added so far. A timer left running counts at most a day, as the server banks it when
 * it is stopped. No timer (or a start in the future) adds nothing.
 */
export function runningMinutes(startedAt: string | Date | null | undefined, now: number): number {
  if (!startedAt) return 0;
  const ms = now - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.min(24 * 60, Math.floor(ms / 60_000));
}

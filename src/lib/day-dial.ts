/** The day dial (Today): how full the ring is, and what the middle says about what is left. */
export const DAY_GOAL_MINUTES = 8 * 60;

/** 0 to 1: how much of the goal is logged. A day past the goal stays full (the ring never wraps). */
export function dialFraction(minutes: number, goal: number = DAY_GOAL_MINUTES): number {
  if (!Number.isFinite(minutes) || minutes <= 0 || goal <= 0) return 0;
  return Math.min(1, minutes / goal);
}

/** "2:30 to go", or "goal reached" once the day is at or over the goal. */
export function dialLeft(minutes: number, goal: number = DAY_GOAL_MINUTES): string {
  const left = Math.max(0, goal - Math.max(0, minutes));
  if (left === 0) return "goal reached";
  return `${Math.floor(left / 60)}:${String(Math.round(left % 60)).padStart(2, "0")} to go`;
}

/** The ring is a circle of radius 78 in a 200 box: this is its length, for the dash trick that draws the arc. */
export const DIAL_LENGTH = 2 * Math.PI * 78;

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

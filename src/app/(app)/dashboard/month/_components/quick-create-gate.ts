import type { TypedDuration } from "@/lib/typed-duration";

/** What the several-days panel has filled in when Create is pressed. */
export type QuickCreateForm = {
  /** How many days are selected in the calendar. */
  dayCount: number;
  projectId: string;
  /** The "Hours per day" box, as `readTypedDuration` read it. */
  read: TypedDuration;
};

/**
 * The minutes the several-days panel may create on each day, or `undefined` while Create must stay off: no day
 * picked, no project, an empty box, or text the box cannot log ("25", "0"; the line under the box says why).
 */
export function quickCreateMinutes({ dayCount, projectId, read }: QuickCreateForm): number | undefined {
  if (dayCount === 0 || !projectId) return undefined;
  return read.minutes;
}

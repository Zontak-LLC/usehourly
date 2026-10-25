import { z } from "zod";

/** Local-date helpers. Dates are YYYY-MM-DD strings, never timezone-shifted. */
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date such as 2026-02-28, false for 2026-99-99 or 2026-02-30. */
export function isRealDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** A real YYYY-MM-DD calendar date, for request inputs. */
export const dateSchema = z
  .string()
  .regex(DATE_RE, "Use YYYY-MM-DD")
  .refine((s) => isRealDate(s), "That is not a real date.");

/** Days from `from` to `to`, both included (a single day is 1). */
export function spanDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** The longest span one list or invoice request may cover; wider asks are paged or refused. */
export const MAX_QUERY_DAYS = 366;

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** The one locale dates are written in (issue 71 will make this a choice). */
export const DATE_LOCALE = "en-US";

/** "day" = Oct 25, 2026 · "dayWithWeekday" = Sun, Oct 25 · "full" = October 25, 2026. */
export type DateStyle = "day" | "dayWithWeekday" | "full";

const DATE_STYLES: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  day: { month: "short", day: "numeric", year: "numeric" },
  dayWithWeekday: { weekday: "short", month: "short", day: "numeric" },
  full: { month: "long", day: "numeric", year: "numeric" },
};

/** A YYYY-MM-DD date as text. Built and written in local time, so it never moves a day in any time zone. */
export function formatDate(iso: string, style: DateStyle): string {
  return fromISODate(iso).toLocaleDateString(DATE_LOCALE, DATE_STYLES[style]);
}

/** A moment in time as a date, in `timeZone` (the runtime's own zone when left out). */
export function formatInstant(at: Date | number | string, style: DateStyle, timeZone?: string): string {
  const options = timeZone ? { ...DATE_STYLES[style], timeZone } : DATE_STYLES[style];
  return new Date(at).toLocaleDateString(DATE_LOCALE, options);
}

/** First and last day of the month containing `s` (YYYY-MM-DD), for "this month" figures. */
export function monthBounds(s: string): { from: string; to: string } {
  const d = fromISODate(s);
  return {
    from: toISODate(new Date(d.getFullYear(), d.getMonth(), 1)),
    to: toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
  };
}

export function addDays(s: string, n: number): string {
  const d = fromISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Monday of the week containing `s`. */
export function startOfWeek(s: string): string {
  const d = fromISODate(s);
  const dow = (d.getDay() + 6) % 7; // Mon=0
  return addDays(s, -dow);
}

/** The first of the month as YYYY-MM-DD, shifted by `n` months (negative goes back). */
export function addMonths(first: string, n: number): string {
  const d = fromISODate(first);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

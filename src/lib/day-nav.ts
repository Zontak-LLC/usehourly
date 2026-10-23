import { addDays, fromISODate, startOfWeek } from "@/lib/dates";

/*
 * How Today moves between days (2026-10-23). Week shows the whole week as seven tiles; Today is about ONE day, so it
 * has a date button that opens a month calendar, and a short list of recent weekdays with no time ("missed days").
 */

/** How far back Today looks for weekdays with no time. */
export const MISSED_LOOKBACK_DAYS = 7;
/** At most this many missed days are shown as buttons; the rest are counted. */
export const MISSED_SHOWN = 3;

const isWeekday = (d: string) => {
  const day = fromISODate(d).getDay();
  return day !== 0 && day !== 6;
};

/**
 * The weekdays in the last week (before today) with no time logged, oldest first. Only days AFTER the first day with
 * time in that window count, so a new account, or someone back from a break, is not told off for days before they
 * started. Days marked non-billable are never missed.
 */
export function missedDays(
  entries: readonly { date: string; minutes: number }[],
  today: string,
  nonBillable: ReadonlySet<string> = new Set(),
): string[] {
  const from = addDays(today, -MISSED_LOOKBACK_DAYS);
  const logged = new Set(entries.filter((e) => e.minutes > 0 && e.date >= from && e.date < today).map((e) => e.date));
  const first = [...logged].sort()[0];
  if (!first) return [];
  const out: string[] = [];
  for (let d = addDays(first, 1); d < today; d = addDays(d, 1)) {
    if (isWeekday(d) && !logged.has(d) && !nonBillable.has(d)) out.push(d);
  }
  return out;
}

/** The six-or-fewer Monday-first weeks that show a month: each a list of seven dates (days of other months included). */
export function monthWeeks(anyDayOfMonth: string): string[][] {
  const first = `${anyDayOfMonth.slice(0, 7)}-01`;
  const month = first.slice(0, 7);
  const weeks: string[][] = [];
  // A week belongs to the month while it starts in it (or before it: the first row).
  for (let start = startOfWeek(first); start.slice(0, 7) <= month; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  }
  return weeks;
}

/** Minutes per date. */
export function minutesByDate(entries: readonly { date: string; minutes: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) out.set(e.date, (out.get(e.date) ?? 0) + e.minutes);
  return out;
}

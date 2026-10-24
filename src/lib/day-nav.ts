import { addDays, DATE_RE, fromISODate, startOfWeek } from "@/lib/dates";

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

/** The last weekday before `today` (Friday when today is Saturday, Sunday or Monday). */
export function lastWorkday(today: string): string {
  let d = addDays(today, -1);
  while (!isWeekday(d)) d = addDays(d, -1);
  return d;
}

/**
 * The day the gentle "Nothing logged on Thursday" line on Today points at (issue 99): the last weekday before today,
 * when it is one of the missed days (so it had no time, was not marked non-billable, and came after the person started)
 * and "Not now" was not pressed for it. Null otherwise. Older missed days stay as the quiet "No time:" buttons.
 */
export function nudgeDay(missed: readonly string[], today: string, notNow: ReadonlySet<string>): string | null {
  const d = lastWorkday(today);
  return missed.includes(d) && !notNow.has(d) ? d : null;
}

/** Where "Not now" is remembered: dates only, in this browser. */
export const NOT_NOW_KEY = "hourly:missedNotNow";
/** The same "Not now", for the day card's "entries have no note yet" line: its own list of dates, same rules. */
export const NOTE_NOT_NOW_KEY = "hourly:noteNotNow";
const MAX_NOT_NOW = 30;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** The dates "Not now" was pressed for (empty when none or storage is unreadable). `key` picks which line's list. */
export function loadNotNow(storage: StorageLike | null, key = NOT_NOW_KEY): Set<string> {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(key) ?? "[]");
    return new Set(Array.isArray(raw) ? raw.filter((d): d is string => typeof d === "string" && DATE_RE.test(d)) : []);
  } catch {
    return new Set();
  }
}

/** Remembers "Not now" for a date (the newest few are kept). */
export function saveNotNow(storage: StorageLike | null, date: string, key = NOT_NOW_KEY): Set<string> {
  const next = new Set([...loadNotNow(storage, key), date]);
  try {
    storage?.setItem(key, JSON.stringify([...next].sort().slice(-MAX_NOT_NOW)));
  } catch {
    // storage blocked: the line comes back on the next visit, nothing worse
  }
  return next;
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

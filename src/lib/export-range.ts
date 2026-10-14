import { addDays, fromISODate, startOfWeek, toISODate } from "@/lib/dates";

/**
 * Rules for exporting a custom date range ("March 3 to April 20"). Pure functions, so the
 * rules can be tested without the screen.
 */

/** A year (plus a leap day). Longer than that is almost certainly a typo, and a huge file. */
export const MAX_RANGE_DAYS = 366;

const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const fullDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Days from `from` to `to`, counting both ends. */
export function rangeDays(from: string, to: string): number {
  return Math.round((fromISODate(to).getTime() - fromISODate(from).getTime()) / 86_400_000) + 1;
}

export type RangeCheck = { ok: true; days: number } | { ok: false; message: string };

export function checkRange(from: string, to: string): RangeCheck {
  const valid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && toISODate(fromISODate(s)) === s;
  if (!from || !to) return { ok: false, message: "Choose a start date and an end date." };
  if (!valid(from) || !valid(to)) return { ok: false, message: "One of those dates doesn't look right." };
  if (to < from) return { ok: false, message: "The end date is before the start date." };
  const days = rangeDays(from, to);
  if (days > MAX_RANGE_DAYS) {
    return { ok: false, message: `That's ${days} days. Choose a range of up to a year (${MAX_RANGE_DAYS} days).` };
  }
  return { ok: true, days };
}

/** "Mar 3 – Apr 20, 2026 · 49 days" (the year is shown on both ends when the range crosses years). */
export function describeRange(from: string, to: string): string {
  const days = rangeDays(from, to);
  const a = fromISODate(from);
  const b = fromISODate(to);
  const sameYear = a.getFullYear() === b.getFullYear();
  const label = sameYear
    ? `${shortDate.format(a)} – ${fullDate.format(b)}`
    : `${fullDate.format(a)} – ${fullDate.format(b)}`;
  return `${label} · ${days} ${days === 1 ? "day" : "days"}`;
}

export type PresetKey = "this-month" | "last-month" | "this-quarter" | "last-30" | "year-to-date" | "last-year";

export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "this-quarter", label: "This quarter" },
  { key: "last-30", label: "Last 30 days" },
  { key: "year-to-date", label: "Year to date" },
  { key: "last-year", label: "Last year" },
];

const lastOfMonth = (year: number, monthIndex: number) => toISODate(new Date(year, monthIndex + 1, 0));
const firstOf = (year: number, monthIndex: number) => toISODate(new Date(year, monthIndex, 1));

/** The from/to a quick-pick means, given today's date (YYYY-MM-DD, from the browser's clock). */
export function presetRange(key: PresetKey, today: string): { from: string; to: string } {
  const t = fromISODate(today);
  const y = t.getFullYear();
  const m = t.getMonth();
  switch (key) {
    case "this-month":
      return { from: firstOf(y, m), to: lastOfMonth(y, m) };
    case "last-month":
      return { from: firstOf(y, m - 1), to: lastOfMonth(y, m - 1) };
    case "this-quarter": {
      const q = Math.floor(m / 3) * 3;
      return { from: firstOf(y, q), to: lastOfMonth(y, q + 2) };
    }
    case "last-30":
      return { from: addDays(today, -29), to: today };
    case "year-to-date":
      return { from: `${y}-01-01`, to: today };
    case "last-year":
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  }
}

/** File name that says what it covers, e.g. hourly-2026-03-03_to_2026-04-20.xlsx. */
export function rangeFilename(from: string, to: string, projectName?: string): string {
  const slug = projectName
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `hourly-${from}_to_${to}${slug ? `-${slug}` : ""}.xlsx`;
}

/**
 * How the timesheet grid's columns are laid out for a range. One column per worked day reads
 * well for a few weeks; past about two months it gets too wide, so the grid switches to one
 * column per week.
 */
export const WEEKLY_AFTER_WORKED_DAYS = 62;

export function weekStart(date: string): string {
  return startOfWeek(date);
}

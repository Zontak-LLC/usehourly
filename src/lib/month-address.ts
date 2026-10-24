import { isRealDate } from "@/lib/dates";

/** What the Month page's right side shows: one day, or the whole month's list. */
export type MonthMode = "day" | "month";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Reads the Month page's address: `?month=YYYY-MM&date=YYYY-MM-DD&view=day|month`. A real `date` decides the month (so
 * a day link always opens its own month); otherwise `month`, otherwise today's month. Anything malformed is ignored.
 */
export function readMonthAddress(
  params: { get(name: string): string | null },
  today: string,
): { first: string; date: string | null; mode: MonthMode } {
  const rawDate = params.get("date");
  const date = rawDate && isRealDate(rawDate) ? rawDate : null;
  const rawMonth = params.get("month");
  const month = rawMonth && MONTH_RE.test(rawMonth) ? rawMonth : null;
  const first = `${(date ?? month ?? today).slice(0, 7)}-01`;
  return { first, date, mode: params.get("view") === "month" ? "month" : "day" };
}

/** The day Month opens on when the address names none: today in this month, else the last day with time, else the 1st. */
export function defaultMonthDay(first: string, last: string, today: string, daysWithTime: Iterable<string>): string {
  if (today >= first && today <= last) return today;
  let latest: string | null = null;
  for (const d of daysWithTime) if (d >= first && d <= last && (!latest || d > latest)) latest = d;
  return latest ?? first;
}

import { addDays, monthBounds, startOfWeek } from "@/lib/dates";

/**
 * The date ranges Week and Month ask for when they open on today (week-view.tsx, month-view.tsx). The pre-cache
 * (components/warm-pages.tsx) must use exactly these, or the pages would not find the answers in the cache.
 */
export function warmRanges(today: string): { week: { from: string; to: string }; month: { from: string; to: string } } {
  const from = startOfWeek(today);
  return { week: { from, to: addDays(from, 6) }, month: monthBounds(today) };
}

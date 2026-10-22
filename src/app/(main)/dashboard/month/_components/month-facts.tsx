import { fromISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });

/**
 * What the month came to, as one plain line under the calendar: days worked, the busiest day and the average on a
 * worked day. (These were three cards with a histogram, a bar and a dot grid; the calendar already shows them.)
 */
export function MonthFacts({ dayTotals }: { dayTotals: Record<string, number> }) {
  const worked = Object.entries(dayTotals).filter(([, m]) => m > 0);
  if (worked.length === 0) return null;
  const total = worked.reduce((a, [, m]) => a + m, 0);
  const [busyDate, busyMinutes] = worked.reduce((best, cur) => (cur[1] > best[1] ? cur : best));
  return (
    <p className="text-foreground/75 text-sm">
      <strong className="text-foreground">{worked.length}</strong> day{worked.length === 1 ? "" : "s"} worked · busiest{" "}
      <strong className="text-foreground">{dayFmt.format(fromISODate(busyDate))}</strong> ({formatDuration(busyMinutes)}
      ) · average <strong className="text-foreground">{formatDuration(Math.round(total / worked.length))}</strong> on a
      worked day
    </p>
  );
}
